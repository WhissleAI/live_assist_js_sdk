import React from "react";
import { MODE_META, ALL_MODES, type KidsMode } from "../lib/modes";

interface Props {
  onSelect: (mode: KidsMode) => void;
}

export default function ModeSelector({ onSelect }: Props) {
  return (
    <div className="mode-selector">
      <h1 className="mode-selector-title">What do you want to do?</h1>
      <div className="mode-grid">
        {ALL_MODES.map((m) => {
          const meta = MODE_META[m];
          const isPrimary = m === "kids_free_talk";
          return (
            <button
              key={m}
              type="button"
              className={`mode-card ${isPrimary ? "mode-card--primary" : ""}`}
              style={{ "--mode-color": meta.color } as React.CSSProperties}
              onClick={() => onSelect(m)}
            >
              <span className="mode-card-icon">{meta.icon}</span>
              <span className="mode-card-label">{meta.label}</span>
              <span className="mode-card-desc">{meta.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
