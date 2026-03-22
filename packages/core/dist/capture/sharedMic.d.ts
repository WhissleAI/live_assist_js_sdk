export declare class SharedMicManager {
    private stream;
    private context;
    private workletNode;
    private sourceNode;
    private filterNode;
    private consumers;
    private _starting;
    private _startPromise;
    private _closeTimer;
    private workletUrl;
    constructor(workletUrl?: string);
    addConsumer(id: string, onPcm: (pcm: Int16Array) => void): Promise<string | null>;
    private _open;
    removeConsumer(id: string): void;
    private _close;
    get isActive(): boolean;
    getStream(): MediaStream | null;
    flushWorklet(): void;
    destroy(): void;
}
//# sourceMappingURL=sharedMic.d.ts.map