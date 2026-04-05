import { useRef, useState, useCallback, useEffect } from "react";
import {
  AsrStreamClient,
  SharedMicManager,
  createBehavioralProfileManager,
  streamLiveAssistWithFeedback,
} from "@whissle/live-assist-core";
import type { StreamTranscriptSegment } from "@whissle/live-assist-core";
import type {
  CaseConfig,
  ExaminationState,
  TranscriptSegment,
  Discrepancy,
  Objection,
  ElementStatus,
  PriorStatementChunk,
} from "../lib/types";
import { inferSpeaker } from "../lib/qa-segmenter";
import { detectObjections, resetObjectionCounter } from "../lib/objection-rules";
import {
  detectContradictions,
  parseAgentContradictions,
  cleanFeedbackText,
  resetContradictionCounter,
} from "../lib/contradiction-detector";
import {
  computeCredibility,
  computeEmotionStability,
} from "../lib/credibility-scoring";
import { analyzeChunkStability, VocalStabilityTracker } from "./vocal-stability-adapter";
import { gatewayConfig } from "../lib/gateway-config";

const FEEDBACK_INTERVAL_MS = 8_000;
const MIN_TRANSCRIPT_LENGTH = 30;

function normalizeEmotion(raw: string): string {
  let e = raw.toUpperCase().trim();
  if (e.startsWith("EMOTION_")) e = e.slice(8);
  return e || "NEUTRAL";
}

let segIdCounter = 0;

interface UseExaminationProps {
  config: CaseConfig;
  priorChunks: PriorStatementChunk[];
  customPrompt: string;
  agendaItems: Array<{ id: string; title: string; status: string; confidence: number }>;
}

