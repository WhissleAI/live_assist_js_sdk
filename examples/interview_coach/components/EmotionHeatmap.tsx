import React from "react";
import type { AnswerScore } from "../lib/scoring";

interface Props {
  answers: AnswerScore[];
}

// Map emotions to CSS custom properties so they adapt to dark mode
const EMOTION_CSS_COLORS: Record<string, string> = {
  HAPPY: "var(--color-success)",
  SURPRISE: "var(--color-primary)",
  NEUTRAL: "var(--color-text-dim)",
  SAD: "var(--color-warning)",
  FEAR: "var(--color-danger)",
  ANGER: "var(--color-danger)",
  ANGRY: "var(--color-danger)",
  DISGUST: "var(--color-warning)",
};

function getEmotionColor(emotion: string): string {
  return EMOTION_CSS_COLORS[emotion.toUpperCase()] ?? "var(--color-text-dim)";
}

function buildStrip(timeline: Array<{ offset: number; emotion: string; confidence: number }>): Array<{ emotion: string; color: string; widthPct: number }> {
  if (timeline.length < 2) {
    return [{ emotion: timeline[0]?.emotion ?? "NEUTRAL", color: getEmotionColor(timeline[0]?.emotion ?? "NEUTRAL"), widthPct: 100 }];
  }

  const totalSpan = timeline[timeline.length - 1].offset - timeline[0].offset;
  if (totalSpan <= 0) {
    return [{ emotion: timeline[0].emotion, color: getEmotionColor(timeline[0].emotion), widthPct: 100 }];
  }

  const segments: Array<{ emotion: string; color: string; widthPct: number }> = [];

  for (let i = 0; i < timeline.length - 1; i++) {
    const curr = timeline[i];
    const next = timeline[i + 1];
    const span = next.offset - curr.offset;
    const pct = (span / totalSpan) * 100;
    segments.push({ emotion: curr.emotion, color: getEmotionColor(curr.emotion), widthPct: pct });
  }

  const last = timeline[timeline.length - 1];
  segments.push({ emotion: last.emotion, color: getEmotionColor(last.emotion), widthPct: 0.5 });

  return segments;
}

const LEGEND_ITEMS: Array<{ key: string; label: string }> = [
  { key: "HAPPY", label: "Confident" },
  { key: "SURPRISE", label: "Engaged" },
  { key: "NEUTRAL", label: "Steady" },
  { key: "SAD", label: "Uncertain" },
  { key: "FEAR", label: "Nervous" },
  { key: "ANGER", label: "Frustrated" },
];

export default function EmotionHeatmap({ answers }: Props) {
  if (answers.length === 0) return null;

  const summaryText = answers.map((a, i) => {
    const dominant = a.emotionTimeline.reduce((acc, e) => {
      acc[e.emotion] = (acc[e.emotion] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const top = Object.entries(dominant).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "NEUTRAL";
    return `Q${i + 1}: mostly ${top.toLowerCase()}`;
  }).join(", ");

  return (
    <div className="emotion-heatmap" role="img" aria-label={`Emotion journey across ${answers.length} answers. ${summaryText}`}>
      <h4 className="emotion-heatmap-title">Emotion Journey</h4>
      {answers.map((answer, i) => {
        const strip = buildStrip(answer.emotionTimeline);
        return (
          <div key={i} className="emotion-heatmap-row">
            <span className="emotion-heatmap-label">Q{i + 1}</span>
            <div className="emotion-heatmap-strip">
              {strip.map((seg, j) => (
                <div
                  key={j}
                  className="emotion-heatmap-cell"
                  style={{ width: `${seg.widthPct}%`, background: seg.color }}
                  title={seg.emotion}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="emotion-heatmap-legend">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.key} className="emotion-heatmap-legend-item">
            <span className="emotion-heatmap-legend-dot" style={{ background: getEmotionColor(item.key) }} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
