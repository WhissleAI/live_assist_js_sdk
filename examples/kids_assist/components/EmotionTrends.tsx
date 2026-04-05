import React from "react";
import type { EmotionTrend } from "../lib/insights";

interface Props {
  trends: EmotionTrend[];
  thisWeekEmotions: Record<string, number>;
  lastWeekEmotions: Record<string, number>;
}

const EMOTION_COLORS: Record<string, string> = {
  HAPPY: "#facc15",
  SAD: "#3b82f6",
  ANGRY: "#ef4444",
  FEAR: "#8b5cf6",
  SURPRISE: "#f97316",
  DISGUST: "#22c55e",
  NEUTRAL: "#9ca3af",
};

export default function EmotionTrends({ trends, thisWeekEmotions, lastWeekEmotions }: Props) {
  if (trends.length === 0) {
    return (
      <div className="trends-empty">
        <p>Emotional trends will appear after a few sessions.</p>
      </div>
    );
  }

  const recent = trends.slice(-10);
  const allEmotions = new Set<string>();
  for (const w of [thisWeekEmotions, lastWeekEmotions]) {
    for (const k of Object.keys(w)) allEmotions.add(k);
  }

  const totalThis = Object.values(thisWeekEmotions).reduce((a, b) => a + b, 0) || 1;
  const totalLast = Object.values(lastWeekEmotions).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="emotion-trends">
      <div className="trends-timeline">
        {recent.map((t, i) => {
          const color = EMOTION_COLORS[t.dominant] ?? "#9ca3af";
          const d = new Date(t.date);
          const label = `${d.getMonth() + 1}/${d.getDate()}`;
          return (
            <div key={i} className="trends-bar" title={`${t.dominant} (${Math.round(t.avgConfidence * 100)}%)`}>
              <div
                className="trends-bar-fill"
                style={{ background: color, height: `${Math.max(20, t.avgConfidence * 100)}%` }}
              />
              <span className="trends-bar-label">{label}</span>
            </div>
          );
        })}
      </div>

      {allEmotions.size > 0 && (
        <div className="trends-comparison">
          <div className="trends-week">
            <h4>This week</h4>
            <div className="trends-pills">
              {[...allEmotions].map((e) => (
                <span key={e} className="trends-pill" style={{ background: `${EMOTION_COLORS[e] ?? "#9ca3af"}30`, color: EMOTION_COLORS[e] ?? "#9ca3af" }}>
                  {e.charAt(0) + e.slice(1).toLowerCase()} {Math.round(((thisWeekEmotions[e] ?? 0) / totalThis) * 100)}%
                </span>
              ))}
            </div>
          </div>
          {Object.keys(lastWeekEmotions).length > 0 && (
            <div className="trends-week">
              <h4>Last week</h4>
              <div className="trends-pills">
                {[...allEmotions].map((e) => (
                  <span key={e} className="trends-pill" style={{ background: `${EMOTION_COLORS[e] ?? "#9ca3af"}30`, color: EMOTION_COLORS[e] ?? "#9ca3af" }}>
                    {e.charAt(0) + e.slice(1).toLowerCase()} {Math.round(((lastWeekEmotions[e] ?? 0) / totalLast) * 100)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
