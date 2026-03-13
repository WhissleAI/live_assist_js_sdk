/**
 * Records PCM from capture and produces a WAV Blob on stop.
 */
const SAMPLE_RATE = 16000; // typical for ASR
export class AudioRecorder {
    constructor() {
        this.chunks = [];
        this._sampleRate = SAMPLE_RATE;
    }
    set sampleRate(r) {
        this._sampleRate = r;
    }
    addPcm(pcm) {
        this.chunks.push(new Int16Array(pcm));
    }
    getBlob() {
        const totalLen = this.chunks.reduce((s, c) => s + c.length, 0);
        const data = new Int16Array(totalLen);
        let offset = 0;
        for (const c of this.chunks) {
            data.set(c, offset);
            offset += c.length;
        }
        return this.encodeWav(data);
    }
    encodeWav(samples) {
        const numChannels = 1;
        const sampleRate = this._sampleRate;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = samples.length * 2;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
        const writeStr = (offset, str) => {
            for (let i = 0; i < str.length; i++)
                view.setUint8(offset + i, str.charCodeAt(i));
        };
        writeStr(0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        writeStr(8, "WAVE");
        writeStr(12, "fmt ");
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeStr(36, "data");
        view.setUint32(40, dataSize, true);
        for (let i = 0; i < samples.length; i++) {
            view.setInt16(44 + i * 2, samples[i], true);
        }
        return new Blob([buffer], { type: "audio/wav" });
    }
    reset() {
        this.chunks = [];
    }
}
//# sourceMappingURL=audioRecorder.js.map