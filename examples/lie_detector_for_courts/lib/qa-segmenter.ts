import type { TranscriptSegment, QAPair } from "./types";

let pairCounter = 0;

/**
 * Incrementally segment transcript entries into Q/A pairs.
 * A new Q/A pair starts when the speaker switches from WITNESS to COUNSEL
 * (i.e., counsel asks a new question).
 *
 * Single-channel mode: uses speaker change detection from ASR.
 * Dual-channel mode: uses channel assignment (mic = counsel, tab = witness).
 */
export function segmentIntoQA(segments: TranscriptSegment[]): QAPair[] {
  if (segments.length === 0) return [];

  const pairs: QAPair[] = [];
  let currentQuestion: TranscriptSegment | null = null;
  let currentAnswers: TranscriptSegment[] = [];
  let currentTimestamp = segments[0].timestamp;

  for (const seg of segments) {
    if (!seg.isFinal) continue;

    if (seg.speaker === "COUNSEL") {
      if (currentQuestion || currentAnswers.length > 0) {
        pairs.push({
          id: `qa_${pairCounter++}`,
          question: currentQuestion,
          answers: currentAnswers,
          timestamp: currentTimestamp,
        });
      }
      currentQuestion = seg;
      currentAnswers = [];
      currentTimestamp = seg.timestamp;
    } else {
      currentAnswers.push(seg);
    }
  }

  if (currentQuestion || currentAnswers.length > 0) {
    pairs.push({
      id: `qa_${pairCounter++}`,
      question: currentQuestion,
      answers: currentAnswers,
      timestamp: currentTimestamp,
    });
  }

  return pairs;
}

/**
 * Infer speaker from channel and transcript patterns.
 * In dual-channel mode: mic = COUNSEL, tab = WITNESS.
 * In single-channel mode: use question-mark heuristic + speaker change.
 */
export function inferSpeaker(
  text: string,
  channel: "mic" | "tab",
  captureMode: "mic_only" | "dual_channel",
  prevSpeaker: string,
  hasSpeakerChange: boolean,
): "COUNSEL" | "WITNESS" | "UNKNOWN" {
  if (captureMode === "dual_channel") {
    return channel === "mic" ? "COUNSEL" : "WITNESS";
  }

  if (hasSpeakerChange) {
    return prevSpeaker === "COUNSEL" ? "WITNESS" : "COUNSEL";
  }

  const trimmed = text.trim();
  if (trimmed.endsWith("?") || /^(?:did|do|does|is|are|was|were|can|could|would|will|have|has|when|where|what|who|why|how)\b/i.test(trimmed)) {
    return "COUNSEL";
  }

  return prevSpeaker as "COUNSEL" | "WITNESS" || "UNKNOWN";
}

export function resetQACounter(): void {
  pairCounter = 0;
}
