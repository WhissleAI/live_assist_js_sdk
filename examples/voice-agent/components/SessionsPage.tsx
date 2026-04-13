import React, { useState, useMemo, useCallback } from "react";
import { loadSessions, deleteSession } from "../lib/session-store";
import { deleteAudio } from "../lib/audio-store";
import { loadAgents } from "../lib/agent-store";
import { navigate } from "../App";
import type { StoredSession } from "../lib/session-store";
import { EMOTION_COLORS } from "../lib/transcriptEmotion";
import Icon from "./Icon";
import { confirmAction } from "./ConfirmModal";
import { showToast } from "./Toast";

const PAGE_SIZE = 12;

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

function exportSessions() {
  const data = JSON.stringify(loadSessions(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `whissle-sessions-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SessionsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const sessions = useMemo(() => loadSessions(), [refreshKey]);
  const agents = useMemo(() => loadAgents(), [refreshKey]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [page, setPage] = useState(0);

  const uniqueAgents = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => {
      if (s.agentId && s.agentName) map.set(s.agentId, s.agentName);
    });
    return Array.from(map.entries());
  }, [sessions]);

  const filtered = useMemo(() => {
    let result = [...sessions].reverse();
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.transcript.some((seg) => seg.text.toLowerCase().includes(q))
      );
    }
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
  }, [sessions, searchQuery, filterAgent, filterDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageSlice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const handleDelete = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmAction("Delete session?", "This cannot be undone."))) return;
    deleteSession(sessionId);
    deleteAudio(sessionId).catch(() => {});
    showToast("Session deleted", "success");
    setRefreshKey((k) => k + 1);
  }, []);

  // Reset page when filters change
  const handleFilterAgent = useCallback((val: string) => { setFilterAgent(val); setPage(0); }, []);
  const handleFilterDate = useCallback((val: string) => { setFilterDate(val); setPage(0); }, []);
  const handleSearch = useCallback((val: string) => { setSearchQuery(val); setPage(0); }, []);

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
          <div className="sessions-search-bar">
            <span className="sessions-search-icon"><Icon name="search" size={16} /></span>
            <input
              type="text"
              className="sessions-search-input"
              placeholder="Search transcripts..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          <div className="sessions-filter-bar">
            <select value={filterAgent} onChange={(e) => handleFilterAgent(e.target.value)}>
              <option value="all">All Agents</option>
              {uniqueAgents.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => handleFilterDate(e.target.value)}
              placeholder="Filter by date"
            />
            {(filterAgent !== "all" || filterDate || searchQuery) && (
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => { handleFilterAgent("all"); handleFilterDate(""); handleSearch(""); }}
              >
                Clear filters
              </button>
            )}
            <button
              type="button"
              className="btn btn--ghost btn--small sessions-export-btn"
              onClick={exportSessions}
            >
              <Icon name="download" size={14} /> Export
            </button>
            <span className="sessions-filter-count">
              {filtered.length} session{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="session-card-grid">
            {pageSlice.map((s) => (
              <SessionCard key={s.id} session={s} onDelete={handleDelete} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="sessions-pagination">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <Icon name="chevron-left" size={14} /> Prev
              </button>
              <span className="sessions-pagination-info">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next <Icon name="chevron-right" size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SessionCard({ session, onDelete }: { session: StoredSession; onDelete: (id: string, e: React.MouseEvent) => void }) {
  const emoColor = EMOTION_COLORS[session.emotionSummary?.dominant] ?? "#9ca3af";
  const dominant = session.emotionSummary?.dominant ?? "NEUTRAL";

  return (
    <div className="session-card" onClick={() => navigate(`sessions/${session.id}`)}>
      <div className="session-card-header">
        <span className="session-card-agent">{session.agentName || "Agent"}</span>
        <div className="session-card-actions">
          <span className="session-card-date">
            {formatDate(session.date)} · {formatTime(session.date)}
          </span>
          <button
            type="button"
            className="session-card-delete"
            title="Delete session"
            onClick={(e) => onDelete(session.id, e)}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
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
