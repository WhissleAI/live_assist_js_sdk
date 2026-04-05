import React, { useState, useCallback, useRef, useEffect } from "react";
import type { BehavioralProfile } from "@whissle/live-assist-core";
import AgentRuntime from "./components/AgentRuntime";
import AdminPortal from "./components/AdminPortal";
import AgentBuilder from "./components/AgentBuilder";
import AppShell from "./components/AppShell";
import SessionsPage from "./components/SessionsPage";
import SessionDetail from "./components/SessionDetail";
import TranscribePage from "./components/TranscribePage";
import TtsPlaygroundPage from "./components/TtsPlaygroundPage";
import ResearchPage from "./components/ResearchPage";
import VideoToMusicPage from "./components/VideoToMusicPage";
import { gatewayConfig } from "./lib/gateway-config";
import type { AgentConfig } from "./lib/agent-config";

export interface EmotionTimelineEntry {
  offset: number;
  emotion: string;
  confidence: number;
  probs?: { emotion: string; probability: number }[];
}

/** Per-window emotion readings within one aggregated utterance (offsets in seconds, relative to utterance start). */
export type UtteranceEmotionTimelinePoint = {
  offset: number;
  emotion: string;
  confidence: number;
  probs?: { emotion: string; probability: number }[];
};

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker: "user" | "other" | "agent";
  /** Seconds from stream start — aligns with live-assist TranscriptEntry.audioOffset for spectrogram spans. */
  audioOffsetSec?: number;
  /** Fine-grained timeline for this utterance only (relative offsets in seconds). */
  emotionTimelineUtterance?: UtteranceEmotionTimelinePoint[];
  emotion?: string;
  emotionConfidence?: number;
  /** Full ASR emotion distribution (snapshot at utterance flush). */
  emotionProbs?: Array<{ emotion: string; probability: number }>;
  intent?: string;
  intentProbs?: Array<{ intent: string; probability: number }>;
  genderProbs?: Array<{ label: string; probability: number }>;
  ageProbs?: Array<{ label: string; probability: number }>;
  entities?: Array<{ entity: string; text: string }>;
}

export interface Moment {
  id: string;
  timestamp: number;
  text: string;
  emotion: string;
  emotionConfidence: number;
  type: "emotion_peak" | "topic" | "speaker_change" | "question" | "concern";
  speaker: "user" | "other" | "agent";
  severity?: "low" | "medium" | "high";
}

export interface SessionState {
  isActive: boolean;
  isConnected: boolean;
  transcript: TranscriptSegment[];
  moments: Moment[];
  emotionTimeline: EmotionTimelineEntry[];
  /** TTS/STT stream timeline (ms from session start); same shape as mic timeline. */
  agentEmotionTimeline: EmotionTimelineEntry[];
  currentEmotion: string;
  currentEmotionProbs: Record<string, number>;
  profile: BehavioralProfile | null;
  speakerLabel: "user" | "other";
  error: string | null;
  sessionStart: number | null;
  agentId: string;
  flaggedConcerns: Array<{ text: string; emotion: string; severity: string; reason: string; timestamp: number }>;
  topicsDiscussed: string[];
}

export interface AppSettings {
  organizationName: string;
}

// ---------------------------------------------------------------------------
// Hash-based router
// ---------------------------------------------------------------------------

type Route =
  | { page: "voice-agents" }
  | { page: "builder"; agentId?: string }
  | { page: "transcribe" }
  | { page: "tts" }
  | { page: "research" }
  | { page: "video-to-music" }
  | { page: "sessions" }
  | { page: "session-detail"; sessionId: string }
  | { page: "settings" }
  | { page: "runtime"; agentId: string }
  | { page: "embed"; agentId: string };

