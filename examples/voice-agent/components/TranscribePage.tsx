import React, { useState, useRef, useCallback, useEffect } from "react";
import type { SessionState, TranscriptSegment } from "../App";
import { useAsrSession } from "../hooks/useAsrSession";
import { gatewayConfig } from "../lib/gateway-config";
import Icon from "./Icon";

const INITIAL_SESSION: SessionState = {
  isActive: false,
  isConnected: false,
  transcript: [],
  moments: [],
  emotionTimeline: [],
  agentEmotionTimeline: [],
  currentEmotion: "NEUTRAL",
  currentEmotionProbs: {},
  profile: null,
  speakerLabel: "user",
  error: null,
  sessionStart: null,
  agentId: "transcribe",
  flaggedConcerns: [],
  topicsDiscussed: [],
};

export default function TranscribePage() {
  const sessionRef = useRef<SessionState>({ ...INITIAL_SESSION });
  const [session, setSession] = useState<SessionState>(sessionRef.current);
  const [mode, setMode] = useState<"live" | "upload">("live");

  const updateSession = useCallback((patch: Partial<SessionState>) => {
    const next = { ...sessionRef.current, ...patch };
    sessionRef.current = next;
    setSession(next);
  }, []);

  const { start, stop } = useAsrSession(
    gatewayConfig.asrStreamUrl,
    sessionRef,
    updateSession,
  );

  const handleToggle = useCallback(() => {
    if (session.isActive) {
      stop();
    } else {
      start();
    }
  }, [session.isActive, start, stop]);

  // Cleanup ASR when navigating away
  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  const handleExport = useCallback(() => {
    const text = session.transcript
      .map((seg) => {
        const emo = seg.emotion && seg.emotion !== "NEUTRAL" ? ` [${seg.emotion}]` : "";
        return `${seg.speaker.toUpperCase()}${emo}: ${seg.text}`;
      })
      .join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session.transcript]);

  return (
    <div className="studio-page">
      <div className="studio-page-header">
        <h1 className="studio-page-title">Transcribe</h1>
        <p className="studio-page-subtitle">Real-time speech-to-text with emotion detection</p>
      </div>

      <div className="transcribe-modes">
        <button
          type="button"
          className={`transcribe-mode-btn ${mode === "live" ? "transcribe-mode-btn--active" : ""}`}
          onClick={() => setMode("live")}
        >
          <Icon name="mic" size={16} /> Live Microphone
        </button>
        <button
          type="button"
          className={`transcribe-mode-btn ${mode === "upload" ? "transcribe-mode-btn--active" : ""}`}
          onClick={() => setMode("upload")}
        >
          <Icon name="upload" size={16} /> Upload Audio
        </button>
      </div>

      {mode === "live" && (
        <>
          <div className="transcribe-controls">
            <button
              type="button"
              className={`transcribe-mic-btn ${session.isActive ? "transcribe-mic-btn--recording" : ""}`}
              onClick={handleToggle}
            >
              <Icon name={session.isActive ? "square" : "mic"} size={20} />
            </button>
            <div>
              <div className="transcribe-status">
                {session.isActive ? "Recording..." : "Click to start"}
              </div>
              {session.isConnected && (
                <div className="transcribe-connected">
                  Connected · {session.currentEmotion}
                </div>
              )}
              {session.error && (
                <div className="transcribe-error">{session.error}</div>
              )}
            </div>
            {session.transcript.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost btn--small transcribe-export"
                onClick={handleExport}
              >
                <Icon name="download" size={14} /> Export
              </button>
            )}
          </div>

          <div className="transcribe-output">
            {session.transcript.length === 0 && !session.isActive && (
              <div className="transcribe-empty">
                Start recording to see real-time transcription with emotion tags.
              </div>
            )}
            {session.transcript.map((seg) => (
              <TranscribeSegment key={seg.id} segment={seg} />
            ))}
          </div>
        </>
      )}

      {mode === "upload" && (
        <div className="transcribe-upload-placeholder">
          <div className="transcribe-upload-icon"><Icon name="upload" size={48} /></div>
          <h3>Upload Audio</h3>
          <p>File-based transcription coming soon. Use Live Microphone for now.</p>
        </div>
      )}
    </div>
  );
}

function TranscribeSegment({ segment }: { segment: TranscriptSegment }) {
  return (
    <div className="transcribe-segment">
      {segment.emotion && segment.emotion !== "NEUTRAL" && (
        <span className="transcribe-segment-emotion">{segment.emotion}</span>
      )}
      <span className="transcribe-segment-text">{segment.text}</span>
    </div>
  );
}
