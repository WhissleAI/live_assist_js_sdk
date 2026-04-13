import React, { useState } from "react";
import type { BehavioralProfile, SpeechRate, StreamTranscriptSegment } from "@whissle/live-assist-core";
import { ProfileBadge } from "@whissle/live-assist-react";
import { EmotionGauge } from "./EmotionGauge";

interface MetadataPanelProps {
  currentEmotion: string;
  currentEmotionProbs: Record<string, number>;
  currentIntent: string;
  currentIntentProbs: Record<string, number>;
  speechRate: SpeechRate | null;
  speakerLabel: string;
  profile: BehavioralProfile | null;
  lastRawSegment: StreamTranscriptSegment | null;
}

function SpeechRateCard({ rate }: { rate: SpeechRate | null }) {
  if (!rate) {
    return (
      <div className="metadata-card">
        <div className="card-label">Speech Rate</div>
        <div style={{ color: "#64748b", fontSize: 12, fontStyle: "italic" }}>Waiting for speech...</div>
      </div>
    );
  }

  const wpm = Math.round(rate.words_per_minute);
  const pace = wpm > 160 ? "Fast" : wpm > 130 ? "Normal" : wpm > 80 ? "Deliberate" : "Slow";
  const paceColor = wpm > 160 ? "#f59e0b" : wpm > 130 ? "#22c55e" : "#3b82f6";

  return (
    <div className="metadata-card">
      <div className="card-label">Speech Rate</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9", fontVariantNumeric: "tabular-nums" }}>
          {wpm}
        </span>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>WPM</span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: paceColor,
          background: `${paceColor}15`,
          padding: "2px 8px",
          borderRadius: 4,
        }}>
          {pace}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "#94a3b8" }}>
        {rate.filler_count > 0 && (
          <span>Fillers: <b style={{ color: "#f59e0b" }}>{rate.filler_count}</b></span>
        )}
        {rate.pause_count > 0 && (
          <span>Pauses: <b style={{ color: "#3b82f6" }}>{rate.pause_count}</b></span>
        )}
        <span>Words: <b style={{ color: "#f1f5f9" }}>{rate.word_count}</b></span>
      </div>
    </div>
  );
}

function RawJsonSection({ segment }: { segment: StreamTranscriptSegment | null }) {
  const [open, setOpen] = useState(false);

  if (!segment) return null;

  return (
    <div className="metadata-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 0,
          width: "100%",
        }}
      >
        <span className="card-label" style={{ margin: 0 }}>Raw ASR Response</span>
        <span style={{ fontSize: 10, color: "#64748b", marginLeft: "auto" }}>
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open && (
        <pre style={{
          marginTop: 8,
          padding: 12,
          background: "#0f172a",
          borderRadius: 8,
          fontSize: 10,
          lineHeight: 1.6,
          color: "#94a3b8",
          overflow: "auto",
          maxHeight: 300,
          border: "1px solid #1e293b",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {JSON.stringify(segment, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function MetadataPanel({
  currentEmotion,
  currentEmotionProbs,
  currentIntent,
  currentIntentProbs,
  speechRate,
  speakerLabel,
  profile,
  lastRawSegment,
}: MetadataPanelProps) {
  return (
    <div className="metadata-panel">
      <div className="panel-header">Live Metadata</div>

      {/* Current dominant emotion + intent badges */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <DominantBadge label="Emotion" value={currentEmotion} />
        {currentIntent && <DominantBadge label="Intent" value={currentIntent} />}
      </div>

      {/* Emotion probability distribution */}
      <EmotionGauge probs={currentEmotionProbs} label="Emotion Distribution" />

      {/* Intent probability distribution */}
      <EmotionGauge probs={currentIntentProbs} label="Intent" />

      {/* Speech rate */}
      <SpeechRateCard rate={speechRate} />

      {/* Speaker profile */}
      {profile && (
        <div className="metadata-card">
          <div className="card-label">Speaker Profile</div>
          <ProfileBadge
            profile={profile}
            label={speakerLabel === "user" ? "You" : "Other"}
          />
        </div>
      )}

      {/* Raw JSON */}
      <RawJsonSection segment={lastRawSegment} />
    </div>
  );
}

function DominantBadge({ label, value }: { label: string; value: string }) {
  const COLORS: Record<string, string> = {
    HAPPY: "#facc15", SAD: "#3b82f6", ANGRY: "#ef4444", NEUTRAL: "#9ca3af",
    FEAR: "#8b5cf6", SURPRISE: "#f97316", DISGUST: "#14b8a6",
    QUERY: "#3b82f6", COMMAND: "#ef4444", INFORM: "#22c55e",
    CONFIRM: "#14b8a6", DENY: "#f97316", GREET: "#8b5cf6", REQUEST: "#f59e0b",
  };
  const color = COLORS[value] ?? "#9ca3af";

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 12px",
      borderRadius: 6,
      background: `${color}15`,
      border: `1px solid ${color}30`,
      transition: "all 0.3s ease",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}60` }} />
      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>{label}:</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
