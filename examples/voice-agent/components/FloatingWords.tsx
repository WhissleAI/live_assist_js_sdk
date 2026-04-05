import React, { useState, useEffect, useRef } from "react";
import { EMOTION_COLORS } from "@whissle/live-assist-core";
import type { TranscriptSegment } from "../App";

interface FloatingWord {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  createdAt: number;
}

const WORD_LIFETIME_MS = 4000;
const MAX_WORDS = 12;

interface Props {
  transcript: TranscriptSegment[];
  currentEmotion: string;
}

export default function FloatingWords({ transcript, currentEmotion }: Props) {
  const [words, setWords] = useState<FloatingWord[]>([]);
  const lastSegIdRef = useRef<string | null>(null);

  useEffect(() => {
    const finalSegs = transcript.filter((s) => s.isFinal);
    if (finalSegs.length === 0) return;
    const latest = finalSegs[finalSegs.length - 1];
    if (latest.id === lastSegIdRef.current) return;
    lastSegIdRef.current = latest.id;

    const rawWords = latest.text.split(/\s+/).filter((w) => w.length > 2);
    const picks = rawWords.length <= 3 ? rawWords : rawWords.filter((_, i) => i % Math.ceil(rawWords.length / 3) === 0).slice(0, 3);

    const color = EMOTION_COLORS[latest.emotion || currentEmotion] || "#9ca3af";

    const newWords: FloatingWord[] = picks.map((w, i) => ({
      id: `fw_${Date.now()}_${i}`,
      text: w,
      x: 15 + Math.random() * 70,
      y: 20 + Math.random() * 50,
      color,
      size: 1.2 + Math.random() * 1.2,
      createdAt: Date.now(),
    }));

    setWords((prev) => [...prev, ...newWords].slice(-MAX_WORDS));
  }, [transcript, currentEmotion]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setWords((prev) => prev.filter((w) => now - w.createdAt < WORD_LIFETIME_MS));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="floating-words">
      {words.map((w) => {
        const age = Date.now() - w.createdAt;
        const progress = Math.min(1, age / WORD_LIFETIME_MS);
        const opacity = progress < 0.2 ? progress / 0.2 : progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
        const translateY = -progress * 40;

        return (
          <span
            key={w.id}
            className="floating-word"
            style={{
              left: `${w.x}%`,
              top: `${w.y}%`,
              color: w.color,
              fontSize: `${w.size}rem`,
              opacity,
              transform: `translateY(${translateY}px) scale(${1 + progress * 0.15})`,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
}
