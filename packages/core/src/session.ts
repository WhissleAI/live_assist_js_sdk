import type {
  TranscriptEntry, AgendaItem, BehavioralProfile,
  StreamTranscriptSegment, LiveAssistDone, SessionReport, AttachedDoc,
} from "./types";
import type { LiveAssistConfig } from "./config";
import { resolveDeviceId } from "./config";
import { AsrStreamClient } from "./asr";
import { createBehavioralProfileManager, type Channel } from "./behavioralProfile";
import { streamLiveAssistWithFeedback } from "./liveAssistStream";
import { SharedMicManager } from "./capture/sharedMic";
import { MicCapture } from "./capture/micCapture";
import { TabCapture } from "./capture/tabCapture";
import { AudioRecorder } from "./audioRecorder";
import { saveSession } from "./sessionStore";

type EventMap = {
  transcript: TranscriptEntry[];
  profile: { user: BehavioralProfile; other: BehavioralProfile };
  feedback: { summary: string; suggestions: string[] };
  action: { items: LiveAssistDone["actionItems"] };
  memory: { items: Array<{ id: string; title: string; content?: string }> };
  agenda: AgendaItem[];
  status: { engagementScore?: number; sentimentTrend?: string; keywords?: string[] };
  error: Error;
};

type Listener<K extends keyof EventMap> = (data: EventMap[K]) => void;

const FEEDBACK_INTERVAL_MS = 5_000;

function deriveEmotion(seg: StreamTranscriptSegment): { emotion: string | null; confidence?: number } {
  const probs = seg.metadata_probs?.emotion;
  if (probs?.length) {
    const top = probs.reduce((a, b) => (a.probability > b.probability ? a : b));
    return {
      emotion: top?.token?.toUpperCase().replace(/^EMOTION_/, "") ?? null,
      confidence: top?.probability,
    };
  }
  return { emotion: seg.metadata?.emotion?.toUpperCase().replace(/^EMOTION_/, "") ?? null };
}

export class LiveAssistSession {
  private config: LiveAssistConfig;
  private deviceId: string;
  private listeners = new Map<string, Set<Listener<any>>>();
  private profileManager = createBehavioralProfileManager();
  private transcriptEntries: TranscriptEntry[] = [];
  private micAsr: AsrStreamClient | null = null;
  private tabAsr: AsrStreamClient | null = null;
  private sharedMic: SharedMicManager | null = null;
  private micCapture: MicCapture | null = null;
  private tabCapture: TabCapture | null = null;
  private feedbackTimer: ReturnType<typeof setInterval> | null = null;
  private feedbackAbort: AbortController | null = null;
  private _running = false;
  private agenda: AgendaItem[] = [];
  private documents: AttachedDoc[] = [];
  private _instructions = "";
  private _agentId: string | undefined;
  private _mode = "meeting";
  private lastDone: LiveAssistDone | null = null;
  private segIdCounterMic = 0;
  private segIdCounterTab = 0;
  private entryIdCounter = 0;
  private sessionId: string | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private userKeywordSet = new Set<string>();
  private otherKeywordSet = new Set<string>();
  private feedbackSegRange = { from: 0, to: 0 };
  private prevAgendaConf: Record<string, number> = {};

  constructor(config: LiveAssistConfig) {
    this.config = config;
    this.deviceId = resolveDeviceId(config);
  }

