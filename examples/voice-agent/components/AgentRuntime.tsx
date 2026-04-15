import React, { useCallback, useRef, useEffect, useState, useMemo } from "react";
import type { SessionState } from "../App";
import { navigate } from "../App";
import type { AgentConfig } from "../lib/agent-config";
import { getAgent } from "../lib/agent-store";
import { useAsrSession } from "../hooks/useAsrSession";
import { useVoiceAgent, type AgentToolEvent } from "../hooks/useVoiceAgent";
import EmotionCanvas from "./EmotionCanvas";
import MicButton from "./MicButton";
import FloatingWords from "./FloatingWords";
import VoiceOrb from "./VoiceOrb";
import { saveSession } from "../lib/session-store";
import { SessionAudioRecorder } from "../lib/audio-recorder";
import { saveAudio, uploadToGcs } from "../lib/audio-store";
import { gatewayConfig } from "../lib/gateway-config";
import Icon from "./Icon";
import { useTtsAnalysis } from "../hooks/useTtsAnalysis";
import WhissleLogo from "./WhissleLogo";

interface Props {
  agentId: string;
  asrUrl: string;
  session: SessionState;
  updateSession: (patch: Partial<SessionState>) => void;
  sessionRef: React.MutableRefObject<SessionState>;
  isEmbed?: boolean;
}

function buildVoiceProfileSummary(profile: Record<string, unknown> | null): string {
  if (!profile) return "";
  const emo = profile.emotionProfile as Record<string, number> | undefined;
  const seg = (profile.segmentCount as number) || 0;
  if (!emo || seg === 0) return "";
  const sorted = Object.entries(emo)
    .filter(([, v]) => v > 0.05)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  if (!sorted.length) return "";
  const parts = sorted.map(([k, v]) => `${k} (${Math.round(v * 100)}%)`).join(", ");
  return `Emotional state: ${parts} over ${seg} voice segments`;
}

