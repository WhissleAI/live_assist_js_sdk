import React, { useState, useMemo } from "react";
import { loadSessions } from "../lib/session-store";
import { loadAgents } from "../lib/agent-store";
import { navigate } from "../App";
import type { StoredSession } from "../lib/session-store";
import Icon from "./Icon";

const EMOTION_COLORS: Record<string, string> = {
  HAPPY: "#facc15", SAD: "#3b82f6", ANGRY: "#ef4444", FEAR: "#8b5cf6",
  SURPRISE: "#f97316", DISGUST: "#22c55e", NEUTRAL: "#9ca3af",
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function SessionsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const sessions = useMemo(() => loadSessions(), [refreshKey]);
  const agents = useMemo(() => loadAgents(), [refreshKey]);

  const [filterAgent, setFilterAgent] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  const uniqueAgents = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => {
      if (s.agentId && s.agentName) map.set(s.agentId, s.agentName);
    });
    return Array.from(map.entries());
  }, [sessions]);

  const filtered = useMemo(() => {
    let result = [...sessions].reverse();
    if (filterAgent !== "all") {
      result = result.filter((s) => s.agentId === filterAgent);
    }
    if (filterDate) {
      result = result.filter((s) => {
        const local = new Date(s.date).toLocaleDateString("en-CA");
        return local === filterDate;
      });
    }
    return result;
  }, [sessions, filterAgent, filterDate]);

  return (
    <div className="studio-page">
      <div className="studio-page-header">
        <h1 className="studio-page-title">Sessions</h1>
        <p className="studio-page-subtitle">Review past conversations and analyze emotion patterns</p>
      </div>

      {sessions.length === 0 ? (
        <div className="studio-empty-state">
          <div className="empty-icon"><Icon name="bar-chart" size={32} /></div>
          <h3>No sessions yet</h3>
          <p>Sessions will appear here after users interact with your voice agents.</p>
        </div>
      ) : (
        <>
          <div className="sessions-filter-bar">
            <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
              <option value="all">All Agents</option>
              {uniqueAgents.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              placeholder="Filter by date"
            />
            {(filterAgent !== "all" || filterDate) && (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => { setFilterAgent("all"); setFilterDate(""); }}
              >
                Clear filters
              </button>
            )}
            <span className="sessions-filter-count">
              {filtered.length} session{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="session-card-grid">
            {filtered.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: StoredSession }) {
  const emoColor = EMOTION_COLORS[session.emotionSummary?.dominant] ?? "#9ca3af";
  const dominant = session.emotionSummary?.dominant ?? "NEUTRAL";

  return (
    <div className="session-card" onClick={() => navigate(`sessions/${session.id}`)}>
      <div className="session-card-header">
        <span className="session-card-agent">{session.agentName || "Agent"}</span>
        <span className="session-card-date">
          {formatDate(session.date)} · {formatTime(session.date)}
        </span>
      </div>
      <div className="session-card-meta">
        <span>{formatDuration(session.durationSec)}</span>
        <span>{session.transcript.length} segments</span>
        <span className="session-card-emotion" style={{ color: emoColor, background: `${emoColor}15` }}>
          {dominant.charAt(0) + dominant.slice(1).toLowerCase()}
        </span>
      </div>
      {session.topicsDiscussed.length > 0 && (
        <div className="tag-row">
          {session.topicsDiscussed.slice(0, 3).map((t, i) => (
            <span key={i} className="tag">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
