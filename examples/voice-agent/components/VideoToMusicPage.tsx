import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { gatewayConfig } from "../lib/gateway-config";
import Icon from "./Icon";

interface PipelineStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
}

const INITIAL_STEPS: PipelineStep[] = [
  { id: "extract", label: "Extract audio track", status: "pending" },
  { id: "audio", label: "Analyze audio emotions", status: "pending" },
  { id: "video", label: "Analyze video with AI", status: "pending" },
  { id: "generate", label: "Generate music", status: "pending" },
];

const GENRES = ["auto", "electronic", "orchestral", "ambient", "jazz", "rock", "pop", "cinematic", "lo-fi"];
const MOODS = ["auto", "happy", "sad", "calm", "energetic", "dramatic", "mysterious", "nostalgic", "uplifting"];

const EMOTION_COLORS: Record<string, string> = {
  HAP: "#22c55e", HAPPY: "#22c55e",
  SAD: "#3b82f6", SADNESS: "#3b82f6",
  ANG: "#ef4444", ANGRY: "#ef4444", ANGER: "#ef4444",
  NEU: "#94a3b8", NEUTRAL: "#94a3b8",
  FEA: "#a855f7", FEAR: "#a855f7",
  DIS: "#f97316", DISGUST: "#f97316",
  SUR: "#eab308", SURPRISE: "#eab308",
  CON: "#06b6d4", CONTENT: "#06b6d4",
  CAL: "#14b8a6", CALM: "#14b8a6",
  EMOTION_HAPPY: "#22c55e", EMOTION_SAD: "#3b82f6",
  EMOTION_ANGRY: "#ef4444", EMOTION_NEUTRAL: "#94a3b8",
  EMOTION_FEAR: "#a855f7", EMOTION_DISGUST: "#f97316",
  EMOTION_SURPRISE: "#eab308",
};

function getEmotionColor(emotion: string): string {
  return EMOTION_COLORS[(emotion || "").toUpperCase()] || "#94a3b8";
}

interface AudioSegment {
  start_sec: number;
  end_sec: number;
  transcript: string;
  emotion: string;
  intent: string;
  gender: string;
  age_range: string;
  emotion_probs: Record<string, number>;
  intent_probs: Record<string, number>;
  gender_probs: Record<string, number>;
  age_probs: Record<string, number>;
}

interface AudioAnalysis {
  segments: AudioSegment[];
  duration_sec: number;
  segment_count: number;
  full_transcript: string;
  dominant_emotion: string;
  emotion_distribution: Record<string, number>;
  intent_distribution: Record<string, number>;
  gender_distribution: Record<string, number>;
  age_distribution: Record<string, number>;
  emotional_arc: string[];
  error?: string;
}

