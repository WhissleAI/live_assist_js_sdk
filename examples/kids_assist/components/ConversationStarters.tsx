import React, { useMemo } from "react";
import type { TranscriptSegment, Moment } from "../App";

interface Props {
  transcript: TranscriptSegment[];
  moments: Moment[];
}

interface Starter {
  id: string;
  text: string;
  reason: string;
  icon: string;
}

export default function ConversationStarters({ transcript, moments }: Props) {
  const starters = useMemo((): Starter[] => {
    const result: Starter[] = [];
    const seen = new Set<string>();

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
      });
    }

    const emotionalPeaks = moments.filter((m) => m.type === "emotion_peak" && m.speaker === "child");
    for (const ep of emotionalPeaks.slice(-3)) {
      const key = `ep_${ep.emotion}_${ep.text.slice(0, 30)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let suggestion = "";
      if (ep.emotion === "HAPPY") {
        suggestion = `They were happy talking about "${ep.text.slice(0, 60)}" — ask what made them smile`;
      } else if (ep.emotion === "SAD") {
        suggestion = `They seemed sad when saying "${ep.text.slice(0, 60)}" — gently check in`;
      } else if (ep.emotion === "ANGRY") {
        suggestion = `Something frustrated them: "${ep.text.slice(0, 60)}" — ask what happened`;
      } else if (ep.emotion === "FEAR") {
        suggestion = `They sounded worried about "${ep.text.slice(0, 60)}" — offer reassurance`;
      } else if (ep.emotion === "SURPRISE") {
        suggestion = `Something surprised them: "${ep.text.slice(0, 60)}" — ask for the story`;
      } else {
        suggestion = `Strong reaction to "${ep.text.slice(0, 60)}" — worth discussing`;
      }

      result.push({
        id: ep.id,
        text: suggestion,
        reason: `${ep.emotion.charAt(0) + ep.emotion.slice(1).toLowerCase()} moment detected`,
        icon: ep.emotion === "HAPPY" ? "😊" : ep.emotion === "SAD" ? "💙" : ep.emotion === "ANGRY" ? "🔥" : ep.emotion === "FEAR" ? "💜" : "✨",
      });
    }

    const entities = new Set<string>();
    for (const seg of transcript) {
      if (seg.entities) {
        for (const ent of seg.entities) {
          entities.add(ent.text);
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
          text: `Topics mentioned: ${topics.join(", ")} — pick one to dive deeper`,
          reason: "Key topics from their conversation",
          icon: "🏷️",
        });
      }
    }

    return result.slice(0, 6);
  }, [transcript, moments]);

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
