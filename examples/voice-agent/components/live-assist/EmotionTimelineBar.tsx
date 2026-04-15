import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMOTION_COLORS, getEmotionTimelineColor } from "../../lib/transcriptEmotion";
import type { TranscriptEntry } from "../../lib/liveAssistTypes";

/** Opaque scroll-sync group — create one via `createScrollSyncGroup()` and pass to sibling bars. */
export type ScrollSyncGroup = {
  _containers: Set<HTMLDivElement>;
  _syncing: boolean;
};

export function createScrollSyncGroup(): ScrollSyncGroup {
  return { _containers: new Set(), _syncing: false };
}

export interface EmotionTimelineBarProps {
  entries: TranscriptEntry[];
  durationSec: number;
  currentTimeSec?: number;
  onSeek?: (sec: number) => void;
  height?: number;
  amplitudes?: number[];
  audioAmplitudes?: number[];
  amplitudeIntervalSec?: number;
  /** When true, horizontal scroll follows the playhead during playback (within the bar’s scroll container). */
  isPlaying?: boolean;
  /** Pass a shared ScrollSyncGroup to synchronize horizontal scrolling across sibling bars. */
  scrollSyncGroup?: ScrollSyncGroup;
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
const LANE_H = 3;
const LANE_GAP = 1;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

const NON_NEUTRAL_EMOTIONS = Object.keys(EMOTION_COLORS).filter((k) => k !== "NEUTRAL");

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function blendColors(probs: { emotion: string; probability: number }[]): { r: number; g: number; b: number; alpha: number } {
  let rr = 0;
  let gg = 0;
  let bb = 0;
  let total = 0;
  for (const p of probs) {
    const hex = EMOTION_COLORS[p.emotion];
    if (!hex) continue;
    const [r, g, b] = hexRgb(hex);
    rr += r * p.probability;
    gg += g * p.probability;
    bb += b * p.probability;
    total += p.probability;
  }
  if (total < 0.05) return { r: 156, g: 163, b: 175, alpha: 0.15 };
  return { r: rr / total, g: gg / total, b: bb / total, alpha: Math.min(1, 0.35 + total * 0.75) };
}

const LEGEND: Array<{ key: string; label: string; color: string }> = Object.entries(EMOTION_COLORS).map(([k, c]) => ({
  key: k,
  label: k.charAt(0) + k.slice(1).toLowerCase(),
  color: c,
}));

export function EmotionTimelineBar({
  entries,
  durationSec,
  currentTimeSec = 0,
  onSeek,
  height = 24,
  amplitudes,
  audioAmplitudes,
  amplitudeIntervalSec,
  isPlaying = false,
  scrollSyncGroup,
}: EmotionTimelineBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laneCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    label: string;
    conf: number;
    t: number;
    probs?: { emotion: string; probability: number }[];
  } | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, sl: 0 });
  const userScrolledRef = useRef(false);
  const prevAmpsLenRef = useRef(0);

  const filtered = useMemo(() => entries.filter((e) => (e.text || "").trim()), [entries]);
  const amps = amplitudes ?? audioAmplitudes;
  const interval = amplitudeIntervalSec ?? CHUNK_SEC;
  const hasAmps = amps != null && amps.length > 0;

  const spans = useMemo<EmotionSpan[]>(() => {
    const out: EmotionSpan[] = [];
    if (filtered.length === 0) return out;

    let prevOff = -1;
    let monotonic = true;
    let allZero = true;
    for (const e of filtered) {
      if (e.audioOffset == null || e.audioOffset < prevOff) {
        monotonic = false;
        break;
      }
      if (e.audioOffset > 0) allZero = false;
      prevOff = e.audioOffset;
    }
    const useOffsets = monotonic && !allZero;

    for (let i = 0; i < filtered.length; i++) {
      const e = filtered[i]!;
      const s = useOffsets && e.audioOffset != null ? e.audioOffset : (i / filtered.length) * durationSec;
      const end =
        useOffsets && i < filtered.length - 1 && filtered[i + 1]!.audioOffset != null
          ? filtered[i + 1]!.audioOffset!
          : ((i + 1) / filtered.length) * durationSec;
      const tl = e.metadata?.emotionTimeline;
      if (tl?.length) {
        for (let j = 0; j < tl.length; j++) {
          const pt = tl[j]!;
          const ps = s + pt.offset;
          const pe = j < tl.length - 1 ? s + tl[j + 1]!.offset : end;
          const c = pt.confidence ?? 0;
          out.push({
            start: ps,
            end: Math.max(ps + 0.01, pe),
            color: getEmotionTimelineColor(pt.emotion),
            opacity: 0.3 + 0.7 * c,
            label: pt.emotion ?? "—",
            confidence: c,
            probs: pt.probs,
          });
        }
      } else {
        const c = e.metadata?.emotionConfidence ?? 0;
        const ep = e.metadata?.emotionProbs;
        out.push({
          start: s,
          end: Math.max(s + 0.01, end),
          color: getEmotionTimelineColor(e.metadata?.emotion),
          opacity: 0.3 + 0.7 * c,
          label: e.metadata?.emotion ?? "—",
          confidence: c,
          probs: ep?.length ? ep : undefined,
        });
      }
    }
    return out;
  }, [filtered, durationSec]);

  const spanAt = useCallback(
    (t: number): EmotionSpan | null => {
      for (let i = spans.length - 1; i >= 0; i--) {
        if (spans[i]!.start <= t && spans[i]!.end > t) return spans[i]!;
      }
      return null;
    },
    [spans],
  );

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
  const tapeWidthPx = hasAmps ? Math.max(200, (normAmps?.length ?? 0) * barPx) : Math.max(200, durationSec * 6 * zoom);
  const totalDurSec = hasAmps ? amps!.length * interval : durationSec;
  const playheadDur = totalDurSec > 0 ? totalDurSec : durationSec;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
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
          const alpha = isNeutral
            ? Math.max(0.08, 0.12 + amp * 0.15)
            : Math.max(0.3, span.opacity * (0.5 + amp * 0.5));
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
        const isNeutral = sp.label === "NEUTRAL";

        if (sp.probs && sp.probs.length > 0) {
          const bc = blendColors(sp.probs);
          const halfH = midY * Math.max(0.25, bc.alpha);
          ctx.fillStyle = `rgba(${Math.round(bc.r)},${Math.round(bc.g)},${Math.round(bc.b)},${bc.alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.roundRect(x, midY - halfH, w, halfH * 2, 2);
          ctx.fill();
        } else {
          const [r, g, b] = hexRgb(sp.color);
          const halfH = isNeutral ? midY * 0.2 : midY * Math.max(0.3, sp.opacity);
          ctx.fillStyle = `rgba(${r},${g},${b},${isNeutral ? "0.15" : sp.opacity.toFixed(2)})`;
          ctx.beginPath();
          ctx.roundRect(x, midY - halfH, w, halfH * 2, 2);
          ctx.fill();
        }
      }
    }

    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, midY - 0.5, W, 1);

    if (onSeek && playheadDur > 0 && currentTimeSec > 0 && currentTimeSec <= playheadDur) {
      const px = (currentTimeSec / playheadDur) * W;
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--color-text").trim() || "#1e293b";
      ctx.fillRect(px - 1, 0, 2, H);
    }
  }, [
    normAmps,
    spans,
    spanAt,
    durationSec,
    height,
    currentTimeSec,
    barPx,
    tapeWidthPx,
    onSeek,
    interval,
    playheadDur,
  ]);

  useEffect(() => {
    const canvas = laneCanvasRef.current;
    if (!canvas || activeEmotions.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
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
      const [r, g, b] = hexRgb(EMOTION_COLORS[emoKey] ?? "#9ca3af");

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
    if (len <= prevAmpsLenRef.current) {
      prevAmpsLenRef.current = len;
      return;
    }
    prevAmpsLenRef.current = len;
    if (userScrolledRef.current) return;
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });
  }, [hasAmps, amps?.length, tapeWidthPx]);

  // Register/unregister this scroll container with the sync group
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollSyncGroup) return;
    scrollSyncGroup._containers.add(el);
    return () => { scrollSyncGroup._containers.delete(el); };
  }, [scrollSyncGroup]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 10;
      userScrolledRef.current = !atRight;
      // Sync siblings imperatively (no state updates)
      if (scrollSyncGroup && !scrollSyncGroup._syncing) {
        scrollSyncGroup._syncing = true;
        for (const sibling of scrollSyncGroup._containers) {
          if (sibling !== el) sibling.scrollLeft = el.scrollLeft;
        }
        scrollSyncGroup._syncing = false;
      }
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [scrollSyncGroup]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    const dur = Math.max(totalDurSec, 5);
    const step = Math.max(5, Math.round((dur <= 60 ? 15 : dur <= 180 ? 30 : 60) / zoom));
    for (let t = 0; t <= dur; t += step) out.push(t);
    return out;
  }, [totalDurSec, zoom]);

  /** Keep playhead in view while audio is playing (scroll container only; does not widen the page). */
  useEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const dur = playheadDur;
    if (dur <= 0) return;
    const ratio = Math.min(1, Math.max(0, currentTimeSec / dur));
    const playheadPx = ratio * el.scrollWidth;
    const target = playheadPx - el.clientWidth * 0.35;
    requestAnimationFrame(() => {
      const box = scrollRef.current;
      if (!box) return;
      box.scrollLeft = Math.max(0, Math.min(target, box.scrollWidth - box.clientWidth));
    });
  }, [currentTimeSec, isPlaying, playheadDur, tapeWidthPx, zoom]);

  /** Scroll to playhead on seek (large jump) even when not playing. */
  const prevTimeRef = useRef(currentTimeSec);
  useEffect(() => {
    const prev = prevTimeRef.current;
    prevTimeRef.current = currentTimeSec;
    if (isPlaying) return; // handled by the auto-scroll above
    const delta = Math.abs(currentTimeSec - prev);
    if (delta < 0.5) return; // ignore tiny updates
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const dur = playheadDur;
    if (dur <= 0) return;
    const ratio = Math.min(1, Math.max(0, currentTimeSec / dur));
    const playheadPx = ratio * el.scrollWidth;
    const target = playheadPx - el.clientWidth * 0.4;
    requestAnimationFrame(() => {
      const box = scrollRef.current;
      if (!box) return;
      box.scrollTo({ left: Math.max(0, Math.min(target, box.scrollWidth - box.clientWidth)), behavior: "smooth" });
    });
  }, [currentTimeSec, isPlaying, playheadDur]);

  const usedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const sp of spans) {
      if (sp.label && sp.label !== "—" && sp.label !== "NEUTRAL") s.add(sp.label.toUpperCase());
      if (sp.probs) for (const p of sp.probs) if (p.emotion !== "NEUTRAL" && p.probability > 0.1) s.add(p.emotion);
    }
    return LEGEND.filter((l) => s.has(l.key));
  }, [spans]);

  const pxToTime = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      return pct * totalDurSec;
    },
    [totalDurSec],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeek || isDragging.current) return;
      onSeek(pxToTime(e.clientX));
    },
    [onSeek, pxToTime],
  );

  const handleHover = useCallback(
    (e: React.MouseEvent) => {
      const t = pxToTime(e.clientX);
      const sp = spanAt(t);
      setTip({ x: e.clientX, y: e.clientY, label: sp?.label ?? "—", conf: sp?.confidence ?? 0, t, probs: sp?.probs });
    },
    [pxToTime, spanAt],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    isDragging.current = false;
    dragStart.current = { x: e.clientX, sl: el.scrollLeft };
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStart.current.x;
      if (Math.abs(dx) > 3) isDragging.current = true;
      el.scrollLeft = dragStart.current.sl - dx;
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      setTimeout(() => { isDragging.current = false; }, 0);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  if (filtered.length === 0 && !hasAmps) return null;
  if (durationSec <= 0 && !hasAmps) return null;

  return (
    <div
      className="emotion-timeline-bar-root"
      style={{
        position: "relative",
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          overflowX: "auto",
          overflowY: "hidden",
          borderRadius: 6,
          paddingBottom: 1,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(0,0,0,0.15) transparent",
        }}
      >
        <div style={{ position: "relative", width: tapeWidthPx }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              width: tapeWidthPx,
              marginBottom: 3,
              fontSize: 10,
              fontWeight: 500,
              color: "var(--color-text-dim, var(--text-muted, #64748b))",
              userSelect: "none",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ticks.map((t) => (
              <span key={t}>{fmt(t)}</span>
            ))}
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
              background: "var(--color-surface-raised, var(--bg-soft, #f1f5f9))",
              cursor: onSeek ? "pointer" : "default",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
            }}
          />
          {activeEmotions.length > 0 && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, marginTop: 2 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: LANE_GAP, flexShrink: 0, paddingRight: 4 }}>
                {activeEmotions.map((emo) => (
                  <div key={emo} style={{ height: LANE_H, display: "flex", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 7,
                        fontWeight: 600,
                        color: EMOTION_COLORS[emo],
                        lineHeight: 1,
                        letterSpacing: "0.02em",
                        textTransform: "uppercase",
                        opacity: 0.8,
                      }}
                    >
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
                  borderRadius: 3,
                  background: "rgba(0,0,0,0.02)",
                  cursor: onSeek ? "pointer" : "default",
                }}
              />
            </div>
          )}
          {onSeek && playheadDur > 0 && currentTimeSec > 0 && currentTimeSec <= playheadDur && (
            <div
              style={{
                position: "absolute",
                left: (currentTimeSec / playheadDur) * tapeWidthPx,
                top: 16 + height / 2,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--color-text, #1e293b)",
                border: "2px solid var(--color-bg, #fff)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                pointerEvents: "none",
                transform: "translate(-50%, -50%)",
              }}
            />
          )}
        </div>
      </div>

      {tip && (
        <div
          style={{
            position: "fixed",
            left: tip.x,
            top: tip.y - 8,
            transform: "translate(-50%, -100%)",
            background: "var(--color-text, #1e293b)",
            color: "var(--color-bg, #f8fafc)",
            fontSize: 11,
            fontWeight: 500,
            padding: "5px 10px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 9999,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            lineHeight: 1.5,
          }}
        >
          <div style={{ marginBottom: tip.probs?.length ? 3 : 0 }}>
            <b>{tip.label}</b> <span style={{ opacity: 0.7 }}>({Math.round(tip.conf * 100)}%)</span>
            <span style={{ opacity: 0.5, margin: "0 4px" }}>|</span>
            {fmt(tip.t)}
          </div>
          {tip.probs && tip.probs.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tip.probs
                .filter((p) => p.probability > 0.05)
                .map((p) => (
                  <span
                    key={p.emotion}
                    style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, opacity: 0.8 }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 1,
                        background: EMOTION_COLORS[p.emotion] ?? "#9ca3af",
                      }}
                    />
                    {Math.round(p.probability * 100)}%
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 4,
          gap: 8,
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        {usedKeys.length > 0 ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            {usedKeys.map((l) => (
              <span
                key={l.key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 10,
                  color: "var(--color-text-dim, var(--text-muted, #64748b))",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 2, background: l.color }} /> {l.label}
              </span>
            ))}
          </div>
        ) : (
          <div />
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
            disabled={zoom <= MIN_ZOOM}
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              border: "1px solid var(--color-border, var(--stroke, #e2e8f0))",
              background: zoom <= MIN_ZOOM ? "var(--color-surface-raised, var(--bg-soft))" : "var(--color-bg, var(--bg-white, #fff))",
              color: zoom <= MIN_ZOOM ? "#ccc" : "var(--color-text-dim, var(--text-muted))",
              fontSize: 12,
              fontWeight: 700,
              cursor: zoom <= MIN_ZOOM ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            −
          </button>
          <span
            style={{
              fontSize: 9,
              color: "var(--color-text-dim, var(--text-muted))",
              minWidth: 20,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
            }}
          >
            {zoom}×
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
            disabled={zoom >= MAX_ZOOM}
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              border: "1px solid var(--color-border, var(--stroke, #e2e8f0))",
              background: zoom >= MAX_ZOOM ? "var(--color-surface-raised, var(--bg-soft))" : "var(--color-bg, var(--bg-white, #fff))",
              color: zoom >= MAX_ZOOM ? "#ccc" : "var(--color-text-dim, var(--text-muted))",
              fontSize: 12,
              fontWeight: 700,
              cursor: zoom >= MAX_ZOOM ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
