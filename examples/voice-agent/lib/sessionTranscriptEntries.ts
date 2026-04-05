import type { EmotionTimelineEntry, TranscriptSegment, UtteranceEmotionTimelinePoint } from "../App";
import type { StoredSession } from "./session-store";
import type { TranscriptEntry } from "./liveAssistTypes";

const EPS_MS = 2;

export function segmentAudioOffsetSec(seg: TranscriptSegment, anchorMs: number): number {
  if (seg.audioOffsetSec != null && Number.isFinite(seg.audioOffsetSec)) return Math.max(0, seg.audioOffsetSec);
  return Math.max(0, (seg.timestamp - anchorMs) / 1000);
}

function fallbackUtteranceTimeline(
  startSec: number,
  endSec: number,
  sortedMs: EmotionTimelineEntry[],
): UtteranceEmotionTimelinePoint[] | undefined {
  const startMs = startSec * 1000;
  const endMs = endSec === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : endSec * 1000;
  const slice = sortedMs.filter((e) => {
    if (e.offset < startMs - EPS_MS) return false;
    if (endMs === Number.POSITIVE_INFINITY) return true;
    return e.offset < endMs;
  });
  if (slice.length === 0) return undefined;
  const min = Math.min(...slice.map((e) => e.offset));
  return slice.map((e) => ({
    offset: (e.offset - min) / 1000,
    emotion: e.emotion,
    confidence: e.confidence,
    probs: e.probs,
  }));
}

/** User/other lines for the mic spectrogram bar. */
export function storedSessionToMicEntries(session: StoredSession, anchorMs: number): TranscriptEntry[] {
  const sortedTl = [...(session.emotionTimeline ?? [])].sort((a, b) => a.offset - b.offset);
  const micSegs = session.transcript.filter((s) => s.speaker === "user" || s.speaker === "other");

  return micSegs.map((s, i) => {
    const audioOffset = segmentAudioOffsetSec(s, anchorMs);
    const next = micSegs[i + 1];
    const endSec = next ? segmentAudioOffsetSec(next, anchorMs) : Number.POSITIVE_INFINITY;

    let emotionTimeline = s.emotionTimelineUtterance;
    if (!emotionTimeline?.length && sortedTl.length) {
      emotionTimeline = fallbackUtteranceTimeline(audioOffset, endSec, sortedTl);
    }

    return {
      channel: "mic" as const,
      text: s.text,
      audioOffset,
      metadata: {
        emotion: s.emotion,
        emotionConfidence: s.emotionConfidence,
        emotionTimeline,
        emotionProbs: s.emotionProbs,
      },
      is_final: true,
    };
  });
}

export function storedSessionToAgentEntries(session: StoredSession, anchorMs: number): TranscriptEntry[] {
  const sortedAgentTl = [...(session.agentEmotionTimeline ?? [])].sort((a, b) => a.offset - b.offset);
  const agentSegs = session.transcript.filter((s) => s.speaker === "agent");

  return agentSegs.map((s, i) => {
    const audioOffset = segmentAudioOffsetSec(s, anchorMs);
    const next = agentSegs[i + 1];
    const endSec = next ? segmentAudioOffsetSec(next, anchorMs) : Number.POSITIVE_INFINITY;

    let emotionTimeline = s.emotionTimelineUtterance;
    if (!emotionTimeline?.length && sortedAgentTl.length) {
      emotionTimeline = fallbackUtteranceTimeline(audioOffset, endSec, sortedAgentTl);
    }

    return {
      channel: "assistant" as const,
      text: s.text,
      audioOffset,
      metadata: {
        emotion: s.emotion,
        emotionConfidence: s.emotionConfidence,
        emotionTimeline,
        emotionProbs: s.emotionProbs,
      },
      is_final: true,
    };
  });
}

/** User + agent lines in chronological order (for a single “mixed” spectrogram). */
export function storedSessionToMixedEntries(session: StoredSession, anchorMs: number): TranscriptEntry[] {
  const mic = storedSessionToMicEntries(session, anchorMs);
  const agent = storedSessionToAgentEntries(session, anchorMs);
  return [...mic, ...agent].sort((a, b) => (a.audioOffset ?? 0) - (b.audioOffset ?? 0));
}
