import { SharedMicManager } from "./sharedMic";
export declare class MicCapture {
    private id;
    private mic;
    private _capturing;
    private _onPcm;
    constructor(mic: SharedMicManager, onPcm: (pcm: Int16Array) => void);
    get isCapturing(): boolean;
    start(): Promise<string | null>;
    stop(): void;
}
//# sourceMappingURL=micCapture.d.ts.map