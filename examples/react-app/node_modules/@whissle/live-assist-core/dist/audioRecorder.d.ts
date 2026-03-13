/**
 * Records PCM from capture and produces a WAV Blob on stop.
 */
export declare class AudioRecorder {
    private chunks;
    private _sampleRate;
    set sampleRate(r: number);
    addPcm(pcm: Int16Array): void;
    getBlob(): Blob;
    private encodeWav;
    reset(): void;
}
//# sourceMappingURL=audioRecorder.d.ts.map