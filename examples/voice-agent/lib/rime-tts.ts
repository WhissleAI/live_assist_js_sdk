/**
 * Rime TTS WebSocket client for /ws3 endpoint.
 * Streams text to Rime and plays back synthesized audio in real-time.
 *
 * Cross-browser notes:
 * - Safari requires AudioContext.resume() from a user gesture; we call
 *   ensureAudioContext() which resumes if suspended.
 * - Safari may ignore the requested sampleRate in the AudioContext constructor,
 *   so we resample PCM to the actual context.sampleRate when they differ.
 * - webkitAudioContext fallback for very old Safari.
 */

type RimeChunkEvent = { type: "chunk"; data: string; contextId: string | null };
type RimeTimestampsEvent = {
  type: "timestamps";
  word_timestamps: { words: string[]; start: number[]; end: number[] };
};
type RimeErrorEvent = { type: "error"; message: string };
type RimeEvent = RimeChunkEvent | RimeTimestampsEvent | RimeErrorEvent;

const AudioCtx: typeof AudioContext =
  typeof AudioContext !== "undefined"
    ? AudioContext
    : (typeof (window as unknown as Record<string, unknown>).webkitAudioContext !== "undefined"
        ? ((window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)
        : AudioContext);

export interface RimeTtsConfig {
  agentUrl: string;
  speaker?: string;
  modelId?: string;
  sampleRate?: number;
}

export class RimeTtsClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private config: RimeTtsConfig;
  private _connected = false;
  private _speaking = false;
  private rimeSampleRate: number;

  onSpeakingChange: ((speaking: boolean) => void) | null = null;
  onError: ((err: Error) => void) | null = null;
  onTimestamps: ((ts: RimeTimestampsEvent["word_timestamps"]) => void) | null = null;

  constructor(config: RimeTtsConfig) {
    this.config = config;
    this.rimeSampleRate = config.sampleRate ?? 22050;
  }

  get connected() {
    return this._connected;
  }

  get isSpeaking() {
    return this._speaking;
  }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      this.audioCtx = new AudioCtx({ sampleRate: this.rimeSampleRate });
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._connected) {
        resolve();
        return;
      }

      const params = new URLSearchParams({
        speaker: this.config.speaker ?? "cove",
        modelId: this.config.modelId ?? "mist",
        audioFormat: "pcm",
        sampleRate: String(this.rimeSampleRate),
        segment: "never",
      });

      const base = this.config.agentUrl.replace(/\/+$/, "").replace(/^http/, "ws");
      const url = `${base}/tts/ws3?${params}`;
      const ws = new WebSocket(url);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error("Rime TTS connection timed out"));
        }
      }, 10_000);

      ws.onopen = async () => {
        clearTimeout(timeout);
        if (settled) return;
        settled = true;
        this.ws = ws;
        this._connected = true;

        await this.ensureAudioContext();
        this.nextPlayTime = 0;
        resolve();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        try {
          const msg = JSON.parse(ev.data) as RimeEvent;
          if (msg.type === "chunk") {
            this.handleAudioChunk(msg.data);
          } else if (msg.type === "timestamps") {
            this.onTimestamps?.(msg.word_timestamps);
          } else if (msg.type === "error") {
            this.onError?.(new Error(`Rime TTS: ${msg.message}`));
          }
        } catch (e) {
          console.warn("[RimeTTS] message parse error:", e);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error("Rime TTS connection failed"));
        }
        this._connected = false;
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        this._connected = false;
        this.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error("Rime TTS connection closed"));
        }
      };
    });
  }

  private handleAudioChunk(base64Data: string) {
    if (!this.audioCtx) return;

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const ctxRate = this.audioCtx.sampleRate;
    let samples = float32;

    if (ctxRate !== this.rimeSampleRate) {
      const ratio = ctxRate / this.rimeSampleRate;
      const outLen = Math.ceil(float32.length * ratio);
      const resampled = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const srcPos = i / ratio;
        const i0 = Math.floor(srcPos);
        const frac = srcPos - i0;
        const i1 = Math.min(i0 + 1, float32.length - 1);
        resampled[i] = float32[i0] * (1 - frac) + float32[i1] * frac;
      }
      samples = resampled;
    }

    const buffer = this.audioCtx.createBuffer(1, samples.length, ctxRate);
    buffer.getChannelData(0).set(samples);

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);

    const now = this.audioCtx.currentTime;
    const startTime = Math.max(now + 0.01, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;

    this.activeSources.push(source);
    this.setSpeaking(true);

    source.onended = () => {
      this.activeSources = this.activeSources.filter((s) => s !== source);
      if (this.activeSources.length === 0) {
        this.setSpeaking(false);
      }
    };
  }

  private setSpeaking(speaking: boolean) {
    if (this._speaking !== speaking) {
      this._speaking = speaking;
      this.onSpeakingChange?.(speaking);
    }
  }

  speak(text: string, contextId?: string) {
    if (!this.ws || !this._connected) return;
    const msg: Record<string, string> = { text };
    if (contextId) msg.contextId = contextId;
    this.ws.send(JSON.stringify(msg));
  }

  flush() {
    if (!this.ws || !this._connected) return;
    this.ws.send(JSON.stringify({ operation: "flush" }));
  }

  clear() {
    if (this.ws && this._connected) {
      this.ws.send(JSON.stringify({ operation: "clear" }));
    }
    for (const source of this.activeSources) {
      try { source.stop(); } catch {}
    }
    this.activeSources = [];
    this.nextPlayTime = 0;
    this.setSpeaking(false);
  }

  close() {
    this.clear();
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ operation: "eos" }));
      } catch {}
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this._connected = false;
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
  }
}
