import type { TestResult } from "../types";

const FIELD_MAP: Record<string, string> = {
  craft_story_immediate: "CRAFTVRS",
  craft_story_delayed: "CRAFTDVR",
  category_fluency_animals: "ANIMALS",
  category_fluency_vegetables: "VEG",
  letter_fluency_f: "TRATEFLU",
  letter_fluency_l: "TRATELFL",
  digit_span_forward: "DIGFORCT",
  digit_span_backward: "DIGBACCT",
  trail_making_a: "TRATEFLA",
  trail_making_b: "TRATEFLB",
  naming: "MINTTOTS",
};

const HEADER_FIELDS = [
  "NACCID", "VISITDATE", "FORMVER",
  "CRAFTVRS", "CRAFTDVR",
  "ANIMALS", "VEG",
  "TRATEFLU", "TRATELFL",
  "DIGFORCT", "DIGBACCT",
  "TRATEFLA", "TRATEFLB",
  "MINTTOTS",
];

function extractRawScore(result: TestResult): string {
  if (!result.normative?.raw_score && result.normative?.raw_score !== 0) return "";
  return String(result.normative.raw_score);
}

export function generateNaccCSV(
  results: TestResult[],
  patientId = "",
  visitDate = "",
): string {
  const fields: Record<string, string> = {
    NACCID: patientId,
    VISITDATE: visitDate || new Date().toISOString().split("T")[0],
    FORMVER: "3.2",
  };

  for (const result of results) {
    const code = FIELD_MAP[result.test_type];
    if (code) {
      fields[code] = extractRawScore(result);
    }
  }

  const header = HEADER_FIELDS.join(",");
  const row = HEADER_FIELDS.map((h) => fields[h] || "").join(",");
  return `${header}\n${row}\n`;
}

export function downloadNaccCSV(
  results: TestResult[],
  patientId = "",
  visitDate = "",
): void {
  const csv = generateNaccCSV(results, patientId, visitDate);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nacc_uds_c2_${visitDate || new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
