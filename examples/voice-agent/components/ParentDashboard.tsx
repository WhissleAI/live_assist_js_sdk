import React, { useState, useMemo } from "react";
import type { SessionState, AppSettings } from "../App";
import { loadSessions } from "../lib/session-store";
import { computeInsights } from "../lib/insights";
import EmotionTimeline from "./EmotionTimeline";
import EmotionRadar from "./EmotionRadar";
import MomentsPanel from "./MomentsPanel";
import TranscriptPanel from "./TranscriptPanel";
import ConversationStarters from "./ConversationStarters";
import EmotionTrends from "./EmotionTrends";
import InterestMap from "./InterestMap";
import RegulationStats from "./RegulationStats";
import SessionHistory from "./SessionHistory";
import ParentSettings from "./ParentSettings";

interface Props {
  session: SessionState;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

type Section = "overview" | "history" | "settings";

export default function ParentDashboard({ session, settings, updateSettings }: Props) {
  const [section, setSection] = useState<Section>("overview");

  const storedSessions = useMemo(() => loadSessions(), [session.isActive]);
  const insights = useMemo(() => computeInsights(storedSessions), [storedSessions]);

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
                {session.speakerLabel === "child" ? "Child speaking" : "Other speaking"}
              </span>
            )}
          </div>
        </div>
        <div className="parent-stats-bar">
          <span className="parent-stat">{insights.totalSessionCount} sessions</span>
          <span className="parent-stat">{insights.totalMinutes} min total</span>
        </div>
      </div>

      <div className="parent-nav">
        {(["overview", "history", "settings"] as Section[]).map((s) => (
          <button
            key={s}
            type="button"
            className={`parent-nav-btn ${section === s ? "parent-nav-btn--active" : ""}`}
            onClick={() => setSection(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="parent-overview">
          {session.isActive && (
            <div className="parent-section">
              <h2 className="section-title">Current Session</h2>
              <EmotionTimeline timeline={session.emotionTimeline} />
              <EmotionRadar profile={session.profile} />
              <div className="parent-live-tabs">
                <TranscriptPanel transcript={session.transcript} />
              </div>
            </div>
          )}

          {session.isActive && session.moments.length > 0 && (
            <div className="parent-section">
              <h2 className="section-title">Moments</h2>
              <MomentsPanel moments={session.moments} sessionStart={session.sessionStart} />
            </div>
          )}

          {insights.emotionTrends.length > 0 && (
            <div className="parent-section">
              <h2 className="section-title">Emotional Trends</h2>
              <EmotionTrends
                trends={insights.emotionTrends}
                thisWeekEmotions={insights.thisWeekEmotions}
                lastWeekEmotions={insights.lastWeekEmotions}
              />
            </div>
          )}

          {insights.topicFrequencies.length > 0 && (
            <div className="parent-section">
              <h2 className="section-title">Interest Map</h2>
              <InterestMap topics={insights.topicFrequencies} />
            </div>
          )}

          <RegulationStats stats={insights.regulationStats} />

          {insights.recentConcerns.length > 0 && (
            <div className="parent-section">
              <h2 className="section-title">Flagged Concerns</h2>
              <div className="concerns-list">
                {insights.recentConcerns.map((c, i) => (
                  <div key={i} className={`concern-card concern-card--${c.severity}`}>
                    <span className="concern-severity">{c.severity}</span>
                    <span className="concern-text">{c.text}</span>
                    <span className="concern-emotion">{c.emotion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="parent-section">
            <h2 className="section-title">Conversation Starters</h2>
            <ConversationStarters
              transcript={session.transcript}
              moments={session.moments}
              storedSessions={storedSessions}
            />
          </div>

          {!session.isActive && session.transcript.length === 0 && storedSessions.length === 0 && (
            <div className="parent-empty-state">
              <div className="parent-empty-icon">👨‍👧</div>
              <h2>No sessions yet</h2>
              <p>Switch to <strong>Kid View</strong> and pick a mode to start. Come back here to see real-time insights and trends.</p>
            </div>
          )}
        </div>
      )}

      {section === "history" && (
        <SessionHistory sessions={storedSessions} />
      )}

      {section === "settings" && (
        <ParentSettings settings={settings} updateSettings={updateSettings} />
      )}
    </div>
  );
}
