import type { StoredSession } from "./session-store";

export interface EmotionTrend {
  date: string;
  dominant: string;
  avgConfidence: number;
}

export interface TopicFrequency {
  topic: string;
  count: number;
}

export interface CrossSessionInsights {
  emotionTrends: EmotionTrend[];
  topicFrequencies: TopicFrequency[];
  recentConcerns: Array<{ text: string; emotion: string; severity: string; date: string }>;
  totalSessionCount: number;
  totalMinutes: number;
  thisWeekEmotions: Record<string, number>;
  lastWeekEmotions: Record<string, number>;
}

export function computeInsights(sessions: StoredSession[], agentId?: string): CrossSessionInsights {
  const filtered = agentId ? sessions.filter((s) => s.agentId === agentId) : sessions;

  const emotionTrends: EmotionTrend[] = filtered
    .filter((s) => s.emotionSummary)
    .map((s) => ({
      date: s.date,
      dominant: s.emotionSummary.dominant ?? "NEUTRAL",
      avgConfidence: s.emotionSummary.avgConfidence ?? 0,
    }));

  const topicMap: Record<string, number> = {};
  for (const s of filtered) {
    for (const t of s.topicsDiscussed ?? []) {
      if (!t) continue;
      const key = t.toLowerCase();
      topicMap[key] = (topicMap[key] ?? 0) + 1;
    }
    for (const seg of s.transcript ?? []) {
      if (seg.entities) {
        for (const ent of seg.entities) {
          if (!ent?.text) continue;
          const key = ent.text.toLowerCase();
          topicMap[key] = (topicMap[key] ?? 0) + 1;
        }
      }
    }
  }
  const topicFrequencies = Object.entries(topicMap)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const recentConcerns = filtered
    .flatMap((s) => (s.flaggedConcerns ?? []).map((c) => ({ ...c, date: s.date })))
    .slice(-10);

  const totalMinutes = Math.round(filtered.reduce((sum, s) => sum + s.durationSec, 0) / 60);

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 86400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000);

  const thisWeekEmotions: Record<string, number> = {};
  const lastWeekEmotions: Record<string, number> = {};

  for (const s of filtered) {
    if (!s.emotionSummary?.dominant) continue;
    const d = new Date(s.date);
    const bucket = d >= oneWeekAgo ? thisWeekEmotions : d >= twoWeeksAgo ? lastWeekEmotions : null;
    if (bucket) {
      bucket[s.emotionSummary.dominant] = (bucket[s.emotionSummary.dominant] ?? 0) + 1;
    }
  }

  return {
    emotionTrends,
    topicFrequencies,
    recentConcerns,
    totalSessionCount: filtered.length,
    totalMinutes,
    thisWeekEmotions,
    lastWeekEmotions,
  };
}
