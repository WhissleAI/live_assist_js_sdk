export type SignalType = "strong-interest" | "interest" | "neutral" | "caution" | "red-flag";

export interface InterestSignal {
  type: SignalType;
  label: string;
  detail: string;
  timestamp: number;
}

interface SignalInputs {
  userSegmentCount: number;
  otherSegmentCount: number;
  otherEmotionProfile: Record<string, number>;
  engagementScore: number;
  sentimentTrend: string;
  keywords: string[];
  turnCount: number;
}

/**
 * Analyze the current conversation state and generate interest signals.
 */
export function analyzeInterestSignals(inputs: SignalInputs): InterestSignal[] {
  const signals: InterestSignal[] = [];
  const now = Date.now();

  const { userSegmentCount, otherSegmentCount, otherEmotionProfile, engagementScore, sentimentTrend } = inputs;

  // Turn balance analysis
  const total = userSegmentCount + otherSegmentCount;
  if (total > 4) {
    const otherRatio = otherSegmentCount / total;
    if (otherRatio > 0.55) {
      signals.push({
        type: "strong-interest",
        label: "They're talking a lot",
        detail: "They're invested in the conversation and sharing freely.",
        timestamp: now,
      });
    } else if (otherRatio < 0.25) {
      signals.push({
        type: "caution",
        label: "One-sided conversation",
        detail: "You're doing most of the talking. Try asking them a question.",
        timestamp: now,
      });
    }
  }

  // Emotion analysis
  const happy = otherEmotionProfile["HAPPY"] ?? 0;
  const surprise = otherEmotionProfile["SURPRISE"] ?? 0;
  const angry = otherEmotionProfile["ANGRY"] ?? 0;
  const sad = otherEmotionProfile["SAD"] ?? 0;
  const neutral = otherEmotionProfile["NEUTRAL"] ?? 0;

  const totalEmotion = Object.values(otherEmotionProfile).reduce((a, b) => a + b, 0) || 1;

  if ((happy + surprise) / totalEmotion > 0.5) {
    signals.push({
      type: "strong-interest",
      label: "Positive vibes",
      detail: "They sound happy and engaged. This is going well!",
      timestamp: now,
    });
  }

  if ((angry + sad) / totalEmotion > 0.3) {
    signals.push({
      type: "red-flag",
      label: "Tension detected",
      detail: "Negative emotions are elevated. Consider switching topics.",
      timestamp: now,
    });
  }

  if (neutral / totalEmotion > 0.8 && total > 6) {
    signals.push({
      type: "caution",
      label: "Flat energy",
      detail: "Conversation is neutral. Try sharing something personal or asking a deeper question.",
      timestamp: now,
    });
  }

  // Engagement
  if (engagementScore > 75) {
    signals.push({
      type: "interest",
      label: "High engagement",
      detail: "Both of you are actively engaged. Keep the momentum!",
      timestamp: now,
    });
  } else if (engagementScore < 30 && total > 4) {
    signals.push({
      type: "caution",
      label: "Engagement dropping",
      detail: "Energy is fading. Time for a topic change or a fun question.",
      timestamp: now,
    });
  }

  // Sentiment trend
  if (sentimentTrend === "positive") {
    signals.push({
      type: "interest",
      label: "Warming up",
      detail: "The conversation sentiment is trending positive.",
      timestamp: now,
    });
  } else if (sentimentTrend === "negative") {
    signals.push({
      type: "caution",
      label: "Cooling down",
      detail: "Sentiment is trending negative. Stay warm and genuine.",
      timestamp: now,
    });
  }

  return signals;
}

export function getSignalColor(type: SignalType): string {
  switch (type) {
    case "strong-interest": return "#16a34a";
    case "interest": return "#22c55e";
    case "neutral": return "#9198a8";
    case "caution": return "#f59e0b";
    case "red-flag": return "#ef4444";
  }
}

export function getSignalIcon(type: SignalType): string {
  switch (type) {
    case "strong-interest": return "\u2764\uFE0F";
    case "interest": return "\u2728";
    case "neutral": return "\u2796";
    case "caution": return "\u26A0\uFE0F";
    case "red-flag": return "\uD83D\uDEA9";
  }
}
