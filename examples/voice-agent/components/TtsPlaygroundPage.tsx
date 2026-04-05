import React, { useState, useRef, useCallback, useEffect } from "react";
import { CartesiaTtsClient } from "../lib/cartesia-tts";
import type { CartesiaTtsConfig } from "../lib/cartesia-tts";
import { VOICE_CATALOG, type VoiceEntry } from "../lib/voice-catalog";
import VoicePicker from "./VoicePicker";
import Icon from "./Icon";

const CARTESIA_API_KEY = import.meta.env.VITE_CARTESIA_API_KEY as string;

const EMOTION_OPTIONS = [
  "neutral", "happy", "excited", "calm", "content", "curious",
  "sad", "angry", "frustrated", "anxious", "surprised", "confident",
];

const SPEED_OPTIONS = [
  { label: "Slowest", value: "slowest" },
  { label: "Slow", value: "slow" },
  { label: "Normal", value: "normal" },
  { label: "Fast", value: "fast" },
  { label: "Fastest", value: "fastest" },
];

export default function TtsPlaygroundPage() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<VoiceEntry>(VOICE_CATALOG[0]);
  const [emotion, setEmotion] = useState("neutral");
  const [speed, setSpeed] = useState("normal");
  const [generating, setGenerating] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  const ttsRef = useRef<CartesiaTtsClient | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!text.trim() || generating) return;
    if (!CARTESIA_API_KEY) {
      console.error("[TTS Playground] Missing VITE_CARTESIA_API_KEY");
      return;
    }
    setGenerating(true);

    try {
      if (ttsRef.current) {
        ttsRef.current.clear();
        ttsRef.current.close();
      }

      const config: CartesiaTtsConfig = {
        apiKey: CARTESIA_API_KEY,
        voiceId: selectedVoice.id,
        sampleRate: 22050,
      };

      const client = new CartesiaTtsClient(config);
      ttsRef.current = client;

      client.onSpeakingChange = (speaking) => {
        if (!speaking) setGenerating(false);
      };
      client.onError = (err) => {
        console.error("[TTS Playground]", err);
        setGenerating(false);
      };

      await client.connect();

      await client.speak(text.trim(), {
        emotion: emotion !== "neutral" ? [emotion] : undefined,
        speed,
      });
    } catch (err) {
      console.error("[TTS Playground] error:", err);
      setGenerating(false);
    }
  }, [text, selectedVoice, emotion, speed, generating]);

  const handleStop = useCallback(() => {
    ttsRef.current?.clear();
    setGenerating(false);
  }, []);

  // Cleanup TTS WebSocket when navigating away
  useEffect(() => {
    return () => {
      if (ttsRef.current) {
        ttsRef.current.clear();
        ttsRef.current.close();
        ttsRef.current = null;
      }
    };
  }, []);

  return (
    <div className="studio-page">
      <div className="studio-page-header">
        <h1 className="studio-page-title">Text to Speech</h1>
        <p className="studio-page-subtitle">Generate expressive speech with emotion control</p>
      </div>

      <div className="tts-playground-layout">
        <div className="tts-input-panel">
          <textarea
            className="tts-textarea"
            placeholder="Type or paste text to convert to speech..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="tts-controls-row">
            <div className="tts-control-group">
              <span className="tts-control-label">Emotion</span>
              <select
                className="tts-select"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
              >
                {EMOTION_OPTIONS.map((e) => (
                  <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="tts-control-group">
              <span className="tts-control-label">Speed</span>
              <select
                className="tts-select"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="tts-actions">
              {generating ? (
                <button type="button" className="btn btn--danger" onClick={handleStop}>
                  <Icon name="square" size={14} /> Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleGenerate}
                  disabled={!text.trim()}
                >
                  <Icon name="volume2" size={16} /> Generate
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="tts-output-panel">
          <div className="tts-voice-selector">
            <div className="tts-control-group">
              <span className="tts-control-label">Voice</span>
              <button
                type="button"
                className="btn btn--secondary tts-voice-btn"
                onClick={() => setShowVoicePicker(!showVoicePicker)}
              >
                {selectedVoice.name} ({selectedVoice.accent})
                <span className="tts-voice-caret">&#9662;</span>
              </button>
            </div>
          </div>

          {showVoicePicker && (
            <div className="tts-voice-picker-dropdown">
              <VoicePicker
                selectedId={selectedVoice.id}
                onSelect={(v) => { setSelectedVoice(v); setShowVoicePicker(false); }}
              />
            </div>
          )}

          {!showVoicePicker && (
            <div className="tts-output-placeholder">
              {generating ? (
                <div>
                  <div className="tts-output-icon"><Icon name="volume2" size={32} /></div>
                  <p className="tts-output-title">Generating audio...</p>
                  <p className="tts-output-meta">Emotion: {emotion} · Speed: {speed}</p>
                </div>
              ) : (
                <div>
                  <div className="tts-output-icon"><Icon name="music" size={32} /></div>
                  <p>Enter text and click Generate to hear TTS output.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
