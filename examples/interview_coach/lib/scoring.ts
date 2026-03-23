export interface DeliveryMetrics {
  confidence: number;
  assertiveness: number;
  energy: number;
  overall: number;
  fillerCount: number;
  avgPaceWPM: number;
  durationSec: number;
}

export interface AnswerScore {
  questionIndex: number;
  questionText: string;
  questionCategory: string;
  answerText: string;
  contentScore: number;
  structure: string;
  strengths: string[];
  improvements: string[];
  delivery: DeliveryMetrics;
  emotionTimeline: Array<{ offset: number; emotion: string; confidence: number }>;
  jdGapsAddressed: string[];
  keyMoments: string[];
  whatInterviewerThinks: string;
  problematicQuote: string;
  suggestedReframe: string;
  behavioralNarrative: string[];
  fillerBreakdown: Record<string, number>;
}

export function computeDeliveryMetrics(
  emotionProbs: Array<{ emotion: string; prob: number }>,
  intentLabels: string[],
  fillerCount: number,
  paceReadings: number[],
  durationSec: number,
): DeliveryMetrics {
  let fearSadWeight = 0;
  let happySurpriseWeight = 0;
  let totalWeight = 0;

  for (const { emotion, prob } of emotionProbs) {
    totalWeight += prob;
    if (emotion === "FEAR" || emotion === "SAD") fearSadWeight += prob;
    if (emotion === "HAPPY" || emotion === "SURPRISE") happySurpriseWeight += prob;
  }

  const confidence = totalWeight > 0 ? Math.round((1 - fearSadWeight / totalWeight) * 100) : 50;

  let assertiveCount = 0;
  let passiveCount = 0;
  for (const intent of intentLabels) {
    if (intent === "INFORM" || intent === "STATEMENT" || intent === "COMMAND") assertiveCount++;
    else if (intent === "ACKNOWLEDGE") passiveCount++;
  }
  const totalIntents = assertiveCount + passiveCount;
  const assertiveness = totalIntents > 0 ? Math.round((assertiveCount / totalIntents) * 100) : 50;

  const energy = totalWeight > 0 ? Math.round((happySurpriseWeight / totalWeight) * 100 + 30) : 50;
  const clampedEnergy = Math.min(100, Math.max(0, energy));

  const avgPace = paceReadings.length > 0
    ? Math.round(paceReadings.reduce((a, b) => a + b, 0) / paceReadings.length)
    : 0;

  const fillerPenalty = Math.min(20, fillerCount * 3);
  const pacePenalty = avgPace > 180 ? Math.min(10, (avgPace - 180) * 0.5) : avgPace > 0 && avgPace < 90 ? Math.min(10, (90 - avgPace) * 0.5) : 0;
  const durationPenalty = durationSec > 120 ? Math.min(10, (durationSec - 120) * 0.2) : 0;

  const rawOverall = 0.5 * confidence + 0.3 * assertiveness + 0.2 * clampedEnergy;
  const overall = Math.max(0, Math.min(100, Math.round(rawOverall - fillerPenalty - pacePenalty - durationPenalty)));

  return { confidence, assertiveness, energy: clampedEnergy, overall, fillerCount, avgPaceWPM: avgPace, durationSec };
}

export function computeReadinessScore(answers: AnswerScore[]): number {
  if (answers.length === 0) return 0;
  const avgContent = answers.reduce((s, a) => s + a.contentScore, 0) / answers.length;
  const avgDelivery = answers.reduce((s, a) => s + a.delivery.overall, 0) / answers.length;
  return Math.round(0.6 * avgContent + 0.4 * avgDelivery);
}

/**
 * Generate human-readable behavioral observations for a single answer.
 * No abstract scores — just plain-language descriptions of what happened.
 */
