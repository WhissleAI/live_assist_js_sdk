import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState } from "react";
export function TranscriptView({ entries, maxHeight = 300 }) {
    const scrollRef = useRef(null);
    const [tab, setTab] = useState("all");
    useEffect(() => {
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        });
    }, [entries.length, entries[entries.length - 1]?.text]);
    const filtered = tab === "all" ? entries : entries.filter((e) => e.channel === tab);
    return (_jsxs("div", { children: [_jsx("div", { style: { display: "flex", gap: 4, marginBottom: 8, borderBottom: "1px solid var(--la-border, #e5e7eb)", paddingBottom: 4 }, children: ["all", "mic", "tab"].map((t) => (_jsx("button", { type: "button", onClick: () => setTab(t), style: {
                        padding: "4px 10px",
                        fontSize: 11,
                        fontWeight: tab === t ? 700 : 400,
                        background: tab === t ? "var(--la-primary, #124e3f)" : "transparent",
                        color: tab === t ? "#fff" : "#666",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        textTransform: "uppercase",
                    }, children: t === "all" ? "All" : t === "mic" ? "You" : "Other" }, t))) }), _jsxs("div", { ref: scrollRef, style: { maxHeight, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }, children: [filtered.length === 0 && (_jsx("div", { style: { color: "#9ca3af", fontSize: 13, padding: 24, textAlign: "center" }, children: "No transcript yet" })), filtered.map((entry, i) => (_jsx(TranscriptBubble, { entry: entry }, entry._id ?? `t-${i}`)))] })] }));
}
function TranscriptBubble({ entry }) {
    const isYou = entry.channel === "mic";
    const isPartial = entry.is_final === false && !entry._promoted;
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
            }, children: [_jsx("div", { style: { fontSize: 10, fontWeight: 600, marginBottom: 2, opacity: 0.9 }, children: isYou ? "You" : "Other" }), _jsx("span", { style: {
                        opacity: isPartial ? 0.85 : 1,
                        fontStyle: isPartial ? "italic" : "normal",
                    }, children: entry.text })] }) }));
}
//# sourceMappingURL=TranscriptView.js.map