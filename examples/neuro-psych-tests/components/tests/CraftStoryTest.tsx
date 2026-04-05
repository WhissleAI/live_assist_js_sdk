import React, { useState } from "react";
import { CRAFT_STORY_TEXT } from "../../lib/stimuli/craft-story";
import type { TestType, PatientDemographics, TestResult } from "../../lib/types";
import { useTestAdministration } from "../../hooks/useTestAdministration";
import TestShell from "../TestShell";

interface Props {
  testType: "craft_story_immediate" | "craft_story_delayed";
  patient: PatientDemographics;
  onComplete: (result: TestResult) => void;
  testIndex: number;
  totalTests: number;
}

export default function CraftStoryTest({ testType, patient, onComplete, testIndex, totalTests }: Props) {
  const admin = useTestAdministration(testType, patient);
  const [storyRead, setStoryRead] = useState(false);
  const isImmediate = testType === "craft_story_immediate";

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
      {isImmediate && !storyRead && (
        <div className="card" style={{ background: "var(--bg-accent-light)" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>Story (Read aloud to patient)</h3>
          <p style={{ fontSize: "1rem", lineHeight: 2, fontStyle: "italic" }}>{CRAFT_STORY_TEXT}</p>
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button className="btn btn-primary" onClick={() => setStoryRead(true)}>
              Story Read — Ready for Recall
            </button>
          </div>
        </div>
      )}

      {isImmediate && storyRead && !admin.isRecording && !admin.transcript && (
        <div className="card">
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            Story has been read. Click <strong>Start Recording</strong> to capture the patient's recall.
          </p>
        </div>
      )}

      {!isImmediate && !admin.isRecording && !admin.transcript && (
        <div className="card">
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>
            Ask the patient to recall the story from earlier. Click <strong>Start Recording</strong> to begin.
          </p>
        </div>
      )}
    </TestShell>
  );
}
