import React, { useState, useRef, useCallback, useEffect } from "react";
import type { SessionState, TranscriptSegment } from "../App";
import { useAsrSession } from "../hooks/useAsrSession";
import { gatewayConfig } from "../lib/gateway-config";
import { getDeviceId } from "../lib/device-id";
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
        <UploadTranscribe />
      )}
    </div>
  );
}

const ACCEPTED_AUDIO = ".wav,.mp3,.m4a,.webm,.ogg,.flac,.aac";

function UploadTranscribe() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File) => {
    setFile(f);
    setTranscript("");
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("audio/")) pickFile(f);
    else setError("Please drop an audio file (WAV, MP3, M4A, WebM, OGG, FLAC, AAC).");
  }, [pickFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
  }, [pickFile]);

  const handleTranscribe = useCallback(async () => {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    setTranscript("");

    try {
      const form = new FormData();
      form.append("audio", file, file.name);

      const deviceId = getDeviceId();
      const sessionToken = gatewayConfig.getSessionToken();
      const headers: Record<string, string> = { "X-Device-Id": deviceId };
      if (sessionToken) headers["X-Session-Token"] = sessionToken;

      const res = await fetch(`${gatewayConfig.httpBase}/agent/transcribe/simple`, {
        method: "POST",
        headers,
        body: form,
      });

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.transcript) {
        setTranscript(data.transcript);
      } else {
        setError(data.error || "Transcription returned empty.");
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Transcription failed.");
    } finally {
      setUploading(false);
    }
  }, [file, uploading]);

  const handleExport = useCallback(() => {
    if (!transcript) return;
    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript_${file?.name || "upload"}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [transcript, file]);

  const handleCopy = useCallback(() => {
    if (transcript) navigator.clipboard.writeText(transcript);
  }, [transcript]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {/* Drop zone / file picker */}
      <div
        className={`transcribe-upload-placeholder ${dragOver ? "transcribe-upload--dragover" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" && !file) inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_AUDIO}
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
        {!file ? (
          <>
            <div className="transcribe-upload-icon">
              <Icon name="upload" size={48} />
            </div>
            <h3>Upload Audio</h3>
            <p>Drag & drop an audio file here, or click to browse.<br />WAV, MP3, M4A, WebM, OGG, FLAC, AAC supported.</p>
          </>
        ) : (
          <div className="transcribe-upload-file-info">
            <Icon name="music" size={24} />
            <div>
              <div className="transcribe-upload-filename">{file.name}</div>
              <div className="transcribe-upload-filesize">{formatSize(file.size)}</div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={(e) => { e.stopPropagation(); setFile(null); setTranscript(""); setError(null); }}
            >
              <Icon name="x" size={14} /> Remove
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      {file && !transcript && (
        <div className="transcribe-upload-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleTranscribe}
            disabled={uploading}
          >
            {uploading ? "Transcribing..." : <><Icon name="mic" size={16} /> Transcribe</>}
          </button>
          {uploading && (
            <span className="transcribe-upload-progress">Processing audio — this may take a moment...</span>
          )}
        </div>
      )}

      {error && <div className="transcribe-error" style={{ marginTop: 12 }}>{error}</div>}

      {/* Result */}
      {transcript && (
        <div className="transcribe-upload-result">
          <div className="transcribe-upload-result-header">
            <h3>Transcript</h3>
            <div className="transcribe-upload-result-actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={handleCopy}>
                <Icon name="copy" size={14} /> Copy
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={handleExport}>
                <Icon name="download" size={14} /> Export
              </button>
            </div>
          </div>
          <div className="transcribe-upload-result-text">{transcript}</div>
        </div>
      )}
    </>
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
