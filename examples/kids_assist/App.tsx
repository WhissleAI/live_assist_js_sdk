import React, { useState, useCallback, useRef } from "react";
import type { BehavioralProfile } from "@whissle/live-assist-core";
import KidView from "./components/KidView";
import ParentDashboard from "./components/ParentDashboard";

export interface EmotionTimelineEntry {
  offset: number;
  emotion: string;
  confidence: number;
  probs?: { emotion: string; probability: number }[];
}

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker: "child" | "other";
  emotion?: string;
  emotionConfidence?: number;
  intent?: string;
  entities?: Array<{ entity: string; text: string }>;
}

export interface Moment {
  id: string;
  timestamp: number;
  text: string;
  emotion: string;
  emotionConfidence: number;
  type: "emotion_peak" | "topic" | "speaker_change" | "question";
  speaker: "child" | "other";
}

export interface SessionState {
  isActive: boolean;
  isConnected: boolean;
  transcript: TranscriptSegment[];
  moments: Moment[];
  emotionTimeline: EmotionTimelineEntry[];
  currentEmotion: string;
  currentEmotionProbs: Record<string, number>;
  profile: BehavioralProfile | null;
  speakerLabel: "child" | "other";
  error: string | null;
  sessionStart: number | null;
}

function detectAsrUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const override = params.get("asr");
  if (override) return override;

  const loc = typeof window !== "undefined" ? window.location : null;
  const host = loc?.hostname || "localhost";
  const port = loc?.port || "";
  const wsProto = loc?.protocol === "https:" ? "wss:" : "ws:";
  if (port === "5173" || port === "5174") {
    return `${wsProto}//${host}:8001/asr/stream`;
  }
  return `${wsProto}//${loc?.host || host}/asr/stream`;
}

type View = "kid" | "parent";

export default function App() {
  const [view, setView] = useState<View>("kid");
  const [asrUrl] = useState(detectAsrUrl);
  const sessionRef = useRef<SessionState>({
    isActive: false,
    isConnected: false,
    transcript: [],
    moments: [],
    emotionTimeline: [],
    currentEmotion: "NEUTRAL",
    currentEmotionProbs: {},
    profile: null,
    speakerLabel: "child",
    error: null,
    sessionStart: null,
  });

  const [session, setSession] = useState<SessionState>(sessionRef.current);

  const updateSession = useCallback((patch: Partial<SessionState>) => {
    const next = { ...sessionRef.current, ...patch };
    sessionRef.current = next;
    setSession(next);
  }, []);

  const toggleView = useCallback(() => {
    setView((v) => (v === "kid" ? "parent" : "kid"));
  }, []);

  return (
    <div className="app-root">
      <button
        type="button"
        className="view-toggle"
        onClick={toggleView}
        title={view === "kid" ? "Switch to Parent View" : "Switch to Kid View"}
      >
        {view === "kid" ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" x2="9.01" y1="9" y2="9" />
            <line x1="15" x2="15.01" y1="9" y2="9" />
          </svg>
        )}
        <span>{view === "kid" ? "Parent" : "Kid"}</span>
      </button>

      {view === "kid" ? (
        <KidView
          asrUrl={asrUrl}
          session={session}
          updateSession={updateSession}
          sessionRef={sessionRef}
        />
      ) : (
        <ParentDashboard
          session={session}
        />
      )}
    </div>
  );
}
