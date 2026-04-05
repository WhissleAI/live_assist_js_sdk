import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveAssistSession,
  type TranscriptEntry,
  type BehavioralProfile,
} from "@whissle/live-assist-core";
import type { DateConfig } from "../App";
import { buildDatingCoachPrompt } from "../lib/dating-prompts";
import { dateTypeToMode } from "../lib/date-context";
import { computeChemistry, type ChemistrySnapshot } from "../lib/chemistry";
import { analyzeInterestSignals, type InterestSignal } from "../lib/interest-signals";
import type { EmotionTimelineData } from "./useEmotionTimeline";

export interface SessionData {
  transcript: TranscriptEntry[];
  userProfile: BehavioralProfile;
  otherProfile: BehavioralProfile;
  chemistry: ChemistrySnapshot;
  emotionTimeline: EmotionTimelineData;
  feedbackSummary: string;
  suggestions: string[];
  keywords: string[];
  signals: InterestSignal[];
  durationMs: number;
}

export interface DatingSessionState {
  isActive: boolean;
  transcript: TranscriptEntry[];
  userProfile: BehavioralProfile;
  otherProfile: BehavioralProfile;
  chemistry: ChemistrySnapshot;
  signals: InterestSignal[];
  feedbackChunks: string;
  suggestions: string[];
  keywords: string[];
  engagementScore: number;
  sentimentTrend: string;
  error: string | null;
}

const EMPTY_PROFILE: BehavioralProfile = { emotionProfile: {}, intentProfile: {}, segmentCount: 0 };
const INITIAL_CHEMISTRY: ChemistrySnapshot = {
  overall: 50,
  engagement: 50,
  emotionAlignment: 50,
  turnBalance: 100,
  positivity: 50,
  trend: "stable",
};

export function useDatingSession(
  config: DateConfig,
  onEmotionPoint: (speaker: "you" | "them", emotion: string, confidence: number) => void,
) {
  const [state, setState] = useState<DatingSessionState>({
    isActive: false,
    transcript: [],
    userProfile: EMPTY_PROFILE,
    otherProfile: EMPTY_PROFILE,
    chemistry: INITIAL_CHEMISTRY,
    signals: [],
    feedbackChunks: "",
    suggestions: [],
    keywords: [],
    engagementScore: 50,
    sentimentTrend: "neutral",
    error: null,
  });

  const sessionRef = useRef<LiveAssistSession | null>(null);
  const startTimeRef = useRef(0);
  const emotionTimelineRef = useRef<EmotionTimelineData>({ you: [], them: [] });

  const start = useCallback(async () => {
    try {
      const session = new LiveAssistSession({
        asrUrl: config.asrUrl,
        agentUrl: config.agentUrl,
      });

      // Listen for transcript updates
      session.on("transcript", (entries) => {
        setState((prev) => ({ ...prev, transcript: entries }));

        // Extract emotion from latest entries for timeline
        const latest = entries[entries.length - 1];
        if (latest?.metadata?.emotion) {
          const speaker = latest.channel === "mic" ? "you" : "them";
          onEmotionPoint(speaker, latest.metadata.emotion, latest.metadata.emotionConfidence ?? 0.5);

          emotionTimelineRef.current[speaker].push({
            timestamp: Date.now() - startTimeRef.current,
            emotion: latest.metadata.emotion,
            confidence: latest.metadata.emotionConfidence ?? 0.5,
            speaker,
          });
        }
      });

      // Listen for profile updates
      session.on("profile", ({ user, other }) => {
        setState((prev) => {
          const chemistry = computeChemistry(
            user, other,
            prev.engagementScore,
            prev.sentimentTrend,
            prev.chemistry.overall,
          );

          const signals = analyzeInterestSignals({
            userSegmentCount: user.segmentCount,
            otherSegmentCount: other.segmentCount,
            otherEmotionProfile: other.emotionProfile,
            engagementScore: prev.engagementScore,
            sentimentTrend: prev.sentimentTrend,
            keywords: prev.keywords,
            turnCount: user.segmentCount + other.segmentCount,
          });

          return {
            ...prev,
            userProfile: user,
            otherProfile: other,
            chemistry,
            signals,
          };
        });
      });

      // Listen for feedback
      session.on("feedback", ({ summary, suggestions }) => {
        setState((prev) => ({
          ...prev,
          feedbackChunks: summary,
          suggestions,
        }));
      });

      // Listen for status updates
      session.on("status", (status) => {
        setState((prev) => ({
          ...prev,
          engagementScore: status.engagementScore ?? prev.engagementScore,
          sentimentTrend: status.sentimentTrend ?? prev.sentimentTrend,
          keywords: status.keywords ?? prev.keywords,
        }));
      });

      // Listen for errors
      session.on("error", (err) => {
        setState((prev) => ({ ...prev, error: err.message }));
      });

      sessionRef.current = session;
      startTimeRef.current = Date.now();
      emotionTimelineRef.current = { you: [], them: [] };

      await session.start({
        includeTab: config.dateType === "video-call",
        mode: dateTypeToMode(config.dateType),
        instructions: buildDatingCoachPrompt(config),
      });

      setState((prev) => ({ ...prev, isActive: true, error: null }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to start session",
      }));
    }
  }, [config, onEmotionPoint]);

  const stop = useCallback((): SessionData => {
    const session = sessionRef.current;
    if (session) {
      session.stop();
      sessionRef.current = null;
    }

    const data: SessionData = {
      transcript: state.transcript,
      userProfile: state.userProfile,
      otherProfile: state.otherProfile,
      chemistry: state.chemistry,
      emotionTimeline: emotionTimelineRef.current,
      feedbackSummary: state.feedbackChunks,
      suggestions: state.suggestions,
      keywords: state.keywords,
      signals: state.signals,
      durationMs: Date.now() - startTimeRef.current,
    };

    setState((prev) => ({ ...prev, isActive: false }));
    return data;
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.stop();
        sessionRef.current = null;
      }
    };
  }, []);

  return { state, start, stop };
}
