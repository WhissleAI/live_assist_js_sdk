import React from "react";
import { EMOTION_COLORS } from "@whissle/live-assist-core";
import type { EmotionTimelineEntry } from "./App";

interface Props {
  timeline: EmotionTimelineEntry[];
}

export default function LiveEmotionBar({ timeline }: Props) {
  if (timeline.length < 2) return null;

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
    <div className="session-emotion-bar">
      {segments.map((seg, i) => (
        <div
          key={i}
          className="session-emotion-bar-seg"
          style={{
            width: `${(seg.weight / total) * 100}%`,
            background: EMOTION_COLORS[seg.emotion] || "#9ca3af",
          }}
          title={`${seg.emotion}: ${seg.weight}`}
        />
      ))}
    </div>
  );
}
