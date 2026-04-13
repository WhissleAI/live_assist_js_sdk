import React, { useState, useMemo, useCallback, useRef } from "react";
import { VOICE_CATALOG, type VoiceEntry } from "../lib/voice-catalog";
import Icon from "./Icon";

const PREVIEW_TEXT = "Hello! I'm ready to help you today.";

interface Props {
  selectedId: string;
  onSelect: (voice: VoiceEntry) => void;
}

export default function VoicePicker({ selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState<"all" | "male" | "female">("all");
  const [search, setSearch] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const filtered = useMemo(() => {
    let result = filter === "all" ? VOICE_CATALOG : VOICE_CATALOG.filter((v) => v.gender === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.accent.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [filter, search]);

  const handlePreview = useCallback(async (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // If already previewing this voice, stop it
    if (previewingId === voiceId) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        URL.revokeObjectURL(previewAudioRef.current.src);
        previewAudioRef.current = null;
      }
      setPreviewingId(null);
      return;
    }

    // Stop any current preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      URL.revokeObjectURL(previewAudioRef.current.src);
      previewAudioRef.current = null;
    }

    const apiKey = import.meta.env.VITE_CARTESIA_API_KEY;
    if (!apiKey) {
      console.warn("[VoicePicker] No VITE_CARTESIA_API_KEY set, cannot preview voice");
      return;
    }

    setPreviewingId(voiceId);

    try {
      const resp = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Cartesia-Version": "2025-04-16",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "sonic-3",
          transcript: PREVIEW_TEXT,
          voice: { mode: "id", id: voiceId },
          output_format: { container: "mp3", bit_rate: 128000 },
          language: "en",
        }),
      });

      if (!resp.ok) {
        console.warn("[VoicePicker] Preview fetch failed:", resp.status);
        setPreviewingId(null);
        return;
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;

      audio.onended = () => {
        setPreviewingId(null);
        URL.revokeObjectURL(url);
        previewAudioRef.current = null;
      };

      audio.onerror = () => {
        setPreviewingId(null);
        URL.revokeObjectURL(url);
        previewAudioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.warn("[VoicePicker] Preview error:", err);
      setPreviewingId(null);
    }
  }, [previewingId]);

  return (
    <div className="voice-picker">
      <div className="voice-filter-bar">
        {(["all", "female", "male"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`voice-filter-btn ${filter === f ? "voice-filter-btn--active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "female" ? "Female" : "Male"}
          </button>
        ))}
        <input
          type="text"
          className="voice-search-input"
          placeholder="Search voices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {filtered.length === 0 && (
        <div className="voice-picker-empty">No voices match "{search}"</div>
      )}
      <div className="voice-grid">
        {filtered.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`voice-card ${selectedId === v.id ? "voice-card--selected" : ""}`}
            onClick={() => onSelect(v)}
          >
            <span className="voice-card-gender">
              {v.gender === "female" ? "♀" : v.gender === "male" ? "♂" : "◎"}
            </span>
            <span className="voice-card-name">{v.name}</span>
            <span className="voice-card-desc">{v.description}</span>
            <span className="voice-card-accent">{v.accent}</span>
            <button
              type="button"
              className={`voice-card-preview ${previewingId === v.id ? "voice-card-preview--loading" : ""}`}
              title="Preview voice"
              onClick={(e) => handlePreview(v.id, e)}
            >
              {previewingId === v.id ? (
                <span className="voice-card-preview-spinner" />
              ) : (
                <Icon name="play" size={12} />
              )}
            </button>
            {selectedId === v.id && <span className="voice-card-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
