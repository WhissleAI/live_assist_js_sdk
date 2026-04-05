import React from "react";
import { EMOTION_COLORS } from "@whissle/live-assist-core";
import type { EmotionTimelineEntry } from "../App";

interface Props {
  timeline: EmotionTimelineEntry[];
}

export default function EmotionTimeline({ timeline }: Props) {
  if (timeline.length < 2) {
    return (
      <div className="timeline-empty">
        <span className="timeline-empty-text">Emotion timeline will appear as the user speaks...</span>
      </div>
    );
  }

  const segments: { emotion: string; weight: number }[] = [];
  for (const entry of timeline) {
    const last = segments[segments.length - 1];
    if (last && last.emotion === entry.emotion) {
      last.weight += 1;
    } else {
      segments.push({ emotion: entry.emotion, weight: 1 });
    }
  }

  const total = timeline.length;

  return (
    <div className="emotion-timeline">
      <div className="timeline-bar">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="timeline-segment"
            style={{
              width: `${(seg.weight / total) * 100}%`,
              background: EMOTION_COLORS[seg.emotion] || "#9ca3af",
            }}
            title={`${seg.emotion}: ${seg.weight} samples`}
          />
        ))}
      </div>
      <div className="timeline-legend">
        {Array.from(new Set(segments.map((s) => s.emotion))).map((emo) => (
          <span key={emo} className="timeline-legend-item">
            <span className="timeline-legend-dot" style={{ background: EMOTION_COLORS[emo] || "#9ca3af" }} />
            {emo.charAt(0) + emo.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
