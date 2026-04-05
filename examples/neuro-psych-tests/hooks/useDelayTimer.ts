import { useState, useEffect, useCallback, useRef } from "react";

const DELAY_KEY = "neuropsych_delay_timer";
const DEFAULT_DELAY_SEC = 20 * 60; // 20 minutes

interface DelayState {
  remainingSec: number;
  isComplete: boolean;
  isActive: boolean;
  totalSec: number;
  progress: number;
}

export function useDelayTimer(delaySec = DEFAULT_DELAY_SEC) {
  const [state, setState] = useState<DelayState>(() => {
    const saved = sessionStorage.getItem(DELAY_KEY);
    if (saved) {
      try {
        const { startTime, totalSec } = JSON.parse(saved);
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, totalSec - elapsed);
        return {
          remainingSec: Math.ceil(remaining),
          isComplete: remaining <= 0,
          isActive: remaining > 0,
          totalSec,
          progress: Math.min(1, elapsed / totalSec),
        };
      } catch {}
    }
    return { remainingSec: delaySec, isComplete: false, isActive: false, totalSec: delaySec, progress: 0 };
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startDelay = useCallback(() => {
    const startTime = Date.now();
    sessionStorage.setItem(DELAY_KEY, JSON.stringify({ startTime, totalSec: delaySec }));
    setState({ remainingSec: delaySec, isComplete: false, isActive: true, totalSec: delaySec, progress: 0 });
  }, [delaySec]);

  const cancelDelay = useCallback(() => {
    sessionStorage.removeItem(DELAY_KEY);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setState({ remainingSec: 0, isComplete: true, isActive: false, totalSec: delaySec, progress: 1 });
  }, [delaySec]);

  useEffect(() => {
    if (!state.isActive) return;

    intervalRef.current = setInterval(() => {
      const saved = sessionStorage.getItem(DELAY_KEY);
      if (!saved) return;
      try {
        const { startTime, totalSec } = JSON.parse(saved);
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, totalSec - elapsed);

        if (remaining <= 0) {
          sessionStorage.removeItem(DELAY_KEY);
          if (intervalRef.current) clearInterval(intervalRef.current);
          setState({ remainingSec: 0, isComplete: true, isActive: false, totalSec, progress: 1 });
        } else {
          setState({
            remainingSec: Math.ceil(remaining),
            isComplete: false,
            isActive: true,
            totalSec,
            progress: Math.min(1, elapsed / totalSec),
          });
        }
      } catch {}
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state.isActive]);

  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return { ...state, startDelay, cancelDelay, formatTime };
}
