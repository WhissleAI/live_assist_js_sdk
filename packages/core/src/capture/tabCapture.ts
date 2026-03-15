const SAMPLE_RATE = 16000;

export class TabCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private _capturing = false;
  private _onPcm: (pcm: Int16Array) => void;
  private _onStopped: (() => void) | null = null;
  private workletUrl: string;

  constructor(onPcm: (pcm: Int16Array) => void, workletUrl = "/audio-capture-processor.js") {
    this._onPcm = onPcm;
    this.workletUrl = workletUrl;
  }

  get isCapturing() { return this._capturing; }

  set onStopped(cb: (() => void) | null) { this._onStopped = cb; }

  async start(): Promise<string | null> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      return "Tab/screen capture is not supported on this device";
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return "cancelled";
      return e instanceof Error ? e.message : "Tab capture failed";
    }
    this.stream = stream;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      return "No audio in selected tab";
    }

    audioTrack.onended = () => {
      console.warn("[TabCapture] Track ended (user stopped sharing)");
      this.stop();
      this._onStopped?.();
    };

    try {
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.context = ctx;
      await ctx.audioWorklet.addModule(this.workletUrl);
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "capture-processor", { numberOfInputs: 1, numberOfOutputs: 1 });
      node.port.onmessage = (e: MessageEvent<Int16Array>) => this._onPcm(e.data);
      source.connect(node);
      node.connect(ctx.destination);
      this.node = node;
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      try { this.context?.close(); } catch {}
      this.context = null;
      return e instanceof Error ? e.message : "Audio setup failed";
    }
    this._capturing = true;
    return null;
  }

  stop() {
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks()?.forEach((t) => t.stop());
    this.stream = null;
    try { this.context?.close(); } catch {}
    this.context = null;
    this._capturing = false;
  }
}
