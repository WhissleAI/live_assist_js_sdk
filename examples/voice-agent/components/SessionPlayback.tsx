import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { StoredSession } from "../lib/session-store";
import { getAudio } from "../lib/audio-store";

interface Props {
  session: StoredSession;
  onClose: () => void;
}

const EMOTION_COLORS: Record<string, string> = {
  HAPPY: "#facc15", SAD: "#3b82f6", ANGRY: "#ef4444", FEAR: "#8b5cf6",
  SURPRISE: "#f97316", DISGUST: "#22c55e", NEUTRAL: "#94a3b8",
  happy: "#facc15", sad: "#3b82f6", angry: "#ef4444", scared: "#8b5cf6",
  surprised: "#f97316", content: "#22c55e", excited: "#f59e0b",
  calm: "#6ee7b7", curious: "#38bdf8", frustrated: "#ef4444",
  sympathetic: "#a78bfa", anxious: "#8b5cf6", neutral: "#94a3b8",
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionPlayback({ session, onClose }: Props) {
  const [micUrl, setMicUrl] = useState<string | null>(null);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTrack, setActiveTrack] = useState<"both" | "mic" | "tts">("both");
  const [activeSegIdx, setActiveSegIdx] = useState(-1);

  const micAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  const sessionStart = useMemo(() => {
    if (session.transcript.length > 0) return session.transcript[0].timestamp;
    return new Date(session.date).getTime();
  }, [session]);

  const segments = useMemo(() => {
    return session.transcript.map((seg, idx) => ({
      ...seg,
      offsetSec: Math.max(0, (seg.timestamp - sessionStart) / 1000),
      idx,
    }));
  }, [session.transcript, sessionStart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getAudio(session.id).then((record) => {
      if (cancelled) return;
      if (record?.micBlob) setMicUrl(URL.createObjectURL(record.micBlob));
      if (record?.ttsBlob) setTtsUrl(URL.createObjectURL(record.ttsBlob));
      setLoading(false);
    });

    return () => {
      cancelled = true;
      if (micUrl) URL.revokeObjectURL(micUrl);
      if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    };
  }, [session.id]);

  const tick = useCallback(() => {
    const primary = micAudioRef.current || ttsAudioRef.current;
    if (!primary) return;
    setCurrentTime(primary.currentTime);
    if (!primary.paused) {
      frameRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const primary = micAudioRef.current || ttsAudioRef.current;
    if (primary && primary.duration && isFinite(primary.duration)) {
      setDuration(primary.duration);
    }
  }, []);

  const togglePlay = useCallback(() => {
    const mic = micAudioRef.current;
    const tts = ttsAudioRef.current;
    if (playing) {
      mic?.pause();
      tts?.pause();
      cancelAnimationFrame(frameRef.current);
      setPlaying(false);
    } else {
      if (activeTrack !== "tts") mic?.play();
      if (activeTrack !== "mic") tts?.play();
      frameRef.current = requestAnimationFrame(tick);
      setPlaying(true);
    }
  }, [playing, activeTrack, tick]);

  const seekTo = useCallback((pct: number) => {
    const time = pct * duration;
    if (micAudioRef.current) micAudioRef.current.currentTime = time;
    if (ttsAudioRef.current) ttsAudioRef.current.currentTime = time;
    setCurrentTime(time);
  }, [duration]);

  const handleEnded = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    setPlaying(false);
    setCurrentTime(0);
  }, []);

  useEffect(() => {
    const newIdx = segments.findIndex((seg, i) => {
      const next = segments[i + 1];
      return currentTime >= seg.offsetSec && (!next || currentTime < next.offsetSec);
    });
    if (newIdx !== activeSegIdx && newIdx >= 0) {
      setActiveSegIdx(newIdx);
      const el = document.getElementById(`playback-seg-${newIdx}`);
      if (el && transcriptScrollRef.current) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [currentTime, segments, activeSegIdx]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const emotionTimeline = useMemo(() => {
    if (segments.length === 0 || duration === 0) return [];
    return segments
      .filter((s) => s.emotion && s.emotion !== "NEUTRAL" && s.emotion !== "neutral")
      .map((s) => ({
        pct: (s.offsetSec / duration) * 100,
        emotion: s.emotion!,
        color: EMOTION_COLORS[s.emotion!] || "#94a3b8",
        speaker: s.speaker,
      }));
  }, [segments, duration]);

  const hasAudio = micUrl || ttsUrl;

  return (
    <div className="session-playback">
      <div className="playback-header">
        <div className="playback-title">
          <span className="playback-icon">🎧</span>
          <div>
            <h3>{session.agentName || "Session"} Recording</h3>
            <span className="playback-date">
              {new Date(session.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              {" · "}
              {formatTime(session.durationSec)}
            </span>
          </div>
        </div>
        <button type="button" className="playback-close" onClick={onClose}>✕</button>
      </div>

      {loading && (
        <div className="playback-loading">Loading audio...</div>
      )}

      {!loading && !hasAudio && (
        <div className="playback-no-audio">
          <p>No audio recording available for this session.</p>
          <p className="playback-hint">Audio recording is available for sessions started after this update.</p>
        </div>
      )}

      {!loading && hasAudio && (
        <>
          {micUrl && (
            <audio
              ref={micAudioRef}
              src={micUrl}
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              muted={activeTrack === "tts"}
            />
          )}
          {ttsUrl && (
            <audio
              ref={ttsAudioRef}
              src={ttsUrl}
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              muted={activeTrack === "mic"}
            />
          )}

          <div className="playback-controls">
            <button type="button" className="playback-play-btn" onClick={togglePlay}>
              {playing ? "⏸" : "▶"}
            </button>
            <span className="playback-time">{formatTime(currentTime)}</span>

            <div className="playback-timeline" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
            }}>
              <div className="playback-progress" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
              {emotionTimeline.map((em, i) => (
                <div
                  key={i}
                  className="playback-emotion-dot"
                  style={{ left: `${em.pct}%`, background: em.color }}
                  title={`${em.emotion} (${em.speaker})`}
                />
              ))}
            </div>

            <span className="playback-time">{formatTime(duration)}</span>
          </div>

          <div className="playback-track-select">
            {micUrl && ttsUrl && (
              <>
                <button
                  type="button"
                  className={`playback-track-btn ${activeTrack === "both" ? "playback-track-btn--active" : ""}`}
                  onClick={() => setActiveTrack("both")}
                >Both</button>
                <button
                  type="button"
                  className={`playback-track-btn ${activeTrack === "mic" ? "playback-track-btn--active" : ""}`}
                  onClick={() => setActiveTrack("mic")}
                >User Only</button>
                <button
                  type="button"
                  className={`playback-track-btn ${activeTrack === "tts" ? "playback-track-btn--active" : ""}`}
                  onClick={() => setActiveTrack("tts")}
                >Agent Only</button>
              </>
            )}
          </div>

          <div className="playback-emotion-bar">
            {emotionTimeline.map((em, i) => (
              <span key={i} className="playback-emotion-tag" style={{ color: em.color, borderColor: em.color }}>
                {em.speaker === "agent" ? "🤖" : "🗣"} {em.emotion}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="playback-transcript" ref={transcriptScrollRef}>
        <h4 className="playback-transcript-title">Transcript</h4>
        {segments.map((seg) => (
          <div
            key={seg.id}
            id={`playback-seg-${seg.idx}`}
            className={`playback-seg ${seg.idx === activeSegIdx ? "playback-seg--active" : ""} playback-seg--${seg.speaker}`}
            onClick={() => {
              if (duration > 0 && seg.offsetSec <= duration) {
                seekTo(seg.offsetSec / duration);
              }
            }}
          >
            <div className="playback-seg-header">
              <span className={`playback-seg-speaker playback-seg-speaker--${seg.speaker}`}>
                {seg.speaker === "user" ? "🗣 User" : seg.speaker === "agent" ? "🤖 Agent" : "Other"}
              </span>
              <span className="playback-seg-time">{formatTime(seg.offsetSec)}</span>
              {seg.emotion && seg.emotion !== "NEUTRAL" && seg.emotion !== "neutral" && (
                <span className="playback-seg-emotion" style={{ color: EMOTION_COLORS[seg.emotion] || "#94a3b8" }}>
                  {seg.emotion}
                </span>
              )}
            </div>
            <div className="playback-seg-text">{seg.text}</div>
          </div>
        ))}
        {segments.length === 0 && (
          <p className="playback-empty-transcript">No transcript available.</p>
        )}
      </div>
    </div>
  );
}
