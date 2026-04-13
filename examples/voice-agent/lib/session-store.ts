import type { SessionState, TranscriptSegment, Moment, EmotionTimelineEntry } from "../App";

export interface StoredSession {
  id: string;
  agentId: string;
  agentName: string;
  date: string;
  durationSec: number;
  /** Wall-clock ms when recording started; aligns mic ASR timeline + transcript offsets with audio. */
  sessionStartMs?: number;
  emotionSummary: { dominant: string; avgConfidence: number; shifts: number };
  /** Mic ASR timeline; each point may include `probs` (full emotion distribution). */
  emotionTimeline?: EmotionTimelineEntry[];
  /** TTS → STT agent-voice timeline (ms offsets), optional for older saves. */
  agentEmotionTimeline?: EmotionTimelineEntry[];
  topicsDiscussed: string[];
  moments: Moment[];
  flaggedConcerns: Array<{ text: string; emotion: string; severity: string; reason: string; timestamp: number }>;
  transcript: TranscriptSegment[];
  /** Cached AI-generated analysis of the conversation. */
  aiSummary?: string;
  /** Timestamp (ms) when batch re-transcription was applied. */
  reTranscribedAt?: number;
  // Legacy fields kept for backward compat with old localStorage data
  mode?: string;
  regulationEvents?: unknown[];
  checkinData?: unknown;
  storyBeats?: unknown[];
}

const STORAGE_KEY = "whissle_agents_sessions";
const LEGACY_KEY = "whissle_kids_sessions";
const MAX_SESSIONS = 50;

function computeEmotionSummary(session: SessionState): StoredSession["emotionSummary"] {
  const timeline = session.emotionTimeline;
  if (timeline.length === 0) return { dominant: "NEUTRAL", avgConfidence: 0, shifts: 0 };

  const counts: Record<string, number> = {};
  let totalConf = 0;
  let shifts = 0;
  let lastEmo = "";

  for (const e of timeline) {
    counts[e.emotion] = (counts[e.emotion] ?? 0) + 1;
    totalConf += e.confidence;
    if (lastEmo && e.emotion !== lastEmo) shifts++;
    lastEmo = e.emotion;
  }

  const dominant = Object.entries(counts).reduce((a, b) => (a[1] >= b[1] ? a : b))[0];
  return { dominant, avgConfidence: totalConf / timeline.length, shifts };
}

export function saveSession(session: SessionState, agentName?: string): StoredSession {
  const durationSec = session.sessionStart ? Math.floor((Date.now() - session.sessionStart) / 1000) : 0;

  const stored: StoredSession = {
    id: `session_${Date.now()}`,
    agentId: session.agentId || "",
    agentName: agentName || "Agent",
    date: new Date().toISOString(),
    durationSec,
    sessionStartMs: session.sessionStart ?? undefined,
    emotionSummary: computeEmotionSummary(session),
    emotionTimeline: session.emotionTimeline ?? [],
    agentEmotionTimeline: session.agentEmotionTimeline ?? [],
    topicsDiscussed: session.topicsDiscussed ?? [],
    moments: session.moments ?? [],
    flaggedConcerns: session.flaggedConcerns ?? [],
    transcript: session.transcript ?? [],
  };

  const existing = loadSessions();
  existing.push(stored);
  while (existing.length > MAX_SESSIONS) existing.shift();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn("[SessionStore] save failed:", e);
  }

  return stored;
}

function isValidSession(s: unknown): s is StoredSession {
  if (!s || typeof s !== "object") return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.date === "string" &&
    typeof obj.durationSec === "number" &&
    obj.emotionSummary != null &&
    typeof (obj.emotionSummary as Record<string, unknown>).dominant === "string" &&
    Array.isArray(obj.transcript)
  );
}

function migrateLegacy(): StoredSession[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const migrated = parsed.filter(isValidSession).map((s) => ({
      ...s,
      agentId: s.agentId || "legacy",
      agentName: s.agentName || "Agent",
      topicsDiscussed: Array.isArray(s.topicsDiscussed) ? s.topicsDiscussed : [],
      moments: Array.isArray(s.moments) ? s.moments : [],
      flaggedConcerns: Array.isArray(s.flaggedConcerns) ? s.flaggedConcerns : [],
    }));
    if (migrated.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY);
    }
    return migrated;
  } catch {
    return [];
  }
}

export function loadSessions(): StoredSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidSession).map((s) => ({
        ...s,
        agentId: s.agentId || "",
        agentName: s.agentName || "Agent",
        topicsDiscussed: Array.isArray(s.topicsDiscussed) ? s.topicsDiscussed : [],
        moments: Array.isArray(s.moments) ? s.moments : [],
        flaggedConcerns: Array.isArray(s.flaggedConcerns) ? s.flaggedConcerns : [],
        agentEmotionTimeline: Array.isArray(s.agentEmotionTimeline) ? s.agentEmotionTimeline : [],
      }));
    }
    return migrateLegacy();
  } catch {}
  return [];
}

export function updateSession(sessionId: string, patch: Partial<StoredSession>): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return;
  sessions[idx] = { ...sessions[idx]!, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn("[SessionStore] update failed:", e);
  }
}

export function deleteSession(sessionId: string): void {
  const sessions = loadSessions().filter((s) => s.id !== sessionId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn("[SessionStore] delete failed:", e);
  }
}

export function clearSessions(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
}
