import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useCallback } from "react";
import { useLiveAssist } from "./LiveAssistProvider";
import { TranscriptView } from "./TranscriptView";
import { SessionControls } from "./SessionControls";
import { AgendaTracker } from "./AgendaTracker";
import { PersonalitySidebar } from "./PersonalitySidebar";
const SIDEBAR_WIDTH = 140;
/** Embeddable frame: [You chart | controls + transcript | Other chart] — wide layout. */
export function LiveAssistFrame({ agenda, agentId, mode, style, className, }) {
    const { isCapturing, hasTabAudio, transcript, userProfile, otherProfile, error, agendaItems, instructions, setInstructions, startCapture, stopCapture, } = useLiveAssist();
    const handleStart = useCallback((opts) => {
        startCapture({ ...opts, agenda: opts?.agenda ?? agenda, agentId, mode });
    }, [startCapture, agenda, agentId, mode]);
    const handleStop = useCallback(() => stopCapture(), [stopCapture]);
    const handleAgendaChange = useCallback(() => { }, []);
    const showOtherChart = hasTabAudio && isCapturing;
    return (_jsxs("div", { className: className, style: {
            border: "1px solid var(--la-border, #e5e7eb)",
            borderRadius: "var(--la-radius, 12px)",
            overflow: "hidden",
            background: "var(--la-bg, #fff)",
            display: "flex",
            flexDirection: "row",
            minHeight: 480,
            width: "100%",
            ...style,
        }, children: [_jsx("div", { style: {
                    width: SIDEBAR_WIDTH,
                    flexShrink: 0,
                    borderRight: "1px solid var(--la-border, #e5e7eb)",
                    background: "#fafafa",
                }, children: _jsx(PersonalitySidebar, { label: "You", profile: userProfile, placeholder: isCapturing ? "Speaking…" : "—" }) }), _jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }, children: [_jsxs("div", { style: {
                            padding: 16,
                            borderBottom: "1px solid var(--la-border, #e5e7eb)",
                        }, children: [_jsx("h3", { style: { margin: "0 0 12px 0", fontSize: 16, fontWeight: 700 }, children: "Live Assist" }), _jsx(SessionControls, { isCapturing: isCapturing, hasTabAudio: hasTabAudio, onStart: handleStart, onStop: handleStop, onAgendaChange: handleAgendaChange, instructions: instructions, onInstructionsSave: setInstructions })] }), error && (_jsx("div", { style: {
                            padding: "8px 16px",
                            color: "#ef4444",
                            fontSize: 12,
                            background: "#fef2f2",
                        }, children: error })), _jsx("div", { style: { flex: 1, padding: 16, overflow: "auto", minHeight: 280 }, children: _jsx(TranscriptView, { entries: transcript, maxHeight: 420 }) })] }), showOtherChart && (_jsxs("div", { style: {
                    width: SIDEBAR_WIDTH,
                    flexShrink: 0,
                    borderLeft: "1px solid var(--la-border, #e5e7eb)",
                    background: "#fafafa",
                    display: "flex",
                    flexDirection: "column",
                }, children: [_jsx(PersonalitySidebar, { label: "Other", profile: otherProfile, placeholder: "Tab audio\u2026" }), agendaItems.length > 0 && (_jsx("div", { style: { padding: "0 16px 16px", borderTop: "1px solid var(--la-border, #e5e7eb)", marginTop: 8, paddingTop: 12 }, children: _jsx(AgendaTracker, { items: agendaItems, compact: true }) }))] }))] }));
}
//# sourceMappingURL=LiveAssistFrame.js.map