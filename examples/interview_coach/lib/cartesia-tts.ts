/**
 * Cartesia TTS WebSocket client — direct browser connection with emotion control.
 *
 * Architecture:
 *   Browser WS → Cartesia API → JSON {data: base64 pcm_f32le} → decode
 *   → AudioWorkletNode (ring buffer) → Compressor → Gain → Analyser → speakers
 *
 * The AudioWorklet approach guarantees click-free playback on the audio thread
 * (no main-thread jank). PCM chunks from Cartesia are posted to the worklet
 * via MessagePort and written into a ring buffer there.
 *
 * Falls back to ScriptProcessorNode if AudioWorklet is unavailable.
 *
 * Key advantages:
 *   1. Direct connection — eliminates proxy hop latency
 *   2. Emotion control — per-utterance Cartesia emotion tags
 *   3. Context-based cancellation — instant barge-in support
 */

const AudioCtx: typeof AudioContext =
  typeof AudioContext !== "undefined"
    ? AudioContext
    : ((typeof (window as unknown as Record<string, unknown>).webkitAudioContext !==
        "undefined"
        ? (window as unknown as Record<string, unknown>).webkitAudioContext
        : AudioContext) as typeof AudioContext);

export interface CartesiaTtsConfig {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  sampleRate?: number;
  language?: string;
}

export interface SpeakOptions {
  emotion?: string[];
  speed?: string;
  contextId?: string;
}

// ~24 seconds of audio at 22050 Hz — enough for a full multi-sentence response
const RING_SIZE = 524288;
const PROC_BUFFER = 4096;
const SILENCE_THRESHOLD_MS = 200;
const CARTESIA_WS_URL = "wss://api.cartesia.ai/tts/websocket";
const CARTESIA_VERSION = "2025-04-16";
const DEFAULT_MODEL = "sonic-3";
const DEFAULT_SAMPLE_RATE = 22050;

interface CartesiaResponse {
  status_code: number;
  done: boolean;
  context_id?: string;
  data?: string;
  step_time?: number;
  model_id?: string;
  error?: string;
}

// Valid Cartesia emotions (Sonic-3 generation_config.emotion)
const CARTESIA_VALID_EMOTIONS = new Set([
  "neutral", "happy", "excited", "enthusiastic", "elated", "euphoric",
  "triumphant", "amazed", "surprised", "flirtatious", "joking/comedic",
  "curious", "content", "peaceful", "serene", "calm", "grateful",
  "affectionate", "trust", "sympathetic", "anticipation", "mysterious",
  "angry", "mad", "outraged", "frustrated", "agitated", "threatened",
  "disgusted", "contempt", "envious", "sarcastic", "ironic",
  "sad", "dejected", "melancholic", "disappointed", "hurt", "guilty",
  "bored", "tired", "rejected", "nostalgic", "wistful", "apologetic",
  "hesitant", "insecure", "confused", "resigned", "anxious", "panicked",
  "alarmed", "scared", "proud", "confident", "distant", "skeptical",
  "contemplative", "determined",
]);

// Map gateway emotion tags to the closest valid Cartesia emotion
const EMOTION_ALIAS: Record<string, string> = {
  cheerful: "happy",
  friendly: "content",
  interested: "curious",
  annoyed: "frustrated",
  afraid: "scared",
  worried: "anxious",
  nervous: "anxious",
  serious: "determined",
  positivity: "content",
  negativity: "sad",
  anger: "angry",
  sadness: "sad",
  curiosity: "curious",
  surprise: "surprised",
};

const SPEED_MAP: Record<string, number> = {
  slowest: 0.6,
  slow: 0.8,
  normal: 1.0,
  fast: 1.3,
  fastest: 1.5,
};

