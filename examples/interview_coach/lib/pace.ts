export function computeWPM(
  segments: Array<{ text: string; audioOffset: number }>,
): number {
  if (segments.length < 2) return 0;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const durationSec = (last.audioOffset - first.audioOffset) / 1000;
  if (durationSec < 1) return 0;

  const totalWords = segments.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0);
  return Math.round((totalWords / durationSec) * 60);
}
