export class MicCapture {
    constructor(mic, onPcm) {
        this.id = `mic_${Math.random().toString(36).slice(2)}_${Date.now()}`;
        this._capturing = false;
        this.mic = mic;
        this._onPcm = onPcm;
    }
    get isCapturing() { return this._capturing; }
    async start() {
        const err = await this.mic.addConsumer(this.id, this._onPcm);
        if (!err)
            this._capturing = true;
        return err;
    }
    stop() {
        this.mic.removeConsumer(this.id);
        this._capturing = false;
    }
}
//# sourceMappingURL=micCapture.js.map