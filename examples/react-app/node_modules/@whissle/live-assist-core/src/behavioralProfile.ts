export const EMOTION_KEYS = ["NEUTRAL", "HAPPY", "SAD", "ANGRY", "FEAR", "SURPRISE", "DISGUST"] as const;
const EMA_ALPHA = 0.3;

export type Channel = "microphone" | "system";

export interface BehavioralProfile {
  emotionProfile: Record<string, number>;
  intentProfile: Record<string, number>;
  segmentCount: number;
}

const emptyProfile = (): BehavioralProfile => ({
  emotionProfile: {},
  intentProfile: {},
  segmentCount: 0,
});

function normalizeKey(token: string, prefix: string): string {
  const stripped = token.replace(new RegExp(`^${prefix}`), "").trim() || token;
  return prefix === "EMOTION_" ? stripped.toUpperCase() : stripped;
}

export function createBehavioralProfileManager(initialUser?: BehavioralProfile) {
  let userProfile: BehavioralProfile = initialUser
    ? { emotionProfile: { ...initialUser.emotionProfile }, intentProfile: { ...initialUser.intentProfile }, segmentCount: initialUser.segmentCount }
    : emptyProfile();
  let otherProfile: BehavioralProfile = emptyProfile();
  let sessionUserProfile: BehavioralProfile = emptyProfile();

  function update(
    channel: Channel,
    emotionProbs: Array<{ token: string; probability: number }>,
    intentProbs: Array<{ token: string; probability: number }>
  ) {
    const prev = channel === "microphone" ? userProfile : otherProfile;
    const emotionProfileMap: Record<string, number> = { ...prev.emotionProfile };
    const intentProfileMap: Record<string, number> = { ...prev.intentProfile };
    const alpha = EMA_ALPHA;

    for (const { token, probability } of emotionProbs) {
      if (!Number.isFinite(probability) || probability < 0) continue;
      const key = normalizeKey(token, "EMOTION_");
      if (!EMOTION_KEYS.includes(key as (typeof EMOTION_KEYS)[number])) continue;
      const p = emotionProfileMap[key] ?? 0;
      emotionProfileMap[key] = alpha * probability + (1 - alpha) * p;
    }
    for (const { token, probability } of intentProbs) {
      if (!Number.isFinite(probability) || probability < 0) continue;
      const key = normalizeKey(token, "INTENT_");
      const p = intentProfileMap[key] ?? 0;
      intentProfileMap[key] = alpha * probability + (1 - alpha) * p;
    }

    const next: BehavioralProfile = { emotionProfile: emotionProfileMap, intentProfile: intentProfileMap, segmentCount: prev.segmentCount + 1 };
    if (channel === "microphone") {
      userProfile = next;
      const sPrev = sessionUserProfile;
      const sEmotion: Record<string, number> = { ...sPrev.emotionProfile };
      const sIntent: Record<string, number> = { ...sPrev.intentProfile };
      for (const { token, probability } of emotionProbs) {
        if (!Number.isFinite(probability) || probability < 0) continue;
        const key = normalizeKey(token, "EMOTION_");
        if (!EMOTION_KEYS.includes(key as (typeof EMOTION_KEYS)[number])) continue;
        sEmotion[key] = alpha * probability + (1 - alpha) * (sEmotion[key] ?? 0);
      }
      for (const { token, probability } of intentProbs) {
        if (!Number.isFinite(probability) || probability < 0) continue;
        const key = normalizeKey(token, "INTENT_");
        sIntent[key] = alpha * probability + (1 - alpha) * (sIntent[key] ?? 0);
      }
      sessionUserProfile = { emotionProfile: sEmotion, intentProfile: sIntent, segmentCount: sPrev.segmentCount + 1 };
    } else {
      otherProfile = next;
    }
  }

  function getProfiles(): { user: BehavioralProfile; other: BehavioralProfile } {
    return { user: { ...userProfile }, other: { ...otherProfile } };
  }

  function getSessionUserProfile(): BehavioralProfile {
    return { ...sessionUserProfile };
  }

  function reset() {
    userProfile = emptyProfile();
    otherProfile = emptyProfile();
    sessionUserProfile = emptyProfile();
  }

  return { update, getProfiles, getSessionUserProfile, reset };
}

export const EMOTION_EMOJI: Record<string, string> = {
  NEUTRAL: "😐", HAPPY: "😊", SAD: "😢", ANGRY: "😠",
  FEAR: "😨", SURPRISE: "😮", DISGUST: "🤢",
};

export const EMOTION_COLORS: Record<string, string> = {
  NEUTRAL: "#9ca3af", HAPPY: "#facc15", SAD: "#3b82f6", ANGRY: "#e11d48",
  FEAR: "#8b5cf6", SURPRISE: "#f97316", DISGUST: "#22c55e",
};

export function getDominantEmotion(profile: BehavioralProfile): string {
  if (Object.keys(profile.emotionProfile).length === 0) return "NEUTRAL";
  const top = Object.entries(profile.emotionProfile).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? "NEUTRAL";
}

export function getMoodTag(profile: BehavioralProfile): string {
  const e = getDominantEmotion(profile);
  const tags: Record<string, string> = { NEUTRAL: "Steady", HAPPY: "Positive", SAD: "Low", ANGRY: "Intense", FEAR: "Cautious", SURPRISE: "Reactive", DISGUST: "Dismissive" };
  return tags[e] ?? "Steady";
}

export function topIntents(profile: BehavioralProfile, n: number): string[] {
  return Object.entries(profile.intentProfile).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k.replace(/_/g, " "));
}

export function intentDisplayLabel(key: string): string {
  const label = key.replace(/_/g, " ").toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getToneDescription(profile: BehavioralProfile): string {
  const parts: string[] = [];
  const dominant = getDominantEmotion(profile);
  const emotionTone: Record<string, string> = { NEUTRAL: "Neutral", HAPPY: "Positive", SAD: "Reflective", ANGRY: "Assertive", FEAR: "Cautious", SURPRISE: "Reactive", DISGUST: "Dismissive" };
  parts.push(emotionTone[dominant] ?? "Neutral");
  const intents = Object.entries(profile.intentProfile).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const intentToAdj: Record<string, string> = { INFORM: "Informative", QUESTION: "Inquisitive", REQUEST: "Request-oriented", COMMAND: "Direct", STATEMENT: "Declarative", ACKNOWLEDGE: "Receptive", EXPRESS: "Expressive" };
  for (const [k, v] of intents) {
    if (v > 0.1) {
      const adj = intentToAdj[k] ?? intentDisplayLabel(k);
      if (adj && !parts.includes(adj)) parts.push(adj);
    }
  }
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}
