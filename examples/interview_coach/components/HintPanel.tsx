import React, { useEffect, useRef, useState } from "react";
import type { Hint } from "../lib/hints";

interface Props {
  hints: Hint[];
}

const TYPE_LABELS: Record<string, string> = {
  delivery: "Delivery",
  content: "Content",
  meta: "Insight",
  alignment: "JD Fit",
  pause: "Pacing",
  stability: "Voice",
};

export default function HintPanel({ hints }: Props) {
  const [visible, setVisible] = useState<Hint[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    if (hints.length > 0) {
      setVisible(hints);
      timerRef.current = setTimeout(() => { setVisible([]); timerRef.current = null; }, 10000);
    } else {
      setVisible([]);
    }

    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [hints]);

  if (visible.length === 0) {
    return (
      <div className="hint-panel" role="region" aria-label="Coaching hints" aria-live="polite">
        <div className="hint-panel-header">
          <span className="hint-panel-title">Coaching Hints</span>
        </div>
        <div className="hint-empty">Hints will appear as you speak...</div>
      </div>
    );
  }

  return (
    <div className="hint-panel" role="region" aria-label="Coaching hints" aria-live="polite">
      <div className="hint-panel-header">
        <span className="hint-panel-title">Coaching Hints</span>
      </div>
      {visible.map((hint) => (
        <div key={hint.id} className={`hint-card hint-card--${hint.color}`}>
          <div className="hint-card-header">
            <span className="hint-icon">{hint.icon}</span>
            <span className="hint-type">{TYPE_LABELS[hint.type] ?? hint.type}</span>
          </div>
          <p className="hint-text">{hint.text}</p>
        </div>
      ))}
    </div>
  );
}
