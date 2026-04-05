import React, { useMemo } from "react";
import { EMOTION_COLORS, EMOTION_KEYS } from "@whissle/live-assist-core";
import type { BehavioralProfile } from "@whissle/live-assist-core";

interface Props {
  profile: BehavioralProfile | null;
}

const LABELS: Record<string, string> = {
  NEUTRAL: "Calm",
  HAPPY: "Happy",
  SAD: "Sad",
  ANGRY: "Angry",
  FEAR: "Worried",
  SURPRISE: "Surprised",
  DISGUST: "Upset",
};

export default function EmotionRadar({ profile }: Props) {
  const bars = useMemo(() => {
    if (!profile || profile.segmentCount < 1) return [];

    const total = EMOTION_KEYS.reduce((s, k) => s + (profile.emotionProfile[k] ?? 0), 0);
    if (total === 0) return [];

    return EMOTION_KEYS
      .map((key) => ({
        key,
        label: LABELS[key] || key,
        value: (profile.emotionProfile[key] ?? 0) / total,
        color: EMOTION_COLORS[key] || "#9ca3af",
      }))
      .filter((b) => b.value > 0.01)
      .sort((a, b) => b.value - a.value);
  }, [profile]);

  if (bars.length === 0) {
    return (
      <div className="radar-empty">
        <span>Emotion profile builds as the user speaks...</span>
      </div>
    );
  }

  return (
    <div className="emotion-radar">
      {bars.map((bar) => (
        <div key={bar.key} className="radar-bar-row">
          <span className="radar-bar-label">{bar.label}</span>
          <div className="radar-bar-track">
            <div
              className="radar-bar-fill"
              style={{
                width: `${Math.max(2, bar.value * 100)}%`,
                background: bar.color,
              }}
            />
          </div>
          <span className="radar-bar-pct">{(bar.value * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}
