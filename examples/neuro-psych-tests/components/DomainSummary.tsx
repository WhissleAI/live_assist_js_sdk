import React from "react";
import type { DomainScore } from "../lib/types";

interface Props {
  domains: DomainScore[];
}

const DOMAIN_LABELS: Record<string, string> = {
  memory: "Memory",
  language: "Language",
  executive: "Executive Function",
  attention: "Attention",
  visuospatial: "Visuospatial",
};

function classColor(cls: string): string {
  if (cls.includes("Normal") && !cls.includes("Low")) return "var(--success)";
  if (cls.includes("Low") || cls.includes("Borderline")) return "var(--warning)";
  if (cls.includes("Insufficient")) return "var(--text-muted)";
  return "var(--danger)";
}

export default function DomainSummary({ domains }: Props) {
  const svgSize = 280;
  const center = svgSize / 2;
  const maxR = 110;
  const levels = 5;

  const validDomains = domains.filter((d) => d.z_scores.length > 0);
  const n = validDomains.length;

  const polygon = (radius: number) => {
    const points: string[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      points.push(`${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`);
    }
    return points.join(" ");
  };

  const dataPolygon = () => {
    const points: string[] = [];
    for (let i = 0; i < n; i++) {
      const z = validDomains[i].composite_z;
      const norm = Math.max(0, Math.min(1, (z + 3) / 4));
      const r = norm * maxR;
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      points.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
    }
    return points.join(" ");
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2>Cognitive Domain Profile</h2>
      </div>

      {n > 0 ? (
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
          <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}>
            {Array.from({ length: levels }, (_, l) => (
              <polygon key={l} points={polygon(((l + 1) / levels) * maxR)} fill="none" stroke="var(--border-light)" strokeWidth={1} />
            ))}
            {validDomains.map((_, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              return (
                <line key={i} x1={center} y1={center}
                  x2={center + maxR * Math.cos(angle)} y2={center + maxR * Math.sin(angle)}
                  stroke="var(--border-light)" strokeWidth={1} />
              );
            })}
            <polygon points={dataPolygon()} fill="rgba(26, 77, 143, 0.2)" stroke="var(--accent)" strokeWidth={2} />
            {validDomains.map((d, i) => {
              const z = d.composite_z;
              const norm = Math.max(0, Math.min(1, (z + 3) / 4));
              const r = norm * maxR;
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              const lx = center + (maxR + 20) * Math.cos(angle);
              const ly = center + (maxR + 20) * Math.sin(angle);
              return (
                <g key={i}>
                  <circle cx={center + r * Math.cos(angle)} cy={center + r * Math.sin(angle)} r={4} fill="var(--accent)" />
                  <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fill="var(--text-secondary)" fontSize={10} fontWeight={500}>
                    {DOMAIN_LABELS[d.domain] || d.domain}
                  </text>
                </g>
              );
            })}
          </svg>

          <div style={{ flex: 1, minWidth: 200 }}>
            {domains.map((d) => (
              <div key={d.domain} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                <span style={{ fontWeight: 500 }}>{DOMAIN_LABELS[d.domain] || d.domain}</span>
                <span style={{ color: classColor(d.classification), fontWeight: 500 }}>
                  {d.z_scores.length > 0 ? `z = ${d.composite_z}` : "—"} &middot; {d.classification}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="domain-chart">
          <span style={{ color: "var(--text-muted)" }}>Insufficient data for domain analysis</span>
        </div>
      )}
    </div>
  );
}
