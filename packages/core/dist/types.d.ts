export interface TranscriptEntry {
    channel: "mic" | "tab" | "assistant";
    text: string;
    speaker?: string;
    audioOffset?: number;
    is_final?: boolean;
    _ts?: number;
    _segId?: number;
    _promoted?: boolean;
    _id?: number;
}
export interface AgendaItem {
    id: string;
    title: string;
    status?: "pending" | "in_progress" | "completed" | "skipped";
    confidence?: number;
    sentiment?: "positive" | "neutral" | "negative" | "mixed" | "";
    evidence?: string;
}
export interface BehavioralProfile {
    emotionProfile: Record<string, number>;
    intentProfile: Record<string, number>;
    segmentCount: number;
}
export interface StreamTranscriptSegment {
    channel: string;
    text: string;
    audioOffset: number;
    is_final: boolean;
    metadata?: {
        emotion?: string;
        intent?: string;
        age?: string;
        gender?: string;
    };
    metadata_probs?: {
        emotion?: Array<{
            token: string;
            probability: number;
        }>;
        intent?: Array<{
            token: string;
            probability: number;
        }>;
        age?: Array<{
            token: string;
            probability: number;
        }>;
        gender?: Array<{
            token: string;
            probability: number;
        }>;
    };
    entities?: Array<{
        entity: string;
        text: string;
    }>;
    speakerChange?: boolean;
    speakerEmbedding?: number[];
    utterance_end?: boolean;
}
export interface AsrStreamConfig {
    language?: string;
    useLm?: boolean;
    sampleRate?: number;
    metadataProb?: boolean;
    token?: string;
    speakerEmbedding?: boolean;
    ptt_mode?: boolean;
}
export interface LiveAssistFeedback {
    summary: string;
    suggestions: string[];
}
export interface AgendaStatusItem {
    id: string;
    title?: string;
    status?: "pending" | "in_progress" | "completed" | "skipped";
    confidence?: number;
    sentiment?: "positive" | "neutral" | "negative" | "mixed" | "";
    evidence?: string;
}
export interface LiveAssistDone {
    feedbackSummary: string;
    suggestions: string[];
    knowledgeItems: Array<{
        id: string;
        title: string;
        content: string;
        detail?: string;
        source?: string;
    }>;
    actionItems: Array<{
        id: string;
        title: string;
        type?: string;
        description?: string;
        priority?: number;
    }>;
    keywords: string[];
    engagementScore?: number;
    sentimentTrend?: string;
    mode?: string;
    agendaStatus?: AgendaStatusItem[];
}
export interface LiveAssistStatus {
    engagementScore?: number;
    sentimentTrend?: string;
    keywords?: string[];
    agendaStatus?: AgendaStatusItem[];
}
export interface LiveAssistMemoryItem {
    id: string;
    title: string;
    content?: string;
    detail?: string;
    source?: string;
    category?: string;
    relevanceScore?: number;
}
export interface LiveAssistCallbacks {
    onFeedbackChunk?: (chunk: string) => void;
    onStatus?: (data: LiveAssistStatus) => void;
    onMemory?: (data: {
        items: LiveAssistMemoryItem[];
    }) => void;
    onAction?: (data: {
        items: LiveAssistDone["actionItems"];
    }) => void;
    onFeedback?: (data: LiveAssistFeedback) => void;
    onDone?: (data: LiveAssistDone) => void;
    onError?: (err: Error) => void;
}
export interface SessionReport {
    feedbackSummary: string;
    suggestions: string[];
    actionItems: LiveAssistDone["actionItems"];
    knowledgeItems: LiveAssistDone["knowledgeItems"];
    userProfile: BehavioralProfile;
    otherProfile: BehavioralProfile;
    keywords: string[];
    engagementScore?: number;
    sentimentTrend?: string;
}
export interface AttachedDoc {
    id: string;
    name: string;
    content: string;
    useForContext?: boolean;
}
//# sourceMappingURL=types.d.ts.map