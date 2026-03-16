import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import type { TranscriptEntry } from "@whissle/live-assist-core";

const EMOTION_COLOR: Record<string, string> = {
  HAPPY: "#facc15",
  SAD: "#3b82f6",
  ANGRY: "#ef4444",
  NEUTRAL: "#9ca3af",
  CURIOUS: "#6366f1",
  FRUSTRATED: "#f59e0b",
  FEAR: "#8b5cf6",
  SURPRISE: "#f97316",
  DISGUST: "#14b8a6",
};

const INTENT_COLOR: Record<string, string> = {
  QUERY: "#3b82f6",
  COMMAND: "#ef4444",
  INFORM: "#22c55e",
  CONFIRM: "#14b8a6",
  DENY: "#f97316",
  GREET: "#8b5cf6",
  FAREWELL: "#6366f1",
  ACKNOWLEDGE: "#9ca3af",
  REQUEST: "#f59e0b",
};

const NON_NEUTRAL_EMOTIONS = Object.keys(EMOTION_COLOR).filter((k) => k !== "NEUTRAL");

function getEmotionColor(emotion?: string | null): string {
  if (!emotion) return "#cbd5e1";
  return EMOTION_COLOR[String(emotion).toUpperCase()] ?? "#cbd5e1";
}

function getIntentColor(intent?: string | null): string {
  if (!intent) return "#94a3b8";
  return INTENT_COLOR[String(intent).toUpperCase()] ?? "#94a3b8";
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function blendColors(probs: { emotion: string; probability: number }[]): { r: number; g: number; b: number; alpha: number } {
  let rr = 0, gg = 0, bb = 0, total = 0;
  for (const p of probs) {
    if (p.emotion === "NEUTRAL") continue;
    const hex = EMOTION_COLOR[p.emotion];
    if (!hex) continue;
    const [r, g, b] = hexRgb(hex);
    rr += r * p.probability;
    gg += g * p.probability;
    bb += b * p.probability;
    total += p.probability;
  }
  if (total < 0.05) return { r: 156, g: 163, b: 175, alpha: 0.15 };
  return { r: rr / total, g: gg / total, b: bb / total, alpha: Math.min(1, 0.4 + total * 0.8) };
}

const LEGEND = Object.entries(EMOTION_COLOR).map(
  ([k, c]) => ({ key: k, label: k.charAt(0) + k.slice(1).toLowerCase(), color: c }),
);

export interface TranscriptViewProps {
  entries: TranscriptEntry[];
  maxHeight?: number;
  showTimeline?: boolean;
  durationSec?: number;
  currentTimeSec?: number;
  onSeek?: (sec: number) => void;
}

export function TranscriptView({
  entries,
  maxHeight = 300,
  showTimeline = false,
  durationSec,
  currentTimeSec = 0,
  onSeek,
}: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"mic" | "tab" | "all">("all");

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [entries.length, entries[entries.length - 1]?.text]);

  const filtered = tab === "all" ? entries : entries.filter((e) => e.channel === tab);
  const effectiveDuration =
    durationSec ??
    (entries.length
      ? Math.max(...entries.map((e) => (e.audioOffset ?? 0) + 3), 10)
      : 10);

  return (
    <div>
      {showTimeline && filtered.length > 0 && (
        <EmotionTimelineBar
          entries={filtered}
          durationSec={effectiveDuration}
          currentTimeSec={currentTimeSec}
          onSeek={onSeek}
        />
      )}
      <div style={{
        display: "flex",
        gap: 2,
        marginBottom: 6,
        borderBottom: "1px solid var(--la-border, #e5e7eb)",
        paddingBottom: 3,
      }}>
        {(["all", "mic", "tab"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "3px 10px",
              fontSize: 10,
              fontWeight: tab === t ? 600 : 400,
              background: tab === t ? "var(--la-primary, #124e3f)" : "transparent",
              color: tab === t ? "#fff" : "#94a3b8",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              transition: "all 0.15s ease",
            }}
          >
            {t === "all" ? "All" : t === "mic" ? "You" : "Other"}
          </button>
        ))}
      </div>
      <div ref={scrollRef} style={{ maxHeight, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {filtered.length === 0 && (
          <div style={{ color: "#9ca3af", fontSize: 12, padding: 20, textAlign: "center", fontStyle: "italic" }}>
            No transcript yet
          </div>
        )}
        {filtered.map((entry, i) => (
          <TranscriptBubble key={entry._id ?? `t-${i}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatIntentLabel(intent: string): string {
  return intent.charAt(0) + intent.slice(1).toLowerCase();
}

interface EmotionSpan {
  start: number;
  end: number;
  color: string;
  opacity: number;
  label: string;
  confidence: number;
  probs?: { emotion: string; probability: number }[];
}

const CHUNK_SEC = 0.1;
const PX_PER_BAR = 3;
const GAP_PX = 0.5;
const LANE_H = 5;
const LANE_GAP = 1;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export function EmotionTimelineBar({
  entries,
  durationSec,
  currentTimeSec = 0,
  onSeek,
  height = 36,
  amplitudes,
  amplitudeIntervalSec,
}: {
  entries: TranscriptEntry[];
  durationSec: number;
  currentTimeSec?: number;
  onSeek?: (sec: number) => void;
  height?: number;
  amplitudes?: number[];
  amplitudeIntervalSec?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laneCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [tip, setTip] = useState<{ x: number; y: number; label: string; conf: number; t: number; probs?: { emotion: string; probability: number }[] } | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, sl: 0 });
  const userScrolledRef = useRef(false);
  const prevAmpsLenRef = useRef(0);

  const filtered = useMemo(() => entries.filter((e) => (e.text || "").trim()), [entries]);
  const amps = amplitudes;
  const interval = amplitudeIntervalSec ?? CHUNK_SEC;
  const hasAmps = amps != null && amps.length > 0;

  const spans = useMemo<EmotionSpan[]>(() => {
    const out: EmotionSpan[] = [];
    if (filtered.length === 0) return out;
    let prevOff = -1;
    let monotonic = true;
    let allZero = true;
    for (const e of filtered) {
      if (e.audioOffset == null || e.audioOffset < prevOff) { monotonic = false; break; }
      if (e.audioOffset > 0) allZero = false;
      prevOff = e.audioOffset;
    }
    const useOffsets = monotonic && !allZero;
    for (let i = 0; i < filtered.length; i++) {
      const e = filtered[i]!;
      const s = useOffsets && e.audioOffset != null ? e.audioOffset : (i / filtered.length) * durationSec;
      const end = useOffsets && i < filtered.length - 1 && filtered[i + 1]!.audioOffset != null
        ? filtered[i + 1]!.audioOffset! : ((i + 1) / filtered.length) * durationSec;
      const tl = e.metadata?.emotionTimeline;
      if (tl?.length) {
        for (let j = 0; j < tl.length; j++) {
          const pt = tl[j]!;
          const ps = s + pt.offset;
          const pe = j < tl.length - 1 ? s + tl[j + 1]!.offset : end;
          const c = pt.confidence ?? 0;
          out.push({
            start: ps, end: Math.max(ps + 0.01, pe),
            color: getEmotionColor(pt.emotion),
            opacity: 0.3 + 0.7 * c,
            label: pt.emotion ?? "—",
            confidence: c,
            probs: pt.probs,
          });
        }
      } else {
        const c = e.metadata?.emotionConfidence ?? 0;
        out.push({
          start: s, end: Math.max(s + 0.01, end),
          color: getEmotionColor(e.metadata?.emotion),
          opacity: 0.3 + 0.7 * c,
          label: e.metadata?.emotion ?? "—",
          confidence: c,
        });
      }
    }
    return out;
  }, [filtered, durationSec]);

  const spanAt = useCallback((t: number): EmotionSpan | null => {
    for (let i = spans.length - 1; i >= 0; i--) {
      if (spans[i]!.start <= t && spans[i]!.end > t) return spans[i]!;
    }
    return null;
  }, [spans]);

  const activeEmotions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sp of spans) {
      if (sp.probs) {
        for (const p of sp.probs) {
          if (p.emotion !== "NEUTRAL" && p.probability > 0.1) counts[p.emotion] = (counts[p.emotion] ?? 0) + 1;
        }
      } else if (sp.label !== "NEUTRAL" && sp.label !== "—") {
        counts[sp.label] = (counts[sp.label] ?? 0) + 1;
      }
    }
    return NON_NEUTRAL_EMOTIONS.filter((k) => (counts[k] ?? 0) > 0);
  }, [spans]);

  const laneHeight = activeEmotions.length > 0 ? activeEmotions.length * (LANE_H + LANE_GAP) : 0;

  const normAmps = useMemo(() => {
    if (!amps?.length) return null;
    const sorted = [...amps].sort((a, b) => a - b);
    const peak = Math.max(sorted[Math.floor(sorted.length * 0.95)] ?? 0.01, 0.001);
    return amps.map((a) => Math.min(1, a / peak));
  }, [amps]);

  const barPx = PX_PER_BAR * zoom;
  const tapeWidthPx = hasAmps
    ? Math.max(200, (normAmps?.length ?? 0) * barPx)
    : Math.max(200, durationSec * 6 * zoom);
  const totalDurSec = hasAmps ? (amps!.length * interval) : durationSec;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const W = tapeWidthPx;
    const H = height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const midY = H / 2;

    if (normAmps?.length) {
      for (let i = 0; i < normAmps.length; i++) {
        const x = i * barPx;
        const amp = normAmps[i]!;
        const halfH = Math.max(amp > 0.02 ? 1 : 0.4, amp * midY);
        const t = i * interval;
        const span = spanAt(t);
        if (span?.probs && span.probs.length > 0) {
          const bc = blendColors(span.probs);
          const alpha = Math.max(0.2, bc.alpha * (0.5 + amp * 0.5));
          ctx.fillStyle = `rgba(${Math.round(bc.r)},${Math.round(bc.g)},${Math.round(bc.b)},${alpha.toFixed(2)})`;
        } else if (span) {
          const [r, g, b] = hexRgb(span.color);
          const isNeutral = span.label === "NEUTRAL";
          const alpha = isNeutral ? Math.max(0.08, 0.12 + amp * 0.15) : Math.max(0.3, span.opacity * (0.5 + amp * 0.5));
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        } else {
          ctx.fillStyle = `rgba(156,163,175,${(0.1 + amp * 0.2).toFixed(2)})`;
        }
        const bw = Math.max(1, barPx - GAP_PX);
        ctx.beginPath();
        ctx.roundRect(x, midY - halfH, bw, halfH * 2, 1);
        ctx.fill();
      }
    } else if (spans.length > 0) {
      for (const sp of spans) {
        const x = (sp.start / durationSec) * W;
        const w = Math.max(2, ((sp.end - sp.start) / durationSec) * W);
        if (sp.probs && sp.probs.length > 0) {
          const bc = blendColors(sp.probs);
          const halfH = midY * Math.max(0.25, bc.alpha);
          ctx.fillStyle = `rgba(${Math.round(bc.r)},${Math.round(bc.g)},${Math.round(bc.b)},${bc.alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.roundRect(x, midY - halfH, w, halfH * 2, 2);
          ctx.fill();
        } else {
          const [r, g, b] = hexRgb(sp.color);
          const isNeutral = sp.label === "NEUTRAL";
          const halfH = isNeutral ? midY * 0.2 : midY * Math.max(0.3, sp.opacity);
          ctx.fillStyle = `rgba(${r},${g},${b},${isNeutral ? "0.15" : sp.opacity.toFixed(2)})`;
          ctx.beginPath();
          ctx.roundRect(x, midY - halfH, w, halfH * 2, 2);
          ctx.fill();
        }
      }
    }
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    ctx.fillRect(0, midY - 0.5, W, 1);
    if (onSeek && currentTimeSec > 0 && currentTimeSec <= durationSec) {
      const px = (currentTimeSec / durationSec) * W;
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(px - 1, 0, 2, H);
    }
  }, [normAmps, spans, spanAt, durationSec, height, currentTimeSec, barPx, tapeWidthPx, onSeek, interval]);

  useEffect(() => {
    const canvas = laneCanvasRef.current;
    if (!canvas || activeEmotions.length === 0) return;
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const W = tapeWidthPx;
    const H = laneHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    for (let ei = 0; ei < activeEmotions.length; ei++) {
      const emoKey = activeEmotions[ei]!;
      const laneY = ei * (LANE_H + LANE_GAP);
      const [r, g, b] = hexRgb(EMOTION_COLOR[emoKey] ?? "#9ca3af");
      if (hasAmps && normAmps?.length) {
        for (let i = 0; i < normAmps.length; i++) {
          const t = i * interval;
          const span = spanAt(t);
          let prob = 0;
          if (span?.probs) {
            const found = span.probs.find((p) => p.emotion === emoKey);
            prob = found?.probability ?? 0;
          } else if (span?.label === emoKey) {
            prob = span.confidence;
          }
          if (prob < 0.05) continue;
          const x = i * barPx;
          const bw = Math.max(1, barPx - GAP_PX);
          ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, prob * 1.5).toFixed(2)})`;
          ctx.fillRect(x, laneY, bw, LANE_H);
        }
      } else {
        for (const sp of spans) {
          let prob = 0;
          if (sp.probs) {
            const found = sp.probs.find((p) => p.emotion === emoKey);
            prob = found?.probability ?? 0;
          } else if (sp.label === emoKey) {
            prob = sp.confidence;
          }
          if (prob < 0.05) continue;
          const x = (sp.start / durationSec) * W;
          const w = Math.max(1, ((sp.end - sp.start) / durationSec) * W);
          ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, prob * 1.5).toFixed(2)})`;
          ctx.fillRect(x, laneY, w, LANE_H);
        }
      }
    }
  }, [activeEmotions, normAmps, spans, spanAt, durationSec, barPx, tapeWidthPx, hasAmps, interval, laneHeight]);

  useEffect(() => {
    if (!hasAmps) return;
    const len = amps!.length;
    if (len <= prevAmpsLenRef.current) { prevAmpsLenRef.current = len; return; }
    prevAmpsLenRef.current = len;
    if (userScrolledRef.current) return;
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });
  }, [hasAmps, amps?.length, tapeWidthPx]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 10;
      userScrolledRef.current = !atRight;
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const ticks = useMemo(() => {
    const out: number[] = [];
    const dur = Math.max(totalDurSec, 5);
    const step = Math.max(5, Math.round((dur <= 60 ? 15 : dur <= 180 ? 30 : 60) / zoom));
    for (let t = 0; t <= dur; t += step) out.push(t);
    return out;
  }, [totalDurSec, zoom]);

  const usedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const sp of spans) {
      if (sp.label && sp.label !== "—" && sp.label !== "NEUTRAL") s.add(sp.label.toUpperCase());
      if (sp.probs) for (const p of sp.probs) if (p.emotion !== "NEUTRAL" && p.probability > 0.1) s.add(p.emotion);
    }
    return LEGEND.filter((l) => s.has(l.key));
  }, [spans]);

  const pxToTime = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    return pct * totalDurSec;
  }, [totalDurSec]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek || isDragging.current) return;
    onSeek(pxToTime(e.clientX));
  }, [onSeek, pxToTime]);

  const handleHover = useCallback((e: React.MouseEvent) => {
    const t = pxToTime(e.clientX);
    const sp = spanAt(t);
    setTip({ x: e.clientX, y: e.clientY, label: sp?.label ?? "—", conf: sp?.confidence ?? 0, t, probs: sp?.probs });
  }, [pxToTime, spanAt]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    isDragging.current = false;
    dragStart.current = { x: e.clientX, sl: el.scrollLeft };
    const move = (ev: MouseEvent) => { const dx = ev.clientX - dragStart.current.x; if (Math.abs(dx) > 3) isDragging.current = true; el.scrollLeft = dragStart.current.sl - dx; };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); setTimeout(() => { isDragging.current = false; }, 0); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => { if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollLeft += e.deltaY; } };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  if (filtered.length === 0 && !hasAmps) return null;
  if (durationSec <= 0 && !hasAmps) return null;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        style={{ width: "100%", overflowX: "auto", overflowY: "hidden", borderRadius: 6, paddingBottom: 1, scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.12) transparent" }}
      >
        <div style={{ position: "relative", width: tapeWidthPx }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            width: tapeWidthPx,
            marginBottom: 2,
            fontSize: 9,
            fontWeight: 500,
            color: "#b0b8c4",
            userSelect: "none",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.02em",
          }}>
            {ticks.map((t) => <span key={t}>{formatTime(t)}</span>)}
          </div>
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            onMouseMove={handleHover}
            onMouseLeave={() => setTip(null)}
            style={{
              display: "block",
              height,
              borderRadius: 6,
              background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
              cursor: onSeek ? "pointer" : "default",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.03)",
            }}
          />
          {activeEmotions.length > 0 && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, marginTop: 3 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: LANE_GAP, flexShrink: 0, paddingRight: 4 }}>
                {activeEmotions.map((emo) => (
                  <div key={emo} style={{ height: LANE_H, display: "flex", alignItems: "center" }}>
                    <span style={{
                      fontSize: 7,
                      fontWeight: 600,
                      color: EMOTION_COLOR[emo],
                      lineHeight: 1,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      opacity: 0.85,
                    }}>
                      {emo.slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
              <canvas
                ref={laneCanvasRef}
                onClick={handleClick}
                onMouseMove={handleHover}
                onMouseLeave={() => setTip(null)}
                style={{
                  display: "block",
                  height: laneHeight,
                  borderRadius: 4,
                  background: "rgba(0,0,0,0.015)",
                  cursor: onSeek ? "pointer" : "default",
                }}
              />
            </div>
          )}
          {onSeek && currentTimeSec > 0 && currentTimeSec <= durationSec && (
            <div style={{
              position: "absolute",
              left: (currentTimeSec / totalDurSec) * tapeWidthPx,
              top: 16 + height / 2,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#0f172a",
              border: "2px solid #fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              pointerEvents: "none",
              transform: "translate(-50%, -50%)",
            }} />
          )}
        </div>
      </div>

      {tip && (
        <div style={{
          position: "fixed",
          left: tip.x,
          top: tip.y - 8,
          transform: "translate(-50%, -100%)",
          background: "#0f172a",
          color: "#f1f5f9",
          fontSize: 11,
          fontWeight: 500,
          padding: "5px 10px",
          borderRadius: 6,
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 9999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          lineHeight: 1.5,
        }}>
          <div style={{ marginBottom: tip.probs?.length ? 3 : 0 }}>
            <b>{tip.label}</b> <span style={{ opacity: 0.6 }}>({Math.round(tip.conf * 100)}%)</span>
            <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>{formatTime(tip.t)}
          </div>
          {tip.probs && tip.probs.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tip.probs.filter((p) => p.probability > 0.05).map((p) => (
                <span key={p.emotion} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, opacity: 0.8 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 1, background: EMOTION_COLOR[p.emotion] ?? "#9ca3af" }} />
                  {Math.round(p.probability * 100)}%
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3, gap: 8 }}>
        {usedKeys.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {usedKeys.map((l) => (
              <span key={l.key} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, color: "#94a3b8", whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: l.color }} /> {l.label}
              </span>
            ))}
          </div>
        ) : <div />}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))} disabled={zoom <= MIN_ZOOM} style={{ width: 16, height: 16, borderRadius: 3, border: "1px solid #e5e7eb", background: zoom <= MIN_ZOOM ? "#f8fafc" : "#fff", color: zoom <= MIN_ZOOM ? "#d1d5db" : "#94a3b8", fontSize: 11, fontWeight: 700, cursor: zoom <= MIN_ZOOM ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>−</button>
          <span style={{ fontSize: 8, color: "#94a3b8", minWidth: 18, textAlign: "center", fontVariantNumeric: "tabular-nums", userSelect: "none" }}>{zoom}×</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))} disabled={zoom >= MAX_ZOOM} style={{ width: 16, height: 16, borderRadius: 3, border: "1px solid #e5e7eb", background: zoom >= MAX_ZOOM ? "#f8fafc" : "#fff", color: zoom >= MAX_ZOOM ? "#d1d5db" : "#94a3b8", fontSize: 11, fontWeight: 700, cursor: zoom >= MAX_ZOOM ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>+</button>
        </div>
      </div>
    </div>
  );
}

