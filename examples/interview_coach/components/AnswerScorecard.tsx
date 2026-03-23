import React, { useState } from "react";
import type { AnswerScore } from "../lib/scoring";
import { highlightFillers } from "../lib/fillers";

interface Props {
  answer: AnswerScore;
  compact?: boolean;
  isWeakest?: boolean;
  isStrongest?: boolean;
}

function contentLabel(score: number): { text: string; color: string } {
  if (score >= 80) return { text: "Excellent", color: "var(--color-green)" };
  if (score >= 65) return { text: "Good", color: "var(--color-green)" };
  if (score >= 50) return { text: "Acceptable", color: "var(--color-amber)" };
  if (score >= 35) return { text: "Weak", color: "var(--color-amber)" };
  return { text: "Poor", color: "var(--color-red)" };
}

function deliveryLabel(score: number): { text: string; color: string } {
  if (score >= 75) return { text: "Strong delivery", color: "var(--color-green)" };
  if (score >= 55) return { text: "Decent delivery", color: "var(--color-green)" };
  if (score >= 40) return { text: "Needs work", color: "var(--color-amber)" };
  return { text: "Weak delivery", color: "var(--color-red)" };
}

export default function AnswerScorecard({ answer, compact, isWeakest, isStrongest }: Props) {
  const [expanded, setExpanded] = useState(false);
  const content = contentLabel(answer.contentScore);
  const delivery = deliveryLabel(answer.delivery.overall);

  if (compact) {
    return (
      <div className="scorecard scorecard--compact">
        <div className="scorecard-q">Q{answer.questionIndex + 1}</div>
        <div className="scorecard-scores">
          <span className="scorecard-badge" style={{ color: content.color }}>{content.text}</span>
          <span className="scorecard-badge" style={{ color: delivery.color }}>{delivery.text}</span>
        </div>
      </div>
    );
  }

  const hasTranscript = answer.answerText.trim().length > 0;
  const hasBehavioral = answer.behavioralNarrative && answer.behavioralNarrative.length > 0;

  return (
    <div className={`answer-card ${isWeakest ? "answer-card--weakest" : ""} ${isStrongest ? "answer-card--strongest" : ""}`}>
      <div className="answer-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="answer-card-left">
          <span className="answer-card-qnum">Q{answer.questionIndex + 1}</span>
          <div className="answer-card-question">
            {answer.questionText.slice(0, 120)}{answer.questionText.length > 120 ? "..." : ""}
          </div>
        </div>
        <div className="answer-card-right">
          <span className="answer-card-tag" style={{ color: content.color, borderColor: content.color }}>{content.text}</span>
          <span className="answer-card-tag" style={{ color: delivery.color, borderColor: delivery.color }}>{delivery.text}</span>
          <span className="answer-card-category">{answer.questionCategory}</span>
          <span className="answer-card-chevron">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="answer-card-body">
          {answer.whatInterviewerThinks && (
            <div className="answer-card-interviewer-thinks">
              <span className="answer-card-thinks-icon">💭</span>
              <div>
                <span className="answer-card-thinks-label">What the interviewer is thinking</span>
                <p className="answer-card-thinks-text">{answer.whatInterviewerThinks}</p>
              </div>
            </div>
          )}

          {answer.problematicQuote && (
            <div className="answer-card-reframe">
              <div className="answer-card-reframe-before">
                <span className="answer-card-reframe-label">Your words</span>
                <blockquote>"{answer.problematicQuote}"</blockquote>
              </div>
              {answer.suggestedReframe && (
                <div className="answer-card-reframe-after">
                  <span className="answer-card-reframe-label">Say this instead</span>
                  <blockquote>"{answer.suggestedReframe}"</blockquote>
                </div>
              )}
            </div>
          )}

          {hasBehavioral && (
            <div className="answer-card-behavioral">
              <span className="answer-card-section-label">How you sounded</span>
              <ul className="answer-card-behavioral-list">
                {answer.behavioralNarrative.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="answer-card-feedback-grid">
            <div className="answer-card-feedback-col">
              <span className="answer-card-section-label">Strengths</span>
              <ul className="answer-card-list answer-card-list--green">
                {answer.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div className="answer-card-feedback-col">
              <span className="answer-card-section-label">To improve</span>
              <ul className="answer-card-list answer-card-list--amber">
                {answer.improvements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>

          {hasTranscript && (
            <div className="answer-card-transcript">
              <span className="answer-card-section-label">Your transcript</span>
              <div
                className="answer-card-transcript-text"
                dangerouslySetInnerHTML={{ __html: highlightFillers(answer.answerText) }}
              />
              <div className="answer-card-transcript-meta">
                {answer.delivery.avgPaceWPM > 0 && <span>{answer.delivery.avgPaceWPM} wpm</span>}
                <span>{Math.round(answer.delivery.durationSec)}s</span>
                {answer.delivery.fillerCount > 0 && <span>{answer.delivery.fillerCount} fillers</span>}
                <span>Structure: {answer.structure}</span>
              </div>
            </div>
          )}

          {answer.keyMoments.length > 0 && (
            <div className="answer-card-moments">
              <span className="answer-card-section-label">Notable moments</span>
              <ul className="answer-card-list answer-card-list--blue">
                {answer.keyMoments.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
