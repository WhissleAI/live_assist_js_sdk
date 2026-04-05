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

export interface RegulationStat {
  totalSessions: number;
  autoTriggered: number;
  manualTriggered: number;
  avgEffectiveness: number;
  bestTechnique: string | null;
}

export interface CrossSessionInsights {
  emotionTrends: EmotionTrend[];
  topicFrequencies: TopicFrequency[];
  regulationStats: RegulationStat;
  recentConcerns: Array<{ text: string; emotion: string; severity: string; date: string }>;
  totalSessionCount: number;
  totalMinutes: number;
  thisWeekEmotions: Record<string, number>;
  lastWeekEmotions: Record<string, number>;
}

export function computeInsights(sessions: StoredSession[]): CrossSessionInsights {
  const emotionTrends: EmotionTrend[] = sessions.map((s) => ({
    date: s.date,
    dominant: s.emotionSummary.dominant,
    avgConfidence: s.emotionSummary.avgConfidence,
  }));

  const topicMap: Record<string, number> = {};
  for (const s of sessions) {
    for (const t of s.topicsDiscussed) {
      const key = t.toLowerCase();
      topicMap[key] = (topicMap[key] ?? 0) + 1;
    }
    for (const seg of s.transcript) {
      if (seg.entities) {
        for (const ent of seg.entities) {
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

  let totalRegSessions = 0;
  let effectiveCount = 0;
  let totalRegEvents = 0;
  const techCounts: Record<string, { effective: number; total: number }> = {};

  for (const s of sessions) {
    if (s.regulationEvents.length > 0) totalRegSessions++;
    for (const ev of s.regulationEvents) {
      totalRegEvents++;
      if (!techCounts[ev.technique]) techCounts[ev.technique] = { effective: 0, total: 0 };
      techCounts[ev.technique].total++;
      if (ev.wasEffective) {
        effectiveCount++;
        techCounts[ev.technique].effective++;
      }
    }
  }

  let bestTechnique: string | null = null;
  let bestRate = 0;
  for (const [tech, stats] of Object.entries(techCounts)) {
    const rate = stats.total > 0 ? stats.effective / stats.total : 0;
    if (rate > bestRate) {
      bestRate = rate;
      bestTechnique = tech;
    }
  }

  const regulationStats: RegulationStat = {
    totalSessions: totalRegSessions,
    autoTriggered: totalRegEvents,
    manualTriggered: 0,
    avgEffectiveness: totalRegEvents > 0 ? effectiveCount / totalRegEvents : 0,
    bestTechnique,
  };

  const recentConcerns = sessions
    .flatMap((s) => s.flaggedConcerns.map((c) => ({ ...c, date: s.date })))
    .slice(-10);

  const totalMinutes = Math.round(sessions.reduce((sum, s) => sum + s.durationSec, 0) / 60);

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 86400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000);

  const thisWeekEmotions: Record<string, number> = {};
  const lastWeekEmotions: Record<string, number> = {};

  for (const s of sessions) {
    const d = new Date(s.date);
    const bucket = d >= oneWeekAgo ? thisWeekEmotions : d >= twoWeeksAgo ? lastWeekEmotions : null;
    if (bucket) {
      bucket[s.emotionSummary.dominant] = (bucket[s.emotionSummary.dominant] ?? 0) + 1;
    }
  }

  return {
    emotionTrends,
    topicFrequencies,
    regulationStats,
    recentConcerns,
    totalSessionCount: sessions.length,
    totalMinutes,
    thisWeekEmotions,
    lastWeekEmotions,
  };
}
