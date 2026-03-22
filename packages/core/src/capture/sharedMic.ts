const KEEP_ALIVE_MS = 5_000;

export class SharedMicManager {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private consumers = new Map<string, (pcm: Int16Array) => void>();
  private _starting = false;
  private _startPromise: Promise<string | null> | null = null;
  private _closeTimer: ReturnType<typeof setTimeout> | null = null;
  private workletUrl: string;

  constructor(workletUrl = "/audio-capture-processor.js") {
    this.workletUrl = workletUrl;
  }

  async addConsumer(id: string, onPcm: (pcm: Int16Array) => void): Promise<string | null> {
    if (this._closeTimer) { clearTimeout(this._closeTimer); this._closeTimer = null; }
    this.consumers.set(id, onPcm);
    if (this.stream) return null;
    if (this._starting && this._startPromise) {
      const err = await this._startPromise;
      if (err) this.consumers.delete(id);
      return err;
    }
    this._starting = true;
    this._startPromise = this._open();
    const err = await this._startPromise;
    this._starting = false;
    this._startPromise = null;
    if (err) this.consumers.delete(id);
    return err;
  }

  private async _open(): Promise<string | null> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        return "Microphone access requires a secure context (HTTPS or localhost)";
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings?.();
      const streamRate = (settings?.sampleRate ?? 48000) as number;
      const AudioCtx = typeof AudioContext !== "undefined"
        ? AudioContext
        : ((window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext | undefined) ?? AudioContext;
      const ctx = new AudioCtx({ sampleRate: streamRate });
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      await ctx.audioWorklet.addModule(this.workletUrl);
      const source = ctx.createMediaStreamSource(stream);
      const hpFilter = ctx.createBiquadFilter();
      hpFilter.type = "highpass";
      hpFilter.frequency.value = 85;
      hpFilter.Q.value = 0.7;
      const actualRate = ctx.sampleRate;
      const node = new AudioWorkletNode(ctx, "capture-processor", {
        numberOfInputs: 1, numberOfOutputs: 1,
        processorOptions: { sampleRate: actualRate },
      });
      node.port.onmessage = (e: MessageEvent<Int16Array>) => {
        this.consumers.forEach((cb) => {
          try { cb(e.data); } catch (err) { console.warn("[SharedMic] consumer error:", err); }
        });
      };
      source.connect(hpFilter);
      hpFilter.connect(node);
      node.connect(ctx.destination);
      this.stream = stream;
      this.context = ctx;
      this.sourceNode = source;
      this.filterNode = hpFilter;
      this.workletNode = node;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Microphone access failed";
    }
  }

  removeConsumer(id: string) {
    this.consumers.delete(id);
    if (this.consumers.size === 0) {
      if (this._closeTimer) clearTimeout(this._closeTimer);
      this._closeTimer = setTimeout(() => {
        this._closeTimer = null;
        if (this.consumers.size === 0) this._close();
      }, KEEP_ALIVE_MS);
    }
  }

  private _close() {
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.filterNode?.disconnect();
    this.filterNode = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const ctx = this.context;
    this.context = null;
    if (ctx && ctx.state !== "closed") {
      ctx.suspend().then(() => ctx.close()).catch(() => ctx.close().catch(() => {}));
    }
  }

  get isActive() { return this.consumers.size > 0 || this._starting; }

  getStream(): MediaStream | null { return this.stream; }

  flushWorklet() { this.workletNode?.port.postMessage("flush"); }

  destroy() { this._close(); }
}
