import { useRef, useState, useCallback, useEffect } from "react";
import {
  AsrStreamClient,
  SharedMicManager,
  createBehavioralProfileManager,
  EMOTION_KEYS,
} from "@whissle/live-assist-core";
import type { StreamTranscriptSegment } from "@whissle/live-assist-core";
import { streamAgentChat } from "../lib/agent-stream";
import type { ChatMessage } from "../lib/agent-stream";
import type { ToolCallResult } from "../lib/roles";
import { CartesiaTtsClient } from "../lib/cartesia-tts";
import { INTERVIEW_TOOLS, buildSystemPrompt } from "../lib/roles";
import type { AnswerScore } from "../lib/scoring";
import { computeDeliveryMetrics, identifyKeyMoments, generateBehavioralNarrative } from "../lib/scoring";
import { countFillers } from "../lib/fillers";
import { computeWPM } from "../lib/pace";
import {
  generateDeliveryHints,
  generateContentHints,
  generateMetaHints,
  generateAlignmentHints,
  generatePauseHints,
  generateStabilityHints,
  pickTopHints,
  createHintState,
} from "../lib/hints";
import type { Hint, HintContext, HintState } from "../lib/hints";
import type { GapAnalysis } from "../lib/prep";
import type { InterviewConfig } from "../App";
import { createAlignmentTracker } from "../lib/entity-tracker";
import type { AlignmentState } from "../lib/entity-tracker";
import { analyzeChunkStability, VocalStabilityTracker } from "../lib/vocal-stability";
import { IntentFlowTracker } from "../lib/intent-analysis";

function normalizeEmotion(raw: string): string {
  let e = raw.toUpperCase().trim();
  if (e.startsWith("EMOTION_")) e = e.slice(8);
  return e || "NEUTRAL";
}

const MAX_TOOL_ROUNDS = 4;

interface UseInterviewSessionProps {
  config: InterviewConfig;
  gapAnalysis: GapAnalysis | null;
  onAutoEnd?: (answers: AnswerScore[], endData: ToolCallResult | null) => void;
}

export interface InterviewState {
  isActive: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  currentEmotion: string;
  confidenceScore: number;
  speakingPaceWPM: number;
  partialTranscript: string;
  fullTranscript: string;
  questionIndex: number;
  questionText: string;
  answerDurationSec: number;
  fillerCount: number;
  answers: AnswerScore[];
  activeHints: Hint[];
  agentText: string;
  endData: ToolCallResult | null;
  error: string | null;
  jdAlignment: AlignmentState | null;
  vocalStability: number;
  thinkTimeSec: number;
  sessionElapsedSec: number;
}

