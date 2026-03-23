import React from "react";
import type { AnswerScore } from "../lib/scoring";

interface Props {
  answers: AnswerScore[];
}

const EMOTION_COLORS: Record<string, string> = {
  HAPPY: "#16a34a",
  SURPRISE: "#6366f1",
  NEUTRAL: "#9198a8",
  SAD: "#d97706",
  FEAR: "#dc2626",
  ANGER: "#dc2626",
  ANGRY: "#dc2626",
  DISGUST: "#d97706",
};

function getEmotionColor(emotion: string): string {
  return EMOTION_COLORS[emotion.toUpperCase()] ?? "#9198a8";
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

export default function EmotionHeatmap({ answers }: Props) {
  if (answers.length === 0) return null;

  return (
    <div className="emotion-heatmap">
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
        {["HAPPY", "NEUTRAL", "SAD", "FEAR"].map((e) => (
          <span key={e} className="emotion-heatmap-legend-item">
            <span className="emotion-heatmap-legend-dot" style={{ background: getEmotionColor(e) }} />
            {e === "HAPPY" ? "Confident" : e === "NEUTRAL" ? "Neutral" : e === "SAD" ? "Uncertain" : "Nervous"}
          </span>
        ))}
      </div>
    </div>
  );
}
