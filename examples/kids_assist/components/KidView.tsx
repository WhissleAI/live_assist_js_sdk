import React, { useCallback, useRef, useEffect, useState } from "react";
import type { SessionState, AppSettings } from "../App";
import type { KidsMode } from "../lib/modes";
import { MODE_META } from "../lib/modes";
import { useAsrSession } from "../hooks/useAsrSession";
import { useVoiceAgent, type AgentToolEvent } from "../hooks/useVoiceAgent";
import EmotionCanvas from "./EmotionCanvas";
import MicButton from "./MicButton";
import FloatingWords from "./FloatingWords";
import AgentBubble from "./AgentBubble";
import ModeSelector from "./ModeSelector";
import CalmCornerVisual from "./CalmCornerVisual";
import { checkRegulationTrigger } from "../lib/regulation";
import { saveSession } from "../lib/session-store";

interface Props {
  asrUrl: string;
  session: SessionState;
  updateSession: (patch: Partial<SessionState>) => void;
  sessionRef: React.MutableRefObject<SessionState>;
  settings: AppSettings;
}

const EMOTION_LABELS: Record<string, string> = {
  HAPPY: "Happy",
  SAD: "Sad",
  ANGRY: "Angry",
  FEAR: "Worried",
  SURPRISE: "Surprised",
  DISGUST: "Yuck",
  NEUTRAL: "Calm",
};