const EMOTION_LABELS: Record<string, string> = {
  HAPPY: "Happy",
  SAD: "Sad",
  ANGRY: "Angry",
  FEAR: "Worried",
  SURPRISE: "Surprised",
  DISGUST: "Upset",
  NEUTRAL: "Calm",
};

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AgentRuntime({ agentId, asrUrl, session, updateSession, sessionRef, isEmbed }: Props) {
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(() => getAgent(agentId));
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [ttsAnalyser, setTtsAnalyser] = useState<AnalyserNode | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<SessionAudioRecorder>(new SessionAudioRecorder());

  useEffect(() => {
    setAgentConfig(getAgent(agentId));
  }, [agentId]);

  useEffect(() => {
    if (started && session.sessionStart) {
      tickRef.current = setInterval(() => {
        setElapsed(Date.now() - session.sessionStart!);
      }, 1000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [started, session.sessionStart]);

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
              speaker: "user" as const,
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
    }
  }, [sessionRef, updateSession]);

  const segIdRef = useRef(0);
  const ttsProbsOutRef = useRef<Record<string, number>>({});
  const agentTimelineIdxAtLastFlushRef = useRef(0);
  const agentResponseStartSessionMsRef = useRef(0);

  const { ttsEmotion, start: startTtsAnalysis, stop: stopTtsAnalysis } = useTtsAnalysis(asrUrl, {
    sessionRef,
    updateSession,
    emotionProbsOutRef: ttsProbsOutRef,
  });

  const handleAgentUtterance = useCallback(
    (utterance: { text: string; emotions: string[]; emotionProbs?: Array<{ emotion: string; probability: number }> }) => {
      const prev = sessionRef.current;
      const tagProbs = utterance.emotionProbs;
      const ttsMap = ttsProbsOutRef.current;
      const ttsList =
        Object.keys(ttsMap).length > 0
          ? Object.entries(ttsMap)
              .filter(([, p]) => p > 0.02)
              .map(([emotion, probability]) => ({ emotion, probability }))
          : undefined;
      const probs = ttsList?.length ? ttsList : tagProbs;
      const topP = probs?.length ? Math.max(...probs.map((p) => p.probability)) : undefined;

      const globalTl = prev.agentEmotionTimeline ?? [];
      const sliceRaw = globalTl.slice(agentTimelineIdxAtLastFlushRef.current);
      agentTimelineIdxAtLastFlushRef.current = globalTl.length;

      // Compute audioOffsetSec relative to mic audio start.
      // Priority: TTS emotion timeline > agentResponseStart wall-clock > audioStartMs fallback.
      const audioStart = prev.audioStartMs ?? prev.sessionStart;
      let audioOffsetSec: number;
      if (sliceRaw.length > 0) {
        audioOffsetSec = Math.max(0, Math.min(...sliceRaw.map((e) => e.offset)) / 1000);
      } else if (agentResponseStartSessionMsRef.current > 0) {
        audioOffsetSec = agentResponseStartSessionMsRef.current / 1000;
      } else if (audioStart != null) {
        audioOffsetSec = Math.max(0, (Date.now() - audioStart) / 1000);
      } else {
        audioOffsetSec = 0;
      }

      const emotionTimelineUtterance =
        sliceRaw.length > 0
          ? sliceRaw.map((e) => ({
              offset: (e.offset - Math.min(...sliceRaw.map((x) => x.offset))) / 1000,
              emotion: e.emotion,
              confidence: e.confidence,
              probs: e.probs,
            }))
          : undefined;

      const seg = {
        id: `agent_seg_${++segIdRef.current}`,
        text: utterance.text,
        timestamp: Date.now(),
        isFinal: true,
        speaker: "agent" as const,
        audioOffsetSec,
        emotion: utterance.emotions[0] || probs?.[0]?.emotion || undefined,
        emotionProbs: probs,
        emotionConfidence: topP,
        emotionTimelineUtterance,
      };
      updateSession({ transcript: [...prev.transcript, seg] });
    },
    [sessionRef, updateSession],
  );

  const [agentSteps, setAgentSteps] = useState<Array<{ title: string; status?: string }>>([]);

  // Standalone refs for ASR metadata — declared before both hooks to avoid TDZ
  type MetaProb = Array<{ token: string; probability: number }>;
  const localEmotionProbs = useRef<MetaProb>([]);
  const localIntentProbs = useRef<MetaProb>([]);
  const localGenderProbs = useRef<MetaProb>([]);
  const localAgeProbs = useRef<MetaProb>([]);

  const handleStep = useCallback((title: string, status?: string) => {
    setAgentSteps((prev) => {
      const existing = prev.findIndex((s) => s.title === title);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = { title, status };
        return copy;
      }
      return [...prev, { title, status }];
    });
  }, []);

  const {
    isProcessing,
    turn,
    sendToAgent,
    greet,
    destroy: destroyAgent,
    initTts,
    onVoiceDetected,
    onUserSpeechStart,
    onUserSpeechEnd,
    getTtsClient,
  } = useVoiceAgent({
    agentConfig: agentConfig ?? ({} as AgentConfig),
    currentEmotion: session.currentEmotion,
    emotionConfidence: session.currentEmotionProbs[session.currentEmotion] ?? 0,
    emotionProbs: localEmotionProbs.current,
    intentProbs: localIntentProbs.current,
    genderProbs: localGenderProbs.current,
    ageProbs: localAgeProbs.current,
    behavioralProfile: session.profile,
    voiceProfileSummary: buildVoiceProfileSummary(session.profile as Record<string, unknown> | null),
    onToolCall: handleToolCall,
    onStep: handleStep,
    onAgentUtterance: handleAgentUtterance,
    onAgentTurnWallStart: () => {
      const audioStart = sessionRef.current.audioStartMs ?? sessionRef.current.sessionStart;
      agentResponseStartSessionMsRef.current = audioStart ? Date.now() - audioStart : 0;
    },
  });

  const handleUtteranceFlush = useCallback((text: string, speaker: "user" | "other") => {
    if (speaker === "user" && text.trim()) {
      setAgentSteps([]);
      sendToAgent(text);
    }
  }, [sendToAgent]);

  const handleMicStream = useCallback((stream: MediaStream) => {
    recorderRef.current.startMic(stream);
    // Start TTS recording at the same time as mic recording so both audio
    // tracks share the same t=0 during playback in SessionDetail.
    const ttsClient = getTtsClient();
    if (ttsClient) {
      const audioCtx = ttsClient.getAudioContext();
      if (audioCtx && !recorderRef.current.getTtsDestination()) {
        const dest = recorderRef.current.createTtsDestination(audioCtx);
        if (dest) ttsClient.setRecorderDestination(dest);
      }
    }
  }, [getTtsClient]);

  const {
    start: startAsr,
    stop: stopAsr,
    flushedEmotionProbs,
    flushedIntentProbs,
    flushedGenderProbs,
    flushedAgeProbs,
  } = useAsrSession(asrUrl, sessionRef, updateSession, {
    onUtteranceFlush: handleUtteranceFlush,
    onVoiceDetected,
    onSpeechStart: onUserSpeechStart,
    onSpeechEnd: onUserSpeechEnd,
    onMicStream: handleMicStream,
  });

  // Sync ASR flushed probs into local refs (read at sendToAgent time)
  localEmotionProbs.current = flushedEmotionProbs.current;
  localIntentProbs.current = flushedIntentProbs.current;
  localGenderProbs.current = flushedGenderProbs.current;
  localAgeProbs.current = flushedAgeProbs.current;

  const handleStart = useCallback(async () => {
    if (!agentConfig || connecting || started) return;
    setConnecting(true);
    updateSession({
      ...sessionRef.current,
      isActive: true,
      agentId: agentConfig.id,
      transcript: [],
      moments: [],
      emotionTimeline: [],
      agentEmotionTimeline: [],
      currentEmotion: "NEUTRAL",
      currentEmotionProbs: {},
      profile: null,
      error: null,
      sessionStart: Date.now(),
      flaggedConcerns: [],
      topicsDiscussed: [],
    });
    setStarted(true);
    setAgentSteps([]);
    setElapsed(0);
    setConnectionError(null);
    agentTimelineIdxAtLastFlushRef.current = 0;
    ttsProbsOutRef.current = {};

    try {
      await initTts();

      const ttsClient = getTtsClient();
      if (ttsClient) {
        setTtsAnalyser(ttsClient.getAnalyser());
        // TTS recording is set up in handleMicStream so both mic and TTS
        // recordings start at the same time (aligned t=0 for playback).
        startTtsAnalysis(ttsClient, 22050).catch(() => {});
      } else {
        setConnectionError("Voice connection failed. The agent cannot speak — check your connection and try again.");
      }

      await startAsr();
      greet();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setConnectionError(`Failed to start session: ${msg}`);
    } finally {
      setConnecting(false);
    }

    if (agentConfig.maxSessionMinutes > 0) {
      const endMs = agentConfig.maxSessionMinutes * 60_000;
      // Warn 30 seconds before timeout
      if (endMs > 30_000) {
        warningTimerRef.current = setTimeout(() => {
          setTimeoutWarning(true);
          setTimeout(() => setTimeoutWarning(false), 10_000);
        }, endMs - 30_000);
      }
      sessionTimerRef.current = setTimeout(() => {
        handleStop();
      }, endMs);
    }
  }, [agentConfig, initTts, startAsr, greet, startTtsAnalysis, updateSession, sessionRef]);

  const handleStop = useCallback(async () => {
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    stopTtsAnalysis();
    stopAsr();
    destroyAgent();

    const currentSession = sessionRef.current;
    let storedSessionId = "";
    if (currentSession.transcript.length > 0) {
      const stored = saveSession(currentSession, agentConfig?.name);
      storedSessionId = stored.id;
    }

    const recorded = await recorderRef.current.stop();
    if (storedSessionId && (recorded.micBlob || recorded.ttsBlob)) {
      saveAudio(storedSessionId, recorded.micBlob, recorded.ttsBlob).then(() => {
        uploadToGcs(
          storedSessionId,
          gatewayConfig.httpBase,
          gatewayConfig.getSessionToken(),
        ).catch(() => {});
      });
    }

    updateSession({ isActive: false, isConnected: false });
    setStarted(false);
  }, [stopAsr, destroyAgent, stopTtsAnalysis, updateSession, sessionRef, agentConfig]);

  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Auto-scroll transcript to bottom when new segments arrive
  useEffect(() => {
    if (showTranscript && session.transcript.length > 0) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [showTranscript, session.transcript.length]);

  if (!agentConfig) {
    return (
      <div className="runtime-error fade-in">
        <h2>Agent not found</h2>
        <p>The agent with ID "{agentId}" does not exist or has been deleted.</p>
        {!isEmbed && (
          <button type="button" className="btn btn--primary" onClick={() => navigate("")}>
            Go to Dashboard
          </button>
        )}
      </div>
    );
  }

  const showEmotionCanvas = agentConfig.enableEmotionDetection && agentConfig.theme.bgStyle === "emotion-reactive";
  const showFloatingWords = agentConfig.theme.showFloatingWords;
  const showEmotionLabel = agentConfig.theme.showEmotionLabel && agentConfig.enableEmotionDetection;

  if (!started) {
    return (
      <div className="runtime-page" style={{ "--agent-primary": agentConfig.theme.primaryColor, "--agent-accent": agentConfig.theme.accentColor } as React.CSSProperties}>
        {showEmotionCanvas && <EmotionCanvas emotion="NEUTRAL" probs={{}} isActive={false} />}
        {!showEmotionCanvas && <div className="runtime-bg" />}
        <div className="runtime-start-screen fade-in">
          <span className="runtime-avatar-large">{agentConfig.avatar}</span>
          <h1 className="runtime-agent-name">{agentConfig.name}</h1>
          {agentConfig.description && (
            <p className="runtime-agent-desc">{agentConfig.description}</p>
          )}
          <button
            type="button"
            className={`runtime-start-btn ${connecting ? "runtime-start-btn--loading" : ""}`}
            onClick={handleStart}
            disabled={connecting}
          >
            {connecting ? "Connecting..." : "Start Conversation"}
          </button>
          <p className="runtime-powered"><WhissleLogo size={16} /> Powered by Whissle</p>
        </div>
        {!isEmbed && (
          <button type="button" className="runtime-back-btn" onClick={() => navigate("")}>
            ← Dashboard
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="runtime-page" style={{ "--agent-primary": agentConfig.theme.primaryColor, "--agent-accent": agentConfig.theme.accentColor } as React.CSSProperties}>
      {showEmotionCanvas ? (
        <EmotionCanvas emotion={session.currentEmotion} probs={session.currentEmotionProbs} isActive={session.isActive} />
      ) : (
        <div className="runtime-bg" />
      )}

      {showFloatingWords && (
        <FloatingWords transcript={session.transcript} currentEmotion={session.currentEmotion} />
      )}

      {/* Session timer */}
      {session.isActive && (
        <div className="runtime-timer">
          <span className="runtime-timer-dot" />
          {formatDuration(elapsed)}
          {agentConfig && agentConfig.maxSessionMinutes > 0 && (
            <span className="runtime-timer-remaining">
              {" / "}
              {formatDuration(Math.max(0, agentConfig.maxSessionMinutes * 60_000 - elapsed))}
              {" left"}
            </span>
          )}
        </div>
      )}

      {/* Recording indicator */}
      {session.isActive && (
        <div className="recording-indicator" aria-live="assertive">
          <span className="recording-indicator-dot" />
          <span className="recording-indicator-text">Recording</span>
        </div>
      )}

      {/* Screen reader transcript announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="false">
        {session.transcript.length > 0 && (
          <p>
            {session.transcript[session.transcript.length - 1]!.speaker === "agent" ? "Agent" : "User"}
            {": "}
            {session.transcript[session.transcript.length - 1]!.text}
          </p>
        )}
      </div>

      <VoiceOrb
        analyser={ttsAnalyser}
        turn={turn}
        emotion={turn === "agent" ? ttsEmotion : session.currentEmotion}
        agentName={agentConfig.name}
        isProcessing={isProcessing}
      />

      {showEmotionLabel && session.isActive && session.currentEmotion !== "NEUTRAL" && (
        <div className="emotion-label-float" aria-live="polite" aria-atomic="true">
          {EMOTION_LABELS[session.currentEmotion] || session.currentEmotion}
        </div>
      )}

      {/* Live transcript panel */}
      {session.isActive && showTranscript && session.transcript.length > 0 && (
        <div className="runtime-transcript-panel">
          <div className="runtime-transcript-header">
            <span>Transcript</span>
            <button type="button" className="runtime-transcript-close" onClick={() => setShowTranscript(false)} aria-label="Close transcript">
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="runtime-transcript-body">
            {session.transcript.map((seg) => (
              <div key={seg.id} className={`runtime-transcript-seg runtime-transcript-seg--${seg.speaker}`}>
                <span className="runtime-transcript-speaker">{seg.speaker === "agent" ? agentConfig.name : "You"}</span>
                <span className="runtime-transcript-text">{seg.text}</span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {/* Connection error banner */}
      {connectionError && (
        <div className="runtime-connection-error" role="alert">
          <Icon name="alert-circle" size={16} />
          <span>{connectionError}</span>
          <button type="button" onClick={() => setConnectionError(null)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Timeout warning */}
      {timeoutWarning && (
        <div className="runtime-timeout-warning" aria-live="assertive">
          Session ending in 30 seconds
        </div>
      )}

      <div className="runtime-bottom-controls">
        {session.isActive && (
          <button
            type="button"
            className={`runtime-transcript-toggle ${showTranscript ? "runtime-transcript-toggle--active" : ""}`}
            onClick={() => setShowTranscript((v) => !v)}
            aria-label={showTranscript ? "Hide transcript" : "Show transcript"}
            title="Toggle transcript"
          >
            <Icon name="message-square" size={18} />
          </button>
        )}
        <MicButton
          isActive={session.isActive}
          isConnected={session.isConnected}
          emotion={session.currentEmotion}
          onToggle={session.isActive ? handleStop : handleStart}
          primaryColor={agentConfig.theme.primaryColor}
        />
      </div>

      {session.isActive && (
        <button type="button" className="runtime-end-btn" onClick={handleStop}>
          End Session
        </button>
      )}

      {session.error && (
        <div className="runtime-toast">
          {session.error}
          <button type="button" onClick={() => updateSession({ error: null })}>&times;</button>
        </div>
      )}
    </div>
  );
}
