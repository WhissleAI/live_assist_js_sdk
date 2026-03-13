import React, { useEffect, useState } from "react";

const STORAGE_KEY = "whissle_live_assist_instructions";
const DEFAULT = "You are a live-assist companion providing real-time conversation feedback. Be concise and actionable. Focus on key points, action items, and helpful suggestions.";

function getStored(): string {
  if (typeof window === "undefined") return DEFAULT;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function setStored(value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {}
}

export function InstructionsModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (instructions: string) => void;
}) {
  const [value, setValue] = useState(DEFAULT);

  useEffect(() => {
    if (isOpen) setValue(getStored());
  }, [isOpen]);

  const handleSave = () => {
    const trimmed = value.trim() || DEFAULT;
    setStored(trimmed);
    onSave(trimmed);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 480,
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 700 }}>Session instructions</h3>
        <p style={{ margin: "0 0 12px 0", fontSize: 12, color: "#6b7280" }}>
          These instructions guide the agent. Agenda items are tracked separately.
        </p>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={DEFAULT}
          rows={6}
          style={{
            width: "100%",
            padding: 12,
            fontSize: 13,
            border: "1px solid var(--la-border, #e5e7eb)",
            borderRadius: 8,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#f3f4f6",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: "8px 16px",
              background: "var(--la-primary, #124e3f)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export { getStored as getStoredInstructions, setStored as setStoredInstructions };
