import { useCallback, useRef, useState } from "react";

export interface EmotionPoint {
  timestamp: number;
  emotion: string;
  confidence: number;
  speaker: "you" | "them";
}

export interface EmotionTimelineData {
  you: EmotionPoint[];
  them: EmotionPoint[];
}

export function useEmotionTimeline() {
  const [timeline, setTimeline] = useState<EmotionTimelineData>({ you: [], them: [] });
  const startTimeRef = useRef(Date.now());

  const reset = useCallback(() => {
    startTimeRef.current = Date.now();
    setTimeline({ you: [], them: [] });
  }, []);

  const addPoint = useCallback((speaker: "you" | "them", emotion: string, confidence: number) => {
    const point: EmotionPoint = {
      timestamp: Date.now() - startTimeRef.current,
      emotion: emotion.toUpperCase(),
      confidence,
      speaker,
    };

    setTimeline((prev) => ({
      ...prev,
      [speaker]: [...prev[speaker], point],
    }));
  }, []);

  return { timeline, addPoint, reset };
}
