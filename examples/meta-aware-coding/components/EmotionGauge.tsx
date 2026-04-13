import React from "react";

const EMOTION_CONFIG: Array<{ key: string; label: string; color: string; emoji: string }> = [
  { key: "HAPPY", label: "Happy", color: "#facc15", emoji: "😊" },
  { key: "SAD", label: "Sad", color: "#3b82f6", emoji: "😢" },
  { key: "ANGRY", label: "Angry", color: "#ef4444", emoji: "😠" },
  { key: "NEUTRAL", label: "Neutral", color: "#9ca3af", emoji: "😐" },
  { key: "FEAR", label: "Fear", color: "#8b5cf6", emoji: "😨" },
  { key: "SURPRISE", label: "Surprise", color: "#f97316", emoji: "😲" },
  { key: "DISGUST", label: "Disgust", color: "#14b8a6", emoji: "🤢" },
];

const INTENT_CONFIG: Array<{ key: string; label: string; color: string }> = [
  { key: "QUERY", label: "Query", color: "#3b82f6" },
  { key: "COMMAND", label: "Command", color: "#ef4444" },
  { key: "INFORM", label: "Inform", color: "#22c55e" },
  { key: "CONFIRM", label: "Confirm", color: "#14b8a6" },
  { key: "DENY", label: "Deny", color: "#f97316" },
  { key: "GREET", label: "Greet", color: "#8b5cf6" },
  { key: "REQUEST", label: "Request", color: "#f59e0b" },
];

export function EmotionGauge({ probs, label }: { probs: Record<string, number>; label: string }) {
  const hasData = Object.keys(probs).length > 0;
  const config = label === "Intent" ? INTENT_CONFIG : EMOTION_CONFIG;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#94a3b8",
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {config.map((item) => {
          const value = probs[item.key] ?? 0;
          const pct = Math.round(value * 100);
          const isTop = hasData && value === Math.max(...Object.values(probs));

          return (
            <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 70,
                fontSize: 11,
                fontWeight: isTop ? 700 : 500,
                color: isTop ? item.color : "#94a3b8",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "color 0.3s ease",
              }}>
                {"emoji" in item && (
                  <span style={{ fontSize: 13 }}>{(item as { emoji: string }).emoji}</span>
                )}
                {item.label}
              </div>
              <div style={{
                flex: 1,
                height: 14,
                background: "#1e293b",
                borderRadius: 7,
                overflow: "hidden",
                position: "relative",
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${item.color}88, ${item.color})`,
                  borderRadius: 7,
                  transition: "width 0.4s ease-out",
                  boxShadow: pct > 20 ? `0 0 8px ${item.color}40` : "none",
                }} />
              </div>
              <div style={{
                width: 36,
                fontSize: 11,
                fontWeight: isTop ? 700 : 500,
                color: isTop ? "#f1f5f9" : "#64748b",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                transition: "color 0.3s ease",
              }}>
                {pct}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
