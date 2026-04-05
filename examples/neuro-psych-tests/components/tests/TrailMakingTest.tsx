import React from "react";
import type { PatientDemographics, TestResult } from "../../lib/types";
import { useTestAdministration } from "../../hooks/useTestAdministration";
import { TMT_A_SEQUENCE, TMT_B_SEQUENCE } from "../../lib/stimuli/trail-sequences";
import TestShell from "../TestShell";

interface Props {
  testType: "trail_making_a" | "trail_making_b";
  patient: PatientDemographics;
  onComplete: (result: TestResult) => void;
  testIndex: number;
  totalTests: number;
}

export default function TrailMakingTest({ testType, patient, onComplete, testIndex, totalTests }: Props) {
  const admin = useTestAdministration(testType, patient);
  const isPartA = testType === "trail_making_a";
  const expected = isPartA ? TMT_A_SEQUENCE : TMT_B_SEQUENCE;

  const spokenCount = admin.words.filter((w) => !w.filler).length;

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
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Part {isPartA ? "A" : "B"} — {isPartA ? "Count 1 to 25" : "Alternate: 1-A-2-B-3-C..."}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {expected.map((item, i) => {
            const spoken = i < spokenCount;
            return (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  background: spoken ? "var(--accent)" : "var(--bg-surface-alt)",
                  color: spoken ? "white" : "var(--text-secondary)",
                  border: `1px solid ${spoken ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                {item}
              </span>
            );
          })}
        </div>
      </div>
    </TestShell>
  );
}
