import type { SessionState, TranscriptSegment, Moment, RegulationEvent } from "../App";
import type { KidsMode } from "./modes";

export interface StoredSession {
  id: string;
  date: string;
  durationSec: number;
  mode: KidsMode;
  emotionSummary: { dominant: string; avgConfidence: number; shifts: number };
  topicsDiscussed: string[];
  moments: Moment[];
  regulationEvents: RegulationEvent[];
  checkinData?: { overall_mood: string; highlights: string[]; concerns: string[] };
  flaggedConcerns: Array<{ text: string; emotion: string; severity: string; reason: string; timestamp: number }>;
  transcript: TranscriptSegment[];
  storyBeats: Array<{ narrator_text: string; child_prompt: string; mood: string }>;
}

const STORAGE_KEY = "whissle_kids_sessions";
const MAX_SESSIONS = 20;

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

export function saveSession(session: SessionState): StoredSession {
  const durationSec = session.sessionStart ? Math.floor((Date.now() - session.sessionStart) / 1000) : 0;

  const stored: StoredSession = {
    id: `session_${Date.now()}`,
    date: new Date().toISOString(),
    durationSec,
    mode: session.mode,
    emotionSummary: computeEmotionSummary(session),
    topicsDiscussed: session.topicsDiscussed,
    moments: session.moments,
    regulationEvents: session.regulationEvents,
    checkinData: session.checkinData,
    flaggedConcerns: session.flaggedConcerns,
    transcript: session.transcript,
    storyBeats: session.storyBeats,
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

export function loadSessions(): StoredSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredSession[];
  } catch {}
  return [];
}

export function clearSessions(): void {
  localStorage.removeItem(STORAGE_KEY);
}
