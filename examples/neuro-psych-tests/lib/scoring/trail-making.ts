import type { WordTimestamp } from "@whissle/live-assist-core";
import { TMT_A_SEQUENCE, TMT_B_SEQUENCE } from "../stimuli/trail-sequences";

const WORD_TO_NUMBER: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", "twenty-one": "21", "twenty-two": "22",
  "twenty-three": "23", "twenty-four": "24", "twenty-five": "25",
};

function normalizeItem(word: string): string {
  const w = word.toLowerCase().replace(/[.,!?;:'"]/g, "");
  if (w in WORD_TO_NUMBER) return WORD_TO_NUMBER[w];
  if (/^\d+$/.test(w)) return w;
  if (w.length === 1 && /[a-z]/.test(w)) return w.toUpperCase();
  return w.toUpperCase();
}

export interface TrailMakingResult {
  completion_time_sec: number;
  errors: { item: string; time: number; type: string; expected: string | null }[];
  self_corrections: { item: string; time: number }[];
  sequence_produced: string[];
  correct_items: number;
  total_expected: number;
}

export function scoreTrailMaking(
  words: WordTimestamp[],
  variant: "A" | "B",
): TrailMakingResult {
  const expected = variant === "A" ? TMT_A_SEQUENCE : TMT_B_SEQUENCE;
  const content = words.filter((w) => !w.filler);

  if (!content.length) {
    return { completion_time_sec: 0, errors: [], self_corrections: [], sequence_produced: [], correct_items: 0, total_expected: expected.length };
  }

  const normalized = content.map((w) => ({ item: normalizeItem(w.word), time: w.start, original: w.word }));
  const completionTime = (content[content.length - 1].end || content[content.length - 1].start) - content[0].start;

  const errors: TrailMakingResult["errors"] = [];
  const selfCorrections: TrailMakingResult["self_corrections"] = [];
  const produced: string[] = [];
  let expIdx = 0;
  let correctItems = 0;
  const seen = new Set<string>();

  for (const n of normalized) {
    produced.push(n.item);
    if (seen.has(n.item)) {
      errors.push({ item: n.item, time: n.time, type: "perseveration", expected: expected[expIdx] || null });
      continue;
    }
    if (expIdx < expected.length && n.item === expected[expIdx]) {
      correctItems++;
      seen.add(n.item);
      expIdx++;
    } else if (expIdx > 0 && n.item === expected[expIdx - 1]) {
      selfCorrections.push({ item: n.item, time: n.time });
    } else {
      errors.push({ item: n.item, time: n.time, type: "sequencing", expected: expected[expIdx] || null });
    }
  }

  return {
    completion_time_sec: Math.round(completionTime * 1000) / 1000,
    errors,
    self_corrections: selfCorrections,
    sequence_produced: produced,
    correct_items: correctItems,
    total_expected: expected.length,
  };
}
