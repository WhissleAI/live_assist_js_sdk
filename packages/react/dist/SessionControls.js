import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from "react";
import { InstructionsModal } from "./InstructionsModal";
import { getDefaultAgendaItems } from "./agendaDefaults";
export function SessionControls({ isCapturing, onStart, onStop, onAgendaChange, hasTabAudio, instructions, onInstructionsSave, }) {
    const [includeTab, setIncludeTab] = useState(false);
    const [recordAudio, setRecordAudio] = useState(true);
    const [agendaItems, setAgendaItems] = useState([]);
    const [newItem, setNewItem] = useState("");
    const [showInstructions, setShowInstructions] = useState(false);
    const addAgendaItem = useCallback(() => {
        const title = newItem.trim();
        if (!title)
            return;
        const item = {
            id: `agenda_${Date.now()}`,
            title,
            status: "pending",
            confidence: 0,
        };
        const next = [...agendaItems, item];
        setAgendaItems(next);
        setNewItem("");
        onAgendaChange?.(next);
    }, [newItem, agendaItems, onAgendaChange]);
    const removeAgendaItem = useCallback((id) => {
        const next = agendaItems.filter((a) => a.id !== id);
        setAgendaItems(next);
        onAgendaChange?.(next);
    }, [agendaItems, onAgendaChange]);
    const handleStart = useCallback(() => {
        onStart({
            includeTab,
            agenda: agendaItems.length > 0 ? agendaItems : undefined,
            instructions: instructions?.trim() || undefined,
            recordAudio,
        });
    }, [includeTab, agendaItems, instructions, recordAudio, onStart]);
    if (isCapturing) {
        return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("span", { style: {
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#22c55e",
                                animation: "la-pulse 1.5s infinite",
                            } }), _jsxs("span", { style: { fontSize: 13, fontWeight: 600 }, children: ["Listening ", hasTabAudio ? "· Mic + Tab" : "· Mic only"] })] }), _jsx("button", { type: "button", onClick: onStop, style: {
                        padding: "8px 16px",
                        background: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                    }, children: "Stop Session" })] }));
    }
    return (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 16 }, children: [_jsx("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: _jsx("button", { type: "button", onClick: () => setShowInstructions(true), style: {
                        padding: "6px 12px",
                        background: "#f3f4f6",
                        border: "1px solid var(--la-border, #e5e7eb)",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                    }, children: "Instructions" }) }), _jsx(InstructionsModal, { isOpen: showInstructions, onClose: () => setShowInstructions(false), onSave: (s) => onInstructionsSave?.(s) }), _jsx("div", { children: _jsxs("label", { style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        cursor: "pointer",
                    }, children: [_jsx("input", { type: "checkbox", checked: recordAudio, onChange: (e) => setRecordAudio(e.target.checked) }), "Record audio (saved locally with session report)"] }) }), _jsx("div", { children: _jsxs("label", { style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        cursor: "pointer",
                    }, children: [_jsx("input", { type: "checkbox", checked: includeTab, onChange: (e) => setIncludeTab(e.target.checked) }), "Share browser tab (transcribes \"Other\" speaker, updates right chart)"] }) }), _jsxs("div", { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }, children: [_jsx("label", { style: { fontSize: 12, fontWeight: 600 }, children: "Agenda items" }), _jsx("button", { type: "button", onClick: () => { setAgendaItems(getDefaultAgendaItems()); }, style: { fontSize: 11, background: "none", border: "none", color: "#6b7280", cursor: "pointer", textDecoration: "underline" }, children: "Reset to defaults" })] }), _jsxs("div", { style: { display: "flex", gap: 8, marginBottom: 8 }, children: [_jsx("input", { type: "text", value: newItem, onChange: (e) => setNewItem(e.target.value), onKeyDown: (e) => e.key === "Enter" && addAgendaItem(), placeholder: "Add item...", style: {
                                    flex: 1,
                                    padding: "8px 12px",
                                    fontSize: 13,
                                    border: "1px solid var(--la-border, #e5e7eb)",
                                    borderRadius: 8,
                                    fontFamily: "inherit",
                                } }), _jsx("button", { type: "button", onClick: addAgendaItem, style: {
                                    padding: "8px 16px",
                                    background: "var(--la-primary, #124e3f)",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }, children: "Add" })] }), agendaItems.length > 0 && (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: agendaItems.map((item) => (_jsxs("div", { style: {
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 10px",
                                background: "#f9fafb",
                                borderRadius: 6,
                                fontSize: 13,
                            }, children: [_jsx("span", { style: { flex: 1 }, children: item.title }), _jsx("button", { type: "button", onClick: () => removeAgendaItem(item.id), style: {
                                        padding: "2px 8px",
                                        background: "none",
                                        border: "none",
                                        color: "#6b7280",
                                        cursor: "pointer",
                                        fontSize: 12,
                                    }, "aria-label": "Remove", children: "Remove" })] }, item.id))) }))] }), _jsx("button", { type: "button", onClick: handleStart, style: {
                    padding: "10px 20px",
                    background: "var(--la-primary, #124e3f)",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                }, children: "Start Live Assist" })] }));
}
//# sourceMappingURL=SessionControls.js.map