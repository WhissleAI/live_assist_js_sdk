import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { EMOTION_KEYS, EMOTION_EMOJI, EMOTION_COLORS, getMoodTag } from "@whissle/live-assist-core";
export function ProfileBadge({ profile, label, align = "left", onClick }) {
    const hasData = profile.segmentCount > 0 && Object.keys(profile.emotionProfile).length > 0;
    const moodTag = hasData ? getMoodTag(profile) : "Steady";
    const total = EMOTION_KEYS.reduce((s, k) => s + (profile.emotionProfile[k] ?? 0), 0) || 1;
    const segments = EMOTION_KEYS.map((key) => ({ key, value: (profile.emotionProfile[key] ?? 0) / total })).filter((s) => s.value > 0.01);
    const dominant = segments.length ? segments.reduce((a, b) => (a.value >= b.value ? a : b)).key : "NEUTRAL";
    const size = 36, cx = size / 2, cy = size / 2, strokeWidth = size * 0.26;
    const radius = (size - strokeWidth) / 2 - 0.5;
    const circumference = 2 * Math.PI * radius;
    let accOffset = 0;
    const arcs = segments.map((seg) => {
        const dashLength = seg.value * circumference;
        const offset = -accOffset * circumference;
        accOffset += seg.value;
        return { key: seg.key, color: EMOTION_COLORS[seg.key] ?? "#9ca3af", dasharray: `${dashLength} ${circumference - dashLength}`, dashoffset: offset };
    });
    return (_jsxs("button", { type: "button", onClick: onClick, "aria-label": `${label}, mood ${moodTag}`, style: { display: "flex", alignItems: "center", gap: 8, flexDirection: align === "right" ? "row-reverse" : "row", background: "none", border: "none", cursor: onClick ? "pointer" : "default", padding: 0, width: "100%" }, children: [segments.length > 0 ? (_jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { flexShrink: 0, transform: "rotate(-90deg)" }, "aria-hidden": true, children: [arcs.map((arc) => _jsx("circle", { cx: cx, cy: cy, r: radius, fill: "none", stroke: arc.color, strokeWidth: strokeWidth, strokeDasharray: arc.dasharray, strokeDashoffset: arc.dashoffset, style: { transition: "stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease" } }, arc.key)), _jsx("circle", { cx: cx, cy: cy, r: radius - strokeWidth / 2 + 0.5, fill: "var(--la-bg, white)" }), _jsx("text", { x: cx, y: cy + 4, textAnchor: "middle", fontSize: 12, style: { transform: "rotate(90deg)", transformOrigin: `${cx}px ${cy}px` }, children: EMOTION_EMOJI[dominant] ?? "😐" })] })) : (_jsx("div", { style: { width: size, height: size, borderRadius: "50%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }, children: EMOTION_EMOJI.NEUTRAL })), _jsxs("div", { style: { textAlign: align === "right" ? "right" : "left", minWidth: 0, flex: 1 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: label }), _jsxs("div", { style: { fontSize: 11, color: "#9ca3af", lineHeight: 1.3 }, children: ["Mood: ", moodTag, " ", EMOTION_EMOJI[dominant] ?? "😐"] })] })] }));
}
//# sourceMappingURL=ProfileBadge.js.map