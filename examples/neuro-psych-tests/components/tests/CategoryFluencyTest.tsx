import React from "react";
import type { PatientDemographics, TestResult } from "../../lib/types";
import { useTestAdministration } from "../../hooks/useTestAdministration";
import TestShell from "../TestShell";
import FluencyTimeline from "../monitoring/FluencyTimeline";
import PauseHeatmap from "../monitoring/PauseHeatmap";

interface Props {
  testType: "category_fluency_animals" | "category_fluency_vegetables";
  patient: PatientDemographics;
  onComplete: (result: TestResult) => void;
  testIndex: number;
  totalTests: number;
}

export default function CategoryFluencyTest({ testType, patient, onComplete, testIndex, totalTests }: Props) {
  const admin = useTestAdministration(testType, patient);
  const category = testType.includes("animals") ? "Animals" : "Vegetables";

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
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)" }}>{category}</div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginTop: 4 }}>60-second trial</div>
      </div>

      {admin.isRecording && (
        <>
          <FluencyTimeline words={admin.words} durationSec={60} />
          <PauseHeatmap pauses={admin.pauses} durationSec={admin.elapsedSec || 60} />
        </>
      )}
    </TestShell>
  );
}
