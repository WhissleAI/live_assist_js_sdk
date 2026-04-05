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
  /** WebSocket base URL for TTS, e.g. "wss://api.whissle.ai/agent/tts" */
  wsBase: string;
  /** @deprecated Use wsBase instead */
  agentUrl?: string;
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
  private _closed = false;
  private _reconnecting = false;
  private _muted = false;
  private rimeSampleRate: number;
  private pendingQueue: string[] = [];
  private recorderNode: AudioNode | null = null;

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

  getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  setRecorderDestination(node: AudioNode): void {
    this.recorderNode = node;
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

  private buildWsUrl(): string {
    const params = new URLSearchParams({
      speaker: this.config.speaker ?? "cove",
      modelId: this.config.modelId ?? "mist",
      audioFormat: "pcm",
      sampleRate: String(this.rimeSampleRate),
      segment: "never",
    });
    const base = (this.config.wsBase || this.config.agentUrl || "")
      .replace(/\/+$/, "")
      .replace(/^http/, "ws");
    return `${base}/ws3?${params}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._connected) {
        resolve();
        return;
      }

      const url = this.buildWsUrl();
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
        this._reconnecting = false;

        await this.ensureAudioContext();
        this.nextPlayTime = 0;

        this.drainPendingQueue();
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
        if (!this._closed) {
          this.tryReconnect();
        }
      };
    });
  }

  private tryReconnect() {
    if (this._closed || this._reconnecting) return;
    this._reconnecting = true;
    console.log("[RimeTTS] Connection lost, reconnecting in 1s...");
    setTimeout(() => {
      if (this._closed) return;
      this.connect().catch((err) => {
        console.warn("[RimeTTS] Reconnect failed:", err.message);
        this._reconnecting = false;
      });
    }, 1000);
  }

  private drainPendingQueue() {
    while (this.pendingQueue.length > 0 && this.ws && this._connected) {
      const msg = this.pendingQueue.shift()!;
      this.ws.send(msg);
    }
  }

  mute() {
    this._muted = true;
    this.clear();
  }

  unmute() {
    this._muted = false;
    this.nextPlayTime = 0;
  }

  private handleAudioChunk(base64Data: string) {
    if (!this.audioCtx || this._muted) return;

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    const binary = atob(base64Data);
    const len = binary.length;
    if (len < 2) return;
    // Int16Array requires even byte length — truncate trailing odd byte
    const evenLen = len & ~1;
    const bytes = new Uint8Array(evenLen);
    for (let i = 0; i < evenLen; i++) {
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
    if (this.recorderNode) {
      source.connect(this.recorderNode);
    }

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
    const msg: Record<string, string> = { text };
    if (contextId) msg.contextId = contextId;
    const payload = JSON.stringify(msg);

    if (this.ws && this._connected) {
      this.ws.send(payload);
    } else if (!this._closed) {
      this.pendingQueue.push(payload);
      this.tryReconnect();
    }
  }

  flush() {
    const payload = JSON.stringify({ operation: "flush" });
    if (this.ws && this._connected) {
      this.ws.send(payload);
    } else if (!this._closed) {
      this.pendingQueue.push(payload);
    }
  }

  clear() {
    this.pendingQueue = [];
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
    this._closed = true;
    this.pendingQueue = [];
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
