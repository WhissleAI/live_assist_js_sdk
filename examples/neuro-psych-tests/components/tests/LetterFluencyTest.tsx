import React from "react";
import type { PatientDemographics, TestResult } from "../../lib/types";
import { useTestAdministration } from "../../hooks/useTestAdministration";
import TestShell from "../TestShell";
import FluencyTimeline from "../monitoring/FluencyTimeline";

interface Props {
  testType: "letter_fluency_f" | "letter_fluency_l";
  patient: PatientDemographics;
  onComplete: (result: TestResult) => void;
  testIndex: number;
  totalTests: number;
}

export default function LetterFluencyTest({ testType, patient, onComplete, testIndex, totalTests }: Props) {
  const admin = useTestAdministration(testType, patient);
  const letter = testType.split("_").pop()!.toUpperCase();

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
        <div style={{ fontSize: "4rem", fontWeight: 800, color: "var(--accent)", fontFamily: "var(--font-mono)" }}>{letter}</div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginTop: 4 }}>
          Words beginning with "{letter}" &middot; 60 seconds &middot; No proper nouns
        </div>
      </div>

      {admin.isRecording && <FluencyTimeline words={admin.words} durationSec={60} />}
    </TestShell>
  );
}
