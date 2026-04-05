import type { PriorStatementChunk, Discrepancy, Severity } from "./types";
import { extractKeywords } from "./case-parser";

const NEGATION_PATTERNS = [
  /\bI\s+(?:never|didn['']?t|did\s+not|don['']?t|do\s+not)\b/i,
  /\b(?:that['']?s\s+not|no,?\s+I)\b/i,
  /\bI\s+(?:wasn['']?t|was\s+not)\b/i,
  /\bnot\s+(?:true|correct|right|accurate)\b/i,
  /\bI\s+don['']?t\s+(?:recall|remember|know)\b/i,
];

const TIME_PATTERN = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|midnight|noon|morning|afternoon|evening|night)\b/gi;
const NUMBER_PATTERN = /\b(\d+(?:\.\d+)?)\b/g;
const LOCATION_WORDS = /\b(?:at|in|on|near|outside|inside|behind|front\s+of)\s+(?:the\s+)?(\w+(?:\s+\w+)?)\b/gi;

let contradictionCounter = 0;

/**
 * Fast client-side contradiction detection.
 * Compares a witness statement against indexed prior statement chunks.
 * Uses keyword overlap + negation/value mismatch heuristics.
 */
export function detectContradictions(
  witnessText: string,
  timestamp: number,
  priorChunks: PriorStatementChunk[],
): Discrepancy[] {
  if (!witnessText.trim() || priorChunks.length === 0) return [];

  const results: Discrepancy[] = [];
  const witnessKeywords = new Set(extractKeywords(witnessText));
  const witnessLower = witnessText.toLowerCase();

  const hasNegation = NEGATION_PATTERNS.some((p) => p.test(witnessText));
  const witnessTimes = extractValues(witnessText, TIME_PATTERN);
  const witnessNumbers = extractValues(witnessText, NUMBER_PATTERN);

  for (const chunk of priorChunks) {
    const overlap = chunk.keywords.filter((k) => witnessKeywords.has(k));
    const overlapRatio = overlap.length / Math.max(1, Math.min(witnessKeywords.size, chunk.keywords.length));

    if (overlapRatio < 0.15) continue;

    let score = overlapRatio;
    let analysis = "";

    if (hasNegation && overlapRatio > 0.2) {
      score += 0.3;
      analysis = "Witness used negation language about a topic covered in prior statements. ";
    }

    const priorTimes = extractValues(chunk.text, TIME_PATTERN);
    const timeMismatch = findMismatch(witnessTimes, priorTimes);
    if (timeMismatch) {
      score += 0.25;
      analysis += `Time discrepancy: testimony says "${timeMismatch.current}" vs prior "${timeMismatch.prior}". `;
    }

    const priorNumbers = extractValues(chunk.text, NUMBER_PATTERN);
    const numberMismatch = findMismatch(witnessNumbers, priorNumbers);
    if (numberMismatch) {
      score += 0.2;
      analysis += `Numeric discrepancy: "${numberMismatch.current}" vs prior "${numberMismatch.prior}". `;
    }

    const witnessLocations = extractLocations(witnessLower);
    const priorLocations = extractLocations(chunk.text.toLowerCase());
    if (witnessLocations.length > 0 && priorLocations.length > 0) {
      const locationOverlap = witnessLocations.some((wl) =>
        priorLocations.some((pl) => wl !== pl && sharesTopic(wl, pl, overlap)),
      );
      if (locationOverlap) {
        score += 0.2;
        analysis += "Possible location discrepancy with prior statement. ";
      }
    }

    if (score < 0.35) continue;

    const severity: Severity = score > 0.6 ? "HIGH" : score > 0.45 ? "MEDIUM" : "LOW";
    const currentQuote = witnessText.length > 200
      ? witnessText.slice(0, 200) + "..."
      : witnessText;
    const priorQuote = chunk.text.length > 200
      ? chunk.text.slice(0, 200) + "..."
      : chunk.text;
    const sourceRef = chunk.pageRef
      ? `${chunk.sourceTitle}, ${chunk.pageRef}`
      : chunk.sourceTitle;

    results.push({
      id: `cd_${contradictionCounter++}`,
      severity,
      summary: analysis.trim() || `Potential inconsistency with ${sourceRef} (topic overlap: ${overlap.slice(0, 5).join(", ")})`,
      currentQuote,
      currentTimestamp: timestamp,
      priorQuote,
      priorSource: sourceRef,
      analysis: analysis.trim() || `Significant topic overlap with different details detected.`,
      impeachmentSuggestion: `Direct witness to ${sourceRef} and ask to explain the discrepancy.`,
      source: "client",
    });
  }

  return results.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 3);
}

function extractValues(text: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  const p = new RegExp(pattern.source, pattern.flags);
  while ((m = p.exec(text)) !== null) {
    matches.push(m[1] ?? m[0]);
  }
  return matches;
}

function extractLocations(text: string): string[] {
  const locs: string[] = [];
  let m: RegExpExecArray | null;
  const p = new RegExp(LOCATION_WORDS.source, LOCATION_WORDS.flags);
  while ((m = p.exec(text)) !== null) {
    if (m[1]) locs.push(m[1].toLowerCase().trim());
  }
  return locs;
}

function findMismatch(
  current: string[],
  prior: string[],
): { current: string; prior: string } | null {
  if (current.length === 0 || prior.length === 0) return null;
  for (const c of current) {
    for (const p of prior) {
      if (c.toLowerCase() !== p.toLowerCase()) {
        return { current: c, prior: p };
      }
    }
  }
  return null;
}

function sharesTopic(a: string, b: string, overlap: string[]): boolean {
  return overlap.length >= 2;
}

function severityRank(s: Severity): number {
  return s === "HIGH" ? 3 : s === "MEDIUM" ? 2 : 1;
}

export function resetContradictionCounter(): void {
  contradictionCounter = 0;
}

/**
 * Parse structured contradiction blocks from agent feedback text.
 * Looks for lines starting with "CONTRADICTION:" and extracts structured data.
 */
export function parseAgentContradictions(feedbackText: string): Discrepancy[] {
  const results: Discrepancy[] = [];
  const lines = feedbackText.split("\n");

  for (const line of lines) {
    const match = line.match(
      /^CONTRADICTION:\s*"([^"]+)"\s*\|\s*(HIGH|MEDIUM|LOW)\s*\|\s*(.+)/i,
    );
    if (match) {
      const [, topic, severity, rest] = match;
      results.push({
        id: `acd_${contradictionCounter++}`,
        severity: severity as Severity,
        summary: `Contradiction regarding: ${topic}`,
        currentQuote: "",
        currentTimestamp: Date.now(),
        priorQuote: "",
        priorSource: "",
        analysis: rest.trim(),
        impeachmentSuggestion: "",
        source: "agent",
      });
    }
  }

  return results;
}

/**
 * Strip CONTRADICTION: and OBJECTION: lines from feedback text
 * so the clean summary can be displayed.
 */
export function cleanFeedbackText(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.match(/^(?:CONTRADICTION|OBJECTION):/i))
    .join("\n")
    .trim();
}
