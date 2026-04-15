import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { VOICE_CATALOG, type VoiceEntry } from "../lib/voice-catalog";
import { fetchTtsPreview } from "../lib/tts-proxy";
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

  // Clean up preview audio on unmount to prevent leaks
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        URL.revokeObjectURL(previewAudioRef.current.src);
        previewAudioRef.current = null;
      }
    };
  }, []);

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

    setPreviewingId(voiceId);

    try {
      const blob = await fetchTtsPreview({
        voiceId,
        text: PREVIEW_TEXT,
      });
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
          <div
            key={v.id}
            role="button"
            tabIndex={0}
            className={`voice-card ${selectedId === v.id ? "voice-card--selected" : ""}`}
            onClick={() => onSelect(v)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(v); } }}
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
          </div>
        ))}
      </div>
    </div>
  );
}
