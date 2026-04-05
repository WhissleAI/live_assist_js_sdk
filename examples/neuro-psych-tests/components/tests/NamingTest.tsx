import React, { useState } from "react";
import type { PatientDemographics, TestResult } from "../../lib/types";
import { useTestAdministration } from "../../hooks/useTestAdministration";
import { MINT_ITEMS } from "../../lib/stimuli/mint-items";
import TestShell from "../TestShell";

interface Props {
  patient: PatientDemographics;
  onComplete: (result: TestResult) => void;
  testIndex: number;
  totalTests: number;
}

export default function NamingTest({ patient, onComplete, testIndex, totalTests }: Props) {
  const admin = useTestAdministration("naming", patient);
  const [currentItem, setCurrentItem] = useState(0);
  const [cueLevel, setCueLevel] = useState<"none" | "semantic" | "phonemic">("none");

  const item = MINT_ITEMS[currentItem];

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
            Item {item.id} of {MINT_ITEMS.length}
          </div>
          <div style={{
            width: 200, height: 200, margin: "0 auto", borderRadius: "var(--radius-md)",
            background: "var(--bg-surface-alt)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "3rem",
          }}>
            🖼️
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
            (Show picture of <strong>{item.target}</strong> to patient)
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              className={`btn btn-sm ${cueLevel === "none" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setCueLevel("none")}
            >
              No Cue
            </button>
            <button
              className={`btn btn-sm ${cueLevel === "semantic" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setCueLevel("semantic")}
            >
              Semantic: "{item.semantic_cue}"
            </button>
            <button
              className={`btn btn-sm ${cueLevel === "phonemic" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setCueLevel("phonemic")}
            >
              Phonemic: "{item.phonemic_cue}..."
            </button>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn btn-secondary btn-sm" disabled={currentItem === 0} onClick={() => { setCurrentItem((i) => i - 1); setCueLevel("none"); }}>
              Previous
            </button>
            <button className="btn btn-secondary btn-sm" disabled={currentItem >= MINT_ITEMS.length - 1} onClick={() => { setCurrentItem((i) => i + 1); setCueLevel("none"); }}>
              Next Item
            </button>
          </div>
        </div>
      </div>
    </TestShell>
  );
}
