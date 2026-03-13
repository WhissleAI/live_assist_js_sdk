import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { getStoredInstructions } from "./InstructionsModal";
import { LiveAssistSession } from "@whissle/live-assist-core";
const emptyProfile = { emotionProfile: {}, intentProfile: {}, segmentCount: 0 };
const LiveAssistCtx = createContext(null);
export function LiveAssistProvider({ config, children }) {
    const sessionRef = useRef(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [hasTabAudio, setHasTabAudio] = useState(false);
    const [transcript, setTranscript] = useState([]);
    const [userProfile, setUserProfile] = useState(emptyProfile);
    const [otherProfile, setOtherProfile] = useState(emptyProfile);
    const [feedbackSummary, setFeedbackSummary] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [keywords, setKeywords] = useState([]);
    const [agendaItems, setAgendaItems] = useState([]);
    const [instructions, setInstructionsState] = useState(getStoredInstructions);
    const [error, setError] = useState(null);
    const setInstructions = useCallback((s) => {
        setInstructionsState(s);
    }, []);
    useEffect(() => {
        const s = new LiveAssistSession(config);
        sessionRef.current = s;
        s.on("transcript", (entries) => setTranscript(entries));
        s.on("profile", ({ user, other }) => { setUserProfile(user); setOtherProfile(other); });
        s.on("feedback", (fb) => { if (fb.summary)
            setFeedbackSummary(fb.summary); if (fb.suggestions?.length)
            setSuggestions(fb.suggestions); });
        s.on("status", (st) => { if (st.keywords?.length)
            setKeywords(st.keywords); });
        s.on("agenda", (items) => setAgendaItems(items));
        s.on("error", (err) => setError(err.message));
        const promoteInterval = setInterval(() => {
            setTranscript((prev) => {
                const now = Date.now();
                let changed = false;
                const updated = prev.map((e) => {
                    if (e.is_final === false && e._ts != null && now - e._ts > 4000) {
                        changed = true;
                        return { ...e, _promoted: true, _ts: undefined };
                    }
                    return e;
                });
                return changed ? updated : prev;
            });
        }, 1500);
        return () => {
            clearInterval(promoteInterval);
            if (s.isRunning)
                s.stop().catch(() => { });
        };
    }, [config]);
    const startCapture = useCallback(async (opts) => {
        const s = sessionRef.current;
        if (!s)
            return;
        setError(null);
        setTranscript([]);
        setFeedbackSummary("");
        setSuggestions([]);
        setKeywords([]);
        setHasTabAudio(opts?.includeTab ?? false);
        if (opts?.agenda)
            setAgendaItems(opts.agenda);
        await s.start({ ...opts, instructions: opts?.instructions ?? instructions, recordAudio: opts?.recordAudio });
        setIsCapturing(true);
    }, [instructions]);
    const stopCapture = useCallback(async () => {
        const s = sessionRef.current;
        if (!s)
            return { feedbackSummary: "", suggestions: [], actionItems: [], knowledgeItems: [], userProfile: emptyProfile, otherProfile: emptyProfile, keywords: [] };
        const report = await s.stop();
        setIsCapturing(false);
        setHasTabAudio(false);
        return report;
    }, []);
    const value = {
        session: sessionRef.current,
        isCapturing, hasTabAudio, transcript, userProfile, otherProfile,
        feedbackSummary, suggestions, keywords, agendaItems, instructions, setInstructions, error,
        startCapture, stopCapture,
    };
    return _jsx(LiveAssistCtx.Provider, { value: value, children: children });
}
export function useLiveAssist() {
    const ctx = useContext(LiveAssistCtx);
    if (!ctx)
        throw new Error("useLiveAssist must be used within a LiveAssistProvider");
    return ctx;
}
//# sourceMappingURL=LiveAssistProvider.js.map