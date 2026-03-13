import React, { useCallback } from "react";
import { useLiveAssist } from "./LiveAssistProvider";
import { TranscriptView } from "./TranscriptView";
import { SessionControls } from "./SessionControls";
import { AgendaTracker } from "./AgendaTracker";
import { PersonalitySidebar } from "./PersonalitySidebar";
import type { AgendaItem } from "@whissle/live-assist-core";

const SIDEBAR_WIDTH = 140;

/** Embeddable frame: [You chart | controls + transcript | Other chart] — wide layout. */
export function LiveAssistFrame({
  agenda,
  agentId,
  mode,
  style,
  className,
}: {
  agenda?: AgendaItem[];
  agentId?: string;
  mode?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const {
    isCapturing,
    hasTabAudio,
    transcript,
    userProfile,
    otherProfile,
    error,
    agendaItems,
    instructions,
    setInstructions,
    startCapture,
    stopCapture,
  } = useLiveAssist();

  const handleStart = useCallback(
    (opts?: { includeTab?: boolean; agenda?: AgendaItem[]; instructions?: string }) => {
      startCapture({ ...opts, agenda: opts?.agenda ?? agenda, agentId, mode });
    },
    [startCapture, agenda, agentId, mode]
  );

  const handleStop = useCallback(() => stopCapture(), [stopCapture]);

  const handleAgendaChange = useCallback(() => {}, []);

  const showOtherChart = hasTabAudio && isCapturing;

  return (
    <div
      className={className}
      style={{
        border: "1px solid var(--la-border, #e5e7eb)",
        borderRadius: "var(--la-radius, 12px)",
        overflow: "hidden",
        background: "var(--la-bg, #fff)",
        display: "flex",
        flexDirection: "row",
        minHeight: 480,
        width: "100%",
        ...style,
      }}
    >
      {/* Left: You (mic) personality */}
      <div
        style={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          borderRight: "1px solid var(--la-border, #e5e7eb)",
          background: "#fafafa",
        }}
      >
        <PersonalitySidebar
          label="You"
          profile={userProfile}
          placeholder={isCapturing ? "Speaking…" : "—"}
        />
      </div>

      {/* Center: controls + transcript */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid var(--la-border, #e5e7eb)",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: 16, fontWeight: 700 }}>Live Assist</h3>
          <SessionControls
            isCapturing={isCapturing}
            hasTabAudio={hasTabAudio}
            onStart={handleStart}
            onStop={handleStop}
            onAgendaChange={handleAgendaChange}
            instructions={instructions}
            onInstructionsSave={setInstructions}
          />
        </div>
        {error && (
          <div
            style={{
              padding: "8px 16px",
              color: "#ef4444",
              fontSize: 12,
              background: "#fef2f2",
            }}
          >
            {error}
          </div>
        )}
        <div style={{ flex: 1, padding: 16, overflow: "auto", minHeight: 280 }}>
          <TranscriptView entries={transcript} maxHeight={420} />
        </div>
      </div>

      {/* Right: Other (tab) personality — only when tab is shared */}
      {showOtherChart && (
        <div
          style={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            borderLeft: "1px solid var(--la-border, #e5e7eb)",
            background: "#fafafa",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <PersonalitySidebar label="Other" profile={otherProfile} placeholder="Tab audio…" />
          {agendaItems.length > 0 && (
            <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--la-border, #e5e7eb)", marginTop: 8, paddingTop: 12 }}>
              <AgendaTracker items={agendaItems} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
