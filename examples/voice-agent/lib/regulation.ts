import type { EmotionTimelineEntry } from "../App";
import type { KidsMode } from "./modes";

const NEGATIVE_EMOTIONS = new Set(["FEAR", "SAD", "ANGRY"]);
const TRIGGER_DURATION_SEC = 15;
const COOLDOWN_MS = 5 * 60_000;

export interface RegulationMonitorState {
  shouldTrigger: boolean;
  dominantNegative: string | null;
  negativeDurationSec: number;
}

export function checkRegulationTrigger(
  emotionTimeline: EmotionTimelineEntry[],
  currentMode: KidsMode,
  lastRegulationTime: number | null,
): RegulationMonitorState {
  const noop: RegulationMonitorState = { shouldTrigger: false, dominantNegative: null, negativeDurationSec: 0 };

  if (currentMode !== "kids_free_talk") return noop;

  if (lastRegulationTime && Date.now() - lastRegulationTime < COOLDOWN_MS) return noop;

  if (emotionTimeline.length < 5) return noop;

  const recent = emotionTimeline.slice(-30);
  const negativeEntries = recent.filter((e) => NEGATIVE_EMOTIONS.has(e.emotion) && e.confidence > 0.3);

  if (negativeEntries.length < recent.length * 0.6) return noop;

  const first = recent[0];
  const last = recent[recent.length - 1];
  const durationMs = last.offset - first.offset;
  const durationSec = durationMs / 1000;

  if (durationSec < TRIGGER_DURATION_SEC) return noop;

  const emotionCounts: Record<string, number> = {};
  for (const e of negativeEntries) {
    emotionCounts[e.emotion] = (emotionCounts[e.emotion] ?? 0) + 1;
  }

  const dominant = Object.entries(emotionCounts).reduce((a, b) => (a[1] >= b[1] ? a : b));

  return {
    shouldTrigger: true,
    dominantNegative: dominant[0],
    negativeDurationSec: Math.round(durationSec),
  };
}
