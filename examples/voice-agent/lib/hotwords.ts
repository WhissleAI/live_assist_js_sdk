import type { StructuredMenu } from "./documents";

const SKIP_WORDS = new Set([
  "the", "a", "an", "and", "or", "with", "of", "in", "on", "to", "for",
  "our", "your", "any", "all", "no", "not", "is", "are", "was", "it",
]);

const MAX_HOTWORDS = 200;

/**
 * Extract menu item names, bigrams, and meaningful unigrams
 * from a StructuredMenu for ASR hotword boosting.
 */
export function extractHotwords(menu: StructuredMenu): string[] {
  const words = new Set<string>();

  if (menu.restaurant_name) {
    words.add(menu.restaurant_name.toLowerCase());
  }

  for (const cat of menu.categories) {
    const catName = cat.name.toLowerCase().trim();
    if (catName.length > 2) words.add(catName);

    for (const item of cat.items) {
      const name = item.name.toLowerCase().trim();
      if (!name) continue;

      words.add(name);

      const tokens = name.split(/\s+/).filter(Boolean);
      for (let i = 0; i < tokens.length - 1; i++) {
        words.add(`${tokens[i]} ${tokens[i + 1]}`);
      }
      for (const t of tokens) {
        if (t.length > 2 && !SKIP_WORDS.has(t)) words.add(t);
      }
    }
  }

  const result = [...words];
  if (result.length > MAX_HOTWORDS) {
    return result.slice(0, MAX_HOTWORDS);
  }
  return result;
}