export function useInterviewSession({ config, gapAnalysis, onAutoEnd }: UseInterviewSessionProps) {
  const [state, setState] = useState<InterviewState>({
    isActive: false,
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    currentEmotion: "NEUTRAL",
    confidenceScore: 50,
    speakingPaceWPM: 0,
    partialTranscript: "",
    fullTranscript: "",
    questionIndex: 0,
    questionText: "",
    answerDurationSec: 0,
    fillerCount: 0,
    answers: [],
    activeHints: [],
    agentText: "",
    endData: null,
    error: null,
    jdAlignment: null,
    vocalStability: 100,
    thinkTimeSec: 0,
    sessionElapsedSec: 0,
  });

  const asrRef = useRef<AsrStreamClient | null>(null);
  const micRef = useRef<SharedMicManager | null>(null);
  const ttsRef = useRef<CartesiaTtsClient | null>(null);
  const profileRef = useRef(createBehavioralProfileManager());
  const messagesRef = useRef<ChatMessage[]>([]);
  const streamAbortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  const answerStartRef = useRef(0);
  const answerSegmentsRef = useRef<Array<{ text: string; audioOffset: number }>>([]);
  const emotionAccRef = useRef<Array<{ emotion: string; prob: number }>>([]);
  const intentAccRef = useRef<string[]>([]);
  const answerEmotionTimelineRef = useRef<Array<{ offset: number; emotion: string; confidence: number }>>([]);
  const questionTextRef = useRef("");
  const questionCategoryRef = useRef("intro");
  const questionIndexRef = useRef(0);
  const fillerCountRef = useRef(0);
  const fullTranscriptRef = useRef("");
  const hintIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const endDataRef = useRef<ToolCallResult | null>(null);
  const answersRef = useRef<AnswerScore[]>([]);

  const alignmentTrackerRef = useRef(createAlignmentTracker(gapAnalysis));
  const vocalTrackerRef = useRef(new VocalStabilityTracker());
  const intentTrackerRef = useRef(new IntentFlowTracker());
  const hintStateRef = useRef<HintState>(createHintState());

  const sessionStartTimeRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const agentDoneSpeakingRef = useRef(0);
  const firstSegmentReceivedRef = useRef(false);
  const thinkTimeRef = useRef(0);
  const lastSegmentTimeRef = useRef(0);
  const longestPauseRef = useRef(0);

  const resetAnswerState = useCallback(() => {
    answerStartRef.current = Date.now();
    answerSegmentsRef.current = [];
    emotionAccRef.current = [];
    intentAccRef.current = [];
    answerEmotionTimelineRef.current = [];
    fillerCountRef.current = 0;
    fullTranscriptRef.current = "";
    firstSegmentReceivedRef.current = false;
    thinkTimeRef.current = 0;
    lastSegmentTimeRef.current = 0;
    longestPauseRef.current = 0;
    vocalTrackerRef.current.reset();
    intentTrackerRef.current.reset();
    hintStateRef.current = createHintState();
    setState((prev) => ({
      ...prev,
      partialTranscript: "",
      fullTranscript: "",
      answerDurationSec: 0,
      fillerCount: 0,
      activeHints: [],
      confidenceScore: 50,
      speakingPaceWPM: 0,
      vocalStability: 100,
      thinkTimeSec: 0,
    }));
  }, []);

  const generateHints = useCallback(() => {
    if (!config.hintsEnabled) return;
    const s = stateRef.current;
    if (s.isProcessing || s.answerDurationSec < 3) return;

    const userProfile = profileRef.current.getProfiles().user;
    const emotionProbs: Record<string, number> = {};
    for (const key of EMOTION_KEYS) {
      emotionProbs[key] = userProfile.emotionProfile[key] ?? 0;
    }

    const ctx: HintContext = {
      currentEmotion: s.currentEmotion,
      emotionProbs,
      confidenceScore: s.confidenceScore,
      speakingPaceWPM: s.speakingPaceWPM,
      answerDurationSec: s.answerDurationSec,
      fillerWordCount: s.fillerCount,
      partialTranscript: fullTranscriptRef.current,
      questionCategory: questionCategoryRef.current,
      questionIndex: questionIndexRef.current,
      jdKeyRequirements: gapAnalysis?.skillsMatch
        ?.filter((sk) => sk.status !== "match")
        .map((sk) => sk.skill) ?? [],
      resumeStrengths: gapAnalysis?.skillsMatch
        ?.filter((sk) => sk.status === "match")
        .map((sk) => sk.skill) ?? [],
      jdCoveragePct: s.jdAlignment?.coveragePercent ?? 0,
      unmatchedSkills: s.jdAlignment?.matches?.filter((m) => !m.mentioned).map((m) => m.skill) ?? [],
      vocalStability: s.vocalStability,
      thinkTimeSec: s.thinkTimeSec,
      isPassive: intentTrackerRef.current.isPassive,
      isHedging: intentTrackerRef.current.isHedging,
    };

    const hs = hintStateRef.current;
    const delivery = generateDeliveryHints(ctx, hs);
    const content = generateContentHints(ctx);
    const meta = generateMetaHints(ctx);
    const alignment = generateAlignmentHints(ctx);
    const pause = generatePauseHints(ctx);
    const stability = generateStabilityHints(ctx);
    const all = [...meta, ...alignment, ...stability, ...delivery, ...pause, ...content];
    const picked = pickTopHints(all, 2, hs);

    if (picked.length > 0) {
      setState((prev) => ({ ...prev, activeHints: picked }));
    }
  }, [config.hintsEnabled, gapAnalysis]);

  const processSegment = useCallback((seg: StreamTranscriptSegment) => {
    const now = Date.now();

    if (!firstSegmentReceivedRef.current && agentDoneSpeakingRef.current > 0) {
      thinkTimeRef.current = (now - agentDoneSpeakingRef.current) / 1000;
      setState((prev) => ({ ...prev, thinkTimeSec: thinkTimeRef.current }));
      firstSegmentReceivedRef.current = true;
    }

    if (lastSegmentTimeRef.current > 0) {
      const gap = (now - lastSegmentTimeRef.current) / 1000;
      if (gap > longestPauseRef.current) longestPauseRef.current = gap;
    }
    lastSegmentTimeRef.current = now;

    if (seg.text) {
      const text = seg.text.trim();
      if (!text) return;

      const elapsed = (now - answerStartRef.current) / 1000;

      if (seg.is_final) {
        answerSegmentsRef.current.push({ text, audioOffset: seg.audioOffset ?? now });

        // Count fillers only on final segments to avoid double-counting
        // from overlapping partial updates
        const { count } = countFillers(text);
        fillerCountRef.current += count;

        fullTranscriptRef.current += (fullTranscriptRef.current ? " " : "") + text;
        const wpm = computeWPM(answerSegmentsRef.current);
        const alignment = alignmentTrackerRef.current.processText(text, elapsed);
        setState((prev) => ({
          ...prev,
          fullTranscript: fullTranscriptRef.current,
          partialTranscript: "",
          fillerCount: fillerCountRef.current,
          speakingPaceWPM: wpm,
          answerDurationSec: elapsed,
          jdAlignment: alignment,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          partialTranscript: text,
          answerDurationSec: elapsed,
        }));
      }
    }

    if (seg.entities && seg.entities.length > 0) {
      const elapsed = (now - answerStartRef.current) / 1000;
      const alignment = alignmentTrackerRef.current.processEntities(seg.entities, elapsed);
      setState((prev) => ({ ...prev, jdAlignment: alignment }));
    }

    if (seg.metadata_probs_timeline && seg.metadata_probs_timeline.length > 0) {
      const result = analyzeChunkStability(seg.metadata_probs_timeline);
      vocalTrackerRef.current.update(result);
      setState((prev) => ({ ...prev, vocalStability: vocalTrackerRef.current.averageStability }));
    }

    if (seg.metadata_probs?.intent && seg.metadata_probs.intent.length > 0) {
      intentTrackerRef.current.update(seg.metadata_probs.intent);
    }

    if (seg.metadata) {
      const emotionNorm = normalizeEmotion(seg.metadata.emotion ?? "neutral");
      setState((prev) => ({ ...prev, currentEmotion: emotionNorm }));

      if (seg.metadata_probs?.emotion) {
        profileRef.current.update(
          "microphone",
          seg.metadata_probs.emotion,
          seg.metadata_probs.intent ?? [],
        );
        for (const { token, probability } of seg.metadata_probs.emotion) {
          emotionAccRef.current.push({ emotion: normalizeEmotion(token), prob: probability });
        }
      }

      const topEmotionProb = seg.metadata_probs?.emotion?.find(
        (e) => normalizeEmotion(e.token) === emotionNorm
      )?.probability ?? 0.5;

      answerEmotionTimelineRef.current.push({
        offset: now,
        emotion: emotionNorm,
        confidence: topEmotionProb,
      });

      const userProfile = profileRef.current.getProfiles().user;
      const fearProb = userProfile.emotionProfile["FEAR"] ?? 0;
      const sadProb = userProfile.emotionProfile["SAD"] ?? 0;
      const confScore = Math.round((1 - (fearProb + sadProb)) * 100);
      setState((prev) => ({ ...prev, confidenceScore: Math.max(0, Math.min(100, confScore)) }));
    }

    if (seg.metadata?.intent) {
      intentAccRef.current.push(seg.metadata.intent.toUpperCase());
    }
  }, []);

  const buildCurrentSystemMsg = useCallback((): ChatMessage => {
    const userProfile = profileRef.current.getProfiles().user;
    let emotionContext = "";
    const sorted = Object.entries(userProfile.emotionProfile)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    const topEmotions: string[] = [];
    for (const [k, v] of sorted) {
      if (v > 0.1) topEmotions.push(`${k}: ${(v * 100).toFixed(0)}%`);
    }
    if (topEmotions.length > 0) {
      emotionContext = `\n## CANDIDATE EMOTIONAL STATE (detected from voice)\n${topEmotions.join(", ")}\nAdapt your approach based on this.`;
    }

    return {
      role: "system",
      content: buildSystemPrompt(
        config.jdText,
        config.resumeText,
        gapAnalysis ? JSON.stringify(gapAnalysis.skillsMatch) : "",
        config.difficulty,
        emotionContext,
      ),
    };
  }, [config, gapAnalysis]);

  const streamAgentResponse = useCallback(async (abort: AbortController): Promise<{ text: string; toolCalls: ToolCallResult[] }> => {
    let fullResponse = "";
    const toolCalls: ToolCallResult[] = [];

    const stream = streamAgentChat(config.agentUrl, messagesRef.current, abort.signal, INTERVIEW_TOOLS);

    for await (const token of stream) {
      if (abort.signal.aborted) break;

      if (typeof token === "string") {
        fullResponse += token;
        setState((prev) => ({ ...prev, agentText: prev.agentText + token }));

        if (ttsRef.current) {
          ttsRef.current.speak(token);
        }
      } else {
        toolCalls.push(token);
      }
    }

    return { text: fullResponse, toolCalls };
  }, [config.agentUrl]);

  const processScoreAnswer = useCallback((tc: ToolCallResult) => {
    const args = tc.arguments;
    const durationSec = (Date.now() - answerStartRef.current) / 1000;
    const delivery = computeDeliveryMetrics(
      emotionAccRef.current,
      intentAccRef.current,
      fillerCountRef.current,
      [computeWPM(answerSegmentsRef.current)].filter((w) => w > 0),
      durationSec,
    );
    const moments = identifyKeyMoments(answerEmotionTimelineRef.current, answerStartRef.current);
    const { fillers: fillerBreakdown } = countFillers(fullTranscriptRef.current);
    const behavioralNarrative = generateBehavioralNarrative(
      delivery,
      answerEmotionTimelineRef.current,
      fillerBreakdown,
      answerStartRef.current,
    );

    const intentAnalysis = intentTrackerRef.current.analyze();

    const score: AnswerScore = {
      questionIndex: questionIndexRef.current,
      questionText: questionTextRef.current,
      questionCategory: (args.question_category as string) ?? "behavioral",
      answerText: fullTranscriptRef.current,
      contentScore: (args.content_score as number) ?? 50,
      structure: (args.structure as string) ?? "direct",
      strengths: (args.strengths as string[]) ?? [],
      improvements: (args.improvements as string[]) ?? [],
      delivery,
      emotionTimeline: answerEmotionTimelineRef.current.slice(),
      jdGapsAddressed: (args.jd_gaps_addressed as string[]) ?? [],
      keyMoments: moments,
      whatInterviewerThinks: (args.what_interviewer_thinks as string) ?? "",
      problematicQuote: (args.problematic_quote as string) ?? "",
      suggestedReframe: (args.suggested_reframe as string) ?? "",
      behavioralNarrative,
      fillerBreakdown,
      vocalStability: vocalTrackerRef.current.averageStability,
      convictionMoments: vocalTrackerRef.current.convictionMoments,
      microNervousMoments: vocalTrackerRef.current.microNervousMoments,
      intentPattern: intentAnalysis.pattern,
      intentShift: intentAnalysis.dominantShift,
    };

    answersRef.current = [...answersRef.current, score];
    setState((prev) => ({
      ...prev,
      answers: answersRef.current,
      questionIndex: prev.questionIndex + 1,
    }));
    questionIndexRef.current += 1;

    const cat = args.question_category as string | undefined;
    if (cat) questionCategoryRef.current = cat;

    messagesRef.current.push({
      role: "tool",
      content: JSON.stringify({ ok: true, delivery_score: delivery.overall, confidence: delivery.confidence }),
      tool_call_id: tc.id,
    });

    resetAnswerState();
  }, [resetAnswerState]);

  const processToolCalls = useCallback((toolCalls: ToolCallResult[]): boolean => {
    let hasToolCalls = false;
    let gotEnd = false;

    for (const tc of toolCalls) {
      if (tc.name === "score_answer") {
        processScoreAnswer(tc);
        hasToolCalls = true;
      } else if (tc.name === "end_interview") {
        messagesRef.current.push({ role: "tool", content: JSON.stringify({ ok: true }), tool_call_id: tc.id });
        endDataRef.current = tc;
        setState((prev) => ({ ...prev, endData: tc }));
        hasToolCalls = true;
        gotEnd = true;
      }
    }

    return hasToolCalls && !gotEnd;
  }, [processScoreAnswer]);

  const sendToAgent = useCallback(async (userText: string) => {
    if (sendingRef.current) return;
    sendingRef.current = true;

    if (streamAbortRef.current) streamAbortRef.current.abort();
    const abort = new AbortController();
    streamAbortRef.current = abort;

    ttsRef.current?.clear();

    messagesRef.current[0] = buildCurrentSystemMsg();
    messagesRef.current.push({ role: "user", content: userText });

    setState((prev) => ({ ...prev, agentText: "", isProcessing: true }));

    try {
      let lastQuestionText = "";
      let rounds = 0;

      while (rounds < MAX_TOOL_ROUNDS && !abort.signal.aborted) {
        rounds++;
        const { text, toolCalls } = await streamAgentResponse(abort);

        messagesRef.current.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        if (text) lastQuestionText = text;
        if (toolCalls.length === 0) break;

        const needMore = processToolCalls(toolCalls);
        if (!needMore) {
          if (ttsRef.current) ttsRef.current.flush();
          break;
        }

        setState((prev) => ({ ...prev, agentText: "" }));
        messagesRef.current[0] = buildCurrentSystemMsg();
      }

      if (lastQuestionText) questionTextRef.current = lastQuestionText;

      if (!lastQuestionText && !endDataRef.current && fullTranscriptRef.current) {
        const delivery = computeDeliveryMetrics(
          emotionAccRef.current,
          intentAccRef.current,
          fillerCountRef.current,
          [computeWPM(answerSegmentsRef.current)].filter((w) => w > 0),
          (Date.now() - answerStartRef.current) / 1000,
        );

        const fbFillers = countFillers(fullTranscriptRef.current);
        const fbNarrative = generateBehavioralNarrative(
          delivery,
          answerEmotionTimelineRef.current,
          fbFillers.fillers,
          answerStartRef.current,
        );
        const fbIntentAnalysis = intentTrackerRef.current.analyze();
        const fallbackScore: AnswerScore = {
          questionIndex: questionIndexRef.current,
          questionText: questionTextRef.current,
          questionCategory: questionCategoryRef.current,
          answerText: fullTranscriptRef.current,
          contentScore: 50,
          structure: "direct",
          strengths: ["Completed answer"],
          improvements: ["Score unavailable — LLM did not return structured scoring"],
          delivery,
          emotionTimeline: answerEmotionTimelineRef.current.slice(),
          jdGapsAddressed: [],
          keyMoments: identifyKeyMoments(answerEmotionTimelineRef.current, answerStartRef.current),
          whatInterviewerThinks: "",
          problematicQuote: "",
          suggestedReframe: "",
          behavioralNarrative: fbNarrative,
          fillerBreakdown: fbFillers.fillers,
          vocalStability: vocalTrackerRef.current.averageStability,
          convictionMoments: vocalTrackerRef.current.convictionMoments,
          microNervousMoments: vocalTrackerRef.current.microNervousMoments,
          intentPattern: fbIntentAnalysis.pattern,
          intentShift: fbIntentAnalysis.dominantShift,
        };

        answersRef.current = [...answersRef.current, fallbackScore];
        setState((prev) => ({
          ...prev,
          answers: answersRef.current,
          questionIndex: prev.questionIndex + 1,
        }));
        questionIndexRef.current += 1;
        resetAnswerState();
      }

      if (ttsRef.current) {
        ttsRef.current.flush();
      } else {
        // No TTS — mark agent as done speaking immediately
        agentDoneSpeakingRef.current = Date.now();
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setState((prev) => ({ ...prev, error: (err as Error)?.message ?? "Agent stream failed" }));
      }
    } finally {
      sendingRef.current = false;
      setState((prev) => ({ ...prev, isProcessing: false }));
    }
  }, [config, gapAnalysis, resetAnswerState, buildCurrentSystemMsg, streamAgentResponse, processToolCalls]);

  const start = useCallback(async () => {
    if (sendingRef.current) return;

    setState((prev) => ({ ...prev, isProcessing: true, error: null }));

    let mic: SharedMicManager | null = null;
    let asr: AsrStreamClient | null = null;
    let tts: CartesiaTtsClient | null = null;

    try {
      mic = new SharedMicManager();
      asr = new AsrStreamClient(config.asrUrl, { metadataProb: true, speakerEmbedding: false });
      asr.onTranscript = processSegment;
      asr.onError = (err) => setState((prev) => ({ ...prev, error: err.message }));

      const cartesiaKey = (import.meta.env.VITE_CARTESIA_API_KEY as string) || "";
      if (cartesiaKey) {
        tts = new CartesiaTtsClient({
          apiKey: cartesiaKey,
          voiceId: "d46abd1d-2571-4e21-b3df-f4271cdb4f60", // Theo — friendly male
        });
        tts.onSpeakingChange = (speaking) => {
          setState((prev) => ({ ...prev, isSpeaking: speaking }));
          if (!speaking) agentDoneSpeakingRef.current = Date.now();
        };

        // TTS is optional — interview works text-only if connection fails
        try {
          await tts.connect();
        } catch (ttsErr) {
          console.warn("[InterviewSession] TTS unavailable, continuing text-only:", ttsErr);
          tts.close();
          tts = null;
        }
      }

      await mic.addConsumer("asr", (pcm) => asr!.sendPcm(pcm));
      await asr.connect();

      micRef.current = mic;
      asrRef.current = asr;
      ttsRef.current = tts;

      alignmentTrackerRef.current = createAlignmentTracker(gapAnalysis);
      vocalTrackerRef.current.reset();
      intentTrackerRef.current.reset();
      agentDoneSpeakingRef.current = 0;

      resetAnswerState();
      answersRef.current = [];
      endDataRef.current = null;
      messagesRef.current = [buildCurrentSystemMsg()];
      questionIndexRef.current = 0;
      questionTextRef.current = "";
      profileRef.current.reset();

      sessionStartTimeRef.current = Date.now();

      setState((prev) => ({
        ...prev,
        isActive: true,
        isListening: true,
        answers: [],
        endData: null,
        questionIndex: 0,
        agentText: "",
        jdAlignment: alignmentTrackerRef.current.state,
        vocalStability: 100,
        thinkTimeSec: 0,
        sessionElapsedSec: 0,
      }));

      hintIntervalRef.current = setInterval(generateHints, 4000);
      elapsedTimerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          sessionElapsedSec: Math.floor((Date.now() - sessionStartTimeRef.current) / 1000),
        }));
      }, 1000);

      sendToAgent("Start the interview. Greet me and ask the first question.");
    } catch (err: unknown) {
      if (mic) { mic.removeConsumer("asr"); mic.destroy(); }
      if (asr) asr.close();
      if (tts) tts.close();
      micRef.current = null;
      asrRef.current = null;
      ttsRef.current = null;

      const msg = err instanceof Error
        ? (err.name === "NotAllowedError" ? "Microphone access denied. Please allow microphone permission and try again." : err.message)
        : "Failed to start";
      setState((prev) => ({ ...prev, error: msg, isProcessing: false }));
    }
  }, [config, gapAnalysis, processSegment, resetAnswerState, generateHints, sendToAgent, buildCurrentSystemMsg]);

  const submitAnswer = useCallback(() => {
    if (sendingRef.current) return;
    const fullText = fullTranscriptRef.current.trim();
    if (!fullText) return;
    ttsRef.current?.clear();
    sendToAgent(fullText);
  }, [sendToAgent]);

  const stop = useCallback(() => {
    if (hintIntervalRef.current) { clearInterval(hintIntervalRef.current); hintIntervalRef.current = null; }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (streamAbortRef.current) { streamAbortRef.current.abort(); streamAbortRef.current = null; }
    sendingRef.current = false;

    if (micRef.current) { micRef.current.removeConsumer("asr"); micRef.current.destroy(); micRef.current = null; }
    if (asrRef.current) { asrRef.current.close(); asrRef.current = null; }
    if (ttsRef.current) { ttsRef.current.close(); ttsRef.current = null; }

    setState((prev) => ({ ...prev, isActive: false, isListening: false, isSpeaking: false, isProcessing: false }));
  }, []);

  useEffect(() => {
    if (state.endData && !state.isProcessing && !state.isSpeaking) {
      stop();
      onAutoEnd?.(answersRef.current, endDataRef.current);
    }
  }, [state.endData, state.isProcessing, state.isSpeaking, stop, onAutoEnd]);

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  return { state, start, stop, submitAnswer };
}
