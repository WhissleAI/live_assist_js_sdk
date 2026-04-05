import React from "react";
import type { InterestSignal } from "../lib/interest-signals";
import { getSignalColor, getSignalIcon } from "../lib/interest-signals";

interface Props {
  signals: InterestSignal[];
}

export default function InterestSignals({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <div className="interest-signals">
        <h3 className="interest-signals-title">Interest Signals</h3>
        <p className="interest-signals-empty">Analyzing conversation dynamics...</p>
      </div>
    );
  }

  return (
    <div className="interest-signals">
      <h3 className="interest-signals-title">Interest Signals</h3>
      <div className="interest-signals-list">
        {signals.map((signal, i) => (
          <div
            key={i}
            className={`interest-signal interest-signal--${signal.type}`}
            style={{ borderLeftColor: getSignalColor(signal.type) }}
          >
            <span className="interest-signal-icon">{getSignalIcon(signal.type)}</span>
            <div className="interest-signal-content">
              <strong>{signal.label}</strong>
              <span>{signal.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
