import type {
  LiveAssistFeedback, LiveAssistDone, LiveAssistStatus,
  LiveAssistMemoryItem, LiveAssistCallbacks, AgendaStatusItem,
} from "./types";

export interface LiveAssistDocumentPayload {
  id: string;
  name: string;
  content: string;
}

export interface IntentSignals {
  user?: Record<string, number>;
  other?: Record<string, number>;
}

export async function streamLiveAssistWithFeedback(params: {
  agentUrl: string;
  transcript: string;
  userId: string;
  mode?: string;
  agentId?: string;
  userPersonality?: string;
  userTimezone?: string;
  voiceProfileSummary?: string;
  contextFilters?: Record<string, boolean>;
  documents_payload?: LiveAssistDocumentPayload[];
  custom_prompt?: string;
  agenda_items?: Array<{ id: string; title: string; status?: string; confidence?: number }>;
  emotion_profile?: Record<string, number>;
  intent_signals?: IntentSignals;
  entities?: Array<{ type: string; value: string }>;
  callbacks: LiveAssistCallbacks;
  signal?: AbortSignal;
}): Promise<void> {
  const {
    agentUrl, transcript, userId,
    mode = "meeting", agentId,
    userPersonality = "", userTimezone = "UTC",
    voiceProfileSummary = "",
    contextFilters = { docs: false, memories: true, notes: true, history: true, emails: false },
    documents_payload = [], custom_prompt, agenda_items,
    emotion_profile, intent_signals, entities, callbacks, signal,
  } = params;

  const body: Record<string, unknown> = {
    transcript, mode, user_id: userId, device_id: userId,
    context_filters: contextFilters, user_personality: userPersonality,
    user_location: "", user_timezone: userTimezone, documents_payload,
    ...(custom_prompt?.trim() ? { custom_prompt: custom_prompt.trim() } : {}),
    ...(agentId ? { agent_id: agentId } : {}),
    ...(agenda_items?.length ? { agenda_items } : {}),
    ...(emotion_profile != null ? { emotion_profile } : {}),
    ...(intent_signals && (intent_signals.user || intent_signals.other) ? { intent_signals } : {}),
    ...(voiceProfileSummary ? { voice_profile_summary: voiceProfileSummary } : {}),
    ...(entities?.length ? { entities } : {}),
  };

  const url = `${agentUrl.replace(/\/$/, "")}/live-assist/process/stream`;
  if (process.env.NODE_ENV === "development") {
    console.log("[LiveAssist] Fetching feedback from", url);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) { callbacks.onError?.(new Error(`Live-assist failed: ${res.status}`)); return; }
  const reader = res.body?.getReader();
  if (!reader) { callbacks.onError?.(new Error("No response body")); return; }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]" || raw === "") continue;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const type = parsed.type as string | undefined;
          const payload = parsed.data as Record<string, unknown> | undefined;
          if (process.env.NODE_ENV === "development") {
            if (type === "feedback_chunk" || type === "feedback" || type === "done" || type === "status") {
              console.log("[LiveAssist] Stream event:", type, payload ? "(has payload)" : "");
            }
          }
          if (type === "feedback_chunk" && payload?.chunk) {
            callbacks.onFeedbackChunk?.(String(payload.chunk));
          } else if (type === "feedback" && payload) {
            callbacks.onFeedback?.({ summary: (payload.summary as string) ?? "", suggestions: (payload.suggestions as string[]) ?? [] });
          } else if (type === "status" && payload) {
            callbacks.onStatus?.({
              engagementScore: payload.engagementScore as number | undefined,
              sentimentTrend: payload.sentimentTrend as string | undefined,
              keywords: payload.keywords as string[] | undefined,
              agendaStatus: payload.agenda_status as AgendaStatusItem[] | undefined,
            });
          } else if (type === "memory" && payload) {
            callbacks.onMemory?.({ items: (payload.items as LiveAssistMemoryItem[]) ?? [] });
          } else if (type === "action" && payload) {
            callbacks.onAction?.({ items: (payload.items as LiveAssistDone["actionItems"]) ?? [] });
          } else if (type === "done") {
            const d = (payload ?? parsed) as Record<string, unknown>;
            callbacks.onDone?.({
              feedbackSummary: (d.feedbackSummary as string) ?? "",
              suggestions: (d.suggestions as string[]) ?? [],
              knowledgeItems: (d.knowledgeItems as LiveAssistDone["knowledgeItems"]) ?? [],
              actionItems: (d.actionItems as LiveAssistDone["actionItems"]) ?? [],
              keywords: (d.keywords as string[]) ?? [],
              engagementScore: d.engagementScore as number | undefined,
              sentimentTrend: d.sentimentTrend as string | undefined,
              mode: d.mode as string | undefined,
              agendaStatus: d.agenda_status as AgendaStatusItem[] | undefined,
            });
          }
        } catch { /* skip non-JSON */ }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Intentional abort — not a real error
    } else {
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  } finally {
    reader.releaseLock();
  }
}
