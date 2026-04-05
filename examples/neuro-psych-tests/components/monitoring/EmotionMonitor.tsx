import React from "react";
import type { StreamTranscriptSegment } from "@whissle/live-assist-core";

interface Props {
  segments: StreamTranscriptSegment[];
}

const EMOTION_COLORS: Record<string, string> = {
  NEUTRAL: "#94a3b8",
  HAPPY: "#22c55e",
  SAD: "#3b82f6",
  ANGRY: "#ef4444",
  FEAR: "#a855f7",
  SURPRISE: "#f59e0b",
  DISGUST: "#6b7280",
};

export default function EmotionMonitor({ segments }: Props) {
  const emotions = segments
    .filter((s) => s.metadata?.emotion)
    .slice(-20)
    .map((s) => s.metadata!.emotion!.toUpperCase());

  const counts: Record<string, number> = {};
  for (const e of emotions) counts[e] = (counts[e] || 0) + 1;
  const total = emotions.length || 1;

  return (
    <div className="card">
      <div className="card-header"><h2>Affect Monitor</h2></div>
      <div style={{ display: "flex", gap: 4, height: 24, borderRadius: 4, overflow: "hidden" }}>
        {Object.entries(counts).map(([emotion, count]) => (
          <div
            key={emotion}
            style={{
              flex: count / total,
              background: EMOTION_COLORS[emotion] || "#94a3b8",
              minWidth: 2,
            }}
            title={`${emotion}: ${Math.round((count / total) * 100)}%`}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", fontSize: "0.75rem" }}>
        {Object.entries(counts).map(([emotion, count]) => (
          <span key={emotion} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: EMOTION_COLORS[emotion] || "#94a3b8", display: "inline-block" }} />
            {emotion} ({Math.round((count / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}
