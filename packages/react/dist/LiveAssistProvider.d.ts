import React from "react";
import type { LiveAssistConfig, TranscriptEntry, AgendaItem, BehavioralProfile, SessionReport, AttachedDoc } from "@whissle/live-assist-core";
import { LiveAssistSession } from "@whissle/live-assist-core";
interface LiveAssistContextValue {
    session: LiveAssistSession | null;
    isCapturing: boolean;
    hasTabAudio: boolean;
    transcript: TranscriptEntry[];
    userProfile: BehavioralProfile;
    otherProfile: BehavioralProfile;
    feedbackSummary: string;
    suggestions: string[];
    keywords: string[];
    agendaItems: AgendaItem[];
    instructions: string;
    setInstructions: (s: string) => void;
    error: string | null;
    startCapture: (opts?: {
        includeTab?: boolean;
        agenda?: AgendaItem[];
        documents?: AttachedDoc[];
        instructions?: string;
        agentId?: string;
        mode?: string;
        recordAudio?: boolean;
    }) => Promise<void>;
    stopCapture: () => Promise<SessionReport>;
}
export declare function LiveAssistProvider({ config, children }: {
    config: LiveAssistConfig;
    children: React.ReactNode;
}): any;
export declare function useLiveAssist(): LiveAssistContextValue;
export {};
//# sourceMappingURL=LiveAssistProvider.d.ts.map