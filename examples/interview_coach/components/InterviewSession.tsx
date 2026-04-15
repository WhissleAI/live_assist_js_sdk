import React, { useCallback, useEffect, useRef, useState } from "react";
import type { InterviewConfig } from "../App";
import type { GapAnalysis } from "../lib/prep";
import type { AnswerScore } from "../lib/scoring";
import { TOTAL_QUESTIONS, type ToolCallResult } from "../lib/roles";
import { useInterviewSession } from "../hooks/useInterviewSession";
import ConfidencePulse from "./ConfidencePulse";
import HintPanel from "./HintPanel";
import DeliveryMeter from "./DeliveryMeter";
import JdAlignmentMeter from "./JdAlignmentMeter";
import AnswerScorecard from "./AnswerScorecard";

interface Props {
  config: InterviewConfig;
  gapAnalysis: GapAnalysis | null;
  onEnd: (answers: AnswerScore[], endData: ToolCallResult | null) => void;
}

function useScrollToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    });
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [dep]);

  return ref;
}

export default function InterviewSession({ config, gapAnalysis, onEnd }: Props) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleAutoEnd = useCallback((answers: AnswerScore[], endData: ToolCallResult | null) => {
    onEnd(answers, endData);
  }, [onEnd]);

  const { state, start, stop, submitAnswer } = useInterviewSession({ config, gapAnalysis, onAutoEnd: handleAutoEnd });

  const agentTextRef = useScrollToBottom(state.agentText);
  const transcriptRef = useScrollToBottom(state.fullTranscript + state.partialTranscript);

  const handleEnd = useCallback(() => {
    if (!confirmEnd && !state.endData) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }
    stop();
    onEnd(state.answers, state.endData);
  }, [confirmEnd, stop, onEnd, state.answers, state.endData]);

  const canSubmit = !state.isProcessing && !state.isSpeaking && !!state.fullTranscript.trim();

  useEffect(() => {
    if (!state.isActive) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.shiftKey && canSubmit) {
        e.preventDefault();
        submitAnswer();
      }
      if (e.key === "Escape") handleEnd();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state.isActive, canSubmit, submitAnswer, handleEnd]);

  if (!state.isActive) {
    return (
      <div className="interview-root">
        <div className="interview-start-container">
          <div className="interview-start-icon">W</div>
          <h1>Ready to Practice</h1>
          <p>Your mic will be used for speech recognition. The AI interviewer will ask {TOTAL_QUESTIONS} questions tailored to your profile.</p>
          {config.hintsEnabled && <p className="interview-hint-info">Real-time coaching hints are enabled</p>}
          <button type="button" className="interview-start-btn" onClick={start} disabled={state.isProcessing}>
            {state.isProcessing ? "Setting up..." : "Begin Interview"}
          </button>
          {state.error && <p className="interview-error">{state.error}</p>}
        </div>
      </div>
    );
  }

  const hasEnd = state.endData !== null;
  const isAgentTurn = state.isProcessing || state.isSpeaking;

  return (
    <div className="interview-root">
      <div className="interview-layout">
        <div className="interview-main">
          <div className="interview-header-bar">
            <div className="interview-progress">
              <span className="interview-q-label">
                Question {Math.min(state.questionIndex + 1, TOTAL_QUESTIONS)} of {TOTAL_QUESTIONS}
              </span>
              <div className="interview-progress-track">
                <div className="interview-progress-fill" style={{ width: `${(Math.min(state.questionIndex + 1, TOTAL_QUESTIONS) / TOTAL_QUESTIONS) * 100}%` }} />
              </div>
            </div>
            <span className="interview-elapsed" aria-label={`Elapsed: ${Math.floor(state.sessionElapsedSec / 60)}m ${state.sessionElapsedSec % 60}s`}>
              {Math.floor(state.sessionElapsedSec / 60)}:{(state.sessionElapsedSec % 60).toString().padStart(2, "0")}
            </span>
            <ConfidencePulse score={state.confidenceScore} emotion={state.currentEmotion} />
          </div>

          <div className={`interview-agent-area ${isAgentTurn ? "interview-agent-area--speaking" : ""}`}>
            <div className="interview-agent-avatar">
              <div className={`interview-avatar-ring ${isAgentTurn ? "interview-avatar-ring--pulse" : ""}`} />
              <span className="interview-avatar-icon">AI</span>
            </div>
            <div className="interview-agent-text" ref={agentTextRef}>
              {state.agentText || (
                <span className="interview-agent-loading">
                  <span className="interview-typing-dot" />
                  <span className="interview-typing-dot" />
                  <span className="interview-typing-dot" />
                </span>
              )}
            </div>
          </div>

          <div className="interview-user-area">
            <div className="interview-transcript-box">
              <div className="interview-transcript-header">
                <span className="interview-transcript-label">Your Answer</span>
                {!isAgentTurn && state.isListening && (
                  <span className="interview-listening-badge">
                    <span className="interview-listening-dot" /> Listening
                  </span>
                )}
                {isAgentTurn && <span className="interview-waiting-badge">Interviewer speaking...</span>}
              </div>
              <div className="interview-transcript-text" ref={transcriptRef}>
                {state.fullTranscript}
                {state.partialTranscript && <span className="interview-partial"> {state.partialTranscript}</span>}
                {!state.fullTranscript && !state.partialTranscript && !isAgentTurn && (
                  <span className="interview-placeholder">Start speaking your answer...</span>
                )}
                {!state.fullTranscript && !state.partialTranscript && isAgentTurn && (
                  <span className="interview-placeholder">Listen to the question, then answer...</span>
                )}
              </div>
            </div>

            <div className="interview-controls">
              {state.isSpeaking && state.fullTranscript.trim() ? (
                <button type="button" className="interview-submit-btn interview-submit-btn--interrupt" onClick={submitAnswer}>
                  Interrupt & Submit →
                </button>
              ) : (
                <button type="button" className="interview-submit-btn" onClick={submitAnswer} disabled={!canSubmit}>
                  {state.isProcessing ? "Processing..." : "Submit Answer →"}
                </button>
              )}
              {hasEnd ? (
                <button type="button" className="interview-end-btn" onClick={handleEnd}>View Report</button>
              ) : (
                <button type="button" className={`interview-end-btn interview-end-btn--secondary ${confirmEnd ? "interview-end-btn--confirm" : ""}`} onClick={handleEnd}>
                  {confirmEnd ? "Confirm End?" : "End Early"}
                </button>
              )}
            </div>

            <div className="interview-shortcuts">
              <span>Enter to submit</span>
              <span>Esc to end</span>
            </div>
          </div>

          {state.error && <p className="interview-error">{state.error}</p>}
        </div>

        <button
          type="button"
          className="interview-sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Hide coaching panel" : "Show coaching panel"}
        >
          {sidebarOpen ? "✕" : "📊"}
        </button>

        {sidebarOpen && <div className="interview-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

        <div className={`interview-sidebar ${sidebarOpen ? "interview-sidebar--open" : ""}`}>
          <DeliveryMeter
            confidence={state.confidenceScore}
            paceWPM={state.speakingPaceWPM}
            fillerCount={state.fillerCount}
            durationSec={state.answerDurationSec}
            emotion={state.currentEmotion}
            vocalStability={state.vocalStability}
            thinkTimeSec={state.thinkTimeSec}
          />

          {state.jdAlignment && state.jdAlignment.matches.length > 0 && (
            <JdAlignmentMeter alignment={state.jdAlignment} />
          )}

          {config.hintsEnabled && <HintPanel hints={state.activeHints} />}

          {state.answers.length > 0 && (
            <div className="interview-recent-scores">
              <h3>Recent Scores</h3>
              {state.answers.slice(-3).reverse().map((a) => (
                <AnswerScorecard key={a.questionIndex} answer={a} compact />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
