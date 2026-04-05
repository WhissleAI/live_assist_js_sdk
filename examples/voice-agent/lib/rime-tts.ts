/**
 * Rime TTS WebSocket client — click-free streaming audio playback.
 *
 * Architecture:
 *   Rime WS → base64 PCM → decode → ring buffer → ScriptProcessor → Gain → Compressor → speakers
 *
 * The ring buffer + ScriptProcessor approach guarantees zero clicks because
 * there are NO AudioBuffer boundaries. A single continuous process() callback
 * pulls samples from the ring buffer at a steady rate. New PCM chunks from
 * Rime are simply appended to the write side of the ring buffer.
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
  wsBase: string;
  /** @deprecated Use wsBase instead */
  agentUrl?: string;
  speaker?: string;
  modelId?: string;
  sampleRate?: number;
  sessionToken?: string;
}

// ~6 seconds of audio at 22050 Hz — large enough to absorb network jitter
const RING_SIZE = 131072;
// ScriptProcessor buffer size — 4096 samples ≈ 185 ms at 22050 Hz
const PROC_BUFFER = 4096;
// After the ring buffer drains, wait this long before declaring "not speaking"
const SILENCE_THRESHOLD_MS = 200;

export class RimeTtsClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private config: RimeTtsConfig;
  private _connected = false;
  private _speaking = false;
  private _closed = false;
  private _reconnecting = false;
  private _muted = false;
  private rimeSampleRate: number;
  private pendingQueue: string[] = [];
  private recorderNode: AudioNode | null = null;

  // Ring buffer for continuous playback
  private ring = new Float32Array(RING_SIZE);
  private ringRead = 0;
  private ringWrite = 0;
  private lastSampleTime = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private wasPlaying = false;
  private speakCount = 0;

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
    if (this.compressorNode) {
      this.compressorNode.connect(node);
    }
  }

  private ringAvailable(): number {
    return (this.ringWrite - this.ringRead + RING_SIZE) % RING_SIZE;
  }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      this.audioCtx = new AudioCtx({ sampleRate: this.rimeSampleRate });

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 2.8;

      this.compressorNode = this.audioCtx.createDynamicsCompressor();
      this.compressorNode.threshold.value = -20;
      this.compressorNode.knee.value = 10;
      this.compressorNode.ratio.value = 6;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.1;

      this.processor = this.audioCtx.createScriptProcessor(PROC_BUFFER, 0, 1);
      this.processor.onaudioprocess = (e) => this.processAudio(e);

      this.processor.connect(this.gainNode);
      this.gainNode.connect(this.compressorNode);
      this.compressorNode.connect(this.audioCtx.destination);
      if (this.recorderNode) {
        this.compressorNode.connect(this.recorderNode);
      }
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /** Called at a steady rate by the audio thread — pulls from ring buffer. */
  private processAudio(e: AudioProcessingEvent) {
    const output = e.outputBuffer.getChannelData(0);
    const avail = this.ringAvailable();
    const FADE = 64;

    if (avail === 0 || this._muted) {
      for (let i = 0; i < output.length; i++) output[i] = 0;
      this.wasPlaying = false;
      return;
    }

    const toRead = Math.min(avail, output.length);
    for (let i = 0; i < toRead; i++) {
      output[i] = this.ring[this.ringRead];
      this.ringRead = (this.ringRead + 1) % RING_SIZE;
    }
    for (let i = toRead; i < output.length; i++) {
      output[i] = 0;
    }

    // Fade-in when audio resumes after silence
    if (!this.wasPlaying) {
      const fadeLen = Math.min(FADE, toRead);
      for (let i = 0; i < fadeLen; i++) {
        output[i] *= i / fadeLen;
      }
    }
    // Fade-out if buffer ran dry mid-frame
    if (toRead < output.length && toRead > 0) {
      const fadeLen = Math.min(FADE, toRead);
      for (let i = 0; i < fadeLen; i++) {
        output[toRead - 1 - i] *= i / fadeLen;
      }
    }

    this.wasPlaying = this.ringAvailable() > 0;
    this.lastSampleTime = performance.now();

    if (this.ringAvailable() === 0) {
      this.scheduleSilenceCheck();
    }
  }

  private scheduleSilenceCheck() {
    if (this.silenceTimer) return;
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (this.ringAvailable() === 0 && performance.now() - this.lastSampleTime > SILENCE_THRESHOLD_MS) {
        this.setSpeaking(false);
      }
    }, SILENCE_THRESHOLD_MS + 50);
  }

  private pushToRing(samples: Float32Array) {
    const free = RING_SIZE - 1 - this.ringAvailable();
    if (samples.length > free) {
      // Buffer overflow — skip oldest samples to make room
      const skip = samples.length - free;
      this.ringRead = (this.ringRead + skip) % RING_SIZE;
    }
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.ringWrite] = samples[i];
      this.ringWrite = (this.ringWrite + 1) % RING_SIZE;
    }
    this.setSpeaking(true);
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private buildWsUrl(): string {
    const params = new URLSearchParams({
      speaker: this.config.speaker ?? "luna",
      modelId: this.config.modelId ?? "arcana",
      audioFormat: "pcm",
      sampleRate: String(this.rimeSampleRate),
      segment: "never",
    });
    if (this.config.sessionToken) {
      params.set("session_token", this.config.sessionToken);
    }
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

  // ─── Audio chunk decode ────────────────────────────────────────────

  private handleAudioChunk(base64Data: string) {
    if (!this.audioCtx || this._muted) return;

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    const binary = atob(base64Data);
    const len = binary.length;
    if (len < 2) return;
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

    this.pushToRing(samples);
  }

  // ─── Public API ────────────────────────────────────────────────────

  private setSpeaking(speaking: boolean) {
    if (this._speaking !== speaking) {
      this._speaking = speaking;
      this.onSpeakingChange?.(speaking);
    }
  }

  mute() {
    this._muted = true;
    this.clear();
  }

  unmute() {
    this._muted = false;
  }

  speak(text: string, contextId?: string) {
    // Insert a silence gap between consecutive speak() calls so Rime's
    // independent audio segments don't cause a waveform pop at the boundary.
    if (this.speakCount > 0 && this.ringAvailable() > 0) {
      const padSamples = Math.round(this.rimeSampleRate * 0.06);
      this.pushToRing(new Float32Array(padSamples));
    }
    this.speakCount++;

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
    this.ringRead = 0;
    this.ringWrite = 0;
    this.wasPlaying = false;
    this.speakCount = 0;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.setSpeaking(false);
  }

  close() {
    this._closed = true;
    this.pendingQueue = [];
    this.clear();
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.ws) {
      try { this.ws.send(JSON.stringify({ operation: "eos" })); } catch {}
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this._connected = false;
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
    this.gainNode = null;
    this.compressorNode = null;
  }
}
