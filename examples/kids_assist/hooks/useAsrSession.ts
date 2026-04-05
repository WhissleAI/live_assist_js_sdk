import { useRef, useCallback } from "react";
import {
  AsrStreamClient,
  SharedMicManager,
  MicCapture,
  createBehavioralProfileManager,
  EMOTION_KEYS,
} from "@whissle/live-assist-core";
import type { StreamTranscriptSegment, BehavioralProfile } from "@whissle/live-assist-core";
import type { SessionState, TranscriptSegment, Moment, EmotionTimelineEntry } from "../App";

const UTTERANCE_AGGREGATION_MS = 1200;

function topEmotion(probs: Array<{ token: string; probability: number }>): { emotion: string; confidence: number } {
  if (!probs.length) return { emotion: "NEUTRAL", confidence: 0 };
  const top = probs.reduce((a, b) => (a.probability > b.probability ? a : b));
  return {
    emotion: top.token.toUpperCase().replace(/^EMOTION_/, ""),
    confidence: top.probability,
  };
}

function classifyMoment(
  text: string,
  emotion: string,
  emotionConf: number,
  intent: string | undefined,
  speaker: "child" | "other",
  isSpeakerChange: boolean,
): Moment | null {
  if (isSpeakerChange) {
    return {
      id: `moment_${Date.now()}_sc`,
      timestamp: Date.now(),
      text,
      emotion,
      emotionConfidence: emotionConf,
      type: "speaker_change",
      speaker,
    };
  }

  if (emotion !== "NEUTRAL" && emotionConf > 0.4) {
    return {
      id: `moment_${Date.now()}_ep`,
      timestamp: Date.now(),
      text,
      emotion,
      emotionConfidence: emotionConf,
      type: "emotion_peak",
      speaker,
    };
  }

  if (intent === "QUESTION") {
    return {
      id: `moment_${Date.now()}_q`,
      timestamp: Date.now(),
      text,
      emotion,
      emotionConfidence: emotionConf,
      type: "question",
      speaker,
    };
  }

  return null;
}

