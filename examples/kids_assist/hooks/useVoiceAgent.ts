/**
 * Voice agent hook — thin wrapper around the gateway SSE stream.
 *
 * All intelligence (system prompts, tool definitions, multi-round tool
 * calling) lives server-side. This hook sends user text to
 * /agent/route/stream, consumes SSE events, and manages TTS playback.
 */

import { useRef, useCallback, useState, useEffect } from "react";
import {
  streamAgentRouter,
  type AgentStreamCallbacks,
  type AgentToolEvent,
} from "../lib/agent-stream";
import { RimeTtsClient } from "../lib/rime-tts";
import { gatewayConfig } from "../lib/gateway-config";
import type { KidsMode } from "../lib/modes";

export type { AgentToolEvent };

interface UseVoiceAgentOpts {
  mode: KidsMode;
  currentEmotion: string;
  emotionConfidence: number;
  childName?: string;
  childAge?: number;
  onToolCall?: (event: AgentToolEvent) => void;
  onStep?: (title: string, status?: string) => void;
  ttsSpeaker?: string;
}

export function useVoiceAgent({
  mode,
  currentEmotion,
  emotionConfidence,
  childName,
  childAge,
  onToolCall,
  onStep,
  ttsSpeaker,
}: UseVoiceAgentOpts) {
  const [agentText, setAgentText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const ttsRef = useRef<RimeTtsClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modeRef = useRef(mode);
  const emotionRef = useRef(currentEmotion);
  const emotionConfRef = useRef(emotionConfidence);
  const onToolCallRef = useRef(onToolCall);
  const onStepRef = useRef(onStep);
  const childNameRef = useRef(childName);
  const childAgeRef = useRef(childAge);

  modeRef.current = mode;
  emotionRef.current = currentEmotion;
  emotionConfRef.current = emotionConfidence;
  onToolCallRef.current = onToolCall;
  onStepRef.current = onStep;
  childNameRef.current = childName;
  childAgeRef.current = childAge;

  const initTts = useCallback(async () => {
    if (ttsRef.current) return;
    const tts = new RimeTtsClient({
      wsBase: gatewayConfig.ttsWsBase,
      speaker: ttsSpeaker ?? "cove",
      sampleRate: 22050,
    });
    tts.onSpeakingChange = (s) => setIsSpeaking(s);
    tts.onError = (e) => console.warn("[KidAgent TTS]", e.message);
    try {
      await tts.connect();
      ttsRef.current = tts;
    } catch (e) {
      console.warn("[KidAgent TTS] connect failed:", e);
    }
  }, [ttsSpeaker]);

  const sendToAgent = useCallback(async (userText: string) => {
    if (!userText.trim()) return;

    setIsProcessing(true);
    setAgentText("");

    const ac = new AbortController();
    abortRef.current = ac;

    const callbacks: AgentStreamCallbacks = {
      onStep: (ev) => {
        onStepRef.current?.(ev.title, ev.status);
      },
      onChunk: (text) => {
        setAgentText((prev) => prev + text);
      },
      onTtsReady: (text) => {
        if (ttsRef.current) ttsRef.current.speak(text);
      },
      onKidsTool: (ev) => {
        onToolCallRef.current?.(ev);
      },
      onDone: () => {
        if (ttsRef.current) ttsRef.current.flush();
        setIsProcessing(false);
      },
      onError: (msg) => {
        console.error("[KidAgent] Stream error:", msg);
        setIsProcessing(false);
      },
    };

    try {
      await streamAgentRouter(
        {
          query: userText,
          mode: modeRef.current,
          childName: childNameRef.current,
          childAge: childAgeRef.current,
          childEmotion: emotionRef.current,
          childEmotionConfidence: emotionConfRef.current,
        },
        callbacks,
        ac.signal,
      );
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      console.error("[KidAgent]", err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    ttsRef.current?.clear();
    setAgentText("");
    setIsProcessing(false);
  }, []);

  const greet = useCallback(async () => {
    await initTts();
    await sendToAgent("__greet__");
  }, [initTts, sendToAgent]);

  const reset = useCallback(() => {
    interrupt();
    setAgentText("");
  }, [interrupt]);

  const destroy = useCallback(() => {
    interrupt();
    ttsRef.current?.close();
    ttsRef.current = null;
  }, [interrupt]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      ttsRef.current?.close();
    };
  }, []);

  return {
    agentText,
    isSpeaking,
    isProcessing,
    sendToAgent,
    interrupt,
    greet,
    reset,
    destroy,
    initTts,
  };
}
