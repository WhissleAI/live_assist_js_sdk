import React, { useMemo } from "react";
import type { TranscriptSegment, Moment } from "../App";
import type { StoredSession } from "../lib/session-store";

interface Props {
  transcript: TranscriptSegment[];
  moments: Moment[];
  storedSessions?: StoredSession[];
}

interface Starter {
  id: string;
  text: string;
  reason: string;
  icon: string;
  priority: number;
}

export default function ConversationStarters({ transcript, moments, storedSessions }: Props) {
  const starters = useMemo((): Starter[] => {
    const result: Starter[] = [];
    const seen = new Set<string>();

    const concerns = moments.filter((m) => m.type === "concern");
    for (const c of concerns.slice(-2)) {
      const key = `concern_${c.text.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: c.id,
        text: `Your child mentioned something that may need attention: "${c.text.slice(0, 80)}"`,
        reason: `Flagged as ${(c as Moment & { severity?: string }).severity ?? "notable"}`,
        icon: "⚠️",
        priority: 0,
      });
    }

    const questions = moments.filter((m) => m.type === "question" && m.speaker === "child");
    for (const q of questions.slice(-3)) {
      const key = `q_${q.text.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        id: q.id,
        text: `Your child asked: "${q.text}" — explore this further with them`,
        reason: "They were curious about something",
        icon: "🤔",
        priority: 1,
      });
    }

    const emotionalPeaks = moments.filter((m) => m.type === "emotion_peak" && m.speaker === "child");
    for (const ep of emotionalPeaks.slice(-3)) {
      const key = `ep_${ep.emotion}_${ep.text.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const suggestions: Record<string, string> = {
        HAPPY: `They were happy talking about "${ep.text.slice(0, 60)}" — ask what made them smile`,
        SAD: `They seemed sad when saying "${ep.text.slice(0, 60)}" — gently check in`,
        ANGRY: `Something frustrated them: "${ep.text.slice(0, 60)}" — ask what happened`,
        FEAR: `They sounded worried about "${ep.text.slice(0, 60)}" — offer reassurance`,
        SURPRISE: `Something surprised them: "${ep.text.slice(0, 60)}" — ask for the story`,
      };
      const suggestion = suggestions[ep.emotion] ?? `Strong reaction to "${ep.text.slice(0, 60)}" — worth discussing`;
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
        for (const t of s.topicsDiscussed) {
          const k = t.toLowerCase();
          topicCounts[k] = (topicCounts[k] ?? 0) + 1;
        }
        for (const seg of s.transcript) {
          if (seg.entities) {
            for (const ent of seg.entities) {
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
          text: `Your child talked about "${topic}" in ${count} sessions — ask them about it`,
          reason: "Recurring interest across sessions",
          icon: "⭐",
          priority: 3,
        });
      }

      const recentConcerns = storedSessions
        .flatMap((s) => s.flaggedConcerns)
        .filter((c) => c.severity === "high" || c.severity === "medium");
      for (const c of recentConcerns.slice(-2)) {
        const key = `cross_concern_${c.text.slice(0, 30)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          id: key,
          text: `Your child seemed worried when talking about "${c.text.slice(0, 60)}" — here's how to approach it gently`,
          reason: "Concern flagged in a previous session",
          icon: "💛",
          priority: 1,
        });
      }
    }

    const entities = new Set<string>();
    for (const seg of transcript) {
      if (seg.entities) {
        for (const ent of seg.entities) entities.add(ent.text);
      }
    }
    if (entities.size > 0) {
      const topics = Array.from(entities).slice(0, 5);
      const key = `topics_${topics.join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          id: `topics_${Date.now()}`,
          text: `Topics mentioned today: ${topics.join(", ")} — pick one to dive deeper`,
          reason: "Key topics from their conversation",
          icon: "🏷️",
          priority: 4,
        });
      }
    }

    result.sort((a, b) => a.priority - b.priority);
    return result.slice(0, 8);
  }, [transcript, moments, storedSessions]);

  if (starters.length === 0) {
    return (
      <div className="starters-empty">
        <p>Conversation starters will appear after your child speaks for a bit.</p>
      </div>
    );
  }

  return (
    <div className="starters-list">
      {starters.map((s) => (
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
