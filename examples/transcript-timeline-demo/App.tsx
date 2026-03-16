import React, { useMemo, useCallback, useState, useEffect } from "react";
import {
  LiveAssistProvider,
  useLiveAssist,
  InlineProfileChart,
  TranscriptView,
  EmotionTimelineBar,
  KeywordBag,
  AgendaTracker,
} from "@whissle/live-assist-react";
import "@whissle/live-assist-react/styles/live-assist.css";
import type { AgendaItem } from "@whissle/live-assist-core";
import { listSessions, type StoredSession } from "@whissle/live-assist-core";

function detectConfig() {
  const loc = typeof window !== "undefined" ? window.location : { hostname: "localhost", protocol: "http:", port: "" };
  const host = loc.hostname || "localhost";
  const wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
  const agentPort = loc.port || "8765";
  const asrPort = "8001";
  return {
    asrUrl: `${wsProto}//${host}:${asrPort}/asr/stream`,
    agentUrl: `${loc.protocol}//${host}:${agentPort}`,
    audioWorkletUrl: "/audio-capture-processor.js",
  };
}

const config = detectConfig();

const DEFAULT_AGENDA = [
  "Identify key pain points or needs",
  "Present solution or options",
  "Discuss next steps or agreements",
  "Confirm action items",
];

