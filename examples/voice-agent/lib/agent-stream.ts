/**
 * SSE consumer for the gateway's /agent/route/stream endpoint.
 *
 * Thin SSE parser — all intelligence (system prompts, tool definitions,
 * multi-round tool calling) lives server-side. The frontend sends agent
 * config so the gateway can use it for dynamic prompt resolution.
 */

import { gatewayConfig } from "./gateway-config";
import { getDeviceId } from "./device-id";
import type { AgentConfig } from "./agent-config";

// ---------------------------------------------------------------------------
// SSE event types emitted by the gateway
// ---------------------------------------------------------------------------

export interface AgentStepEvent {
  title: string;
  detail?: string;
  status?: string;
  step_type?: string;
}

export interface AgentToolEvent {
  name: string;
  arguments: Record<string, unknown>;
}

export interface TtsReadyEvent {
  text: string;
  emotion?: string[];
  speed?: string;
}

export interface ToolResultEvent {
  tool_name: string;
  data: Record<string, unknown>;
  step_index: number;
}

export interface AgentStreamCallbacks {
  onModeDetected?: (mode: string, label: string, icon: string) => void;
  onStep?: (event: AgentStepEvent) => void;
  onChunk?: (text: string) => void;
  onTtsReady?: (event: TtsReadyEvent) => void;
  onToolCall?: (event: AgentToolEvent) => void;
  onToolResult?: (event: ToolResultEvent) => void;
  onMemory?: (items: string[]) => void;
  onDone?: (summary: string, conversationId?: string) => void;
  onError?: (message: string) => void;
}

export interface MetadataProb {
  token: string;
  probability: number;
}

export interface AgentStreamParams {
  query: string;
  agentConfig: AgentConfig;
  currentEmotion?: string;
  emotionConfidence?: number;
  conversationContext?: string;
  // Full ASR probability arrays for behavioral context
  emotionProbs?: MetadataProb[];
  intentProbs?: MetadataProb[];
  genderProbs?: MetadataProb[];
  ageProbs?: MetadataProb[];
  // Session-level behavioral profile
  behavioralProfile?: Record<string, unknown> | null;
  voiceProfileSummary?: string;
}

// ---------------------------------------------------------------------------
// Main stream function
// ---------------------------------------------------------------------------

export async function streamAgentRouter(
  params: AgentStreamParams,
  callbacks: AgentStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const deviceId = getDeviceId();
  const url = gatewayConfig.agentStreamUrl;
  const cfg = params.agentConfig;

  const body: Record<string, unknown> = {
    query: params.query,
    user_id: deviceId,
    source_app: "whissle_agents",
    context: params.conversationContext || "",
    agent_config: {
      agent_id: cfg.id,
      system_prompt: cfg.systemPrompt,
      knowledge_context: cfg.knowledgeContext,
      model: cfg.model,
      temperature: cfg.temperature,
      max_output_tokens: cfg.maxOutputTokens,
      enabled_tools: cfg.enabledTools,
      enable_emotion_tts: cfg.enableEmotionTts,
      require_tool_confirmation: cfg.requireToolConfirmation ?? true,
      language: cfg.language,
      integrations: cfg.integrations || {},
    },
    user_emotion: params.currentEmotion || "NEUTRAL",
    user_emotion_confidence: params.emotionConfidence || 0,
    // Legacy aliases — backend may still read these
    child_emotion: params.currentEmotion || "NEUTRAL",
    child_emotion_confidence: params.emotionConfidence || 0,
    // Full ASR metadata arrays — enables _build_behavioral_context on the backend
    current_request_emotion: params.emotionProbs || [],
    current_request_intent: params.intentProbs || [],
    current_request_gender: params.genderProbs || [],
    current_request_age: params.ageProbs || [],
    // Session-level voice profile
    behavioral_profile: params.behavioralProfile || null,
    voice_profile_summary: params.voiceProfileSummary || "",
  };

  const sessionToken = gatewayConfig.getSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "X-Device-Id": deviceId,
  };
  if (sessionToken) {
    headers["X-Session-Token"] = sessionToken;
  }

  console.log("[AgentSSE] request body keys:", Object.keys(body), "agent_config?", !!body.agent_config);
  if (body.agent_config) {
    const ac = body.agent_config as Record<string, unknown>;
    console.log("[AgentSSE] agent_config keys:", Object.keys(ac), "agent_id:", ac.agent_id);
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    callbacks.onError?.(`Agent API error ${res.status}: ${text}`);
    return;
  }

  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    parseSSEBlock(text, callbacks);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      processSSELine(line, callbacks);
    }
  }

  if (buffer.trim()) {
    processSSELine(buffer, callbacks);
  }
}

// ---------------------------------------------------------------------------
// SSE parsing helpers
// ---------------------------------------------------------------------------

function processSSELine(line: string, cb: AgentStreamCallbacks): void {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data: ")) return;

  const data = trimmed.slice(6);
  if (data === "[DONE]") return;

  try {
    const parsed = JSON.parse(data);
    const event = parsed.event as string;

    console.log("[AgentSSE]", event, event === "chunk" ? `(${(parsed.text || "").length} chars)` : JSON.stringify(parsed).slice(0, 200));

    switch (event) {
      case "mode_detected":
        cb.onModeDetected?.(
          parsed.mode as string,
          parsed.label as string,
          parsed.icon as string,
        );
        break;

      case "step":
        cb.onStep?.({
          title: parsed.title as string,
          detail: parsed.detail as string | undefined,
          status: parsed.status as string | undefined,
          step_type: parsed.step_type as string | undefined,
        });
        break;

      case "chunk":
        cb.onChunk?.(typeof parsed.text === "string" ? parsed.text : "");
        break;

      case "tts_ready":
        cb.onTtsReady?.({
          text: typeof parsed.text === "string" ? parsed.text : "",
          emotion: Array.isArray(parsed.emotion) ? parsed.emotion as string[] : undefined,
          speed: typeof parsed.speed === "string" ? parsed.speed : undefined,
        });
        break;

      case "kids_tool": // legacy event name — backend still emits this
      case "tool_call":
        cb.onToolCall?.({
          name: parsed.name as string,
          arguments: (parsed.arguments as Record<string, unknown>) ?? {},
        });
        break;

      case "memory":
        cb.onMemory?.(parsed.items as string[]);
        break;

      case "tool_result":
        cb.onToolResult?.({
          tool_name: parsed.tool_name as string,
          data: (parsed.data as Record<string, unknown>) ?? {},
          step_index: (parsed.step_index as number) ?? 0,
        });
        break;

      case "done":
        cb.onDone?.(
          typeof parsed.summary === "string" ? parsed.summary : "",
          typeof parsed.conversation_id === "string" ? parsed.conversation_id : undefined,
        );
        break;

      case "error":
        cb.onError?.(typeof parsed.message === "string" ? parsed.message : "Unknown error");
        break;
    }
  } catch {
    // ignore parse errors for incomplete lines
  }
}

function parseSSEBlock(text: string, cb: AgentStreamCallbacks): void {
  for (const line of text.split("\n")) {
    processSSELine(line, cb);
  }
}
