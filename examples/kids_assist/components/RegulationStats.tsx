import React from "react";
import type { RegulationStat } from "../lib/insights";

interface Props {
  stats: RegulationStat;
}

export default function RegulationStats({ stats }: Props) {
  if (stats.totalSessions === 0) {
    return null;
  }

  const effectivenessPercent = Math.round(stats.avgEffectiveness * 100);

  return (
    <div className="regulation-stats">
      <div className="reg-stat-grid">
        <div className="reg-stat-card">
          <span className="reg-stat-value">{stats.autoTriggered}</span>
          <span className="reg-stat-label">Calm sessions</span>
        </div>
        <div className="reg-stat-card">
          <span className="reg-stat-value">{effectivenessPercent}%</span>
          <span className="reg-stat-label">Effective</span>
        </div>
        {stats.bestTechnique && (
          <div className="reg-stat-card">
            <span className="reg-stat-value reg-stat-value--text">{stats.bestTechnique}</span>
            <span className="reg-stat-label">Best technique</span>
          </div>
        )}
      </div>
      {effectivenessPercent > 50 && (
        <p className="reg-stat-insight">
          Calm Corner exercises have been effective {effectivenessPercent}% of the time
          {stats.bestTechnique ? `. ${stats.bestTechnique.charAt(0).toUpperCase() + stats.bestTechnique.slice(1)} works best for your child.` : "."}
        </p>
      )}
    </div>
  );
}
