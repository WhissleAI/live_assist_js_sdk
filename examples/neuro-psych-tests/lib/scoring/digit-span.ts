const WORD_TO_DIGIT: Record<string, number> = {
  zero: 0, oh: 0, o: 0,
  one: 1, won: 1,
  two: 2, to: 2, too: 2,
  three: 3,
  four: 4, for: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8, ate: 8,
  nine: 9,
};

export function wordToDigit(word: string): number | null {
  const w = word.toLowerCase().replace(/[.,!?;:'"]/g, "");
  if (w in WORD_TO_DIGIT) return WORD_TO_DIGIT[w];
  if (/^\d$/.test(w)) return parseInt(w, 10);
  return null;
}

export function normalizeDigitResponse(words: string[]): number[] {
  return words.map(wordToDigit).filter((d): d is number => d !== null);
}

export interface DigitSpanResult {
  correct: boolean;
  response_digits: number[];
  target: number[];
  direction: "forward" | "backward";
  span_length: number;
  errors: { position: number; expected: number | null; got: number | null }[];
}

export function scoreDigitSpan(
  responseWords: string[],
  target: number[],
  direction: "forward" | "backward" = "forward",
): DigitSpanResult {
  const digits = normalizeDigitResponse(responseWords);
  const expected = direction === "backward" ? [...target].reverse() : [...target];
  const correct = digits.length === expected.length && digits.every((d, i) => d === expected[i]);

  const errors: DigitSpanResult["errors"] = [];
  const len = Math.max(digits.length, expected.length);
  for (let i = 0; i < len; i++) {
    const got = i < digits.length ? digits[i] : null;
    const exp = i < expected.length ? expected[i] : null;
    if (got !== exp) errors.push({ position: i, expected: exp, got });
  }

  return { correct, response_digits: digits, target: expected, direction, span_length: target.length, errors };
}
