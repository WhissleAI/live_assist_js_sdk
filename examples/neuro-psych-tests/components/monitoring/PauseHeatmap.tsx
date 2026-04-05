import React from "react";
import type { PauseEvent } from "@whissle/live-assist-core";

interface Props {
  pauses: PauseEvent[];
  durationSec: number;
}

export default function PauseHeatmap({ pauses, durationSec }: Props) {
  if (!pauses.length) {
    return (
      <div className="card">
        <div className="card-header"><h2>Pause Distribution</h2></div>
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 20, fontSize: "0.85rem" }}>No pauses detected yet</p>
      </div>
    );
  }

  const bins = 20;
  const binSize = Math.max(1, durationSec / bins);
  const counts = new Array(bins).fill(0);
  const durations = new Array(bins).fill(0);

  for (const p of pauses) {
    const idx = Math.min(bins - 1, Math.floor(p.start / binSize));
    counts[idx]++;
    durations[idx] += p.duration;
  }

  const maxDur = Math.max(...durations, 0.1);

  return (
    <div className="card">
      <div className="card-header"><h2>Pause Distribution</h2></div>
      <div style={{ display: "flex", gap: 1, height: 40, alignItems: "flex-end" }}>
        {durations.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${(d / maxDur) * 100}%`,
              minHeight: d > 0 ? 2 : 0,
              background: d > 1.5 ? "var(--danger)" : d > 0.5 ? "var(--warning)" : "var(--accent)",
              borderRadius: 2,
            }}
            title={`${Math.round(i * binSize)}–${Math.round((i + 1) * binSize)}s: ${counts[i]} pauses, ${d.toFixed(1)}s total`}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
        <span>0s</span>
        <span>{Math.round(durationSec)}s</span>
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 8 }}>
        Total: {pauses.length} pauses &middot; {pauses.reduce((s, p) => s + p.duration, 0).toFixed(1)}s
      </div>
    </div>
  );
}
