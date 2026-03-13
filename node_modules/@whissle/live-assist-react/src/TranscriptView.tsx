import React, { useRef, useEffect, useState } from "react";
import type { TranscriptEntry } from "@whissle/live-assist-core";

export function TranscriptView({ entries, maxHeight = 300 }: { entries: TranscriptEntry[]; maxHeight?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"mic" | "tab" | "all">("all");

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [entries.length, entries[entries.length - 1]?.text]);

  const filtered = tab === "all" ? entries : entries.filter((e) => e.channel === tab);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, borderBottom: "1px solid var(--la-border, #e5e7eb)", paddingBottom: 4 }}>
        {(["all", "mic", "tab"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: tab === t ? 700 : 400,
              background: tab === t ? "var(--la-primary, #124e3f)" : "transparent",
              color: tab === t ? "#fff" : "#666",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {t === "all" ? "All" : t === "mic" ? "You" : "Other"}
          </button>
        ))}
      </div>
      <div ref={scrollRef} style={{ maxHeight, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ color: "#9ca3af", fontSize: 13, padding: 24, textAlign: "center" }}>No transcript yet</div>
        )}
        {filtered.map((entry, i) => (
          <TranscriptBubble key={entry._id ?? `t-${i}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isYou = entry.channel === "mic";
  const isPartial = entry.is_final === false && !entry._promoted;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isYou ? "flex-start" : "flex-end",
      }}
    >
      <div
        style={{
          maxWidth: "75%",
          padding: "8px 12px",
          borderRadius: 12,
          background: isYou ? "var(--la-primary, #124e3f)" : "#8b5cf6",
          color: "white",
          fontSize: 13,
          lineHeight: 1.4,
          ...(isYou ? { borderBottomLeftRadius: 4 } : { borderBottomRightRadius: 4 }),
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, opacity: 0.9 }}>
          {isYou ? "You" : "Other"}
        </div>
        <span
          style={{
            opacity: isPartial ? 0.85 : 1,
            fontStyle: isPartial ? "italic" : "normal",
          }}
        >
          {entry.text}
        </span>
      </div>
    </div>
  );
}
