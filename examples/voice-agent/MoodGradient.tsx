import React, { useMemo } from "react";
import type { BehavioralProfile } from "@whissle/live-assist-core";
import { EMOTION_KEYS } from "@whissle/live-assist-core";

const MOOD_PALETTE: Record<string, { base: string; glow: string }> = {
  ANGRY:    { base: "220, 38, 38",   glow: "239, 68, 68"   },
  HAPPY:    { base: "250, 204, 21",  glow: "253, 224, 71"  },
  SAD:      { base: "59, 130, 246",  glow: "96, 165, 250"  },
  FEAR:     { base: "139, 92, 246",  glow: "167, 139, 250" },
  SURPRISE: { base: "249, 115, 22",  glow: "251, 146, 60"  },
  DISGUST:  { base: "34, 197, 94",   glow: "74, 222, 128"  },
  NEUTRAL:  { base: "156, 163, 175", glow: "209, 213, 219" },
};

function getDominantWithIntensity(emotionProfile: Record<string, number>): { emotion: string; intensity: number } {
  const total = EMOTION_KEYS.reduce((s, k) => s + (emotionProfile[k] ?? 0), 0);
  if (total === 0) return { emotion: "NEUTRAL", intensity: 0 };

  let topKey = "NEUTRAL";
  let topVal = 0;
  for (const k of EMOTION_KEYS) {
    const v = emotionProfile[k] ?? 0;
    if (v > topVal) { topVal = v; topKey = k; }
  }

  const share = topVal / total;
  const intensity = topKey === "NEUTRAL"
    ? Math.max(0, (share - 0.7) * 1.5)
    : Math.min(1, share * 1.6);

  return { emotion: topKey, intensity };
}

interface Props {
  profile: BehavioralProfile | null;
}

export default function MoodGradient({ profile }: Props) {
  const style = useMemo((): React.CSSProperties => {
    if (!profile || profile.segmentCount < 2) {
      return { opacity: 0 };
    }

    const { emotion, intensity } = getDominantWithIntensity(profile.emotionProfile);
    const palette = MOOD_PALETTE[emotion] ?? MOOD_PALETTE.NEUTRAL;

    const alpha = Math.min(0.20, intensity * 0.25);
    const glowAlpha = Math.min(0.14, intensity * 0.18);

    if (alpha < 0.005) return { opacity: 0 };

    const layers = [
      `radial-gradient(ellipse 100% 90% at 0% 100%, rgba(${palette.glow}, ${glowAlpha}) 0%, transparent 55%)`,
      `radial-gradient(ellipse 80% 80% at 100% 0%, rgba(${palette.base}, ${alpha * 0.45}) 0%, transparent 50%)`,
      `radial-gradient(ellipse 60% 50% at 15% 85%, rgba(${palette.base}, ${alpha * 0.35}) 0%, transparent 45%)`,
      `radial-gradient(ellipse 70% 60% at 85% 15%, rgba(${palette.glow}, ${alpha * 0.3}) 0%, transparent 45%)`,
    ];

    return {
      opacity: 1,
      background: layers.join(", "),
    };
  }, [profile]);

  return <div className="session-mood-gradient" aria-hidden style={style} />;
}
