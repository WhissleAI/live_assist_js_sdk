import type { StreamTranscriptSegment, AsrStreamConfig } from "./types";
export declare class AsrStreamClient {
    private ws;
    private state;
    private cfg;
    private asrUrl;
    private endResolve;
    private pendingEnd;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private intentionalClose;
    private reconnecting;
    private connectTimeout;
    private pcmBuffer;
    private pcmBufferBytes;
    private static readonly MAX_BUFFER_BYTES;
    private static readonly MAX_BUFFERED_AMOUNT;
    onTranscript: ((seg: StreamTranscriptSegment) => void) | null;
    onError: ((err: Error) => void) | null;
    constructor(asrUrl: string, cfg?: AsrStreamConfig);
    get connected(): boolean;
    connect(): Promise<void>;
    private _doConnect;
    private _sendConfig;
    private _flushBuffer;
    reconfigure(patch: Partial<AsrStreamConfig>): void;
    sendPcm(pcm: Int16Array): void;
    setChannel(name: "microphone" | "system"): void;
    end(): Promise<StreamTranscriptSegment[]>;
    close(): void;
    private _close;
}
//# sourceMappingURL=asr.d.ts.map