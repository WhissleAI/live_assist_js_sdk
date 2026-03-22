import type { TranscriptEntry, AgendaItem, BehavioralProfile, LiveAssistDone, SessionReport, AttachedDoc } from "./types";
import type { LiveAssistConfig } from "./config";
type EventMap = {
    transcript: TranscriptEntry[];
    profile: {
        user: BehavioralProfile;
        other: BehavioralProfile;
    };
    feedback: {
        summary: string;
        suggestions: string[];
    };
    action: {
        items: LiveAssistDone["actionItems"];
    };
    memory: {
        items: Array<{
            id: string;
            title: string;
            content?: string;
        }>;
    };
    agenda: AgendaItem[];
    status: {
        engagementScore?: number;
        sentimentTrend?: string;
        keywords?: string[];
    };
    error: Error;
};
type Listener<K extends keyof EventMap> = (data: EventMap[K]) => void;
export declare class LiveAssistSession {
    private config;
    private deviceId;
    private listeners;
    private profileManager;
    private transcriptEntries;
    private micAsr;
    private tabAsr;
    private sharedMic;
    private micCapture;
    private tabCapture;
    private feedbackTimer;
    private feedbackAbort;
    private _running;
    private agenda;
    private documents;
    private _instructions;
    private _agentId;
    private _mode;
    private lastDone;
    private segIdCounterMic;
    private segIdCounterTab;
    private entryIdCounter;
    private sessionId;
    private audioRecorder;
    private userKeywordSet;
    private otherKeywordSet;
    private feedbackSegRange;
    private prevAgendaConf;
    constructor(config: LiveAssistConfig);
    on<K extends keyof EventMap>(event: K, cb: Listener<K>): this;
    off<K extends keyof EventMap>(event: K, cb: Listener<K>): this;
    private emit;
    get isRunning(): boolean;
    get transcript(): TranscriptEntry[];
    get profiles(): {
        user: import("./behavioralProfile").BehavioralProfile;
        other: import("./behavioralProfile").BehavioralProfile;
    };
    start(options?: {
        includeTab?: boolean;
        agenda?: AgendaItem[];
        documents?: AttachedDoc[];
        instructions?: string;
        agentId?: string;
        mode?: string;
        recordAudio?: boolean;
    }): Promise<void>;
    stop(): Promise<SessionReport>;
    private handleSegment;
    private mergeAgendaUpdate;
    private runFeedback;
}
export declare function createLiveAssistSession(config: LiveAssistConfig): LiveAssistSession;
export {};
//# sourceMappingURL=session.d.ts.map