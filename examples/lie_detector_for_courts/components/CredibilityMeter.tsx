import React from "react";

interface Props {
  score: number;
  vocalStability: number;
  emotion: string;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "var(--color-green)";
  if (score >= 45) return "var(--color-amber)";
  return "var(--color-red)";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "High Credibility";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "Questionable";
  return "Low Credibility";
}

const EMOTION_INDICATORS: Record<string, { icon: string; label: string }> = {
  NEUTRAL: { icon: "\u2014", label: "Calm" },
  HAPPY: { icon: "\u25B2", label: "Positive" },
  SAD: { icon: "\u25BC", label: "Distressed" },
  ANGRY: { icon: "\u26A0", label: "Agitated" },
  FEAR: { icon: "\u25BC", label: "Anxious" },
  DISGUST: { icon: "\u25AC", label: "Contempt" },
  SURPRISE: { icon: "\u25C6", label: "Startled" },
};

export default function CredibilityMeter({ score, vocalStability, emotion }: Props) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const emotionInfo = EMOTION_INDICATORS[emotion] ?? EMOTION_INDICATORS.NEUTRAL;

  return (
    <div className="credibility-meter">
      <div className="credibility-meter-header">
        <span className="credibility-meter-title">Witness Credibility</span>
        <span
          className="credibility-meter-score"
          style={{ color }}
        >
          {score}
        </span>
      </div>

      <div className="credibility-meter-bar-track">
        <div
          className="credibility-meter-bar-fill"
          style={{ width: `${score}%`, background: color }}
        />
      </div>

      <span className="credibility-meter-label" style={{ color }}>
        {label}
      </span>

      <div className="credibility-meter-details">
        <div className="credibility-detail">
          <span className="credibility-detail-label">Vocal Stability</span>
          <span
            className="credibility-detail-value"
            style={{ color: getScoreColor(vocalStability) }}
          >
            {vocalStability}%
          </span>
        </div>
        <div className="credibility-detail">
          <span className="credibility-detail-label">Demeanor</span>
          <span className="credibility-detail-value">
            {emotionInfo.icon} {emotionInfo.label}
          </span>
        </div>
      </div>
    </div>
  );
}
