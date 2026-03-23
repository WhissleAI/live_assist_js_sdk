import React, { useEffect, useRef, useState } from "react";
import type { InterviewConfig } from "../App";
import type { AnswerScore } from "../lib/scoring";
import type { ToolCallResult } from "../lib/tools";
import type { GapAnalysis } from "../lib/prep";
import { computeReadinessScore } from "../lib/scoring";
import { saveSessionRecord } from "../lib/progress";
import AnswerScorecard from "./AnswerScorecard";

interface Props {
  config: InterviewConfig;
  answers: AnswerScore[];
  endData: ToolCallResult | null;
  gapAnalysis: GapAnalysis | null;
  onBackToSetup: () => void;
  onNewSession: () => void;
}

type Tab = "verdict" | "answers" | "coverage";

const VERDICT_META: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  strong_hire: { emoji: "✅", label: "Strong Hire", color: "#15803d", bg: "rgba(22,163,74,0.08)" },
  hire: { emoji: "👍", label: "Hire", color: "#16a34a", bg: "rgba(22,163,74,0.06)" },
  lean_hire: { emoji: "🤔", label: "Lean Hire", color: "#ca8a04", bg: "rgba(202,138,4,0.06)" },
  lean_no_hire: { emoji: "⚠️", label: "Lean No Hire", color: "#d97706", bg: "rgba(217,119,6,0.06)" },
  no_hire: { emoji: "❌", label: "No Hire", color: "#dc2626", bg: "rgba(220,38,38,0.06)" },
};

function PracticeRecommendation({ rec }: { rec: { title: string; detail: string; priority: string } }) {
  const priorityColor = rec.priority === "critical" ? "var(--color-red)" : rec.priority === "important" ? "var(--color-amber)" : "var(--color-muted)";
  return (
    <div className="practice-rec">
      <div className="practice-rec-header">
        <span className="practice-rec-dot" style={{ background: priorityColor }} />
        <span className="practice-rec-title">{rec.title}</span>
        <span className="practice-rec-priority" style={{ color: priorityColor }}>{rec.priority}</span>
      </div>
      <p className="practice-rec-detail">{rec.detail}</p>
    </div>
  );
}

