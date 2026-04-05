import React from "react";
import type { TestConfig } from "../lib/types";
import LiveTranscript from "./monitoring/LiveTranscript";
import type { WordTimestamp } from "@whissle/live-assist-core";

interface Props {
  config: TestConfig;
  isRecording: boolean;
  elapsedSec: number;
  wordCount: number;
  words: WordTimestamp[];
  transcript: string;
  onStart: () => void;
  onStop: () => void;
  onScore: () => void;
  children?: React.ReactNode;
  testIndex: number;
  totalTests: number;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TestShell({
  config, isRecording, elapsedSec, wordCount, words, transcript,
  onStart, onStop, onScore, children, testIndex, totalTests,
}: Props) {
  const remaining = config.duration_sec ? Math.max(0, config.duration_sec - elapsedSec) : null;
  const timerClass = remaining !== null && remaining <= 10 ? "danger" : remaining !== null && remaining <= 20 ? "warning" : "";

  return (
    <div className="app-content">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>{config.label}</h2>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Test {testIndex + 1} of {totalTests} &middot; {config.domain}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="badge badge-info">{wordCount} words</span>
        </div>
      </div>

      <div className="progress-bar" style={{ marginBottom: 20 }}>
        <div className="fill" style={{ width: `${((testIndex) / totalTests) * 100}%` }} />
      </div>

      <div className="test-shell">
        <div className="test-main">
          <div className="instructions-panel">
            <h3>Instructions</h3>
            {config.instructions}
          </div>

          {children}

          <div className={`timer-display ${timerClass}`}>
            {remaining !== null ? formatTime(remaining) : formatTime(elapsedSec)}
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            {!isRecording && !transcript && (
              <button className="btn btn-primary btn-lg" onClick={onStart}>Start Recording</button>
            )}
            {isRecording && (
              <button className="btn btn-danger btn-lg" onClick={onStop}>Stop Recording</button>
            )}
            {!isRecording && transcript && (
              <button className="btn btn-success btn-lg" onClick={onScore}>Score &amp; Continue</button>
            )}
          </div>
        </div>

        <div className="test-sidebar">
          <LiveTranscript words={words} transcript={transcript} />
        </div>
      </div>
    </div>
  );
}
