import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { EmotionDonut, getProfileSegments } from "./PersonalityChart";
export function PersonalitySidebar({ label, profile, placeholder = "—", size = 100 }) {
    const segments = getProfileSegments(profile);
    const hasData = segments.length > 0;
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", padding: 16 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 12 }, children: label }), hasData ? (_jsx(EmotionDonut, { segments: segments, size: size, centerEmoji: true })) : (_jsx("div", { style: {
                    width: size,
                    height: size,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    color: "#9ca3af",
                    textAlign: "center",
                }, children: placeholder }))] }));
}
//# sourceMappingURL=PersonalitySidebar.js.map