export declare class TabCapture {
    private stream;
    private context;
    private node;
    private _capturing;
    private _onPcm;
    private workletUrl;
    constructor(onPcm: (pcm: Int16Array) => void, workletUrl?: string);
    get isCapturing(): boolean;
    start(): Promise<string | null>;
    stop(): void;
}
//# sourceMappingURL=tabCapture.d.ts.map