/* ---- Domain types for the Cross-Examination Analyst ---- */

export type Severity = "HIGH" | "MEDIUM" | "LOW";
export type ObjectionType =
  | "HEARSAY"
  | "SPECULATION"
  | "NON_RESPONSIVE"
  | "LEADING"
  | "NARRATIVE"
  | "ASSUMES_FACTS"
  | "RELEVANCE"
  | "COMPOUND";

export interface EvidenceRef {
  id: string;
  title: string;
  description?: string;
}

export interface PriorStatementChunk {
  id: string;
  sourceTitle: string;
  pageRef?: string;
  text: string;
  keywords: string[];
}

export interface CaseConfig {
  witnessName: string;
  caseNumber: string;
  caseTheory: string;
  priorStatements: string;
  evidenceRefs: EvidenceRef[];
  elements: ElementDef[];
  captureMode: "mic_only" | "dual_channel";
  asrUrl: string;
  agentUrl: string;
}

export interface ElementDef {
  id: string;
  title: string;
}

export interface ElementStatus {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
  confidence: number;
  sentiment: string;
  evidence: string;
}

export interface TranscriptSegment {
  id: string;
  channel: "mic" | "tab";
  speaker: "COUNSEL" | "WITNESS" | "UNKNOWN";
  text: string;
  isFinal: boolean;
  timestamp: number;
  audioOffset: number;
  emotion: string;
  emotionConfidence: number;
  intent: string;
  intentProbs: Array<{ token: string; probability: number }>;
  emotionProbs: Array<{ token: string; probability: number }>;
}

export interface QAPair {
  id: string;
  question: TranscriptSegment | null;
  answers: TranscriptSegment[];
  timestamp: number;
}

export interface Discrepancy {
  id: string;
  severity: Severity;
  summary: string;
  currentQuote: string;
  currentTimestamp: number;
  priorQuote: string;
  priorSource: string;
  analysis: string;
  impeachmentSuggestion: string;
  source: "client" | "agent";
}

export interface Objection {
  id: string;
  type: ObjectionType;
  legalBasis: string;
  triggerQuote: string;
  timestamp: number;
  segmentId: string;
}

export interface ExaminationState {
  isActive: boolean;
  isListening: boolean;

  segments: TranscriptSegment[];
  qaPairs: QAPair[];

  objections: Objection[];
  discrepancies: Discrepancy[];
  elements: ElementStatus[];

  witnessEmotion: string;
  witnessCredibility: number;
  witnessVocalStability: number;
  counselEmotion: string;

  keywords: string[];
  feedbackSummary: string;
  suggestions: string[];

  elapsedSec: number;
  error: string | null;
}
