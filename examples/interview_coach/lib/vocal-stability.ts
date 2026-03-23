export interface VocalStabilityResult {
  stability: number;
  hasConvictionMoment: boolean;
  hasMicroNervousness: boolean;
}

/**
 * Analyzes sub-window emotion timeline within a single ASR chunk
 * to detect vocal micro-patterns invisible in per-chunk averages.
 */
export function analyzeChunkStability(
  timeline: Array<{
    offset: number;
    emotion?: Array<{ token: string; probability: number }>;
  }>,
): VocalStabilityResult {
  if (timeline.length < 2) {
    return { stability: 100, hasConvictionMoment: false, hasMicroNervousness: false };
  }

  let totalVariance = 0;
  let maxFearSpike = 0;
  let maxPositiveStreak = 0;
  let currentPositiveStreak = 0;

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const emotions = entry.emotion ?? [];

    const fearProb = emotions.find((e) => normalize(e.token) === "FEAR")?.probability ?? 0;
    const sadProb = emotions.find((e) => normalize(e.token) === "SAD")?.probability ?? 0;
    const happyProb = emotions.find((e) => normalize(e.token) === "HAPPY")?.probability ?? 0;
    const surpriseProb = emotions.find((e) => normalize(e.token) === "SURPRISE")?.probability ?? 0;

    const negativeProb = fearProb + sadProb;
    const positiveProb = happyProb + surpriseProb;

    if (negativeProb > 0.4) maxFearSpike = Math.max(maxFearSpike, negativeProb);

    if (positiveProb > 0.5) {
      currentPositiveStreak++;
      maxPositiveStreak = Math.max(maxPositiveStreak, currentPositiveStreak);
    } else {
      currentPositiveStreak = 0;
    }

    if (i > 0) {
      const prev = timeline[i - 1].emotion ?? [];
      let diff = 0;
      for (const curr of emotions) {
        const prevVal = prev.find((p) => p.token === curr.token)?.probability ?? 0;
        diff += Math.abs(curr.probability - prevVal);
      }
      totalVariance += diff;
    }
  }

  const avgVariance = totalVariance / (timeline.length - 1);
  const stability = Math.max(0, Math.min(100, Math.round((1 - avgVariance) * 100)));

  return {
    stability,
    hasConvictionMoment: maxPositiveStreak >= 2,
    hasMicroNervousness: maxFearSpike > 0.5 && stability < 70,
  };
}

function normalize(token: string): string {
  let t = token.toUpperCase().trim();
  if (t.startsWith("EMOTION_")) t = t.slice(8);
  return t;
}

export class VocalStabilityTracker {
  private readings: number[] = [];
  private convictionCount = 0;
  private nervousnessCount = 0;

  update(result: VocalStabilityResult): void {
    this.readings.push(result.stability);
    if (result.hasConvictionMoment) this.convictionCount++;
    if (result.hasMicroNervousness) this.nervousnessCount++;
  }

  get averageStability(): number {
    if (this.readings.length === 0) return 100;
    return Math.round(this.readings.reduce((a, b) => a + b, 0) / this.readings.length);
  }

  get convictionMoments(): number {
    return this.convictionCount;
  }

  get microNervousMoments(): number {
    return this.nervousnessCount;
  }

  reset(): void {
    this.readings = [];
    this.convictionCount = 0;
    this.nervousnessCount = 0;
  }
}
