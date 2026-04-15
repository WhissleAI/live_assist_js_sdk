import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { computeRmsWindows } from "@whissle/live-assist-core";
import { loadSessions, deleteSession, updateSession } from "../lib/session-store";
import { getAudio, deleteAudio } from "../lib/audio-store";
import { navigate } from "../App";
import { gatewayConfig } from "../lib/gateway-config";
import { streamAgentRouter } from "../lib/agent-stream";
import { getDeviceId } from "../lib/device-id";
import type { StoredSession } from "../lib/session-store";
import type { EmotionTimelineEntry } from "../App";
import type { TranscriptEntry } from "../lib/liveAssistTypes";
import { EMOTION_COLORS, getEmotionTimelineColor } from "../lib/transcriptEmotion";
import {
  storedSessionToMicEntries,
  storedSessionToAgentEntries,
  storedSessionToMixedEntries,
  segmentAudioOffsetSec,
} from "../lib/sessionTranscriptEntries";
import { EmotionTimelineBar, createScrollSyncGroup } from "./live-assist/EmotionTimelineBar";
import Icon from "./Icon";
import { confirmAction } from "./ConfirmModal";
import { showToast } from "./Toast";
import { markdownToHtml } from "../lib/markdownToHtml";
import { exportSessionCsv, exportSessionJson } from "../lib/session-export";
import type { SegmentAnnotation } from "../lib/session-store";

const WAVEFORM_WINDOW_SEC = 0.05;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function normalizeEmotionKey(emotion: string): string {
  return String(emotion).toUpperCase().replace(/^EMOTION_/, "");
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length !== 6) return [148, 163, 184];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function blendEmotionProbs(probs: { emotion: string; probability: number }[]): { r: number; g: number; b: number; alpha: number } {
  let rr = 0;
  let gg = 0;
  let bb = 0;
  let total = 0;
  for (const p of probs) {
    if (normalizeEmotionKey(p.emotion) === "NEUTRAL") continue;
    const [r, g, b] = hexToRgb(getEmotionTimelineColor(p.emotion));
    rr += r * p.probability;
    gg += g * p.probability;
    bb += b * p.probability;
    total += p.probability;
  }
  if (total < 0.05) return { r: 148, g: 163, b: 184, alpha: 0.35 };
  return {
    r: rr / total,
    g: gg / total,
    b: bb / total,
    alpha: Math.min(1, 0.3 + 0.7 * Math.min(1, total)),
  };
}

function pickTimelineEntry(sorted: EmotionTimelineEntry[], timeMs: number): EmotionTimelineEntry | null {
  if (sorted.length === 0) return null;
  let best = sorted[0]!;
  for (const e of sorted) {
    if (e.offset <= timeMs) best = e;
    else break;
  }
  return best;
}

type PlotSeg = {
  offsetSec: number;
  speaker: string;
  emotion?: string;
  emotionConfidence?: number;
  emotionProbs?: Array<{ emotion: string; probability: number }>;
};

function userColumnFillStyle(
  sortedTimeline: EmotionTimelineEntry[],
  plotSegs: PlotSeg[],
  timeSec: number,
): string {
  const timeMs = timeSec * 1000;
  const entry = pickTimelineEntry(sortedTimeline, timeMs);
  if (entry) {
    if (entry.probs && entry.probs.length > 0) {
      const { r, g, b, alpha } = blendEmotionProbs(entry.probs);
      return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
    }
    const [r, g, b] = hexToRgb(getEmotionTimelineColor(entry.emotion));
    const a = 0.25 + 0.75 * Math.min(1, entry.confidence ?? 0.65);
    return `rgba(${r},${g},${b},${a})`;
  }
  const userish = plotSegs.filter((s) => s.speaker === "user" || s.speaker === "other");
  let seg: PlotSeg | null = null;
  for (let i = userish.length - 1; i >= 0; i--) {
    if (userish[i]!.offsetSec <= timeSec) {
      seg = userish[i]!;
      break;
    }
  }
  if (seg?.emotionProbs?.length) {
    const { r, g, b, alpha } = blendEmotionProbs(seg.emotionProbs);
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
  }
  if (!seg?.emotion) return "rgba(148,163,184,0.35)";
  const conf = seg.emotionConfidence ?? 0.55;
  const probs = [
    { emotion: seg.emotion, probability: conf },
    { emotion: "NEUTRAL", probability: Math.max(0, 1 - conf) },
  ];
  const { r, g, b, alpha } = blendEmotionProbs(probs);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}

function drawWaveform(
  canvas: HTMLCanvasElement | null,
  data: Float32Array | null,
  seekMax: number,
  sortedUserTimeline: EmotionTimelineEntry[],
  plotSegs: PlotSeg[],
): void {
  if (!canvas || !data || data.length === 0 || seekMax <= 0) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = rect.height;
  const mid = h / 2;
  const barWidth = Math.max(1, w / data.length);
  const maxVal = Math.max(...Array.from(data)) || 1;

  for (let i = 0; i < data.length; i++) {
    const x = (i / data.length) * w;
    const barH = (data[i]! / maxVal) * mid * 0.9;
    const timeSec = (i / data.length) * seekMax;
    ctx.fillStyle = userColumnFillStyle(sortedUserTimeline, plotSegs, timeSec);
    ctx.fillRect(x, mid - barH, barWidth, barH * 2);
  }
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5];

interface Props {
  sessionId: string;
}

