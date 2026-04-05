import React, { useRef, useEffect } from "react";
import type { WordTimestamp } from "@whissle/live-assist-core";

interface Props {
  words: WordTimestamp[];
  transcript: string;
}

export default function LiveTranscript({ words, transcript }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [words.length]);

  if (!words.length && !transcript) {
    return (
      <div className="card" style={{ minHeight: 200 }}>
        <div className="card-header"><h2>Live Transcript</h2></div>
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>
          Waiting for speech...
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header"><h2>Live Transcript</h2></div>
      <div className="live-transcript" ref={scrollRef}>
        {words.length > 0 ? words.map((w, i) => {
          const cls = [
            "word",
            w.filler ? "filler" : "",
            w.confidence < 0.5 ? "low-confidence" : "",
          ].filter(Boolean).join(" ");
          return (
            <span key={i} className={cls} title={`${w.start.toFixed(2)}s — conf: ${(w.confidence * 100).toFixed(0)}%`}>
              {w.word}{" "}
            </span>
          );
        }) : <span>{transcript}</span>}
      </div>
      {words.length > 0 && (
        <div style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", gap: 16 }}>
          <span>Words: {words.filter((w) => !w.filler).length}</span>
          <span>Fillers: {words.filter((w) => w.filler).length}</span>
          <span style={{ background: "var(--bg-warning)", padding: "0 4px", borderRadius: 3 }}>■</span> = filler
          <span style={{ textDecoration: "underline dotted" }}>■</span> = low confidence
        </div>
      )}
    </div>
  );
}
