import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { EMOTION_KEYS, EMOTION_EMOJI, EMOTION_COLORS, getDominantEmotion, getMoodTag, topIntents, } from "@whissle/live-assist-core";
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
    const fontSize = size <= 80 ? 20 : 36;
    return (_jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, children: [paths.map((p, i) => _jsx("path", { d: p.d, fill: p.fill, stroke: "rgba(255,255,255,0.5)", strokeWidth: "0.5", style: { transition: "d 0.4s ease" } }, i)), _jsx("circle", { cx: cx, cy: cy, r: inner - 2, fill: "var(--la-bg, white)" }), centerEmoji && _jsx("text", { x: cx, y: cy + (size <= 80 ? 5 : 10), textAnchor: "middle", fontSize: fontSize, children: EMOTION_EMOJI[dominant] ?? "😐" })] }));
}
export function InlineProfileChart({ profile, size = 120 }) {
    const segments = getProfileSegments(profile);
    const hasData = profile.segmentCount > 0 && segments.length > 0;
    const moodTag = getMoodTag(profile);
    const intents = topIntents(profile, 3);
    if (!hasData)
        return _jsx("div", { style: { textAlign: "center", padding: 16, color: "#888", fontSize: 13 }, children: "No voice data yet" });
    return (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 16 }, children: [_jsx(EmotionDonut, { segments: segments, size: size, centerEmoji: true }), _jsxs("div", { children: [_jsxs("div", { style: { fontWeight: 600, fontSize: 14, marginBottom: 4 }, children: [moodTag, " ", EMOTION_EMOJI[getDominantEmotion(profile)] ?? "😐"] }), segments.slice(0, 4).map((s) => (_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 2, fontSize: 12 }, children: [_jsx("span", { style: { width: 6, height: 6, borderRadius: "50%", background: EMOTION_COLORS[s.key] ?? "#9ca3af", flexShrink: 0 } }), _jsx("span", { children: s.key.charAt(0) + s.key.slice(1).toLowerCase() }), _jsxs("span", { style: { fontWeight: 600, marginLeft: "auto" }, children: [Math.round(s.value * 100), "%"] })] }, s.key))), intents.length > 0 && _jsx("div", { style: { fontSize: 11, color: "#888", marginTop: 4 }, children: intents.join(" · ") })] })] }));
}
//# sourceMappingURL=PersonalityChart.js.map