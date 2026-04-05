import React, { useState, useEffect, useRef } from "react";

interface Props {
  isActive: boolean;
}

type Phase = "inhale" | "hold" | "exhale";

const PHASE_DURATION: Record<Phase, number> = {
  inhale: 4000,
  hold: 4000,
  exhale: 4000,
};

const PHASE_LABELS: Record<Phase, string> = {
  inhale: "Breathe in...",
  hold: "Hold...",
  exhale: "Breathe out...",
};

const PHASES: Phase[] = ["inhale", "hold", "exhale"];

export default function CalmCornerVisual({ isActive }: Props) {
  const [phase, setPhase] = useState<Phase>("inhale");
  const [count, setCount] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseIndexRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      return;
    }

    phaseIndexRef.current = 0;
    setPhase("inhale");
    setCount(1);

    function nextPhase() {
      phaseIndexRef.current = (phaseIndexRef.current + 1) % PHASES.length;
      const p = PHASES[phaseIndexRef.current];
      setPhase(p);
      setCount(1);
      phaseTimerRef.current = setTimeout(nextPhase, PHASE_DURATION[p]);
    }

    phaseTimerRef.current = setTimeout(nextPhase, PHASE_DURATION.inhale);

    timerRef.current = setInterval(() => {
      setCount((c) => (c < 4 ? c + 1 : c));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, [isActive]);

  if (!isActive) return null;

  const scale = phase === "inhale" ? 1 + count * 0.08 : phase === "exhale" ? 1.32 - count * 0.08 : 1.32;

  return (
    <div className="calm-visual-overlay">
      <div
        className={`calm-circle calm-circle--${phase}`}
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      />
      <div className="calm-label">
        <span className="calm-phase">{PHASE_LABELS[phase]}</span>
        <span className="calm-count">{count}</span>
      </div>
    </div>
  );
}
