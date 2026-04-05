import React from "react";
import { useDelayTimer } from "../hooks/useDelayTimer";

interface Props {
  onResume: () => void;
  onSkip: () => void;
}

export default function DelayScreen({ onResume, onSkip }: Props) {
  const delay = useDelayTimer(20 * 60);

  React.useEffect(() => {
    if (!delay.isActive) delay.startDelay();
  }, []);

  React.useEffect(() => {
    if (delay.isComplete) onResume();
  }, [delay.isComplete, onResume]);

  return (
    <div className="app-content">
      <div className="card" style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div className="card-header" style={{ justifyContent: "center" }}>
          <h2>Delay Interval</h2>
        </div>

        <div className={`timer-display ${delay.remainingSec < 120 ? "warning" : ""}`}>
          {delay.formatTime(delay.remainingSec)}
        </div>

        <div className="progress-bar" style={{ margin: "20px 0" }}>
          <div className="fill" style={{ width: `${delay.progress * 100}%` }} />
        </div>

        <p style={{ color: "var(--text-secondary)", margin: "20px 0", lineHeight: 1.8 }}>
          A 20-minute delay is required between immediate and delayed recall.
          During this time, administer non-memory tests such as:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "16px auto", maxWidth: 300 }}>
          <div style={{ padding: "10px 16px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
            Trail Making Test (Part A &amp; B)
          </div>
          <div style={{ padding: "10px 16px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
            Letter Fluency (F, L)
          </div>
          <div style={{ padding: "10px 16px", background: "var(--bg-surface-alt)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem" }}>
            Benson Complex Figure Copy
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={() => { delay.cancelDelay(); onSkip(); }}>
            Skip Delay (not recommended)
          </button>
        </div>
      </div>
    </div>
  );
}
