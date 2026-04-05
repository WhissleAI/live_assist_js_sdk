import React, { useState } from "react";
import type { ExaminationState, Discrepancy, Objection } from "../lib/types";

interface Props {
  state: ExaminationState;
  witnessName: string;
  caseNumber: string;
  onNewSession: () => void;
  onBackToSetup: () => void;
}

type Tab = "summary" | "contradictions" | "objections" | "elements";

export default function SessionReport({
  state,
  witnessName,
  caseNumber,
  onNewSession,
  onBackToSetup,
}: Props) {
  const [tab, setTab] = useState<Tab>("summary");

  const segmentCount = state.segments.filter((s) => s.isFinal).length;
  const witnessSegments = state.segments.filter((s) => s.isFinal && s.speaker === "WITNESS");

  return (
    <div className="report-root">
      <div className="report-topbar">
        <h1>Session Report — {witnessName}</h1>
        <div className="report-topbar-actions">
          <button type="button" className="report-btn report-btn--secondary" onClick={onBackToSetup}>
            New Case
          </button>
          <button type="button" className="report-btn report-btn--primary" onClick={onNewSession}>
            New Session
          </button>
        </div>
      </div>

      <div className="report-tabs">
        {(["summary", "contradictions", "objections", "elements"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`report-tab ${tab === t ? "report-tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "summary" && "Summary"}
            {t === "contradictions" && `Contradictions (${state.discrepancies.length})`}
            {t === "objections" && `Objections (${state.objections.length})`}
            {t === "elements" && "Elements"}
          </button>
        ))}
      </div>

      <div className="report-content">
        <div className="report-content-inner">
          {tab === "summary" && (
            <SummaryTab
              state={state}
              witnessName={witnessName}
              caseNumber={caseNumber}
              segmentCount={segmentCount}
              witnessSegmentCount={witnessSegments.length}
            />
          )}
          {tab === "contradictions" && (
            <ContradictionsTab discrepancies={state.discrepancies} />
          )}
          {tab === "objections" && (
            <ObjectionsTab objections={state.objections} />
          )}
          {tab === "elements" && (
            <ElementsTab elements={state.elements} />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTab({
  state,
  witnessName,
  caseNumber,
  segmentCount,
  witnessSegmentCount,
}: {
  state: ExaminationState;
  witnessName: string;
  caseNumber: string;
  segmentCount: number;
  witnessSegmentCount: number;
}) {
  const credColor =
    state.witnessCredibility >= 70
      ? "var(--color-green)"
      : state.witnessCredibility >= 45
        ? "var(--color-amber)"
        : "var(--color-red)";

  return (
    <>
      <div className="report-verdict-card" style={{ borderColor: credColor }}>
        <div className="report-verdict-top">
          <span className="report-verdict-label" style={{ color: credColor }}>
            Credibility Score: {state.witnessCredibility}/100
          </span>
        </div>
        <p className="report-verdict-text">
          {state.feedbackSummary || "Session completed. Review findings below."}
        </p>
      </div>

      <div className="report-stats-grid">
        <div className="report-stat">
          <span className="report-stat-value">{segmentCount}</span>
          <span className="report-stat-label">Total Segments</span>
        </div>
        <div className="report-stat">
          <span className="report-stat-value">{witnessSegmentCount}</span>
          <span className="report-stat-label">Witness Statements</span>
        </div>
        <div className="report-stat">
          <span className="report-stat-value" style={{ color: "var(--color-red)" }}>
            {state.discrepancies.length}
          </span>
          <span className="report-stat-label">Contradictions</span>
        </div>
        <div className="report-stat">
          <span className="report-stat-value" style={{ color: "var(--color-amber)" }}>
            {state.objections.length}
          </span>
          <span className="report-stat-label">Objections</span>
        </div>
      </div>

      {state.suggestions.length > 0 && (
        <div className="report-section">
          <h2>Tactical Recommendations</h2>
          <ul className="report-list report-list--green">
            {state.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {state.keywords.length > 0 && (
        <div className="report-section">
          <h2>Key Terms</h2>
          <div className="analysis-keywords">
            {state.keywords.map((kw) => (
              <span key={kw} className="analysis-keyword-pill">{kw}</span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ContradictionsTab({ discrepancies }: { discrepancies: Discrepancy[] }) {
  if (discrepancies.length === 0) {
    return <p className="report-empty-text">No contradictions detected during this session.</p>;
  }

  return (
    <>
      {discrepancies.map((d) => (
        <div
          key={d.id}
          className="report-contradiction-card"
          style={{
            borderLeftColor:
              d.severity === "HIGH"
                ? "var(--color-red)"
                : d.severity === "MEDIUM"
                  ? "var(--color-amber)"
                  : "var(--color-muted)",
          }}
        >
          <div className="report-contradiction-header">
            <span className="report-contradiction-severity">{d.severity}</span>
            <span className="report-contradiction-summary">{d.summary}</span>
          </div>
          {d.currentQuote && (
            <div className="report-quote-block">
              <span className="report-quote-label">Current Testimony:</span>
              <blockquote>{d.currentQuote}</blockquote>
            </div>
          )}
          {d.priorQuote && (
            <div className="report-quote-block">
              <span className="report-quote-label">Prior Statement ({d.priorSource}):</span>
              <blockquote>{d.priorQuote}</blockquote>
            </div>
          )}
          {d.analysis && <p className="report-analysis-text">{d.analysis}</p>}
          {d.impeachmentSuggestion && (
            <p className="report-impeachment-text">{d.impeachmentSuggestion}</p>
          )}
        </div>
      ))}
    </>
  );
}

function ObjectionsTab({ objections }: { objections: Objection[] }) {
  if (objections.length === 0) {
    return <p className="report-empty-text">No objection opportunities detected during this session.</p>;
  }

  return (
    <>
      {objections.map((obj) => (
        <div key={obj.id} className="report-objection-card">
          <div className="report-objection-header">
            <span className="report-objection-type">{obj.type.replace(/_/g, " ")}</span>
          </div>
          <blockquote className="report-objection-quote">"{obj.triggerQuote}"</blockquote>
          <p className="report-objection-basis">{obj.legalBasis}</p>
        </div>
      ))}
    </>
  );
}

function ElementsTab({ elements }: { elements: ExaminationState["elements"] }) {
  if (elements.length === 0) {
    return <p className="report-empty-text">No elements were configured for tracking.</p>;
  }

  return (
    <>
      {elements.map((el) => {
        const confColor =
          el.confidence >= 70
            ? "var(--color-green)"
            : el.confidence >= 35
              ? "var(--color-amber)"
              : "var(--color-muted)";
        return (
          <div key={el.id} className="report-element-card">
            <div className="report-element-header">
              <span className="report-element-title">{el.title}</span>
              <span className="report-element-confidence" style={{ color: confColor }}>
                {el.confidence}%
              </span>
            </div>
            <div className="report-element-status">
              Status: {el.status} &mdash; {el.evidence || "No evidence captured"}
            </div>
          </div>
        );
      })}
    </>
  );
}
