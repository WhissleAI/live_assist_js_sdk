import React from "react";
import type { Agent } from "@whissle/live-assist-react";

export function AgentPicker({
  agents,
  selectedId,
  onSelect,
  loading,
  error,
  disabled,
}: {
  agents: Agent[];
  selectedId: string | undefined;
  onSelect: (agent: Agent) => void;
  loading: boolean;
  error: string | null;
  disabled?: boolean;
}) {
  if (loading) {
    return (
      <div style={{ fontSize: 13, color: "#666" }}>Loading agents…</div>
    );
  }
  if (error) {
    return (
      <div style={{ fontSize: 13, color: "#ef4444" }}>{error}</div>
    );
  }
  if (agents.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#374151" }}>
        Smart Agent
      </label>
      <select
        value={selectedId ?? "default"}
        onChange={(e) => {
          const a = agents.find((x) => x.id === e.target.value);
          if (a) onSelect(a);
        }}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: 14,
          borderRadius: 8,
          border: "1px solid var(--la-border, #e5e7eb)",
          background: "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} — {a.description}
          </option>
        ))}
      </select>
    </div>
  );
}