export default function VideoToMusicPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [genre, setGenre] = useState("auto");
  const [mood, setMood] = useState("auto");

  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [videoAnalysis, setVideoAnalysis] = useState<Record<string, unknown> | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysis | null>(null);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicDuration, setMusicDuration] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [musicBase64, setMusicBase64] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const [musicVol, setMusicVol] = useState(0.7);
  const [origVol, setOrigVol] = useState(0.3);
  const [muxLoading, setMuxLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const musicBlobRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (musicBlobRef.current) URL.revokeObjectURL(musicBlobRef.current);
    };
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Please upload a video file (mp4, mov, webm, etc.)");
      return;
    }
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
    if (file.size > MAX_FILE_SIZE) {
      setError(`File is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 500MB.`);
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setError(null);
    resetResults();
  }, [videoUrl]);

  const resetResults = () => {
    setSteps(INITIAL_STEPS);
    setVideoAnalysis(null);
    setAudioAnalysis(null);
    if (musicBlobRef.current) {
      URL.revokeObjectURL(musicBlobRef.current);
      musicBlobRef.current = "";
    }
    setMusicUrl("");
    setMusicBase64("");
    setMusicDuration(0);
    setVideoDuration(0);
    setError(null);
    setExpandedCard(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleGenerate = useCallback(async () => {
    if (!videoFile || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    resetResults();

    try {
      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("genre", genre);
      formData.append("mood", mood);

      const url = `${gatewayConfig.httpBase}/agent/video-to-music/stream`;
      const res = await fetch(url, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Server error (${res.status}). ${text || "Please try again."}`);
      }

      if (!res.body) throw new Error("Streaming not supported");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const event = parsed.event as string;

            if (event === "step") {
              setSteps((prev) =>
                prev.map((s) =>
                  s.id === parsed.id ? { ...s, label: parsed.label, status: parsed.status } : s
                )
              );
            }

            if (event === "video_analysis") {
              const { event: _e, ...rest } = parsed;
              setVideoAnalysis(rest);
              setExpandedCard("video");
            }

            if (event === "audio_analysis") {
              const { event: _e, ...rest } = parsed;
              setAudioAnalysis(rest as AudioAnalysis);
              setExpandedCard("audio");
            }

            if (event === "music_ready" && parsed.audio_base64) {
              const mime = parsed.mime_type || "audio/wav";
              const binary = atob(parsed.audio_base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const blob = new Blob([bytes], { type: mime });
              if (musicBlobRef.current) URL.revokeObjectURL(musicBlobRef.current);
              const blobUrl = URL.createObjectURL(blob);
              musicBlobRef.current = blobUrl;
              setMusicUrl(blobUrl);
              setMusicBase64(parsed.audio_base64);
              if (parsed.duration_sec) setMusicDuration(parsed.duration_sec);
            }

            if (event === "done") {
              if (parsed.video_duration_sec) setVideoDuration(parsed.video_duration_sec);
            }

            if (event === "error") {
              setError(parsed.message || "Something went wrong");
              setSteps((prev) => {
                const active = prev.find((s) => s.status === "active");
                if (!active) return prev;
                return prev.map((s) =>
                  s.id === active.id ? { ...s, status: "error" as const } : s
                );
              });
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Generation failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [videoFile, genre, mood, loading]);

  const handleDownloadMusic = useCallback(() => {
    if (!musicUrl) return;
    const a = document.createElement("a");
    a.href = musicUrl;
    a.download = `music_${Date.now()}.wav`;
    a.click();
  }, [musicUrl]);

  const handleDownloadVideoWithMusic = useCallback(async () => {
    if (!videoFile || !musicBase64 || muxLoading) return;

    setMuxLoading(true);
    try {
      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("music_base64", musicBase64);
      formData.append("music_volume", String(musicVol));
      formData.append("original_volume", String(origVol));

      const res = await fetch(`${gatewayConfig.httpBase}/agent/video-to-music/mux`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Mux failed (${res.status})`);

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const ext = videoFile.name.split(".").pop() || "mp4";
      a.download = `video_with_music_${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to mux video");
    } finally {
      setMuxLoading(false);
    }
  }, [videoFile, musicBase64, musicVol, origVol, muxLoading]);

  const handleMixChange = useCallback((musicPct: number) => {
    const mv = Math.round(musicPct) / 100;
    setMusicVol(mv);
    setOrigVol(Math.round((1 - mv) * 100) / 100);
  }, []);

  const activeStep = steps.find((s) => s.status === "active");
  const hasResults = videoAnalysis || audioAnalysis || musicUrl;
  const pipelineHasError = steps.some((s) => s.status === "error");

  return (
    <div className="studio-page studio-page--fill">
      <div className="studio-page-header">
        <h1 className="studio-page-title">Video to Music</h1>
        <p className="studio-page-subtitle">
          Generate AI background music from video — powered by emotion &amp; scene analysis
        </p>
      </div>

      <div className="v2m-layout">
        {/* Left column */}
        <div className="v2m-left">
          {!videoFile ? (
            <div
              className={`v2m-upload-zone${dragOver ? " v2m-upload-zone--active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <div className="v2m-upload-icon"><Icon name="film" size={48} /></div>
              <p className="v2m-upload-title">Drop a video here or click to browse</p>
              <p className="v2m-upload-hint">Supports MP4, MOV, WebM, AVI</p>
            </div>
          ) : (
            <div className="v2m-preview">
              <video src={videoUrl} controls className="v2m-video" />
              <div className="v2m-preview-meta">
                <span className="v2m-filename">{videoFile.name}</span>
                <span className="v2m-filesize">
                  {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    if (videoUrl) URL.revokeObjectURL(videoUrl);
                    setVideoFile(null);
                    setVideoUrl("");
                    resetResults();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {videoFile && (
            <div className="v2m-options">
              <div className="v2m-option-group">
                <label className="v2m-option-label">Genre</label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="v2m-select"
                  disabled={loading}
                >
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g === "auto" ? "Auto-detect" : g.charAt(0).toUpperCase() + g.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="v2m-option-group">
                <label className="v2m-option-label">Mood</label>
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="v2m-select"
                  disabled={loading}
                >
                  {MOODS.map((m) => (
                    <option key={m} value={m}>
                      {m === "auto" ? "Auto-detect" : m.charAt(0).toUpperCase() + m.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? "Generating..." : musicUrl ? "Regenerate" : "Generate Music"}
              </button>
              {loading && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => { abortRef.current?.abort(); setLoading(false); }}
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {/* Music player */}
          {musicUrl && (
            <div className="v2m-player">
              <div className="v2m-player-header">
                <span className="v2m-player-title">Generated Music</span>
                <span className="v2m-player-duration">
                  {musicDuration > 0 ? `${musicDuration.toFixed(1)}s` : ""}
                  {videoDuration > 0 && musicDuration > 0 && Math.abs(musicDuration - videoDuration) < 1
                    ? " (matched to video)"
                    : ""}
                </span>
              </div>
              <audio src={musicUrl} controls className="v2m-audio" />

              {/* Mix ratio slider */}
              <div className="v2m-mix-section">
                <label className="v2m-mix-label">
                  Mix Ratio
                  <span className="v2m-mix-values">
                    Music {Math.round(musicVol * 100)}% · Original {Math.round(origVol * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(musicVol * 100)}
                  onChange={(e) => handleMixChange(Number(e.target.value))}
                  className="v2m-mix-slider"
                />
                <div className="v2m-mix-endpoints">
                  <span>Original only</span>
                  <span>Music only</span>
                </div>
              </div>

              <div className="v2m-player-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleDownloadMusic}
                >
                  Download Music
                </button>
                <button
                  type="button"
                  className="btn btn--accent btn--sm"
                  onClick={handleDownloadVideoWithMusic}
                  disabled={muxLoading}
                >
                  {muxLoading ? "Processing..." : "Download Video + Music"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="v2m-right">
          {(loading || hasResults) && (
            <div className="v2m-progress">
              <h3 className="v2m-section-title">Pipeline</h3>
              {steps.map((step) => (
                <div key={step.id} className={`v2m-step v2m-step--${step.status}`}>
                  <div className="v2m-step-indicator">
                    {step.status === "done" ? <Icon name="check" size={14} /> :
                     step.status === "active" ? <span className="v2m-step-spinner" /> :
                     step.status === "error" ? <Icon name="x" size={14} /> : <span className="v2m-step-dot" />}
                  </div>
                  <span className="v2m-step-label">{step.label}</span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="v2m-error">
              <p>{error}</p>
              {pipelineHasError && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm v2m-error-retry"
                  onClick={handleGenerate}
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {loading && activeStep && (
            <div className="v2m-loading-indicator">
              <div className="research-stream-dot" />
              {activeStep.label}
            </div>
          )}

          {audioAnalysis && (
            <div className="v2m-analysis-card">
              <button
                type="button"
                className="v2m-card-header"
                onClick={() => setExpandedCard(expandedCard === "audio" ? null : "audio")}
              >
                <span>Audio Emotion Analysis</span>
                <span className="v2m-card-toggle">{expandedCard === "audio" ? "−" : "+"}</span>
              </button>
              {expandedCard === "audio" && (
                <div className="v2m-card-body">
                  <AudioAnalysisView analysis={audioAnalysis} />
                </div>
              )}
            </div>
          )}

          {videoAnalysis && (
            <div className="v2m-analysis-card">
              <button
                type="button"
                className="v2m-card-header"
                onClick={() => setExpandedCard(expandedCard === "video" ? null : "video")}
              >
                <span>Video Analysis</span>
                <span className="v2m-card-toggle">{expandedCard === "video" ? "−" : "+"}</span>
              </button>
              {expandedCard === "video" && (
                <div className="v2m-card-body">
                  <AnalysisSummary data={videoAnalysis} />
                </div>
              )}
            </div>
          )}

          {!loading && !hasResults && (
            <div className="studio-empty-state">
              <div className="empty-icon"><Icon name="music" size={32} /></div>
              <h3>AI-powered music from video</h3>
              <p>
                Upload a video to analyze its visual scenes and audio emotions,
                then generate matching background music.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Audio Analysis View
// ---------------------------------------------------------------------------

function AudioAnalysisView({ analysis }: { analysis: AudioAnalysis }) {
  const {
    segments, duration_sec, segment_count, full_transcript,
    dominant_emotion, emotion_distribution, intent_distribution,
    gender_distribution, age_distribution, emotional_arc, error: analysisError,
  } = analysis;

  const [showAllSegments, setShowAllSegments] = useState(false);
  const visibleSegments = showAllSegments ? segments : segments.slice(0, 6);

  return (
    <div className="v2m-audio-detail">
      {analysisError && (
        <div className="v2m-audio-error">Analysis error: {analysisError}</div>
      )}

      <div className="v2m-audio-summary">
        <div className="v2m-audio-stat">
          <span className="v2m-stat-value">{duration_sec.toFixed(0)}s</span>
          <span className="v2m-stat-label">Duration</span>
        </div>
        <div className="v2m-audio-stat">
          <span className="v2m-stat-value">{segment_count}</span>
          <span className="v2m-stat-label">Segments</span>
        </div>
        <div className="v2m-audio-stat">
          <span className="v2m-stat-value" style={{ color: getEmotionColor(dominant_emotion) }}>
            {dominant_emotion}
          </span>
          <span className="v2m-stat-label">Dominant</span>
        </div>
      </div>

      {emotional_arc.length > 0 && (
        <div className="v2m-timeline-section">
          <h4 className="v2m-subsection-title">Emotion Timeline</h4>
          <div className="v2m-emotion-timeline">
            {emotional_arc.map((emo, i) => (
              <div
                key={i}
                className="v2m-timeline-segment"
                style={{ background: getEmotionColor(emo), flex: 1 }}
                title={`${i * 10}s–${(i + 1) * 10}s: ${emo}`}
              />
            ))}
          </div>
          <div className="v2m-timeline-labels">
            <span>0s</span>
            <span>{duration_sec.toFixed(0)}s</span>
          </div>
        </div>
      )}

      {Object.keys(emotion_distribution).length > 0 && (
        <DistributionBars
          title="Emotion Distribution"
          data={emotion_distribution}
          colorFn={getEmotionColor}
        />
      )}

      {Object.keys(intent_distribution || {}).length > 0 && (
        <DistributionBars title="Intent Distribution" data={intent_distribution} />
      )}

      {Object.keys(gender_distribution || {}).length > 0 && (
        <DistributionBars title="Speaker Gender" data={gender_distribution} />
      )}

      {Object.keys(age_distribution || {}).length > 0 && (
        <DistributionBars title="Speaker Age" data={age_distribution} />
      )}

      {segments.length > 0 && (
        <div className="v2m-segments-section">
          <h4 className="v2m-subsection-title">Segment Details</h4>
          <div className="v2m-segments-list">
            {visibleSegments.map((seg, i) => (
              <SegmentRow key={i} seg={seg} />
            ))}
          </div>
          {segments.length > 6 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm v2m-show-more"
              onClick={() => setShowAllSegments(!showAllSegments)}
            >
              {showAllSegments ? "Show less" : `Show all ${segments.length} segments`}
            </button>
          )}
        </div>
      )}

      {full_transcript && (
        <div className="v2m-transcript-section">
          <h4 className="v2m-subsection-title">Full Transcript</h4>
          <p className="v2m-transcript-text">{full_transcript}</p>
        </div>
      )}
    </div>
  );
}


function DistributionBars({
  title, data, colorFn,
}: {
  title: string;
  data: Record<string, number>;
  colorFn?: (key: string) => string;
}) {
  const sorted = useMemo(
    () => Object.entries(data).sort((a, b) => b[1] - a[1]),
    [data]
  );
  const max = sorted[0]?.[1] || 1;

  return (
    <div className="v2m-dist-section">
      <h4 className="v2m-subsection-title">{title}</h4>
      <div className="v2m-dist-bars">
        {sorted.map(([label, pct]) => (
          <div key={label} className="v2m-dist-row">
            <span className="v2m-dist-label">{label}</span>
            <div className="v2m-dist-bar-track">
              <div
                className="v2m-dist-bar-fill"
                style={{
                  width: `${(pct / max) * 100}%`,
                  background: colorFn ? colorFn(label) : "var(--accent)",
                }}
              />
            </div>
            <span className="v2m-dist-pct">{pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function SegmentRow({ seg }: { seg: AudioSegment }) {
  const [expanded, setExpanded] = useState(false);
  const topEmotions = useMemo(() => {
    return Object.entries(seg.emotion_probs || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [seg.emotion_probs]);

  return (
    <div className="v2m-seg-row">
      <button
        type="button"
        className="v2m-seg-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="v2m-seg-time">
          {seg.start_sec.toFixed(0)}s–{seg.end_sec.toFixed(0)}s
        </span>
        <span
          className="v2m-seg-emotion-badge"
          style={{ background: getEmotionColor(seg.emotion), color: "#fff" }}
        >
          {seg.emotion}
        </span>
        {seg.transcript && (
          <span className="v2m-seg-text-preview">
            {seg.transcript.length > 60 ? seg.transcript.slice(0, 60) + "…" : seg.transcript}
          </span>
        )}
        <span className="v2m-seg-toggle">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && (
        <div className="v2m-seg-detail">
          {seg.transcript && <p className="v2m-seg-transcript">{seg.transcript}</p>}
          {topEmotions.length > 0 && (
            <div className="v2m-seg-probs">
              <span className="v2m-seg-probs-label">Emotions:</span>
              {topEmotions.map(([emo, prob]) => (
                <span
                  key={emo}
                  className="v2m-seg-prob-chip"
                  style={{ borderColor: getEmotionColor(emo) }}
                >
                  {emo} {(prob * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          )}
          <div className="v2m-seg-meta">
            {seg.intent && <span>Intent: {seg.intent}</span>}
            {seg.gender && <span>Gender: {seg.gender}</span>}
            {seg.age_range && <span>Age: {seg.age_range}</span>}
          </div>
        </div>
      )}
    </div>
  );
}


function AnalysisSummary({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="v2m-analysis-items">
      {Object.entries(data).map(([key, value]) => {
        if (key === "event") return null;
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        let display: string;
        if (Array.isArray(value)) {
          display = value.map((v) =>
            typeof v === "object" ? JSON.stringify(v) : String(v)
          ).join(", ");
        } else if (typeof value === "object" && value !== null) {
          display = JSON.stringify(value, null, 2);
        } else {
          display = String(value ?? "—");
        }
        return (
          <div key={key} className="v2m-analysis-row">
            <span className="v2m-analysis-key">{label}</span>
            <span className="v2m-analysis-value">{display}</span>
          </div>
        );
      })}
    </div>
  );
}