function makeAgendaItem(title: string): AgendaItem {
  return { id: `ag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title, status: "pending", confidence: 0 };
}

type SessionListItem = Omit<StoredSession, "audioBlob">;

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(transcript: SessionListItem["transcript"]): string {
  if (!transcript.length) return "0s";
  const maxOffset = Math.max(...transcript.map((e) => e.audioOffset ?? 0));
  const m = Math.floor(maxOffset / 60);
  const s = Math.floor(maxOffset % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function SessionExplorer({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionListItem | null>(null);

  useEffect(() => {
    listSessions(100).then((s) => { setSessions(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

  if (selected) {
    const micEntries = selected.transcript.filter((e) => e.channel === "mic").map((e, i) => ({
      ...e, channel: "mic" as const, _id: i,
    }));
    const tabEntries = selected.transcript.filter((e) => e.channel === "tab").map((e, i) => ({
      ...e, channel: "tab" as const, _id: 10000 + i,
    }));
    const allEntries = selected.transcript.map((e, i) => ({
      ...e, channel: e.channel as "mic" | "tab" | "assistant", _id: i,
    }));
    const durationSec = Math.max(10, ...selected.transcript.map((e) => (e.audioOffset ?? 0) + 5));
    const agenda = selected.agendaItems?.map((a) => ({
      id: a.id, title: a.title, status: a.status as AgendaItem["status"], confidence: a.confidence ?? 0,
    })) ?? [];

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: FONT, background: "#f8fafb" }}>
        <div style={{
          padding: "0 20px", height: 40, display: "flex", alignItems: "center", gap: 10,
          borderBottom: "1px solid #e8eaed", background: "#fff", flexShrink: 0,
        }}>
          <button type="button" onClick={() => setSelected(null)} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#6b7280", padding: "2px 6px",
          }}>
            ← Back
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#124e3f" }}>
            Session — {formatDate(selected.timestamp)}
          </span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {formatDuration(selected.transcript)} · {selected.transcript.length} segments
          </span>
        </div>

        {/* Emotion timelines */}
        {(micEntries.length > 0 || tabEntries.length > 0) && (
          <div style={{
            padding: "6px 20px 8px", background: "#fff", borderBottom: "1px solid #e8eaed",
            flexShrink: 0, display: "flex", gap: 16,
          }}>
            {micEntries.length > 0 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  You — Emotion
                </div>
                <EmotionTimelineBar entries={micEntries} durationSec={durationSec} height={36} />
              </div>
            )}
            {tabEntries.length > 0 && micEntries.length > 0 && (
              <div style={{ width: 1, background: "#e8eaed", flexShrink: 0, alignSelf: "stretch" }} />
            )}
            {tabEntries.length > 0 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Other — Emotion
                </div>
                <EmotionTimelineBar entries={tabEntries} durationSec={durationSec} height={36} />
              </div>
            )}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          {/* Left: You profile */}
          <div style={{
            width: 180, flexShrink: 0, borderRight: "1px solid #e8eaed", padding: "10px 12px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "#fff", overflowY: "auto",
          }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>You</div>
            <InlineProfileChart profile={selected.report.userProfile} size={140} />
            <KeywordBag entries={micEntries} label="Keywords" />
            {selected.report.userKeywords?.length > 0 && (
              <div style={{ width: "100%", marginTop: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Extracted</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {selected.report.userKeywords.map((kw) => (
                    <span key={kw} style={{ padding: "2px 7px", fontSize: 10, fontWeight: 500, color: "#475569", background: "#f1f5f9", borderRadius: 3, border: "1px solid #e2e8f0" }}>{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Center: Transcript */}
          <div style={{ flex: 1, padding: "10px 14px", overflow: "auto", minWidth: 0 }}>
            {selected.report.feedbackSummary && (
              <div style={{
                padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0",
                borderRadius: 6, fontSize: 12, lineHeight: 1.5, marginBottom: 12, color: "#166534",
              }}>
                <div style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, color: "#15803d" }}>Summary</div>
                {selected.report.feedbackSummary}
              </div>
            )}
            <TranscriptView entries={allEntries} maxHeight={9999} />
          </div>

          {/* Right: Other + Agenda + Meta */}
          <div style={{
            width: 200, flexShrink: 0, borderLeft: "1px solid #e8eaed", padding: "10px 12px",
            display: "flex", flexDirection: "column", gap: 0, background: "#fff", overflowY: "auto",
          }}>
            {selected.report.otherProfile.segmentCount > 0 && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                paddingBottom: 10, borderBottom: "1px solid #f1f5f9", marginBottom: 6,
              }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Other</div>
                <InlineProfileChart profile={selected.report.otherProfile} size={120} />
                <KeywordBag entries={tabEntries} label="Keywords" />
              </div>
            )}

            {agenda.length > 0 && <AgendaTracker items={agenda} compact />}

            {selected.report.engagementScore != null && (
              <div style={{ marginTop: 10, padding: "8px 10px", background: "#f9fafb", borderRadius: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Engagement</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#124e3f" }}>{selected.report.engagementScore}%</div>
              </div>
            )}

            {selected.report.sentimentTrend && (
              <div style={{ marginTop: 6, padding: "8px 10px", background: "#f9fafb", borderRadius: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Sentiment</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "capitalize" }}>{selected.report.sentimentTrend}</div>
              </div>
            )}

            {selected.report.actionItems?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Action Items</div>
                {selected.report.actionItems.map((a) => (
                  <div key={a.id} style={{ fontSize: 11, lineHeight: 1.4, padding: "4px 0", color: "#374151", borderBottom: "1px solid #f8fafc" }}>
                    • {a.title}
                  </div>
                ))}
              </div>
            )}

            {selected.report.suggestions?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Suggestions</div>
                {selected.report.suggestions.map((s, i) => (
                  <div key={i} style={{ fontSize: 11, lineHeight: 1.4, padding: "4px 0", color: "#374151", borderBottom: "1px solid #f8fafc" }}>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: FONT, background: "#f8fafb" }}>
      <div style={{
        padding: "0 20px", height: 40, display: "flex", alignItems: "center", gap: 10,
        borderBottom: "1px solid #e8eaed", background: "#fff", flexShrink: 0,
      }}>
        <button type="button" onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#6b7280", padding: "2px 6px",
        }}>
          ← Back
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#124e3f" }}>Session History</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{sessions.length} sessions</span>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 13 }}>Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4 }}>No sessions yet</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Complete a Live Assist session to see data here.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640, margin: "0 auto" }}>
            {sessions.map((s) => {
              const segCount = s.transcript.length;
              const micCount = s.transcript.filter((e) => e.channel === "mic").length;
              const tabCount = s.transcript.filter((e) => e.channel === "tab").length;
              const agendaDone = s.agendaItems?.filter((a) => a.status === "completed" || (a.confidence ?? 0) >= 75).length ?? 0;
              const agendaTotal = s.agendaItems?.length ?? 0;
              const topEmotion = s.report.userProfile?.emotionProfile
                ? Object.entries(s.report.userProfile.emotionProfile).sort((a, b) => b[1] - a[1])[0]
                : null;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  style={{
                    background: "#fff", border: "1px solid #e8eaed", borderRadius: 8, padding: "12px 16px",
                    cursor: "pointer", textAlign: "left", transition: "border-color 0.15s, box-shadow 0.15s",
                    display: "flex", flexDirection: "column", gap: 6,
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = "#124e3f"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(18,78,63,0.08)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = "#e8eaed"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                      {formatDate(s.timestamp)}
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {formatDuration(s.transcript)}
                    </span>
                  </div>

                  {s.report.feedbackSummary && (
                    <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.4, maxHeight: 40, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.report.feedbackSummary.slice(0, 120)}{s.report.feedbackSummary.length > 120 ? "..." : ""}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "#f1f5f9", color: "#64748b" }}>
                      {segCount} seg{tabCount > 0 ? ` (${micCount} you · ${tabCount} other)` : ""}
                    </span>
                    {agendaTotal > 0 && (
                      <span style={{
                        fontSize: 10, padding: "2px 6px", borderRadius: 3,
                        background: agendaDone === agendaTotal ? "#dcfce7" : "#f1f5f9",
                        color: agendaDone === agendaTotal ? "#16a34a" : "#64748b",
                      }}>
                        Agenda {agendaDone}/{agendaTotal}
                      </span>
                    )}
                    {topEmotion && topEmotion[0] !== "NEUTRAL" && (
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "#fef9c3", color: "#92400e" }}>
                        {topEmotion[0].charAt(0) + topEmotion[0].slice(1).toLowerCase()}
                      </span>
                    )}
                    {s.report.engagementScore != null && (
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "#eff6ff", color: "#1e40af" }}>
                        Engage {s.report.engagementScore}%
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionView() {
  const {
    isCapturing,
    hasTabAudio,
    transcript,
    userProfile,
    otherProfile,
    agendaItems: liveAgenda,
    error,
    instructions,
    setInstructions,
    startCapture,
    stopCapture,
  } = useLiveAssist();

  const [includeTab, setIncludeTab] = useState(false);
  const [recordAudio, setRecordAudio] = useState(true);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>(() => DEFAULT_AGENDA.map(makeAgendaItem));
  const [newItem, setNewItem] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionsDraft, setInstructionsDraft] = useState(instructions ?? "");
  const [showHistory, setShowHistory] = useState(false);

  const micEntries = useMemo(() => transcript.filter((e) => e.channel === "mic"), [transcript]);
  const tabEntries = useMemo(() => transcript.filter((e) => e.channel === "tab"), [transcript]);

  const durationSec = useMemo(() => {
    if (!transcript.length) return 10;
    const maxOffset = Math.max(...transcript.map((e) => e.audioOffset ?? 0));
    return Math.max(10, maxOffset + 5);
  }, [transcript]);

  const handleStart = useCallback(() => {
    startCapture({
      includeTab,
      agenda: agendaItems.length > 0 ? agendaItems : DEFAULT_AGENDA.map(makeAgendaItem),
      instructions: instructions?.trim() || undefined,
      recordAudio,
    });
  }, [includeTab, agendaItems, instructions, recordAudio, startCapture]);

  const handleStop = useCallback(() => stopCapture(), [stopCapture]);

  const addAgendaItem = useCallback(() => {
    const title = newItem.trim();
    if (!title) return;
    setAgendaItems((prev) => [...prev, makeAgendaItem(title)]);
    setNewItem("");
  }, [newItem]);

  const removeAgendaItem = useCallback((id: string) => {
    setAgendaItems((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

  // ── Session history explorer ──
  if (!isCapturing && showHistory) {
    return <SessionExplorer onBack={() => setShowHistory(false)} />;
  }

  // ── Pre-session: setup panel ──
  if (!isCapturing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: FONT, background: "#f8fafb" }}>
        {/* Header */}
        <div style={{
          padding: "0 20px",
          height: 40,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #e8eaed",
          background: "#fff",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#124e3f", letterSpacing: "-0.01em" }}>
            Live Assist
          </span>
        </div>

        {/* Centered setup card */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto" }}>
          <div style={{
            width: "100%",
            maxWidth: 440,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e8eaed",
            padding: "24px 28px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
              Session Setup
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>
              Configure your session before starting.
            </div>

            {error && (
              <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626", marginBottom: 16 }}>
                {error}
              </div>
            )}

            {/* Options row */}
            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={recordAudio} onChange={(e) => setRecordAudio(e.target.checked)} style={{ accentColor: "#124e3f" }} />
                Record audio
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={includeTab} onChange={(e) => setIncludeTab(e.target.checked)} style={{ accentColor: "#124e3f" }} />
                Share browser tab
              </label>
              <button
                type="button"
                onClick={() => { setInstructionsDraft(instructions ?? ""); setShowInstructions(true); }}
                style={{ marginLeft: "auto", padding: "4px 10px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 5, fontSize: 11, fontWeight: 500, color: "#6b7280", cursor: "pointer" }}
              >
                Instructions
              </button>
            </div>

            {/* Agenda */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Agenda
                </span>
                <button
                  type="button"
                  onClick={() => setAgendaItems(DEFAULT_AGENDA.map(makeAgendaItem))}
                  style={{ fontSize: 10, background: "none", border: "none", color: "#94a3b8", cursor: "pointer", textDecoration: "underline" }}
                >
                  Reset
                </button>
              </div>
              {agendaItems.map((item) => (
                <div key={item.id} style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "5px 8px",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "#374151",
                  background: "#f9fafb",
                  marginBottom: 3,
                }}>
                  <span style={{ flex: 1 }}>{item.title}</span>
                  <button
                    type="button"
                    onClick={() => removeAgendaItem(item.id)}
                    style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 10, padding: "2px 4px" }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  type="text"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAgendaItem()}
                  placeholder="Add item..."
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: 12,
                    border: "1px solid #e5e7eb",
                    borderRadius: 5,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={addAgendaItem}
                  style={{
                    padding: "6px 12px",
                    background: "#124e3f",
                    color: "#fff",
                    border: "none",
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            {/* Start button */}
            <button
              type="button"
              onClick={handleStart}
              style={{
                width: "100%",
                padding: "10px 0",
                background: "#124e3f",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Start Live Assist
            </button>

            {/* Session history */}
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              style={{
                width: "100%",
                padding: "9px 0",
                background: "transparent",
                color: "#6b7280",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>📋</span>
              Session History
            </button>
          </div>
        </div>

        {/* Instructions modal */}
        {showInstructions && (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
            onClick={() => setShowInstructions(false)}
          >
            <div
              style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 440, width: "90%", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Session Instructions</div>
              <textarea
                value={instructionsDraft}
                onChange={(e) => setInstructionsDraft(e.target.value)}
                rows={5}
                placeholder="Guide the assistant..."
                style={{ width: "100%", padding: 10, fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowInstructions(false)} style={{ padding: "6px 14px", background: "#f3f4f6", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                <button type="button" onClick={() => { setInstructions(instructionsDraft); setShowInstructions(false); }} style={{ padding: "6px 14px", background: "#124e3f", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Active session ──
  const showOther = hasTabAudio;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: FONT, background: "#fafbfc" }}>
      {/* Header — compact with status + stop */}
      <div style={{
        padding: "0 20px",
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #e8eaed",
        background: "#fff",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#124e3f" }}>Live Assist</span>
          <span style={{ width: 1, height: 14, background: "#e2e8f0" }} />
          <span style={{
            width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
            animation: "la-pulse 1.5s infinite", flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
            {showOther ? "Mic + Tab" : "Mic"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {error && <span style={{ color: "#ef4444", fontSize: 10 }}>{error}</span>}
          <button
            type="button"
            onClick={handleStop}
            style={{
              padding: "4px 12px",
              background: "#ef4444",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        </div>
      </div>

      {/* Emotion timelines — horizontal band below header */}
      <div style={{
        padding: "6px 20px 8px",
        background: "#fff",
        borderBottom: "1px solid #e8eaed",
        flexShrink: 0,
        display: "flex",
        gap: showOther ? 16 : 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9,
            fontWeight: 600,
            color: "#94a3b8",
            marginBottom: 3,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            You — Emotion
          </div>
          {micEntries.length > 0 ? (
            <EmotionTimelineBar entries={micEntries} durationSec={durationSec} height={36} />
          ) : (
            <div style={{ height: 36, borderRadius: 6, background: "#f1f5f9" }} />
          )}
        </div>

        {showOther && (
          <>
            <div style={{ width: 1, background: "#e8eaed", flexShrink: 0, alignSelf: "stretch" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#94a3b8",
                marginBottom: 3,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                Other — Emotion
              </div>
              {tabEntries.length > 0 ? (
                <EmotionTimelineBar entries={tabEntries} durationSec={durationSec} height={36} />
              ) : (
                <div style={{ height: 36, borderRadius: 6, background: "#f1f5f9" }} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Main content: You sidebar + transcript + right panel (Other + Agenda) */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* You sidebar */}
        <div style={{
          width: 180,
          flexShrink: 0,
          borderRight: "1px solid #e8eaed",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          background: "#fff",
          overflowY: "auto",
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>You</div>
          <InlineProfileChart profile={userProfile} size={140} />
          <KeywordBag entries={micEntries} label="Keywords" />
        </div>

        {/* Transcript */}
        <div style={{ flex: 1, padding: "10px 14px", overflow: "auto", minWidth: 0 }}>
          <TranscriptView entries={transcript} maxHeight={9999} />
        </div>

        {/* Right panel — Other (when tab shared) + Agenda (always) */}
        <div style={{
          width: 200,
          flexShrink: 0,
          borderLeft: "1px solid #e8eaed",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
          background: "#fff",
          overflowY: "auto",
        }}>
          {/* Other profile — only when tab is shared */}
          {showOther && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              paddingBottom: 10,
              borderBottom: "1px solid #f1f5f9",
              marginBottom: 6,
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Other</div>
              <InlineProfileChart profile={otherProfile} size={120} />
              <KeywordBag entries={tabEntries} label="Keywords" />
            </div>
          )}

          {/* Agenda tracker — always visible */}
          <AgendaTracker
            items={liveAgenda.length > 0 ? liveAgenda : agendaItems}
            compact
          />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LiveAssistProvider config={config}>
      <SessionView />
    </LiveAssistProvider>
  );
}
