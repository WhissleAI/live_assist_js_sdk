import type { WordTimestamp, PauseEvent, SpeechRate } from "@whissle/live-assist-core";

export interface PatientDemographics {
  age: number;
  education_years: number;
  sex: "male" | "female" | "other";
  handedness: "right" | "left" | "ambidextrous";
  primary_language: string;
  race_ethnicity: string;
  diagnosis: string;
  clinician_id: string;
}

export type TestType =
  | "craft_story_immediate"
  | "craft_story_delayed"
  | "category_fluency_animals"
  | "category_fluency_vegetables"
  | "letter_fluency_f"
  | "letter_fluency_l"
  | "digit_span_forward"
  | "digit_span_backward"
  | "trail_making_a"
  | "trail_making_b"
  | "naming";

export interface TestConfig {
  type: TestType;
  label: string;
  domain: CognitiveDomain;
  duration_sec: number | null;
  instructions: string;
  neuropsych_mode: string;
  has_delayed: boolean;
}

export type CognitiveDomain = "memory" | "language" | "executive" | "attention" | "visuospatial";

export interface TestResult {
  test_type: TestType;
  started_at: number;
  completed_at: number;
  raw_transcript: string;
  words: WordTimestamp[];
  pauses: PauseEvent[];
  speech_rate: SpeechRate | null;
  iwi: number[];
  scoring: Record<string, any>;
  normative: NormativeResult | null;
  analysis: string;
  validity: ValidityIndicators;
  trial?: number;
}

export interface NormativeResult {
  test: string;
  raw_score: number;
  z_score: number | null;
  classification: string;
  normative_mean: number | null;
  normative_sd: number | null;
  percentile: number | null;
  age: number;
  education_years: number;
}

export interface ValidityIndicators {
  effort_adequate: boolean;
  comprehension_adequate: boolean;
  filler_rate: number;
  speech_rate_wpm: number;
  test_completed: boolean;
}

export interface DomainScore {
  domain: CognitiveDomain;
  z_scores: number[];
  composite_z: number;
  classification: string;
  tests: string[];
}

export interface NeuroPsychSession {
  id: string;
  patient: PatientDemographics;
  battery: TestType[];
  results: TestResult[];
  domain_scores: DomainScore[];
  started_at: number;
  completed_at: number | null;
  examiner_notes: string;
}

export type SessionPhase =
  | "intake"
  | "battery"
  | "testing"
  | "delay"
  | "scoring"
  | "report";

export const TEST_CONFIGS: Record<TestType, TestConfig> = {
  craft_story_immediate: {
    type: "craft_story_immediate",
    label: "Craft Story 21 — Immediate Recall",
    domain: "memory",
    duration_sec: null,
    instructions: "I am going to read you a short story. Listen carefully and when I am done, tell me as much of the story as you can remember.",
    neuropsych_mode: "craft_story",
    has_delayed: true,
  },
  craft_story_delayed: {
    type: "craft_story_delayed",
    label: "Craft Story 21 — Delayed Recall",
    domain: "memory",
    duration_sec: null,
    instructions: "Earlier I read you a short story. Tell me as much of that story as you can remember now.",
    neuropsych_mode: "craft_story",
    has_delayed: false,
  },
  category_fluency_animals: {
    type: "category_fluency_animals",
    label: "Category Fluency — Animals",
    domain: "language",
    duration_sec: 60,
    instructions: "Tell me as many animals as you can think of. You have 60 seconds. Ready? Go.",
    neuropsych_mode: "category_fluency_animals",
    has_delayed: false,
  },
  category_fluency_vegetables: {
    type: "category_fluency_vegetables",
    label: "Category Fluency — Vegetables",
    domain: "language",
    duration_sec: 60,
    instructions: "Tell me as many vegetables as you can think of. You have 60 seconds. Ready? Go.",
    neuropsych_mode: "category_fluency_vegetables",
    has_delayed: false,
  },
  letter_fluency_f: {
    type: "letter_fluency_f",
    label: "Letter Fluency — F",
    domain: "executive",
    duration_sec: 60,
    instructions: "Tell me as many words as you can that begin with the letter F. No proper names or numbers. You have 60 seconds.",
    neuropsych_mode: "letter_fluency_f",
    has_delayed: false,
  },
  letter_fluency_l: {
    type: "letter_fluency_l",
    label: "Letter Fluency — L",
    domain: "executive",
    duration_sec: 60,
    instructions: "Tell me as many words as you can that begin with the letter L. No proper names or numbers. You have 60 seconds.",
    neuropsych_mode: "letter_fluency_l",
    has_delayed: false,
  },
  digit_span_forward: {
    type: "digit_span_forward",
    label: "Number Span — Forward",
    domain: "attention",
    duration_sec: null,
    instructions: "I will say some numbers. After I finish, repeat them back to me in the same order.",
    neuropsych_mode: "digit_span",
    has_delayed: false,
  },
  digit_span_backward: {
    type: "digit_span_backward",
    label: "Number Span — Backward",
    domain: "attention",
    duration_sec: null,
    instructions: "I will say some numbers. After I finish, repeat them back to me in reverse order.",
    neuropsych_mode: "digit_span",
    has_delayed: false,
  },
  trail_making_a: {
    type: "trail_making_a",
    label: "Oral Trail Making — Part A",
    domain: "executive",
    duration_sec: null,
    instructions: "Count from 1 to 25 as quickly as you can.",
    neuropsych_mode: "trail_making",
    has_delayed: false,
  },
  trail_making_b: {
    type: "trail_making_b",
    label: "Oral Trail Making — Part B",
    domain: "executive",
    duration_sec: null,
    instructions: "Alternate between numbers and letters: 1-A-2-B-3-C and so on, as quickly as you can.",
    neuropsych_mode: "trail_making",
    has_delayed: false,
  },
  naming: {
    type: "naming",
    label: "Multilingual Naming Test (MINT)",
    domain: "language",
    duration_sec: null,
    instructions: "I will show you some pictures. Tell me what each one is called.",
    neuropsych_mode: "naming",
    has_delayed: false,
  },
};

export const BATTERY_PRESETS: Record<string, { label: string; tests: TestType[]; est_minutes: number }> = {
  full_uds3: {
    label: "Full UDS-3 Battery",
    tests: [
      "craft_story_immediate", "category_fluency_animals", "category_fluency_vegetables",
      "letter_fluency_f", "letter_fluency_l", "digit_span_forward", "digit_span_backward",
      "trail_making_a", "trail_making_b", "naming", "craft_story_delayed",
    ],
    est_minutes: 45,
  },
  memory_only: {
    label: "Memory Focus",
    tests: ["craft_story_immediate", "digit_span_forward", "digit_span_backward", "craft_story_delayed"],
    est_minutes: 15,
  },
  executive_only: {
    label: "Executive Function",
    tests: ["letter_fluency_f", "letter_fluency_l", "trail_making_a", "trail_making_b"],
    est_minutes: 12,
  },
  language_only: {
    label: "Language Battery",
    tests: ["category_fluency_animals", "category_fluency_vegetables", "naming"],
    est_minutes: 15,
  },
};