export default function SessionReport({ config, answers, endData, gapAnalysis, onBackToSetup, onNewSession }: Props) {
  const readinessScore = computeReadinessScore(answers);
  const endArgs = endData?.arguments ?? {};
  const [tab, setTab] = useState<Tab>("verdict");

  const savedRef = useRef(false);
  useEffect(() => {
    if (savedRef.current || answers.length === 0) return;
    savedRef.current = true;

    const avgContent = Math.round(answers.reduce((s, a) => s + a.contentScore, 0) / answers.length);
    const avgDelivery = Math.round(answers.reduce((s, a) => s + a.delivery.overall, 0) / answers.length);
    const avgConfidence = Math.round(answers.reduce((s, a) => s + a.delivery.confidence, 0) / answers.length);

    saveSessionRecord({
      id: Date.now().toString(36),
      date: new Date().toLocaleDateString(),
      role: config.jdText.slice(0, 40) || "General",
      difficulty: config.difficulty,
      readinessScore,
      contentAvg: avgContent,
      deliveryAvg: avgDelivery,
      confidenceAvg: avgConfidence,
      questionCount: answers.length,
    });
  }, [answers, readinessScore, config]);

  const verdict = (endArgs.verdict as string) ?? "";
  const verdictMeta = VERDICT_META[verdict] ?? VERDICT_META["lean_hire"];
  const verdictReasoning = (endArgs.verdict_reasoning as string) ?? (endArgs.overall_feedback as string) ?? "";
  const practiceRecs = (endArgs.practice_recommendations as Array<{ title: string; detail: string; priority: string }>) ?? [];
  const weakestIdx = (endArgs.weakest_question_index as number) ?? -1;
  const strongestIdx = (endArgs.strongest_question_index as number) ?? -1;

  const totalFillers = answers.reduce((s, a) => s + a.delivery.fillerCount, 0);
  const avgConfidence = answers.length > 0 ? Math.round(answers.reduce((s, a) => s + a.delivery.confidence, 0) / answers.length) : 0;
  const paced = answers.filter((a) => a.delivery.avgPaceWPM > 0);
  const avgPace = paced.length > 0 ? Math.round(paced.reduce((s, a) => s + a.delivery.avgPaceWPM, 0) / paced.length) : 0;

  return (
    <div className="report-root">
      <div className="report-topbar">
        <h1>Interview Debrief</h1>
        <div className="report-topbar-actions">
          <button type="button" className="report-btn report-btn--secondary" onClick={onBackToSetup}>New Setup</button>
          <button type="button" className="report-btn report-btn--primary" onClick={onNewSession}>Practice Again</button>
        </div>
      </div>

      <div className="report-tabs">
        <button className={`report-tab ${tab === "verdict" ? "report-tab--active" : ""}`} onClick={() => setTab("verdict")}>
          Verdict
        </button>
        <button className={`report-tab ${tab === "answers" ? "report-tab--active" : ""}`} onClick={() => setTab("answers")}>
          Answers ({answers.length})
        </button>
        <button className={`report-tab ${tab === "coverage" ? "report-tab--active" : ""}`} onClick={() => setTab("coverage")}>
          JD Coverage
        </button>
      </div>

      <div className="report-content">
        <div className="report-content-inner">
          {tab === "verdict" && (
            <>
              <div className="verdict-card" style={{ background: verdictMeta.bg, borderColor: verdictMeta.color }}>
                <div className="verdict-card-top">
                  <span className="verdict-emoji">{verdictMeta.emoji}</span>
                  <span className="verdict-label" style={{ color: verdictMeta.color }}>{verdictMeta.label}</span>
                  <span className="verdict-score">{readinessScore}/100</span>
                </div>
                {verdictReasoning && (
                  <p className="verdict-reasoning">{verdictReasoning}</p>
                )}
              </div>

              <div className="report-delivery-summary">
                <div className="report-delivery-item">
                  <span className="report-delivery-value" style={{ color: avgConfidence >= 60 ? "var(--color-green)" : avgConfidence >= 40 ? "var(--color-amber)" : "var(--color-red)" }}>
                    {avgConfidence}%
                  </span>
                  <span className="report-delivery-label">Confidence</span>
                </div>
                <div className="report-delivery-item">
                  <span className="report-delivery-value" style={{ color: avgPace >= 120 && avgPace <= 160 ? "var(--color-green)" : "var(--color-amber)" }}>
                    {avgPace > 0 ? avgPace : "—"}
                  </span>
                  <span className="report-delivery-label">Avg WPM</span>
                </div>
                <div className="report-delivery-item">
                  <span className="report-delivery-value" style={{ color: totalFillers > 10 ? "var(--color-red)" : totalFillers > 5 ? "var(--color-amber)" : "var(--color-green)" }}>
                    {totalFillers}
                  </span>
                  <span className="report-delivery-label">Total Fillers</span>
                </div>
                <div className="report-delivery-item">
                  <span className="report-delivery-value">
                    {Math.round(answers.reduce((s, a) => s + a.contentScore, 0) / (answers.length || 1))}
                  </span>
                  <span className="report-delivery-label">Content Avg</span>
                </div>
              </div>

              <div className="report-cols">
                {(endArgs.top_strengths as string[] | undefined)?.length ? (
                  <div className="report-col">
                    <h3>What Went Well</h3>
                    <ul className="report-list report-list--green">
                      {(endArgs.top_strengths as string[]).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                ) : null}
                {(endArgs.growth_areas as string[] | undefined)?.length ? (
                  <div className="report-col">
                    <h3>Where You Lost Points</h3>
                    <ul className="report-list report-list--amber">
                      {(endArgs.growth_areas as string[]).map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>

              {practiceRecs.length > 0 && (
                <div className="report-section">
                  <h2>What to Practice Next</h2>
                  <div className="practice-recs-list">
                    {practiceRecs.map((rec, i) => (
                      <PracticeRecommendation key={i} rec={rec} />
                    ))}
                  </div>
                </div>
              )}

              {weakestIdx >= 0 && answers[weakestIdx] && (
                <div className="report-section">
                  <h2>Your Weakest Answer — Expand to Review</h2>
                  <AnswerScorecard answer={answers[weakestIdx]} isWeakest />
                </div>
              )}
            </>
          )}

          {tab === "answers" && (
            <>
              <p className="report-answers-intro">
                Click any answer to see the full transcript, what the interviewer was thinking, and specific behavioral feedback.
              </p>
              {answers.map((answer, i) => (
                <AnswerScorecard
                  key={i}
                  answer={answer}
                  isWeakest={i === weakestIdx}
                  isStrongest={i === strongestIdx}
                />
              ))}
            </>
          )}

          {tab === "coverage" && (
            <>
              {(endArgs.jd_coverage as Array<{ requirement: string; status: string }> | undefined)?.length ? (
                <div className="report-section">
                  <h2>JD Requirements Coverage</h2>
                  <div className="report-jd-coverage">
                    {(endArgs.jd_coverage as Array<{ requirement: string; status: string }>).map((item, i) => (
                      <div key={i} className={`report-jd-item report-jd-item--${item.status}`}>
                        <span className="report-jd-icon">
                          {item.status === "covered" ? "✓" : item.status === "partial" ? "△" : "✗"}
                        </span>
                        <span>{item.requirement}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="report-section">
                  <h2>JD Coverage</h2>
                  <p className="report-feedback">JD coverage data not available for this session.</p>
                </div>
              )}

              {answers.filter((a) => a.jdGapsAddressed.length > 0).length > 0 && (
                <div className="report-section">
                  <h2>Skills Mentioned Per Answer</h2>
                  {answers.map((a, i) => a.jdGapsAddressed.length > 0 ? (
                    <div key={i} className="report-skills-row">
                      <span className="report-skills-q">Q{i + 1}</span>
                      <div className="report-skills-pills">
                        {a.jdGapsAddressed.map((s, j) => (
                          <span key={j} className="report-skill-pill">{s}</span>
                        ))}
                      </div>
                    </div>
                  ) : null)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
