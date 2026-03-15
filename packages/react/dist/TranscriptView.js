import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useEffect, useState, useMemo } from "react";
const EMOTION_COLOR = {
    HAPPY: "#22c55e",
    SAD: "#3b82f6",
    ANGRY: "#ef4444",
    NEUTRAL: "#94a3b8",
    CURIOUS: "#8b5cf6",
    FRUSTRATED: "#f59e0b",
    FEAR: "#6366f1",
    SURPRISE: "#f97316",
    DISGUST: "#14b8a6",
};
function getEmotionColor(emotion) {
    if (!emotion)
        return "#cbd5e1";
    return EMOTION_COLOR[String(emotion).toUpperCase()] ?? "#cbd5e1";
}
const LEGEND = [
    { key: "HAPPY", label: "Happy", color: "#22c55e" },
    { key: "SAD", label: "Sad", color: "#3b82f6" },
    { key: "ANGRY", label: "Angry", color: "#ef4444" },
    { key: "NEUTRAL", label: "Neutral", color: "#94a3b8" },
    { key: "CURIOUS", label: "Curious", color: "#8b5cf6" },
    { key: "FRUSTRATED", label: "Frustrated", color: "#f59e0b" },
];
export function TranscriptView({ entries, maxHeight = 300, showTimeline = false, durationSec, currentTimeSec = 0, onSeek, }) {
    const scrollRef = useRef(null);
    const [tab, setTab] = useState("all");
    useEffect(() => {
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        });
    }, [entries.length, entries[entries.length - 1]?.text]);
    const filtered = tab === "all" ? entries : entries.filter((e) => e.channel === tab);
    const effectiveDuration = durationSec ??
        (entries.length
            ? Math.max(...entries.map((e) => (e.audioOffset ?? 0) + 3), 10)
            : 10);
    return (_jsxs("div", { children: [showTimeline && filtered.length > 0 && (_jsx(EmotionTimelineBar, { entries: filtered, durationSec: effectiveDuration, currentTimeSec: currentTimeSec, onSeek: onSeek })), _jsx("div", { style: { display: "flex", gap: 4, marginBottom: 8, borderBottom: "1px solid var(--la-border, #e5e7eb)", paddingBottom: 4 }, children: ["all", "mic", "tab"].map((t) => (_jsx("button", { type: "button", onClick: () => setTab(t), style: {
                        padding: "4px 10px",
                        fontSize: 11,
                        fontWeight: tab === t ? 700 : 400,
                        background: tab === t ? "var(--la-primary, #124e3f)" : "transparent",
                        color: tab === t ? "#fff" : "#666",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        textTransform: "uppercase",
                    }, children: t === "all" ? "All" : t === "mic" ? "You" : "Other" }, t))) }), _jsxs("div", { ref: scrollRef, style: { maxHeight, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }, children: [filtered.length === 0 && (_jsx("div", { style: { color: "#9ca3af", fontSize: 13, padding: 24, textAlign: "center" }, children: "No transcript yet" })), filtered.map((entry, i) => (_jsx(TranscriptBubble, { entry: entry }, entry._id ?? `t-${i}`)))] })] }));
}
function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}
function EmotionTimelineBar({ entries, durationSec, currentTimeSec = 0, onSeek, }) {
    const filtered = entries.filter((e) => (e.text || "").trim().length > 0);
    if (filtered.length === 0 || durationSec <= 0)
        return null;
    const isMonotonic = filtered.every((e, i) => {
        const off = e.audioOffset;
        if (off == null)
            return false;
        const prev = i > 0 ? filtered[i - 1].audioOffset : -1;
        return prev == null || off >= prev;
    });
    const segments = filtered.map((e, i) => {
        let start;
        let end;
        if (isMonotonic && e.audioOffset != null) {
            start = e.audioOffset;
            end = i < filtered.length - 1 && filtered[i + 1].audioOffset != null
                ? filtered[i + 1].audioOffset
                : durationSec;
        }
        else {
            start = (i / filtered.length) * durationSec;
            end = ((i + 1) / filtered.length) * durationSec;
        }
        end = Math.max(start, end);
        if (end <= start) {
            start = (i / filtered.length) * durationSec;
            end = ((i + 1) / filtered.length) * durationSec;
        }
        return { start, end, color: getEmotionColor(e.metadata?.emotion), entry: e };
    });
    const rawWidths = segments.map((s) => Math.max(2, ((s.end - s.start) / durationSec) * 100));
    const total = rawWidths.reduce((a, b) => a + b, 0);
    const scale = total > 100 ? 100 / total : 1;
    const rulerTicks = [];
    const step = durationSec <= 60 ? 15 : durationSec <= 180 ? 30 : 60;
    for (let t = 0; t <= durationSec; t += step)
        rulerTicks.push(t);
    if (rulerTicks[rulerTicks.length - 1] !== durationSec)
        rulerTicks.push(durationSec);
    const usedEmotions = useMemo(() => {
        const set = new Set();
        for (const e of filtered) {
            const em = e.metadata?.emotion;
            if (em)
                set.add(em.toUpperCase());
        }
        return LEGEND.filter((l) => set.has(l.key));
    }, [filtered]);
    const handleClick = (ev) => {
        if (!onSeek)
            return;
        const rect = ev.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        onSeek(pct * durationSec);
    };
    return (_jsxs("div", { style: { marginBottom: 8 }, children: [_jsx("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginBottom: 3, fontVariantNumeric: "tabular-nums" }, children: rulerTicks.map((t) => (_jsx("span", { children: formatTime(t) }, t))) }), _jsxs("div", { style: { position: "relative" }, children: [_jsx("div", { role: onSeek ? "slider" : "img", "aria-label": "Timeline by emotion", onClick: onSeek ? handleClick : undefined, style: {
                            display: "flex",
                            width: "100%",
                            height: 14,
                            borderRadius: 6,
                            overflow: "hidden",
                            background: "#e2e8f0",
                            cursor: onSeek ? "pointer" : "default",
                            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
                        }, children: segments.map((s, i) => {
                            const widthPct = rawWidths[i] * scale;
                            return (_jsx("div", { title: `${s.entry.metadata?.emotion ?? "—"} | ${s.entry.metadata?.intent ?? "—"} | ${formatTime(s.start)}–${formatTime(s.end)} | ${(s.entry.text || "").slice(0, 40)}${(s.entry.text || "").length > 40 ? "…" : ""}`, style: {
                                    width: `${widthPct}%`,
                                    minWidth: 2,
                                    background: s.color,
                                    borderRight: i < segments.length - 1 ? "1px solid rgba(255,255,255,0.3)" : "none",
                                } }, i));
                        }) }), currentTimeSec >= 0 && currentTimeSec <= durationSec && (_jsxs(_Fragment, { children: [_jsx("div", { "aria-hidden": true, style: {
                                    position: "absolute",
                                    top: -2,
                                    left: `${(currentTimeSec / durationSec) * 100}%`,
                                    width: 2,
                                    height: 18,
                                    background: "#1e293b",
                                    borderRadius: 1,
                                    transform: "translateX(-50%)",
                                    pointerEvents: "none",
                                } }), onSeek && (_jsx("div", { "aria-hidden": true, style: {
                                    position: "absolute",
                                    top: 7,
                                    left: `${(currentTimeSec / durationSec) * 100}%`,
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: "#1e293b",
                                    border: "2px solid #fff",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                                    transform: "translate(-50%, -50%)",
                                    pointerEvents: "none",
                                } }))] }))] }), usedEmotions.length > 0 && (_jsx("div", { style: { display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }, children: usedEmotions.map((l) => (_jsxs("span", { style: { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#9ca3af" }, children: [_jsx("span", { style: { width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 } }), l.label] }, l.key))) }))] }));
}
function TranscriptBubble({ entry }) {
    const isYou = entry.channel === "mic";
    const isPartial = entry.is_final === false && !entry._promoted;
    const emotionColor = getEmotionColor(entry.metadata?.emotion);
    const hasEmotion = !!entry.metadata?.emotion && entry.metadata.emotion.toUpperCase() !== "NEUTRAL";
    return (_jsx("div", { style: {
            display: "flex",
            justifyContent: isYou ? "flex-start" : "flex-end",
        }, children: _jsxs("div", { style: {
                maxWidth: "75%",
                padding: "8px 12px",
                borderRadius: 12,
                background: isYou ? "var(--la-primary, #124e3f)" : "#8b5cf6",
                color: "white",
                fontSize: 13,
                lineHeight: 1.4,
                ...(isYou ? { borderBottomLeftRadius: 4 } : { borderBottomRightRadius: 4 }),
                ...(hasEmotion ? { borderLeft: `3px solid ${emotionColor}` } : {}),
            }, children: [_jsx("div", { style: { fontSize: 10, fontWeight: 600, marginBottom: 2, opacity: 0.9 }, children: isYou ? "You" : "Other" }), _jsx("span", { style: {
                        opacity: isPartial ? 0.85 : 1,
                        fontStyle: isPartial ? "italic" : "normal",
                    }, children: entry.text })] }) }));
}
//# sourceMappingURL=TranscriptView.js.map