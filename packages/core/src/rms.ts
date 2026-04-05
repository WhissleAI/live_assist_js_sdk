/**
 * Root-mean-square energy per fixed-width, non-overlapping window.
 * Used for replay “spectrogram” bar heights aligned with live-assist Next.js TranscriptPlayer.
 */
export function computeRmsWindows(
  channelData: Float32Array,
  sampleRate: number,
  windowSec: number,
): Float32Array {
  const windowSize = Math.max(1, Math.floor(sampleRate * windowSec));
  const n = Math.ceil(channelData.length / windowSize);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const start = i * windowSize;
    const end = Math.min(start + windowSize, channelData.length);
    const len = end - start;
    for (let j = start; j < end; j++) sum += channelData[j] * channelData[j];
    out[i] = Math.sqrt(sum / len);
  }
  return out;
}