function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");

  const embedMatch = h.match(/^embed\/(.+)$/);
  if (embedMatch) return { page: "embed", agentId: embedMatch[1] };

  const runtimeMatch = h.match(/^a\/(.+)$/);
  if (runtimeMatch) return { page: "runtime", agentId: runtimeMatch[1] };

  const editMatch = h.match(/^agents\/(.+)\/edit$/);
  if (editMatch) return { page: "builder", agentId: editMatch[1] };

  if (h === "agents/new") return { page: "builder" };

  // Redirects for legacy routes
  const analyticsMatch = h.match(/^agents\/(.+)\/analytics$/);
  if (analyticsMatch) return { page: "sessions" };
  if (h === "analytics") return { page: "sessions" };

  const sessionDetailMatch = h.match(/^sessions\/(.+)$/);
  if (sessionDetailMatch) return { page: "session-detail", sessionId: sessionDetailMatch[1] };

  if (h === "transcribe") return { page: "transcribe" };
  if (h === "tts") return { page: "tts" };
  if (h === "research") return { page: "research" };
  if (h === "video-to-music") return { page: "video-to-music" };
  if (h === "sessions") return { page: "sessions" };
  if (h === "settings") return { page: "settings" };

  return { page: "voice-agents" };
}

function getActivePage(route: Route): string {
  if (route.page === "voice-agents" || route.page === "builder") return "voice-agents";
  if (route.page === "sessions" || route.page === "session-detail") return "sessions";
  return route.page;
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return route;
}

export function navigate(path: string) {
  window.location.hash = `#/${path}`;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("whissle_agents_settings");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { organizationName: "" };
}

const INITIAL_SESSION: SessionState = {
  isActive: false,
  isConnected: false,
  transcript: [],
  moments: [],
  emotionTimeline: [],
  agentEmotionTimeline: [],
  currentEmotion: "NEUTRAL",
  currentEmotionProbs: {},
  profile: null,
  speakerLabel: "user",
  error: null,
  sessionStart: null,
  agentId: "",
  flaggedConcerns: [],
  topicsDiscussed: [],
};

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const route = useHashRoute();
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [transitioning, setTransitioning] = useState(false);
  const prevPageRef = useRef(route.page);

  const sessionRef = useRef<SessionState>({ ...INITIAL_SESSION });
  const [session, setSession] = useState<SessionState>(sessionRef.current);

  const updateSession = useCallback((patch: Partial<SessionState>) => {
    const next = { ...sessionRef.current, ...patch };
    sessionRef.current = next;
    setSession(next);
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem("whissle_agents_settings", JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    gatewayConfig.initSession().catch(() => {});
  }, []);

  useEffect(() => {
    if (prevPageRef.current !== route.page) {
      setTransitioning(true);
      const t = setTimeout(() => setTransitioning(false), 30);
      prevPageRef.current = route.page;
      return () => clearTimeout(t);
    }
  }, [route.page]);

  const isEmbed = route.page === "embed";

  if (route.page === "runtime" || route.page === "embed") {
    return (
      <div className="app-root">
        <AgentRuntime
          agentId={route.agentId}
          asrUrl={gatewayConfig.asrStreamUrl}
          session={session}
          updateSession={updateSession}
          sessionRef={sessionRef}
          isEmbed={isEmbed}
        />
      </div>
    );
  }

  const activePage = getActivePage(route);

  let content: React.ReactNode;

  switch (route.page) {
    case "builder":
      content = <AgentBuilder agentId={route.agentId} />;
      break;
    case "transcribe":
      content = <TranscribePage />;
      break;
    case "tts":
      content = <TtsPlaygroundPage />;
      break;
    case "research":
      content = <ResearchPage />;
      break;
    case "video-to-music":
      content = <VideoToMusicPage />;
      break;
    case "sessions":
      content = <SessionsPage />;
      break;
    case "session-detail":
      content = <SessionDetail sessionId={route.sessionId} />;
      break;
    case "settings":
      content = (
        <AdminPortal
          session={session}
          settings={settings}
          updateSettings={updateSettings}
          viewMode="settings"
        />
      );
      break;
    case "voice-agents":
    default:
      content = (
        <AdminPortal
          session={session}
          settings={settings}
          updateSettings={updateSettings}
          viewMode="agents"
        />
      );
      break;
  }

  const pageClass = transitioning ? "page-enter" : "page-enter-active";

  return (
    <AppShell activePage={activePage}>
      <div className={pageClass} key={route.page}>
        {content}
      </div>
    </AppShell>
  );
}
