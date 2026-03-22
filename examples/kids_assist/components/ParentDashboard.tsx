import React, { useState } from "react";
import type { SessionState } from "../App";
import EmotionTimeline from "./EmotionTimeline";
import EmotionRadar from "./EmotionRadar";
import MomentsPanel from "./MomentsPanel";
import TranscriptPanel from "./TranscriptPanel";
import ConversationStarters from "./ConversationStarters";

interface Props {
  session: SessionState;
}

type Tab = "live" | "moments" | "starters";

export default function ParentDashboard({ session }: Props) {
  const [tab, setTab] = useState<Tab>("live");

  const elapsed = session.sessionStart
    ? Math.floor((Date.now() - session.sessionStart) / 1000)
    : 0;
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;

  return (
    <div className="parent-dashboard">
      <div className="parent-header">
        <div className="parent-header-left">
          <h1 className="parent-title">Parent Dashboard</h1>
          <div className="parent-status-row">
            {session.isActive ? (
              <span className="parent-status parent-status--active">
                <span className="parent-status-dot" />
                Live — {min}:{sec.toString().padStart(2, "0")}
              </span>
            ) : session.transcript.length > 0 ? (
              <span className="parent-status parent-status--ended">Session ended</span>
            ) : (
              <span className="parent-status parent-status--idle">Waiting for session...</span>
            )}
            {session.isActive && (
              <span className="parent-speaker-label">
                {session.speakerLabel === "child" ? "🧒 Child speaking" : "👤 Other speaking"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="parent-section">
        <h2 className="section-title">Emotion Flow</h2>
        <EmotionTimeline timeline={session.emotionTimeline} />
      </div>

      <div className="parent-section">
        <h2 className="section-title">Emotion Profile</h2>
        <EmotionRadar profile={session.profile} />
      </div>

      <div className="parent-tabs">
        <button
          type="button"
          className={`parent-tab ${tab === "live" ? "parent-tab--active" : ""}`}
          onClick={() => setTab("live")}
        >
          Live Transcript
          {session.transcript.length > 0 && (
            <span className="tab-count">{session.transcript.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`parent-tab ${tab === "moments" ? "parent-tab--active" : ""}`}
          onClick={() => setTab("moments")}
        >
          Moments
          {session.moments.length > 0 && (
            <span className="tab-count">{session.moments.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`parent-tab ${tab === "starters" ? "parent-tab--active" : ""}`}
          onClick={() => setTab("starters")}
        >
          Talk About
        </button>
      </div>

      <div className="parent-tab-content">
        {tab === "live" && <TranscriptPanel transcript={session.transcript} />}
        {tab === "moments" && <MomentsPanel moments={session.moments} sessionStart={session.sessionStart} />}
        {tab === "starters" && <ConversationStarters transcript={session.transcript} moments={session.moments} />}
      </div>

      {!session.isActive && session.transcript.length === 0 && (
        <div className="parent-empty-state">
          <div className="parent-empty-icon">👨‍👧</div>
          <h2>No session yet</h2>
          <p>Switch to <strong>Kid View</strong> and tap the mic button to start a conversation.</p>
          <p>Come back here to see real-time insights, emotional moments, and conversation starters.</p>
        </div>
      )}
    </div>
  );
}
