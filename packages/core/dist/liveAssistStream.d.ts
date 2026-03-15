import type { LiveAssistCallbacks } from "./types";
export interface LiveAssistDocumentPayload {
    id: string;
    name: string;
    content: string;
}
export interface IntentSignals {
    user?: Record<string, number>;
    other?: Record<string, number>;
}
export declare function streamLiveAssistWithFeedback(params: {
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
    agenda_items?: Array<{
        id: string;
        title: string;
        status?: string;
        confidence?: number;
    }>;
    emotion_profile?: Record<string, number>;
    intent_signals?: IntentSignals;
    entities?: Array<{
        type: string;
        value: string;
    }>;
    callbacks: LiveAssistCallbacks;
    signal?: AbortSignal;
}): Promise<void>;
//# sourceMappingURL=liveAssistStream.d.ts.map