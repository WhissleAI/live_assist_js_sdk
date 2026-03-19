import React, { useState, useEffect, useRef, useCallback } from "react";
import { AsrStreamClient, SharedMicManager, MicCapture, EMOTION_COLORS } from "@whissle/live-assist-core";
import type { StreamTranscriptSegment } from "@whissle/live-assist-core";
import type { VoiceAgentConfig, ConversationMessage } from "./App";
import type { UploadedDocument } from "./lib/documents";
import { buildDocumentContext } from "./lib/documents";
import { RimeTtsClient } from "./lib/rime-tts";
import { streamAgentChat, type ChatMessage } from "./lib/agent-stream";
import type { ToolCallResult, ToolState } from "./lib/tools";
import { executeTool, createInitialToolState } from "./lib/tools";
import Sidebar from "./Sidebar";

interface Props {
  config: VoiceAgentConfig;
  documents: UploadedDocument[];
  onEnd: (messages: ConversationMessage[], toolState: ToolState) => void;
}

type AgentState = "idle" | "listening" | "thinking" | "speaking";

const UTTERANCE_AGGREGATION_MS = 1500;
const MIN_UTTERANCE_WORDS = 2;
const MIN_UTTERANCE_CHARS = 5;
const BARGE_IN_MIN_WORDS = 3;
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

  const asrRef = useRef<AsrStreamClient | null>(null);
  const micRef = useRef<SharedMicManager | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
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

  // Processing lock + utterance queue
  const processingRef = useRef(false);
  const pendingUtterancesRef = useRef<string[]>([]);
  // Short fragment buffer -- fragments too short to send alone get held here
  const fragmentBufferRef = useRef("");

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

    const userMsg: ConversationMessage = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: userText.trim(),
      timestamp: Date.now(),
      emotion: dominantEmotion,
      emotionConfidence: emotionConf,
      intent: dominantIntent,
      entities,
    };

    // Update ref synchronously so chatHistory always includes the latest messages
    messagesRef.current = [...messagesRef.current, userMsg];
    setMessages(messagesRef.current);
    setInterimText("");
    setStreamingResponse("");
    streamingResponseRef.current = "";
    stateRef.current = "thinking";
    setAgentState("thinking");

    const docContext = buildDocumentContext(documents);

    let emotionCtx = "";
    if (config.enableMetadata && dominantEmotion && dominantEmotion !== "NEUTRAL") {
      emotionCtx = `\n\n[Voice context: User's tone is ${dominantEmotion.toLowerCase()} (confidence: ${((emotionConf ?? 0) * 100).toFixed(0)}%). Adapt your response accordingly.]`;
    }

    const systemContent = [config.systemPrompt, docContext, emotionCtx].filter(Boolean).join("\n\n");

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

    try {
      const tools = config.tools.length > 0 ? config.tools : undefined;
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
            sentenceBuffer = "";
          }
        } else {
          collectedToolCalls.push(token);
          const newState = executeTool(token, toolStateRef.current);
          toolStateRef.current = newState;
          setToolState({ ...newState });
        }
      }

      if (sentenceBuffer.trim()) {
        ttsRef.current?.speak(sentenceBuffer);
        ttsRef.current?.flush();
      }

      if (sessionActiveRef.current) {
        if (fullResponse.trim() || collectedToolCalls.length > 0) {
          const citations = findCitations(fullResponse);
          const assistantMsg: ConversationMessage = {
            id: `msg_${Date.now()}_assistant`,
            role: "assistant",
            content: fullResponse.trim(),
            timestamp: Date.now(),
            citations: citations.length > 0 ? citations : undefined,
            toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
          };
          messagesRef.current = [...messagesRef.current, assistantMsg];
          setMessages(messagesRef.current);
          setStreamingResponse("");
          streamingResponseRef.current = "";

          if (collectedToolCalls.length > 0 && fullResponse.trim() === "") {
            const toolResultMessages: ChatMessage[] = [
              ...chatHistory,
              { role: "assistant" as const, content: "", tool_calls: collectedToolCalls },
            ];
            for (const tc of collectedToolCalls) {
              toolResultMessages.push({
                role: "tool",
                content: JSON.stringify({ success: true, state: toolStateRef.current }),
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

          if (followUp.trim()) {
            const followUpMsg: ConversationMessage = {
              id: `msg_${Date.now()}_assistant_followup`,
              role: "assistant",
              content: followUp.trim(),
              timestamp: Date.now(),
            };
            messagesRef.current = [...messagesRef.current, followUpMsg];
            setMessages(messagesRef.current);
            setStreamingResponse("");
            streamingResponseRef.current = "";
          }
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

  // Stable refs so the init effect doesn't re-run when callbacks change
  const processUtteranceRef = useRef(processUtterance);
  const handleBargeInRef = useRef(handleBargeIn);
  useEffect(() => { processUtteranceRef.current = processUtterance; }, [processUtterance]);
  useEffect(() => { handleBargeInRef.current = handleBargeIn; }, [handleBargeIn]);

  // --- Init effect: runs ONCE on mount ---
  useEffect(() => {
    sessionActiveRef.current = true;
    greetingSpokenRef.current = false;
    let cleaned = false;

    function handleTranscript(seg: StreamTranscriptSegment) {
      if (!sessionActiveRef.current) return;
      const text = (seg.text || "").trim();
      if (!text) return;

      // Smart barge-in: only on final segments with enough substance
      if (stateRef.current === "speaking" || stateRef.current === "thinking") {
        if (seg.is_final) {
          const wordCount = text.split(/\s+/).filter(Boolean).length;
          if (wordCount >= BARGE_IN_MIN_WORDS) {
            handleBargeInRef.current();
          }
        }
        // Partials and short finals don't interrupt
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
        const asr = new AsrStreamClient(config.asrUrl, { metadataProb: config.enableMetadata });
        asr.onTranscript = handleTranscript;
        asr.onError = (err) => setError(err.message);
        asrRef.current = asr;
        await asr.connect();

        const mic = new SharedMicManager(config.audioWorkletUrl);
        micRef.current = mic;
        const capture = new MicCapture(mic, (pcm) => asr.sendPcm(pcm));
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
      llmAbortRef.current?.abort();
      captureRef.current?.stop();
      asrRef.current?.close();
      micRef.current?.destroy();
      ttsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEndSession = useCallback(() => {
    sessionActiveRef.current = false;
    llmAbortRef.current?.abort();
    captureRef.current?.stop();
    asrRef.current?.close();
    micRef.current?.destroy();
    ttsRef.current?.close();
    onEnd(messagesRef.current, toolStateRef.current);
  }, [onEnd]);

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

  return (
    <div className="session-root">
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
              {msg.citations && msg.citations.length > 0 && (
                <div className="session-msg-citations">
                  {msg.citations.map((c) => <span key={c} className="session-citation-tag">{c}</span>)}
                </div>
              )}
            </div>
          ))}

          {streamingResponse && (
            <div className="session-msg session-msg--assistant session-msg--streaming">
              <div className="session-msg-label">Assistant</div>
              <div className="session-msg-content">{streamingResponse}<span className="session-cursor" /></div>
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
          <Sidebar mode={config.sidebarMode} messages={messages} documents={documents} toolState={toolState} />
        )}
      </div>

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
