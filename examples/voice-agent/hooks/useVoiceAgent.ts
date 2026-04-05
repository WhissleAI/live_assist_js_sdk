/**
 * Voice agent hook — manages the full voice conversation lifecycle.
 *
 * - Barge-in: when the user speaks, TTS is cleared and the running
 *   stream is aborted so the user never has to compete.
 * - Rolling context: the last N turns are sent with every request.
 * - Turn state: exposes `turn` ("user" | "agent" | "idle").
 */

import { useRef, useCallback, useState, useEffect } from "react";
import {
  streamAgentRouter,
  type AgentStreamCallbacks,
  type AgentToolEvent,
} from "../lib/agent-stream";
import { CartesiaTtsClient } from "../lib/cartesia-tts";
import type { AgentConfig } from "../lib/agent-config";
import { resolveVoiceId, DEFAULT_VOICE_ID } from "../lib/voice-catalog";

export type { AgentToolEvent };

export type TurnState = "idle" | "user" | "agent";

interface AgentUtterance {
  text: string;
  emotions: string[];
  /** Optional distribution derived from TTS / agent emotion tags for this utterance. */
  emotionProbs?: Array<{ emotion: string; probability: number }>;
}

interface UseVoiceAgentOpts {
  agentConfig: AgentConfig;
  currentEmotion: string;
  emotionConfidence: number;
  // Full ASR probability arrays for backend behavioral awareness
  emotionProbs?: Array<{ token: string; probability: number }>;
  intentProbs?: Array<{ token: string; probability: number }>;
  genderProbs?: Array<{ token: string; probability: number }>;
  ageProbs?: Array<{ token: string; probability: number }>;
  // Session-level behavioral data
  behavioralProfile?: Record<string, unknown> | null;
  voiceProfileSummary?: string;
  onToolCall?: (event: AgentToolEvent) => void;
  onStep?: (title: string, status?: string) => void;
  onAgentUtterance?: (utterance: AgentUtterance) => void;
  /** Fires when the agent begins a new streamed reply (after user message / interrupt). */
  onAgentTurnWallStart?: () => void;
}

interface ConversationTurn {
  role: "user" | "agent";
  text: string;
}

const MAX_CONTEXT_TURNS = 10;
const MAX_CONTEXT_CHARS = 2000;

function buildAgentEmotionProbsFromTags(tags: string[]): Array<{ emotion: string; probability: number }> | undefined {
  if (!tags.length) return undefined;
  const n = tags.length;
  return tags.map((e) => ({
    emotion: String(e).toUpperCase().replace(/^EMOTION_/, ""),
    probability: 1 / n,
  }));
}

function buildContextString(turns: ConversationTurn[]): string {
  const recent = turns.slice(-MAX_CONTEXT_TURNS);
  let ctx = "";
  for (const t of recent) {
    const prefix = t.role === "user" ? "User" : "Agent";
    const line = `${prefix}: ${t.text}\n`;
    if (ctx.length + line.length > MAX_CONTEXT_CHARS) break;
    ctx += line;
  }
  return ctx;
}

