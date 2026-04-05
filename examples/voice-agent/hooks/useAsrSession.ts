import { useRef, useCallback } from "react";
import {
  AsrStreamClient,
  SharedMicManager,
  MicCapture,
  createBehavioralProfileManager,
  EMOTION_KEYS,
} from "@whissle/live-assist-core";
import type { StreamTranscriptSegment } from "@whissle/live-assist-core";
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

function normalizeEmotionProbList(arr: Array<{ token: string; probability: number }>): Array<{ emotion: string; probability: number }> | undefined {
  if (!arr.length) return undefined;
  return arr.map((e) => ({
    emotion: e.token.toUpperCase().replace(/^EMOTION_/, ""),
    probability: e.probability,
  }));
}

function normalizeIntentProbList(arr: Array<{ token: string; probability: number }>): Array<{ intent: string; probability: number }> | undefined {
  if (!arr.length) return undefined;
  return arr.map((e) => ({
    intent: e.token.toUpperCase().replace(/^INTENT_/, ""),
    probability: e.probability,
  }));
}

function normalizeGenderProbList(arr: Array<{ token: string; probability: number }>): Array<{ label: string; probability: number }> | undefined {
  if (!arr.length) return undefined;
  return arr.map((e) => ({
    label: e.token.toUpperCase().replace(/^GENDER_/, ""),
    probability: e.probability,
  }));
}

function normalizeAgeProbList(arr: Array<{ token: string; probability: number }>): Array<{ label: string; probability: number }> | undefined {
  if (!arr.length) return undefined;
  return arr.map((e) => ({
    label: e.token.toUpperCase().replace(/^AGE_/, ""),
    probability: e.probability,
  }));
}

