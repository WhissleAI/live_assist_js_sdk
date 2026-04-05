import React from "react";
import type { EmotionTimelineData } from "../hooks/useEmotionTimeline";

const EMOTION_COLORS: Record<string, string> = {
  HAPPY: "#16a34a",
  SURPRISE: "#8b5cf6",
  NEUTRAL: "#9198a8",
  SAD: "#3b82f6",
  FEAR: "#f59e0b",
  ANGRY: "#ef4444",
  ANGER: "#ef4444",
  DISGUST: "#d97706",
};

function getColor(emotion: string): string {
  return EMOTION_COLORS[emotion.toUpperCase()] ?? "#9198a8";
}

interface TrackProps {
  label: string;
  points: Array<{ timestamp: number; emotion: string; confidence: number }>;
  color: string;
}

function EmotionTrack({ label, points, color }: TrackProps) {
  if (points.length === 0) {
    return (
      <div className="emotion-track">
        <span className="emotion-track-label" style={{ color }}>{label}</span>
        <div className="emotion-track-bar emotion-track-bar--empty">
          Waiting for speech...
        </div>
      </div>
    );
  }

  const maxTime = Math.max(...points.map((p) => p.timestamp), 1);

  // Build segments from consecutive points
  const segments: Array<{ emotion: string; startPct: number; widthPct: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const startPct = (curr.timestamp / maxTime) * 100;
    const endPct = next ? (next.timestamp / maxTime) * 100 : 100;
    segments.push({
      emotion: curr.emotion,
      startPct,
      widthPct: endPct - startPct,
    });
  }

  return (
    <div className="emotion-track">
      <span className="emotion-track-label" style={{ color }}>{label}</span>
      <div className="emotion-track-bar">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="emotion-track-segment"
            style={{
              left: `${seg.startPct}%`,
              width: `${Math.max(seg.widthPct, 0.5)}%`,
              backgroundColor: getColor(seg.emotion),
            }}
            title={seg.emotion}
          />
        ))}
      </div>
    </div>
  );
}

interface Props {
  timeline: EmotionTimelineData;
}

export default function EmotionTimeline({ timeline }: Props) {
  return (
    <div className="emotion-timeline">
      <div className="emotion-timeline-header">
        <span>Emotion Flow</span>
        <div className="emotion-legend">
          {Object.entries(EMOTION_COLORS).slice(0, 6).map(([emotion, color]) => (
            <span key={emotion} className="emotion-legend-item">
              <span className="emotion-legend-dot" style={{ backgroundColor: color }} />
              {emotion.charAt(0) + emotion.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
      </div>
      <EmotionTrack label="You" points={timeline.you} color="#8b5cf6" />
      <EmotionTrack label="Them" points={timeline.them} color="#ec4899" />
    </div>
  );
}
