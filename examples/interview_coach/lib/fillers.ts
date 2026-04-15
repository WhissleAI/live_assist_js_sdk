/**
 * Filler word detection with context awareness.
 *
 * Words like "like", "actually", "right" are only fillers when used as
 * discourse markers, not when part of legitimate phrases.
 * - "um", "uh", "umm", "uhh", "er", "ah" — always fillers
 * - "like" — filler only when NOT preceded by a verb/adjective (e.g. "I like" is fine)
 * - "actually" — filler only at start of clause or after comma/pause
 * - "right" — filler only at end of clause ("we did that, right?")
 * - "you know", "i mean", "sort of", "kind of" — almost always fillers in speech
 * - "basically", "literally" — fillers as hedges
 */

// Always-filler patterns (no context needed)
const ALWAYS_FILLERS = /\b(um|uh|umm|uhh|er|ah|you know|i mean|basically|literally)\b/gi;

// Context-dependent filler patterns
const LIKE_FILLER = /(?<!\b(?:would|i|we|they|you|i'd|we'd|they'd|you'd|don't|didn't|do|does|really|also|just)\s)\blike\b(?!\s+(?:a|an|the|that|this|to|it|when|how|what|where|why))/gi;
const SORT_OF_FILLER = /\b(sort of|kind of)\b/gi;
const RIGHT_FILLER = /\bright\s*[?,.]?\s*$/gim;

function matchFillers(text: string): Array<{ word: string; index: number }> {
  const matches: Array<{ word: string; index: number }> = [];

  // Always fillers
  let m: RegExpExecArray | null;
  const r1 = new RegExp(ALWAYS_FILLERS.source, "gi");
  while ((m = r1.exec(text)) !== null) {
    matches.push({ word: m[0].toLowerCase(), index: m.index });
  }

  // Context-dependent "like"
  const r2 = new RegExp(LIKE_FILLER.source, "gi");
  while ((m = r2.exec(text)) !== null) {
    matches.push({ word: "like", index: m.index });
  }

  // sort of / kind of
  const r3 = new RegExp(SORT_OF_FILLER.source, "gi");
  while ((m = r3.exec(text)) !== null) {
    matches.push({ word: m[0].toLowerCase(), index: m.index });
  }

  // "right" as tag question (end of clause)
  const r4 = new RegExp(RIGHT_FILLER.source, "gim");
  while ((m = r4.exec(text)) !== null) {
    matches.push({ word: "right", index: m.index });
  }

  // Deduplicate by index
  const seen = new Set<number>();
  return matches.filter((m) => {
    if (seen.has(m.index)) return false;
    seen.add(m.index);
    return true;
  });
}

export function countFillers(text: string): { count: number; fillers: Record<string, number> } {
  const fillers: Record<string, number> = {};
  const matches = matchFillers(text);

  for (const { word } of matches) {
    fillers[word] = (fillers[word] ?? 0) + 1;
  }

  return { count: matches.length, fillers };
}

