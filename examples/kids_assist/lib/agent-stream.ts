/**
 * SSE consumer for the gateway's /agent/route/stream endpoint.
 *
 * Replaces the old OpenAI-style chat completion client. All intelligence
 * (system prompts, tool definitions, multi-round tool calling) now lives
 * server-side — this module is a thin SSE parser.
 */

import { gatewayConfig } from "./gateway-config";
import { getDeviceId } from "./device-id";
import type { KidsMode } from "./modes";

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

export interface AgentStreamCallbacks {
  onModeDetected?: (mode: string, label: string, icon: string) => void;
  onStep?: (event: AgentStepEvent) => void;
  onChunk?: (text: string) => void;
  onTtsReady?: (text: string) => void;
  onKidsTool?: (event: AgentToolEvent) => void;
  onMemory?: (items: string[]) => void;
  onDone?: (summary: string) => void;
  onError?: (message: string) => void;
}

export interface AgentStreamParams {
  query: string;
  mode: KidsMode;
  childName?: string;
  childAge?: number;
  childEmotion?: string;
  childEmotionConfidence?: number;
  context?: string;
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

  const body: Record<string, unknown> = {
    query: params.query,
    user_id: deviceId,
    mode_hint: params.mode,
    source_app: "kids_assist",
    child_name: params.childName || "",
    child_age: params.childAge || 0,
    child_emotion: params.childEmotion || "NEUTRAL",
    child_emotion_confidence: params.childEmotionConfidence || 0,
    context: params.context || "",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Device-Id": deviceId,
    },
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
        cb.onTtsReady?.(typeof parsed.text === "string" ? parsed.text : "");
        break;

      case "kids_tool":
        cb.onKidsTool?.({
          name: parsed.name as string,
          arguments: (parsed.arguments as Record<string, unknown>) ?? {},
        });
        break;

      case "memory":
        cb.onMemory?.(parsed.items as string[]);
        break;

      case "done":
        cb.onDone?.(typeof parsed.summary === "string" ? parsed.summary : "");
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
