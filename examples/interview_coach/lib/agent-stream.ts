import type { ToolDefinition, ToolCallResult } from "./tools";

export type { ToolDefinition, ToolCallResult };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCallResult[];
}

/**
 * Stream a chat completion from the voice-agent server endpoint.
 * Yields text strings and ToolCallResult objects as they arrive via SSE.
 */
export async function* streamAgentChat(
  agentUrl: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
  tools?: ToolDefinition[],
): AsyncGenerator<string | ToolCallResult, void, undefined> {
  const url = `${agentUrl.replace(/\/+$/, "")}/voice-agent/chat/stream`;

  const body: Record<string, unknown> = { messages };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Agent API error ${res.status}: ${text}`);
  }

  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(trimmed.slice(6));
        if (event.type === "text_chunk" && event.content) {
          yield event.content as string;
        } else if (event.type === "tool_call") {
          yield { id: event.id ?? "", name: event.name ?? "", arguments: event.arguments ?? {} } as ToolCallResult;
        }
      } catch { /* ignore parse errors */ }
    }
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
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);

      try {
        const event = JSON.parse(data);

        if (event.type === "text_chunk" && event.content) {
          yield event.content as string;
        } else if (event.type === "tool_call") {
          yield {
            id: event.id ?? "",
            name: event.name ?? "",
            arguments: event.arguments ?? {},
          } as ToolCallResult;
        } else if (event.type === "error") {
          throw new Error(event.message || "Agent processing failed");
        } else if (event.type === "done") {
          return;
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Agent")) throw e;
      }
    }
  }
}