function buildGenerationConfig(
  options?: SpeakOptions,
): Record<string, unknown> | null {
  let emotion: string | undefined;
  if (options?.emotion?.length) {
    for (const raw of options.emotion) {
      const lower = raw.toLowerCase();
      if (CARTESIA_VALID_EMOTIONS.has(lower)) {
        emotion = lower;
        break;
      }
      const alias = EMOTION_ALIAS[lower];
      if (alias && CARTESIA_VALID_EMOTIONS.has(alias)) {
        emotion = alias;
        break;
      }
    }
  }

  let speed: number | undefined;
  if (options?.speed) {
    const mapped = SPEED_MAP[options.speed.toLowerCase()];
    if (mapped && mapped !== 1.0) speed = mapped;
  }

  if (!emotion && !speed) return null;

  const cfg: Record<string, unknown> = {};
  if (emotion) cfg.emotion = emotion;
  if (speed) cfg.speed = speed;
  return cfg;
}

export class CartesiaTtsClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  /** Fallback for browsers without AudioWorklet support. */
  private processor: ScriptProcessorNode | null = null;
  private useWorklet = false;
  private config: CartesiaTtsConfig;
  private _connected = false;
  private _speaking = false;
  private _closed = false;
  private _reconnecting = false;
  private _muted = false;
  private sampleRate: number;
  private modelId: string;

  private ring = new Float32Array(RING_SIZE);
  private ringRead = 0;
  private ringWrite = 0;
  private lastSampleTime = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private wasPlaying = false;
  private speakCount = 0;

  private activeContexts = new Set<string>();
  private ctxCounter = 0;
  private pendingQueue: string[] = [];
  private recorderNode: AudioNode | null = null;
  private genQueue: string[] = [];
  private activeGens = 0;
  private maxConcurrentGens = 1;

  private pcmTapCallback: ((pcm: Int16Array) => void) | null = null;

  /** Running peak tracker for PCM normalization (exponential decay). */
  private runningPeak = 0.3;

  /** Target gain level after normalization — higher on mobile for louder output. */
  private readonly targetGain: number;

  onSpeakingChange: ((speaking: boolean) => void) | null = null;
  onError: ((err: Error) => void) | null = null;

  constructor(config: CartesiaTtsConfig) {
    this.config = config;
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.modelId = config.modelId ?? DEFAULT_MODEL;
    // Mobile browsers (Android/iOS) output Web Audio at lower hardware levels;
    // compensate with a higher software gain target.
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.targetGain = isMobile ? 4.5 : 3.5;
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

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  /**
   * Register a callback to receive TTS output PCM as Int16 at the native sample rate.
   * Used to feed a second ASR WebSocket for emotion analysis of the agent's voice.
   */
  setPcmTap(cb: ((pcm: Int16Array) => void) | null): void {
    this.pcmTapCallback = cb;
  }

  setRecorderDestination(node: AudioNode): void {
    this.recorderNode = node;
    if (this.gainNode) {
      this.gainNode.connect(node);
    }
  }

  // ─── Ring buffer ─────────────────────────────────────────────────

  private ringAvailable(): number {
    return (this.ringWrite - this.ringRead + RING_SIZE) % RING_SIZE;
  }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      // Let the browser pick its native sample rate — forcing 22050 causes volume
      // and quality issues on Android Chrome (native rate is typically 48000).
      // The resampling code in handleAudioChunk() handles the conversion.
      this.audioCtx = new AudioCtx();

      // Compressor acts as a gentle limiter to tame peaks BEFORE the gain stage.
      this.compressorNode = this.audioCtx.createDynamicsCompressor();
      this.compressorNode.threshold.value = -6;
      this.compressorNode.knee.value = 10;
      this.compressorNode.ratio.value = 4;
      this.compressorNode.attack.value = 0.002;
      this.compressorNode.release.value = 0.08;

      // Gain AFTER the compressor — provides the actual volume lift.
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.targetGain;

      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.7;

      // Try AudioWorklet first, fall back to ScriptProcessorNode
      let sourceNode: AudioNode;
      try {
        await this.audioCtx.audioWorklet.addModule("/tts-playback-processor.js");
        this.workletNode = new AudioWorkletNode(this.audioCtx, "tts-playback-processor", {
          outputChannelCount: [1],
        });
        this.workletNode.port.onmessage = (e) => this.handleWorkletMessage(e);
        this.useWorklet = true;
        sourceNode = this.workletNode;
      } catch {
        // AudioWorklet not supported or module failed to load — use ScriptProcessorNode
        this.processor = this.audioCtx.createScriptProcessor(PROC_BUFFER, 0, 1);
        this.processor.onaudioprocess = (e) => this.processAudio(e);
        this.useWorklet = false;
        sourceNode = this.processor;
      }

      // Audio graph: source → compressor (limiter) → gain (volume boost) → analyser → destination
      sourceNode.connect(this.compressorNode);
      this.compressorNode.connect(this.gainNode);
      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);
      if (this.recorderNode) {
        this.gainNode.connect(this.recorderNode);
      }
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private handleWorkletMessage(e: MessageEvent) {
    const { type } = e.data;
    if (type === "bufferEmpty") {
      this.scheduleSilenceCheck();
    } else if (type === "playing") {
      this.lastSampleTime = performance.now();
      this.setSpeaking(true);
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    } else if (type === "pcmTap" && this.pcmTapCallback) {
      const float32: Float32Array = e.data.samples;
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      try { this.pcmTapCallback(int16); } catch {}
    }
  }

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
      let s = this.ring[this.ringRead];
      // Soft-clip (tanh) to prevent harsh digital clipping after gain boost.
      // Values in [-1,1] pass nearly unchanged; values beyond get smoothly capped.
      if (s > 1 || s < -1) s = Math.tanh(s);
      output[i] = s;
      this.ringRead = (this.ringRead + 1) % RING_SIZE;
    }
    for (let i = toRead; i < output.length; i++) {
      output[i] = 0;
    }

    if (!this.wasPlaying) {
      const fadeLen = Math.min(FADE, toRead);
      for (let i = 0; i < fadeLen; i++) {
        output[i] *= i / fadeLen;
      }
    }
    if (toRead < output.length && toRead > 0) {
      const fadeLen = Math.min(FADE, toRead);
      for (let i = 0; i < fadeLen; i++) {
        output[toRead - 1 - i] *= i / fadeLen;
      }
    }

    this.wasPlaying = this.ringAvailable() > 0;
    this.lastSampleTime = performance.now();

    // Forward output PCM to tap (for second ASR analysis)
    if (this.pcmTapCallback && toRead > 0) {
      const int16 = new Int16Array(toRead);
      for (let i = 0; i < toRead; i++) {
        const s = Math.max(-1, Math.min(1, output[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      try { this.pcmTapCallback(int16); } catch {}
    }

    if (this.ringAvailable() === 0) {
      this.scheduleSilenceCheck();
    }
  }

  private scheduleSilenceCheck() {
    if (this.silenceTimer) return;
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (
        this.ringAvailable() === 0 &&
        performance.now() - this.lastSampleTime > SILENCE_THRESHOLD_MS
      ) {
        this.setSpeaking(false);
      }
    }, SILENCE_THRESHOLD_MS + 50);
  }

  private pushToRing(samples: Float32Array) {
    if (this.useWorklet && this.workletNode) {
      // Post audio data to the worklet's ring buffer on the audio thread
      this.workletNode.port.postMessage(
        { type: "audio", samples },
        [samples.buffer],
      );
      this.setSpeaking(true);
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      return;
    }

    // Fallback: main-thread ring buffer for ScriptProcessorNode
    const free = RING_SIZE - 1 - this.ringAvailable();
    if (samples.length > free) {
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

  // ─── WebSocket connection ────────────────────────────────────────

  private buildWsUrl(): string {
    const params = new URLSearchParams({
      api_key: this.config.apiKey,
      cartesia_version: CARTESIA_VERSION,
    });
    return `${CARTESIA_WS_URL}?${params}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._connected) {
        resolve();
        return;
      }

      if (!this.config.apiKey) {
        reject(new Error("Cartesia API key is required"));
        return;
      }
      if (!this.config.voiceId) {
        reject(new Error("Cartesia voice ID is required"));
        return;
      }

      if (this.ws) {
        try { this.ws.close(); } catch {}
        this.ws = null;
      }

      const url = this.buildWsUrl();
      const ws = new WebSocket(url);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error("Cartesia TTS connection timed out"));
        }
      }, 10_000);

      ws.onopen = async () => {
        clearTimeout(timeout);
        if (settled) return;
        settled = true;
        this.ws = ws;
        this._connected = true;
        this._reconnecting = false;
        this.reconnectDelay = 1000;

        await this.ensureAudioContext();
        this.drainPendingQueue();
        resolve();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        try {
          const msg = JSON.parse(ev.data) as CartesiaResponse;

          if (msg.status_code && msg.status_code >= 400) {
            this.onError?.(
              new Error(
                `Cartesia error ${msg.status_code}: ${msg.error || "unknown"}`,
              ),
            );
            if (msg.context_id && this.activeContexts.delete(msg.context_id)) {
              this.activeGens = Math.max(0, this.activeGens - 1);
            }
            this.drainGenQueue();
            return;
          }

          if (msg.data && msg.context_id && this.activeContexts.has(msg.context_id)) {
            this.handleAudioChunk(msg.data);
          }

          if (msg.done && msg.context_id) {
            if (this.activeContexts.delete(msg.context_id)) {
              this.activeGens = Math.max(0, this.activeGens - 1);
            }
            this.drainGenQueue();
          }
        } catch (e) {
          console.warn("[CartesiaTTS] message parse error:", e);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error("Cartesia TTS connection failed"));
        }
        this._connected = false;
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        this._connected = false;
        this.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error("Cartesia TTS connection closed"));
        }
        if (!this._closed) {
          this.tryReconnect();
        }
      };
    });
  }

  private reconnectDelay = 1000;

  private tryReconnect() {
    if (this._closed || this._reconnecting) return;
    this._reconnecting = true;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, 8000);
    console.log(`[CartesiaTTS] Reconnecting in ${delay}ms...`);
    setTimeout(() => {
      if (this._closed) return;
      this.connect().catch((err) => {
        console.warn("[CartesiaTTS] Reconnect failed:", err.message);
        this._reconnecting = false;
      });
    }, delay);
  }

  private drainPendingQueue() {
    while (this.pendingQueue.length > 0 && this.ws && this._connected) {
      const msg = this.pendingQueue.shift()!;
      this.ws.send(msg);
    }
  }

  // ─── Audio decode (pcm_f32le base64 → Float32Array) ──────────────

  private handleAudioChunk(base64Data: string) {
    if (!this.audioCtx || this._muted) return;

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }

    const binary = atob(base64Data);
    const len = binary.length;
    if (len < 4) return;

    const alignedLen = len & ~3;
    const bytes = new Uint8Array(alignedLen);
    for (let i = 0; i < alignedLen; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const float32 = new Float32Array(bytes.buffer);

    // ── PCM normalization ──────────────────────────────────────────
    // TTS output is often well below full-scale. Track the running peak
    // with exponential smoothing and apply gain to bring the signal up
    // to a target level (~0.85) before it hits the audio graph.
    // This ensures consistent volume regardless of Cartesia output level.
    const TARGET_PEAK = 0.85;
    const PEAK_ATTACK = 0.3;   // fast rise to catch loud chunks
    const PEAK_RELEASE = 0.005; // slow decay to avoid pumping
    const MAX_NORM_GAIN = 6;   // cap to prevent amplifying silence/noise

    let chunkPeak = 0;
    for (let i = 0; i < float32.length; i++) {
      const abs = Math.abs(float32[i]);
      if (abs > chunkPeak) chunkPeak = abs;
    }

    if (chunkPeak > 0.01) {
      // Update running peak: fast attack (louder chunks raise it quickly),
      // slow release (keeps volume stable during pauses between words).
      const alpha = chunkPeak > this.runningPeak ? PEAK_ATTACK : PEAK_RELEASE;
      this.runningPeak = this.runningPeak + alpha * (chunkPeak - this.runningPeak);
    }

    const normGain = Math.min(TARGET_PEAK / Math.max(this.runningPeak, 0.01), MAX_NORM_GAIN);
    if (normGain > 1.05 || normGain < 0.95) {
      for (let i = 0; i < float32.length; i++) {
        float32[i] *= normGain;
      }
    }

    // ── Resample to AudioContext rate ────────────────────────────────
    const ctxRate = this.audioCtx.sampleRate;
    let samples = float32;

    if (ctxRate !== this.sampleRate) {
      const ratio = ctxRate / this.sampleRate;
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

  // ─── Public API ──────────────────────────────────────────────────

  private setSpeaking(speaking: boolean) {
    if (this._speaking !== speaking) {
      this._speaking = speaking;
      this.onSpeakingChange?.(speaking);
    }
  }

  mute() {
    this._muted = true;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "mute" });
    }
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.15);
    }
    setTimeout(() => this.clear(), 160);
  }

  unmute() {
    this._muted = false;
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "unmute" });
    }
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(this.targetGain, this.audioCtx.currentTime + 0.1);
    }
  }

  speak(text: string, options?: SpeakOptions) {
    if (!text.trim()) return;

    if (this.speakCount > 0 && this.ringAvailable() > 0) {
      const padSamples = Math.round(this.sampleRate * 0.06);
      this.pushToRing(new Float32Array(padSamples));
    }
    this.speakCount++;

    const ctxId = `ctx-${Date.now()}-${++this.ctxCounter}`;
    this.activeContexts.add(ctxId);

    const voice: Record<string, unknown> = {
      mode: "id",
      id: this.config.voiceId,
    };

    const payload: Record<string, unknown> = {
      model_id: this.modelId,
      transcript: text,
      voice,
      output_format: {
        container: "raw",
        encoding: "pcm_f32le",
        sample_rate: this.sampleRate,
      },
      language: this.config.language ?? "en",
      context_id: ctxId,
      continue: false,
    };

    const genCfg = buildGenerationConfig(options);
    if (genCfg) {
      payload.generation_config = genCfg;
    }

    const msg = JSON.stringify(payload);
    this.genQueue.push(msg);
    this.drainGenQueue();
  }

  private drainGenQueue() {
    while (this.genQueue.length > 0 && this.activeGens < this.maxConcurrentGens) {
      const msg = this.genQueue.shift()!;
      this.activeGens++;
      if (this.ws && this._connected) {
        this.ws.send(msg);
      } else if (!this._closed) {
        this.pendingQueue.push(msg);
        this.tryReconnect();
      }
    }
  }

  flush() {
    // This method exists for API compatibility with the voice agent hook.
  }

  clear() {
    this.pendingQueue = [];
    this.genQueue = [];
    this.activeGens = 0;

    if (this.ws && this._connected) {
      for (const ctxId of this.activeContexts) {
        try {
          this.ws.send(JSON.stringify({ context_id: ctxId, cancel: true }));
        } catch {}
      }
    }
    this.activeContexts.clear();

    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "clear" });
    }
    this.ringRead = 0;
    this.ringWrite = 0;
    this.wasPlaying = false;
    this.speakCount = 0;
    this.runningPeak = 0.3;
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
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this._connected = false;
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
    this.gainNode = null;
    this.compressorNode = null;
    this.analyserNode = null;
    this.pcmTapCallback = null;
  }
}
