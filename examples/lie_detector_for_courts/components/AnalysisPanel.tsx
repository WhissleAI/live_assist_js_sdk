import React from "react";
import type { ExaminationState } from "../lib/types";
import DiscrepancyCard from "./DiscrepancyCard";
import ObjectionBadge from "./ObjectionBadge";
import CredibilityMeter from "./CredibilityMeter";
import ElementsTracker from "./ElementsTracker";

interface Props {
  state: ExaminationState;
}

export default function AnalysisPanel({ state }: Props) {
  const highSeverityDisc = state.discrepancies.filter((d) => d.severity === "HIGH");
  const otherDisc = state.discrepancies.filter((d) => d.severity !== "HIGH");
  const recentObjections = state.objections.slice(-10).reverse();

  return (
    <div className="analysis-panel">
      <CredibilityMeter
        score={state.witnessCredibility}
        vocalStability={state.witnessVocalStability}
        emotion={state.witnessEmotion}
      />

      {highSeverityDisc.length > 0 && (
        <div className="analysis-section">
          <div className="analysis-section-header">
            <span className="analysis-section-icon analysis-section-icon--alert">
              !!
            </span>
            <span className="analysis-section-title">
              Active Alerts ({highSeverityDisc.length})
            </span>
          </div>
          {highSeverityDisc.map((d) => (
            <DiscrepancyCard key={d.id} discrepancy={d} />
          ))}
        </div>
      )}

      {recentObjections.length > 0 && (
        <div className="analysis-section">
          <div className="analysis-section-header">
            <span className="analysis-section-title">Objection Opportunities</span>
          </div>
          {recentObjections.map((obj) => (
            <div key={obj.id} className="objection-card">
              <div className="objection-card-top">
                <ObjectionBadge type={obj.type} />
                <span className="objection-card-quote">"{obj.triggerQuote}"</span>
              </div>
              <div className="objection-card-basis">{obj.legalBasis}</div>
            </div>
          ))}
        </div>
      )}

      {otherDisc.length > 0 && (
        <div className="analysis-section">
          <div className="analysis-section-header">
            <span className="analysis-section-title">
              Discrepancies ({otherDisc.length})
            </span>
          </div>
          {otherDisc.map((d) => (
            <DiscrepancyCard key={d.id} discrepancy={d} />
          ))}
        </div>
      )}

      <ElementsTracker elements={state.elements} />

      {state.feedbackSummary && (
        <div className="analysis-section">
          <div className="analysis-section-header">
            <span className="analysis-section-title">AI Analysis</span>
          </div>
          <div className="analysis-feedback-text">{state.feedbackSummary}</div>
          {state.suggestions.length > 0 && (
            <div className="analysis-suggestions">
              <span className="analysis-suggestions-label">Tactical Suggestions:</span>
              <ul>
                {state.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {state.keywords.length > 0 && (
        <div className="analysis-keywords">
          {state.keywords.map((kw) => (
            <span key={kw} className="analysis-keyword-pill">
              {kw}
            </span>
          ))}
        </div>
      )}

      {state.discrepancies.length === 0 &&
        state.objections.length === 0 &&
        !state.feedbackSummary && (
          <div className="analysis-empty">
            <p>Analysis will appear here as testimony progresses.</p>
            <p>Contradictions, objections, and AI insights will surface automatically.</p>
          </div>
        )}
    </div>
  );
}
