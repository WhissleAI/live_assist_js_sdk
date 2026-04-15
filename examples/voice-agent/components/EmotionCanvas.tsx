import React, { useMemo } from "react";
import { EMOTION_PALETTES } from "../lib/emotion-palettes";

const PALETTES = EMOTION_PALETTES;

interface Props {
  emotion: string;
  probs: Record<string, number>;
  isActive: boolean;
  breathSync?: boolean;
}

export default function EmotionCanvas({ emotion, probs, isActive, breathSync }: Props) {
  const style = useMemo((): React.CSSProperties => {
    if (!isActive) {
      return { background: "var(--color-bg, #f8fafc)" };
    }

    if (breathSync) {
      return {
        background: "linear-gradient(135deg, #dbeafe 0%, #e0e7ff 50%, #dbeafe 100%)",
        transition: "background 2s ease",
      };
    }

    const palette = PALETTES[emotion] || PALETTES.NEUTRAL;
    const intensity = probs[emotion] ?? 0.5;
    const scale = Math.max(0.3, Math.min(1, intensity));

    const layers = [
      `radial-gradient(ellipse 120% 100% at 50% 120%, ${palette.glow1} 0%, transparent 60%)`,
      `radial-gradient(ellipse 80% 70% at 20% 80%, ${palette.glow2} 0%, transparent 50%)`,
      `radial-gradient(ellipse 70% 60% at 80% 30%, ${palette.glow3} 0%, transparent 50%)`,
      `radial-gradient(circle at 50% 50%, ${palette.glow1.replace(/[\d.]+\)$/, `${0.1 * scale})`)} 0%, transparent 70%)`,
    ];

    return {
      background: `${layers.join(", ")}, ${palette.bg}`,
      transition: "background 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
    };
  }, [emotion, probs, isActive, breathSync]);

  const orbStyle = useMemo((): React.CSSProperties => {
    if (!isActive) return { opacity: 0 };
    if (breathSync) {
      return {
        opacity: 0.6,
        background: "radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)",
        animationDuration: "12s",
      };
    }
    const palette = PALETTES[emotion] || PALETTES.NEUTRAL;
    return {
      opacity: 1,
      background: `radial-gradient(circle, ${palette.glow1} 0%, transparent 70%)`,
      animationDuration: emotion === "HAPPY" ? "3s" : emotion === "SAD" ? "6s" : emotion === "ANGRY" ? "1.5s" : "4s",
    };
  }, [emotion, isActive, breathSync]);

  return (
    <div className="emotion-canvas" style={style}>
      <div className="emotion-orb emotion-orb--1" style={orbStyle} />
      <div className="emotion-orb emotion-orb--2" style={orbStyle} />
      <div className="emotion-orb emotion-orb--3" style={orbStyle} />
    </div>
  );
}
