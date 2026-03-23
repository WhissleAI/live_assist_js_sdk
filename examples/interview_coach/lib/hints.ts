export interface Hint {
  id: string;
  type: "delivery" | "content" | "meta" | "alignment" | "pause" | "stability";
  icon: string;
  text: string;
  priority: number;
  color: "green" | "amber" | "red" | "blue" | "gray";
  createdAt: number;
}

export interface HintContext {
  currentEmotion: string;
  emotionProbs: Record<string, number>;
  confidenceScore: number;
  speakingPaceWPM: number;
  answerDurationSec: number;
  fillerWordCount: number;
  partialTranscript: string;
  questionCategory: string;
  questionIndex: number;
  jdKeyRequirements: string[];
  resumeStrengths: string[];
  jdCoveragePct: number;
  unmatchedSkills: string[];
  vocalStability: number;
  thinkTimeSec: number;
  isPassive: boolean;
  isHedging: boolean;
}

const MIN_INTERVAL_MS = 5000;
let lastHintTime = 0;
let shownHintIds = new Set<string>();
let lastConfidence = 50;

export function resetHintState(): void {
  lastHintTime = 0;
  shownHintIds = new Set();
  lastConfidence = 50;
}

export function generateDeliveryHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];
  const now = Date.now();
  const confidenceDelta = ctx.confidenceScore - lastConfidence;
  lastConfidence = ctx.confidenceScore;

  if (confidenceDelta < -15 && ctx.answerDurationSec > 3) {
    hints.push({ id: "d_dropping", type: "delivery", icon: "⚡", text: "Your confidence just dropped — take a breath and reset.", priority: 9, color: "red", createdAt: now });
  }

  if (ctx.confidenceScore < 45 && ctx.answerDurationSec > 3) {
    hints.push({ id: "d_nerves", type: "delivery", icon: "⚡", text: "Take a breath. Slow down and own it — you know this.", priority: 8, color: "amber", createdAt: now });
  }

  if (ctx.speakingPaceWPM > 180 && ctx.answerDurationSec > 5) {
    hints.push({ id: "d_fast", type: "delivery", icon: "⏱", text: "You're speeding up. Slow down — silence reads as confidence.", priority: 7, color: "blue", createdAt: now });
  }

  if (ctx.speakingPaceWPM > 0 && ctx.speakingPaceWPM < 90 && ctx.answerDurationSec > 8) {
    hints.push({ id: "d_slow", type: "delivery", icon: "⏱", text: "Pick up your energy a bit. Show engagement.", priority: 5, color: "blue", createdAt: now });
  }

  if (ctx.fillerWordCount > 3) {
    hints.push({ id: "d_fillers", type: "delivery", icon: "💬", text: `${ctx.fillerWordCount} filler words. Pause instead of filling.`, priority: 6, color: "gray", createdAt: now });
  }

  if (ctx.answerDurationSec > 90 && ctx.answerDurationSec <= 120) {
    hints.push({ id: "d_long", type: "delivery", icon: "⏱", text: "Running long. Start wrapping up your point.", priority: 7, color: "amber", createdAt: now });
  }

  if (ctx.answerDurationSec > 120) {
    hints.push({ id: "d_toolong", type: "delivery", icon: "🛑", text: "Over 2 minutes. Wrap up now — interviewers lose attention.", priority: 9, color: "red", createdAt: now });
  }

  if (ctx.confidenceScore > 75 && ctx.answerDurationSec > 5) {
    hints.push({ id: "d_great", type: "delivery", icon: "✓", text: "Great energy and confidence — keep this up!", priority: 3, color: "green", createdAt: now });
  }

  if (ctx.currentEmotion === "NEUTRAL" && ctx.answerDurationSec > 20 && ctx.confidenceScore > 40 && ctx.confidenceScore < 60) {
    hints.push({ id: "d_monotone", type: "delivery", icon: "🎵", text: "Add vocal variety. Emphasize the parts you're proud of.", priority: 5, color: "blue", createdAt: now });
  }

  return hints;
}

export function generateAlignmentHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];
  const now = Date.now();

  if (ctx.questionIndex >= 2 && ctx.unmatchedSkills.length > 0 && ctx.jdCoveragePct < 30) {
    const skill = ctx.unmatchedSkills[0];
    hints.push({ id: `a_low_${ctx.questionIndex}`, type: "alignment", icon: "📋", text: `JD coverage is low. Work in "${skill}" — it's a key requirement.`, priority: 8, color: "amber", createdAt: now });
  }

  if (ctx.jdCoveragePct >= 60 && ctx.unmatchedSkills.length <= 2) {
    hints.push({ id: "a_good", type: "alignment", icon: "✓", text: "Good JD coverage. Focus on depth over breadth now.", priority: 3, color: "green", createdAt: now });
  }

  if (ctx.unmatchedSkills.length === 1) {
    hints.push({ id: "a_last", type: "alignment", icon: "📋", text: `One more skill to cover: "${ctx.unmatchedSkills[0]}". Mention it if you can.`, priority: 6, color: "blue", createdAt: now });
  }

  return hints;
}

