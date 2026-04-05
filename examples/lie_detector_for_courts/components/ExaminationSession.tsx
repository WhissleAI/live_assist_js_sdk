import React, { useCallback, useState } from "react";
import type { CaseConfig, ExaminationState } from "../lib/types";
import type { PriorStatementChunk } from "../lib/types";
import { useExaminationSession } from "../hooks/useExaminationSession";
import TranscriptPanel from "./TranscriptPanel";
import AnalysisPanel from "./AnalysisPanel";
import WitnessBehaviorBar from "./WitnessBehaviorBar";

interface Props {
  config: CaseConfig;
  priorChunks: PriorStatementChunk[];
  customPrompt: string;
  agendaItems: Array<{ id: string; title: string; status: string; confidence: number }>;
  onEnd: (finalState?: ExaminationState) => void;
}

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ExaminationSession({
  config,
  priorChunks,
  customPrompt,
  agendaItems,
  onEnd,
}: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);

  const { state, start, stop } = useExaminationSession({
    config,
    priorChunks,
    customPrompt,
    agendaItems,
  });

  const handleStop = useCallback(() => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }
    stop();
    onEnd(state);
  }, [confirmEnd, stop, onEnd, state]);

  if (!state.isActive) {
    return (
      <div className="exam-root">
        <div className="exam-start-container">
          <div className="exam-start-icon">&#9878;</div>
          <h1>Ready to Analyze</h1>
          <p>
            Witness: <strong>{config.witnessName}</strong>
            {config.caseNumber && <> &mdash; Case: {config.caseNumber}</>}
          </p>
          <p className="exam-start-detail">
            Your microphone will capture courtroom audio for real-time transcription and analysis.
            {config.captureMode === "dual_channel" &&
              " Tab audio capture will be used for the witness channel."}
          </p>
          {config.elements.length > 0 && (
            <p className="exam-start-detail">
              Tracking {config.elements.length} element{config.elements.length !== 1 ? "s" : ""} to
              prove
            </p>
          )}
          <button
            type="button"
            className="exam-start-btn"
            onClick={start}
          >
            Begin Analysis
          </button>
          {state.error && <p className="exam-error">{state.error}</p>}
        </div>
      </div>
    );
  }

  const alertCount =
    state.discrepancies.filter((d) => d.severity === "HIGH").length +
    state.objections.length;

  return (
    <div className="exam-root">
      <div className="exam-topbar">
        <div className="exam-topbar-left">
          <span className="exam-recording-dot" />
          <span className="exam-topbar-label">Recording</span>
          <span className="exam-topbar-witness">
            Witness: {config.witnessName}
          </span>
          {config.caseNumber && (
            <span className="exam-topbar-case">Case: {config.caseNumber}</span>
          )}
        </div>
        <div className="exam-topbar-right">
          {alertCount > 0 && (
            <span className="exam-alert-badge">
              {alertCount} alert{alertCount !== 1 ? "s" : ""}
            </span>
          )}
          <span className="exam-topbar-timer">
            {formatElapsed(state.elapsedSec)}
          </span>
          <button
            type="button"
            className={`exam-stop-btn ${confirmEnd ? "exam-stop-btn--confirm" : ""}`}
            onClick={handleStop}
          >
            {confirmEnd ? "Confirm End?" : "End Session"}
          </button>
        </div>
      </div>

      <WitnessBehaviorBar segments={state.segments} />

      <div className="exam-split">
        <div className="exam-split-left">
          <TranscriptPanel
            segments={state.segments}
            witnessName={config.witnessName}
          />
        </div>
        <div className="exam-split-right">
          <AnalysisPanel state={state} />
        </div>
      </div>

      {state.error && (
        <div className="exam-error-bar">
          {state.error}
        </div>
      )}
    </div>
  );
}