export function generateBehavioralNarrative(
  delivery: DeliveryMetrics,
  emotionTimeline: Array<{ offset: number; emotion: string; confidence: number }>,
  fillerBreakdown: Record<string, number>,
  answerStartTime: number,
): string[] {
  const notes: string[] = [];

  if (delivery.confidence >= 80) {
    notes.push("Your voice projected confidence throughout this answer.");
  } else if (delivery.confidence >= 60) {
    notes.push("You sounded reasonably confident, with some moments of uncertainty.");
  } else if (delivery.confidence >= 40) {
    notes.push("Your voice conveyed noticeable uncertainty — interviewers pick up on this even when your words sound fine.");
  } else {
    notes.push("You sounded nervous here. Your vocal quality suggests low confidence, which undermines otherwise decent content.");
  }

  if (delivery.avgPaceWPM > 180) {
    notes.push(`You spoke at ${delivery.avgPaceWPM} WPM — noticeably fast. This signals anxiety. Aim for 130-160 WPM.`);
  } else if (delivery.avgPaceWPM > 0 && delivery.avgPaceWPM < 100) {
    notes.push(`Speaking pace was slow (${delivery.avgPaceWPM} WPM). This can sound hesitant. Pick up energy without rushing.`);
  } else if (delivery.avgPaceWPM >= 120 && delivery.avgPaceWPM <= 160) {
    notes.push("Your speaking pace was in the ideal range — natural and easy to follow.");
  }

  if (delivery.fillerCount > 5) {
    const topFillers = Object.entries(fillerBreakdown).sort(([, a], [, b]) => b - a).slice(0, 2);
    const fillerStr = topFillers.map(([w, c]) => `"${w}" (${c}x)`).join(", ");
    notes.push(`${delivery.fillerCount} filler words detected, mostly ${fillerStr}. Practice replacing these with brief pauses.`);
  } else if (delivery.fillerCount > 2) {
    notes.push(`${delivery.fillerCount} filler words — not distracting, but noticeable. Brief pauses sound more polished.`);
  }

  if (delivery.durationSec > 120) {
    notes.push(`Answer ran ${Math.round(delivery.durationSec)}s — interviewers expect 60-90s. You likely lost their attention in the second half.`);
  } else if (delivery.durationSec < 20 && delivery.durationSec > 0) {
    notes.push(`Very short answer (${Math.round(delivery.durationSec)}s). Interviewers may think you lack depth on this topic.`);
  }

  if (delivery.assertiveness < 35) {
    notes.push("Your tone was passive — too much agreeing, not enough asserting. Use 'I decided to...' instead of 'I think maybe...'");
  } else if (delivery.assertiveness > 75) {
    notes.push("Strong assertive tone — you owned your points well.");
  }

  const emotionShifts = detectEmotionShifts(emotionTimeline, answerStartTime);
  notes.push(...emotionShifts);

  return notes;
}

function formatTimestamp(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function detectEmotionShifts(
  timeline: Array<{ offset: number; emotion: string; confidence: number }>,
  startTime: number,
): string[] {
  const shifts: string[] = [];
  if (timeline.length < 4) return shifts;

  let nervousStart: number | null = null;
  for (let i = 1; i < timeline.length; i++) {
    const curr = timeline[i];
    const prev = timeline[i - 1];
    const sec = (curr.offset - startTime) / 1000;

    if ((curr.emotion === "FEAR" || curr.emotion === "SAD") && prev.emotion !== "FEAR" && prev.emotion !== "SAD" && curr.confidence > 0.35) {
      nervousStart = sec;
    }

    if (nervousStart !== null && curr.emotion !== "FEAR" && curr.emotion !== "SAD") {
      const duration = sec - nervousStart;
      if (duration > 2) {
        shifts.push(`Your voice wavered at ${formatTimestamp(nervousStart)} and took ${Math.round(duration)}s to recover. Practice this section.`);
      }
      nervousStart = null;
    }

    if (curr.emotion === "HAPPY" && curr.confidence > 0.6 && prev.emotion !== "HAPPY") {
      shifts.push(`At ${formatTimestamp(sec)} — genuine enthusiasm detected. This is your strongest moment in this answer.`);
    }
  }

  return shifts.slice(0, 3);
}

export function identifyKeyMoments(
  emotionTimeline: Array<{ offset: number; emotion: string; confidence: number }>,
  answerStartTime: number,
): string[] {
  const moments: string[] = [];
  if (emotionTimeline.length < 3) return moments;

  for (let i = 1; i < emotionTimeline.length; i++) {
    const prev = emotionTimeline[i - 1];
    const curr = emotionTimeline[i];
    const elapsedSec = (curr.offset - answerStartTime) / 1000;
    const ts = formatTimestamp(elapsedSec);

    if ((curr.emotion === "FEAR" || curr.emotion === "SAD") && prev.emotion !== "FEAR" && prev.emotion !== "SAD" && curr.confidence > 0.4) {
      moments.push(`At ${ts} — confidence dropped (${curr.emotion.toLowerCase()} detected)`);
    }
    if ((prev.emotion === "FEAR" || prev.emotion === "SAD") && curr.emotion !== "FEAR" && curr.emotion !== "SAD") {
      moments.push(`At ${ts} — recovered confidence`);
    }
    if (curr.emotion === "HAPPY" && curr.confidence > 0.6 && prev.emotion !== "HAPPY") {
      moments.push(`At ${ts} — strong positive energy`);
    }
  }

  return moments.slice(0, 4);
}

export function computeVerdict(answers: AnswerScore[]): { label: string; color: string } {
  const score = computeReadinessScore(answers);
  if (score >= 80) return { label: "Strong Hire", color: "var(--color-green)" };
  if (score >= 65) return { label: "Hire", color: "var(--color-green)" };
  if (score >= 50) return { label: "Lean Hire", color: "var(--color-amber)" };
  if (score >= 35) return { label: "Lean No Hire", color: "var(--color-amber)" };
  return { label: "No Hire", color: "var(--color-red)" };
}
