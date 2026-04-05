import type { Objection, ObjectionType } from "./types";

interface ObjectionRule {
  pattern: RegExp;
  type: ObjectionType;
  basis: string;
}

const RULES: ObjectionRule[] = [
  // Hearsay — witness relaying out-of-court statements
  {
    pattern: /\b(?:he|she|they|someone|my\s+\w+)\s+(?:said|told|mentioned|stated|claimed|informed)\b/i,
    type: "HEARSAY",
    basis: "FRE 801/802 — Out-of-court statement offered for truth",
  },
  {
    pattern: /\bI\s+(?:was told|heard\s+(?:that|from)|learned\s+from)\b/i,
    type: "HEARSAY",
    basis: "FRE 801/802 — Out-of-court statement offered for truth",
  },
  {
    pattern: /\baccording\s+to\s+(?:him|her|them|someone)\b/i,
    type: "HEARSAY",
    basis: "FRE 801/802 — Out-of-court statement offered for truth",
  },

  // Speculation — witness guessing rather than testifying from personal knowledge
  {
    pattern: /\bI\s+(?:think|guess|suppose|assume|imagine|believe|suspect)\b/i,
    type: "SPECULATION",
    basis: "FRE 602 — Lack of personal knowledge",
  },
  {
    pattern: /\b(?:probably|maybe|perhaps|might\s+have|could\s+have\s+been)\b/i,
    type: "SPECULATION",
    basis: "FRE 602 — Speculation, not based on personal knowledge",
  },

  // Non-responsive — answer doesn't address the question
  {
    pattern: /\b(?:let\s+me\s+(?:explain|tell\s+you)|what\s+(?:I\s+really\s+)?(?:want|need)\s+to\s+say)\b/i,
    type: "NON_RESPONSIVE",
    basis: "Non-responsive — answer does not address the question asked",
  },

  // Narrative — witness rambling beyond scope
  {
    pattern: /\b(?:you\s+(?:see|know|have\s+to\s+understand),?\s+(?:back|when)\s+(?:in|I\s+was))\b/i,
    type: "NARRATIVE",
    basis: "Narrative — witness testifying beyond scope of the question",
  },

  // Assumes facts not in evidence
  {
    pattern: /\b(?:everyone\s+knows|obviously|clearly|as\s+we\s+all\s+know|it['']?s\s+common\s+knowledge)\b/i,
    type: "ASSUMES_FACTS",
    basis: "Assumes facts not in evidence",
  },
];

let objectionCounter = 0;

export function detectObjections(
  text: string,
  segmentId: string,
  timestamp: number,
  speaker: string,
): Objection[] {
  if (speaker !== "WITNESS") return [];

  const objections: Objection[] = [];
  const seen = new Set<ObjectionType>();

  for (const rule of RULES) {
    if (seen.has(rule.type)) continue;
    const match = text.match(rule.pattern);
    if (match) {
      seen.add(rule.type);
      const start = Math.max(0, match.index! - 20);
      const end = Math.min(text.length, match.index! + match[0].length + 30);
      const triggerQuote = (start > 0 ? "..." : "") +
        text.slice(start, end).trim() +
        (end < text.length ? "..." : "");

      objections.push({
        id: `obj_${objectionCounter++}`,
        type: rule.type,
        legalBasis: rule.basis,
        triggerQuote,
        timestamp,
        segmentId,
      });
    }
  }

  return objections;
}

export function resetObjectionCounter(): void {
  objectionCounter = 0;
}
