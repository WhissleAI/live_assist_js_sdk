import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  const [searchInput, setSearchInput] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        s.transcript.some((seg) => seg.text.toLowerCase().includes(q)) ||
        (s.agentName && s.agentName.toLowerCase().includes(q)) ||
        s.topicsDiscussed.some((t) => t.toLowerCase().includes(q)) ||
        (s.emotionSummary?.dominant && s.emotionSummary.dominant.toLowerCase().includes(q))
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
    setSelected((prev) => { const next = new Set(prev); next.delete(sessionId); return next; });
    setRefreshKey((k) => k + 1);
  }, []);

  const toggleSelect = useCallback((id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const ids = filtered.map((s) => s.id);
    setSelected((prev) => prev.size === ids.length ? new Set() : new Set(ids));
  }, [filtered]);

  const handleBatchDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!(await confirmAction(`Delete ${selected.size} session${selected.size > 1 ? "s" : ""}?`, "This cannot be undone."))) return;
    for (const id of selected) {
      deleteSession(id);
      deleteAudio(id).catch(() => {});
    }
    showToast(`${selected.size} session${selected.size > 1 ? "s" : ""} deleted`, "success");
    setSelected(new Set());
    setRefreshKey((k) => k + 1);
  }, [selected]);

  // Reset page when filters change
  const handleFilterAgent = useCallback((val: string) => { setFilterAgent(val); setPage(0); }, []);
  const handleFilterDate = useCallback((val: string) => { setFilterDate(val); setPage(0); }, []);
  const handleSearchInput = useCallback((val: string) => {
    setSearchInput(val);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(val);
      setPage(0);
    }, 250);
  }, []);
  useEffect(() => () => clearTimeout(searchTimerRef.current), []);

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
              value={searchInput}
              onChange={(e) => handleSearchInput(e.target.value)}
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
                onClick={() => { handleFilterAgent("all"); handleFilterDate(""); setSearchInput(""); setSearchQuery(""); setPage(0); }}
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

          {/* Batch actions bar */}
          {selected.size > 0 && (
            <div className="sessions-batch-bar">
              <span>{selected.size} selected</span>
              <button type="button" className="btn btn--small btn--ghost" onClick={selectAll}>
                {selected.size === filtered.length ? "Deselect all" : "Select all"}
              </button>
              <button type="button" className="btn btn--small btn--danger" onClick={handleBatchDelete}>
                <Icon name="trash" size={13} /> Delete selected
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => setSelected(new Set())}>
                Cancel
              </button>
            </div>
          )}

          <div className="session-card-grid">
            {pageSlice.map((s) => (
              <SessionCard key={s.id} session={s} onDelete={handleDelete} isSelected={selected.has(s.id)} onToggleSelect={toggleSelect} />
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

function SessionCard({ session, onDelete, isSelected, onToggleSelect }: { session: StoredSession; onDelete: (id: string, e: React.MouseEvent) => void; isSelected?: boolean; onToggleSelect?: (id: string, e: React.MouseEvent | React.ChangeEvent) => void }) {
  const emoColor = EMOTION_COLORS[session.emotionSummary?.dominant] ?? "#9ca3af";
  const dominant = session.emotionSummary?.dominant ?? "NEUTRAL";

  return (
    <div
      className={`session-card ${isSelected ? "session-card--selected" : ""}`}
      onClick={() => navigate(`sessions/${session.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`sessions/${session.id}`); } }}
      role="button"
      tabIndex={0}
      aria-label={`Session with ${session.agentName || "Agent"} on ${formatDate(session.date)}`}
    >
      <div className="session-card-header">
        {onToggleSelect && (
          <input
            type="checkbox"
            className="session-card-checkbox"
            checked={isSelected ?? false}
            onChange={(e) => onToggleSelect(session.id, e)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select session"
          />
        )}
        <span className="session-card-agent">{session.customName || session.agentName || "Agent"}</span>
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
