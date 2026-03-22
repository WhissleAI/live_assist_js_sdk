import React from "react";
import { EMOTION_COLORS } from "@whissle/live-assist-core";
import type { Moment } from "../App";

interface Props {
  moments: Moment[];
  sessionStart: number | null;
}

const TYPE_ICONS: Record<string, string> = {
  emotion_peak: "💡",
  topic: "🏷️",
  speaker_change: "🔄",
  question: "❓",
};

const TYPE_LABELS: Record<string, string> = {
  emotion_peak: "Emotional moment",
  topic: "New topic",
  speaker_change: "Speaker changed",
  question: "Question asked",
};

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function MomentsPanel({ moments, sessionStart }: Props) {
  if (moments.length === 0) {
    return (
      <div className="moments-empty">
        <div className="moments-empty-icon">💡</div>
        <p>Key moments will appear here as your child speaks.</p>
        <p className="moments-empty-sub">We detect emotional peaks, questions, and speaker changes.</p>
      </div>
    );
  }

  return (
    <div className="moments-list">
      {moments.map((m) => {
        const elapsed = sessionStart ? m.timestamp - sessionStart : 0;
        const borderColor = EMOTION_COLORS[m.emotion] || "#9ca3af";

        return (
          <div key={m.id} className="moment-card" style={{ borderLeftColor: borderColor }}>
            <div className="moment-header">
              <span className="moment-icon">{TYPE_ICONS[m.type] || "📌"}</span>
              <span className="moment-type">{TYPE_LABELS[m.type] || m.type}</span>
              <span className="moment-time">{formatTime(elapsed)}</span>
              <span className="moment-speaker">{m.speaker === "child" ? "Child" : "Other"}</span>
            </div>
            <div className="moment-text">{m.text}</div>
            <div className="moment-meta">
              <span className="moment-emotion" style={{ color: borderColor }}>
                {m.emotion.charAt(0) + m.emotion.slice(1).toLowerCase()}
                {m.emotionConfidence > 0 && ` (${(m.emotionConfidence * 100).toFixed(0)}%)`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
