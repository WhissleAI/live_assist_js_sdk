import React from "react";
import type { AlignmentState } from "../lib/entity-tracker";

interface Props {
  alignment: AlignmentState;
}

export default function JdAlignmentMeter({ alignment }: Props) {
  const { matches, coveragePercent } = alignment;
  if (matches.length === 0) return null;

  const color = coveragePercent >= 60 ? "var(--color-success)" : coveragePercent >= 30 ? "var(--color-warning)" : "var(--color-danger)";

  return (
    <div className="jd-meter" role="region" aria-label={`JD alignment: ${coveragePercent}% coverage`}>
      <div className="jd-meter-header">
        <span className="jd-meter-title">JD Alignment</span>
        <span className="jd-meter-pct" style={{ color }}>{coveragePercent}%</span>
      </div>
      <div className="jd-meter-bar-track">
        <div className="jd-meter-bar-fill" style={{ width: `${coveragePercent}%`, background: color }} />
      </div>
      <div className="jd-meter-pills">
        {matches.map((m) => (
          <span
            key={m.skill}
            className={`jd-meter-pill ${m.mentioned ? "jd-meter-pill--hit" : ""}`}
            title={m.mentioned ? `Mentioned ${m.mentionCount}x` : "Not mentioned yet"}
          >
            {m.skill}
          </span>
        ))}
      </div>
    </div>
  );
}
