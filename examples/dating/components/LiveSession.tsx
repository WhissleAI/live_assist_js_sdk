import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DateConfig } from "../App";
import type { SessionData } from "../hooks/useDatingSession";
import { useDatingSession } from "../hooks/useDatingSession";
import { useEmotionTimeline } from "../hooks/useEmotionTimeline";
import EmotionTimeline from "./EmotionTimeline";
import ChemistryMeter from "./ChemistryMeter";
import CoachingSidebar from "./CoachingSidebar";
import InterestSignals from "./InterestSignals";
import VoiceProfileCard from "./VoiceProfileCard";

interface Props {
  config: DateConfig;
  onEnd: (data: SessionData) => void;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function LiveSession({ config, onEnd }: Props) {
  const { timeline, addPoint, reset } = useEmotionTimeline();
  const { state, start, stop } = useDatingSession(config, addPoint);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [state.transcript]);

  // Timer
  useEffect(() => {
    if (!state.isActive) return;
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [state.isActive]);

  const handleStart = useCallback(async () => {
    reset();
    setElapsed(0);
    await start();
  }, [start, reset]);

  const handleEnd = useCallback(() => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      setTimeout(() => setConfirmEnd(false), 3000);
      return;
    }
    const data = stop();
    onEnd(data);
  }, [confirmEnd, stop, onEnd]);

  if (!state.isActive) {
    return (
      <div className="live-root">
        <div className="live-start-container">
          <div className="live-start-icon">{"\uD83C\uDFA4"}</div>
          <h1>Ready to Coach</h1>
          <p>
            {config.dateType === "video-call"
              ? "Your mic and screen audio will be captured for two-way analysis."
              : "Your mic will capture the conversation for real-time coaching."}
          </p>
          <p className="live-start-hint">
            Dating coach will listen and provide real-time tips in the sidebar.
          </p>
          <button type="button" className="live-start-btn" onClick={handleStart}>
            Start Live Coaching
          </button>
          {state.error && <p className="live-error">{state.error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="live-root">
      <div className="live-layout">
        {/* Left: Main conversation area */}
        <div className="live-main">
          {/* Top bar */}
          <div className="live-header-bar">
            <div className="live-timer">
              <span className="live-recording-dot" />
              {formatDuration(elapsed)}
            </div>
            <div className="live-date-info">
              {config.dateName ? `Date with ${config.dateName}` : "Live Date Coaching"}
            </div>
            <button
              type="button"
              className={`live-end-btn ${confirmEnd ? "live-end-btn--confirm" : ""}`}
              onClick={handleEnd}
            >
              {confirmEnd ? "Confirm End?" : "End Session"}
            </button>
          </div>

          {/* Transcript */}
          <div className="live-transcript" ref={transcriptRef}>
            {state.transcript.length === 0 ? (
              <p className="live-transcript-empty">
                Start talking... your conversation will appear here with real-time emotion analysis.
              </p>
            ) : (
              state.transcript
                .filter((e) => e.is_final !== false)
                .map((entry, i) => (
                  <div
                    key={entry._id ?? i}
                    className={`live-transcript-entry live-transcript-entry--${entry.channel}`}
                  >
                    <span className="live-transcript-speaker">
                      {entry.channel === "mic" ? "You" : "Them"}
                    </span>
                    <span className="live-transcript-text">{entry.text}</span>
                    {entry.metadata?.emotion && entry.metadata.emotion !== "NEUTRAL" && (
                      <span
                        className="live-transcript-emotion"
                        title={entry.metadata.emotion}
                      >
                        {entry.metadata.emotion.charAt(0) + entry.metadata.emotion.slice(1).toLowerCase()}
                      </span>
                    )}
                  </div>
                ))
            )}
          </div>

          {/* Emotion Timeline */}
          <EmotionTimeline timeline={timeline} />

          {/* Voice Profiles */}
          <div className="live-profiles">
            <VoiceProfileCard label="You" profile={state.userProfile} color="#8b5cf6" />
            <VoiceProfileCard label="Them" profile={state.otherProfile} color="#ec4899" />
          </div>
        </div>

        {/* Right: Coaching sidebar */}
        <div className="live-sidebar">
          <ChemistryMeter chemistry={state.chemistry} />
          <InterestSignals signals={state.signals} />
          <CoachingSidebar
            feedbackText={state.feedbackChunks}
            suggestions={state.suggestions}
            keywords={state.keywords}
          />
        </div>
      </div>
    </div>
  );
}
