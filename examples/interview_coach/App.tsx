import React, { useState, useCallback } from "react";
import type { GapAnalysis } from "./lib/prep";
import type { AnswerScore } from "./lib/scoring";
import type { Difficulty } from "./lib/roles";
import type { ToolCallResult } from "./lib/roles";
import SetupScreen from "./components/SetupScreen";
import PrepBrief from "./components/PrepBrief";
import InterviewSession from "./components/InterviewSession";
import SessionReport from "./components/SessionReport";

export interface InterviewConfig {
  jdText: string;
  resumeText: string;
  difficulty: Difficulty;
  hintsEnabled: boolean;
  asrUrl: string;
  agentUrl: string;
}

export interface EmotionTimelineEntry {
  offset: number;
  emotion: string;
  confidence: number;
}

type Phase = "setup" | "prep" | "interview" | "report";

function detectAsrUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("asr");
  if (override) return override;

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

  const loc = window.location;
  if (loc.port === "5173" || loc.port === "5174") {
    return `${loc.protocol}//${loc.hostname}:8765`;
  }
  return `${loc.protocol}//${loc.host}`;
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

  if (phase === "prep") {
    return (
      <PrepBrief
        config={config}
        onDone={handlePrepDone}
        onSkip={handlePrepSkip}
        onBack={() => setPhase("setup")}
      />
    );
  }

  if (phase === "interview") {
    return (
      <InterviewSession
        config={config}
        gapAnalysis={gapAnalysis}
        onEnd={handleInterviewEnd}
      />
    );
  }

  if (phase === "report") {
    return (
      <SessionReport
        config={config}
        answers={answers}
        endData={endData}
        gapAnalysis={gapAnalysis}
        onBackToSetup={handleBackToSetup}
        onNewSession={handleNewSession}
      />
    );
  }

  return (
    <SetupScreen
      initialConfig={config}
      onDone={handleSetupDone}
    />
  );
}
