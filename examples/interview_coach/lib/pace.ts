export function computeWPM(
  segments: Array<{ text: string; audioOffset: number }>,
): number {
  if (segments.length === 0) return 0;

  const totalWords = segments.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0);
  if (totalWords === 0) return 0;

  // Single segment: not enough timing data for accurate WPM — estimate from
  // average speaking rate (~150 WPM) scaled by word count to avoid penalizing
  // short answers. Returns 0 only if truly no words.
  if (segments.length < 2) return totalWords < 3 ? 0 : 140;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const durationSec = (last.audioOffset - first.audioOffset) / 1000;
  if (durationSec < 1) return 0;

  return Math.round((totalWords / durationSec) * 60);
}
