import type { PriorStatementChunk } from "./types";

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "about", "it", "its",
  "this", "that", "and", "or", "but", "not", "so", "if", "then", "than",
  "we", "you", "he", "she", "they", "i", "me", "my", "your", "our",
  "what", "which", "who", "whom", "how", "when", "where", "why",
  "just", "also", "very", "really", "much", "many", "some", "any",
  "there", "here", "all", "each", "every", "both", "few", "more",
  "most", "other", "no", "yes", "said", "like", "well", "know",
]);

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  const seen = new Set<string>();
  return words.filter((w) => {
    if (STOP_WORDS.has(w) || seen.has(w)) return false;
    seen.add(w);
    return true;
  });
}

/**
 * Parse raw prior statement text into searchable chunks.
 * Splits on sentence boundaries, grouping into ~150-word chunks.
 * Detects page/line references like "Page 42:" or "[p.42]".
 */
export function parsePriorStatements(
  text: string,
  sourceTitle: string = "Prior Statement",
): PriorStatementChunk[] {
  if (!text.trim()) return [];

  const chunks: PriorStatementChunk[] = [];
  const lines = text.split(/\n+/).filter((l) => l.trim());
  let currentPage = "";
  let buffer = "";
  let chunkId = 0;

  for (const line of lines) {
    const pageMatch = line.match(
      /^(?:page|p\.?|pg\.?)\s*(\d+(?:[:-]\d+)?)/i,
    );
    if (pageMatch) {
      if (buffer.trim()) {
        chunks.push(makeChunk(chunkId++, sourceTitle, currentPage, buffer));
        buffer = "";
      }
      currentPage = `p.${pageMatch[1]}`;
      const rest = line.slice(pageMatch[0].length).replace(/^[:\s-]+/, "");
      if (rest.trim()) buffer += rest + " ";
      continue;
    }

    const inlinePageMatch = line.match(/\[p\.?(\d+(?:[:-]\d+)?)\]/i);
    if (inlinePageMatch) {
      currentPage = `p.${inlinePageMatch[1]}`;
    }

    buffer += line + " ";

    const wordCount = buffer.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 120) {
      chunks.push(makeChunk(chunkId++, sourceTitle, currentPage, buffer));
      buffer = "";
    }
  }

  if (buffer.trim()) {
    chunks.push(makeChunk(chunkId++, sourceTitle, currentPage, buffer));
  }

  return chunks;
}

function makeChunk(
  id: number,
  sourceTitle: string,
  pageRef: string,
  text: string,
): PriorStatementChunk {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return {
    id: `prior_${id}`,
    sourceTitle,
    pageRef: pageRef || undefined,
    text: cleaned,
    keywords: extractKeywords(cleaned),
  };
}

export { extractKeywords };
