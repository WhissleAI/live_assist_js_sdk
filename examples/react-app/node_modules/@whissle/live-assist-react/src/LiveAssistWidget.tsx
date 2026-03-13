import React, { useState, useCallback, useRef, useEffect } from "react";
import { useLiveAssist } from "./LiveAssistProvider";
import { TranscriptView } from "./TranscriptView";
import { ProfileBadge } from "./ProfileBadge";
import { AgendaTracker } from "./AgendaTracker";
import { SessionControls } from "./SessionControls";
import { InlineProfileChart } from "./PersonalityChart";
import type { AgendaItem } from "@whissle/live-assist-core";

export function LiveAssistWidget({ agenda, style }: { agenda?: AgendaItem[]; style?: React.CSSProperties }) {
  const { isCapturing, transcript, userProfile, otherProfile, feedbackSummary, suggestions, agendaItems, instructions, setInstructions, error, startCapture, stopCapture } = useLiveAssist();
  const [view, setView] = useState<"transcript" | "agenda" | "profile">("transcript");
  const [minimized, setMinimized] = useState(false);

  const handleStart = useCallback((opts?: { includeTab?: boolean; agenda?: AgendaItem[]; instructions?: string }) => {
    startCapture({ ...opts, agenda: opts?.agenda ?? agenda });
  }, [startCapture, agenda]);

  const handleStop = useCallback(() => { stopCapture(); }, [stopCapture]);

  if (minimized) {
    return (
      <div onClick={() => setMinimized(false)} style={{ position: "fixed", bottom: 20, right: 20, width: 56, height: 56, borderRadius: "50%", background: "var(--la-primary, #124e3f)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 1000, fontSize: 20, ...style }}>
        {isCapturing ? <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", animation: "la-pulse 1.5s infinite" }} /> : "🎤"}
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, width: 400, maxHeight: "80vh", background: "var(--la-bg, #fff)", border: "1px solid var(--la-border, #e5e7eb)", borderRadius: "var(--la-radius, 12px)", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", zIndex: 1000, display: "flex", flexDirection: "column", overflow: "hidden", ...style }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--la-border, #e5e7eb)" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Live Assist</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={() => setMinimized(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 4 }} aria-label="Minimize">−</button>
        </div>
      </div>

      {/* Controls or Status */}
      <div style={{ padding: "12px 16px" }}>
        {!isCapturing ? (
          <SessionControls isCapturing={false} onStart={handleStart} onStop={handleStop} instructions={instructions} onInstructionsSave={setInstructions} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "la-pulse 1.5s infinite" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Listening</span>
            </div>
            <button type="button" onClick={handleStop} style={{ padding: "4px 12px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Stop</button>
          </div>
        )}
      </div>

      {error && <div style={{ padding: "0 16px 8px", color: "#ef4444", fontSize: 12 }}>{error}</div>}

      {/* Profiles */}
      {isCapturing && (
        <div style={{ display: "flex", gap: 8, padding: "0 16px 8px" }}>
          <div style={{ flex: 1 }}><ProfileBadge profile={userProfile} label="You" onClick={() => setView("profile")} /></div>
          <div style={{ flex: 1 }}><ProfileBadge profile={otherProfile} label="Other" align="right" onClick={() => setView("profile")} /></div>
        </div>
      )}

      {/* Tab navigation */}
      {isCapturing && (
        <div style={{ display: "flex", borderBottom: "1px solid var(--la-border, #e5e7eb)" }}>
          {(["transcript", "agenda", "profile"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: view === v ? 700 : 400, background: "none", border: "none", borderBottom: view === v ? "2px solid var(--la-primary, #124e3f)" : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>
              {v}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isCapturing && (
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {view === "transcript" && <TranscriptView entries={transcript} />}
          {view === "agenda" && <AgendaTracker items={agendaItems} />}
          {view === "profile" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Your Profile</div><InlineProfileChart profile={userProfile} /></div>
              <div><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Other Profile</div><InlineProfileChart profile={otherProfile} /></div>
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      {isCapturing && feedbackSummary && (
        <div style={{ padding: "8px 16px", borderTop: "1px solid var(--la-border, #e5e7eb)", fontSize: 12, color: "#666" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>AI Feedback</div>
          <div>{feedbackSummary}</div>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {suggestions.map((s, i) => <span key={i} style={{ padding: "2px 6px", background: "#f3f4f6", borderRadius: 4, fontSize: 11 }}>{s}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
