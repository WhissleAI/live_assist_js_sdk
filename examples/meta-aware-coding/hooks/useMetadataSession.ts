import { useRef, useCallback, useState } from "react";
import {
  AsrStreamClient,
  SharedMicManager,
  MicCapture,
  createBehavioralProfileManager,
  EMOTION_KEYS,
} from "@whissle/live-assist-core";
import type {
  StreamTranscriptSegment,
  TranscriptEntry,
  BehavioralProfile,
  SpeechRate,
} from "@whissle/live-assist-core";

export interface MetadataState {
  isActive: boolean;
  isConnected: boolean;
  error: string | null;
  transcript: TranscriptEntry[];
  currentEmotion: string;
  currentEmotionProbs: Record<string, number>;
  currentIntent: string;
  currentIntentProbs: Record<string, number>;
  speechRate: SpeechRate | null;
  speakerLabel: string;
  profile: BehavioralProfile | null;
  lastRawSegment: StreamTranscriptSegment | null;
  emotionTimeline: Array<{
    offset: number;
    emotion: string;
    confidence: number;
    probs?: Array<{ emotion: string; probability: number }>;
  }>;
}

const INITIAL_STATE: MetadataState = {
  isActive: false,
  isConnected: false,
  error: null,
  transcript: [],
  currentEmotion: "NEUTRAL",
  currentEmotionProbs: {},
  currentIntent: "",
  currentIntentProbs: {},
  speechRate: null,
  speakerLabel: "user",
  profile: null,
  lastRawSegment: null,
  emotionTimeline: [],
};

const UTTERANCE_AGGREGATION_MS = 1200;

function topFromProbs(probs: Array<{ token: string; probability: number }>): { label: string; confidence: number } {
  if (!probs.length) return { label: "NEUTRAL", confidence: 0 };
  const top = probs.reduce((a, b) => (a.probability > b.probability ? a : b));
  return { label: top.token.toUpperCase().replace(/^(EMOTION_|INTENT_)/, ""), confidence: top.probability };
}

