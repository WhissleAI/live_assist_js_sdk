import React, { useState, useCallback, useRef } from "react";
import type { BehavioralProfile } from "@whissle/live-assist-core";
import KidView from "./components/KidView";
import ParentDashboard from "./components/ParentDashboard";
import { gatewayConfig } from "./lib/gateway-config";
import type { KidsMode } from "./lib/modes";

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
  speaker: "child" | "other" | "agent";
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
  type: "emotion_peak" | "topic" | "speaker_change" | "question" | "concern";
  speaker: "child" | "other" | "agent";
  severity?: "low" | "medium" | "high";
}

export interface RegulationEvent {
  id: string;
  timestamp: number;
  technique: string;
  startEmotion: string;
  endEmotion?: string;
  durationSec?: number;
  wasEffective?: boolean;
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
  mode: KidsMode;
  regulationEvents: RegulationEvent[];
  flaggedConcerns: Array<{ text: string; emotion: string; severity: string; reason: string; timestamp: number }>;
  topicsDiscussed: string[];
  checkinData?: { overall_mood: string; highlights: string[]; concerns: string[] };
  storyBeats: Array<{ narrator_text: string; child_prompt: string; mood: string }>;
}

export interface AppSettings {
  parentPin: string | null;
  maxSessionMinutes: number;
  childAge: number;
  childName: string;
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("whissle_kids_settings");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { parentPin: null, maxSessionMinutes: 15, childAge: 7, childName: "" };
}

type View = "kid" | "parent";

const INITIAL_SESSION: SessionState = {
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
  mode: "kids_free_talk",
  regulationEvents: [],
  flaggedConcerns: [],
  topicsDiscussed: [],
  storyBeats: [],
};

export default function App() {
  const [view, setView] = useState<View>("kid");
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

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
      localStorage.setItem("whissle_kids_settings", JSON.stringify(next));
      return next;
    });
  }, []);

  const handleViewToggle = useCallback(() => {
    if (view === "kid" && settings.parentPin) {
      setPinInput("");
      setPinError(false);
      setView("pin_check" as View);
      return;
    }
    setView((v) => (v === "kid" ? "parent" : "kid"));
  }, [view, settings.parentPin]);

  const handlePinSubmit = useCallback(() => {
    if (pinInput === settings.parentPin) {
      setView("parent");
      setPinError(false);
    } else {
      setPinError(true);
    }
  }, [pinInput, settings.parentPin]);

  if ((view as string) === "pin_check") {
    return (
      <div className="app-root">
        <div className="pin-screen">
          <h2 className="pin-title">Parent Access</h2>
          <p className="pin-subtitle">Enter your PIN to view the parent dashboard</p>
          <div className="pin-input-row">
            <input
              type="password"
              maxLength={4}
              className="pin-input"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
              placeholder="••••"
              autoFocus
            />
            <button type="button" className="pin-submit" onClick={handlePinSubmit}>Go</button>
          </div>
          {pinError && <p className="pin-error">Wrong PIN. Try again.</p>}
          <button type="button" className="pin-back" onClick={() => setView("kid")}>Back to Kid View</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <button
        type="button"
        className="view-toggle"
        onClick={handleViewToggle}
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
          asrUrl={gatewayConfig.asrStreamUrl}
          session={session}
          updateSession={updateSession}
          sessionRef={sessionRef}
          settings={settings}
        />
      ) : (
        <ParentDashboard
          session={session}
          settings={settings}
          updateSettings={updateSettings}
        />
      )}
    </div>
  );
}