export function useExaminationSession({
  config,
  priorChunks,
  customPrompt,
  agendaItems,
}: UseExaminationProps) {
  const [state, setState] = useState<ExaminationState>({
    isActive: false,
    isListening: false,
    segments: [],
    qaPairs: [],
    objections: [],
    discrepancies: [],
    elements: agendaItems.map((a) => ({
      id: a.id,
      title: a.title,
      status: "pending",
      confidence: 0,
      sentiment: "neutral",
      evidence: "",
    })),
    witnessEmotion: "NEUTRAL",
    witnessCredibility: 70,
    witnessVocalStability: 100,
    counselEmotion: "NEUTRAL",
    keywords: [],
    feedbackSummary: "",
    suggestions: [],
    elapsedSec: 0,
    error: null,
  });

  const micAsrRef = useRef<AsrStreamClient | null>(null);
  const tabAsrRef = useRef<AsrStreamClient | null>(null);
  const micManagerRef = useRef<SharedMicManager | null>(null);
  const profileManagerRef = useRef(createBehavioralProfileManager());
  const feedbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedbackAbortRef = useRef<AbortController | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const objectionsRef = useRef<Objection[]>([]);
  const discrepanciesRef = useRef<Discrepancy[]>([]);
  const fullTranscriptRef = useRef("");
  const lastSpeakerRef = useRef<string>("COUNSEL");
  const vocalTrackerRef = useRef(new VocalStabilityTracker());
  const witnessEmotionWindowRef = useRef<Array<{ emotion: string; confidence: number }>>([]);

  const intentCountsRef = useRef<Record<string, number>>({});
  const intentTotalRef = useRef(0);

  const processSegment = useCallback(
    (seg: StreamTranscriptSegment, channel: "mic" | "tab") => {
      const text = seg.text?.trim();
      if (!text) return;

      const now = Date.now();
      const emotionNorm = seg.metadata?.emotion
        ? normalizeEmotion(seg.metadata.emotion)
        : "NEUTRAL";
      const emotionConf =
        seg.metadata_probs?.emotion?.find(
          (e) => normalizeEmotion(e.token) === emotionNorm,
        )?.probability ?? 0.5;

      const topIntent =
        seg.metadata_probs?.intent?.reduce(
          (a, b) => (a.probability > b.probability ? a : b),
          { token: "NEUTRAL", probability: 0 },
        )?.token ?? "NEUTRAL";

      const speaker = inferSpeaker(
        text,
        channel,
        config.captureMode,
        lastSpeakerRef.current,
        !!seg.speakerChange,
      );

      if (seg.is_final) {
        lastSpeakerRef.current = speaker;
      }

      const segment: TranscriptSegment = {
        id: `seg_${segIdCounter++}`,
        channel,
        speaker,
        text,
        isFinal: seg.is_final !== false,
        timestamp: now,
        audioOffset: seg.audioOffset ?? 0,
        emotion: emotionNorm,
        emotionConfidence: emotionConf,
        intent: topIntent.toUpperCase(),
        intentProbs: seg.metadata_probs?.intent ?? [],
        emotionProbs: seg.metadata_probs?.emotion ?? [],
      };

      if (seg.metadata_probs?.emotion) {
        const profileChannel = channel === "mic" ? "microphone" : "system";
        profileManagerRef.current.update(
          profileChannel as "microphone" | "system",
          seg.metadata_probs.emotion,
          seg.metadata_probs.intent ?? [],
        );
      }

      if (speaker === "WITNESS") {
        witnessEmotionWindowRef.current.push({
          emotion: emotionNorm,
          confidence: emotionConf,
        });
        if (witnessEmotionWindowRef.current.length > 50) {
          witnessEmotionWindowRef.current.shift();
        }
      }

      if (seg.metadata_probs?.intent) {
        for (const { token, probability } of seg.metadata_probs.intent) {
          if (probability > 0.3) {
            const key = token.toUpperCase();
            intentCountsRef.current[key] = (intentCountsRef.current[key] ?? 0) + 1;
            intentTotalRef.current++;
          }
        }
      }

      if (seg.metadata_probs_timeline?.length) {
        const result = analyzeChunkStability(seg.metadata_probs_timeline);
        vocalTrackerRef.current.update(result);
      }

      if (seg.is_final) {
        fullTranscriptRef.current +=
          (fullTranscriptRef.current ? "\n" : "") +
          `[${speaker}]: ${text}`;
      }

      const newSegments = seg.is_final
        ? [...segmentsRef.current.filter((s) => s.isFinal), segment]
        : [...segmentsRef.current.filter((s) => s.isFinal), segment];
      segmentsRef.current = newSegments;

      let newObjections = objectionsRef.current;
      if (seg.is_final && speaker === "WITNESS") {
        const detected = detectObjections(text, segment.id, now, speaker);
        if (detected.length > 0) {
          newObjections = [...objectionsRef.current, ...detected];
          objectionsRef.current = newObjections;
        }

        const contradictions = detectContradictions(text, now, priorChunks);
        if (contradictions.length > 0) {
          const existing = new Set(discrepanciesRef.current.map((d) => d.summary));
          const novel = contradictions.filter((c) => !existing.has(c.summary));
          if (novel.length > 0) {
            const newDiscs = [...discrepanciesRef.current, ...novel];
            discrepanciesRef.current = newDiscs;
          }
        }
      }

      const emotionStability = computeEmotionStability(witnessEmotionWindowRef.current);
      const informCount = (intentCountsRef.current["INFORM"] ?? 0) +
        (intentCountsRef.current["STATEMENT"] ?? 0);
      const hedgingCount = intentCountsRef.current["QUESTION"] ?? 0;
      const total = Math.max(1, intentTotalRef.current);
      const directnessRatio = informCount / total;
      const hedgingRatio = hedgingCount / total;
      const evasionCount = newObjections.filter((o) => o.type === "NON_RESPONSIVE").length;

      const credibility = computeCredibility({
        emotionStability,
        directnessRatio,
        vocalStability: vocalTrackerRef.current.averageStability,
        hedgingRatio,
        contradictionCount: discrepanciesRef.current.length,
        evasionCount,
      });

      setState((prev) => ({
        ...prev,
        segments: newSegments,
        objections: objectionsRef.current,
        discrepancies: discrepanciesRef.current,
        witnessEmotion: speaker === "WITNESS" ? emotionNorm : prev.witnessEmotion,
        counselEmotion: speaker === "COUNSEL" ? emotionNorm : prev.counselEmotion,
        witnessCredibility: credibility.score,
        witnessVocalStability: vocalTrackerRef.current.averageStability,
      }));
    },
    [config.captureMode, priorChunks],
  );

  const runFeedback = useCallback(async () => {
    const transcript = fullTranscriptRef.current;
    if (transcript.length < MIN_TRANSCRIPT_LENGTH) return;
    if (feedbackAbortRef.current) feedbackAbortRef.current.abort();

    const abort = new AbortController();
    feedbackAbortRef.current = abort;

    const profiles = profileManagerRef.current.getProfiles();
    const emotionProfile: Record<string, number> = {};
    for (const [k, v] of Object.entries(profiles.other?.emotionProfile ?? profiles.user?.emotionProfile ?? {})) {
      emotionProfile[k] = v;
    }

    const intentSignals: Record<string, Record<string, number>> = {};
    if (intentTotalRef.current > 0) {
      const total = intentTotalRef.current;
      const normalized: Record<string, number> = {};
      for (const [k, v] of Object.entries(intentCountsRef.current)) {
        normalized[k] = v / total;
      }
      intentSignals.other = normalized;
    }

    try {
      await streamLiveAssistWithFeedback({
        agentUrl: config.agentUrl,
        transcript,
        userId: "court_analyst",
        mode: "legal_exam",
        custom_prompt: customPrompt,
        agenda_items: agendaItems.length > 0 ? agendaItems : undefined,
        emotion_profile: Object.keys(emotionProfile).length > 0 ? emotionProfile : undefined,
        intent_signals: Object.keys(intentSignals).length > 0 ? intentSignals : undefined,
        signal: abort.signal,
        callbacks: {
          onFeedbackChunk: () => {},
          onFeedback: (fb) => {
            const agentContradictions = parseAgentContradictions(fb.summary);
            const cleanSummary = cleanFeedbackText(fb.summary);

            if (agentContradictions.length > 0) {
              const existing = new Set(discrepanciesRef.current.map((d) => d.summary));
              const novel = agentContradictions.filter((c) => !existing.has(c.summary));
              if (novel.length > 0) {
                discrepanciesRef.current = [...discrepanciesRef.current, ...novel];
              }
            }

            setState((prev) => ({
              ...prev,
              feedbackSummary: cleanSummary,
              suggestions: fb.suggestions,
              discrepancies: discrepanciesRef.current,
            }));
          },
          onStatus: (status) => {
            const agendaStatus = status.agendaStatus;
            if (agendaStatus) {
              const elements: ElementStatus[] = agendaItems.map((item) => {
                const match = agendaStatus.find((a) => a.id === item.id);
                return {
                  id: item.id,
                  title: item.title,
                  status: (match?.status as ElementStatus["status"]) ?? "pending",
                  confidence: (match?.confidence as number) ?? 0,
                  sentiment: (match?.sentiment as string) ?? "neutral",
                  evidence: (match?.evidence as string) ?? "",
                };
              });
              setState((prev) => ({ ...prev, elements }));
            }
            if (status.keywords) {
              setState((prev) => ({ ...prev, keywords: status.keywords! }));
            }
          },
          onMemory: () => {},
          onAction: () => {},
          onDone: () => {},
          onError: (err) => {
            console.warn("[ExamSession] Feedback error:", err);
          },
        },
      });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.warn("[ExamSession] Feedback failed:", err);
      }
    }
  }, [config.agentUrl, customPrompt, agendaItems]);

  const start = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }));

    let mic: SharedMicManager | null = null;
    let micAsr: AsrStreamClient | null = null;

    try {
      await gatewayConfig.initSession();
      const token = gatewayConfig.getSessionToken();

      mic = new SharedMicManager();
      micAsr = new AsrStreamClient(config.asrUrl, {
        metadataProb: true,
        speakerEmbedding: false,
        ...(token ? { token } : {}),
      });
      micAsr.onTranscript = (seg) => processSegment(seg, "mic");
      micAsr.onError = (err) =>
        setState((prev) => ({ ...prev, error: `ASR error: ${err.message}` }));

      await mic.addConsumer("asr", (pcm) => micAsr!.sendPcm(pcm));
      await micAsr.connect();

      micManagerRef.current = mic;
      micAsrRef.current = micAsr;

      segIdCounter = 0;
      segmentsRef.current = [];
      objectionsRef.current = [];
      discrepanciesRef.current = [];
      fullTranscriptRef.current = "";
      lastSpeakerRef.current = "COUNSEL";
      witnessEmotionWindowRef.current = [];
      intentCountsRef.current = {};
      intentTotalRef.current = 0;
      vocalTrackerRef.current.reset();
      profileManagerRef.current.reset();
      resetObjectionCounter();
      resetContradictionCounter();

      startTimeRef.current = Date.now();

      clockTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setState((prev) => ({ ...prev, elapsedSec: elapsed }));
      }, 1000);

      feedbackTimerRef.current = setInterval(() => {
        runFeedback();
      }, FEEDBACK_INTERVAL_MS);

      setState((prev) => ({
        ...prev,
        isActive: true,
        isListening: true,
        segments: [],
        qaPairs: [],
        objections: [],
        discrepancies: [],
        elements: agendaItems.map((a) => ({
          id: a.id,
          title: a.title,
          status: "pending" as const,
          confidence: 0,
          sentiment: "neutral",
          evidence: "",
        })),
        witnessCredibility: 70,
        witnessVocalStability: 100,
        witnessEmotion: "NEUTRAL",
        counselEmotion: "NEUTRAL",
        keywords: [],
        feedbackSummary: "",
        suggestions: [],
        elapsedSec: 0,
        error: null,
      }));
    } catch (err: unknown) {
      if (mic) {
        mic.removeConsumer("asr");
        mic.destroy();
      }
      if (micAsr) micAsr.close();
      micManagerRef.current = null;
      micAsrRef.current = null;

      const msg =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Microphone access denied. Please allow microphone permission and try again."
            : err.message
          : "Failed to start session";
      setState((prev) => ({ ...prev, error: msg }));
    }
  }, [config, processSegment, runFeedback, agendaItems]);

  const stop = useCallback(() => {
    if (feedbackTimerRef.current) {
      clearInterval(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    if (clockTimerRef.current) {
      clearInterval(clockTimerRef.current);
      clockTimerRef.current = null;
    }
    if (feedbackAbortRef.current) {
      feedbackAbortRef.current.abort();
      feedbackAbortRef.current = null;
    }
    if (micManagerRef.current) {
      micManagerRef.current.removeConsumer("asr");
      micManagerRef.current.destroy();
      micManagerRef.current = null;
    }
    if (micAsrRef.current) {
      micAsrRef.current.close();
      micAsrRef.current = null;
    }
    if (tabAsrRef.current) {
      tabAsrRef.current.close();
      tabAsrRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isActive: false,
      isListening: false,
    }));
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { state, start, stop };
}