export function useVoiceAgent({
  agentConfig,
  currentEmotion,
  emotionConfidence,
  emotionProbs,
  intentProbs,
  genderProbs,
  ageProbs,
  behavioralProfile,
  voiceProfileSummary,
  onToolCall,
  onStep,
  onAgentUtterance,
  onAgentTurnWallStart,
}: UseVoiceAgentOpts) {
  const [agentText, setAgentText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [turn, setTurn] = useState<TurnState>("idle");

  const ttsRef = useRef<CartesiaTtsClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contextRef = useRef<ConversationTurn[]>([]);
  const pendingAgentTextRef = useRef("");
  const pendingEmotionsRef = useRef<string[]>([]);

  const agentConfigRef = useRef(agentConfig);
  const emotionRef = useRef(currentEmotion);
  const emotionConfRef = useRef(emotionConfidence);
  const emotionProbsRef = useRef(emotionProbs);
  const intentProbsRef = useRef(intentProbs);
  const genderProbsRef = useRef(genderProbs);
  const ageProbsRef = useRef(ageProbs);
  const behavioralProfileRef = useRef(behavioralProfile);
  const voiceProfileSummaryRef = useRef(voiceProfileSummary);
  const onToolCallRef = useRef(onToolCall);
  const onStepRef = useRef(onStep);
  const onAgentUtteranceRef = useRef(onAgentUtterance);
  const onAgentTurnWallStartRef = useRef(onAgentTurnWallStart);

  agentConfigRef.current = agentConfig;
  emotionRef.current = currentEmotion;
  emotionConfRef.current = emotionConfidence;
  emotionProbsRef.current = emotionProbs;
  intentProbsRef.current = intentProbs;
  genderProbsRef.current = genderProbs;
  ageProbsRef.current = ageProbs;
  behavioralProfileRef.current = behavioralProfile;
  voiceProfileSummaryRef.current = voiceProfileSummary;
  onToolCallRef.current = onToolCall;
  onStepRef.current = onStep;
  onAgentUtteranceRef.current = onAgentUtterance;
  onAgentTurnWallStartRef.current = onAgentTurnWallStart;

  const initTts = useCallback(async () => {
    if (ttsRef.current) {
      console.log("[VoiceAgent TTS] already initialized");
      return;
    }

    const apiKey = import.meta.env.VITE_CARTESIA_API_KEY as string;
    const cfg = agentConfigRef.current;
    const rawVoiceId = cfg.voiceId || (import.meta.env.VITE_CARTESIA_VOICE_ID as string);
    const voiceId = resolveVoiceId(rawVoiceId);

    if (voiceId !== rawVoiceId) {
      console.warn(
        `[VoiceAgent TTS] Invalid voice "${rawVoiceId}", falling back to default (${DEFAULT_VOICE_ID})`,
      );
    }

    console.log("[VoiceAgent TTS] init:", {
      hasApiKey: !!apiKey,
      voiceId,
      model: cfg.ttsModel || "(default)",
      language: cfg.language,
    });

    if (!apiKey || !voiceId) {
      console.error("[VoiceAgent TTS] Missing VITE_CARTESIA_API_KEY or voiceId");
      return;
    }

    const tts = new CartesiaTtsClient({
      apiKey,
      voiceId,
      modelId: cfg.ttsModel || (import.meta.env.VITE_CARTESIA_MODEL_ID as string) || undefined,
      sampleRate: 22050,
      language: cfg.language,
    });
    tts.onSpeakingChange = (s) => {
      setIsSpeaking(s);
      if (!s) {
        setTurn((prev) => (prev === "agent" ? "idle" : prev));
      }
    };
    tts.onError = (e) => console.warn("[VoiceAgent TTS] error:", e.message);
    try {
      await tts.connect();
      ttsRef.current = tts;
      console.log("[VoiceAgent TTS] connected successfully to Cartesia");
    } catch (e) {
      console.error("[VoiceAgent TTS] connect FAILED:", e);
    }
  }, []);

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Graceful fade-out: mute() ramps gain to 0 over 150ms then calls clear()
    if (ttsRef.current?.isSpeaking) {
      ttsRef.current.mute();
    } else {
      ttsRef.current?.clear();
    }

    const partialText = pendingAgentTextRef.current.trim();
    if (partialText) {
      contextRef.current.push({ role: "agent", text: partialText });
      const emos = [...pendingEmotionsRef.current];
      onAgentUtteranceRef.current?.({
        text: partialText,
        emotions: emos,
        emotionProbs: buildAgentEmotionProbsFromTags(emos),
      });
    }
    pendingAgentTextRef.current = "";
    pendingEmotionsRef.current = [];
    setIsProcessing(false);
    setTurn("idle");
  }, []);

  const onVoiceDetected = useCallback(() => {
    if (ttsRef.current?.isSpeaking) {
      ttsRef.current.mute();
      if (abortRef.current) {
        interrupt();
      }
      setTurn("user");
    }
  }, [interrupt]);

  const onUserSpeechStart = useCallback(() => {
    ttsRef.current?.mute();
    if (abortRef.current) {
      interrupt();
    }
    setTurn("user");
  }, [interrupt]);

  const onUserSpeechEnd = useCallback(() => {
    if (!ttsRef.current?.isSpeaking) {
      ttsRef.current?.unmute();
    }
  }, []);

  const sendToAgent = useCallback(async (userText: string) => {
    if (!userText.trim()) return;

    interrupt();

    onAgentTurnWallStartRef.current?.();

    if (userText !== "__greet__") {
      contextRef.current.push({ role: "user", text: userText.trim() });
    }

    setIsProcessing(true);
    setAgentText("");
    pendingAgentTextRef.current = "";
    pendingEmotionsRef.current = [];
    setTurn("agent");

    ttsRef.current?.unmute();

    const ac = new AbortController();
    abortRef.current = ac;

    const callbacks: AgentStreamCallbacks = {
      onStep: (ev) => {
        onStepRef.current?.(ev.title, ev.status);
      },
      onChunk: (text) => {
        pendingAgentTextRef.current += text;
        setAgentText((prev) => prev + text);
      },
      onTtsReady: (ev) => {
        console.log(
          "[VoiceAgent TTS] tts_ready →",
          JSON.stringify({ text: ev.text, emotion: ev.emotion, speed: ev.speed }),
        );
        if (ev.emotion?.length) {
          for (const e of ev.emotion) {
            if (!pendingEmotionsRef.current.includes(e)) {
              pendingEmotionsRef.current.push(e);
            }
          }
        }
        if (ttsRef.current) {
          console.log("[VoiceAgent TTS] calling speak(), connected:", ttsRef.current.connected);
          ttsRef.current.speak(ev.text, {
            emotion: ev.emotion,
            speed: ev.speed,
          });
        } else {
          console.warn("[VoiceAgent TTS] tts_ready received but TTS client is NULL");
        }
      },
      onToolCall: (ev) => {
        onToolCallRef.current?.(ev);
      },
      onDone: () => {
        if (ttsRef.current) ttsRef.current.flush();
        setIsProcessing(false);

        const finalText = pendingAgentTextRef.current.trim();
        if (finalText) {
          contextRef.current.push({ role: "agent", text: finalText });
          const emos = [...pendingEmotionsRef.current];
          onAgentUtteranceRef.current?.({
            text: finalText,
            emotions: emos,
            emotionProbs: buildAgentEmotionProbsFromTags(emos),
          });
        }
        pendingAgentTextRef.current = "";
        pendingEmotionsRef.current = [];

        if (contextRef.current.length > MAX_CONTEXT_TURNS * 2) {
          contextRef.current = contextRef.current.slice(-MAX_CONTEXT_TURNS);
        }
      },
      onError: (msg) => {
        console.error("[VoiceAgent] Stream error:", msg);
        setIsProcessing(false);
        setTurn("idle");
      },
    };

    try {
      await streamAgentRouter(
        {
          query: userText,
          agentConfig: agentConfigRef.current,
          currentEmotion: emotionRef.current,
          emotionConfidence: emotionConfRef.current,
          conversationContext: buildContextString(contextRef.current),
          emotionProbs: emotionProbsRef.current,
          intentProbs: intentProbsRef.current,
          genderProbs: genderProbsRef.current,
          ageProbs: ageProbsRef.current,
          behavioralProfile: behavioralProfileRef.current,
          voiceProfileSummary: voiceProfileSummaryRef.current,
        },
        callbacks,
        ac.signal,
      );
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      console.error("[VoiceAgent]", err);
    } finally {
      setIsProcessing(false);
    }
  }, [interrupt]);

  const greet = useCallback(async () => {
    await initTts();
    await sendToAgent("__greet__");
  }, [initTts, sendToAgent]);

  const reset = useCallback(() => {
    interrupt();
    setAgentText("");
    contextRef.current = [];
  }, [interrupt]);

  const destroy = useCallback(() => {
    interrupt();
    ttsRef.current?.close();
    ttsRef.current = null;
    contextRef.current = [];
  }, [interrupt]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      ttsRef.current?.close();
    };
  }, []);

  const getTtsClient = useCallback(() => ttsRef.current, []);

  return {
    agentText,
    isSpeaking,
    isProcessing,
    turn,
    sendToAgent,
    interrupt,
    onVoiceDetected,
    onUserSpeechStart,
    onUserSpeechEnd,
    greet,
    reset,
    destroy,
    initTts,
    getTtsClient,
  };
}
