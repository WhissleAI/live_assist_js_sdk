import React, { useState, useRef, useCallback, useEffect } from "react";
import { useMetadataSession } from "./hooks/useMetadataSession";
import { useOpenCodeBridge } from "./hooks/useOpenCodeBridge";
import { getDeviceId } from "./lib/device-id";

const DEFAULT_ASR_URL = "wss://api.whissle.ai/asr/stream";
const OPENCODE_PORT = 4096;

export default function App() {
  const [token, setToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token") ?? "";
  });
  const [asrUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("asr_url") ?? DEFAULT_ASR_URL;
  });
  const [deviceId] = useState(() => getDeviceId());

  const opencodeUrl = `http://localhost:${OPENCODE_PORT}`;

  const [overlayVisible, setOverlayVisible] = useState(true);
  const [overlayMinimized, setOverlayMinimized] = useState(false);
  const [tokenEntered, setTokenEntered] = useState(() => !!token);
  const [isHolding, setIsHolding] = useState(false);

  const { state, start, stop } = useMetadataSession(asrUrl, token);
  const bridge = useOpenCodeBridge();

  // Refs for stable access in callbacks
  const transcriptRef = useRef(state.transcript);
  transcriptRef.current = state.transcript;
  const sendRef = useRef(bridge.sendPromptAsync);
  sendRef.current = bridge.sendPromptAsync;

  // Hold-to-talk: mousedown starts, mouseup stops + sends
  const handleTalkStart = useCallback(() => {
    setIsHolding(true);
    start();
  }, [start]);

  const handleTalkEnd = useCallback(() => {
    setIsHolding(false);
    stop();
    // Wait for final transcript segment, then send to OpenCode
    setTimeout(() => {
      const transcript = transcriptRef.current;
      const lastEntry = transcript[transcript.length - 1];
      if (lastEntry?.text) {
        sendRef.current(lastEntry.text);
      }
    }, 600);
  }, [stop]);

  // Also support Option key when parent window has focus (e.g. before clicking iframe)
  useEffect(() => {
    if (!tokenEntered) return;

    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt" && !e.repeat && !isHolding) {
        handleTalkStart();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt" && isHolding) {
        handleTalkEnd();
      }
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [tokenEntered, isHolding, handleTalkStart, handleTalkEnd]);

  const handleTokenSubmit = useCallback(() => {
    if (token.trim()) setTokenEntered(true);
  }, [token]);

  // Token setup screen
  if (!tokenEntered) {
    return (
      <div className="setup-screen">
        <div className="setup-card">
          <h1 className="setup-title">Meta-Aware Coding</h1>
          <p className="setup-subtitle">OpenCode + Whissle Voice Metadata</p>
          <div className="setup-form">
            <input
              type="text"
              placeholder="Enter Whissle token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
              className="setup-input"
              autoFocus
            />
            <button
              type="button"
              onClick={handleTokenSubmit}
              disabled={!token.trim()}
              className="setup-button"
            >
              Start Coding
            </button>
          </div>
          <p className="setup-hint">
            Hold the mic button or press <kbd>Option</kbd> to speak.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mac-container">
      {/* Full-screen OpenCode iframe */}
      <iframe
        src={opencodeUrl}
        className="opencode-fullscreen"
        title="OpenCode"
        allow="clipboard-read; clipboard-write"
      />

      {/* Recording pill — top center when active */}
      {state.isActive && (
        <div className="voice-recording-pill">
          <span className="recording-dot" />
          <span>{state.isConnected ? "Listening..." : "Connecting..."}</span>
          {state.currentEmotion && (
            <span className="pill-emotion">{state.currentEmotion}</span>
          )}
        </div>
      )}

      {/* ── Hold-to-Talk button — always visible, bottom-left ── */}
      <button
        type="button"
        className={`talk-button ${isHolding ? "active" : ""}`}
        onMouseDown={handleTalkStart}
        onMouseUp={handleTalkEnd}
        onMouseLeave={() => { if (isHolding) handleTalkEnd(); }}
        onTouchStart={handleTalkStart}
        onTouchEnd={handleTalkEnd}
        title="Hold to speak — voice goes to OpenCode"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        {isHolding && <span className="talk-label">Release to send</span>}
      </button>

      {/* ── Floating voice overlay — bottom right ── */}
      {overlayVisible && (
        <div className={`voice-overlay ${overlayMinimized ? "minimized" : ""}`}>
          <div className="overlay-header">
            <span className="overlay-title">Voice Metadata</span>
            <div className="overlay-controls">
              <button
                type="button"
                className="overlay-btn"
                onClick={() => setOverlayMinimized(!overlayMinimized)}
              >
                {overlayMinimized ? "+" : "-"}
              </button>
              <button
                type="button"
                className="overlay-btn"
                onClick={() => setOverlayVisible(false)}
              >
                x
              </button>
            </div>
          </div>

          {!overlayMinimized && (
            <div className="overlay-body">
              {/* Badges */}
              <div className="overlay-row">
                {state.currentEmotion && (
                  <span className={`meta-badge emotion-${state.currentEmotion.toLowerCase()}`}>
                    {state.currentEmotion}
                  </span>
                )}
                {state.currentIntent && (
                  <span className="meta-badge intent-badge">
                    {state.currentIntent}
                  </span>
                )}
                {state.speechRate && (
                  <span className="meta-badge rate-badge">
                    {state.speechRate.words_per_minute} WPM
                  </span>
                )}
              </div>

              {/* Emotion probs */}
              {state.currentEmotionProbs && Object.keys(state.currentEmotionProbs).length > 0 && (
                <div className="overlay-section">
                  <div className="overlay-label">Emotion</div>
                  {Object.entries(state.currentEmotionProbs)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([emotion, prob]) => (
                      <div key={emotion} className="prob-row">
                        <span className="prob-name">{emotion}</span>
                        <div className="prob-bar-bg">
                          <div
                            className="prob-bar-fill"
                            style={{ width: `${Math.round(prob * 100)}%` }}
                          />
                        </div>
                        <span className="prob-pct">{Math.round(prob * 100)}%</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Transcript */}
              {state.transcript.length > 0 && (
                <div className="overlay-section">
                  <div className="overlay-label">Last utterance</div>
                  <div className="overlay-transcript">
                    {state.transcript[state.transcript.length - 1]?.text}
                  </div>
                </div>
              )}

              {/* Sent to OpenCode */}
              {bridge.lastSentText && (
                <div className="overlay-section">
                  <div className="overlay-label">Sent to OpenCode</div>
                  <div className="overlay-sent">{bridge.lastSentText}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reopen overlay */}
      {!overlayVisible && (
        <button
          type="button"
          className="overlay-reopen"
          onClick={() => setOverlayVisible(true)}
        >
          Voice
        </button>
      )}

      {/* Error toast */}
      {(state.error || bridge.error) && (
        <div className="error-toast">
          {state.error || bridge.error}
        </div>
      )}
    </div>
  );
}
