import React, { useState } from "react";
import type { TestType } from "../lib/types";
import { TEST_CONFIGS, BATTERY_PRESETS } from "../lib/types";

interface Props {
  onSelect: (tests: TestType[]) => void;
  onBack: () => void;
}

export default function BatterySelection({ onSelect, onBack }: Props) {
  const [selected, setSelected] = useState<Set<TestType>>(new Set());

  const toggle = (t: TestType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const applyPreset = (key: string) => {
    const preset = BATTERY_PRESETS[key];
    if (preset) setSelected(new Set(preset.tests));
  };

  const orderedTests = Object.values(TEST_CONFIGS);
  const estimatedMin = Math.round(selected.size * 3.5);

  return (
    <div className="app-content">
      <div className="card" style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="card-header">
          <h2>Test Battery Selection</h2>
          <span className="badge badge-info">{selected.size} tests &middot; ~{estimatedMin} min</span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {Object.entries(BATTERY_PRESETS).map(([key, preset]) => (
            <button key={key} className="btn btn-secondary btn-sm" onClick={() => applyPreset(key)}>
              {preset.label} (~{preset.est_minutes}m)
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Clear All</button>
        </div>

        <div className="battery-grid">
          {orderedTests.map((cfg) => (
            <label key={cfg.type} className={`battery-item ${selected.has(cfg.type) ? "selected" : ""}`}>
              <input type="checkbox" checked={selected.has(cfg.type)} onChange={() => toggle(cfg.type)} />
              <div>
                <div style={{ fontWeight: 500 }}>{cfg.label}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "capitalize" }}>
                  {cfg.domain} &middot; {cfg.duration_sec ? `${cfg.duration_sec}s` : "Untimed"}
                </div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between" }}>
          <button className="btn btn-secondary" onClick={onBack}>Back</button>
          <button className="btn btn-primary btn-lg" disabled={selected.size === 0} onClick={() => onSelect(Array.from(selected))}>
            Begin Testing ({selected.size} tests)
          </button>
        </div>
      </div>
    </div>
  );
}