export function useAsrSession(
  asrUrl: string,
  sessionRef: React.MutableRefObject<SessionState>,
  updateSession: (patch: Partial<SessionState>) => void,
  onUtteranceFlush?: (text: string, speaker: "child" | "other") => void,
) {
  const asrRef = useRef<AsrStreamClient | null>(null);
  const micRef = useRef<SharedMicManager | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const profilerRef = useRef<ReturnType<typeof createBehavioralProfileManager> | null>(null);
  const utteranceBufferRef = useRef<string[]>([]);
  const utteranceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segIdCounter = useRef(0);
  const currentSpeakerRef = useRef<"child" | "other">("child");
  const emotionAccRef = useRef<Array<{ emotion: string; prob: number }>>([]);
  const intentAccRef = useRef<string[]>([]);
  const entityAccRef = useRef<Array<{ entity: string; text: string }>>([]);
  const lastSpeakerChangeRef = useRef(false);
  const lastProfilePushRef = useRef(0);
  const onUtteranceFlushRef = useRef(onUtteranceFlush);
  onUtteranceFlushRef.current = onUtteranceFlush;

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

    const entities = entityAccRef.current.length > 0 ? [...entityAccRef.current] : undefined;
    const wasSpeakerChange = lastSpeakerChangeRef.current;

    emotionAccRef.current = [];
    intentAccRef.current = [];
    entityAccRef.current = [];
    lastSpeakerChangeRef.current = false;

    const seg: TranscriptSegment = {
      id: `seg_${++segIdCounter.current}`,
      text,
      timestamp: Date.now(),
      isFinal: true,
      speaker: currentSpeakerRef.current,
      emotion: dominantEmotion,
      emotionConfidence: emotionConf,
      intent: dominantIntent,
      entities,
    };

    const moment = classifyMoment(
      text,
      dominantEmotion,
      emotionConf,
      dominantIntent,
      currentSpeakerRef.current,
      wasSpeakerChange,
    );

    const prev = sessionRef.current;
    const nextTranscript = [...prev.transcript, seg];
    const nextMoments = moment ? [...prev.moments, moment] : prev.moments;

    updateSession({
      transcript: nextTranscript,
      moments: nextMoments,
    });

    if (currentSpeakerRef.current === "child") {
      onUtteranceFlushRef.current?.(text, "child");
    }
  }, [sessionRef, updateSession]);

  const start = useCallback(async () => {
    const profiler = createBehavioralProfileManager();
    profilerRef.current = profiler;
    currentSpeakerRef.current = "child";
    segIdCounter.current = 0;

    updateSession({
      isActive: true,
      isConnected: false,
      transcript: [],
      moments: [],
      emotionTimeline: [],
      currentEmotion: "NEUTRAL",
      currentEmotionProbs: {},
      profile: null,
      speakerLabel: "child",
      error: null,
      sessionStart: Date.now(),
    });

    try {
      const asr = new AsrStreamClient(asrUrl, {
        metadataProb: true,
        speakerEmbedding: true,
      });

      asr.onTranscript = (seg: StreamTranscriptSegment) => {
        if (!sessionRef.current.isActive) return;
        const text = (seg.text || "").trim();
        if (!text) return;

        if (seg.speakerChange) {
          currentSpeakerRef.current = currentSpeakerRef.current === "child" ? "other" : "child";
          lastSpeakerChangeRef.current = true;
          updateSession({ speakerLabel: currentSpeakerRef.current });
        }

        if (seg.metadata_probs?.emotion?.length) {
          const { emotion, confidence } = topEmotion(seg.metadata_probs.emotion);
          emotionAccRef.current.push({ emotion, prob: confidence });

          const probMap: Record<string, number> = {};
          for (const e of seg.metadata_probs.emotion) {
            const key = e.token.toUpperCase().replace(/^EMOTION_/, "");
            if (EMOTION_KEYS.includes(key as (typeof EMOTION_KEYS)[number])) {
              probMap[key] = e.probability;
            }
          }
          updateSession({
            currentEmotion: emotion,
            currentEmotionProbs: probMap,
          });
        }

        if (seg.metadata_probs?.intent?.length) {
          const topIntent = seg.metadata_probs.intent.reduce((a, b) =>
            a.probability > b.probability ? a : b
          );
          intentAccRef.current.push(topIntent.token.toUpperCase().replace(/^INTENT_/, ""));
        }

        if (seg.entities?.length) {
          for (const ent of seg.entities) {
            entityAccRef.current.push({ entity: ent.entity, text: ent.text });
          }
        }

        if (profilerRef.current && (seg.metadata_probs?.emotion?.length || seg.metadata_probs?.intent?.length)) {
          profilerRef.current.update(
            "microphone",
            seg.metadata_probs?.emotion ?? [],
            seg.metadata_probs?.intent ?? [],
          );
          const now = Date.now();
          if (now - lastProfilePushRef.current > 400) {
            lastProfilePushRef.current = now;
            updateSession({ profile: { ...profilerRef.current.getSessionUserProfile() } });
          }
        }

        if (seg.metadata_probs_timeline?.length) {
          const newEntries: EmotionTimelineEntry[] = [];
          for (const tw of seg.metadata_probs_timeline) {
            if (tw.emotion?.length) {
              const topEmo = tw.emotion.reduce((a, b) => (a.probability > b.probability ? a : b));
              newEntries.push({
                offset: (tw.offset ?? 0) + (seg.audioOffset ?? 0),
                emotion: topEmo.token.toUpperCase().replace(/^EMOTION_/, ""),
                confidence: topEmo.probability,
                probs: tw.emotion.map((e) => ({
                  emotion: e.token.toUpperCase().replace(/^EMOTION_/, ""),
                  probability: e.probability,
                })),
              });
            }
          }
          if (newEntries.length) {
            const prev = sessionRef.current;
            updateSession({ emotionTimeline: [...prev.emotionTimeline, ...newEntries] });
          }
        }

        if (seg.is_final) {
          utteranceBufferRef.current.push(text);

          if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
          utteranceTimerRef.current = setTimeout(() => {
            flushUtterance();
          }, UTTERANCE_AGGREGATION_MS);

          if (seg.utterance_end) {
            if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
            flushUtterance();
          }
        }
      };

      asr.onError = (err) => updateSession({ error: err.message });
      asrRef.current = asr;
      await asr.connect();

      const mic = new SharedMicManager("/audio-capture-processor.js");
      micRef.current = mic;
      const capture = new MicCapture(mic, (pcm) => asr.sendPcm(pcm));
      captureRef.current = capture;

      const micErr = await capture.start();
      if (micErr) {
        updateSession({ error: `Microphone: ${micErr}` });
        return;
      }

      updateSession({ isConnected: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      updateSession({ error: msg, isActive: false });
    }
  }, [asrUrl, sessionRef, updateSession, flushUtterance]);

  const stop = useCallback(() => {
    if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
    if (utteranceBufferRef.current.length > 0) flushUtterance();

    captureRef.current?.stop();
    asrRef.current?.close();
    micRef.current?.destroy();

    captureRef.current = null;
    asrRef.current = null;
    micRef.current = null;

    updateSession({ isActive: false, isConnected: false });
  }, [updateSession, flushUtterance]);

  return { start, stop };
}
