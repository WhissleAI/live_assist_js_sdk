import React from "react";
import { LiveAssistProvider, LiveAssistFrame } from "@whissle/live-assist-react";
import "@whissle/live-assist-react/styles/live-assist.css";

const config = {
  asrUrl: "ws://localhost:8001/asr/stream",
  agentUrl: "http://localhost:8765",
  audioWorkletUrl: "/audio-capture-processor.js",
};

export default function App() {
  return (
    <LiveAssistProvider config={config}>
      <div style={{ padding: 24, minHeight: "100vh", width: "100%", boxSizing: "border-box" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: 24 }}>Live Assist</h1>
        <p style={{ color: "#666", marginBottom: 20, fontSize: 14 }}>
          Start a session to see real-time transcription.
        </p>
        <LiveAssistFrame />
      </div>
    </LiveAssistProvider>
  );
}
