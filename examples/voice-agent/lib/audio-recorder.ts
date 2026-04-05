/**
 * Session audio recorder — captures both user mic and agent TTS output.
 *
 * Mic recording uses MediaRecorder directly from the user's mic stream.
 * TTS recording taps the Cartesia TTS audio pipeline via a MediaStreamDestination
 * connected to the TTS output (compressor node).
 *
 * Both produce WebM/Opus blobs that can be stored in IndexedDB and uploaded to GCS.
 */

export interface RecordedAudio {
  micBlob: Blob | null;
  ttsBlob: Blob | null;
}

export class SessionAudioRecorder {
  private micRecorder: MediaRecorder | null = null;
  private ttsRecorder: MediaRecorder | null = null;
  private micChunks: Blob[] = [];
  private ttsChunks: Blob[] = [];
  private _recording = false;
  private ttsDestination: MediaStreamAudioDestinationNode | null = null;

  get recording() {
    return this._recording;
  }

  /**
   * Start recording the user's microphone.
   * Call this with the same stream used for ASR.
   */
  startMic(stream: MediaStream): void {
    if (this.micRecorder) return;
    try {
      this.micChunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: this.pickMimeType(),
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.micChunks.push(e.data);
      };
      recorder.start(1000);
      this.micRecorder = recorder;
      this._recording = true;
    } catch (e) {
      console.warn("[AudioRecorder] mic start failed:", e);
    }
  }

  /**
   * Create a MediaStreamDestination for TTS output recording.
   * Connect this node to the TTS audio output (e.g. compressor).
   * Returns the destination node so the caller can wire it up.
   */
  createTtsDestination(audioCtx: AudioContext): MediaStreamAudioDestinationNode | null {
    try {
      this.ttsChunks = [];
      const dest = audioCtx.createMediaStreamDestination();
      const recorder = new MediaRecorder(dest.stream, {
        mimeType: this.pickMimeType(),
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.ttsChunks.push(e.data);
      };
      recorder.start(1000);
      this.ttsRecorder = recorder;
      this.ttsDestination = dest;
      this._recording = true;
      return dest;
    } catch (e) {
      console.warn("[AudioRecorder] tts destination failed:", e);
      return null;
    }
  }

  getTtsDestination(): MediaStreamAudioDestinationNode | null {
    return this.ttsDestination;
  }

  /**
   * Stop all recording and return the blobs.
   */
  async stop(): Promise<RecordedAudio> {
    this._recording = false;

    const micBlob = await this.stopRecorder(this.micRecorder, this.micChunks);
    const ttsBlob = await this.stopRecorder(this.ttsRecorder, this.ttsChunks);

    this.micRecorder = null;
    this.ttsRecorder = null;
    this.micChunks = [];
    this.ttsChunks = [];
    this.ttsDestination = null;

    return { micBlob, ttsBlob };
  }

  private async stopRecorder(
    recorder: MediaRecorder | null,
    chunks: Blob[],
  ): Promise<Blob | null> {
    if (!recorder || recorder.state === "inactive") {
      return chunks.length > 0
        ? new Blob(chunks, { type: chunks[0].type })
        : null;
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        resolve(new Blob(chunks, { type: chunks[0].type }));
      };
      recorder.stop();
    });
  }

  private pickMimeType(): string {
    const preferred = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
    for (const mt of preferred) {
      if (MediaRecorder.isTypeSupported(mt)) return mt;
    }
    return "";
  }
}
