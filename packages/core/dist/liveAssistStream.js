export async function streamLiveAssistWithFeedback(params) {
    const { agentUrl, transcript, userId, mode = "meeting", agentId, userPersonality = "", userTimezone = "UTC", voiceProfileSummary = "", contextFilters = { docs: false, memories: true, notes: true, history: true, emails: false }, documents_payload = [], custom_prompt, agenda_items, emotion_profile, intent_signals, entities, callbacks, signal, } = params;
    const body = {
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
    if (!res.ok) {
        callbacks.onError?.(new Error(`Live-assist failed: ${res.status}`));
        return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
        callbacks.onError?.(new Error("No response body"));
        return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data: "))
                    continue;
                const raw = line.slice(6).trim();
                if (raw === "[DONE]" || raw === "")
                    continue;
                try {
                    const parsed = JSON.parse(raw);
                    const type = parsed.type;
                    const payload = parsed.data;
                    if (process.env.NODE_ENV === "development") {
                        if (type === "feedback_chunk" || type === "feedback" || type === "done" || type === "status") {
                            console.log("[LiveAssist] Stream event:", type, payload ? "(has payload)" : "");
                        }
                    }
                    if (type === "feedback_chunk" && payload?.chunk) {
                        callbacks.onFeedbackChunk?.(String(payload.chunk));
                    }
                    else if (type === "feedback" && payload) {
                        callbacks.onFeedback?.({ summary: payload.summary ?? "", suggestions: payload.suggestions ?? [] });
                    }
                    else if (type === "status" && payload) {
                        callbacks.onStatus?.({
                            engagementScore: payload.engagementScore,
                            sentimentTrend: payload.sentimentTrend,
                            keywords: payload.keywords,
                            agendaStatus: payload.agenda_status,
                        });
                    }
                    else if (type === "memory" && payload) {
                        callbacks.onMemory?.({ items: payload.items ?? [] });
                    }
                    else if (type === "action" && payload) {
                        callbacks.onAction?.({ items: payload.items ?? [] });
                    }
                    else if (type === "done") {
                        const d = (payload ?? parsed);
                        callbacks.onDone?.({
                            feedbackSummary: d.feedbackSummary ?? "",
                            suggestions: d.suggestions ?? [],
                            knowledgeItems: d.knowledgeItems ?? [],
                            actionItems: d.actionItems ?? [],
                            keywords: d.keywords ?? [],
                            engagementScore: d.engagementScore,
                            sentimentTrend: d.sentimentTrend,
                            mode: d.mode,
                            agendaStatus: d.agenda_status,
                        });
                    }
                }
                catch { /* skip non-JSON */ }
            }
        }
    }
    catch (err) {
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
    finally {
        reader.releaseLock();
    }
}
//# sourceMappingURL=liveAssistStream.js.map