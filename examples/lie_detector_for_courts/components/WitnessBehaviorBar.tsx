import React, { useMemo } from "react";
import type { TranscriptSegment } from "../lib/types";

interface Props {
  segments: TranscriptSegment[];
}

const EMOTION_COLORS: Record<string, string> = {
  NEUTRAL: "#64748b",
  HAPPY: "#22c55e",
  SAD: "#3b82f6",
  ANGRY: "#ef4444",
  FEAR: "#f59e0b",
  DISGUST: "#a855f7",
  SURPRISE: "#06b6d4",
};

interface EmotionSpan {
  emotion: string;
  weight: number;
  color: string;
}

export default function WitnessBehaviorBar({ segments }: Props) {
  const spans = useMemo<EmotionSpan[]>(() => {
    const witnessSegs = segments.filter((s) => s.isFinal && s.speaker === "WITNESS");
    if (witnessSegs.length === 0) return [];

    const collapsed: EmotionSpan[] = [];
    let current: EmotionSpan | null = null;

    for (const seg of witnessSegs) {
      const emo = seg.emotion || "NEUTRAL";
      if (current && current.emotion === emo) {
        current.weight++;
      } else {
        if (current) collapsed.push(current);
        current = {
          emotion: emo,
          weight: 1,
          color: EMOTION_COLORS[emo] ?? EMOTION_COLORS.NEUTRAL,
        };
      }
    }
    if (current) collapsed.push(current);
    return collapsed;
  }, [segments]);

  const totalWeight = spans.reduce((s, sp) => s + sp.weight, 0);

  if (spans.length === 0) {
    return (
      <div className="behavior-bar">
        <span className="behavior-bar-label">Witness Emotion</span>
        <div className="behavior-bar-track">
          <div
            className="behavior-bar-segment"
            style={{ width: "100%", background: EMOTION_COLORS.NEUTRAL, opacity: 0.3 }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="behavior-bar">
      <span className="behavior-bar-label">Witness Emotion Timeline</span>
      <div className="behavior-bar-track">
        {spans.map((sp, i) => (
          <div
            key={i}
            className="behavior-bar-segment"
            style={{
              width: `${(sp.weight / totalWeight) * 100}%`,
              background: sp.color,
            }}
            title={`${sp.emotion} (${sp.weight} segments)`}
          />
        ))}
      </div>
      <div className="behavior-bar-legend">
        {Object.entries(
          spans.reduce<Record<string, number>>((acc, sp) => {
            acc[sp.emotion] = (acc[sp.emotion] ?? 0) + sp.weight;
            return acc;
          }, {}),
        )
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4)
          .map(([emo, count]) => (
            <span
              key={emo}
              className="behavior-bar-legend-item"
              style={{ color: EMOTION_COLORS[emo] ?? "#64748b" }}
            >
              {emo} {Math.round((count / totalWeight) * 100)}%
            </span>
          ))}
      </div>
    </div>
  );
}
