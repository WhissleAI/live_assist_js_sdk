/**
 * AudioWorklet processor: converts float32 mono to int16 PCM and posts to main thread.
 * If processorOptions.sampleRate is provided and !== 16000, resamples to 16kHz for ASR
 * (fixes Firefox "different sample-rate" error when using stream's native rate).
 *
 * PCM output is buffered to ~100ms chunks (1600 samples at 16kHz) before posting,
 * reducing WebSocket frame overhead from ~375 frames/s to ~10 frames/s.
 */
const TARGET_SAMPLE_RATE = 16000;
const OUTPUT_BUFFER_SIZE = 1600; // 100ms at 16kHz — balances latency vs overhead

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.sampleRate = options.processorOptions?.sampleRate ?? TARGET_SAMPLE_RATE;
    this.resample = this.sampleRate !== TARGET_SAMPLE_RATE;
    this._buf = new Float32Array(0);
    this._ratio = this.sampleRate / TARGET_SAMPLE_RATE;
    this._srcOffset = 0;
    // Output accumulator: collects resampled int16 samples until we have a full chunk
    this._outBuf = new Int16Array(OUTPUT_BUFFER_SIZE);
    this._outLen = 0;

    // Allow main thread to request a flush (e.g. when PTT key is released)
    this.port.onmessage = (e) => {
      if (e.data === "flush") this._flushOutput();
    };
  }

  _emitInt16(samples) {
    let offset = 0;
    while (offset < samples.length) {
      const space = OUTPUT_BUFFER_SIZE - this._outLen;
      const take = Math.min(space, samples.length - offset);
      this._outBuf.set(samples.subarray(offset, offset + take), this._outLen);
      this._outLen += take;
      offset += take;

      if (this._outLen >= OUTPUT_BUFFER_SIZE) {
        const chunk = this._outBuf.slice(0, this._outLen);
        this.port.postMessage(chunk, [chunk.buffer]);
        this._outBuf = new Int16Array(OUTPUT_BUFFER_SIZE);
        this._outLen = 0;
      }
    }
  }

  _flushOutput() {
    if (this._outLen > 0) {
      const chunk = this._outBuf.slice(0, this._outLen);
      this.port.postMessage(chunk, [chunk.buffer]);
      this._outBuf = new Int16Array(OUTPUT_BUFFER_SIZE);
      this._outLen = 0;
    }
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    if (!this.resample) {
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this._emitInt16(pcm);
      return true;
    }

    const prevLen = this._buf.length;
    const combined = new Float32Array(prevLen + input.length);
    combined.set(this._buf);
    combined.set(input, prevLen);
    this._buf = combined;

    const ratio = this._ratio;
    const available = this._buf.length;
    const outLength = Math.floor((available - this._srcOffset) / ratio);
    if (outLength <= 0) return true;

    const pcm = new Int16Array(outLength);
    let srcPos = this._srcOffset;
    for (let j = 0; j < outLength; j++) {
      const i0 = Math.floor(srcPos);
      const frac = srcPos - i0;
      const i1 = Math.min(i0 + 1, available - 1);
      const s = this._buf[i0] * (1 - frac) + this._buf[i1] * frac;
      const clamped = Math.max(-1, Math.min(1, s));
      pcm[j] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      srcPos += ratio;
    }

    const consumed = Math.floor(srcPos);
    if (consumed >= available) {
      this._buf = new Float32Array(0);
      this._srcOffset = srcPos - consumed;
    } else {
      this._buf = this._buf.slice(consumed);
      this._srcOffset = srcPos - consumed;
    }

    this._emitInt16(pcm);
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