/** Keyword bag: collects extracted entities as tags for a channel */
export function KeywordBag({ entries, label }: { entries: TranscriptEntry[]; label: string }) {
  const keywords = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (!e.is_final && !e._promoted) continue;
      const ents = e.metadata?.entities;
      if (ents?.length) {
        for (const ent of ents) {
          const kw = (ent.text || "").trim();
          if (kw && kw.length > 1) set.add(kw.toLowerCase());
        }
      }
    }
    return [...set].sort();
  }, [entries]);

  if (keywords.length === 0) return null;

  return (
    <div style={{ marginTop: 2 }}>
      <div style={{
        fontSize: 9,
        fontWeight: 600,
        color: "#94a3b8",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {keywords.map((kw) => (
          <span key={kw} style={{
            display: "inline-block",
            padding: "2px 7px",
            fontSize: 10,
            fontWeight: 500,
            color: "#475569",
            background: "#f1f5f9",
            borderRadius: 3,
            border: "1px solid #e2e8f0",
            lineHeight: 1.4,
          }}>
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}

function TranscriptBubble({ entry }: { entry: TranscriptEntry }) {
  const isYou = entry.channel === "mic";
  const isPartial = entry.is_final === false && !entry._promoted;
  const emotionColor = getEmotionColor(entry.metadata?.emotion);
  const hasEmotion = !!entry.metadata?.emotion && entry.metadata.emotion.toUpperCase() !== "NEUTRAL";
  const intent = entry.metadata?.intent;
  const hasIntent = !!intent && intent !== "NEUTRAL" && intent !== "ACKNOWLEDGE";
  const hasAgendaHL = (entry.agendaHighlights?.length ?? 0) > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isYou ? "flex-start" : "flex-end",
        gap: 2,
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          padding: "6px 10px",
          borderRadius: 10,
          background: isYou ? "var(--la-primary, #124e3f)" : "#8b5cf6",
          color: "white",
          fontSize: 12,
          lineHeight: 1.45,
          ...(isYou ? { borderBottomLeftRadius: 3 } : { borderBottomRightRadius: 3 }),
          ...(hasAgendaHL
            ? { borderLeft: "3px solid #22c55e" }
            : hasEmotion ? { borderLeft: `3px solid ${emotionColor}` } : {}),
        }}
      >
        <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 1, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {isYou ? "You" : "Other"}
        </div>
        <span
          style={{
            opacity: isPartial ? 0.85 : 1,
            fontStyle: isPartial ? "italic" : "normal",
          }}
        >
          {entry.text}
        </span>
        {hasAgendaHL && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
            {entry.agendaHighlights!.map((h) => (
              <span
                key={h.itemId}
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  color: "#22c55e",
                  background: "rgba(34,197,94,0.15)",
                  padding: "1px 5px",
                  borderRadius: 3,
                  whiteSpace: "nowrap",
                }}
              >
                ● {h.itemTitle} +{h.confidenceDelta}%
              </span>
            ))}
          </div>
        )}
      </div>
      {hasIntent && (
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          padding: "1px 6px",
          fontSize: 9,
          fontWeight: 500,
          color: getIntentColor(intent),
          background: `${getIntentColor(intent)}10`,
          border: `1px solid ${getIntentColor(intent)}25`,
          borderRadius: 3,
          marginLeft: isYou ? 4 : 0,
          marginRight: isYou ? 0 : 4,
          lineHeight: 1.5,
        }}>
          <span style={{
            width: 4,
            height: 4,
            borderRadius: 1,
            background: getIntentColor(intent),
            opacity: 0.7,
          }} />
          {formatIntentLabel(intent!)}
        </span>
      )}
    </div>
  );
}
