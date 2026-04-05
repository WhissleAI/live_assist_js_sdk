import React from "react";
import type { ElementStatus } from "../lib/types";

interface Props {
  elements: ElementStatus[];
}

function getStatusIcon(status: string, confidence: number): string {
  if (status === "completed" || confidence >= 85) return "\u2611";
  if (status === "in_progress" || confidence >= 30) return "\u25D1";
  return "\u2610";
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 70) return "var(--color-green)";
  if (confidence >= 35) return "var(--color-amber)";
  return "var(--color-muted)";
}

export default function ElementsTracker({ elements }: Props) {
  if (elements.length === 0) return null;

  return (
    <div className="elements-tracker">
      <div className="elements-tracker-title">Elements Tracker</div>
      <div className="elements-list">
        {elements.map((el) => (
          <div key={el.id} className="element-row">
            <span className="element-icon">
              {getStatusIcon(el.status, el.confidence)}
            </span>
            <span className="element-title">{el.title}</span>
            <span
              className="element-confidence"
              style={{ color: getConfidenceColor(el.confidence) }}
            >
              {el.confidence}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
