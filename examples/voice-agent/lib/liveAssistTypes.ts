import type { UtteranceEmotionTimelinePoint } from "../App";

export type TranscriptEntryMetadata = {
  emotion?: string;
  emotionConfidence?: number;
  emotionTimeline?: UtteranceEmotionTimelinePoint[];
  /** Snapshot distribution for spectrogram blending when no per-window timeline. */
  emotionProbs?: Array<{ emotion: string; probability: number }>;
};

/** Shape expected by EmotionTimelineBar (mirrors live-assist-nextjs). */
export type TranscriptEntry = {
  channel: "mic" | "tab" | "assistant";
  text: string;
  audioOffset?: number;
  metadata?: TranscriptEntryMetadata;
  is_final?: boolean;
};
