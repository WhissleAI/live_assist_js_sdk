import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { getStoredInstructions } from "./InstructionsModal";
import type {
  LiveAssistConfig, TranscriptEntry, AgendaItem, BehavioralProfile,
  LiveAssistDone, SessionReport, AttachedDoc,
} from "@whissle/live-assist-core";
import { LiveAssistSession } from "@whissle/live-assist-core";

interface LiveAssistContextValue {
  session: LiveAssistSession | null;
  isCapturing: boolean;
  hasTabAudio: boolean;
  transcript: TranscriptEntry[];
  userProfile: BehavioralProfile;
  otherProfile: BehavioralProfile;
  feedbackSummary: string;
  suggestions: string[];
  keywords: string[];
  agendaItems: AgendaItem[];
  instructions: string;
  setInstructions: (s: string) => void;
  error: string | null;
  startCapture: (opts?: { includeTab?: boolean; agenda?: AgendaItem[]; documents?: AttachedDoc[]; instructions?: string; recordAudio?: boolean }) => Promise<void>;
  stopCapture: () => Promise<SessionReport>;
}

const emptyProfile: BehavioralProfile = { emotionProfile: {}, intentProfile: {}, segmentCount: 0 };

const LiveAssistCtx = createContext<LiveAssistContextValue | null>(null);

export function LiveAssistProvider({ config, children }: { config: LiveAssistConfig; children: React.ReactNode }) {
  const sessionRef = useRef<LiveAssistSession | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasTabAudio, setHasTabAudio] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [userProfile, setUserProfile] = useState<BehavioralProfile>(emptyProfile);
  const [otherProfile, setOtherProfile] = useState<BehavioralProfile>(emptyProfile);
  const [feedbackSummary, setFeedbackSummary] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [instructions, setInstructionsState] = useState(getStoredInstructions);
  const [error, setError] = useState<string | null>(null);

  const setInstructions = useCallback((s: string) => {
    setInstructionsState(s);
  }, []);

  useEffect(() => {
    const s = new LiveAssistSession(config);
    sessionRef.current = s;
    s.on("transcript", (entries) => setTranscript(entries));
    s.on("profile", ({ user, other }) => { setUserProfile(user); setOtherProfile(other); });
    s.on("feedback", (fb) => { if (fb.summary) setFeedbackSummary(fb.summary); if (fb.suggestions?.length) setSuggestions(fb.suggestions); });
    s.on("status", (st) => { if (st.keywords?.length) setKeywords(st.keywords); });
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
      if (s.isRunning) s.stop().catch(() => {});
    };
  }, [config]);

  const startCapture = useCallback(async (opts?: { includeTab?: boolean; agenda?: AgendaItem[]; documents?: AttachedDoc[]; instructions?: string; recordAudio?: boolean }) => {
    const s = sessionRef.current;
    if (!s) return;
    setError(null);
    setTranscript([]);
    setFeedbackSummary("");
    setSuggestions([]);
    setKeywords([]);
    setHasTabAudio(opts?.includeTab ?? false);
    if (opts?.agenda) setAgendaItems(opts.agenda);
    await s.start({ ...opts, instructions: opts?.instructions ?? instructions, recordAudio: opts?.recordAudio });
    setIsCapturing(true);
  }, [instructions]);

  const stopCapture = useCallback(async (): Promise<SessionReport> => {
    const s = sessionRef.current;
    if (!s) return { feedbackSummary: "", suggestions: [], actionItems: [], knowledgeItems: [], userProfile: emptyProfile, otherProfile: emptyProfile, keywords: [] };
    const report = await s.stop();
    setIsCapturing(false);
    setHasTabAudio(false);
    return report;
  }, []);

  const value: LiveAssistContextValue = {
    session: sessionRef.current,
    isCapturing, hasTabAudio, transcript, userProfile, otherProfile,
    feedbackSummary, suggestions, keywords, agendaItems, instructions, setInstructions, error,
    startCapture, stopCapture,
  };

  return <LiveAssistCtx.Provider value={value}>{children}</LiveAssistCtx.Provider>;
}

export function useLiveAssist(): LiveAssistContextValue {
  const ctx = useContext(LiveAssistCtx);
  if (!ctx) throw new Error("useLiveAssist must be used within a LiveAssistProvider");
  return ctx;
}
