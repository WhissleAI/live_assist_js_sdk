import type { BehavioralProfile } from "@whissle/live-assist-core";

export interface ChemistrySnapshot {
  overall: number;         // 0-100
  engagement: number;      // 0-100
  emotionAlignment: number; // 0-100
  turnBalance: number;     // 0-100 (50/50 = 100)
  positivity: number;      // 0-100
  trend: "rising" | "stable" | "falling";
}

const POSITIVE_EMOTIONS = new Set(["HAPPY", "SURPRISE"]);
const NEGATIVE_EMOTIONS = new Set(["ANGRY", "SAD", "FEAR", "DISGUST"]);

function emotionOverlap(a: Record<string, number>, b: Record<string, number>): number {
  let positiveOverlap = 0;
  let totalWeight = 0;
  for (const emotion of Object.keys(a)) {
    const aVal = a[emotion] ?? 0;
    const bVal = b[emotion] ?? 0;
    if (POSITIVE_EMOTIONS.has(emotion)) {
      positiveOverlap += Math.min(aVal, bVal);
    }
    totalWeight += Math.max(aVal, bVal);
  }
  for (const emotion of Object.keys(b)) {
    if (!(emotion in a)) {
      totalWeight += b[emotion];
    }
  }
  return totalWeight > 0 ? (positiveOverlap / totalWeight) * 100 : 50;
}

function emotionAlignmentScore(a: Record<string, number>, b: Record<string, number>): number {
  // How often do both speakers share similar emotional states?
  const allEmotions = new Set([...Object.keys(a), ...Object.keys(b)]);
  let alignedWeight = 0;
  let totalWeight = 0;

  for (const emotion of allEmotions) {
    const aVal = a[emotion] ?? 0;
    const bVal = b[emotion] ?? 0;
    const diff = Math.abs(aVal - bVal);
    const avg = (aVal + bVal) / 2;
    if (avg > 0) {
      alignedWeight += avg * (1 - diff / Math.max(aVal, bVal, 0.01));
      totalWeight += avg;
    }
  }

  return totalWeight > 0 ? (alignedWeight / totalWeight) * 100 : 50;
}

function positivityScore(profile: Record<string, number>): number {
  let pos = 0;
  let neg = 0;
  for (const [emotion, weight] of Object.entries(profile)) {
    if (POSITIVE_EMOTIONS.has(emotion)) pos += weight;
    if (NEGATIVE_EMOTIONS.has(emotion)) neg += weight;
  }
  const total = pos + neg;
  return total > 0 ? (pos / total) * 100 : 50;
}

export function computeChemistry(
  userProfile: BehavioralProfile,
  otherProfile: BehavioralProfile,
  engagementScore: number,
  sentimentTrend: string,
  prevScore?: number,
): ChemistrySnapshot {
  const userSegs = userProfile.segmentCount || 1;
  const otherSegs = otherProfile.segmentCount || 1;
  const totalSegs = userSegs + otherSegs;

  // Turn balance: 50/50 = perfect (100), all one-sided = 0
  const ratio = Math.min(userSegs, otherSegs) / Math.max(userSegs, otherSegs, 1);
  const turnBalance = ratio * 100;

  const alignment = emotionAlignmentScore(
    userProfile.emotionProfile,
    otherProfile.emotionProfile,
  );

  const mutualPositivity = (
    positivityScore(userProfile.emotionProfile) +
    positivityScore(otherProfile.emotionProfile)
  ) / 2;

  // Sentiment modifier
  const sentimentMod = sentimentTrend === "positive" ? 10
    : sentimentTrend === "negative" ? -10
    : 0;

  // Weighted overall
  const raw =
    engagementScore * 0.30 +
    mutualPositivity * 0.20 +
    turnBalance * 0.20 +
    alignment * 0.15 +
    (50 + sentimentMod) * 0.15; // normalized sentiment contribution

  const overall = Math.max(0, Math.min(100, Math.round(raw)));

  const trend: ChemistrySnapshot["trend"] =
    prevScore == null ? "stable"
    : overall > prevScore + 3 ? "rising"
    : overall < prevScore - 3 ? "falling"
    : "stable";

  return {
    overall,
    engagement: Math.round(engagementScore),
    emotionAlignment: Math.round(alignment),
    turnBalance: Math.round(turnBalance),
    positivity: Math.round(mutualPositivity),
    trend,
  };
}
