/**
 * Canonical emotion color palette — aligned with live-assist-nextjs transcriptEmotion.
 */
export const EMOTION_COLORS: Record<string, string> = {
  NEUTRAL: "#9ca3af",
  HAPPY: "#facc15",
  SAD: "#3b82f6",
  ANGRY: "#ef4444",
  FEAR: "#8b5cf6",
  SURPRISE: "#f97316",
  DISGUST: "#14b8a6",
  CURIOUS: "#6366f1",
  FRUSTRATED: "#f59e0b",
};

const EMOTION_BORDER: Record<string, string> = {
  HAPPY: "var(--warning, #f59e0b)",
  SAD: "var(--info, #3b82f6)",
  ANGRY: "var(--error, #ef4444)",
  NEUTRAL: "transparent",
  CURIOUS: "var(--primary, #6366f1)",
  FRUSTRATED: "var(--warning, #f59e0b)",
  FEAR: "var(--info, #8b5cf6)",
  SURPRISE: "var(--warning, #f97316)",
  DISGUST: "var(--success, #14b8a6)",
};

function normalizeEmotionKey(emotion: string): string {
  return String(emotion).toUpperCase().replace(/^EMOTION_/, "");
}

export function getEmotionBorderColor(emotion?: string | null): string {
  if (!emotion) return "transparent";
  const key = normalizeEmotionKey(emotion);
  return EMOTION_BORDER[key] ?? "transparent";
}

export function getEmotionTimelineColor(emotion?: string | null): string {
  if (!emotion) return "#cbd5e1";
  const key = normalizeEmotionKey(emotion);
  return EMOTION_COLORS[key] ?? "#cbd5e1";
}

export function getEmotionBackgroundTint(emotion?: string | null): string {
  if (!emotion) return "transparent";
  const border = getEmotionBorderColor(emotion);
  if (border === "transparent") return "transparent";
  return `color-mix(in srgb, ${border} 8%, transparent)`;
}
