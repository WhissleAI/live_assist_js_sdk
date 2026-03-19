import React, { useState, useCallback } from "react";
import type { UploadedDocument } from "./lib/documents";
import type { SidebarMode } from "./lib/presets";
import type { ToolDefinition, ToolCallResult, ToolState } from "./lib/tools";
import SetupPanel from "./SetupPanel";
import VoiceSession from "./VoiceSession";
import SessionSummary from "./SessionSummary";

export interface VoiceAgentConfig {
  rimeSpeaker: string;
  rimeModel: string;
  agentUrl: string;
  asrUrl: string;
  systemPrompt: string;
  audioWorkletUrl: string;
  scenarioId: string;
  greeting: string;
  sidebarMode: SidebarMode;
  enableMetadata: boolean;
  tools: ToolDefinition[];
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  citations?: string[];
  emotion?: string;
  emotionConfidence?: number;
  intent?: string;
  entities?: Array<{ entity: string; text: string }>;
  toolCalls?: ToolCallResult[];
}

function detectAsrUrl(): string {
  const loc = typeof window !== "undefined" ? window.location : { hostname: "localhost", protocol: "http:", port: "" };
  const host = loc.hostname || "localhost";
  const wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${host}:8001/asr/stream`;
}

function detectAgentUrl(): string {
  const loc = typeof window !== "undefined" ? window.location : { hostname: "localhost", protocol: "http:" };
  const host = loc.hostname || "localhost";
  return `${loc.protocol}//${host}:8765`;
}

const INITIAL_CONFIG: VoiceAgentConfig = {
  rimeSpeaker: "cove",
  rimeModel: "mistv2",
  agentUrl: detectAgentUrl(),
  asrUrl: detectAsrUrl(),
  systemPrompt: "",
  audioWorkletUrl: "/audio-capture-processor.js",
  scenarioId: "general",
  greeting: "",
  sidebarMode: "citations",
  enableMetadata: false,
  tools: [],
};

export default function App() {
  const [phase, setPhase] = useState<"setup" | "session" | "summary">("setup");
  const [config, setConfig] = useState<VoiceAgentConfig>(() => {
    const saved = localStorage.getItem("voice-agent-config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...INITIAL_CONFIG, ...parsed, tools: INITIAL_CONFIG.tools };
      } catch {}
    }
    return INITIAL_CONFIG;
  });
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [sessionMessages, setSessionMessages] = useState<ConversationMessage[]>([]);
  const [sessionToolState, setSessionToolState] = useState<ToolState>({});

  const handleStart = useCallback((cfg: VoiceAgentConfig, docs: UploadedDocument[]) => {
    setConfig(cfg);
    setDocuments(docs);
    localStorage.setItem("voice-agent-config", JSON.stringify({
      rimeSpeaker: cfg.rimeSpeaker,
      rimeModel: cfg.rimeModel,
      agentUrl: cfg.agentUrl,
      asrUrl: cfg.asrUrl,
      systemPrompt: cfg.systemPrompt,
      scenarioId: cfg.scenarioId,
      greeting: cfg.greeting,
      sidebarMode: cfg.sidebarMode,
      enableMetadata: cfg.enableMetadata,
    }));
    setPhase("session");
  }, []);

  const handleEnd = useCallback((messages: ConversationMessage[], toolState: ToolState) => {
    setSessionMessages(messages);
    setSessionToolState(toolState);
    setPhase("summary");
  }, []);

  const handleBackToSetup = useCallback(() => {
    setSessionMessages([]);
    setSessionToolState({});
    setPhase("setup");
  }, []);

  const handleNewSession = useCallback(() => {
    setSessionMessages([]);
    setSessionToolState({});
    setPhase("session");
  }, []);

  if (phase === "summary") {
    return (
      <SessionSummary
        config={config}
        messages={sessionMessages}
        documents={documents}
        toolState={sessionToolState}
        onBackToSetup={handleBackToSetup}
        onNewSession={handleNewSession}
      />
    );
  }

  if (phase === "session") {
    return (
      <VoiceSession
        config={config}
        documents={documents}
        onEnd={handleEnd}
      />
    );
  }

  return (
    <SetupPanel
      initialConfig={config}
      initialDocuments={documents}
      onStart={handleStart}
    />
  );
}
