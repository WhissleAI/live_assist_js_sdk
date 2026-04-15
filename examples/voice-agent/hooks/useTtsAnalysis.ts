/**
 * Second ASR WebSocket for analyzing TTS audio in real-time.
 * Feeds TTS PCM into ASR with metadataProb; updates orb + session.agentEmotionTimeline
 * (same shape as mic timeline) for session replay spectrograms.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { AsrStreamClient } from "@whissle/live-assist-core";
import type { StreamTranscriptSegment } from "@whissle/live-assist-core";
import type { CartesiaTtsClient } from "../lib/cartesia-tts";
import type { SessionState, EmotionTimelineEntry } from "../App";
import type { MutableRefObject } from "react";

const TARGET_RATE = 16000;

function topEmotion(probs: Array<{ token: string; probability: number }>): string {
  if (!probs.length) return "NEUTRAL";
  const top = probs.reduce((a, b) => (a.probability > b.probability ? a : b));
  return top.token.toUpperCase().replace(/^EMOTION_/, "");
}

export type TtsAnalysisSessionOpts = {
  sessionRef: MutableRefObject<SessionState>;
  updateSession: (patch: Partial<SessionState>) => void;
  /** Mirror latest TTS/STT emotion map for agent transcript snapshots. */
  emotionProbsOutRef: MutableRefObject<Record<string, number>>;
};

export function useTtsAnalysis(asrUrl: string, sessionOpts?: TtsAnalysisSessionOpts) {
  const [ttsEmotion, setTtsEmotion] = useState("NEUTRAL");
  const [ttsEmotionProbs, setTtsEmotionProbs] = useState<Record<string, number>>({});

  const asrRef = useRef<AsrStreamClient | null>(null);
  const ttsClientRef = useRef<CartesiaTtsClient | null>(null);
  const sourceRateRef = useRef(22050);
  const resampleBufferRef = useRef<number[]>([]);
  /** Maps TTS ASR stream time → session-relative ms (first timeline event calibrates). */
  const ttsAnchorSessionMsRef = useRef<number | null>(null);

  const pushAgentTimeline = useCallback(
    (newEntries: EmotionTimelineEntry[]) => {
      if (!sessionOpts || newEntries.length === 0) return;
      const prev = sessionOpts.sessionRef.current;
      sessionOpts.updateSession({
        agentEmotionTimeline: [...(prev.agentEmotionTimeline ?? []), ...newEntries],
      });
    },
    [sessionOpts],
  );

  const start = useCallback(
    async (ttsClient: CartesiaTtsClient, sourceSampleRate: number) => {
      ttsClientRef.current = ttsClient;
      sourceRateRef.current = sourceSampleRate;
      resampleBufferRef.current = [];
      ttsAnchorSessionMsRef.current = null;

      const asr = new AsrStreamClient(asrUrl, {
        metadataProb: true,
        speakerEmbedding: false,
      });

      asr.onTranscript = (seg: StreamTranscriptSegment) => {
        const sessionStart = sessionOpts?.sessionRef.current.sessionStart;

        if (seg.metadata_probs?.emotion?.length) {
          const emotion = topEmotion(seg.metadata_probs.emotion);
          setTtsEmotion(emotion);

          const probMap: Record<string, number> = {};
          for (const e of seg.metadata_probs.emotion) {
            const key = e.token.toUpperCase().replace(/^EMOTION_/, "");
            probMap[key] = e.probability;
          }
          setTtsEmotionProbs(probMap);
          if (sessionOpts?.emotionProbsOutRef) sessionOpts.emotionProbsOutRef.current = probMap;
        }

        // Use audioStartMs (mic audio start) as reference so TTS timeline aligns with mic audio time
        const audioStart = sessionOpts?.sessionRef.current.audioStartMs ?? sessionStart;
        if (sessionOpts && seg.metadata_probs_timeline?.length && audioStart) {
          const newEntries: EmotionTimelineEntry[] = [];
          for (const tw of seg.metadata_probs_timeline) {
            if (!tw.emotion?.length) continue;
            const streamT = (seg.audioOffset ?? 0) + (tw.offset ?? 0);
            if (ttsAnchorSessionMsRef.current === null) {
              ttsAnchorSessionMsRef.current = Date.now() - audioStart - streamT;
            }
            const anchor = ttsAnchorSessionMsRef.current;
            const offsetMs = anchor + (seg.audioOffset ?? 0) + (tw.offset ?? 0);
            const topTw = tw.emotion.reduce((a, b) => (a.probability > b.probability ? a : b));
            newEntries.push({
              offset: offsetMs,
              emotion: topTw.token.toUpperCase().replace(/^EMOTION_/, ""),
              confidence: topTw.probability,
              probs: tw.emotion.map((e) => ({
                emotion: e.token.toUpperCase().replace(/^EMOTION_/, ""),
                probability: e.probability,
              })),
            });
          }
          if (newEntries.length) pushAgentTimeline(newEntries);
        }
      };

      asr.onError = (err) => console.warn("[TtsAnalysis] ASR error:", err.message);
      asrRef.current = asr;

      try {
        await asr.connect();
      } catch (e) {
        console.warn("[TtsAnalysis] ASR connect failed:", e);
        return;
      }

      ttsClient.setPcmTap((pcm: Int16Array) => {
        if (!asrRef.current) return;

        const ratio = sourceRateRef.current / TARGET_RATE;
        if (ratio <= 1) {
          asrRef.current.sendPcm(pcm);
          return;
        }

        const buf = resampleBufferRef.current;
        for (let i = 0; i < pcm.length; i++) {
          buf.push(pcm[i]!);
        }

        const outLen = Math.floor(buf.length / ratio);
        if (outLen === 0) return;

        const out = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const srcIdx = Math.floor(i * ratio);
          out[i] = buf[srcIdx]!;
        }
        const consumed = Math.floor(outLen * ratio);
        resampleBufferRef.current = buf.slice(consumed);

        asrRef.current.sendPcm(out);
      });
    },
    [asrUrl, sessionOpts, pushAgentTimeline],
  );

  const stop = useCallback(() => {
    if (ttsClientRef.current) {
      ttsClientRef.current.setPcmTap(null);
      ttsClientRef.current = null;
    }
    asrRef.current?.close();
    asrRef.current = null;
    resampleBufferRef.current = [];
    ttsAnchorSessionMsRef.current = null;
    setTtsEmotion("NEUTRAL");
    setTtsEmotionProbs({});
    if (sessionOpts?.emotionProbsOutRef) sessionOpts.emotionProbsOutRef.current = {};
  }, [sessionOpts]);

  useEffect(() => {
    return () => {
      if (ttsClientRef.current) ttsClientRef.current.setPcmTap(null);
      asrRef.current?.close();
    };
  }, []);

  return { ttsEmotion, ttsEmotionProbs, start, stop };
}
