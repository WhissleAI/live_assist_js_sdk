import React, { useState, useCallback, useEffect } from "react";
import type { AgendaItem } from "@whissle/live-assist-core";
import { InstructionsModal } from "./InstructionsModal";
import { getDefaultAgendaItems, getStoredAgenda, setStoredAgenda } from "./agendaDefaults";

export function SessionControls({
  isCapturing,
  onStart,
  onStop,
  onAgendaChange,
  hasTabAudio,
  instructions,
  onInstructionsSave,
}: {
  isCapturing: boolean;
  onStart: (opts?: { includeTab?: boolean; agenda?: AgendaItem[]; instructions?: string; recordAudio?: boolean }) => void;
  onStop: () => void;
  onAgendaChange?: (items: AgendaItem[]) => void;
  hasTabAudio?: boolean;
  instructions?: string;
  onInstructionsSave?: (s: string) => void;
}) {
  const [includeTab, setIncludeTab] = useState(false);
  const [recordAudio, setRecordAudio] = useState(true);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>(() => {
    const stored = getStoredAgenda();
    return stored.length > 0 ? stored : getDefaultAgendaItems();
  });
  const [newItem, setNewItem] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const addAgendaItem = useCallback(() => {
    const title = newItem.trim();
    if (!title) return;
    const item: AgendaItem = {
      id: `agenda_${Date.now()}`,
      title,
      status: "pending",
      confidence: 0,
    };
    const next = [...agendaItems, item];
    setAgendaItems(next);
    setNewItem("");
    onAgendaChange?.(next);
  }, [newItem, agendaItems, onAgendaChange]);

  const removeAgendaItem = useCallback(
    (id: string) => {
      const next = agendaItems.filter((a) => a.id !== id);
      setAgendaItems(next);
      onAgendaChange?.(next);
    },
    [agendaItems, onAgendaChange]
  );

  const handleStart = useCallback(() => {
    const agenda = agendaItems.length > 0 ? agendaItems : getDefaultAgendaItems();
    onStart({
      includeTab,
      agenda,
      instructions: instructions?.trim() || undefined,
      recordAudio,
    });
  }, [includeTab, agendaItems, instructions, recordAudio, onStart]);

  if (isCapturing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
              animation: "la-pulse 1.5s infinite",
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Listening {hasTabAudio ? "· Mic + Tab" : "· Mic only"}
          </span>
        </div>
        <button
          type="button"
          onClick={onStop}
          style={{
            padding: "8px 16px",
            background: "#ef4444",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Stop Session
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setShowInstructions(true)}
          style={{
            padding: "6px 12px",
            background: "#f3f4f6",
            border: "1px solid var(--la-border, #e5e7eb)",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Instructions
        </button>
      </div>
      <InstructionsModal
        isOpen={showInstructions}
        onClose={() => setShowInstructions(false)}
        onSave={(s) => onInstructionsSave?.(s)}
      />
      {/* Record audio */}
      <div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={recordAudio} onChange={(e) => setRecordAudio(e.target.checked)} />
          Record audio (saved locally with session report)
        </label>
      </div>

      {/* Tab audio */}
      <div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={includeTab}
            onChange={(e) => setIncludeTab(e.target.checked)}
          />
          Share browser tab (transcribes "Other" speaker, updates right chart)
        </label>
      </div>

      {/* Agenda: add one by one */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Agenda items
          </label>
          <button
            type="button"
            onClick={() => { setAgendaItems(getDefaultAgendaItems()); }}
            style={{ fontSize: 11, background: "none", border: "none", color: "#6b7280", cursor: "pointer", textDecoration: "underline" }}
          >
            Reset to defaults
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAgendaItem()}
            placeholder="Add item..."
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 13,
              border: "1px solid var(--la-border, #e5e7eb)",
              borderRadius: 8,
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onClick={addAgendaItem}
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
            Add
          </button>
        </div>
        {agendaItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {agendaItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  background: "#f9fafb",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1 }}>{item.title}</span>
                <button
                  type="button"
                  onClick={() => removeAgendaItem(item.id)}
                  style={{
                    padding: "2px 8px",
                    background: "none",
                    border: "none",
                    color: "#6b7280",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                  aria-label="Remove"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleStart}
        style={{
          padding: "10px 20px",
          background: "var(--la-primary, #124e3f)",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Start Live Assist
      </button>
    </div>
  );
}
