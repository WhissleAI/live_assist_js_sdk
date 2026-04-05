import React from "react";
import type { TopicFrequency } from "../lib/insights";

interface Props {
  topics: TopicFrequency[];
}

const PALETTE = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function InterestMap({ topics }: Props) {
  if (topics.length === 0) {
    return (
      <div className="interest-empty">
        <p>Topics discussed will appear here over time.</p>
      </div>
    );
  }

  const maxCount = topics[0]?.count ?? 1;

  return (
    <div className="interest-map">
      {topics.map((t, i) => {
        const size = 0.7 + (t.count / maxCount) * 0.6;
        const color = PALETTE[i % PALETTE.length];
        return (
          <span
            key={t.topic}
            className="interest-tag"
            style={{
              fontSize: `${size}rem`,
              background: `${color}18`,
              color,
              borderColor: `${color}40`,
            }}
          >
            {t.topic}
            <span className="interest-count">{t.count}</span>
          </span>
        );
      })}
    </div>
  );
}
