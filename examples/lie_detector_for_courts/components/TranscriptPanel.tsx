import React, { useEffect, useRef } from "react";
import type { TranscriptSegment } from "../lib/types";

interface Props {
  segments: TranscriptSegment[];
  witnessName: string;
}

const EMOTION_BORDER_COLORS: Record<string, string> = {
  NEUTRAL: "var(--border)",
  HAPPY: "var(--color-green)",
  SAD: "#3b82f6",
  ANGRY: "var(--color-red)",
  FEAR: "var(--color-amber)",
  DISGUST: "#a855f7",
  SURPRISE: "#06b6d4",
};

const INTENT_COLORS: Record<string, string> = {
  INFORM: "var(--color-blue)",
  STATEMENT: "var(--color-blue)",
  QUESTION: "#06b6d4",
  COMMAND: "var(--color-amber)",
  ACKNOWLEDGE: "var(--color-green)",
  COMMIT: "var(--color-green)",
  NEUTRAL: "var(--color-muted)",
};

function formatTimestamp(ts: number, startTime: number): string {
  const elapsed = Math.max(0, Math.floor((ts - startTime) / 1000));
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function TranscriptPanel({ segments, witnessName }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const startTime = segments.length > 0 ? segments[0].timestamp : Date.now();

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [segments]);

  const finalSegments = segments.filter((s) => s.isFinal);
  const lastPartial = segments.find((s) => !s.isFinal);

  return (
    <div className="transcript-panel">
      <div className="transcript-panel-header">
        <span className="transcript-panel-title">Live Transcript</span>
        <span className="transcript-panel-count">
          {finalSegments.length} segments
        </span>
      </div>

      <div className="transcript-scroll" ref={scrollRef}>
        {finalSegments.length === 0 && !lastPartial && (
          <div className="transcript-empty">
            Waiting for testimony to begin...
          </div>
        )}

        {finalSegments.map((seg) => {
          const borderColor =
            seg.speaker === "WITNESS"
              ? EMOTION_BORDER_COLORS[seg.emotion] ?? EMOTION_BORDER_COLORS.NEUTRAL
              : "var(--color-blue-dim)";

          return (
            <div
              key={seg.id}
              className={`transcript-segment transcript-segment--${seg.speaker.toLowerCase()}`}
              style={{ borderLeftColor: borderColor }}
            >
              <div className="transcript-segment-meta">
                <span
                  className="transcript-speaker"
                  style={{
                    color: seg.speaker === "COUNSEL" ? "var(--color-blue)" : "var(--color-amber)",
                  }}
                >
                  {seg.speaker === "COUNSEL" ? "COUNSEL" : witnessName.toUpperCase()}
                </span>
                <span className="transcript-time">
                  {formatTimestamp(seg.timestamp, startTime)}
                </span>
                {seg.speaker === "WITNESS" && seg.emotion !== "NEUTRAL" && (
                  <span
                    className="transcript-emotion-tag"
                    style={{ color: EMOTION_BORDER_COLORS[seg.emotion] }}
                  >
                    {seg.emotion}
                  </span>
                )}
                {seg.speaker === "WITNESS" && seg.intent && seg.intent !== "NEUTRAL" && (
                  <span
                    className="transcript-intent-tag"
                    style={{
                      color: INTENT_COLORS[seg.intent] ?? "var(--color-muted)",
                      borderColor: INTENT_COLORS[seg.intent] ?? "var(--color-muted)",
                    }}
                  >
                    {seg.intent}
                  </span>
                )}
              </div>
              <div className="transcript-segment-text">{seg.text}</div>
            </div>
          );
        })}

        {lastPartial && (
          <div
            className="transcript-segment transcript-segment--partial"
            style={{ borderLeftColor: "var(--border)" }}
          >
            <div className="transcript-segment-meta">
              <span className="transcript-speaker" style={{ color: "var(--text-muted)" }}>
                {lastPartial.speaker === "COUNSEL"
                  ? "COUNSEL"
                  : witnessName.toUpperCase()}
              </span>
              <span className="transcript-listening-badge">
                <span className="transcript-listening-dot" /> Listening
              </span>
            </div>
            <div className="transcript-segment-text transcript-partial-text">
              {lastPartial.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