export default function SessionDetail({ sessionId }: Props) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [micUrl, setMicUrl] = useState<string | null>(null);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTrack, setActiveTrack] = useState<"both" | "mic" | "tts">("both");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [activeSegIdx, setActiveSegIdx] = useState(-1);
  const [micAmplitudes, setMicAmplitudes] = useState<number[] | null>(null);
  const [ttsAmplitudes, setTtsAmplitudes] = useState<number[] | null>(null);
  const [waveformReady, setWaveformReady] = useState(0);

  // AI Summary
  const [aiSummary, setAiSummary] = useState<string>("");
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);

  // Re-transcription
  const [reTranscribing, setReTranscribing] = useState(false);
  const [reTranscribed, setReTranscribed] = useState(false);

  // Annotations
  const [annotations, setAnnotations] = useState<Record<string, SegmentAnnotation>>({});
  const [editingSegId, setEditingSegId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [notingSegId, setNotingSegId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [filterBookmarked, setFilterBookmarked] = useState(false);
  const [filterEmotion, setFilterEmotion] = useState<string>("all");
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [renamingSession, setRenamingSession] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const [scrollSyncGroup] = useState(() => createScrollSyncGroup());

  const micAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformDataRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const sessions = loadSessions();
    const found = sessions.find((s) => s.id === sessionId);
    setSession(found || null);
    if (found?.annotations) setAnnotations(found.annotations);
  }, [sessionId]);

  const updateAnnotation = useCallback(
    (segId: string, patch: Partial<SegmentAnnotation>) => {
      setAnnotations((prev) => {
        const existing = prev[segId] || {};
        const updated = { ...prev, [segId]: { ...existing, ...patch } };
        updateSession(sessionId, { annotations: updated });
        return updated;
      });
    },
    [sessionId],
  );

  const toggleBookmark = useCallback(
    (segId: string) => {
      const current = annotations[segId]?.bookmarked ?? false;
      updateAnnotation(segId, { bookmarked: !current });
    },
    [annotations, updateAnnotation],
  );

  const startEditing = useCallback(
    (segId: string, currentText: string) => {
      setEditingSegId(segId);
      setEditText(annotations[segId]?.editedText ?? currentText);
    },
    [annotations],
  );

  const saveEdit = useCallback(() => {
    if (!editingSegId) return;
    updateAnnotation(editingSegId, { editedText: editText.trim() || undefined });
    setEditingSegId(null);
    setEditText("");
  }, [editingSegId, editText, updateAnnotation]);

  const cancelEdit = useCallback(() => {
    setEditingSegId(null);
    setEditText("");
  }, []);

  const startNoting = useCallback(
    (segId: string) => {
      setNotingSegId(segId);
      setNoteText(annotations[segId]?.note ?? "");
      setTagInput("");
    },
    [annotations],
  );

  const saveNote = useCallback(() => {
    if (!notingSegId) return;
    updateAnnotation(notingSegId, { note: noteText.trim() || undefined });
    setNotingSegId(null);
    setNoteText("");
  }, [notingSegId, noteText, updateAnnotation]);

  const addTag = useCallback(
    (segId: string, tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (!trimmed) return;
      const existing = annotations[segId]?.tags ?? [];
      if (existing.includes(trimmed)) return;
      updateAnnotation(segId, { tags: [...existing, trimmed] });
      setTagInput("");
    },
    [annotations, updateAnnotation],
  );

  const removeTag = useCallback(
    (segId: string, tag: string) => {
      const existing = annotations[segId]?.tags ?? [];
      updateAnnotation(segId, { tags: existing.filter((t) => t !== tag) });
    },
    [annotations, updateAnnotation],
  );

  const anchorMs = useMemo(() => {
    if (!session) return 0;
    // Prefer audioStartMs (mic audio start) for alignment with audioOffsetSec values.
    // Falls back to sessionStartMs for older sessions without audioStartMs.
    if (session.audioStartMs != null) return session.audioStartMs;
    if (session.sessionStartMs != null) return session.sessionStartMs;
    if (session.transcript.length > 0) return session.transcript[0]!.timestamp;
    return new Date(session.date).getTime();
  }, [session]);

  const segments = useMemo(() => {
    if (!session) return [];
    return session.transcript.map((seg, idx) => ({
      ...seg,
      offsetSec: segmentAudioOffsetSec(seg, anchorMs),
      idx,
    }));
  }, [session, anchorMs]);

  const plotSegs: PlotSeg[] = useMemo(
    () =>
      segments.map((s) => ({
        offsetSec: s.offsetSec,
        speaker: s.speaker,
        emotion: s.emotion,
        emotionConfidence: s.emotionConfidence,
        emotionProbs: s.emotionProbs,
      })),
    [segments],
  );

  const timeline = useMemo(() => session?.emotionTimeline ?? [], [session]);
  const sortedUserTimeline = useMemo(() => [...timeline].sort((a, b) => a.offset - b.offset), [timeline]);

  const micBarEntries = useMemo(
    () => (session ? storedSessionToMicEntries(session, anchorMs) : []),
    [session, anchorMs],
  );

  /** Placeholder row so RMS-only replay still draws bars (matches Next when amps exist). */
  const micEntriesForBar = useMemo((): TranscriptEntry[] => {
    if (micBarEntries.length > 0) return micBarEntries;
    if (micAmplitudes != null && micAmplitudes.length > 0 && micUrl) {
      return [
        {
          channel: "mic",
          text: "·",
          audioOffset: 0,
          metadata: { emotion: "NEUTRAL", emotionConfidence: 0 },
          is_final: true,
        },
      ];
    }
    return [];
  }, [micBarEntries, micAmplitudes, micUrl]);

  const agentBarEntries = useMemo(
    () => (session ? storedSessionToAgentEntries(session, anchorMs) : []),
    [session, anchorMs],
  );

  const mixedBarEntries = useMemo(
    () => (session ? storedSessionToMixedEntries(session, anchorMs) : []),
    [session, anchorMs],
  );

  const mixedEntriesForBar = useMemo((): TranscriptEntry[] => {
    if (mixedBarEntries.length > 0) return mixedBarEntries;
    if (micAmplitudes != null && micAmplitudes.length > 0 && micUrl) {
      return [
        {
          channel: "mic",
          text: "·",
          audioOffset: 0,
          metadata: { emotion: "NEUTRAL", emotionConfidence: 0 },
          is_final: true,
        },
      ];
    }
    if (ttsAmplitudes != null && ttsAmplitudes.length > 0 && ttsUrl) {
      return [
        {
          channel: "assistant",
          text: "·",
          audioOffset: 0,
          metadata: { emotion: "NEUTRAL", emotionConfidence: 0 },
          is_final: true,
        },
      ];
    }
    return [];
  }, [mixedBarEntries, micAmplitudes, micUrl, ttsAmplitudes, ttsUrl]);

  const agentTimeline = useMemo(() => session?.agentEmotionTimeline ?? [], [session]);

  const contentExtentSec = useMemo(() => {
    if (!session) return 0.001;
    const lastT = timeline.length ? timeline[timeline.length - 1]!.offset / 1000 : 0;
    const lastAgentT = agentTimeline.length ? agentTimeline[agentTimeline.length - 1]!.offset / 1000 : 0;
    const lastSeg = segments.length ? Math.max(...segments.map((s) => s.offsetSec)) : 0;
    return Math.max(0.001, session.durationSec || 0, lastT, lastAgentT, lastSeg + 0.25);
  }, [session, timeline, agentTimeline, segments]);

  const seekMax = useMemo(() => Math.max(duration, contentExtentSec, 0.001), [duration, contentExtentSec]);

  const ampDerivedDurSec = useMemo(() => {
    if (!micAmplitudes?.length) return 0;
    return micAmplitudes.length * WAVEFORM_WINDOW_SEC;
  }, [micAmplitudes]);

  const ttsAmpDerivedDurSec = useMemo(() => {
    if (!ttsAmplitudes?.length) return 0;
    return ttsAmplitudes.length * WAVEFORM_WINDOW_SEC;
  }, [ttsAmplitudes]);

  const barDurationSec = useMemo(
    () => Math.max(seekMax, ampDerivedDurSec, ttsAmpDerivedDurSec, 0.001),
    [seekMax, ampDerivedDurSec, ttsAmpDerivedDurSec],
  );

  const micUrlRef = useRef<string | null>(null);
  const ttsUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);

    getAudio(session.id).then((record) => {
      if (cancelled) return;
      if (record?.micBlob) {
        const url = URL.createObjectURL(record.micBlob);
        micUrlRef.current = url;
        setMicUrl(url);
      }
      if (record?.ttsBlob) {
        const url = URL.createObjectURL(record.ttsBlob);
        ttsUrlRef.current = url;
        setTtsUrl(url);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      if (micUrlRef.current) {
        URL.revokeObjectURL(micUrlRef.current);
        micUrlRef.current = null;
      }
      if (ttsUrlRef.current) {
        URL.revokeObjectURL(ttsUrlRef.current);
        ttsUrlRef.current = null;
      }
    };
  }, [session]);

  const waveformDecodeUrl = micUrl ?? ttsUrl;

  // Shared audio decode helper — creates one AudioContext per decode then closes it
  const decodeAudioRms = useCallback(async (url: string): Promise<Float32Array> => {
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(buf);
      const channelData = decoded.getChannelData(0);
      return computeRmsWindows(channelData, decoded.sampleRate, WAVEFORM_WINDOW_SEC);
    } finally {
      ctx.close().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!micUrl) {
      setMicAmplitudes(null);
      return;
    }
    let cancelled = false;
    decodeAudioRms(micUrl)
      .then((rms) => { if (!cancelled) setMicAmplitudes(Array.from(rms)); })
      .catch(() => { if (!cancelled) setMicAmplitudes(null); });
    return () => { cancelled = true; };
  }, [micUrl, decodeAudioRms]);

  useEffect(() => {
    if (!ttsUrl) {
      setTtsAmplitudes(null);
      return;
    }
    let cancelled = false;
    decodeAudioRms(ttsUrl)
      .then((rms) => { if (!cancelled) setTtsAmplitudes(Array.from(rms)); })
      .catch(() => { if (!cancelled) setTtsAmplitudes(null); });
    return () => { cancelled = true; };
  }, [ttsUrl, decodeAudioRms]);

  useEffect(() => {
    if (!waveformDecodeUrl) {
      waveformDataRef.current = null;
      return;
    }
    let cancelled = false;
    decodeAudioRms(waveformDecodeUrl)
      .then((rms) => {
        if (!cancelled) {
          waveformDataRef.current = rms;
          setWaveformReady((v) => v + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          waveformDataRef.current = null;
          setWaveformReady((v) => v + 1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [waveformDecodeUrl]);

  const syncDuration = useCallback(() => {
    const mic = micAudioRef.current;
    const tts = ttsAudioRef.current;
    let max = 0;
    for (const el of [mic, tts]) {
      if (el && Number.isFinite(el.duration) && el.duration > 0) max = Math.max(max, el.duration);
    }
    if (max > 0) setDuration((d) => Math.max(d, max));
  }, []);

  const drawWaveformCb = useCallback(() => {
    drawWaveform(waveformCanvasRef.current, waveformDataRef.current, seekMax, sortedUserTimeline, plotSegs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekMax, sortedUserTimeline, plotSegs, waveformReady]);

  useEffect(() => {
    drawWaveformCb();
  }, [drawWaveformCb]);

  useEffect(() => {
    const parent = waveformCanvasRef.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => drawWaveformCb());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [drawWaveformCb]);

  const tick = useCallback(() => {
    const mic = micAudioRef.current;
    const tts = ttsAudioRef.current;
    const primary = activeTrack === "tts" ? tts || mic : mic || tts;
    if (!primary) return;
    setCurrentTime(primary.currentTime);
    if (!primary.paused) {
      frameRef.current = requestAnimationFrame(tick);
    }
  }, [activeTrack]);

  const togglePlay = useCallback(() => {
    const mic = micAudioRef.current;
    const tts = ttsAudioRef.current;
    if (playing) {
      mic?.pause();
      tts?.pause();
      cancelAnimationFrame(frameRef.current);
      setPlaying(false);
    } else {
      if (activeTrack !== "tts") mic?.play().catch(() => {});
      if (activeTrack !== "mic") tts?.play().catch(() => {});
      frameRef.current = requestAnimationFrame(tick);
      setPlaying(true);
    }
  }, [playing, activeTrack, tick]);

  const seekToTime = useCallback(
    (timeSec: number) => {
      const t = Math.max(0, Math.min(barDurationSec, timeSec));
      if (micAudioRef.current) micAudioRef.current.currentTime = t;
      if (ttsAudioRef.current) ttsAudioRef.current.currentTime = t;
      setCurrentTime(t);

      const newIdx = segments.findIndex((seg, i) => {
        const next = segments[i + 1];
        return t >= seg.offsetSec && (!next || t < next.offsetSec);
      });
      if (newIdx >= 0) {
        setActiveSegIdx(newIdx);
        requestAnimationFrame(() => {
          const el = document.getElementById(`detail-seg-${newIdx}`);
          if (el && transcriptScrollRef.current) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });
      }
    },
    [barDurationSec, segments],
  );

  const seekToPct = useCallback(
    (pct: number) => {
      seekToTime(pct * barDurationSec);
    },
    [barDurationSec, seekToTime],
  );

  const seekFromStripClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (barDurationSec <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      seekToTime(pct * barDurationSec);
    },
    [barDurationSec, seekToTime],
  );

  const cycleSpeed = useCallback(() => {
    setPlaybackSpeed((prev) => {
      const idx = PLAYBACK_SPEEDS.indexOf(prev);
      const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length]!;
      if (micAudioRef.current) micAudioRef.current.playbackRate = next;
      if (ttsAudioRef.current) ttsAudioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const handleEnded = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    setPlaying(false);
  }, []);

  useEffect(() => {
    const newIdx = segments.findIndex((seg, i) => {
      const next = segments[i + 1];
      return currentTime >= seg.offsetSec && (!next || currentTime < next.offsetSec);
    });
    if (newIdx !== activeSegIdx && newIdx >= 0) {
      setActiveSegIdx(newIdx);
      const el = document.getElementById(`detail-seg-${newIdx}`);
      if (el && transcriptScrollRef.current) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    if (newIdx < 0 && segments.length > 0 && currentTime < segments[0]!.offsetSec) {
      setActiveSegIdx(-1);
    }
  }, [currentTime, segments, activeSegIdx]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)
        return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seekToTime(Math.min(barDurationSec, currentTime + 5));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekToTime(Math.max(0, currentTime - 5));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekToTime, barDurationSec, currentTime]);

  // ── AI Summary: load cached on mount, generate on demand ─────────────
  useEffect(() => {
    if (session?.aiSummary) setAiSummary(session.aiSummary);
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const aiSummaryAbortRef = useRef<AbortController | null>(null);

  const generateAiSummary = useCallback(() => {
    if (!session || session.transcript.length === 0) return;

    aiSummaryAbortRef.current?.abort();
    const controller = new AbortController();
    aiSummaryAbortRef.current = controller;

    setAiSummaryLoading(true);
    setAiSummaryError(null);
    setAiSummary("");

    const transcriptText = session.transcript
      .map((seg) => {
        const speaker = seg.speaker === "agent" ? "Agent" : "User";
        const emoTag =
          seg.emotion && seg.emotion !== "NEUTRAL"
            ? ` (emotion: ${seg.emotion}${seg.emotionConfidence ? ` ${Math.round(seg.emotionConfidence * 100)}%` : ""})`
            : "";
        return `${speaker}: ${seg.text}${emoTag}`;
      })
      .join("\n");

    const summaryQuery = [
      "Analyze this voice agent conversation and provide a concise post-session analysis.",
      "Include: 1) A 2-3 sentence summary of what was discussed,",
      "2) Key topics covered, 3) The user's emotional journey,",
      "4) Any notable moments or insights.",
      "Be concise and use markdown formatting.",
      "",
      "Transcript:",
      transcriptText,
    ].join("\n");

    let accumulated = "";
    streamAgentRouter(
      {
        query: summaryQuery,
        agentConfig: {
          id: "session-analyzer",
          name: "Session Analyzer",
          description: "Analyzes completed voice agent sessions",
          avatar: "",
          voiceId: "",
          voiceName: "",
          ttsModel: "",
          language: "en",
          defaultSpeed: 1,
          systemPrompt: "You are a conversation analyst. Provide clear, concise analysis of voice agent sessions. Use markdown formatting with headers and bullet points.",
          model: "gemini-3-flash-preview",
          temperature: 0.3,
          maxOutputTokens: 1024,
          welcomeMessage: "",
          enabledTools: [],
          knowledgeContext: "",
          enableEmotionDetection: false,
          enableEmotionTts: false,
          enableBargeIn: false,
          requireToolConfirmation: false,
          maxSessionMinutes: 5,
          integrations: {},
          theme: { primaryColor: "#124e3f", accentColor: "#E53935", bgStyle: "solid", showFloatingWords: false, showEmotionLabel: false },
          createdAt: "",
          updatedAt: "",
          status: "published",
        },
      },
      {
        onChunk: (text) => {
          if (controller.signal.aborted) return;
          accumulated += text;
          setAiSummary(accumulated);
        },
        onDone: () => {
          if (controller.signal.aborted) return;
          setAiSummaryLoading(false);
          if (accumulated.trim()) {
            updateSession(session.id, { aiSummary: accumulated });
          }
        },
        onError: (msg) => {
          if (controller.signal.aborted) return;
          setAiSummaryLoading(false);
          setAiSummaryError(msg);
        },
      },
      controller.signal,
    ).catch((err) => {
      if (!controller.signal.aborted) {
        setAiSummaryLoading(false);
        setAiSummaryError(err?.message || "Failed to generate summary");
      }
    });
  }, [session]);

  useEffect(() => {
    return () => { aiSummaryAbortRef.current?.abort(); };
  }, []);

  // ── Re-transcription: batch ASR for cleaner text (opt-in) ───────────
  useEffect(() => {
    if (session?.reTranscribedAt) setReTranscribed(true);
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reTranscribeRef = useRef(false);

  const handleReTranscribe = useCallback(async () => {
    if (!session || !micUrl || reTranscribeRef.current) return;
    const userSegs = session.transcript.filter((s) => s.speaker === "user" || s.speaker === "other");
    if (userSegs.length === 0) return;

    reTranscribeRef.current = true;
    setReTranscribing(true);

    try {
      const resp = await fetch(micUrl);
      const blob = await resp.blob();

      const formData = new FormData();
      formData.append("file", blob, "session-mic.wav");
      formData.append("metadata_prob", "true");
      formData.append("word_timestamps", "true");

      const sessionToken = gatewayConfig.getSessionToken();
      const headers: Record<string, string> = {
        "X-Device-Id": getDeviceId(),
      };
      if (sessionToken) headers["X-Session-Token"] = sessionToken;

      const asrResp = await fetch(`${gatewayConfig.httpBase}/asr/transcribe`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!asrResp.ok) {
        console.warn("[ReTranscribe] ASR returned", asrResp.status);
        setReTranscribing(false);
        reTranscribeRef.current = false;
        return;
      }

      const asrResult = await asrResp.json();

      const newTranscript = asrResult.transcript as string | undefined;
      if (!newTranscript?.trim()) {
        setReTranscribing(false);
        reTranscribeRef.current = false;
        return;
      }

      const wordTs = asrResult.word_timestamps as Array<{ word: string; start: number; end: number }> | undefined;

      const updatedTranscript = [...session.transcript];
      if (wordTs?.length) {
        for (let i = 0; i < updatedTranscript.length; i++) {
          const seg = updatedTranscript[i]!;
          if (seg.speaker !== "user" && seg.speaker !== "other") continue;
          const segStart = segmentAudioOffsetSec(seg, anchorMs);
          const nextUserSeg = updatedTranscript.slice(i + 1).find((s) => s.speaker === "user" || s.speaker === "other");
          const segEnd = nextUserSeg ? segmentAudioOffsetSec(nextUserSeg, anchorMs) : Infinity;

          const wordsInRange = wordTs.filter((w) => w.start >= segStart - 0.1 && w.start < segEnd);
          if (wordsInRange.length > 0) {
            updatedTranscript[i] = { ...seg, text: wordsInRange.map((w) => w.word).join(" ") };
          }
        }
      } else {
        const firstUserIdx = updatedTranscript.findIndex((s) => s.speaker === "user" || s.speaker === "other");
        if (firstUserIdx >= 0 && userSegs.length === 1) {
          updatedTranscript[firstUserIdx] = { ...updatedTranscript[firstUserIdx]!, text: newTranscript };
        }
      }

      updateSession(session.id, {
        transcript: updatedTranscript,
        reTranscribedAt: Date.now(),
      });

      setSession((prev) => prev ? { ...prev, transcript: updatedTranscript, reTranscribedAt: Date.now() } : prev);
      setReTranscribed(true);
      setReTranscribing(false);
    } catch (err) {
      console.warn("[ReTranscribe] error:", err);
      setReTranscribing(false);
      reTranscribeRef.current = false;
    }
  }, [session, micUrl, anchorMs]);

  if (!session) {
    return (
      <div className="studio-page">
        <div className="studio-empty-state">
          <div className="empty-icon"><Icon name="search" size={32} /></div>
          <h3>Session not found</h3>
          <p>This session may have been deleted.</p>
          <button type="button" className="btn btn--primary studio-empty-action" onClick={() => navigate("sessions")}>
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  const hasAudio = micUrl || ttsUrl;
  const displayDuration = barDurationSec;
  const scrubLeftPct = displayDuration > 0 ? (currentTime / displayDuration) * 100 : 0;

  const showUserBar = micEntriesForBar.length > 0;
  const showAgentBar = agentBarEntries.length > 0;
  const showMixedBar = mixedEntriesForBar.length > 0;
  const scrollChartsWhilePlaying = playing && !!hasAudio;

  return (
    <div className="session-detail">
      <div className="session-detail-top">
        <button type="button" className="btn btn--ghost session-detail-back" onClick={() => navigate("sessions")}>
          <Icon name="chevron-left" size={16} /> Back
        </button>
        {renamingSession ? (
          <input
            className="session-detail-rename-input"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => {
              const name = renameValue.trim();
              if (name && session) {
                updateSession(session.id, { customName: name });
                setSession({ ...session, customName: name });
              }
              setRenamingSession(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenamingSession(false);
            }}
          />
        ) : (
          <h1
            className="session-detail-title"
            onClick={() => {
              setRenameValue(session.customName || session.agentName || "");
              setRenamingSession(true);
            }}
            title="Click to rename"
            style={{ cursor: "pointer" }}
          >
            {session.customName || session.agentName || "Session"} · {new Date(session.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            <Icon name="edit-2" size={13} />
          </h1>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--small session-detail-delete"
          onClick={async () => {
            if (await confirmAction("Delete session?", "This cannot be undone.")) {
              deleteSession(session.id);
              deleteAudio(session.id).catch(() => {});
              showToast("Session deleted", "success");
              navigate("sessions");
            }
          }}
        >
          <Icon name="trash" size={14} /> Delete
        </button>
      </div>

      {/* Session metadata summary */}
      <div className="session-detail-meta">
        <span className="session-meta-chip">
          <Icon name="clock" size={13} /> {session.durationSec > 0 ? formatTime(session.durationSec) : "—"}
        </span>
        <span className="session-meta-chip">
          <Icon name="message-square" size={13} /> {segments.length} segments
        </span>
        {session.emotionSummary.dominant && session.emotionSummary.dominant !== "NEUTRAL" && (
          <span
            className="session-meta-chip session-meta-chip--emotion"
            style={{ color: EMOTION_COLORS[session.emotionSummary.dominant] || "var(--color-text-secondary)" }}
          >
            <span className="emotion-legend-dot" style={{ background: EMOTION_COLORS[session.emotionSummary.dominant] }} />
            {session.emotionSummary.dominant.charAt(0) + session.emotionSummary.dominant.slice(1).toLowerCase()}
          </span>
        )}
        {session.emotionSummary.shifts > 0 && (
          <span className="session-meta-chip">
            {session.emotionSummary.shifts} emotion shift{session.emotionSummary.shifts > 1 ? "s" : ""}
          </span>
        )}
        <span className="session-meta-chip">
          {new Date(session.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
        {/* Processing status */}
        {(reTranscribing || aiSummaryLoading) && (
          <span className="session-meta-chip session-meta-chip--processing">
            <span className="processing-dot" /> Processing...
          </span>
        )}
        {reTranscribed && !reTranscribing && (
          <span className="session-meta-chip session-meta-chip--done">
            <Icon name="check" size={12} /> Enhanced
          </span>
        )}
      </div>

      <div className="session-detail-layout">
        <div className="session-detail-audio-col">
          {/* AI Analysis */}
          <div className="ai-summary-card">
            <div className="ai-summary-header">
              <Icon name="sparkles" size={15} />
              <span>AI Analysis</span>
              {aiSummaryLoading && <span className="ai-summary-loading">Analyzing...</span>}
              {!aiSummary && !aiSummaryLoading && session.transcript.length > 0 && (
                <button type="button" className="btn btn--small btn--secondary" onClick={generateAiSummary}>
                  <Icon name="zap" size={13} /> Generate
                </button>
              )}
              {aiSummary && !aiSummaryLoading && (
                <button type="button" className="btn btn--small btn--ghost" onClick={generateAiSummary} title="Regenerate analysis">
                  <Icon name="refresh-cw" size={13} />
                </button>
              )}
            </div>
            {aiSummaryError && (
              <div className="ai-summary-error">{aiSummaryError}</div>
            )}
            {aiSummary && (
              <div className="ai-summary-body" dangerouslySetInnerHTML={{ __html: markdownToHtml(aiSummary) }} />
            )}
            {!aiSummary && !aiSummaryLoading && !aiSummaryError && (
              <div className="ai-summary-placeholder">Click Generate to analyze this conversation with AI.</div>
            )}
          </div>

          {loading && <div className="session-detail-message">Loading audio...</div>}

          {!loading && !hasAudio && (
            <div className="session-detail-message session-detail-message--bordered">
              No audio recording available. Audio is saved for new sessions.
            </div>
          )}

          {!loading && hasAudio && (
            <>
              {micUrl && (
                <audio
                  ref={micAudioRef}
                  src={micUrl}
                  preload="metadata"
                  onLoadedMetadata={syncDuration}
                  onDurationChange={syncDuration}
                  onEnded={handleEnded}
                  muted={activeTrack === "tts"}
                />
              )}
              {ttsUrl && (
                <audio
                  ref={ttsAudioRef}
                  src={ttsUrl}
                  preload="metadata"
                  onLoadedMetadata={syncDuration}
                  onDurationChange={syncDuration}
                  onEnded={handleEnded}
                  muted={activeTrack === "mic"}
                />
              )}

              <div className="session-detail-audio-controls-clip">
                <div className="audio-controls-bar">
                  <button type="button" className="audio-play-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                    <Icon name={playing ? "pause" : "play"} size={16} />
                  </button>
                  <span className="audio-time">
                    {formatTime(currentTime)} / {formatTime(displayDuration)}
                  </span>
                  <input
                    type="range"
                    className="audio-seek-bar"
                    min={0}
                    max={1}
                    step={0.001}
                    value={displayDuration > 0 ? currentTime / displayDuration : 0}
                    onChange={(e) => seekToPct(parseFloat(e.target.value))}
                    aria-label="Seek position"
                  />
                  <button type="button" className="audio-speed-btn" onClick={cycleSpeed}>
                    {playbackSpeed}x
                  </button>
                  {micUrl && ttsUrl && (
                    <select
                      className="audio-track-select"
                      value={activeTrack}
                      onChange={(e) => setActiveTrack(e.target.value as "both" | "mic" | "tts")}
                    >
                      <option value="both">Both</option>
                      <option value="mic">User</option>
                      <option value="tts">Agent</option>
                    </select>
                  )}
                </div>
                <div className="audio-shortcuts-hint">
                  <kbd>Space</kbd> play/pause &nbsp; <kbd>&larr;</kbd><kbd>&rarr;</kbd> seek 5s
                </div>
              </div>
            </>
          )}

          <div className="emotion-timelines-section">
            <div className="emotion-timelines-heading">Emotion spectrogram</div>
            <p className="emotion-timelines-hint">
              Scroll horizontally inside each strip. While playing, strips follow the playhead. Click to seek. Transcript stays on the right.
            </p>

            {showUserBar && (
              <div className="emotion-timeline-row emotion-timeline-row--spectrogram">
                <span className="emotion-timeline-label">User (mic)</span>
                <div className="session-detail-chart-cell">
                  <EmotionTimelineBar
                    entries={micEntriesForBar}
                    durationSec={barDurationSec}
                    currentTimeSec={currentTime}
                    onSeek={hasAudio ? seekToTime : undefined}
                    height={28}
                    audioAmplitudes={micAmplitudes ?? undefined}
                    amplitudeIntervalSec={WAVEFORM_WINDOW_SEC}
                    isPlaying={scrollChartsWhilePlaying}
                    scrollSyncGroup={scrollSyncGroup}
                  />
                </div>
              </div>
            )}

            {showAgentBar && (
              <div className="emotion-timeline-row emotion-timeline-row--spectrogram">
                <span className="emotion-timeline-label">Agent</span>
                <div className="session-detail-chart-cell">
                  <EmotionTimelineBar
                    entries={agentBarEntries}
                    durationSec={barDurationSec}
                    currentTimeSec={currentTime}
                    onSeek={hasAudio ? seekToTime : undefined}
                    height={28}
                    audioAmplitudes={ttsAmplitudes ?? undefined}
                    amplitudeIntervalSec={WAVEFORM_WINDOW_SEC}
                    isPlaying={scrollChartsWhilePlaying}
                    scrollSyncGroup={scrollSyncGroup}
                  />
                </div>
              </div>
            )}

            {showMixedBar && (
              <div className="emotion-timeline-row emotion-timeline-row--spectrogram">
                <span className="emotion-timeline-label">Mixed</span>
                <div className="session-detail-chart-cell">
                  <EmotionTimelineBar
                    entries={mixedEntriesForBar}
                    durationSec={barDurationSec}
                    currentTimeSec={currentTime}
                    onSeek={hasAudio ? seekToTime : undefined}
                    height={28}
                    audioAmplitudes={(micAmplitudes ?? ttsAmplitudes) ?? undefined}
                    amplitudeIntervalSec={WAVEFORM_WINDOW_SEC}
                    isPlaying={scrollChartsWhilePlaying}
                    scrollSyncGroup={scrollSyncGroup}
                  />
                </div>
              </div>
            )}

            {!showUserBar && !showAgentBar && !showMixedBar && (
              <p className="session-detail-hint">No transcript lines to plot.</p>
            )}
          </div>

          {hasAudio && (
            <div className="session-detail-waveform-wrap" onClick={seekFromStripClick}>
              <div className="waveform-label">Audio waveform</div>
              <div className="audio-waveform">
                <canvas ref={waveformCanvasRef} />
              </div>
            </div>
          )}

          <div className="emotion-legend">
            {(["HAPPY", "SAD", "ANGRY", "FEAR", "SURPRISE", "DISGUST", "NEUTRAL"] as const).map((emo) => (
              <span key={emo} className="emotion-legend-item">
                <span className="emotion-legend-dot" style={{ background: EMOTION_COLORS[emo] }} />
                {emo.charAt(0) + emo.slice(1).toLowerCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="session-detail-transcript-col">
          <div className="session-detail-transcript-header">
            <span>Transcript · {segments.length} segments</span>
            <div className="transcript-header-actions">
              {reTranscribing && <span className="transcript-enhancing"><span className="processing-dot" /> Enhancing...</span>}
              {!reTranscribed && !reTranscribing && micUrl && (
                <button type="button" className="btn btn--ghost btn--small" onClick={handleReTranscribe} title="Re-transcribe with batch ASR for cleaner text">
                  <Icon name="zap" size={13} /> Enhance
                </button>
              )}
              {reTranscribed && !reTranscribing && <span className="transcript-enhanced"><Icon name="check" size={12} /> Enhanced</span>}
              <button
                type="button"
                className={`btn btn--ghost btn--small ${filterBookmarked ? "btn--ghost--active" : ""}`}
                onClick={() => setFilterBookmarked((f) => !f)}
                title={filterBookmarked ? "Show all segments" : "Show bookmarked only"}
              >
                <Icon name="bookmark" size={13} />
              </button>
              <select
                className="transcript-emotion-filter"
                value={filterEmotion}
                onChange={(e) => setFilterEmotion(e.target.value)}
                title="Filter by emotion"
              >
                <option value="all">All emotions</option>
                {["HAPPY", "SAD", "ANGRY", "FEAR", "SURPRISE", "DISGUST", "NEUTRAL"].map((emo) => (
                  <option key={emo} value={emo}>{emo.charAt(0) + emo.slice(1).toLowerCase()}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => exportSessionCsv(session)}
                title="Export CSV"
              >
                <Icon name="download" size={13} /> CSV
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => exportSessionJson(session)}
                title="Export JSON"
              >
                <Icon name="download" size={13} /> JSON
              </button>
            </div>
          </div>
          <div className="transcript-search-row">
            <Icon name="search" size={14} />
            <input
              type="text"
              className="transcript-search-input"
              placeholder="Search transcript..."
              value={transcriptSearch}
              onChange={(e) => setTranscriptSearch(e.target.value)}
            />
            {transcriptSearch && (
              <button type="button" className="transcript-search-clear" onClick={() => setTranscriptSearch("")}>&times;</button>
            )}
          </div>
          <div className="session-detail-transcript-body" ref={transcriptScrollRef}>
            {segments
              .filter((seg) => {
                if (filterBookmarked && !annotations[seg.id]?.bookmarked) return false;
                if (filterEmotion !== "all" && seg.emotion !== filterEmotion) return false;
                if (transcriptSearch) {
                  const q = transcriptSearch.toLowerCase();
                  const displayText = annotations[seg.id]?.editedText || seg.text;
                  if (!displayText.toLowerCase().includes(q)) return false;
                }
                return true;
              })
              .map((seg) => {
              const ann = annotations[seg.id];
              const isEditing = editingSegId === seg.id;
              const displayText = ann?.editedText || seg.text;
              return (
              <div
                key={seg.id}
                id={`detail-seg-${seg.idx}`}
                className={`detail-seg ${seg.idx === activeSegIdx ? "detail-seg--active" : ""} ${ann?.bookmarked ? "detail-seg--bookmarked" : ""}`}
                onClick={() => {
                  if (displayDuration > 0 && !isEditing) seekToTime(seg.offsetSec);
                }}
              >
                <div className="detail-seg-header">
                  <span className={`detail-seg-speaker detail-seg-speaker--${seg.speaker}`}>
                    {seg.speaker === "user" ? "User" : seg.speaker === "agent" ? "Agent" : "Other"}
                  </span>
                  <span className="detail-seg-time">{formatTime(seg.offsetSec)}</span>
                  {seg.emotion && seg.emotion !== "NEUTRAL" && seg.emotion !== "neutral" && (
                    <span
                      className="detail-seg-emotion"
                      style={{ color: EMOTION_COLORS[seg.emotion] || "var(--color-text-secondary)" }}
                    >
                      {seg.emotion}
                    </span>
                  )}
                  <div className="detail-seg-actions">
                    <button
                      type="button"
                      className={`detail-seg-action-btn ${ann?.bookmarked ? "detail-seg-action-btn--active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); toggleBookmark(seg.id); }}
                      title={ann?.bookmarked ? "Remove bookmark" : "Bookmark"}
                      aria-label={ann?.bookmarked ? "Remove bookmark" : "Bookmark segment"}
                    >
                      <Icon name="bookmark" size={13} />
                    </button>
                    <button
                      type="button"
                      className="detail-seg-action-btn"
                      onClick={(e) => { e.stopPropagation(); startEditing(seg.id, seg.text); }}
                      title="Edit text"
                      aria-label="Edit segment text"
                    >
                      <Icon name="edit-2" size={13} />
                    </button>
                    <button
                      type="button"
                      className={`detail-seg-action-btn ${ann?.note ? "detail-seg-action-btn--active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); notingSegId === seg.id ? setNotingSegId(null) : startNoting(seg.id); }}
                      title={ann?.note ? "Edit note" : "Add note"}
                      aria-label={ann?.note ? "Edit note" : "Add note"}
                    >
                      <Icon name="message-square" size={13} />
                    </button>
                  </div>
                </div>
                {isEditing ? (
                  <div className="detail-seg-edit" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className="detail-seg-edit-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                      rows={2}
                    />
                    <div className="detail-seg-edit-actions">
                      <button type="button" className="btn btn--small btn--primary" onClick={saveEdit}>Save</button>
                      <button type="button" className="btn btn--small btn--ghost" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="detail-seg-text">
                    {displayText}
                    {ann?.editedText && <span className="detail-seg-edited-badge" title="Manually edited">edited</span>}
                  </div>
                )}
                {/* Note editor */}
                {notingSegId === seg.id && (
                  <div className="detail-seg-note-editor" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className="detail-seg-edit-input"
                      placeholder="Add a note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNote(); }
                        if (e.key === "Escape") setNotingSegId(null);
                      }}
                      autoFocus
                      rows={2}
                    />
                    <div className="detail-seg-note-tag-row">
                      <input
                        className="detail-seg-tag-input"
                        placeholder="Add tag + Enter"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addTag(seg.id, tagInput); }
                        }}
                      />
                      <button type="button" className="btn btn--small btn--primary" onClick={saveNote}>Save</button>
                      <button type="button" className="btn btn--small btn--ghost" onClick={() => setNotingSegId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
                {/* Display existing note and tags */}
                {notingSegId !== seg.id && (ann?.note || (ann?.tags && ann.tags.length > 0)) && (
                  <div className="detail-seg-annotations" onClick={(e) => e.stopPropagation()}>
                    {ann?.note && <div className="detail-seg-note">{ann.note}</div>}
                    {ann?.tags && ann.tags.length > 0 && (
                      <div className="detail-seg-tags">
                        {ann.tags.map((tag) => (
                          <span key={tag} className="detail-seg-tag">
                            {tag}
                            <button type="button" className="detail-seg-tag-remove" onClick={() => removeTag(seg.id, tag)} aria-label={`Remove tag ${tag}`}>&times;</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Per-second emotion mini-timeline */}
                {seg.emotionTimelineUtterance && seg.emotionTimelineUtterance.length > 1 && (
                  <div className="detail-seg-emotion-timeline">
                    <div className="detail-seg-emotion-strip">
                      {seg.emotionTimelineUtterance.map((pt, i) => {
                        const next = seg.emotionTimelineUtterance![i + 1];
                        const dur = next ? next.offset - pt.offset : (seg.emotionTimelineUtterance![seg.emotionTimelineUtterance!.length - 1]!.offset - seg.emotionTimelineUtterance![0]!.offset) / seg.emotionTimelineUtterance!.length || 1;
                        const totalDur = seg.emotionTimelineUtterance![seg.emotionTimelineUtterance!.length - 1]!.offset - seg.emotionTimelineUtterance![0]!.offset || 1;
                        const widthPct = (dur / totalDur) * 100;
                        let color: string;
                        let alpha: number;
                        if (pt.probs && pt.probs.length > 0) {
                          const blend = blendEmotionProbs(pt.probs);
                          color = `rgba(${Math.round(blend.r)},${Math.round(blend.g)},${Math.round(blend.b)},${blend.alpha})`;
                          alpha = blend.alpha;
                        } else {
                          color = getEmotionTimelineColor(pt.emotion);
                          alpha = 0.3 + 0.7 * (pt.confidence ?? 0.5);
                        }
                        return (
                          <div
                            key={i}
                            className="detail-seg-emotion-strip-cell"
                            style={{
                              width: `${Math.max(2, widthPct)}%`,
                              background: color,
                              opacity: typeof alpha === "number" && color.startsWith("rgba") ? 1 : alpha,
                            }}
                            title={`${pt.emotion} (${Math.round((pt.confidence ?? 0) * 100)}%) @ ${pt.offset.toFixed(1)}s`}
                          />
                        );
                      })}
                    </div>
                    {/* Probability breakdown for non-neutral emotions */}
                    {seg.emotionProbs && seg.emotionProbs.filter((p) => p.emotion !== "NEUTRAL" && p.probability > 0.05).length > 0 && (
                      <div className="detail-seg-prob-row">
                        {seg.emotionProbs
                          .filter((p) => p.probability > 0.05)
                          .sort((a, b) => b.probability - a.probability)
                          .slice(0, 4)
                          .map((p) => (
                            <span key={p.emotion} className="detail-seg-prob-chip" style={{ color: EMOTION_COLORS[p.emotion] || "var(--color-text-secondary)" }}>
                              <span className="detail-seg-prob-dot" style={{ background: EMOTION_COLORS[p.emotion] || "#9ca3af" }} />
                              {p.emotion.charAt(0) + p.emotion.slice(1).toLowerCase()} {Math.round(p.probability * 100)}%
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Fallback: show probability chips when no per-second timeline but probs exist */}
                {(!seg.emotionTimelineUtterance || seg.emotionTimelineUtterance.length <= 1) &&
                  seg.emotionProbs && seg.emotionProbs.filter((p) => p.emotion !== "NEUTRAL" && p.probability > 0.05).length > 0 && (
                  <div className="detail-seg-prob-row" style={{ marginTop: 4 }}>
                    {seg.emotionProbs
                      .filter((p) => p.probability > 0.05)
                      .sort((a, b) => b.probability - a.probability)
                      .slice(0, 4)
                      .map((p) => (
                        <span key={p.emotion} className="detail-seg-prob-chip" style={{ color: EMOTION_COLORS[p.emotion] || "var(--color-text-secondary)" }}>
                          <span className="detail-seg-prob-dot" style={{ background: EMOTION_COLORS[p.emotion] || "#9ca3af" }} />
                          {p.emotion.charAt(0) + p.emotion.slice(1).toLowerCase()} {Math.round(p.probability * 100)}%
                        </span>
                      ))}
                  </div>
                )}
              </div>
              );
            })}
            {segments.length === 0 && (
              <div className="session-detail-message">No transcript available.</div>
            )}
            {filterBookmarked && segments.filter((s) => annotations[s.id]?.bookmarked).length === 0 && (
              <div className="session-detail-message">No bookmarked segments.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
