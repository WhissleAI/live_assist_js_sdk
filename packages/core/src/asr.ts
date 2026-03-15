import type { StreamTranscriptSegment, AsrStreamConfig } from "./types";

type AsrStreamState = "connecting" | "open" | "closing" | "closed";

export class AsrStreamClient {
  private ws: WebSocket | null = null;
  private state: AsrStreamState = "closed";
  private cfg: AsrStreamConfig;
  private asrUrl: string;
  private endResolve: ((segments: StreamTranscriptSegment[]) => void) | null = null;
  private pendingEnd: StreamTranscriptSegment[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private intentionalClose = false;
  private reconnecting = false;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pcmBuffer: ArrayBuffer[] = [];
  private pcmBufferBytes = 0;
  private static readonly MAX_BUFFER_BYTES = 320_000;
  private static readonly MAX_BUFFERED_AMOUNT = 256_000;

  onTranscript: ((seg: StreamTranscriptSegment) => void) | null = null;
  onError: ((err: Error) => void) | null = null;

  constructor(asrUrl: string, cfg?: AsrStreamConfig) {
    this.asrUrl = asrUrl;
    this.cfg = cfg ?? {};
  }

  get connected(): boolean {
    return this.state === "open";
  }

  connect(): Promise<void> {
    this.intentionalClose = false;
    return this._doConnect();
  }

  private _doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === "open") { resolve(); return; }

      let url = this.asrUrl;
      if (this.cfg.token) {
        const sep = url.includes("?") ? "&" : "?";
        url += `${sep}token=${encodeURIComponent(this.cfg.token)}`;
      }

      this.state = "connecting";
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      let settled = false;

      this.connectTimeout = setTimeout(() => {
        if (!settled && this.state === "connecting") {
          settled = true;
          this.state = "closed";
          try { ws.close(); } catch {}
          reject(new Error("ASR WebSocket connection timed out"));
        }
      }, 15_000);

      ws.onopen = () => {
        if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
        if (settled || this.intentionalClose) {
          try { ws.close(); } catch {}
          if (!settled) { settled = true; resolve(); }
          return;
        }
        settled = true;
        this.state = "open";
        this.ws = ws;
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        console.log("[LiveAssist] ASR stream connected:", this.asrUrl);
        this._sendConfig();
        this._flushBuffer();
        resolve();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        try {
          const msg = JSON.parse(ev.data) as Record<string, unknown>;
          if (msg.type === "transcript") {
            const seg: StreamTranscriptSegment = {
              channel: (msg.channel as string) ?? "microphone",
              text: (msg.text as string) ?? "",
              audioOffset: (msg.audioOffset as number) ?? 0,
              is_final: msg.is_final !== false,
              metadata: msg.metadata as StreamTranscriptSegment["metadata"],
              metadata_probs: msg.metadata_probs as StreamTranscriptSegment["metadata_probs"],
              metadata_probs_timeline: Array.isArray(msg.metadata_probs_timeline)
                ? msg.metadata_probs_timeline as StreamTranscriptSegment["metadata_probs_timeline"]
                : undefined,
              entities: msg.entities as StreamTranscriptSegment["entities"],
              speakerChange: (msg.speakerChange as boolean) ?? false,
              speakerEmbedding: Array.isArray(msg.speakerEmbedding) ? msg.speakerEmbedding as number[] : undefined,
              utterance_end: (msg.utterance_end as boolean) ?? false,
            };
            if (seg.text) console.log("[LiveAssist] ASR transcript:", seg.text, seg.is_final ? "(final)" : "(partial)");
            if (this.state === "closing") this.pendingEnd.push(seg);
            this.onTranscript?.(seg);
          } else if (msg.type === "end") {
            if (this.endResolve) {
              this.endResolve(this.pendingEnd);
              this.endResolve = null;
              this.pendingEnd = [];
            }
            this.intentionalClose = true;
            this._close();
          } else if (msg.type === "error") {
            this.onError?.(new Error((msg.message as string) ?? "ASR stream error"));
          }
        } catch (e) {
          console.warn("[LiveAssist] ASR message parse error:", e);
        }
      };

