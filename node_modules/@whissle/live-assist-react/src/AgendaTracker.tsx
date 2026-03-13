import React, { useMemo, useRef, useEffect, useState } from "react";
import type { AgendaItem } from "@whissle/live-assist-core";

const STATUS_ICON: Record<string, string> = { pending: "○", in_progress: "◑", completed: "●", skipped: "—" };
const STATUS_COLOR: Record<string, string> = { pending: "#9ca3af", in_progress: "var(--la-primary, #124e3f)", completed: "#22c55e", skipped: "#f59e0b" };
const SENTIMENT_COLOR: Record<string, string> = { positive: "#22c55e", neutral: "#6b7280", negative: "#ef4444", mixed: "#f59e0b" };

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#f3f4f6", overflow: "hidden", minWidth: 0 }}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.6s cubic-bezier(.22,1,.36,1)" }} />
    </div>
  );
}

export function AgendaTracker({ items, compact }: { items: AgendaItem[]; compact?: boolean }) {
  const progress = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.round(items.reduce((sum, i) => sum + (i.confidence || 0), 0) / items.length);
  }, [items]);

  const prevDoneRef = useRef<Set<string>>(new Set());
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set());

  useEffect(() => {
    const doneIds = items.filter((i) => i.status === "completed" || (i.confidence ?? 0) >= 75).map((i) => i.id);
    const newlyDone = new Set(doneIds.filter((id) => !prevDoneRef.current.has(id)));
    prevDoneRef.current = new Set(doneIds);
    if (newlyDone.size > 0) {
      setJustCompleted(newlyDone);
      const t = setTimeout(() => setJustCompleted(new Set()), 1200);
      return () => clearTimeout(t);
    }
  }, [items]);

  if (items.length === 0) return <div style={{ padding: compact ? 12 : 20, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No agenda set</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 10, padding: compact ? "8px 0" : "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: "#9ca3af" }}>Agenda</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: progress === 100 ? "#22c55e" : "var(--la-text, #1a1a1a)" }}>{progress}%</span>
      </div>
      <ConfidenceBar value={progress} color={progress === 100 ? "#22c55e" : "var(--la-primary, #124e3f)"} />
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 4 : 8, marginTop: compact ? 2 : 4 }}>
        {items.map((item) => {
          const done = item.status === "completed" || (item.confidence ?? 0) >= 75;
          const barColor = done ? "#22c55e" : item.status === "in_progress" ? "var(--la-primary, #124e3f)" : "#9ca3af";
          const isPulsing = justCompleted.has(item.id);
          return (
            <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "6px 8px", borderRadius: 8, background: isPulsing ? "#dcfce7" : "#f9fafb", transition: "background 0.6s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: compact ? 11 : 13, color: done ? "#22c55e" : STATUS_COLOR[item.status ?? "pending"], flexShrink: 0 }}>{done ? "●" : STATUS_ICON[item.status ?? "pending"]}</span>
                <span style={{ flex: 1, fontSize: compact ? 12 : 13, textDecoration: done ? "line-through" : "none", opacity: item.status === "skipped" ? 0.5 : 1, minWidth: 0 }}>{item.title}</span>
                {(item.confidence ?? 0) > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: barColor, flexShrink: 0 }}>{item.confidence}%</span>}
                {item.sentiment && item.sentiment !== "neutral" && (
                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: SENTIMENT_COLOR[item.sentiment] ?? "#6b7280", color: "#fff", fontWeight: 600, textTransform: "capitalize", flexShrink: 0 }}>{item.sentiment}</span>
                )}
              </div>
              {(item.confidence ?? 0) > 0 && <div style={{ paddingLeft: compact ? 17 : 19 }}><ConfidenceBar value={item.confidence ?? 0} color={barColor} /></div>}
              {!compact && item.evidence && <div style={{ paddingLeft: 19, fontSize: 11, color: "#9ca3af", lineHeight: 1.35 }}>{item.evidence}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