export function generatePauseHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];
  const now = Date.now();

  if (ctx.thinkTimeSec > 6 && ctx.questionCategory !== "behavioral" && ctx.questionCategory !== "situational") {
    hints.push({ id: "p_long_think", type: "pause", icon: "⏱", text: "Long pause before answering. For non-behavioral Qs, try to start within 3 seconds.", priority: 6, color: "amber", createdAt: now });
  }

  if (ctx.thinkTimeSec > 0 && ctx.thinkTimeSec < 1.5 && ctx.questionIndex > 0) {
    hints.push({ id: "p_too_quick", type: "pause", icon: "💡", text: "You jumped in very fast. A brief pause shows you're thinking.", priority: 4, color: "blue", createdAt: now });
  }

  if (ctx.isPassive && ctx.answerDurationSec > 10) {
    hints.push({ id: "p_passive", type: "pause", icon: "💬", text: "You're being too agreeable — make declarative statements. Own your decisions.", priority: 7, color: "amber", createdAt: now });
  }

  if (ctx.isHedging && ctx.answerDurationSec > 10) {
    hints.push({ id: "p_hedging", type: "pause", icon: "💬", text: "Too many questioning tones. State your points with authority.", priority: 7, color: "amber", createdAt: now });
  }

  return hints;
}

export function generateStabilityHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];
  const now = Date.now();

  if (ctx.vocalStability < 50 && ctx.answerDurationSec > 5) {
    hints.push({ id: "s_unstable", type: "stability", icon: "🎵", text: "Your voice is wavering. Ground yourself — take a breath and speak from your chest.", priority: 8, color: "amber", createdAt: now });
  }

  if (ctx.vocalStability > 80 && ctx.confidenceScore > 65 && ctx.answerDurationSec > 8) {
    hints.push({ id: "s_steady", type: "stability", icon: "✓", text: "Steady, confident delivery. This is your strongest zone.", priority: 2, color: "green", createdAt: now });
  }

  return hints;
}

export function generateMetaHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];
  const now = Date.now();

  if (ctx.confidenceScore < 50 && ctx.questionCategory === "technical") {
    const strength = ctx.resumeStrengths[0];
    if (strength) {
      hints.push({ id: "m_tech_nervous", type: "meta", icon: "🎯", text: `You sound less confident here. But your ${strength} experience is directly relevant — frame it that way.`, priority: 9, color: "amber", createdAt: now });
    }
  }

  if (ctx.confidenceScore < 50 && (ctx.questionCategory === "behavioral" || ctx.questionCategory === "leadership")) {
    hints.push({ id: "m_behav_nervous", type: "meta", icon: "🎯", text: "Behavioral Qs trigger nerves. Bridge to your technical strengths: 'My expertise led me to mentor others.'", priority: 9, color: "amber", createdAt: now });
  }

  if (ctx.confidenceScore > 70 && ctx.jdKeyRequirements.length > 0) {
    const req = ctx.jdKeyRequirements[0];
    hints.push({ id: "m_confident_jd", type: "meta", icon: "✓", text: `You sound confident — this maps to "${req}" from the JD. Emphasize it.`, priority: 4, color: "green", createdAt: now });
  }

  if (ctx.currentEmotion === "FEAR" && ctx.partialTranscript.length > 50) {
    const hasHedge = /i think maybe|i guess|sort of|kind of|probably/i.test(ctx.partialTranscript);
    if (hasHedge) {
      hints.push({ id: "m_hedging", type: "meta", icon: "⚡", text: "You're hedging ('I think maybe...'). Replace with 'I decided to...' — own it.", priority: 8, color: "amber", createdAt: now });
    }
  }

  return hints;
}

export function generateContentHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];
  const now = Date.now();
  const text = ctx.partialTranscript.toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (ctx.questionCategory === "behavioral" || ctx.questionCategory === "leadership" || ctx.questionCategory === "situational") {
    if (wordCount > 15 && wordCount < 40 && !/(then i|so i|i decided|my action|what i did)/i.test(text)) {
      hints.push({ id: "c_star_action", type: "content", icon: "💡", text: "STAR: Good situation setup. Now describe YOUR specific action.", priority: 6, color: "blue", createdAt: now });
    }
    if (wordCount > 40 && !/(result|outcome|impact|improved|increased|reduced|saved|achieved)/i.test(text)) {
      hints.push({ id: "c_star_result", type: "content", icon: "💡", text: "Don't forget the Result — quantify: numbers, percentages, outcomes.", priority: 7, color: "blue", createdAt: now });
    }
  }

  if (ctx.questionCategory === "closing" && wordCount > 10 && !/(company|team|mission|product|culture|excited)/i.test(text)) {
    hints.push({ id: "c_why_company", type: "content", icon: "💡", text: "Mention something specific about the company — shows research.", priority: 6, color: "blue", createdAt: now });
  }

  if (wordCount > 20 && !/(we|my team|i led|collaborated|worked with)/i.test(text) && (ctx.questionCategory === "leadership" || ctx.questionCategory === "behavioral")) {
    if (!/(i built|i designed|i wrote|i implemented|i created)/i.test(text)) {
      hints.push({ id: "c_specific", type: "content", icon: "💡", text: "Add a specific example — names, numbers, or concrete outcomes.", priority: 5, color: "blue", createdAt: now });
    }
  }

  return hints;
}

export function pickTopHints(allHints: Hint[], maxCount: number = 2): Hint[] {
  const now = Date.now();

  const eligible = allHints.filter((h) => {
    if (shownHintIds.has(h.id) && h.color !== "red") return false;
    return true;
  });

  eligible.sort((a, b) => b.priority - a.priority);

  const picked: Hint[] = [];
  const seenTypes = new Set<string>();

  for (const hint of eligible) {
    if (picked.length >= maxCount) break;

    if (seenTypes.has(hint.type) && hint.type !== "meta") continue;

    if (now - lastHintTime < MIN_INTERVAL_MS && hint.priority < 8) continue;

    picked.push(hint);
    shownHintIds.add(hint.id);
    seenTypes.add(hint.type);
  }

  if (picked.length > 0) lastHintTime = now;
  return picked;
}
