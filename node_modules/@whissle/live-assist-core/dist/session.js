import { resolveDeviceId } from "./config";
import { AsrStreamClient } from "./asr";
import { createBehavioralProfileManager } from "./behavioralProfile";
import { streamLiveAssistWithFeedback } from "./liveAssistStream";
import { SharedMicManager } from "./capture/sharedMic";
import { MicCapture } from "./capture/micCapture";
import { TabCapture } from "./capture/tabCapture";
import { AudioRecorder } from "./audioRecorder";
import { saveSession } from "./sessionStore";
const FEEDBACK_INTERVAL_MS = 5000;
export class LiveAssistSession {
    constructor(config) {
        this.listeners = new Map();
        this.profileManager = createBehavioralProfileManager();
        this.transcriptEntries = [];
        this.micAsr = null;
        this.tabAsr = null;
        this.sharedMic = null;
        this.micCapture = null;
        this.tabCapture = null;
        this.feedbackTimer = null;
        this.feedbackAbort = null;
        this._running = false;
        this.agenda = [];
        this.documents = [];
        this._instructions = "";
        this.lastDone = null;
        this.segIdCounterMic = 0;
        this.segIdCounterTab = 0;
        this.entryIdCounter = 0;
        this.sessionId = null;
        this.audioRecorder = null;
        this.config = config;
        this.deviceId = resolveDeviceId(config);
    }
    on(event, cb) {
        if (!this.listeners.has(event))
            this.listeners.set(event, new Set());
        this.listeners.get(event).add(cb);
        return this;
    }
    off(event, cb) {
        this.listeners.get(event)?.delete(cb);
        return this;
    }
    emit(event, data) {
        this.listeners.get(event)?.forEach((cb) => { try {
            cb(data);
        }
        catch { } });
    }
    get isRunning() { return this._running; }
    get transcript() { return [...this.transcriptEntries]; }
    get profiles() { return this.profileManager.getProfiles(); }
    async start(options) {
        if (this._running)
            return;
        this._running = true;
        this.agenda = options?.agenda ?? [];
        this.documents = options?.documents ?? [];
        this._instructions = options?.instructions ?? "";
        this.transcriptEntries = [];
        this.segIdCounterMic = 0;
        this.segIdCounterTab = 0;
        this.entryIdCounter = 0;
        this.profileManager.reset();
        this.lastDone = null;
        this.sessionId = null;
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
        if (micErr)
            this.emit("error", new Error(micErr));
        if (options?.includeTab) {
            this.tabAsr = new AsrStreamClient(this.config.asrUrl, { metadataProb: true });
            this.tabAsr.onTranscript = (seg) => this.handleSegment(seg, "tab");
            this.tabAsr.onError = (err) => this.emit("error", err);
            await this.tabAsr.connect();
            this.tabCapture = new TabCapture((pcm) => this.tabAsr?.sendPcm(pcm), workletUrl);
            const tabErr = await this.tabCapture.start();
            if (tabErr && tabErr !== "cancelled")
                this.emit("error", new Error(tabErr));
        }
        if (this.config.agentUrl) {
            try {
                const res = await fetch(`${this.config.agentUrl.replace(/\/$/, "")}/live-assist/session/start`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ device_id: this.deviceId, title: "", mode: "meeting" }),
                });
                if (res.ok) {
                    const data = (await res.json());
                    this.sessionId = data.session_id ?? null;
                }
            }
            catch { }
        }
        this.feedbackTimer = setInterval(() => this.runFeedback(), FEEDBACK_INTERVAL_MS);
    }
    async stop() {
        this._running = false;
        if (this.feedbackTimer) {
            clearInterval(this.feedbackTimer);
            this.feedbackTimer = null;
        }
        this.feedbackAbort?.abort();
        this.micCapture?.stop();
        this.tabCapture?.stop();
        await this.micAsr?.end().catch(() => []);
        await this.tabAsr?.end().catch(() => []);
        this.micAsr?.close();
        this.tabAsr?.close();
        this.sharedMic?.destroy();
        const { user, other } = this.profileManager.getProfiles();
        const report = {
            feedbackSummary: this.lastDone?.feedbackSummary ?? "",
            suggestions: this.lastDone?.suggestions ?? [],
            actionItems: this.lastDone?.actionItems ?? [],
            knowledgeItems: this.lastDone?.knowledgeItems ?? [],
            userProfile: user,
            otherProfile: other,
            keywords: this.lastDone?.keywords ?? [],
            engagementScore: this.lastDone?.engagementScore,
            sentimentTrend: this.lastDone?.sentimentTrend,
        };
        const timestamp = Date.now();
        const id = this.sessionId ?? `session_${timestamp}_${Math.random().toString(36).slice(2, 10)}`;
        const transcript = this.transcriptEntries.map((e) => ({ channel: e.channel, text: e.text, is_final: e.is_final }));
        const stored = {
            id,
            timestamp,
            report,
            transcript,
            agendaItems: this.agenda.length > 0 ? this.agenda.map((a) => ({ id: a.id, title: a.title, status: a.status, confidence: a.confidence })) : undefined,
        };
        if (this.audioRecorder)
            stored.audioBlob = this.audioRecorder.getBlob();
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
            }
            catch { }
        }
        return report;
    }
    handleSegment(seg, source) {
        const text = (seg.text || "").trim();
        if (!text || text === ".")
            return;
        const isFinal = seg.is_final !== false;
        const isUtteranceEnd = isFinal && seg.utterance_end !== false;
        const counter = source === "mic" ? this.segIdCounterMic : this.segIdCounterTab;
        const segId = isUtteranceEnd ? (source === "mic" ? ++this.segIdCounterMic : ++this.segIdCounterTab) : counter;
        const prev = this.transcriptEntries;
        let updated;
        let replacedIdx = -1;
        const STALE_PARTIAL_MS = 8000; // Don't replace partials older than this (new utterance after silence)
        if (!isFinal) {
            // Replace last interim with same segId AND same channel; skip if that interim is stale
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].channel === source && prev[i]._segId === segId && prev[i].is_final === false) {
                    const age = prev[i]._ts != null ? Date.now() - prev[i]._ts : 0;
                    if (age < STALE_PARTIAL_MS)
                        replacedIdx = i;
                    break;
                }
            }
            if (replacedIdx < 0) {
                for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].channel === source && prev[i].is_final === false) {
                        const age = prev[i]._ts != null ? Date.now() - prev[i]._ts : 0;
                        if (age < STALE_PARTIAL_MS)
                            replacedIdx = i;
                        break;
                    }
                }
            }
        }
        else {
            // Final: replace interim if exists (same channel + segId)
            for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].channel === source && prev[i]._segId === segId && prev[i].is_final === false) {
                    replacedIdx = i;
                    break;
                }
            }
            if (replacedIdx < 0) {
                for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].channel === source && prev[i].is_final === false) {
                        replacedIdx = i;
                        break;
                    }
                }
            }
        }
        const keepId = replacedIdx >= 0 ? prev[replacedIdx]._id : undefined;
        const entry = {
            channel: source,
            text,
            audioOffset: seg.audioOffset,
            is_final: isFinal,
            _ts: isFinal ? undefined : Date.now(),
            _segId: segId,
            _id: keepId ?? ++this.entryIdCounter,
        };
        if (replacedIdx >= 0) {
            if (!isFinal) {
                updated = [...prev.slice(0, replacedIdx), entry, ...prev.slice(replacedIdx + 1)];
            }
            else {
                const interim = prev[replacedIdx];
                let finalText = entry.text;
                if (!seg.utterance_end && interim.text.length > entry.text.length) {
                    const tail = interim.text.slice(entry.text.length).trim();
                    if (tail)
                        finalText = `${entry.text} ${tail}`;
                }
                updated = [...prev.slice(0, replacedIdx), { ...entry, text: finalText }, ...prev.slice(replacedIdx + 1)];
            }
        }
        else {
            updated = [...prev, entry];
        }
        this.transcriptEntries = updated;
        this.emit("transcript", updated);
        const channel = source === "mic" ? "microphone" : "system";
        if (seg.metadata_probs) {
            const emotion = seg.metadata_probs.emotion ?? [];
            const intent = seg.metadata_probs.intent ?? [];
            this.profileManager.update(channel, emotion, intent);
            this.emit("profile", this.profileManager.getProfiles());
        }
    }
    mergeAgendaUpdate(update) {
        if (!update?.length || this.agenda.length === 0)
            return;
        const statusRank = { pending: 0, in_progress: 1, completed: 2, skipped: 1 };
        this.agenda = this.agenda.map((a, i) => {
            const u = update.find((x) => x.id === a.id) ?? update[i];
            if (!u)
                return a;
            const curConf = a.confidence ?? 0;
            const newConf = u.confidence ?? 0;
            const bestConf = Math.max(curConf, newConf);
            const curRank = statusRank[a.status ?? "pending"] ?? 0;
            const newRank = statusRank[u.status ?? "pending"] ?? 0;
            const bestStatus = newRank >= curRank ? (u.status ?? a.status) : a.status;
            const validStatus = ["pending", "in_progress", "completed", "skipped"].includes(bestStatus ?? "") ? bestStatus : a.status;
            const sentiment = ["positive", "neutral", "negative", "mixed", ""].includes(u.sentiment ?? "") ? u.sentiment : a.sentiment;
            return {
                ...a,
                status: validStatus,
                confidence: bestConf,
                sentiment: (sentiment ?? a.sentiment),
                evidence: u.evidence ?? a.evidence,
            };
        });
        this.emit("agenda", this.agenda);
    }
    async runFeedback() {
        if (!this._running || this.transcriptEntries.length === 0)
            return;
        this.feedbackAbort = new AbortController();
        const signal = this.feedbackAbort.signal;
        const now = Date.now();
        const transcriptText = this.transcriptEntries
            .filter((e) => {
            if (e.is_final !== false || e._promoted)
                return true;
            if (e._ts != null && now - e._ts > 4000)
                return true; // stale interim, include for feedback
            return false;
        })
            .map((e) => `[${e.channel === "mic" ? "You" : "Other"}] ${e.text}`)
            .join("\n");
        if (!transcriptText.trim())
            return;
        const { user } = this.profileManager.getProfiles();
        await streamLiveAssistWithFeedback({
            agentUrl: this.config.agentUrl,
            transcript: transcriptText,
            userId: this.deviceId,
            custom_prompt: this._instructions.trim() || undefined,
            agenda_items: this.agenda.length > 0 ? this.agenda.map((a) => ({ id: a.id, title: a.title, status: a.status, confidence: a.confidence })) : undefined,
            emotion_profile: user.emotionProfile,
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
                    if (d.agendaStatus?.length)
                        this.mergeAgendaUpdate(d.agendaStatus);
                },
                onError: (err) => this.emit("error", err),
            },
            signal,
        }).catch((err) => {
            if (err?.name !== "AbortError")
                this.emit("error", err instanceof Error ? err : new Error(String(err)));
        });
    }
}
export function createLiveAssistSession(config) {
    return new LiveAssistSession(config);
}
//# sourceMappingURL=session.js.map