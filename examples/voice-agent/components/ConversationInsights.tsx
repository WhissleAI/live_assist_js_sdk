import React, { useMemo } from "react";
import type { TranscriptSegment, Moment } from "../App";
import type { StoredSession } from "../lib/session-store";

interface Props {
  transcript: TranscriptSegment[];
  moments: Moment[];
  storedSessions?: StoredSession[];
}

interface Insight {
  id: string;
  text: string;
  reason: string;
  icon: string;
  priority: number;
}

export default function ConversationInsights({ transcript, moments, storedSessions }: Props) {
  const insights = useMemo((): Insight[] => {
    const result: Insight[] = [];
    const seen = new Set<string>();

    const concerns = moments.filter((m) => m.type === "concern");
    for (const c of concerns.slice(-2)) {
      const key = `concern_${c.text.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: c.id,
        text: `Flagged for review: "${c.text.slice(0, 80)}"`,
        reason: `Severity: ${(c as Moment & { severity?: string }).severity ?? "notable"}`,
        icon: "⚠️",
        priority: 0,
      });
    }

    const questions = moments.filter((m) => m.type === "question" && m.speaker === "user");
    for (const q of questions.slice(-3)) {
      const key = `q_${q.text.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: q.id,
        text: `User asked: "${q.text}"`,
        reason: "Question detected in conversation",
        icon: "🤔",
        priority: 1,
      });
    }

    const emotionalPeaks = moments.filter((m) => m.type === "emotion_peak" && m.speaker === "user");
    for (const ep of emotionalPeaks.slice(-3)) {
      const key = `ep_${ep.emotion}_${ep.text.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const suggestions: Record<string, string> = {
        HAPPY: `Positive reaction: "${ep.text.slice(0, 60)}"`,
        SAD: `User seemed upset: "${ep.text.slice(0, 60)}"`,
        ANGRY: `Frustration detected: "${ep.text.slice(0, 60)}"`,
        FEAR: `User sounded concerned: "${ep.text.slice(0, 60)}"`,
        SURPRISE: `Surprised reaction: "${ep.text.slice(0, 60)}"`,
      };
      const suggestion = suggestions[ep.emotion] ?? `Strong reaction: "${ep.text.slice(0, 60)}"`;
      const icons: Record<string, string> = { HAPPY: "😊", SAD: "💙", ANGRY: "🔥", FEAR: "💜", SURPRISE: "✨" };

      result.push({
        id: ep.id,
        text: suggestion,
        reason: `${ep.emotion.charAt(0) + ep.emotion.slice(1).toLowerCase()} moment detected`,
        icon: icons[ep.emotion] ?? "💡",
        priority: 2,
      });
    }

    if (storedSessions && storedSessions.length > 0) {
      const topicCounts: Record<string, number> = {};
      for (const s of storedSessions) {
        for (const t of s.topicsDiscussed ?? []) {
          if (!t) continue;
          const k = t.toLowerCase();
          topicCounts[k] = (topicCounts[k] ?? 0) + 1;
        }
        for (const seg of s.transcript ?? []) {
          if (seg.entities) {
            for (const ent of seg.entities) {
              if (!ent?.text) continue;
              const k = ent.text.toLowerCase();
              topicCounts[k] = (topicCounts[k] ?? 0) + 1;
            }
          }
        }
      }

      const topTopics = Object.entries(topicCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      for (const [topic, count] of topTopics) {
        const key = `cross_${topic}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          id: key,
          text: `"${topic}" mentioned across ${count} sessions`,
          reason: "Recurring topic",
          icon: "⭐",
          priority: 3,
        });
      }
    }

    const entities = new Set<string>();
    for (const seg of transcript) {
      if (seg.entities) {
        for (const ent of seg.entities) {
          if (ent?.text) entities.add(ent.text);
        }
      }
    }
    if (entities.size > 0) {
      const topics = Array.from(entities).slice(0, 5);
      const key = `topics_${topics.join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          id: `topics_${Date.now()}`,
          text: `Topics in this session: ${topics.join(", ")}`,
          reason: "Key topics from conversation",
          icon: "🏷️",
          priority: 4,
        });
      }
    }

    result.sort((a, b) => a.priority - b.priority);
    return result.slice(0, 8);
  }, [transcript, moments, storedSessions]);

  if (insights.length === 0) {
    return (
      <div className="starters-empty">
        <p>Conversation insights will appear as users interact with the agent.</p>
      </div>
    );
  }

  return (
    <div className="starters-list">
      {insights.map((s) => (
        <div key={s.id} className="starter-card">
          <span className="starter-icon">{s.icon}</span>
          <div className="starter-content">
            <div className="starter-text">{s.text}</div>
            <div className="starter-reason">{s.reason}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
