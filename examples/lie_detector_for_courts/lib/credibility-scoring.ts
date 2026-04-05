/**
 * Composite credibility scoring from multiple voice/behavioral signals.
 *
 * Higher score = more credible witness.
 * Range: 0-100.
 */

export interface CredibilityInputs {
  emotionStability: number;
  directnessRatio: number;
  vocalStability: number;
  hedgingRatio: number;
  contradictionCount: number;
  evasionCount: number;
}

export interface CredibilityBreakdown {
  score: number;
  emotionComponent: number;
  directnessComponent: number;
  vocalComponent: number;
  consistencyComponent: number;
  label: string;
}

const WEIGHTS = {
  emotion: 0.2,
  directness: 0.25,
  vocal: 0.2,
  consistency: 0.35,
};

export function computeCredibility(inputs: CredibilityInputs): CredibilityBreakdown {
  const emotionComponent = Math.max(0, Math.min(100, inputs.emotionStability));

  const directnessComponent = Math.max(
    0,
    Math.min(100, inputs.directnessRatio * 100 - inputs.hedgingRatio * 50),
  );

  const vocalComponent = Math.max(0, Math.min(100, inputs.vocalStability));

  const contradictionPenalty = Math.min(50, inputs.contradictionCount * 15);
  const evasionPenalty = Math.min(30, inputs.evasionCount * 10);
  const consistencyComponent = Math.max(0, 100 - contradictionPenalty - evasionPenalty);

  const raw =
    emotionComponent * WEIGHTS.emotion +
    directnessComponent * WEIGHTS.directness +
    vocalComponent * WEIGHTS.vocal +
    consistencyComponent * WEIGHTS.consistency;

  const score = Math.round(Math.max(0, Math.min(100, raw)));

  let label: string;
  if (score >= 80) label = "High Credibility";
  else if (score >= 60) label = "Moderate Credibility";
  else if (score >= 40) label = "Questionable";
  else label = "Low Credibility";

  return {
    score,
    emotionComponent: Math.round(emotionComponent),
    directnessComponent: Math.round(directnessComponent),
    vocalComponent: Math.round(vocalComponent),
    consistencyComponent: Math.round(consistencyComponent),
    label,
  };
}

/**
 * Compute emotion stability from a rolling window of emotion readings.
 * Low variance across readings = high stability (credible).
 * High variance = shifting emotions (less credible on factual questions).
 */
export function computeEmotionStability(
  readings: Array<{ emotion: string; confidence: number }>,
): number {
  if (readings.length < 3) return 80;

  const emotionCounts: Record<string, number> = {};
  for (const r of readings) {
    emotionCounts[r.emotion] = (emotionCounts[r.emotion] ?? 0) + 1;
  }

  const dominantCount = Math.max(...Object.values(emotionCounts));
  const dominanceRatio = dominantCount / readings.length;

  const stressEmotions = ["FEAR", "ANGER", "SAD"];
  const stressCount = readings.filter((r) => stressEmotions.includes(r.emotion)).length;
  const stressRatio = stressCount / readings.length;

  const stability = dominanceRatio * 100 - stressRatio * 30;
  return Math.max(0, Math.min(100, Math.round(stability)));
}
