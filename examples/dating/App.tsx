import React, { useState, useCallback } from "react";
import type { SessionData } from "./hooks/useDatingSession";
import SetupScreen from "./components/SetupScreen";
import PrepBrief from "./components/PrepBrief";
import LiveSession from "./components/LiveSession";
import TextCoach from "./components/TextCoach";
import DebriefReport from "./components/DebriefReport";

export type DateType = "first-date" | "video-call" | "texting-coach" | "post-date-debrief";

export interface DateConfig {
  // Your profile
  userPersonality: string;
  userName: string;
  // Date context
  dateName: string;
  dateContext: string;
  dateType: DateType;
  goals: string;
  // Connections
  contextFilters: {
    memories: boolean;
    calendar: boolean;
    notes: boolean;
  };
  // URLs
  asrUrl: string;
  agentUrl: string;
}

type Phase = "setup" | "prep" | "live" | "text-coach" | "debrief";

function detectAsrUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("asr");
  if (override) return override;

  const loc = window.location;
  // In local dev, point to production gateway
  if (loc.port === "5173" || loc.port === "5174") {
    return "wss://api.whissle.ai/asr/stream";
  }
  const wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProto}//${loc.host}/asr/stream`;
}

function detectAgentUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("agent");
  if (override) return override;

  const loc = window.location;
  // In local dev, point to production gateway (agent routes are under /agent/)
  if (loc.port === "5173" || loc.port === "5174") {
    return "https://api.whissle.ai/agent";
  }
  return `${loc.protocol}//${loc.host}`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [config, setConfig] = useState<DateConfig>({
    userPersonality: "",
    userName: "",
    dateName: "",
    dateContext: "",
    dateType: "first-date",
    goals: "",
    contextFilters: { memories: true, calendar: true, notes: true },
    asrUrl: detectAsrUrl(),
    agentUrl: detectAgentUrl(),
  });
  const [sessionData, setSessionData] = useState<SessionData | null>(null);

  const handleSetupDone = useCallback((cfg: DateConfig) => {
    setConfig(cfg);
    if (cfg.dateType === "texting-coach") {
      setPhase("text-coach");
    } else {
      setPhase("prep");
    }
  }, []);

  const handlePrepDone = useCallback(() => {
    setPhase("live");
  }, []);

  const handleSessionEnd = useCallback((data: SessionData) => {
    setSessionData(data);
    setPhase("debrief");
  }, []);

  const handleStartOver = useCallback(() => {
    setSessionData(null);
    setPhase("setup");
  }, []);

  return (
    <div className="dating-app">
      <header className="dating-header">
        <div className="dating-logo">
          <span className="dating-logo-icon">&#x2764;&#xFE0F;&#x200D;&#x1F525;</span>
          <span className="dating-logo-text">Dating Coach</span>
        </div>
        {phase !== "setup" && (
          <nav className="dating-phase-nav">
            {(["setup", "prep", "live", "debrief"] as Phase[]).map((p) => (
              <span
                key={p}
                className={`dating-phase-dot ${phase === p ? "dating-phase-dot--active" : ""}`}
                title={p}
              />
            ))}
          </nav>
        )}
      </header>

      <main className="dating-main">
        {phase === "setup" && (
          <SetupScreen config={config} onDone={handleSetupDone} />
        )}
        {phase === "prep" && (
          <PrepBrief config={config} onReady={handlePrepDone} />
        )}
        {phase === "live" && (
          <LiveSession config={config} onEnd={handleSessionEnd} />
        )}
        {phase === "text-coach" && (
          <TextCoach config={config} />
        )}
        {phase === "debrief" && sessionData && (
          <DebriefReport config={config} session={sessionData} onStartOver={handleStartOver} />
        )}
      </main>
    </div>
  );
}
