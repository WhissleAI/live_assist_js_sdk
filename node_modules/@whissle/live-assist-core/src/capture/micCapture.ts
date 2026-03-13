import { SharedMicManager } from "./sharedMic";

export class MicCapture {
  private id = `mic_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  private mic: SharedMicManager;
  private _capturing = false;
  private _onPcm: (pcm: Int16Array) => void;

  constructor(mic: SharedMicManager, onPcm: (pcm: Int16Array) => void) {
    this.mic = mic;
    this._onPcm = onPcm;
  }

  get isCapturing() { return this._capturing; }

  async start(): Promise<string | null> {
    const err = await this.mic.addConsumer(this.id, this._onPcm);
    if (!err) this._capturing = true;
    return err;
  }

  stop() {
    this.mic.removeConsumer(this.id);
    this._capturing = false;
  }
}
