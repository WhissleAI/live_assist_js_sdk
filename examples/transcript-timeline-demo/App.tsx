import React, { useMemo, useCallback } from "react";
import {
  LiveAssistProvider,
  useLiveAssist,
  InlineProfileChart,
  TranscriptView,
  EmotionTimelineBar,
  SessionControls,
} from "@whissle/live-assist-react";
import "@whissle/live-assist-react/styles/live-assist.css";
import type { TranscriptEntry, AgendaItem } from "@whissle/live-assist-core";

const config = {
  asrUrl: "ws://localhost:8001/asr/stream",
  agentUrl: "http://localhost:8765",
  audioWorkletUrl: "/audio-capture-processor.js",
};

function SessionView() {
  const {
    isCapturing,
    hasTabAudio,
    transcript,
    userProfile,
    otherProfile,
    error,
    instructions,
    setInstructions,
    startCapture,
    stopCapture,
  } = useLiveAssist();

  const micEntries = useMemo(() => transcript.filter((e) => e.channel === "mic"), [transcript]);
  const tabEntries = useMemo(() => transcript.filter((e) => e.channel === "tab"), [transcript]);

  const durationSec = useMemo(() => {
    if (!transcript.length) return 10;
    const maxOffset = Math.max(...transcript.map((e) => e.audioOffset ?? 0));
    return Math.max(10, maxOffset + 5);
  }, [transcript]);

  const handleStart = useCallback(
    (opts?: { includeTab?: boolean; agenda?: AgendaItem[]; instructions?: string }) => {
      startCapture(opts);
    },
    [startCapture],
  );

  const handleStop = useCallback(() => stopCapture(), [stopCapture]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #e5e7eb", background: "#fafafa", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>
            Live Assist — Transcript &amp; Emotion Timeline
          </h1>
          <SessionControls
            isCapturing={isCapturing}
            hasTabAudio={hasTabAudio}
            onStart={handleStart}
            onStop={handleStop}
            onAgendaChange={() => {}}
            instructions={instructions}
            onInstructionsSave={setInstructions}
          />
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{error}</div>}
      </div>

      {/* Main: personality donuts + transcript */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left sidebar: You profile */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            borderRight: "1px solid #e5e7eb",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            background: "#fafafa",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>You</div>
          <InlineProfileChart profile={userProfile} size={120} />
        </div>

        {/* Center: transcript */}
        <div style={{ flex: 1, padding: 16, overflow: "auto", minWidth: 0 }}>
          <TranscriptView entries={transcript} maxHeight={9999} />
        </div>

        {/* Right sidebar: Other profile */}
        {hasTabAudio && (
          <div
            style={{
              width: 200,
              flexShrink: 0,
              borderLeft: "1px solid #e5e7eb",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Other</div>
            <InlineProfileChart profile={otherProfile} size={120} />
          </div>
        )}
      </div>

      {/* Bottom: dual emotion timelines */}
      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          padding: "12px 24px 16px",
          background: "#fafafa",
          flexShrink: 0,
          display: "flex",
          gap: 24,
        }}
      >
        {/* You timeline */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            You — Emotion Timeline
          </div>
          {micEntries.length > 0 ? (
            <EmotionTimelineBar entries={micEntries} durationSec={durationSec} />
          ) : (
            <div style={{ height: 14, borderRadius: 6, background: "#e2e8f0" }} />
          )}
        </div>

        <div style={{ width: 1, background: "#d1d5db", flexShrink: 0, alignSelf: "stretch" }} />

        {/* Other timeline */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Other — Emotion Timeline
          </div>
          {tabEntries.length > 0 ? (
            <EmotionTimelineBar entries={tabEntries} durationSec={durationSec} />
          ) : (
            <div style={{ height: 14, borderRadius: 6, background: "#e2e8f0" }} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LiveAssistProvider config={config}>
      <SessionView />
    </LiveAssistProvider>
  );
}
