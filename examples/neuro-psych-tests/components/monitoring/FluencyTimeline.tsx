import React from "react";
import type { WordTimestamp } from "@whissle/live-assist-core";

interface Props {
  words: WordTimestamp[];
  durationSec: number;
}

export default function FluencyTimeline({ words, durationSec }: Props) {
  const contentWords = words.filter((w) => !w.filler);
  const maxTime = durationSec;
  const maxWords = Math.max(contentWords.length, 1);

  const width = 340;
  const height = 180;
  const pad = { top: 20, right: 10, bottom: 30, left: 35 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const points: [number, number][] = [];
  let cumulative = 0;
  for (const w of contentWords) {
    cumulative++;
    const x = pad.left + (w.start / maxTime) * plotW;
    const y = pad.top + plotH - (cumulative / (maxWords + 2)) * plotH;
    points.push([x, y]);
  }

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");

  // Quartile markers
  const quartiles = [15, 30, 45, 60].filter((q) => q <= maxTime);

  return (
    <div className="card">
      <div className="card-header"><h2>Fluency Timeline</h2></div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%" }}>
        {/* Grid lines */}
        {quartiles.map((q) => {
          const x = pad.left + (q / maxTime) * plotW;
          return <line key={q} x1={x} y1={pad.top} x2={x} y2={pad.top + plotH} stroke="var(--border-light)" strokeDasharray="4" />;
        })}

        {/* Axes */}
        <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke="var(--border)" />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="var(--border)" />

        {/* Axis labels */}
        {quartiles.map((q) => (
          <text key={q} x={pad.left + (q / maxTime) * plotW} y={height - 5} textAnchor="middle" fill="var(--text-muted)" fontSize={10}>{q}s</text>
        ))}
        <text x={5} y={pad.top + plotH / 2} textAnchor="middle" fill="var(--text-muted)" fontSize={10} transform={`rotate(-90, 5, ${pad.top + plotH / 2})`}>Words</text>

        {/* Data line */}
        {points.length > 1 && <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />}

        {/* Data points */}
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" />
        ))}

        {/* Current count */}
        <text x={width - 10} y={pad.top + 5} textAnchor="end" fill="var(--accent)" fontSize={14} fontWeight={700}>
          {contentWords.length}
        </text>
      </svg>
    </div>
  );
}
