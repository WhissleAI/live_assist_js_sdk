import React, { useState } from "react";
import type { Discrepancy } from "../lib/types";

interface Props {
  discrepancy: Discrepancy;
}

const SEVERITY_CONFIG = {
  HIGH: { color: "var(--color-red)", icon: "!!", bg: "rgba(239, 68, 68, 0.08)" },
  MEDIUM: { color: "var(--color-amber)", icon: "!", bg: "rgba(245, 158, 11, 0.08)" },
  LOW: { color: "var(--color-muted)", icon: "~", bg: "rgba(148, 163, 184, 0.08)" },
};

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DiscrepancyCard({ discrepancy: d }: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[d.severity];

  return (
    <div
      className="discrepancy-card"
      style={{ borderLeftColor: config.color }}
    >
      <div
        className="discrepancy-card-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className="discrepancy-severity"
          style={{ background: config.bg, color: config.color }}
        >
          {d.severity}
        </span>
        <span className="discrepancy-summary">{d.summary}</span>
        <span className="discrepancy-chevron">{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>

      {expanded && (
        <div className="discrepancy-card-body">
          {d.currentQuote && (
            <div className="discrepancy-quote-block">
              <span className="discrepancy-quote-label" style={{ color: "var(--color-red)" }}>
                CURRENT TESTIMONY ({formatTime(d.currentTimestamp)}):
              </span>
              <blockquote className="discrepancy-quote">{d.currentQuote}</blockquote>
            </div>
          )}

          {d.priorQuote && (
            <div className="discrepancy-quote-block">
              <span className="discrepancy-quote-label" style={{ color: "var(--color-blue)" }}>
                PRIOR STATEMENT ({d.priorSource}):
              </span>
              <blockquote className="discrepancy-quote">{d.priorQuote}</blockquote>
            </div>
          )}

          {d.analysis && (
            <div className="discrepancy-analysis">
              <span className="discrepancy-quote-label">ANALYSIS:</span>
              <p>{d.analysis}</p>
            </div>
          )}

          {d.impeachmentSuggestion && (
            <div className="discrepancy-impeachment">
              <span className="discrepancy-quote-label" style={{ color: "var(--color-green)" }}>
                SUGGESTED IMPEACHMENT:
              </span>
              <p>{d.impeachmentSuggestion}</p>
            </div>
          )}

          <div className="discrepancy-source-tag">
            {d.source === "agent" ? "AI Analysis" : "Auto-Detected"}
          </div>
        </div>
      )}
    </div>
  );
}
