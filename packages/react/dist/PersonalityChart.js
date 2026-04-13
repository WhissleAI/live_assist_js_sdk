import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { EMOTION_KEYS, EMOTION_EMOJI, EMOTION_COLORS, getDominantEmotion, getMoodTag, intentDisplayLabel, } from "@whissle/live-assist-core";
export function getProfileSegments(profile) {
    const total = EMOTION_KEYS.reduce((s, k) => s + (profile.emotionProfile[k] ?? 0), 0) || 1;
    return EMOTION_KEYS.map((key) => ({ key, value: (profile.emotionProfile[key] ?? 0) / total })).filter((s) => s.value > 0.01);
}
export function EmotionDonut({ segments, size = 80, centerEmoji = true }) {
    const cx = size / 2, cy = size / 2, outer = size / 2 - 2, inner = outer * 0.5;
    let acc = 0;
    const paths = [];
    for (const seg of segments) {
        const startAngle = (acc * 360 - 90) * (Math.PI / 180);
        acc += seg.value;
        const endAngle = (acc * 360 - 90) * (Math.PI / 180);
        const x1 = cx + outer * Math.cos(startAngle), y1 = cy + outer * Math.sin(startAngle);
        const x2 = cx + outer * Math.cos(endAngle), y2 = cy + outer * Math.sin(endAngle);
        const x3 = cx + inner * Math.cos(endAngle), y3 = cy + inner * Math.sin(endAngle);
        const x4 = cx + inner * Math.cos(startAngle), y4 = cy + inner * Math.sin(startAngle);
        const large = seg.value > 0.5 ? 1 : 0;
        paths.push({ d: `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`, fill: EMOTION_COLORS[seg.key] ?? "#9ca3af" });
    }
    const dominant = segments.length ? segments.reduce((a, b) => (a.value >= b.value ? a : b)).key : "NEUTRAL";
    const fontSize = size <= 60 ? 16 : size <= 100 ? 24 : 32;
    return (_jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, children: [paths.map((p, i) => _jsx("path", { d: p.d, fill: p.fill, stroke: "rgba(255,255,255,0.5)", strokeWidth: "0.5", style: { transition: "d 0.4s ease" } }, i)), _jsx("circle", { cx: cx, cy: cy, r: inner - 2, fill: "var(--la-bg, white)" }), centerEmoji && _jsx("text", { x: cx, y: cy + fontSize * 0.35, textAnchor: "middle", fontSize: fontSize, children: EMOTION_EMOJI[dominant] ?? "😐" })] }));
}
const INTENT_COLORS = {
    INFORM: "#22c55e",
    QUESTION: "#3b82f6",
    COMMAND: "#ef4444",
    REQUEST: "#f59e0b",
    STATEMENT: "#6366f1",
    ACKNOWLEDGE: "#9ca3af",
    EXPRESS: "#ec4899",
    DENY: "#f97316",
    CONFIRM: "#14b8a6",
    GREET: "#8b5cf6",
};
function getIntentColor(key) {
    return INTENT_COLORS[key.toUpperCase()] ?? "#94a3b8";
}
/**
 * Vertical profile card — donut fills available width, stats below.
 * Designed for sidebar placement (150–200px wide).
 */
export function InlineProfileChart({ profile, size = 120 }) {
    const segments = getProfileSegments(profile);
    const hasData = profile.segmentCount > 0 && segments.length > 0;
    const moodTag = getMoodTag(profile);
    const dominant = getDominantEmotion(profile);
    const intentEntries = Object.entries(profile.intentProfile)
        .filter(([, v]) => v > 0.02)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const intentTotal = intentEntries.reduce((s, [, v]) => s + v, 0) || 1;
    if (!hasData) {
        return (_jsx("div", { style: { textAlign: "center", padding: 12, color: "#b0b8c4", fontSize: 11, fontStyle: "italic" }, children: "No voice data yet" }));
    }
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 6 }, children: [_jsx(EmotionDonut, { segments: segments, size: size, centerEmoji: true }), _jsxs("div", { style: { fontSize: 12, fontWeight: 600, color: "#374151", textAlign: "center" }, children: [moodTag, " ", EMOTION_EMOJI[dominant] ?? "😐"] }), _jsx("div", { style: { width: "100%", padding: "0 4px" }, children: segments.slice(0, 5).map((s) => (_jsxs("div", { style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginBottom: 2,
                        fontSize: 11,
                        color: "#475569",
                    }, children: [_jsx("span", { style: {
                                width: 5, height: 5, borderRadius: "50%",
                                background: EMOTION_COLORS[s.key] ?? "#9ca3af",
                                flexShrink: 0,
                            } }), _jsx("span", { style: { flex: 1 }, children: s.key.charAt(0) + s.key.slice(1).toLowerCase() }), _jsx("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#374151" }, children: Math.round(s.value * 100) })] }, s.key))) }), intentEntries.length > 0 && (_jsxs("div", { style: { width: "100%", padding: "0 4px", marginTop: 2 }, children: [_jsx("div", { style: {
                            fontSize: 9,
                            fontWeight: 600,
                            color: "#94a3b8",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginBottom: 3,
                        }, children: "Intent" }), intentEntries.map(([key, val]) => {
                        const pct = Math.round((val / intentTotal) * 100);
                        return (_jsxs("div", { style: {
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                marginBottom: 2,
                                fontSize: 10,
                                color: "#64748b",
                            }, children: [_jsx("span", { style: {
                                        width: 4, height: 4, borderRadius: 1,
                                        background: getIntentColor(key),
                                        flexShrink: 0,
                                    } }), _jsx("span", { style: { flex: 1 }, children: intentDisplayLabel(key) }), _jsxs("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#475569" }, children: [pct, "%"] })] }, key));
                    })] }))] }));
}
//# sourceMappingURL=PersonalityChart.js.map