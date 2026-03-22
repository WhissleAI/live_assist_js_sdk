import React, { useState, useEffect, useRef, useCallback } from "react";
import { AsrStreamClient, SharedMicManager, MicCapture, EMOTION_COLORS, createBehavioralProfileManager } from "@whissle/live-assist-core";
import type { StreamTranscriptSegment, BehavioralProfile } from "@whissle/live-assist-core";
import type { VoiceAgentConfig, ConversationMessage, EmotionTimelineEntry } from "./App";
import type { UploadedDocument } from "./lib/documents";
import { buildDocumentContext } from "./lib/documents";
import { RimeTtsClient } from "./lib/rime-tts";
import { streamAgentChat, type ChatMessage } from "./lib/agent-stream";
import type { ToolCallResult, ToolState } from "./lib/tools";
import { executeTool, createInitialToolState } from "./lib/tools";
import { extractHotwords } from "./lib/hotwords";
import Sidebar from "./Sidebar";
import MoodGradient from "./MoodGradient";
import LiveEmotionBar from "./LiveEmotionBar";

interface Props {
  config: VoiceAgentConfig;
  documents: UploadedDocument[];
  onEnd: (messages: ConversationMessage[], toolState: ToolState, audioBlob?: Blob) => void;
}

type AgentState = "idle" | "listening" | "thinking" | "speaking";

const UTTERANCE_AGGREGATION_MS = 1500;
const MIN_UTTERANCE_WORDS = 2;
const MIN_UTTERANCE_CHARS = 5;
const BARGE_IN_MIN_WORDS = 1;
const FALLBACK_RESPONSE = "I didn't quite catch that. Could you say that again?";

function isUtteranceViable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_UTTERANCE_CHARS) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= MIN_UTTERANCE_WORDS;
}

