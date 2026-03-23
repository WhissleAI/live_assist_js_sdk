const FILLER_PATTERNS = /\b(um|uh|umm|uhh|er|ah|like|you know|i mean|sort of|kind of|basically|actually|literally|right)\b/gi;

export function countFillers(text: string): { count: number; fillers: Record<string, number> } {
  const fillers: Record<string, number> = {};
  let count = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(FILLER_PATTERNS.source, "gi");
  while ((match = regex.exec(text)) !== null) {
    const word = match[0].toLowerCase();
    fillers[word] = (fillers[word] ?? 0) + 1;
    count++;
  }

  return { count, fillers };
}

/**
 * Highlights filler words in transcript text by wrapping them in <mark> tags.
 */
export function highlightFillers(text: string): string {
  return text.replace(
    new RegExp(FILLER_PATTERNS.source, "gi"),
    (match) => `<mark class="filler-highlight">${match}</mark>`,
  );
}
