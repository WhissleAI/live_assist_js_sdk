import React, { useState } from "react";
import type { StoredSession } from "../lib/session-store";
import SessionPlayback from "./SessionPlayback";

interface Props {
  sessions: StoredSession[];
}

const EMOTION_COLORS: Record<string, string> = {
  HAPPY: "#facc15", SAD: "#3b82f6", ANGRY: "#ef4444", FEAR: "#8b5cf6",
  SURPRISE: "#f97316", DISGUST: "#22c55e", NEUTRAL: "#9ca3af",
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function countAgentSegments(s: StoredSession): number {
  return s.transcript.filter((seg) => seg.speaker === "agent").length;
}

export default function SessionHistory({ sessions }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [playbackId, setPlaybackId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <div className="history-empty"><p>Past sessions will appear here.</p></div>;
  }

  const sorted = [...sessions].reverse();
  const playbackSession = playbackId ? sorted.find((s) => s.id === playbackId) : null;

  if (playbackSession) {
    return (
      <SessionPlayback session={playbackSession} onClose={() => setPlaybackId(null)} />
    );
  }

  return (
    <div className="session-history">
      {sorted.map((s) => {
        const d = new Date(s.date);
        const dateLabel = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const timeLabel = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        const emoColor = EMOTION_COLORS[s.emotionSummary?.dominant] ?? "#9ca3af";
        const isExpanded = expandedId === s.id;
        const agentSegments = countAgentSegments(s);

        return (
          <div key={s.id} className="history-card">
            <button
              type="button"
              className="history-card-header"
              onClick={() => setExpandedId(isExpanded ? null : s.id)}
            >
              <span className="history-mode-icon">🤖</span>
              <div className="history-card-info">
                <span className="history-mode-label">{s.agentName || "Session"}</span>
                <span className="history-date">{dateLabel} at {timeLabel}</span>
              </div>
              <span className="history-duration">{formatDuration(s.durationSec)}</span>
              <span className="history-emotion" style={{ color: emoColor }}>
                {(s.emotionSummary?.dominant ?? "NEUTRAL").charAt(0) + (s.emotionSummary?.dominant ?? "NEUTRAL").slice(1).toLowerCase()}
              </span>
              <span className={`history-chevron ${isExpanded ? "history-chevron--open" : ""}`}>▾</span>
            </button>
            {isExpanded && (
              <div className="history-card-body">
                <div className="history-actions">
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => setPlaybackId(s.id)}
                  >
                    🎧 Play Recording
                  </button>
                  <span className="history-seg-count">
                    {s.transcript.length} segments ({agentSegments} agent)
                  </span>
                </div>
                {s.topicsDiscussed.length > 0 && (
                  <div className="history-topics">
                    <span className="history-label">Topics:</span>
                    {s.topicsDiscussed.map((t, i) => (
                      <span key={i} className="history-topic-tag">{t}</span>
                    ))}
                  </div>
                )}
                {s.flaggedConcerns.length > 0 && (
                  <div className="history-concerns">
                    <span className="history-label">Flagged:</span>
                    {s.flaggedConcerns.map((c, i) => (
                      <span key={i} className="history-concern-tag">{c.text} ({c.severity})</span>
                    ))}
                  </div>
                )}
                {s.transcript.length > 0 && (
                  <div className="history-transcript">
                    {s.transcript.slice(0, 20).map((seg) => (
                      <div key={seg.id} className={`history-seg history-seg--${seg.speaker}`}>
                        <span className={`history-seg-speaker history-seg-speaker--${seg.speaker}`}>
                          {seg.speaker === "user" ? "🗣 User" : seg.speaker === "agent" ? "🤖 Agent" : "Other"}:
                        </span>
                        <span className="history-seg-text">{seg.text}</span>
                      </div>
                    ))}
                    {s.transcript.length > 20 && (
                      <p className="history-more">...and {s.transcript.length - 20} more</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
