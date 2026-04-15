import React from "react";

interface Props {
  score: number;
  emotion: string;
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--color-success)";
  if (score >= 45) return "var(--color-warning)";
  return "var(--color-danger)";
}

export default function ConfidencePulse({ score, emotion }: Props) {
  const color = scoreColor(score);
  const size = 40 + (score / 100) * 20;

  return (
    <div className="confidence-pulse" role="status" aria-label={`Confidence: ${score}%, Emotion: ${emotion}`} title={`Confidence: ${score}% | Emotion: ${emotion}`}>
      <div
        className="confidence-pulse-ring"
        style={{
          width: size,
          height: size,
          borderColor: color,
          boxShadow: `0 0 ${score > 70 ? 12 : 6}px ${color}40`,
        }}
      />
      <span className="confidence-pulse-score" style={{ color }}>{score}</span>
    </div>
  );
}
