/**
 * AudioWorklet processor for TTS playback.
 *
 * Replaces the deprecated ScriptProcessorNode.
 * Receives PCM Float32 chunks via postMessage and writes them to output.
 * Implements a ring buffer for click-free continuous playback.
 */

const RING_SIZE = 524288; // ~24 seconds at 22050 Hz
const FADE_LEN = 64;

class TtsPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._ring = new Float32Array(RING_SIZE);
    this._ringRead = 0;
    this._ringWrite = 0;
    this._wasPlaying = false;
    this._muted = false;
    this._lastSampleFrame = 0;

    this.port.onmessage = (e) => {
      const { type } = e.data;
      if (type === "audio") {
        this._pushToRing(e.data.samples);
      } else if (type === "clear") {
        this._ringRead = 0;
        this._ringWrite = 0;
        this._wasPlaying = false;
      } else if (type === "mute") {
        this._muted = true;
      } else if (type === "unmute") {
        this._muted = false;
      }
    };
  }

  _ringAvailable() {
    return (this._ringWrite - this._ringRead + RING_SIZE) % RING_SIZE;
  }

  _pushToRing(samples) {
    const free = RING_SIZE - 1 - this._ringAvailable();
    if (samples.length > free) {
      // Drop oldest samples if buffer overflows
      const skip = samples.length - free;
      this._ringRead = (this._ringRead + skip) % RING_SIZE;
    }
    for (let i = 0; i < samples.length; i++) {
      this._ring[this._ringWrite] = samples[i];
      this._ringWrite = (this._ringWrite + 1) % RING_SIZE;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channel = output[0];
    const avail = this._ringAvailable();

    if (avail === 0 || this._muted) {
      for (let i = 0; i < channel.length; i++) channel[i] = 0;
      if (this._wasPlaying) {
        this._wasPlaying = false;
        this.port.postMessage({ type: "bufferEmpty" });
      }
      return true;
    }

    const toRead = Math.min(avail, channel.length);
    for (let i = 0; i < toRead; i++) {
      let s = this._ring[this._ringRead];
      // Soft-clip to prevent harsh digital clipping
      if (s > 1 || s < -1) s = Math.tanh(s);
      channel[i] = s;
      this._ringRead = (this._ringRead + 1) % RING_SIZE;
    }
    for (let i = toRead; i < channel.length; i++) {
      channel[i] = 0;
    }

    // Fade-in at playback start
    if (!this._wasPlaying) {
      const fadeLen = Math.min(FADE_LEN, toRead);
      for (let i = 0; i < fadeLen; i++) {
        channel[i] *= i / fadeLen;
      }
    }

    // Fade-out at buffer end
    if (toRead < channel.length && toRead > 0) {
      const fadeLen = Math.min(FADE_LEN, toRead);
      for (let i = 0; i < fadeLen; i++) {
        channel[toRead - 1 - i] *= i / fadeLen;
      }
    }

    this._wasPlaying = this._ringAvailable() > 0;
    this._lastSampleFrame = currentFrame;

    // Report buffer state for speaking detection
    const remaining = this._ringAvailable();
    if (remaining === 0) {
      this.port.postMessage({ type: "bufferEmpty" });
    } else {
      this.port.postMessage({ type: "playing", available: remaining });
    }

    // Send PCM tap data back to main thread for TTS emotion analysis
    if (toRead > 0) {
      // Copy the output for the tap (can't transfer channel data directly)
      const tapData = new Float32Array(toRead);
      for (let i = 0; i < toRead; i++) tapData[i] = channel[i];
      this.port.postMessage({ type: "pcmTap", samples: tapData }, [tapData.buffer]);
    }

    return true;
  }
}

registerProcessor("tts-playback-processor", TtsPlaybackProcessor);
