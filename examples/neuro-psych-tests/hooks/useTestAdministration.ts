import { useState, useCallback, useRef, useEffect } from "react";
import { AsrStreamClient } from "@whissle/live-assist-core";
import type { StreamTranscriptSegment, WordTimestamp, PauseEvent, SpeechRate } from "@whissle/live-assist-core";
import type { TestType, TestResult, ValidityIndicators, NormativeResult } from "../lib/types";
import { TEST_CONFIGS } from "../lib/types";
import { gatewayConfig } from "../lib/gateway-config";

export interface TestAdministrationState {
  isRecording: boolean;
  transcript: string;
  words: WordTimestamp[];
  pauses: PauseEvent[];
  speechRate: SpeechRate | null;
  iwi: number[];
  segments: StreamTranscriptSegment[];
  elapsedSec: number;
  wordCount: number;
  scoring: Record<string, any> | null;
  normative: NormativeResult | null;
  analysis: string;
  error: string | null;
}

export function useTestAdministration(
  testType: TestType,
  patient: { age: number; education_years: number } | null,
) {
  const config = TEST_CONFIGS[testType];
  const [state, setState] = useState<TestAdministrationState>({
    isRecording: false,
    transcript: "",
    words: [],
    pauses: [],
    speechRate: null,
    iwi: [],
    segments: [],
    elapsedSec: 0,
    wordCount: 0,
    scoring: null,
    normative: null,
    analysis: "",
    error: null,
  });

  const asrRef = useRef<AsrStreamClient | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      mediaRef.current = stream;

      const asr = new AsrStreamClient(gatewayConfig.asrStreamUrl, {
        wordTimestamps: true,
        neuropsychMode: config.neuropsych_mode,
        token: gatewayConfig.getSessionToken(),
        sampleRate: 16000,
      });

      asr.onTranscript = (seg: StreamTranscriptSegment) => {
        if (!seg.is_final) return;
        setState((prev) => {
          const newWords = [...prev.words, ...(seg.words || [])];
          const newPauses = [...prev.pauses, ...(seg.pauses || [])];
          const newIwi = [...prev.iwi, ...(seg.iwi || [])];
          return {
            ...prev,
            transcript: prev.transcript + (prev.transcript ? " " : "") + seg.text,
            words: newWords,
            pauses: newPauses,
            speechRate: seg.speech_rate || prev.speechRate,
            iwi: newIwi,
            segments: [...prev.segments, seg],
            wordCount: newWords.filter((w) => !w.filler).length,
          };
        });
      };

      asr.onError = (err: Error) => {
        setState((prev) => ({ ...prev, error: err.message }));
      };

      await asr.connect();
      asrRef.current = asr;

      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
        }
        asr.sendPcm(int16);
      };
      source.connect(processor);
      processor.connect(ctx.destination);

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setState((prev) => ({ ...prev, elapsedSec: Math.round(elapsed) }));

        if (config.duration_sec && elapsed >= config.duration_sec) {
          stopRecording();
        }
      }, 250);

      setState((prev) => ({ ...prev, isRecording: true, error: null }));
    } catch (err: any) {
      setState((prev) => ({ ...prev, error: err.message || "Failed to start recording" }));
    }
  }, [config]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (mediaRef.current) { mediaRef.current.getTracks().forEach((t) => t.stop()); mediaRef.current = null; }

    const finalSegs = asrRef.current ? await asrRef.current.end() : [];
    asrRef.current = null;

    if (finalSegs.length) {
      setState((prev) => {
        let transcript = prev.transcript;
        const words = [...prev.words];
        const pauses = [...prev.pauses];
        const iwi = [...prev.iwi];
        let speechRate = prev.speechRate;
        for (const seg of finalSegs) {
          if (seg.text) transcript += (transcript ? " " : "") + seg.text;
          if (seg.words) words.push(...seg.words);
          if (seg.pauses) pauses.push(...seg.pauses);
          if (seg.iwi) iwi.push(...seg.iwi);
          if (seg.speech_rate) speechRate = seg.speech_rate;
        }
        return { ...prev, transcript, words, pauses, iwi, speechRate, wordCount: words.filter((w) => !w.filler).length };
      });
    }

    setState((prev) => ({ ...prev, isRecording: false }));
  }, []);

  const requestScoring = useCallback(async (): Promise<TestResult> => {
    const { transcript, words, pauses, speechRate, iwi } = state;
    const startedAt = startTimeRef.current;
    const completedAt = Date.now();

    let scoring: Record<string, any> = {};
    let normative: NormativeResult | null = null;
    let analysis = "";

    try {
      // Cloud gateway proxies the Python agent at /agent/* → agent:8765 (see decoder_onnx gateway proxy).
      // Neuropsych scoring uses agent_router POST /route/stream with mode_hint "neuropsych".
      const res = await fetch(`${gatewayConfig.httpBase}/agent/route/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `Score ${testType} test`,
          mode_hint: "neuropsych",
          user_id: "neuropsych_app",
          test_type: testType,
          transcript,
          words,
          pauses,
          speech_rate: speechRate,
          patient: patient || { age: 70, education_years: 14 },
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.event === "scoring") scoring = data;
              if (data.event === "normative") normative = data;
              if (data.event === "analysis") analysis = data.text || "";
            } catch {}
          }
        }
      }
    } catch (err: any) {
      analysis = `Scoring request failed: ${err.message}`;
    }

    setState((prev) => ({ ...prev, scoring, normative, analysis }));

    const validity: ValidityIndicators = {
      effort_adequate: true,
      comprehension_adequate: true,
      filler_rate: speechRate?.filler_rate || 0,
      speech_rate_wpm: speechRate?.words_per_minute || 0,
      test_completed: true,
    };

    return {
      test_type: testType,
      started_at: startedAt,
      completed_at: completedAt,
      raw_transcript: transcript,
      words,
      pauses,
      speech_rate: speechRate,
      iwi,
      scoring,
      normative,
      analysis,
      validity,
    };
  }, [state, testType, patient]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (processorRef.current) processorRef.current.disconnect();
      if (mediaRef.current) mediaRef.current.getTracks().forEach((t) => t.stop());
      if (asrRef.current) asrRef.current.close();
    };
  }, []);

  return {
    ...state,
    config,
    startRecording,
    stopRecording,
    requestScoring,
  };
}
