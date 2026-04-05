import React, { useState, useCallback } from "react";
import type { CaseConfig, ElementDef, EvidenceRef } from "../lib/types";
import { gatewayConfig } from "../lib/gateway-config";

interface Props {
  onDone: (config: CaseConfig) => void;
}

export default function CaseSetup({ onDone }: Props) {
  const [witnessName, setWitnessName] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTheory, setCaseTheory] = useState("");
  const [priorStatements, setPriorStatements] = useState("");
  const [captureMode, setCaptureMode] = useState<"mic_only" | "dual_channel">("mic_only");
  const [elements, setElements] = useState<ElementDef[]>([]);
  const [evidenceRefs, setEvidenceRefs] = useState<EvidenceRef[]>([]);
  const [newElement, setNewElement] = useState("");
  const [newEvTitle, setNewEvTitle] = useState("");
  const [newEvDesc, setNewEvDesc] = useState("");

  const addElement = useCallback(() => {
    const title = newElement.trim();
    if (!title) return;
    setElements((prev) => [...prev, { id: `el_${Date.now()}`, title }]);
    setNewElement("");
  }, [newElement]);

  const removeElement = useCallback((id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addEvidence = useCallback(() => {
    const title = newEvTitle.trim();
    if (!title) return;
    setEvidenceRefs((prev) => [
      ...prev,
      { id: `ev_${Date.now()}`, title, description: newEvDesc.trim() || undefined },
    ]);
    setNewEvTitle("");
    setNewEvDesc("");
  }, [newEvTitle, newEvDesc]);

  const removeEvidence = useCallback((id: string) => {
    setEvidenceRefs((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleStart = useCallback(() => {
    onDone({
      witnessName: witnessName.trim() || "Witness",
      caseNumber: caseNumber.trim(),
      caseTheory: caseTheory.trim(),
      priorStatements: priorStatements.trim(),
      evidenceRefs,
      elements,
      captureMode,
      asrUrl: gatewayConfig.asrStreamUrl,
      agentUrl: gatewayConfig.agentUrl,
    });
  }, [witnessName, caseNumber, caseTheory, priorStatements, evidenceRefs, elements, captureMode, onDone]);

  return (
    <div className="setup-root">
      <div className="setup-header">
        <div className="setup-logo">&#9878;</div>
        <h1 className="setup-title">Cross-Examination Analyst</h1>
        <p className="setup-subtitle">
          Real-time testimony analysis — contradictions, objections, and credibility tracking
        </p>
      </div>

      <div className="setup-body">
        <div className="setup-col">
          <label className="setup-label">Case Information</label>
          <div className="setup-row-pair">
            <input
              className="setup-input"
              placeholder="Witness name"
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
            />
            <input
              className="setup-input"
              placeholder="Case number (optional)"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
            />
          </div>

          <label className="setup-label" style={{ marginTop: "0.75rem" }}>
            Case Theory / Brief
          </label>
          <textarea
            className="setup-textarea setup-textarea--sm"
            placeholder="Brief narrative of what you're trying to establish in this examination..."
            value={caseTheory}
            onChange={(e) => setCaseTheory(e.target.value)}
          />

          <label className="setup-label" style={{ marginTop: "0.75rem" }}>
            Prior Statements / Depositions
          </label>
          <textarea
            className="setup-textarea"
            placeholder={`Paste the witness's prior deposition, statements, or interview transcript here...\n\nTip: Use "Page 42:" on its own line to mark page references.`}
            value={priorStatements}
            onChange={(e) => setPriorStatements(e.target.value)}
          />
        </div>

        <div className="setup-col">
          <label className="setup-label">Elements to Prove</label>
          <div className="setup-chip-input">
            <input
              className="setup-input"
              placeholder="e.g., Presence at scene, Motive, Prior knowledge..."
              value={newElement}
              onChange={(e) => setNewElement(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addElement()}
            />
            <button type="button" className="setup-add-btn" onClick={addElement}>
              +
            </button>
          </div>
          <div className="setup-chips">
            {elements.map((el) => (
              <span key={el.id} className="setup-chip">
                {el.title}
                <button type="button" onClick={() => removeElement(el.id)}>
                  &times;
                </button>
              </span>
            ))}
            {elements.length === 0 && (
              <span className="setup-chip-empty">
                No elements added yet. These map to topics you need to establish.
              </span>
            )}
          </div>

          <label className="setup-label" style={{ marginTop: "0.75rem" }}>
            Evidence References
          </label>
          <div className="setup-chip-input">
            <input
              className="setup-input"
              placeholder="Document title"
              value={newEvTitle}
              onChange={(e) => setNewEvTitle(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              className="setup-input"
              placeholder="Description (optional)"
              value={newEvDesc}
              onChange={(e) => setNewEvDesc(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="setup-add-btn" onClick={addEvidence}>
              +
            </button>
          </div>
          <div className="setup-chips">
            {evidenceRefs.map((ev) => (
              <span key={ev.id} className="setup-chip setup-chip--evidence">
                {ev.title}
                {ev.description && <em> — {ev.description}</em>}
                <button type="button" onClick={() => removeEvidence(ev.id)}>
                  &times;
                </button>
              </span>
            ))}
          </div>

          <label className="setup-label" style={{ marginTop: "0.75rem" }}>
            Audio Capture Mode
          </label>
          <div className="setup-mode-row">
            <button
              type="button"
              className={`setup-mode-btn ${captureMode === "mic_only" ? "setup-mode-btn--active" : ""}`}
              onClick={() => setCaptureMode("mic_only")}
            >
              <strong>Mic Only</strong>
              <span>In-person — captures room audio, uses speaker detection</span>
            </button>
            <button
              type="button"
              className={`setup-mode-btn ${captureMode === "dual_channel" ? "setup-mode-btn--active" : ""}`}
              onClick={() => setCaptureMode("dual_channel")}
            >
              <strong>Dual Channel</strong>
              <span>Remote — mic for you, tab audio for witness</span>
            </button>
          </div>
        </div>
      </div>

      <div className="setup-footer">
        <button type="button" className="setup-start-btn" onClick={handleStart}>
          Begin Examination Analysis
        </button>
      </div>
    </div>
  );
}