export default function KidView({ asrUrl, session, updateSession, sessionRef, settings }: Props) {
  const [showModeSelector, setShowModeSelector] = useState(true);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartRef = useRef<number | null>(null);
  const lastRegulationRef = useRef<number | null>(null);
  const regulationCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleToolCall = useCallback((event: AgentToolEvent) => {
    const prev = sessionRef.current;
    switch (event.name) {
      case "flag_concern": {
        const args = event.arguments as { text: string; emotion: string; severity: string; reason: string };
        updateSession({
          flaggedConcerns: [...prev.flaggedConcerns, { ...args, timestamp: Date.now() }],
          moments: [
            ...prev.moments,
            {
              id: `concern_${Date.now()}`,
              timestamp: Date.now(),
              text: args.text,
              emotion: args.emotion,
              emotionConfidence: 1,
              type: "concern" as const,
              speaker: "child" as const,
              severity: args.severity as "low" | "medium" | "high",
            },
          ],
        });
        break;
      }
      case "topic_explained": {
        const args = event.arguments as { topic: string; subtopics?: string[] };
        const topics = [...prev.topicsDiscussed, args.topic, ...(args.subtopics ?? [])];
        updateSession({ topicsDiscussed: [...new Set(topics)] });
        break;
      }
      case "story_beat": {
        const args = event.arguments as { narrator_text: string; child_prompt: string; mood: string };
        updateSession({ storyBeats: [...prev.storyBeats, args] });
        break;
      }
      case "regulation_start": {
        const args = event.arguments as { technique: string; initial_emotion: string; initial_confidence?: number };
        updateSession({
          regulationEvents: [
            ...prev.regulationEvents,
            { id: `reg_${Date.now()}`, timestamp: Date.now(), technique: args.technique, startEmotion: args.initial_emotion },
          ],
        });
        break;
      }
      case "regulation_end": {
        const args = event.arguments as { technique: string; end_emotion: string; duration_sec?: number; was_effective?: boolean };
        const events = [...prev.regulationEvents];
        if (events.length > 0) {
          const last = { ...events[events.length - 1] };
          last.endEmotion = args.end_emotion;
          last.durationSec = args.duration_sec;
          last.wasEffective = args.was_effective;
          events[events.length - 1] = last;
        }
        updateSession({ regulationEvents: events });
        break;
      }
      case "checkin_complete": {
        const args = event.arguments as { overall_mood: string; highlights: string[]; concerns?: string[] };
        updateSession({ checkinData: { overall_mood: args.overall_mood, highlights: args.highlights, concerns: args.concerns ?? [] } });
        break;
      }
    }
  }, [sessionRef, updateSession]);

  const {
    agentText,
    isSpeaking,
    isProcessing,
    sendToAgent,
    greet,
    reset: resetAgent,
    destroy: destroyAgent,
    initTts,
  } = useVoiceAgent({
    mode: session.mode,
    currentEmotion: session.currentEmotion,
    emotionConfidence: session.currentEmotionProbs[session.currentEmotion] ?? 0,
    childName: settings.childName,
    childAge: settings.childAge,
    onToolCall: handleToolCall,
  });

  const handleUtteranceFlush = useCallback((text: string, speaker: "child" | "other") => {
    if (speaker === "child" && text.trim()) {
      sendToAgent(text);
    }
  }, [sendToAgent]);

  const { start: startAsr, stop: stopAsr } = useAsrSession(asrUrl, sessionRef, updateSession, handleUtteranceFlush);

  const handleModeSelect = useCallback(async (mode: KidsMode) => {
    updateSession({
      ...sessionRef.current,
      isActive: true,
      mode,
      transcript: [],
      moments: [],
      emotionTimeline: [],
      currentEmotion: "NEUTRAL",
      currentEmotionProbs: {},
      profile: null,
      error: null,
      sessionStart: Date.now(),
      regulationEvents: [],
      flaggedConcerns: [],
      topicsDiscussed: [],
      storyBeats: [],
      checkinData: undefined,
    });
    setShowModeSelector(false);
    sessionStartRef.current = Date.now();

    await initTts();
    await startAsr();
    greet();

    if (settings.maxSessionMinutes > 0) {
      const warnMs = (settings.maxSessionMinutes - 2) * 60_000;
      const endMs = settings.maxSessionMinutes * 60_000;
      sessionTimerRef.current = setTimeout(() => {
        sendToAgent("The session is about to end in 2 minutes. Give the child a gentle heads up.");
        setTimeout(() => {
          handleStop();
        }, 120_000);
      }, Math.max(0, warnMs)) as unknown as ReturnType<typeof setInterval>;
    }
  }, [initTts, startAsr, greet, sendToAgent, updateSession, sessionRef, settings.maxSessionMinutes]);

  const handleStop = useCallback(() => {
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current as unknown as number);
    stopAsr();
    destroyAgent();
    if (sessionRef.current.transcript.length > 0) {
      saveSession(sessionRef.current);
    }
    updateSession({ isActive: false, isConnected: false });
    setShowModeSelector(true);
  }, [stopAsr, destroyAgent, updateSession, sessionRef]);

  const handleCalmRequest = useCallback(() => {
    updateSession({ mode: "kids_calm_corner" });
    resetAgent();
    greet();
  }, [updateSession, resetAgent, greet]);

  useEffect(() => {
    if (!session.isActive || session.mode === "kids_calm_corner") {
      if (regulationCheckRef.current) clearInterval(regulationCheckRef.current);
      return;
    }

    regulationCheckRef.current = setInterval(() => {
      const state = checkRegulationTrigger(
        sessionRef.current.emotionTimeline,
        sessionRef.current.mode,
        lastRegulationRef.current,
      );
      if (state.shouldTrigger) {
        lastRegulationRef.current = Date.now();
        sendToAgent(
          `The child has been sounding ${state.dominantNegative?.toLowerCase()} for about ${state.negativeDurationSec} seconds. Gently suggest trying a breathing exercise together.`
        );
      }
    }, 5000);

    return () => {
      if (regulationCheckRef.current) clearInterval(regulationCheckRef.current);
    };
  }, [session.isActive, session.mode, sendToAgent, sessionRef]);

  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current as unknown as number);
    };
  }, []);

  const isBreathSync = session.isActive && session.mode === "kids_calm_corner";
  const modeMeta = MODE_META[session.mode];

  if (!session.isActive && showModeSelector) {
    return (
      <div className="kid-view">
        <EmotionCanvas
          emotion="NEUTRAL"
          probs={{}}
          isActive={false}
        />
        <ModeSelector onSelect={handleModeSelect} />
        {session.transcript.length > 0 && (
          <p className="kid-hint">Great conversation! Switch to Parent view to see insights.</p>
        )}
      </div>
    );
  }

  return (
    <div className="kid-view">
      <EmotionCanvas
        emotion={session.currentEmotion}
        probs={session.currentEmotionProbs}
        isActive={session.isActive}
        breathSync={isBreathSync}
      />

      {isBreathSync && <CalmCornerVisual isActive />}

      <FloatingWords
        transcript={session.transcript}
        currentEmotion={session.currentEmotion}
      />

      <AgentBubble
        text={agentText}
        isSpeaking={isSpeaking}
        isProcessing={isProcessing}
      />

      {session.isActive && (
        <div className="mode-indicator" style={{ "--mode-color": modeMeta.color } as React.CSSProperties}>
          <span>{modeMeta.icon}</span>
          <span>{modeMeta.label}</span>
        </div>
      )}

      {session.isActive && session.currentEmotion !== "NEUTRAL" && (
        <div className="emotion-label-float">
          {EMOTION_LABELS[session.currentEmotion] || session.currentEmotion}
        </div>
      )}

      {session.isActive && session.speakerLabel !== "child" && (
        <div className="speaker-indicator">
          <span className="speaker-dot" />
          Someone else is talking
        </div>
      )}

      <div className="kid-bottom-controls">
        {session.isActive && session.mode !== "kids_calm_corner" && (
          <button type="button" className="calm-trigger" onClick={handleCalmRequest} title="Calm Corner">
            🌊
          </button>
        )}
        <MicButton
          isActive={session.isActive}
          isConnected={session.isConnected}
          emotion={session.currentEmotion}
          onToggle={session.isActive ? handleStop : () => setShowModeSelector(true)}
        />
      </div>

      {session.error && (
        <div className="kid-error">
          {session.error}
          <button type="button" onClick={() => updateSession({ error: null })}>&times;</button>
        </div>
      )}
    </div>
  );
}
