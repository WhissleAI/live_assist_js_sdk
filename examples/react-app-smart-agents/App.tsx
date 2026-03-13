import React, { useState } from "react";
import { LiveAssistProvider, LiveAssistFrame, useAgents, type Agent } from "@whissle/live-assist-react";
import "@whissle/live-assist-react/styles/live-assist.css";
import { AgentPicker } from "./AgentPicker";

const config = {
  asrUrl: "ws://localhost:8001/asr/stream",
  agentUrl: "http://localhost:8765",
  audioWorkletUrl: "/audio-capture-processor.js",
};

function SmartAgentsContent() {
  const { agents, loading, error } = useAgents(config.agentUrl);
  const [selectedAgent, setSelectedAgent] = useState<Agent | undefined>(() =>
    agents.length > 0 ? agents.find((a) => a.id === "default") ?? agents[0] : undefined
  );

  // Keep selectedAgent in sync when agents load
  React.useEffect(() => {
    if (agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents.find((a) => a.id === "default") ?? agents[0]);
    }
  }, [agents, selectedAgent]);

  return (
    <div style={{ padding: 24, minHeight: "100vh", width: "100%", boxSizing: "border-box" }}>
      <h1 style={{ margin: "0 0 8px 0", fontSize: 24 }}>Live Assist — Smart Agents</h1>
      <p style={{ color: "#666", marginBottom: 20, fontSize: 14 }}>
        Choose an agent to tailor real-time feedback for your conversation.
      </p>

      <div style={{ marginBottom: 16, maxWidth: 400 }}>
        <AgentPicker
          agents={agents}
          selectedId={selectedAgent?.id}
          onSelect={setSelectedAgent}
          loading={loading}
          error={error}
        />
      </div>

      <LiveAssistFrame
        agentId={selectedAgent?.id}
        mode={selectedAgent?.mode}
        agenda={[
          { id: "1", title: "Discuss goals" },
          { id: "2", title: "Next steps" },
        ]}
      />
    </div>
  );
}

export default function App() {
  return (
    <LiveAssistProvider config={config}>
      <SmartAgentsContent />
    </LiveAssistProvider>
  );
}