export default function VoiceSession({ config, documents, onEnd }: Props) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [interimText, setInterimText] = useState("");
  const [streamingResponse, setStreamingResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [toolState, setToolState] = useState<ToolState>(() => createInitialToolState(config.scenarioId));
  const [liveEvents, setLiveEvents] = useState<ToolCallResult[]>([]);
  const [liveProfile, setLiveProfile] = useState<BehavioralProfile | null>(null);
  const [liveTimeline, setLiveTimeline] = useState<EmotionTimelineEntry[]>([]);

  const asrRef = useRef<AsrStreamClient | null>(null);
  const micRef = useRef<SharedMicManager | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recCtxRef = useRef<AudioContext | null>(null);
  const ttsRef = useRef<RimeTtsClient | null>(null);
  const llmAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utteranceBufferRef = useRef<string[]>([]);
  const utteranceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionActiveRef = useRef(true);
  const stateRef = useRef<AgentState>("idle");
  const emotionAccRef = useRef<Array<{ emotion: string; prob: number }>>([]);
  const intentAccRef = useRef<string[]>([]);
  const entityAccRef = useRef<Array<{ entity: string; text: string }>>([]);
  const toolStateRef = useRef<ToolState>(createInitialToolState(config.scenarioId));
  const messagesRef = useRef<ConversationMessage[]>([]);
  const streamingResponseRef = useRef("");
  const greetingSpokenRef = useRef(false);

  const profilerRef = useRef<ReturnType<typeof createBehavioralProfileManager> | null>(null);
  const lastProfileUpdateRef = useRef(0);
  const timelineAccRef = useRef<EmotionTimelineEntry[]>([]);
  const sessionStartRef = useRef(Date.now());

  // Processing lock + utterance queue
  const processingRef = useRef(false);
  const pendingUtterancesRef = useRef<string[]>([]);
  const fragmentBufferRef = useRef("");
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    try {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch {
      messagesEndRef.current?.scrollIntoView();
    }
  }, []);

  useEffect(scrollToBottom, [messages, streamingResponse, scrollToBottom]);

  useEffect(() => {
    streamingResponseRef.current = streamingResponse;
  }, [streamingResponse]);

  const findCitations = useCallback((text: string): string[] => {
    const cited: string[] = [];
    for (const doc of documents) {
      const nameNoExt = doc.name.replace(/\.[^.]+$/, "");
      if (text.toLowerCase().includes(doc.name.toLowerCase()) || text.toLowerCase().includes(nameNoExt.toLowerCase())) {
        cited.push(doc.name);
      }
    }
    return cited;
  }, [documents]);

  const muteTts = useCallback(() => {
    ttsRef.current?.mute();
  }, []);

  const handleBargeIn = useCallback(() => {
    llmAbortRef.current?.abort();
    ttsRef.current?.clear();

    const current = streamingResponseRef.current;
    if (current.trim()) {
      const citations = findCitations(current);
      const intMsg: ConversationMessage = {
        id: `msg_${Date.now()}_assistant_int`,
        role: "assistant",
        content: current.trim() + " [interrupted]",
        timestamp: Date.now(),
        citations: citations.length > 0 ? citations : undefined,
      };
      messagesRef.current = [...messagesRef.current, intMsg];
      setMessages(messagesRef.current);
      setStreamingResponse("");
      streamingResponseRef.current = "";
    }

    processingRef.current = false;
    stateRef.current = "listening";
    setAgentState("listening");
  }, [findCitations]);

  const runLlmCall = useCallback(async (userText: string) => {
    if (!userText.trim() || !sessionActiveRef.current) return;

    const accumulated = emotionAccRef.current;
    let dominantEmotion: string | undefined;
    let emotionConf: number | undefined;
    if (accumulated.length > 0) {
      const best = accumulated.reduce((a, b) => (a.prob > b.prob ? a : b));
      dominantEmotion = best.emotion;
      emotionConf = best.prob;
    }

    const intents = intentAccRef.current;
    const dominantIntent = intents.length > 0
      ? intents.reduce((a, b, _i, arr) => (arr.filter((v) => v === a).length >= arr.filter((v) => v === b).length ? a : b))
      : undefined;

    const entities = entityAccRef.current.length > 0 ? [...entityAccRef.current] : undefined;

    emotionAccRef.current = [];
    intentAccRef.current = [];
    entityAccRef.current = [];

    const timeline = timelineAccRef.current.length > 0 ? [...timelineAccRef.current] : undefined;
    timelineAccRef.current = [];

    const userMsg: ConversationMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: userText.trim(),
      timestamp: Date.now(),
      emotion: dominantEmotion,
      emotionConfidence: emotionConf,
      intent: dominantIntent,
      entities,
      emotionTimeline: timeline,
    };

    // Update ref synchronously so chatHistory always includes the latest messages
    messagesRef.current = [...messagesRef.current, userMsg];
    setMessages(messagesRef.current);
    setInterimText("");
    setStreamingResponse("");
    setLiveEvents([]);
    streamingResponseRef.current = "";
    stateRef.current = "thinking";
    setAgentState("thinking");

    const docContext = buildDocumentContext(documents);

    let emotionCtx = "";
    if (config.enableMetadata && profilerRef.current) {
      const profile = profilerRef.current.getSessionUserProfile();
      if (profile.segmentCount > 2) {
        const sorted = Object.entries(profile.emotionProfile)
          .filter(([k]) => k !== "NEUTRAL")
          .sort((a, b) => b[1] - a[1]);

        if (sorted.length > 0 && sorted[0][1] > 0.15) {
          const top = sorted[0];
          const pct = (top[1] * 100).toFixed(0);
          emotionCtx = `\n\n[Voice context: Customer's emotional profile — ${top[0].toLowerCase()} (${pct}% intensity). `;

          if (top[0] === "ANGRY" || top[0] === "SAD") {
            emotionCtx += "Be empathetic, patient, keep responses shorter.]";
          } else if (top[0] === "HAPPY" || top[0] === "SURPRISE") {
            emotionCtx += "Customer is in a positive mood — great time for suggestions.]";
          } else if (sorted.some(([k]) => k === "FEAR")) {
            emotionCtx += "Customer seems hesitant — offer reassurance and popular recommendations.]";
          } else {
            emotionCtx += "Adapt your tone accordingly.]";
          }
        }
      }
    } else if (config.enableMetadata && dominantEmotion && dominantEmotion !== "NEUTRAL") {
      emotionCtx = `\n\n[Voice context: User's tone is ${dominantEmotion.toLowerCase()} (confidence: ${((emotionConf ?? 0) * 100).toFixed(0)}%). Adapt your response accordingly.]`;
    }

    let orderCtx = "";
    const currentOrder = toolStateRef.current.orderItems;
    if (config.scenarioId === "restaurant-kiosk" && currentOrder) {
      if (currentOrder.length === 0) {
        orderCtx = "\n\n[Current order: EMPTY — no items added yet]";
      } else {
        const itemLines = currentOrder.map((it, i) =>
          `  ${i}: ${it.quantity}x ${it.item}${it.size ? ` (${it.size})` : ""}${it.modifiers?.length ? ` [${it.modifiers.join(", ")}]` : ""}${it.price != null ? ` $${it.price}` : ""}`
        ).join("\n");
        orderCtx = `\n\n[Current order (${currentOrder.length} item${currentOrder.length > 1 ? "s" : ""}):\n${itemLines}\nUse modify_order_item with the index above to change existing items. Only use add_to_order for genuinely NEW items.]`;
      }
    }

    const systemContent = [config.systemPrompt, docContext, emotionCtx, orderCtx].filter(Boolean).join("\n\n");

    const chatHistory: ChatMessage[] = [
      { role: "system", content: systemContent },
    ];

    for (const msg of messagesRef.current) {
      if (msg.role === "user" && msg.content.trim().length < 3) continue;
      chatHistory.push({ role: msg.role, content: msg.content });
    }

    const abortController = new AbortController();
    llmAbortRef.current = abortController;

    let fullResponse = "";
    let sentenceBuffer = "";
    const collectedToolCalls: ToolCallResult[] = [];
    const hasTools = config.tools.length > 0;
    const spokenSentences: string[] = [];

    ttsRef.current?.unmute();

    try {
      const tools = hasTools ? config.tools : undefined;
      const stream = streamAgentChat(
        config.agentUrl,
        chatHistory,
        abortController.signal,
        tools,
      );

      for await (const token of stream) {
        if (!sessionActiveRef.current) break;

        if (typeof token === "string") {
          fullResponse += token;
          sentenceBuffer += token;
          setStreamingResponse(fullResponse);
          streamingResponseRef.current = fullResponse;

          if (stateRef.current === "thinking") {
            stateRef.current = "speaking";
            setAgentState("speaking");
          }

          const sentenceEnd = /[.!?]\s*$/.test(sentenceBuffer) || sentenceBuffer.includes("\n");
          if (sentenceEnd && sentenceBuffer.trim().length > 5) {
            ttsRef.current?.speak(sentenceBuffer);
            ttsRef.current?.flush();
            spokenSentences.push(sentenceBuffer);
            sentenceBuffer = "";
          }
        } else {
          collectedToolCalls.push(token);
          setLiveEvents((prev) => [...prev, token]);
          const newState = executeTool(token, toolStateRef.current);
          toolStateRef.current = newState;
          setToolState({ ...newState });
        }
      }

      if (sentenceBuffer.trim()) {
        ttsRef.current?.speak(sentenceBuffer);
        ttsRef.current?.flush();
        spokenSentences.push(sentenceBuffer);
      }

      if (sessionActiveRef.current) {
        // Safeguard: detect when LLM claims to have added/modified an item but didn't call a tool
        const claimsAction = /\b(i'?ve added|added .* to|i'?ll add|adding .* to your order|got (?:that|it) (?:added|for you))\b/i.test(fullResponse);
        if (claimsAction && collectedToolCalls.length === 0 && config.scenarioId === "restaurant-kiosk") {
          console.warn("[VoiceAgent] LLM claimed to add an item without calling a tool — requesting correction");
          ttsRef.current?.clear();
          const correctionHistory: ChatMessage[] = [
            ...chatHistory,
            { role: "assistant" as const, content: fullResponse },
            { role: "user" as const, content: "[SYSTEM: You said you added an item but did NOT call the add_to_order tool. The order was NOT updated. You MUST call add_to_order now with the correct item details, or tell the customer you need to confirm the item again.]" },
          ];
          const corrAbort = new AbortController();
          llmAbortRef.current = corrAbort;
          try {
            const corrStream = streamAgentChat(config.agentUrl, correctionHistory, corrAbort.signal, tools);
            fullResponse = "";
            let corrSentBuf = "";
            for await (const t of corrStream) {
              if (!sessionActiveRef.current) break;
              if (typeof t === "string") {
                fullResponse += t;
                corrSentBuf += t;
                setStreamingResponse(fullResponse);
                streamingResponseRef.current = fullResponse;
                if (/[.!?]\s*$/.test(corrSentBuf) && corrSentBuf.trim().length > 5) {
                  ttsRef.current?.speak(corrSentBuf);
                  ttsRef.current?.flush();
                  corrSentBuf = "";
                }
              } else {
                collectedToolCalls.push(t);
                const newState = executeTool(t, toolStateRef.current);
                toolStateRef.current = newState;
                setToolState({ ...newState });
              }
            }
            if (corrSentBuf.trim()) {
              ttsRef.current?.speak(corrSentBuf);
              ttsRef.current?.flush();
            }
          } catch { /* if correction fails, proceed with original response */ }
        }

        if (fullResponse.trim() || collectedToolCalls.length > 0) {
          const citations = findCitations(fullResponse);

          if (collectedToolCalls.length > 0) {
            // Tool calls present — clear any already-spoken audio, then speak only the follow-up
            ttsRef.current?.clear();
            setStreamingResponse("");
            streamingResponseRef.current = "";

            const toolResultMessages: ChatMessage[] = [
              ...chatHistory,
              { role: "assistant" as const, content: fullResponse.trim(), tool_calls: collectedToolCalls },
            ];
            for (const tc of collectedToolCalls) {
              toolResultMessages.push({
                role: "tool",
                content: JSON.stringify({ success: true, order: toolStateRef.current.orderItems }),
                tool_call_id: tc.id,
              });
            }

            const followUpAbort = new AbortController();
            llmAbortRef.current = followUpAbort;
            let followUp = "";
            let followUpSentenceBuffer = "";

            const followUpStream = streamAgentChat(
              config.agentUrl,
              toolResultMessages,
              followUpAbort.signal,
            );

            for await (const t of followUpStream) {
              if (!sessionActiveRef.current) break;
              if (typeof t === "string") {
                followUp += t;
                followUpSentenceBuffer += t;
                setStreamingResponse(followUp);
                streamingResponseRef.current = followUp;

                if (stateRef.current === "thinking") {
                  stateRef.current = "speaking";
                  setAgentState("speaking");
                }

                const end = /[.!?]\s*$/.test(followUpSentenceBuffer) || followUpSentenceBuffer.includes("\n");
                if (end && followUpSentenceBuffer.trim().length > 5) {
                  ttsRef.current?.speak(followUpSentenceBuffer);
                  ttsRef.current?.flush();
                  followUpSentenceBuffer = "";
                }
              }
            }

            if (followUpSentenceBuffer.trim()) {
              ttsRef.current?.speak(followUpSentenceBuffer);
              ttsRef.current?.flush();
            }

            const combinedContent = followUp.trim() || fullResponse.trim();
            if (combinedContent) {
              const assistantMsg: ConversationMessage = {
                id: `msg_${Date.now()}_assistant`,
                role: "assistant",
                content: combinedContent,
                timestamp: Date.now(),
                citations: citations.length > 0 ? citations : undefined,
                toolCalls: collectedToolCalls,
              };
              messagesRef.current = [...messagesRef.current, assistantMsg];
              setMessages(messagesRef.current);
              setStreamingResponse("");
              streamingResponseRef.current = "";
              setLiveEvents([]);
            }

            // Auto-end session after order is confirmed
            if (toolStateRef.current.orderConfirmed) {
              if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current);
              autoEndTimerRef.current = setTimeout(() => {
                if (sessionActiveRef.current) {
                  handleEndSessionRef.current();
                }
              }, 8000);
            }
          } else {
            const assistantMsg: ConversationMessage = {
              id: `msg_${Date.now()}_assistant`,
              role: "assistant",
              content: fullResponse.trim(),
              timestamp: Date.now(),
              citations: citations.length > 0 ? citations : undefined,
            };
            messagesRef.current = [...messagesRef.current, assistantMsg];
            setMessages(messagesRef.current);
            setStreamingResponse("");
            streamingResponseRef.current = "";
          }
        } else {
          const fallback = FALLBACK_RESPONSE;
          const fallbackMsg: ConversationMessage = {
            id: `msg_${Date.now()}_assistant_fallback`,
            role: "assistant",
            content: fallback,
            timestamp: Date.now(),
          };
          messagesRef.current = [...messagesRef.current, fallbackMsg];
          setMessages(messagesRef.current);
          setStreamingResponse("");
          streamingResponseRef.current = "";
          stateRef.current = "speaking";
          setAgentState("speaking");
          ttsRef.current?.speak(fallback);
          ttsRef.current?.flush();
        }
      }
    } catch (err: unknown) {
      const isAbort = (err instanceof Error && err.name === "AbortError") ||
        (err instanceof DOMException && err.code === DOMException.ABORT_ERR);
      if (isAbort) return;
      const msg = err instanceof Error ? err.message : "LLM request failed";
      setError(msg);
    } finally {
      if ((stateRef.current as string) !== "listening") {
        stateRef.current = "idle";
        setAgentState("idle");
      }
    }
  }, [config, documents, findCitations]);

  const processUtterance = useCallback(async (userText: string) => {
    if (!userText.trim() || !sessionActiveRef.current) return;

    // Prepend any buffered fragments
    let combined = userText;
    if (fragmentBufferRef.current) {
      combined = fragmentBufferRef.current + " " + userText;
      fragmentBufferRef.current = "";
    }

    // Quality gate: if still too short, buffer as fragment for next utterance
    if (!isUtteranceViable(combined)) {
      fragmentBufferRef.current = (fragmentBufferRef.current ? fragmentBufferRef.current + " " : "") + userText;
      return;
    }

    // If already processing an LLM call, queue this utterance
    if (processingRef.current) {
      pendingUtterancesRef.current.push(combined.trim());
      return;
    }

    processingRef.current = true;

    try {
      await runLlmCall(combined.trim());
    } finally {
      processingRef.current = false;
    }

    // Drain the queue: merge all pending utterances into one turn
    await drainQueue();
  }, [runLlmCall]);

  const drainQueue = useCallback(async () => {
    while (pendingUtterancesRef.current.length > 0 && sessionActiveRef.current) {
      const queued = pendingUtterancesRef.current.splice(0);
      const merged = queued.join(" ").trim();
      if (!merged) continue;

      // Include any fragment buffer
      let combined = merged;
      if (fragmentBufferRef.current) {
        combined = fragmentBufferRef.current + " " + merged;
        fragmentBufferRef.current = "";
      }

      if (!isUtteranceViable(combined)) {
        fragmentBufferRef.current = combined;
        continue;
      }

      processingRef.current = true;
      try {
        await runLlmCall(combined);
      } finally {
        processingRef.current = false;
      }
    }
  }, [runLlmCall]);

  const handleEndSessionRef = useRef<() => void>(() => {});

  // Stable refs so the init effect doesn't re-run when callbacks change
  const processUtteranceRef = useRef(processUtterance);
  const handleBargeInRef = useRef(handleBargeIn);
  const muteTtsRef = useRef(muteTts);
  useEffect(() => { processUtteranceRef.current = processUtterance; }, [processUtterance]);
  useEffect(() => { handleBargeInRef.current = handleBargeIn; }, [handleBargeIn]);
  useEffect(() => { muteTtsRef.current = muteTts; }, [muteTts]);

  // --- Init effect: runs ONCE on mount ---
  useEffect(() => {
    sessionActiveRef.current = true;
    greetingSpokenRef.current = false;
    let cleaned = false;

    function handleTranscript(seg: StreamTranscriptSegment) {
      if (!sessionActiveRef.current) return;
      const text = (seg.text || "").trim();
      if (!text) return;

      if (stateRef.current === "speaking" || stateRef.current === "thinking") {
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        if (wordCount >= 1) {
          muteTtsRef.current();
        }
        if (seg.is_final && wordCount >= BARGE_IN_MIN_WORDS) {
          handleBargeInRef.current();
        }
      }

      if (config.enableMetadata) {
        if (seg.metadata_probs?.emotion?.length) {
          const top = seg.metadata_probs.emotion.reduce((a, b) => (a.probability > b.probability ? a : b));
          const key = top.token.toUpperCase().replace(/^EMOTION_/, "");
          emotionAccRef.current.push({ emotion: key, prob: top.probability });
        } else if (seg.metadata?.emotion) {
          emotionAccRef.current.push({ emotion: seg.metadata.emotion.toUpperCase().replace(/^EMOTION_/, ""), prob: 1 });
        }

        if (seg.metadata_probs?.intent?.length) {
          const top = seg.metadata_probs.intent.reduce((a, b) => (a.probability > b.probability ? a : b));
          intentAccRef.current.push(top.token.toUpperCase().replace(/^INTENT_/, ""));
        } else if (seg.metadata?.intent) {
          intentAccRef.current.push(seg.metadata.intent.toUpperCase().replace(/^INTENT_/, ""));
        }

        if (seg.entities?.length) {
          for (const ent of seg.entities) {
            entityAccRef.current.push({ entity: ent.entity, text: ent.text });
          }
        }

        // Feed behavioral profiler
        if (profilerRef.current && (seg.metadata_probs?.emotion?.length || seg.metadata_probs?.intent?.length)) {
          profilerRef.current.update(
            "microphone",
            seg.metadata_probs?.emotion ?? [],
            seg.metadata_probs?.intent ?? [],
          );
          const now = Date.now();
          if (now - lastProfileUpdateRef.current > 500) {
            setLiveProfile({ ...profilerRef.current.getSessionUserProfile() });
            lastProfileUpdateRef.current = now;
          }
        }

        // Accumulate emotion timeline
        if (seg.metadata_probs_timeline?.length) {
          const newEntries: EmotionTimelineEntry[] = [];
          for (const tw of seg.metadata_probs_timeline) {
            const emos = tw.emotion;
            if (emos?.length) {
              const topEmo = emos.reduce((a, b) => (a.probability > b.probability ? a : b));
              const entry: EmotionTimelineEntry = {
                offset: (tw.offset ?? 0) + (seg.audioOffset ?? 0),
                emotion: topEmo.token.toUpperCase().replace(/^EMOTION_/, ""),
                confidence: topEmo.probability,
                probs: emos.map((e) => ({
                  emotion: e.token.toUpperCase().replace(/^EMOTION_/, ""),
                  probability: e.probability,
                })),
              };
              timelineAccRef.current.push(entry);
              newEntries.push(entry);
            }
          }
          if (newEntries.length) {
            setLiveTimeline((prev) => [...prev, ...newEntries]);
          }
        }
      }

      if (seg.is_final) {
        utteranceBufferRef.current.push(text);
        setInterimText("");

        if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
        utteranceTimerRef.current = setTimeout(() => {
          const fullUtterance = utteranceBufferRef.current.join(" ");
          utteranceBufferRef.current = [];
          if (fullUtterance.trim()) processUtteranceRef.current(fullUtterance);
        }, UTTERANCE_AGGREGATION_MS);
      } else {
        setInterimText(text);
      }

      if (stateRef.current === "idle") {
        stateRef.current = "listening";
        setAgentState("listening");
      }

      if (seg.utterance_end) {
        if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
        const fullUtterance = utteranceBufferRef.current.join(" ");
        utteranceBufferRef.current = [];
        setInterimText("");
        if (fullUtterance.trim()) processUtteranceRef.current(fullUtterance);
      }
    }

    async function init() {
      try {
        // Initialize behavioral profiler
        const profiler = createBehavioralProfileManager();
        profilerRef.current = profiler;
        sessionStartRef.current = Date.now();

        // Extract hotwords from menu documents for ASR boosting
        const menuDoc = documents.find((d) => d.menu);
        let hotwords: string[] | undefined;
        if (menuDoc?.menu) {
          hotwords = extractHotwords(menuDoc.menu);
          console.log(`[VoiceAgent] Menu hotwords: ${hotwords.length} phrases`);
        }

        const asr = new AsrStreamClient(config.asrUrl, {
          metadataProb: config.enableMetadata,
          hotwords,
          hotwordWeight: 10.0,
        });
        asr.onTranscript = handleTranscript;
        asr.onError = (err) => setError(err.message);
        asrRef.current = asr;
        await asr.connect();

        const mic = new SharedMicManager(config.audioWorkletUrl);
        micRef.current = mic;
        const capture = new MicCapture(mic, (pcm) => {
          asr.sendPcm(pcm);
        });
        captureRef.current = capture;
        const micErr = await capture.start();
        if (micErr) { setError(`Microphone: ${micErr}`); return; }

        const tts = new RimeTtsClient({
          agentUrl: config.agentUrl,
          speaker: config.rimeSpeaker,
          modelId: config.rimeModel,
        });
        tts.onError = (err) => setError(err.message);
        tts.onSpeakingChange = (speaking) => {
          if (!speaking && stateRef.current === "speaking") {
            stateRef.current = "idle";
            setAgentState("idle");
          }
        };
        ttsRef.current = tts;
        await tts.connect();

        // Set up full conversation recorder: separate 48kHz context for mixing mic + TTS
        const ttsCtx = tts.getAudioContext();
        const micStream = mic.getStream();
        if (ttsCtx && micStream) {
          const RecAudioCtx = typeof AudioContext !== "undefined" ? AudioContext
            : ((window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext) ?? AudioContext;
          const recCtx = new RecAudioCtx({ sampleRate: 48000 });
          if (recCtx.state === "suspended") await recCtx.resume().catch(() => {});
          recCtxRef.current = recCtx;

          const mixDest = recCtx.createMediaStreamDestination();

          // Mic → recording context (native 48kHz, no resampling needed)
          const micSource = recCtx.createMediaStreamSource(micStream);
          const micGain = recCtx.createGain();
          micGain.gain.value = 0.8;
          micSource.connect(micGain);
          micGain.connect(mixDest);

          // TTS → bridge via MediaStream → recording context
          const ttsCaptureNode = ttsCtx.createMediaStreamDestination();
          tts.setRecorderDestination(ttsCaptureNode);
          const ttsBridge = recCtx.createMediaStreamSource(ttsCaptureNode.stream);
          const ttsGain = recCtx.createGain();
          ttsGain.gain.value = 1.0;
          ttsBridge.connect(ttsGain);
          ttsGain.connect(mixDest);

          const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : undefined;
          const mr = new MediaRecorder(mixDest.stream, mimeType ? { mimeType } : undefined);
          recordedChunksRef.current = [];
          mr.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          mr.start(1000);
          mediaRecorderRef.current = mr;
        }

        if (!cleaned) {
          setIsConnected(true);
          stateRef.current = "listening";
          setAgentState("listening");

          if (config.greeting.trim() && !greetingSpokenRef.current) {
            greetingSpokenRef.current = true;
            const greetingMsg: ConversationMessage = {
              id: `msg_${Date.now()}_greeting`,
              role: "assistant",
              content: config.greeting,
              timestamp: Date.now(),
            };
            messagesRef.current = [greetingMsg];
            setMessages(messagesRef.current);
            tts.speak(config.greeting);
            tts.flush();
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Connection failed";
        setError(msg);
      }
    }

    init();

    return () => {
      cleaned = true;
      sessionActiveRef.current = false;
      if (utteranceTimerRef.current) clearTimeout(utteranceTimerRef.current);
      if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current);
      llmAbortRef.current?.abort();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (recCtxRef.current && recCtxRef.current.state !== "closed") {
        recCtxRef.current.close().catch(() => {});
        recCtxRef.current = null;
      }
      captureRef.current?.stop();
      asrRef.current?.close();
      micRef.current?.destroy();
      ttsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEndSession = useCallback(async () => {
    if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current);
    sessionActiveRef.current = false;
    llmAbortRef.current?.abort();

    // Stop MediaRecorder FIRST (before destroying mic/TTS audio nodes)
    let audioBlob: Blob | undefined;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      audioBlob = await new Promise<Blob | undefined>((resolve) => {
        recorder.onstop = () => {
          if (recordedChunksRef.current.length > 0) {
            resolve(new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
          } else {
            resolve(undefined);
          }
        };
        recorder.stop();
      });
    }

    captureRef.current?.stop();
    asrRef.current?.close();
    micRef.current?.destroy();
    ttsRef.current?.close();
    if (recCtxRef.current && recCtxRef.current.state !== "closed") {
      recCtxRef.current.close().catch(() => {});
      recCtxRef.current = null;
    }
    onEnd(messagesRef.current, toolStateRef.current, audioBlob);
  }, [onEnd]);

  useEffect(() => { handleEndSessionRef.current = handleEndSession; }, [handleEndSession]);

  const handleSendText = useCallback((text: string) => {
    if (!text.trim()) return;
    processUtterance(text);
  }, [processUtterance]);

  const stateLabel: Record<AgentState, string> = {
    idle: "Ready",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
  };

  const hasSidebar = config.sidebarMode !== "none";

  const formatToolArgs = (tc: ToolCallResult) => {
    const args = tc.arguments;
    const parts: string[] = [];
    if (args.item) parts.push(String(args.item));
    if (args.quantity && Number(args.quantity) > 1) parts.push(`x${args.quantity}`);
    if (args.size) parts.push(String(args.size));
    if (args.price != null) parts.push(`$${Number(args.price).toFixed(2)}`);
    if (args.modifiers && Array.isArray(args.modifiers) && args.modifiers.length > 0) parts.push(args.modifiers.join(", "));
    if (args.item_index != null) parts.push(`#${args.item_index}`);
    if (args.item_id) parts.push(String(args.item_id));
    if (args.description) parts.push(String(args.description));
    if (args.changes) {
      const c = args.changes as Record<string, unknown>;
      const cp: string[] = [];
      if (c.size) cp.push(String(c.size));
      if (c.modifiers && Array.isArray(c.modifiers)) cp.push(c.modifiers.join(", "));
      if (c.price != null) cp.push(`$${Number(c.price).toFixed(2)}`);
      if (cp.length) parts.push(cp.join(", "));
    }
    return parts.length > 0 ? parts.join(" · ") : "";
  };

  const TOOL_ICONS: Record<string, string> = {
    add_to_order: "+",
    remove_from_order: "−",
    modify_order_item: "✎",
    confirm_order: "✓",
    check_item: "✓",
    flag_issue: "⚑",
  };

  const TOOL_LABELS: Record<string, string> = {
    add_to_order: "Added",
    remove_from_order: "Removed",
    modify_order_item: "Modified",
    confirm_order: "Order Confirmed",
    check_item: "Checked",
    flag_issue: "Flagged",
  };

  return (
    <div className="session-root">
      <MoodGradient profile={liveProfile} />
      {/* Header */}
      <div className="session-header">
        <div className="session-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          <span className="session-title">Voice Agent</span>
          <span className={`session-status session-status--${agentState}`}>
            <span className="session-status-dot" />
            {stateLabel[agentState]}
          </span>
        </div>
        <div className="session-header-right">
          {documents.length > 0 && (
            <span className="session-docs-badge">{documents.length} doc{documents.length > 1 ? "s" : ""}</span>
          )}
          <button type="button" className="session-end-btn" onClick={handleEndSession}>End</button>
        </div>
      </div>

      {/* Body: messages + sidebar */}
      <div className="session-body">
        <div className="session-messages">
          {!isConnected && !error && <div className="session-connecting">Connecting...</div>}

          {error && (
            <div className="session-error">
              <strong>Error:</strong> {error}
              <button type="button" onClick={() => setError(null)} className="session-error-dismiss">&times;</button>
            </div>
          )}

          {messages.length === 0 && isConnected && !error && (
            <div className="session-empty">
              <div className="session-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </div>
              <p>Start speaking. I'm listening.</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`session-msg session-msg--${msg.role}`}>
              <div className="session-msg-label">
                {msg.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="session-msg-content">
                {msg.content}
              </div>
              {msg.role === "user" && config.enableMetadata && (msg.emotion || msg.intent || msg.entities?.length) && (
                <div className="session-msg-meta">
                  {msg.emotion && msg.emotion !== "NEUTRAL" && (
                    <span className="msg-emotion-badge" style={{ borderColor: EMOTION_COLORS[msg.emotion] || "#9ca3af", color: EMOTION_COLORS[msg.emotion] || "#9ca3af" }}>
                      {msg.emotion.charAt(0) + msg.emotion.slice(1).toLowerCase()}
                      {msg.emotionConfidence != null && <span className="msg-emotion-conf"> {(msg.emotionConfidence * 100).toFixed(0)}%</span>}
                    </span>
                  )}
                  {msg.intent && (
                    <span className="msg-intent-badge">
                      {msg.intent.charAt(0) + msg.intent.slice(1).toLowerCase().replace(/_/g, " ")}
                    </span>
                  )}
                  {msg.entities?.map((ent, i) => (
                    <span key={i} className="msg-entity-tag">{ent.text}</span>
                  ))}
                </div>
              )}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="session-tool-events">
                  {msg.toolCalls.map((tc, i) => (
                    <div key={i} className={`session-tool-event session-tool-event--${tc.name}`}>
                      <span className="session-tool-icon">{TOOL_ICONS[tc.name] || "⚙"}</span>
                      <span className="session-tool-label">{TOOL_LABELS[tc.name] || tc.name}</span>
                      {formatToolArgs(tc) && <span className="session-tool-args">{formatToolArgs(tc)}</span>}
                    </div>
                  ))}
                </div>
              )}
              {msg.citations && msg.citations.length > 0 && (
                <div className="session-msg-citations">
                  {msg.citations.map((c) => <span key={c} className="session-citation-tag">{c}</span>)}
                </div>
              )}
            </div>
          ))}

          {(streamingResponse || liveEvents.length > 0) && (
            <div className="session-msg session-msg--assistant session-msg--streaming">
              <div className="session-msg-label">Assistant</div>
              {streamingResponse && (
                <div className="session-msg-content">{streamingResponse}<span className="session-cursor" /></div>
              )}
              {liveEvents.length > 0 && (
                <div className="session-tool-events">
                  {liveEvents.map((tc, i) => (
                    <div key={i} className={`session-tool-event session-tool-event--${tc.name} session-tool-event--live`}>
                      <span className="session-tool-icon">{TOOL_ICONS[tc.name] || "⚙"}</span>
                      <span className="session-tool-label">{TOOL_LABELS[tc.name] || tc.name}</span>
                      {formatToolArgs(tc) && <span className="session-tool-args">{formatToolArgs(tc)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {interimText && (
            <div className="session-msg session-msg--user session-msg--interim">
              <div className="session-msg-label">You</div>
              <div className="session-msg-content">{interimText}</div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {hasSidebar && (
          <Sidebar
            mode={config.sidebarMode}
            messages={messages}
            documents={documents}
            toolState={toolState}
            liveProfile={liveProfile}
            sessionStartTime={sessionStartRef.current}
          />
        )}
      </div>

      {config.enableMetadata && <LiveEmotionBar timeline={liveTimeline} />}

      {/* Input Bar */}
      <div className="session-input-bar">
        <div className={`session-mic-indicator session-mic-indicator--${agentState}`}>
          <div className="session-mic-ring" />
          <div className="session-mic-ring session-mic-ring--2" />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>
        <TextInput onSend={handleSendText} disabled={agentState === "thinking"} />
      </div>
    </div>
  );
}

function TextInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !disabled) { onSend(text.trim()); setText(""); }
  }, [text, disabled, onSend]);

  return (
    <form className="session-text-form" onSubmit={handleSubmit}>
      <input type="text" className="session-text-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type a message..." disabled={disabled} />
      <button type="submit" className="session-send-btn" disabled={!text.trim() || disabled}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" x2="11" y1="2" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </form>
  );
}
