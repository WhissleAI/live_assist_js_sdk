import React, { useEffect, useRef } from "react";
import { EMOTION_COLORS } from "@whissle/live-assist-core";
import type { TranscriptSegment } from "../App";

interface Props {
  transcript: TranscriptSegment[];
}

export default function TranscriptPanel({ transcript }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  if (transcript.length === 0) {
    return (
      <div className="transcript-empty">
        <p>Live transcript will appear here...</p>
      </div>
    );
  }

  return (
    <div className="transcript-list">
      {transcript.map((seg) => {
        const emotionColor = EMOTION_COLORS[seg.emotion || "NEUTRAL"] || "#9ca3af";
        const isNotNeutral = seg.emotion && seg.emotion !== "NEUTRAL";

        return (
          <div key={seg.id} className={`transcript-seg transcript-seg--${seg.speaker}`}>
            <div className="transcript-seg-header">
              <span className={`transcript-speaker transcript-speaker--${seg.speaker}`}>
                {seg.speaker === "child" ? "Child" : "Other"}
              </span>
              {isNotNeutral && (
                <span className="transcript-emotion" style={{ color: emotionColor, borderColor: emotionColor }}>
                  {seg.emotion!.charAt(0) + seg.emotion!.slice(1).toLowerCase()}
                </span>
              )}
              {seg.intent && (
                <span className="transcript-intent">
                  {seg.intent.charAt(0) + seg.intent.slice(1).toLowerCase().replace(/_/g, " ")}
                </span>
              )}
              {seg.entities?.map((ent, i) => (
                <span key={i} className="transcript-entity">{ent.text}</span>
              ))}
            </div>
            <div className="transcript-text">{seg.text}</div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
