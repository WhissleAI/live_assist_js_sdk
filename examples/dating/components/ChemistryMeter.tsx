import React from "react";
import type { ChemistrySnapshot } from "../lib/chemistry";

interface Props {
  chemistry: ChemistrySnapshot;
}

function getChemistryLabel(score: number): string {
  if (score >= 80) return "Amazing Chemistry";
  if (score >= 65) return "Strong Connection";
  if (score >= 50) return "Good Vibes";
  if (score >= 35) return "Warming Up";
  if (score >= 20) return "Getting Started";
  return "Ice Breaking";
}

function getChemistryColor(score: number): string {
  if (score >= 80) return "#ef4444";
  if (score >= 65) return "#f97316";
  if (score >= 50) return "#eab308";
  if (score >= 35) return "#22c55e";
  return "#6b7280";
}

function getTrendIcon(trend: ChemistrySnapshot["trend"]): string {
  switch (trend) {
    case "rising": return "\u2191";
    case "falling": return "\u2193";
    case "stable": return "\u2192";
  }
}

export default function ChemistryMeter({ chemistry }: Props) {
  const color = getChemistryColor(chemistry.overall);

  return (
    <div className="chemistry-meter">
      <div className="chemistry-main">
        <div className="chemistry-gauge">
          <svg viewBox="0 0 120 120" className="chemistry-ring">
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="#1e1e2e"
              strokeWidth="8"
            />
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(chemistry.overall / 100) * 327} 327`}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          </svg>
          <div className="chemistry-score">
            <span className="chemistry-number">{chemistry.overall}</span>
            <span className="chemistry-trend" style={{ color }}>
              {getTrendIcon(chemistry.trend)}
            </span>
          </div>
        </div>
        <span className="chemistry-label" style={{ color }}>
          {getChemistryLabel(chemistry.overall)}
        </span>
      </div>

      <div className="chemistry-breakdown">
        <ChemistryBar label="Engagement" value={chemistry.engagement} />
        <ChemistryBar label="Positivity" value={chemistry.positivity} />
        <ChemistryBar label="Balance" value={chemistry.turnBalance} />
        <ChemistryBar label="Alignment" value={chemistry.emotionAlignment} />
      </div>
    </div>
  );
}

function ChemistryBar({ label, value }: { label: string; value: number }) {
  const color = value >= 60 ? "#22c55e" : value >= 40 ? "#eab308" : "#ef4444";
  return (
    <div className="chemistry-bar-row">
      <span className="chemistry-bar-label">{label}</span>
      <div className="chemistry-bar-track">
        <div
          className="chemistry-bar-fill"
          style={{ width: `${value}%`, backgroundColor: color, transition: "width 0.5s ease" }}
        />
      </div>
      <span className="chemistry-bar-value">{value}</span>
    </div>
  );
}
