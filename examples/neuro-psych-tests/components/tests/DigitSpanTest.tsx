import React, { useState } from "react";
import type { PatientDemographics, TestResult } from "../../lib/types";
import { useTestAdministration } from "../../hooks/useTestAdministration";
import { DIGIT_SPAN_FORWARD, DIGIT_SPAN_BACKWARD } from "../../lib/stimuli/digit-sequences";
import TestShell from "../TestShell";

interface Props {
  testType: "digit_span_forward" | "digit_span_backward";
  patient: PatientDemographics;
  onComplete: (result: TestResult) => void;
  testIndex: number;
  totalTests: number;
}

export default function DigitSpanTest({ testType, patient, onComplete, testIndex, totalTests }: Props) {
  const admin = useTestAdministration(testType, patient);
  const isForward = testType === "digit_span_forward";
  const trials = isForward ? DIGIT_SPAN_FORWARD : DIGIT_SPAN_BACKWARD;
  const [currentTrialIdx, setCurrentTrialIdx] = useState(0);

  const currentTrial = trials[currentTrialIdx];

  const handleScore = async () => {
    const result = await admin.requestScoring();
    onComplete(result);
  };

  return (
    <TestShell
      config={admin.config}
      isRecording={admin.isRecording}
      elapsedSec={admin.elapsedSec}
      wordCount={admin.wordCount}
      words={admin.words}
      transcript={admin.transcript}
      onStart={admin.startRecording}
      onStop={admin.stopRecording}
      onScore={handleScore}
      testIndex={testIndex}
      totalTests={totalTests}
    >
      <div className="card">
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8 }}>
            {isForward ? "Forward" : "Backward"} &middot; Length {currentTrial.length} &middot; Trial {currentTrial.trial}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 12 }}>
            Examiner: Read these digits aloud (1 per second)
          </div>
          <div style={{ fontSize: "2.5rem", fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.3em", color: "var(--accent)" }}>
            {currentTrial.sequence.join("  ")}
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={currentTrialIdx === 0}
              onClick={() => setCurrentTrialIdx((i) => i - 1)}
            >
              Previous
            </button>
            <span style={{ padding: "6px 12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {currentTrialIdx + 1} / {trials.length}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={currentTrialIdx >= trials.length - 1}
              onClick={() => setCurrentTrialIdx((i) => i + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </TestShell>
  );
}
