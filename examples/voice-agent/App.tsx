import React, { useState, useCallback, useRef, useEffect, Suspense, lazy } from "react";
import type { BehavioralProfile } from "@whissle/live-assist-core";
import AgentRuntime from "./components/AgentRuntime";
import AdminPortal from "./components/AdminPortal";
import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./components/AppShell";
import { ToastContainer } from "./components/Toast";
import { ConfirmModalContainer } from "./components/ConfirmModal";
import { gatewayConfig } from "./lib/gateway-config";
import { syncFromBackend } from "./lib/agent-store";
import { loadSessions } from "./lib/session-store";
import { pruneAudioStore } from "./lib/audio-store";
import type { AgentConfig } from "./lib/agent-config";

// Lazy-loaded pages — only fetched when navigated to
const AgentBuilder = lazy(() => import("./components/AgentBuilder"));
const SessionsPage = lazy(() => import("./components/SessionsPage"));
const SessionDetail = lazy(() => import("./components/SessionDetail"));
const TranscribePage = lazy(() => import("./components/TranscribePage"));
const TtsPlaygroundPage = lazy(() => import("./components/TtsPlaygroundPage"));
const ResearchPage = lazy(() => import("./components/ResearchPage"));
const VideoToMusicPage = lazy(() => import("./components/VideoToMusicPage"));
const MemoryPage = lazy(() => import("./components/MemoryPage"));
const UsagePage = lazy(() => import("./components/UsagePage"));
const SettingsPage = lazy(() => import("./components/SettingsPage"));

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
  /** Wall-clock ms when mic/ASR audio streaming began — the reference point for all audioOffsetSec values. */
  audioStartMs: number | null;
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
  | { page: "memory" }
  | { page: "usage" }
  | { page: "settings" }
  | { page: "runtime"; agentId: string }
  | { page: "embed"; agentId: string }
  | { page: "not-found" };

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
  if (h === "memory") return { page: "memory" };
  if (h === "usage") return { page: "usage" };
  if (h === "settings") return { page: "settings" };

  // Empty hash or root — go to dashboard
  if (!h) return { page: "voice-agents" };

  // Unknown route — show 404
  return { page: "not-found" };
}

function getActivePage(route: Route): string {
  if (route.page === "voice-agents" || route.page === "builder") return "voice-agents";
  if (route.page === "sessions" || route.page === "session-detail") return "sessions";
  if (route.page === "not-found") return "";
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
  audioStartMs: null,
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
  const mainContentRef = useRef<HTMLDivElement>(null);

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
    gatewayConfig.initSession().then(() => {
      // Sync agent configs with backend after session is established
      syncFromBackend().catch(() => {});
    }).catch(() => {});
    // Prune orphaned/expired audio blobs from IndexedDB
    const sessionIds = new Set(loadSessions().map((s) => s.id));
    pruneAudioStore(sessionIds).catch(() => {});
  }, []);

  useEffect(() => {
    if (prevPageRef.current !== route.page) {
      setTransitioning(true);
      const t = setTimeout(() => {
        setTransitioning(false);
        // Focus the main content area when the route changes
        if (mainContentRef.current) {
          mainContentRef.current.focus();
        }
      }, 30);
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
        <ToastContainer />
        <ConfirmModalContainer />
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
    case "memory":
      content = <MemoryPage />;
      break;
    case "usage":
      content = <UsagePage />;
      break;
    case "settings":
      content = <SettingsPage />;
      break;
    case "not-found":
      content = (
        <div className="not-found-page">
          <h1 className="not-found-title">404</h1>
          <p className="not-found-text">
            Page not found. The page you're looking for doesn't exist or has been moved.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => navigate("")}>
            Go to Dashboard
          </button>
        </div>
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
    <>
      <AppShell activePage={activePage}>
        <ErrorBoundary>
          <Suspense fallback={<div className="page-loading"><div className="page-loading-spinner" /></div>}>
            <div className={pageClass} key={route.page} ref={mainContentRef} tabIndex={-1} style={{ outline: "none" }}>
              {content}
            </div>
          </Suspense>
        </ErrorBoundary>
      </AppShell>
      <ToastContainer />
      <ConfirmModalContainer />
    </>
  );
}