function classifyMoment(
  text: string,
  emotion: string,
  emotionConf: number,
  intent: string | undefined,
  speaker: "user" | "other",
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

export interface AsrSessionCallbacks {
  onUtteranceFlush?: (text: string, speaker: "user" | "other") => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onMicStream?: (stream: MediaStream) => void;
  /** Fires on ANY transcript (partial or final) — used for instant barge-in. */
  onVoiceDetected?: () => void;
}

export function useAsrSession(
  asrUrl: string,
  sessionRef: React.MutableRefObject<SessionState>,
  updateSession: (patch: Partial<SessionState>) => void,
  callbacks?: AsrSessionCallbacks,
) {
  const asrRef = useRef<AsrStreamClient | null>(null);
  const micRef = useRef<SharedMicManager | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const profilerRef = useRef<ReturnType<typeof createBehavioralProfileManager> | null>(null);
  const utteranceBufferRef = useRef<string[]>([]);
  const utteranceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segIdCounter = useRef(0);
  const currentSpeakerRef = useRef<"user" | "other">("user");
  const emotionAccRef = useRef<Array<{ emotion: string; prob: number }>>([]);
  const intentAccRef = useRef<string[]>([]);
  const entityAccRef = useRef<Array<{ entity: string; text: string }>>([]);
  const lastSpeakerChangeRef = useRef(false);
  const lastProfilePushRef = useRef(0);
  const speechActiveRef = useRef(false);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  // Raw probability arrays from ASR — captured per-segment, exposed for agent metadata
  const rawEmotionProbsRef = useRef<Array<{ token: string; probability: number }>>([]);
  const rawIntentProbsRef = useRef<Array<{ token: string; probability: number }>>([]);
  const rawGenderProbsRef = useRef<Array<{ token: string; probability: number }>>([]);
  const rawAgeProbsRef = useRef<Array<{ token: string; probability: number }>>([]);
  // Snapshot at flush time — these are what the agent stream reads
  const flushedEmotionProbs = useRef<Array<{ token: string; probability: number }>>([]);
  const flushedIntentProbs = useRef<Array<{ token: string; probability: number }>>([]);
  const flushedGenderProbs = useRef<Array<{ token: string; probability: number }>>([]);
  const flushedAgeProbs = useRef<Array<{ token: string; probability: number }>>([]);

  /** Index into session.emotionTimeline — slice [start, end) belongs to current utterance at flush. */
  const emotionTimelineIdxAtLastFlushRef = useRef(0);
  /** First ASR audioOffset (ms) for this aggregated utterance — fallback if timeline slice is empty. */
  const utteranceAudioStartMsRef = useRef<number | null>(null);

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

    // Snapshot raw probs for agent metadata before clearing
    flushedEmotionProbs.current = rawEmotionProbsRef.current.length ? [...rawEmotionProbsRef.current] : [];
    flushedIntentProbs.current = rawIntentProbsRef.current.length ? [...rawIntentProbsRef.current] : [];
    flushedGenderProbs.current = rawGenderProbsRef.current.length ? [...rawGenderProbsRef.current] : [];
    flushedAgeProbs.current = rawAgeProbsRef.current.length ? [...rawAgeProbsRef.current] : [];

    emotionAccRef.current = [];
    intentAccRef.current = [];
    entityAccRef.current = [];
    rawEmotionProbsRef.current = [];
    rawIntentProbsRef.current = [];
    rawGenderProbsRef.current = [];
    rawAgeProbsRef.current = [];
    lastSpeakerChangeRef.current = false;

    const prevSnap = sessionRef.current;
    const globalTl = prevSnap.emotionTimeline;
    const sliceRaw = globalTl.slice(emotionTimelineIdxAtLastFlushRef.current);
    emotionTimelineIdxAtLastFlushRef.current = globalTl.length;

    const minGlobalMs = sliceRaw.length
      ? Math.min(...sliceRaw.map((e) => e.offset))
      : utteranceAudioStartMsRef.current ?? 0;
    const audioOffsetSec = minGlobalMs / 1000;

    const emotionTimelineUtterance =
      sliceRaw.length > 0
        ? sliceRaw.map((e) => ({
            offset: (e.offset - minGlobalMs) / 1000,
            emotion: e.emotion,
            confidence: e.confidence,
            probs: e.probs,
          }))
        : undefined;

    utteranceAudioStartMsRef.current = null;

    const seg: TranscriptSegment = {
      id: `seg_${++segIdCounter.current}`,
      text,
      timestamp: Date.now(),
      isFinal: true,
      speaker: currentSpeakerRef.current,
      audioOffsetSec,
      emotionTimelineUtterance,
      emotion: dominantEmotion,
      emotionConfidence: emotionConf,
      emotionProbs: normalizeEmotionProbList(flushedEmotionProbs.current),
      intent: dominantIntent,
      intentProbs: normalizeIntentProbList(flushedIntentProbs.current),
      genderProbs: normalizeGenderProbList(flushedGenderProbs.current),
      ageProbs: normalizeAgeProbList(flushedAgeProbs.current),
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

    if (currentSpeakerRef.current === "user") {
      cbRef.current?.onUtteranceFlush?.(text, "user");
    }

    speechActiveRef.current = false;
    cbRef.current?.onSpeechEnd?.();
  }, [sessionRef, updateSession]);

  const start = useCallback(async () => {
    const profiler = createBehavioralProfileManager();
    profilerRef.current = profiler;
    currentSpeakerRef.current = "user";
    segIdCounter.current = 0;

    emotionTimelineIdxAtLastFlushRef.current = 0;
    utteranceAudioStartMsRef.current = null;

    updateSession({
      isActive: true,
      isConnected: false,
      transcript: [],
      moments: [],
      emotionTimeline: [],
      currentEmotion: "NEUTRAL",
      currentEmotionProbs: {},
      profile: null,
      speakerLabel: "user",
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

        // Instant barge-in: fire on any transcript (partial or final)
        if (!speechActiveRef.current) {
          cbRef.current?.onVoiceDetected?.();
        }

        if (seg.speakerChange) {
          currentSpeakerRef.current = currentSpeakerRef.current === "user" ? "other" : "user";
          lastSpeakerChangeRef.current = true;
          updateSession({ speakerLabel: currentSpeakerRef.current });
        }

        if (seg.metadata_probs?.emotion?.length) {
          const { emotion, confidence } = topEmotion(seg.metadata_probs.emotion);
          emotionAccRef.current.push({ emotion, prob: confidence });
          rawEmotionProbsRef.current = seg.metadata_probs.emotion;

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
          rawIntentProbsRef.current = seg.metadata_probs.intent;
        }

        if ((seg.metadata_probs as Record<string, unknown>)?.gender) {
          rawGenderProbsRef.current = (seg.metadata_probs as Record<string, unknown>).gender as Array<{ token: string; probability: number }>;
        }
        if ((seg.metadata_probs as Record<string, unknown>)?.age) {
          rawAgeProbsRef.current = (seg.metadata_probs as Record<string, unknown>).age as Array<{ token: string; probability: number }>;
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
          if (!speechActiveRef.current) {
            speechActiveRef.current = true;
            cbRef.current?.onSpeechStart?.();
          }

          if (utteranceBufferRef.current.length === 0) {
            utteranceAudioStartMsRef.current = seg.audioOffset ?? 0;
          }

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

      const micStream = mic.getStream?.();
      if (micStream) cbRef.current?.onMicStream?.(micStream);

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

  return {
    start,
    stop,
    flushedEmotionProbs,
    flushedIntentProbs,
    flushedGenderProbs,
    flushedAgeProbs,
  };
}