      ws.onerror = () => {
        if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
        const err = new Error("ASR WebSocket connection failed");
        if (!settled) { settled = true; reject(err); }
        this.onError?.(err);
        this.state = "closed";
      };

      ws.onclose = () => {
        if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
        if (this.endResolve) {
          this.endResolve(this.pendingEnd);
          this.endResolve = null;
          this.pendingEnd = [];
        }
        const wasOpen = this.state === "open";
        this.state = "closed";
        this.ws = null;

        if (wasOpen && !this.intentionalClose && !this.reconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnecting = true;
          this.reconnectAttempts++;
          const delay = Math.min(1000 * this.reconnectAttempts, 4000);
          setTimeout(() => {
            if (this.state === "closed" && !this.intentionalClose) {
              this._doConnect().catch((e) => this.onError?.(e)).finally(() => { this.reconnecting = false; });
            } else {
              this.reconnecting = false;
            }
          }, delay);
        }
      };
    });
  }

  private _sendConfig(): void {
    if (this.state !== "open" || !this.ws) return;
    console.log("[LiveAssist] ASR config sent (stream ready)");
    this.ws.send(JSON.stringify({
      type: "config",
      language: this.cfg.language ?? "",
      use_lm: this.cfg.useLm !== false,
      sample_rate: this.cfg.sampleRate ?? 16000,
      metadata_prob: this.cfg.metadataProb !== false,
      speaker_embedding: this.cfg.speakerEmbedding === true,
      ...(this.cfg.ptt_mode ? { ptt_mode: true } : {}),
    }));
  }

  private _flushBuffer(): void {
    if (this.state !== "open" || !this.ws || this.pcmBuffer.length === 0) return;
    for (const ab of this.pcmBuffer) this.ws.send(ab);
    this.pcmBuffer = [];
    this.pcmBufferBytes = 0;
  }

  reconfigure(patch: Partial<AsrStreamConfig>): void {
    Object.assign(this.cfg, patch);
    this._sendConfig();
  }

  sendPcm(pcm: Int16Array): void {
    const ab = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength).slice().buffer;
    if (this.state === "connecting" || (this.state === "closed" && this.reconnecting)) {
      if (this.pcmBufferBytes + ab.byteLength <= AsrStreamClient.MAX_BUFFER_BYTES) {
        this.pcmBuffer.push(ab);
        this.pcmBufferBytes += ab.byteLength;
      }
      return;
    }
    if (this.state !== "open" || !this.ws) return;
    if (this.ws.bufferedAmount > AsrStreamClient.MAX_BUFFERED_AMOUNT) return;
    this.ws.send(ab);
  }

  setChannel(name: "microphone" | "system"): void {
    if (this.state !== "open" || !this.ws) return;
    this.ws.send(JSON.stringify({ type: "channel", name }));
  }

  end(): Promise<StreamTranscriptSegment[]> {
    return new Promise((resolve) => {
      if (this.state !== "open" || !this.ws) { resolve([]); return; }
      this.state = "closing";
      this.intentionalClose = true;
      this.pendingEnd = [];
      this.pcmBuffer = [];
      this.pcmBufferBytes = 0;
      this.endResolve = resolve;
      this.ws.send(JSON.stringify({ type: "end" }));
      setTimeout(() => {
        if (this.endResolve) {
          this.endResolve(this.pendingEnd);
          this.endResolve = null;
          this.pendingEnd = [];
          this._close();
        }
      }, 10_000);
    });
  }

  close(): void {
    this.intentionalClose = true;
    this.pcmBuffer = [];
    this.pcmBufferBytes = 0;
    this._close();
  }

  private _close(): void {
    this.state = "closed";
    this.pcmBuffer = [];
    this.pcmBufferBytes = 0;
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}
