import React, { useState, useCallback, Component } from "react";
import type { GapAnalysis } from "./lib/prep";
import type { AnswerScore } from "./lib/scoring";
import type { Difficulty } from "./lib/roles";
import type { ToolCallResult } from "./lib/roles";
import SetupScreen from "./components/SetupScreen";
import PrepBrief from "./components/PrepBrief";
import InterviewSession from "./components/InterviewSession";
import SessionReport from "./components/SessionReport";

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h1 className="error-boundary-title">Something went wrong</h1>
          <p className="error-boundary-message">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            className="error-boundary-btn"
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface InterviewConfig {
  jdText: string;
  resumeText: string;
  difficulty: Difficulty;
  hintsEnabled: boolean;
  asrUrl: string;
  agentUrl: string;
}

type Phase = "setup" | "prep" | "interview" | "report";

function detectAsrUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("asr");
  if (override) return override;

  const gateway = import.meta.env.VITE_GATEWAY_URL as string | undefined;
  if (gateway) {
    const wsProto = gateway.startsWith("https") ? "wss:" : "ws:";
    const host = gateway.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `${wsProto}//${host}/asr/stream`;
  }

  const loc = window.location;
  const wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
  if (loc.port === "5173" || loc.port === "5174") {
    return `${wsProto}//${loc.hostname}:8001/asr/stream`;
  }
  return `${wsProto}//${loc.host}/asr/stream`;
}

function detectAgentUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("agent");
  if (override) return override;

  const gateway = import.meta.env.VITE_GATEWAY_URL as string | undefined;
  if (gateway) return gateway.replace(/\/+$/, "") + "/agent";

  const loc = window.location;
  if (loc.port === "5173" || loc.port === "5174") {
    return `${loc.protocol}//${loc.hostname}:8765`;
  }
  return `${loc.protocol}//${loc.host}/agent`;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [config, setConfig] = useState<InterviewConfig>({
    jdText: "",
    resumeText: "",
    difficulty: "standard",
    hintsEnabled: true,
    asrUrl: detectAsrUrl(),
    agentUrl: detectAgentUrl(),
  });
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis | null>(null);
  const [answers, setAnswers] = useState<AnswerScore[]>([]);
  const [endData, setEndData] = useState<ToolCallResult | null>(null);

  const handleSetupDone = useCallback((cfg: InterviewConfig) => {
    setConfig(cfg);
    if (cfg.jdText.trim() && cfg.resumeText.trim()) {
      setPhase("prep");
    } else {
      setPhase("interview");
    }
  }, []);

  const handlePrepDone = useCallback((gap: GapAnalysis) => {
    setGapAnalysis(gap);
    setPhase("interview");
  }, []);

  const handlePrepSkip = useCallback(() => {
    setPhase("interview");
  }, []);

  const handleInterviewEnd = useCallback((scores: AnswerScore[], end: ToolCallResult | null) => {
    setAnswers(scores);
    setEndData(end);
    setPhase("report");
  }, []);

  const handleBackToSetup = useCallback(() => {
    setAnswers([]);
    setEndData(null);
    setGapAnalysis(null);
    setPhase("setup");
  }, []);

  const handleNewSession = useCallback(() => {
    setAnswers([]);
    setEndData(null);
    if (config.jdText.trim() && config.resumeText.trim()) {
      setPhase("prep");
    } else {
      setPhase("interview");
    }
  }, [config]);

  let content: React.ReactNode;

  if (phase === "prep") {
    content = (
      <PrepBrief
        config={config}
        onDone={handlePrepDone}
        onSkip={handlePrepSkip}
        onBack={() => setPhase("setup")}
      />
    );
  } else if (phase === "interview") {
    content = (
      <InterviewSession
        config={config}
        gapAnalysis={gapAnalysis}
        onEnd={handleInterviewEnd}
      />
    );
  } else if (phase === "report") {
    content = (
      <SessionReport
        config={config}
        answers={answers}
        endData={endData}
        onBackToSetup={handleBackToSetup}
        onNewSession={handleNewSession}
      />
    );
  } else {
    content = (
      <SetupScreen
        initialConfig={config}
        onDone={handleSetupDone}
      />
    );
  }

  return <ErrorBoundary>{content}</ErrorBoundary>;
}