  on<K extends keyof EventMap>(event: K, cb: Listener<K>): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return this;
  }

  off<K extends keyof EventMap>(event: K, cb: Listener<K>): this {
    this.listeners.get(event)?.delete(cb);
    return this;
  }

  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    this.listeners.get(event)?.forEach((cb) => {
      try { (cb as Listener<K>)(data); } catch (e) {
        console.warn(`[LiveAssist] listener error on "${String(event)}":`, e);
      }
    });
  }

  get isRunning() { return this._running; }
  get transcript() { return [...this.transcriptEntries]; }
  get profiles() { return this.profileManager.getProfiles(); }

  async start(options?: { includeTab?: boolean; agenda?: AgendaItem[]; documents?: AttachedDoc[]; instructions?: string; agentId?: string; mode?: string; recordAudio?: boolean }): Promise<void> {
    if (this._running) return;
    this._running = true;
    this.agenda = options?.agenda ?? [];
    this.documents = options?.documents ?? [];
    this._instructions = options?.instructions ?? "";
    this._agentId = options?.agentId ?? this.config.agentId;
    this._mode = options?.mode ?? "meeting";
    this.transcriptEntries = [];
    this.segIdCounterMic = 0;
    this.segIdCounterTab = 0;
    this.entryIdCounter = 0;
    this.profileManager.reset();
    this.lastDone = null;
    this.sessionId = null;
    this.userKeywordSet.clear();
    this.otherKeywordSet.clear();
    this.audioRecorder = options?.recordAudio ? new AudioRecorder() : null;

    const workletUrl = this.config.audioWorkletUrl ?? "/audio-capture-processor.js";
    console.log("[LiveAssist] Session starting, connecting to ASR:", this.config.asrUrl);

    this.micAsr = new AsrStreamClient(this.config.asrUrl, { metadataProb: true });
    this.micAsr.onTranscript = (seg) => this.handleSegment(seg, "mic");
    this.micAsr.onError = (err) => this.emit("error", err);
    await this.micAsr.connect();

    this.sharedMic = new SharedMicManager(workletUrl);
    this.micCapture = new MicCapture(this.sharedMic, (pcm) => {
      this.micAsr?.sendPcm(pcm);
      this.audioRecorder?.addPcm(pcm);
    });
    const micErr = await this.micCapture.start();
    if (micErr) this.emit("error", new Error(micErr));

    if (options?.includeTab) {
      this.tabAsr = new AsrStreamClient(this.config.asrUrl, { metadataProb: true });
      this.tabAsr.onTranscript = (seg) => this.handleSegment(seg, "tab");
      this.tabAsr.onError = (err) => this.emit("error", err);
      await this.tabAsr.connect();
      this.tabCapture = new TabCapture((pcm) => this.tabAsr?.sendPcm(pcm), workletUrl);
      this.tabCapture.onStopped = () => {
        console.warn("[LiveAssist] Tab sharing ended by user");
        this.tabAsr?.end().catch(() => []);
        this.tabCapture = null;
      };
      const tabErr = await this.tabCapture.start();
      if (tabErr && tabErr !== "cancelled") this.emit("error", new Error(tabErr));
    }

    if (this.config.agentUrl) {
      try {
        const res = await fetch(`${this.config.agentUrl.replace(/\/$/, "")}/live-assist/session/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: this.deviceId, title: "", mode: "meeting" }),
        });
        if (res.ok) {
          const data = (await res.json()) as { session_id?: string };
          this.sessionId = data.session_id ?? null;
        }
      } catch (e) {
        console.warn("[LiveAssist] session/start failed:", e);
      }
    }

    this.feedbackTimer = setInterval(() => this.runFeedback(), FEEDBACK_INTERVAL_MS);
  }

  async stop(): Promise<SessionReport> {
    this._running = false;
    if (this.feedbackTimer) { clearInterval(this.feedbackTimer); this.feedbackTimer = null; }
    this.feedbackAbort?.abort();
    this.micCapture?.stop();
    this.tabCapture?.stop();
    await this.micAsr?.end().catch(() => []);
    await this.tabAsr?.end().catch(() => []);
    this.micAsr?.close();
    this.tabAsr?.close();
    this.sharedMic?.destroy();

    const { user, other } = this.profileManager.getProfiles();
    const report: SessionReport = {
      feedbackSummary: this.lastDone?.feedbackSummary ?? "",
      suggestions: this.lastDone?.suggestions ?? [],
      actionItems: this.lastDone?.actionItems ?? [],
      knowledgeItems: this.lastDone?.knowledgeItems ?? [],
      userProfile: user,
      otherProfile: other,
      keywords: this.lastDone?.keywords ?? [],
      userKeywords: [...this.userKeywordSet],
      otherKeywords: [...this.otherKeywordSet],
      engagementScore: this.lastDone?.engagementScore,
      sentimentTrend: this.lastDone?.sentimentTrend,
    };

    const timestamp = Date.now();
    const id = this.sessionId ?? `session_${timestamp}_${Math.random().toString(36).slice(2, 10)}`;
    const transcript = this.transcriptEntries.map((e) => ({
      channel: e.channel,
      text: e.text,
      is_final: e.is_final,
      audioOffset: e.audioOffset,
      metadata: e.metadata,
    }));
    const stored: import("./sessionStore").StoredSession = {
      id,
      timestamp,
      report,
      transcript,
      agendaItems: this.agenda.length > 0 ? this.agenda.map((a) => ({ id: a.id, title: a.title, status: a.status, confidence: a.confidence })) : undefined,
    };
    if (this.audioRecorder) stored.audioBlob = this.audioRecorder.getBlob();
    saveSession(stored);

    if (this.config.agentUrl && this.sessionId) {
      try {
        await fetch(`${this.config.agentUrl.replace(/\/$/, "")}/live-assist/session/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: this.sessionId,
            feedback_snapshot: { ...report, transcript, agendaItems: this.agenda },
          }),
        });
      } catch (e) {
        console.warn("[LiveAssist] session/end failed:", e);
      }
    }

    return report;
  }

  private handleSegment(seg: StreamTranscriptSegment, source: "mic" | "tab") {
    const text = (seg.text || "").trim();
    if (!text || text === ".") return;

    const isFinal = seg.is_final !== false;
    const segId = isFinal
      ? (source === "mic" ? ++this.segIdCounterMic : ++this.segIdCounterTab)
      : (source === "mic" ? this.segIdCounterMic : this.segIdCounterTab);

    const prev = this.transcriptEntries;
    let replacedIdx = -1;

    const matchId = isFinal ? segId - 1 : segId;

    // Pass 1: replace a non-promoted interim
    for (let i = prev.length - 1; i >= 0; i--) {
      const p = prev[i];
      if (p.channel !== source || p.is_final !== false || p._promoted) continue;
      if (p._segId != null && p._segId !== matchId) continue;
      replacedIdx = i;
      break;
    }

    // Pass 2 (finals only): replace a promoted interim to avoid duplicates
    if (replacedIdx < 0 && isFinal) {
      for (let i = prev.length - 1; i >= 0; i--) {
        const p = prev[i];
        if (p.channel !== source || p.is_final !== false || !p._promoted) continue;
        if (p._segId != null && p._segId !== matchId) continue;
        replacedIdx = i;
        break;
      }

      // Pass 3: text-overlap dedup — ≥60% word overlap → replace
      if (replacedIdx < 0) {
        const newWords = text.toLowerCase().split(/\s+/);
        if (newWords.length >= 2) {
          for (let i = prev.length - 1; i >= 0; i--) {
            const p = prev[i];
            if (p.channel !== source) continue;
            const pWords = (p.text || "").toLowerCase().split(/\s+/);
            if (pWords.length < 2) continue;
            const pSet = new Set(pWords);
            const overlap = newWords.filter((w) => pSet.has(w)).length;
            const ratio = overlap / Math.max(newWords.length, pWords.length);
            if (ratio >= 0.6) { replacedIdx = i; }
            break;
          }
        }
      }
    }

    const keepId = replacedIdx >= 0 ? prev[replacedIdx]._id : undefined;
    const { emotion, confidence: emotionConfidence } = deriveEmotion(seg);

    let emotionTimeline: Array<{ offset: number; emotion: string; confidence: number; probs?: { emotion: string; probability: number }[] }> | undefined;
    if (seg.metadata_probs_timeline?.length) {
      emotionTimeline = seg.metadata_probs_timeline.map((t) => {
        const sorted = (t.emotion ?? [])
          .map((e) => ({ emotion: String(e.token ?? "").toUpperCase().replace(/^EMOTION_/, ""), probability: e.probability ?? 0 }))
          .sort((a, b) => b.probability - a.probability);
        const top = sorted[0];
        let picked = top;
        if (top && top.emotion === "NEUTRAL" && sorted.length > 1) {
          const runner = sorted.find((e) => e.emotion !== "NEUTRAL");
          if (runner && runner.probability > 0.15) picked = runner;
        }
        return {
          offset: t.offset ?? 0,
          emotion: picked?.emotion || "NEUTRAL",
          confidence: picked?.probability ?? 0,
          probs: sorted.slice(0, 4),
        };
      });
    }

    const intent = seg.metadata?.intent
      ? String(seg.metadata.intent).toUpperCase().replace(/^INTENT_/, "")
      : undefined;
    const gender = seg.metadata?.gender || undefined;
    const age = seg.metadata?.age || undefined;
    const entities = seg.entities?.length ? seg.entities : undefined;

    if (isFinal && entities?.length) {
      const bag = source === "mic" ? this.userKeywordSet : this.otherKeywordSet;
      for (const ent of entities) {
        const kw = (ent.text || "").trim().toLowerCase();
        if (kw && kw.length > 1) bag.add(kw);
      }
    }

    const hasMetadata = emotion || intent || emotionTimeline || gender || age || entities;
    const entry: TranscriptEntry = {
      channel: source,
      text,
      audioOffset: seg.audioOffset,
      metadata: hasMetadata
        ? { emotion: emotion ?? undefined, emotionConfidence, intent, gender, age, emotionTimeline, entities }
        : undefined,
      is_final: isFinal,
      _ts: isFinal ? undefined : Date.now(),
      _segId: segId,
      _id: keepId ?? ++this.entryIdCounter,
    };

    let updated: TranscriptEntry[];
    if (replacedIdx >= 0) {
      updated = [...prev.slice(0, replacedIdx), entry, ...prev.slice(replacedIdx + 1)];
    } else {
      updated = [...prev, entry];
    }

    this.transcriptEntries = updated;
    this.emit("transcript", updated);

    const channel: Channel = source === "mic" ? "microphone" : "system";
    if (seg.metadata_probs) {
      const emotion = seg.metadata_probs.emotion ?? [];
      const intent = seg.metadata_probs.intent ?? [];
      this.profileManager.update(channel, emotion, intent);
      this.emit("profile", this.profileManager.getProfiles());
    }
  }

  private mergeAgendaUpdate(update: Array<{ id?: string; status?: string; confidence?: number; sentiment?: string; evidence?: string }>): void {
    if (!update?.length || this.agenda.length === 0) return;
    const statusRank: Record<string, number> = { pending: 0, in_progress: 1, completed: 2, skipped: 1 };
    const increasedItems: { itemId: string; itemTitle: string; confidenceDelta: number }[] = [];

    this.agenda = this.agenda.map((a, i) => {
      const u = update.find((x) => x.id === a.id) ?? update[i];
      if (!u) return a;
      const curConf = a.confidence ?? 0;
      const newConf = u.confidence ?? 0;
      const bestConf = Math.max(curConf, newConf);
      const curRank = statusRank[a.status ?? "pending"] ?? 0;
      const newRank = statusRank[u.status ?? "pending"] ?? 0;
      const bestStatus = newRank >= curRank ? (u.status ?? a.status) : a.status;
      const validStatus = ["pending", "in_progress", "completed", "skipped"].includes(bestStatus ?? "") ? bestStatus : a.status;
      const sentiment = ["positive", "neutral", "negative", "mixed", ""].includes(u.sentiment ?? "") ? u.sentiment : a.sentiment;

      const oldConf = this.prevAgendaConf[a.id] ?? 0;
      if (bestConf > oldConf + 2) {
        increasedItems.push({ itemId: a.id, itemTitle: a.title, confidenceDelta: bestConf - oldConf });
      }
      this.prevAgendaConf[a.id] = bestConf;

      return {
        ...a,
        status: validStatus as AgendaItem["status"],
        confidence: bestConf,
        sentiment: (sentiment ?? a.sentiment) as AgendaItem["sentiment"],
        evidence: u.evidence ?? a.evidence,
      };
    });

    if (increasedItems.length > 0) {
      const range = this.feedbackSegRange;
      let changed = false;
      this.transcriptEntries = this.transcriptEntries.map((entry, idx) => {
        if (idx < range.from || idx >= range.to) return entry;
        if (entry.is_final === false && !entry._promoted) return entry;
        if (entry.channel === "assistant") return entry;
        const existing = entry.agendaHighlights ?? [];
        const merged = [...existing];
        for (const h of increasedItems) {
          if (!merged.some((m) => m.itemId === h.itemId)) merged.push(h);
        }
        changed = true;
        return { ...entry, agendaHighlights: merged };
      });
      if (changed) this.emit("transcript", this.transcriptEntries);
    }

    this.emit("agenda", this.agenda);
  }

  private async runFeedback() {
    if (!this._running || this.transcriptEntries.length === 0) return;
    if (!this.config.agentUrl) return;
    this.feedbackAbort?.abort();
    this.feedbackAbort = new AbortController();
    const signal = this.feedbackAbort.signal;

    const prevTo = this.feedbackSegRange.to;
    this.feedbackSegRange = { from: prevTo, to: this.transcriptEntries.length };

    const now = Date.now();
    const transcriptText = this.transcriptEntries
      .filter((e) => {
        if (e.is_final !== false || e._promoted) return true;
        if (e._ts != null && now - e._ts > 4000) return true; // stale interim, include for feedback
        return false;
      })
      .map((e) => `[${e.channel === "mic" ? "You" : "Other"}] ${e.text}`)
      .join("\n");

    if (!transcriptText.trim()) return;

    console.log("[LiveAssist] Sending feedback request, transcript length:", transcriptText.length, "agenda items:", this.agenda.length);
    const { user, other } = this.profileManager.getProfiles();
    const intentSignals =
      Object.keys(user.intentProfile).length > 0 || Object.keys(other.intentProfile).length > 0
        ? { user: user.intentProfile, other: other.intentProfile }
        : undefined;

    await streamLiveAssistWithFeedback({
      agentUrl: this.config.agentUrl,
      transcript: transcriptText,
      userId: this.deviceId,
      mode: this._mode,
      agentId: this._agentId,
      custom_prompt: this._instructions.trim() || undefined,
      agenda_items: this.agenda.length > 0 ? this.agenda.map((a) => ({ id: a.id, title: a.title, status: a.status, confidence: a.confidence })) : undefined,
      emotion_profile: user.emotionProfile,
      intent_signals: intentSignals,
      documents_payload: this.documents.filter((d) => d.useForContext !== false).map((d) => ({ id: d.id, name: d.name, content: d.content })),
      callbacks: {
        onFeedbackChunk: (chunk) => this.emit("feedback", { summary: chunk, suggestions: [] }),
        onFeedback: (fb) => this.emit("feedback", fb),
        onStatus: (s) => {
          this.emit("status", s);
          if (s.agendaStatus?.length && this.agenda.length > 0) {
            this.agenda = this.agenda.map((a, i) => {
              const byId = s.agendaStatus?.find((u) => u.id === a.id);
              const byIndex = s.agendaStatus?.[i];
              const update = byId ?? (byIndex && i < (s.agendaStatus?.length ?? 0) ? byIndex : null);
              return update ? { ...a, ...update } : a;
            });
            console.log("[LiveAssist] Agenda updated (status):", this.agenda);
            this.emit("agenda", this.agenda);
          }
        },
        onMemory: (m) => this.emit("memory", m),
        onAction: (a) => this.emit("action", a),
        onDone: (d) => {
          this.lastDone = d;
          if (d.agendaStatus?.length) this.mergeAgendaUpdate(d.agendaStatus);
        },
        onError: (err) => this.emit("error", err),
      },
      signal,
    }).catch((err) => {
      if (err?.name !== "AbortError") this.emit("error", err instanceof Error ? err : new Error(String(err)));
    });
  }
}

export function createLiveAssistSession(config: LiveAssistConfig): LiveAssistSession {
  return new LiveAssistSession(config);
}
