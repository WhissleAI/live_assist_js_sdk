import React, { useState } from "react";
import { VOICE_CATALOG, type VoiceEntry } from "../lib/voice-catalog";

interface Props {
  selectedId: string;
  onSelect: (voice: VoiceEntry) => void;
}

export default function VoicePicker({ selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<"all" | "male" | "female">("all");
  const filtered = filter === "all" ? VOICE_CATALOG : VOICE_CATALOG.filter((v) => v.gender === filter);

  return (
    <div className="voice-picker">
      <div className="voice-filter-bar">
        {(["all", "female", "male"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`voice-filter-btn ${filter === f ? "voice-filter-btn--active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "female" ? "Female" : "Male"}
          </button>
        ))}
      </div>
      <div className="voice-grid">
        {filtered.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`voice-card ${selectedId === v.id ? "voice-card--selected" : ""}`}
            onClick={() => onSelect(v)}
          >
            <span className="voice-card-gender">
              {v.gender === "female" ? "♀" : v.gender === "male" ? "♂" : "◎"}
            </span>
            <span className="voice-card-name">{v.name}</span>
            <span className="voice-card-desc">{v.description}</span>
            <span className="voice-card-accent">{v.accent}</span>
            {selectedId === v.id && <span className="voice-card-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
