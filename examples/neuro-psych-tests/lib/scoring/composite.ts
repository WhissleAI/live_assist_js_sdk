import type { CognitiveDomain, DomainScore, TestResult } from "../types";
import { classifyImpairment } from "./normative";

const DOMAIN_TESTS: Record<CognitiveDomain, string[]> = {
  memory: ["craft_story_immediate", "craft_story_delayed"],
  language: ["category_fluency_animals", "category_fluency_vegetables", "naming"],
  executive: ["letter_fluency_f", "letter_fluency_l", "trail_making_a", "trail_making_b"],
  attention: ["digit_span_forward", "digit_span_backward"],
  visuospatial: [],
};

export function computeDomainScores(results: TestResult[]): DomainScore[] {
  const domains: DomainScore[] = [];

  for (const [domain, testTypes] of Object.entries(DOMAIN_TESTS) as [CognitiveDomain, string[]][]) {
    const zScores: number[] = [];
    const tests: string[] = [];

    for (const tt of testTypes) {
      const res = results.find((r) => r.test_type === tt && r.normative?.z_score != null);
      if (res?.normative?.z_score != null) {
        zScores.push(res.normative.z_score);
        tests.push(tt);
      }
    }

    const compositeZ = zScores.length ? Math.round((zScores.reduce((a, b) => a + b, 0) / zScores.length) * 100) / 100 : 0;

    domains.push({
      domain,
      z_scores: zScores,
      composite_z: compositeZ,
      classification: zScores.length ? classifyImpairment(compositeZ) : "Insufficient data",
      tests,
    });
  }

  return domains;
}