export function useMetadataSession(asrUrl: string, token: string) {
  const [state, setState] = useState<MetadataState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const asrRef = useRef<AsrStreamClient | null>(null);
  const micManagerRef = useRef<SharedMicManager | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const profilerRef = useRef<ReturnType<typeof createBehavioralProfileManager> | null>(null);

  const utteranceBufferRef = useRef<string[]>([]);
  const utteranceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segIdRef = useRef(0);
  const emotionAccRef = useRef<Array<{ emotion: string; prob: number }>>([]);
  const intentAccRef = useRef<string[]>([]);
  const currentSpeakerRef = useRef<"user" | "other">("user");

  const patch = useCallback((p: Partial<MetadataState>) => {
    setState((prev) => ({ ...prev, ...p }));
  }, []);

  const flushUtterance = useCallback(() => {
    const text = utteranceBufferRef.current.join(" ").trim();
    utteranceBufferRef.current = [];
    if (!text) return;

    const accEmotions = emotionAccRef.current;
    let dominantEmotion = "NEUTRAL";
    let emotionConf = 0;
    if (accEmotions.length > 0) {
      const best = accEmotions.reduce((a, b) => (a.prob > b.prob ? a : b));
      dominantEmotion = best.emotion;
      emotionConf = best.prob;
    }

    const intents = intentAccRef.current;
    const dominantIntent = intents.length > 0
      ? intents.reduce((a, b, _i, arr) =>
          arr.filter((v) => v === a).length >= arr.filter((v) => v === b).length ? a : b
        )
      : undefined;

    emotionAccRef.current = [];
    intentAccRef.current = [];

    const entry: TranscriptEntry = {
      channel: currentSpeakerRef.current === "user" ? "mic" : "tab",
      text,
      is_final: true,
      _id: ++segIdRef.current,
      _ts: Date.now(),
      metadata: {
        emotion: dominantEmotion,
        emotionConfidence: emotionConf,
        intent: dominantIntent,
      },
    };

    setState((prev) => ({
      ...prev,
      transcript: [...prev.transcript, entry],
    }));
  }, []);

  const start = useCallback(async () => {
    const profiler = createBehavioralProfileManager();
    profilerRef.current = profiler;
    currentSpeakerRef.current = "user";
    segIdRef.current = 0;

    patch({
      ...INITIAL_STATE,
      isActive: true,
    });

    try {
      const url = token
        ? `${asrUrl}?token=${encodeURIComponent(token)}`
        : asrUrl;

      const asr = new AsrStreamClient(url, {
        metadataProb: true,
        speakerEmbedding: true,
        wordTimestamps: true,
      });

      asr.onTranscript = (seg: StreamTranscriptSegment) => {
        if (!stateRef.current.isActive) return;
        const text = (seg.text || "").trim();
        if (!text) return;

        // Store raw segment for display
        const rawForDisplay = { ...seg };
        // Remove embedding from display (too large)
        if (rawForDisplay.speakerEmbedding) {
          rawForDisplay.speakerEmbedding = [`[${rawForDisplay.speakerEmbedding.length} floats]`] as unknown as number[];
        }
        patch({ lastRawSegment: rawForDisplay });

        // Speaker change
        if (seg.speakerChange) {
          currentSpeakerRef.current = currentSpeakerRef.current === "user" ? "other" : "user";
          patch({ speakerLabel: currentSpeakerRef.current });
        }

        // Emotion probs
        if (seg.metadata_probs?.emotion?.length) {
          const { label, confidence } = topFromProbs(seg.metadata_probs.emotion);
          emotionAccRef.current.push({ emotion: label, prob: confidence });

          const probMap: Record<string, number> = {};
          for (const e of seg.metadata_probs.emotion) {
            const key = e.token.toUpperCase().replace(/^EMOTION_/, "");
            probMap[key] = e.probability;
          }
          patch({ currentEmotion: label, currentEmotionProbs: probMap });
        }

        // Intent probs
        if (seg.metadata_probs?.intent?.length) {
          const { label } = topFromProbs(seg.metadata_probs.intent);
          intentAccRef.current.push(label);

          const probMap: Record<string, number> = {};
          for (const e of seg.metadata_probs.intent) {
            const key = e.token.toUpperCase().replace(/^INTENT_/, "");
            probMap[key] = e.probability;
          }
          patch({ currentIntent: label, currentIntentProbs: probMap });
        }

        // Speech rate
        if (seg.speech_rate) {
          patch({ speechRate: seg.speech_rate });
        }

        // Emotion timeline
        if (seg.metadata_probs_timeline?.length) {
          const newEntries = seg.metadata_probs_timeline
            .filter((tw) => tw.emotion?.length)
            .map((tw) => {
              const topEmo = tw.emotion!.reduce((a, b) => (a.probability > b.probability ? a : b));
              return {
                offset: (tw.offset ?? 0) + (seg.audioOffset ?? 0),
                emotion: topEmo.token.toUpperCase().replace(/^EMOTION_/, ""),
                confidence: topEmo.probability,
                probs: tw.emotion!.map((e) => ({
                  emotion: e.token.toUpperCase().replace(/^EMOTION_/, ""),
                  probability: e.probability,
                })),
              };
            });
          if (newEntries.length) {
            setState((prev) => ({
              ...prev,
              emotionTimeline: [...prev.emotionTimeline, ...newEntries],
            }));
          }
        }

        // Behavioral profiling
        if (profilerRef.current && (seg.metadata_probs?.emotion?.length || seg.metadata_probs?.intent?.length)) {
          profilerRef.current.update(
            "microphone",
            seg.metadata_probs?.emotion ?? [],
            seg.metadata_probs?.intent ?? [],
          );
          patch({ profile: { ...profilerRef.current.getSessionUserProfile() } });
        }

        // Utterance aggregation
        if (seg.is_final) {
          utteranceBufferRef.current.push(text);
          if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
          utteranceTimerRef.current = setTimeout(flushUtterance, UTTERANCE_AGGREGATION_MS);

          if (seg.utterance_end) {
            if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
            flushUtterance();
          }
        }
      };

      asr.onError = (err) => patch({ error: err.message });
      asrRef.current = asr;
      await asr.connect();

      const mic = new SharedMicManager("/audio-capture-processor.js");
      micManagerRef.current = mic;
      const capture = new MicCapture(mic, (pcm) => asr.sendPcm(pcm));
      captureRef.current = capture;

      const micErr = await capture.start();
      if (micErr) {
        patch({ error: `Microphone: ${micErr}`, isActive: false });
        return;
      }

      patch({ isConnected: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      patch({ error: msg, isActive: false });
    }
  }, [asrUrl, token, patch, flushUtterance]);

  const stop = useCallback(() => {
    if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
    if (utteranceBufferRef.current.length > 0) flushUtterance();

    captureRef.current?.stop();
    asrRef.current?.close();
    micManagerRef.current?.destroy();

    captureRef.current = null;
    asrRef.current = null;
    micManagerRef.current = null;

    patch({ isActive: false, isConnected: false });
  }, [patch, flushUtterance]);

  return { state, start, stop };
}
