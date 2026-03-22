import React, { useState, useCallback } from "react";
import type { UploadedDocument } from "./lib/documents";
import type { SidebarMode } from "./lib/presets";
import { getPreset } from "./lib/presets";
import type { ToolDefinition, ToolCallResult, ToolState } from "./lib/tools";
import SetupPanel from "./SetupPanel";
import MenuReview from "./MenuReview";
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

export interface EmotionTimelineEntry {
  offset: number;
  emotion: string;
  confidence: number;
  probs?: { emotion: string; probability: number }[];
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
  emotionTimeline?: EmotionTimelineEntry[];
}

function detectAsrUrl(): string {
  const loc = typeof window !== "undefined" ? window.location : null;
  const host = loc?.hostname || "localhost";
  const port = loc?.port || "";
  const wsProto = loc?.protocol === "https:" ? "wss:" : "ws:";
  if (port === "5174") {
    return `${wsProto}//${host}:8001/asr/stream`;
  }
  return `${wsProto}//${loc?.host || host}/asr/stream`;
}

function detectAgentUrl(): string {
  const loc = typeof window !== "undefined" ? window.location : null;
  const host = loc?.hostname || "localhost";
  const port = loc?.port || "";
  const proto = loc?.protocol || "http:";
  if (port === "5174") {
    return `${proto}//${host}:8765`;
  }
  return `${proto}//${loc?.host || host}`;
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
  const [phase, setPhase] = useState<"setup" | "menu-review" | "session" | "summary">("setup");
  const [config, setConfig] = useState<VoiceAgentConfig>(() => {
    const saved = localStorage.getItem("voice-agent-config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const preset = getPreset(parsed.scenarioId);
        return {
          ...INITIAL_CONFIG,
          ...parsed,
          tools: preset?.tools ?? [],
          sidebarMode: preset?.sidebarMode ?? parsed.sidebarMode ?? "citations",
          enableMetadata: preset?.enableMetadata ?? parsed.enableMetadata ?? false,
        };
      } catch {}
    }
    return INITIAL_CONFIG;
  });
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [sessionMessages, setSessionMessages] = useState<ConversationMessage[]>([]);
  const [sessionToolState, setSessionToolState] = useState<ToolState>({});
  const [sessionAudioBlob, setSessionAudioBlob] = useState<Blob | undefined>();

  const saveConfig = useCallback((cfg: VoiceAgentConfig) => {
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
  }, []);

  const handleStart = useCallback((cfg: VoiceAgentConfig, docs: UploadedDocument[]) => {
    setConfig(cfg);
    setDocuments(docs);
    saveConfig(cfg);

    const hasMenu = cfg.scenarioId === "restaurant-kiosk" && docs.some((d) => d.menu);
    setPhase(hasMenu ? "menu-review" : "session");
  }, [saveConfig]);

  const handleMenuConfirm = useCallback((updatedDoc: UploadedDocument) => {
    setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    setPhase("session");
  }, []);

  const handleMenuBack = useCallback(() => {
    setPhase("setup");
  }, []);

  const handleEnd = useCallback((messages: ConversationMessage[], toolState: ToolState, audioBlob?: Blob) => {
    setSessionMessages(messages);
    setSessionToolState(toolState);
    setSessionAudioBlob(audioBlob);
    setPhase("summary");
  }, []);

  const handleBackToSetup = useCallback(() => {
    setSessionMessages([]);
    setSessionToolState({});
    setSessionAudioBlob(undefined);
    setPhase("setup");
  }, []);

  const handleNewSession = useCallback(() => {
    setSessionMessages([]);
    setSessionToolState({});
    setSessionAudioBlob(undefined);
    setPhase("session");
  }, []);

  if (phase === "summary") {
    return (
      <SessionSummary
        config={config}
        messages={sessionMessages}
        documents={documents}
        toolState={sessionToolState}
        audioBlob={sessionAudioBlob}
        onBackToSetup={handleBackToSetup}
        onNewSession={handleNewSession}
      />
    );
  }

  if (phase === "menu-review") {
    const menuDoc = documents.find((d) => d.menu);
    if (menuDoc) {
      return <MenuReview document={menuDoc} onConfirm={handleMenuConfirm} onBack={handleMenuBack} />;
    }
    setPhase("session");
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
