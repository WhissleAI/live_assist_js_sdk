import type { WordTimestamp } from "@whissle/live-assist-core";
import { ANIMAL_SUBCATEGORIES, VEGETABLE_LIST } from "../stimuli/fluency-categories";

function normalize(w: string): string {
  let n = w.toLowerCase().replace(/[.,!?;:'"]/g, "");
  if (n.endsWith("es") && n.length > 4) n = n.slice(0, -2);
  else if (n.endsWith("s") && n.length > 3) n = n.slice(0, -1);
  return n;
}

function isDuplicate(word: string, seen: string[]): boolean {
  const nw = normalize(word);
  return seen.some((s) => normalize(s) === nw);
}

function findSubcategory(word: string): string | null {
  const nw = normalize(word);
  for (const [cat, members] of Object.entries(ANIMAL_SUBCATEGORIES)) {
    if (members.some((m) => m.toLowerCase() === nw)) return cat;
  }
  return null;
}

export interface FluencyResult {
  total_correct: number;
  perseverations: { word: string; time: number }[];
  intrusions: { word: string; time: number }[];
  clusters: { subcategory: string | null; words: string[]; size: number }[];
  n_switches: number;
  mean_cluster_size: number;
  time_bins: [number, number, number, number];
  correct_words: { word: string; time: number; subcategory: string | null }[];
}

export function scoreCategoryFluency(
  words: WordTimestamp[],
  category: "animals" | "vegetables",
  durationSec = 60,
): FluencyResult {
  const validSet = category === "vegetables"
    ? new Set(VEGETABLE_LIST.map((v) => normalize(v)))
    : null;

  const content = words.filter((w) => !w.filler);
  const correct: FluencyResult["correct_words"] = [];
  const perseverations: FluencyResult["perseverations"] = [];
  const intrusions: FluencyResult["intrusions"] = [];
  const seenCorrect: string[] = [];

  for (const w of content) {
    const nw = normalize(w.word);
    if (isDuplicate(w.word, seenCorrect)) {
      perseverations.push({ word: w.word, time: w.start });
      continue;
    }
    if (category === "animals") {
      const sc = findSubcategory(w.word);
      if (!sc) { intrusions.push({ word: w.word, time: w.start }); continue; }
      seenCorrect.push(w.word);
      correct.push({ word: w.word, time: w.start, subcategory: sc });
    } else {
      if (validSet && !validSet.has(nw)) { intrusions.push({ word: w.word, time: w.start }); continue; }
      seenCorrect.push(w.word);
      correct.push({ word: w.word, time: w.start, subcategory: null });
    }
  }

  // Clustering
  const clusters: FluencyResult["clusters"] = [];
  let curCluster: string[] = [];
  let curSub: string | null = null;
  let switches = 0;

  for (const item of correct) {
    if (item.subcategory !== curSub) {
      if (curCluster.length) clusters.push({ subcategory: curSub, words: [...curCluster], size: curCluster.length });
      curCluster = [item.word];
      curSub = item.subcategory;
      switches++;
    } else {
      curCluster.push(item.word);
    }
  }
  if (curCluster.length) clusters.push({ subcategory: curSub, words: [...curCluster], size: curCluster.length });

  const sizes = clusters.map((c) => c.size);
  const meanCluster = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;

  const binSize = durationSec / 4;
  const bins: [number, number, number, number] = [0, 0, 0, 0];
  for (const item of correct) {
    const idx = Math.min(3, Math.floor(item.time / binSize));
    bins[idx]++;
  }

  return {
    total_correct: correct.length,
    perseverations,
    intrusions,
    clusters,
    n_switches: Math.max(0, switches - 1),
    mean_cluster_size: Math.round(meanCluster * 100) / 100,
    time_bins: bins,
    correct_words: correct,
  };
}

export function scoreLetterFluency(
  words: WordTimestamp[],
  letter: string,
  durationSec = 60,
): Omit<FluencyResult, "clusters" | "n_switches" | "mean_cluster_size"> {
  const l = letter.toLowerCase();
  const content = words.filter((w) => !w.filler);
  const correct: { word: string; time: number; subcategory: null }[] = [];
  const perseverations: { word: string; time: number }[] = [];
  const intrusions: { word: string; time: number }[] = [];
  const seen: string[] = [];

  for (const w of content) {
    if (isDuplicate(w.word, seen)) { perseverations.push({ word: w.word, time: w.start }); continue; }
    if (!normalize(w.word).startsWith(l)) { intrusions.push({ word: w.word, time: w.start }); continue; }
    seen.push(w.word);
    correct.push({ word: w.word, time: w.start, subcategory: null });
  }

  const binSize = durationSec / 4;
  const bins: [number, number, number, number] = [0, 0, 0, 0];
  for (const item of correct) {
    bins[Math.min(3, Math.floor(item.time / binSize))]++;
  }

  return { total_correct: correct.length, perseverations, intrusions, time_bins: bins, correct_words: correct };
}
