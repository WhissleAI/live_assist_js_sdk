import React, { useEffect, useState, useRef } from "react";
import { streamLiveAssistWithFeedback } from "@whissle/live-assist-core";
import type { DateConfig } from "../App";
import type { SessionData } from "../hooks/useDatingSession";
import { buildDebriefPrompt } from "../lib/dating-prompts";
import EmotionTimeline from "./EmotionTimeline";
import ChemistryMeter from "./ChemistryMeter";
import VoiceProfileCard from "./VoiceProfileCard";

interface Props {
  config: DateConfig;
  session: SessionData;
  onStartOver: () => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

export default function DebriefReport({ config, session, onStartOver }: Props) {
  const [debrief, setDebrief] = useState("");
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const abortController = new AbortController();

    // Build transcript summary for debrief analysis
    const transcriptText = session.transcript
      .filter((e) => e.is_final !== false)
      .map((e) => `[${e.channel === "mic" ? "You" : "Them"}]: ${e.text}`)
      .join("\n");

    const prompt = buildDebriefPrompt();

    streamLiveAssistWithFeedback({
      agentUrl: config.agentUrl,
      transcript: transcriptText || "No conversation transcript available.",
      userId: "dating-debrief",
      mode: "meeting",
      userPersonality: config.userPersonality,
      custom_prompt: prompt,
      contextFilters: {
        docs: false,
        memories: false,
        notes: false,
        history: false,
        emails: false,
      },
      callbacks: {
        onFeedbackChunk: (chunk) => {
          setDebrief((prev) => prev + chunk);
        },
        onDone: () => {
          setLoading(false);
        },
        onError: () => {
          setLoading(false);
        },
      },
      signal: abortController.signal,
    });

    return () => {
      abortController.abort();
    };
  }, [config, session]);

  return (
    <div className="debrief-root">
      <div className="debrief-header">
        <h1>Post-Date Debrief</h1>
        <p>
          {config.dateName ? `Your date with ${config.dateName}` : "Date analysis"} — {formatDuration(session.durationMs)}
        </p>
      </div>

      <div className="debrief-layout">
        {/* Left: Main analysis */}
        <div className="debrief-main">
          {/* Stats row */}
          <div className="debrief-stats">
            <div className="debrief-stat">
              <span className="debrief-stat-value">{formatDuration(session.durationMs)}</span>
              <span className="debrief-stat-label">Duration</span>
            </div>
            <div className="debrief-stat">
              <span className="debrief-stat-value">
                {session.transcript.filter((e) => e.is_final !== false).length}
              </span>
              <span className="debrief-stat-label">Exchanges</span>
            </div>
            <div className="debrief-stat">
              <span className="debrief-stat-value">{session.chemistry.overall}</span>
              <span className="debrief-stat-label">Chemistry</span>
            </div>
          </div>

          {/* Emotion Timeline */}
          <section className="debrief-section">
            <h2>Emotion Journey</h2>
            <EmotionTimeline timeline={session.emotionTimeline} />
          </section>

          {/* AI Debrief */}
          <section className="debrief-section">
            <h2>AI Analysis</h2>
            <div className="debrief-analysis">
              {debrief || (loading ? "Analyzing your date..." : "")}
              {loading && <span className="prep-cursor" />}
            </div>
          </section>

          {/* Keywords */}
          {session.keywords.length > 0 && (
            <section className="debrief-section">
              <h2>Topics Discussed</h2>
              <div className="coaching-keywords">
                {session.keywords.map((kw, i) => (
                  <span key={i} className="coaching-keyword">{kw}</span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: Profiles and chemistry */}
        <div className="debrief-sidebar">
          <ChemistryMeter chemistry={session.chemistry} />

          <div className="debrief-profiles">
            <VoiceProfileCard label="You" profile={session.userProfile} color="#8b5cf6" />
            <VoiceProfileCard label="Them" profile={session.otherProfile} color="#ec4899" />
          </div>
        </div>
      </div>

      <div className="debrief-actions">
        <button type="button" className="debrief-start-over-btn" onClick={onStartOver}>
          New Date Session
        </button>
      </div>
    </div>
  );
}
