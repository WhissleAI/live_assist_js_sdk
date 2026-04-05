export class AsrStreamClient {
    constructor(asrUrl, cfg) {
        this.ws = null;
        this.state = "closed";
        this.endResolve = null;
        this.pendingEnd = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.intentionalClose = false;
        this.reconnecting = false;
        this.connectTimeout = null;
        this.pcmBuffer = [];
        this.pcmBufferBytes = 0;
        this.onTranscript = null;
        this.onError = null;
        this.asrUrl = asrUrl;
        this.cfg = cfg ?? {};
    }
    get connected() {
        return this.state === "open";
    }
    connect() {
        this.intentionalClose = false;
        return this._doConnect();
    }
    _doConnect() {
        return new Promise((resolve, reject) => {
            if (this.state === "open") {
                resolve();
                return;
            }
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
                    try {
                        ws.close();
                    }
                    catch { }
                    reject(new Error("ASR WebSocket connection timed out"));
                }
            }, 15000);
            ws.onopen = () => {
                if (this.connectTimeout) {
                    clearTimeout(this.connectTimeout);
                    this.connectTimeout = null;
                }
                if (settled || this.intentionalClose) {
                    try {
                        ws.close();
                    }
                    catch { }
                    if (!settled) {
                        settled = true;
                        resolve();
                    }
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
                if (typeof ev.data !== "string")
                    return;
                try {
                    const msg = JSON.parse(ev.data);
                    if (msg.type === "transcript") {
                        const seg = {
                            channel: msg.channel ?? "microphone",
                            text: msg.text ?? "",
                            audioOffset: msg.audioOffset ?? 0,
                            is_final: msg.is_final !== false,
                            metadata: msg.metadata,
                            metadata_probs: msg.metadata_probs,
                            metadata_probs_timeline: Array.isArray(msg.metadata_probs_timeline)
                                ? msg.metadata_probs_timeline
                                : undefined,
                            entities: msg.entities,
                            speakerChange: msg.speakerChange ?? false,
                            speakerEmbedding: Array.isArray(msg.speakerEmbedding) ? msg.speakerEmbedding : undefined,
                            utterance_end: msg.utterance_end ?? false,
                            words: Array.isArray(msg.words) ? msg.words : undefined,
                            pauses: Array.isArray(msg.pauses) ? msg.pauses : undefined,
                            speech_rate: msg.speech_rate,
                            iwi: Array.isArray(msg.iwi) ? msg.iwi : undefined,
                        };
                        if (seg.text)
                            console.log("[LiveAssist] ASR transcript:", seg.text, seg.is_final ? "(final)" : "(partial)");
                        if (this.state === "closing")
                            this.pendingEnd.push(seg);
                        this.onTranscript?.(seg);
                    }
                    else if (msg.type === "end") {
                        if (this.endResolve) {
                            this.endResolve(this.pendingEnd);
                            this.endResolve = null;
                            this.pendingEnd = [];
                        }
                        this.intentionalClose = true;
                        this._close();
                    }
                    else if (msg.type === "error") {
                        this.onError?.(new Error(msg.message ?? "ASR stream error"));
                    }
                }
                catch (e) {
                    console.warn("[LiveAssist] ASR message parse error:", e);
                }
            };
            ws.onerror = () => {
                if (this.connectTimeout) {
                    clearTimeout(this.connectTimeout);
                    this.connectTimeout = null;
                }
                const err = new Error("ASR WebSocket connection failed");
                if (!settled) {
                    settled = true;
                    reject(err);
                }
                this.onError?.(err);
                this.state = "closed";
            };
            ws.onclose = () => {
                if (this.connectTimeout) {
                    clearTimeout(this.connectTimeout);
                    this.connectTimeout = null;
                }
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
                        }
                        else {
                            this.reconnecting = false;
                        }
                    }, delay);
                }
            };
        });
    }
    _sendConfig() {
        if (this.state !== "open" || !this.ws)
            return;
        console.log("[LiveAssist] ASR config sent (stream ready)");
        this.ws.send(JSON.stringify({
            type: "config",
            language: this.cfg.language ?? "",
            use_lm: this.cfg.useLm !== false,
            sample_rate: this.cfg.sampleRate ?? 16000,
            metadata_prob: this.cfg.metadataProb !== false,
            speaker_embedding: this.cfg.speakerEmbedding === true,
            ...(this.cfg.ptt_mode ? { ptt_mode: true } : {}),
            ...(this.cfg.hotwords?.length ? {
                hotwords: this.cfg.hotwords,
                hotword_weight: this.cfg.hotwordWeight ?? 10.0,
            } : {}),
            ...(this.cfg.wordTimestamps ? { word_timestamps: true } : {}),
            ...(this.cfg.neuropsychMode ? { neuropsych_mode: this.cfg.neuropsychMode } : {}),
        }));
    }
    _flushBuffer() {
        if (this.state !== "open" || !this.ws || this.pcmBuffer.length === 0)
            return;
        for (const ab of this.pcmBuffer)
            this.ws.send(ab);
        this.pcmBuffer = [];
        this.pcmBufferBytes = 0;
    }
    reconfigure(patch) {
        Object.assign(this.cfg, patch);
        this._sendConfig();
    }
    sendPcm(pcm) {
        const ab = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength).slice().buffer;
        if (this.state === "connecting" || (this.state === "closed" && this.reconnecting)) {
            if (this.pcmBufferBytes + ab.byteLength <= AsrStreamClient.MAX_BUFFER_BYTES) {
                this.pcmBuffer.push(ab);
                this.pcmBufferBytes += ab.byteLength;
            }
            return;
        }
        if (this.state !== "open" || !this.ws)
            return;
        if (this.ws.bufferedAmount > AsrStreamClient.MAX_BUFFERED_AMOUNT)
            return;
        this.ws.send(ab);
    }
    setChannel(name) {
        if (this.state !== "open" || !this.ws)
            return;
        this.ws.send(JSON.stringify({ type: "channel", name }));
    }
    end() {
        return new Promise((resolve) => {
            if (this.state !== "open" || !this.ws) {
                resolve([]);
                return;
            }
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
            }, 10000);
        });
    }
    close() {
        this.intentionalClose = true;
        this.pcmBuffer = [];
        this.pcmBufferBytes = 0;
        this._close();
    }
    _close() {
        this.state = "closed";
        this.pcmBuffer = [];
        this.pcmBufferBytes = 0;
        try {
            this.ws?.close();
        }
        catch { }
        this.ws = null;
    }
}
AsrStreamClient.MAX_BUFFER_BYTES = 320000;
AsrStreamClient.MAX_BUFFERED_AMOUNT = 256000;
//# sourceMappingURL=asr.js.map