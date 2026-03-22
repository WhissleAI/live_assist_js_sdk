import React, { useMemo } from "react";

const PALETTES: Record<string, { bg: string; glow1: string; glow2: string; glow3: string }> = {
  HAPPY:    { bg: "#fef9c3", glow1: "rgba(250,204,21,0.55)", glow2: "rgba(253,224,71,0.4)",  glow3: "rgba(251,191,36,0.3)"  },
  SAD:      { bg: "#dbeafe", glow1: "rgba(59,130,246,0.5)",  glow2: "rgba(96,165,250,0.35)", glow3: "rgba(37,99,235,0.25)"  },
  ANGRY:    { bg: "#fecaca", glow1: "rgba(239,68,68,0.55)",  glow2: "rgba(220,38,38,0.4)",   glow3: "rgba(185,28,28,0.3)"   },
  FEAR:     { bg: "#ede9fe", glow1: "rgba(139,92,246,0.5)",  glow2: "rgba(167,139,250,0.35)",glow3: "rgba(109,40,217,0.25)" },
  SURPRISE: { bg: "#ffedd5", glow1: "rgba(249,115,22,0.55)", glow2: "rgba(251,146,60,0.4)",  glow3: "rgba(234,88,12,0.3)"   },
  DISGUST:  { bg: "#dcfce7", glow1: "rgba(34,197,94,0.5)",   glow2: "rgba(74,222,128,0.35)", glow3: "rgba(22,163,74,0.25)"  },
  NEUTRAL:  { bg: "#f3f4f6", glow1: "rgba(156,163,175,0.3)", glow2: "rgba(209,213,219,0.2)", glow3: "rgba(107,114,128,0.15)"},
};

interface Props {
  emotion: string;
  probs: Record<string, number>;
  isActive: boolean;
}

export default function EmotionCanvas({ emotion, probs, isActive }: Props) {
  const style = useMemo((): React.CSSProperties => {
    if (!isActive) {
      return { background: "#111827" };
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
  }, [emotion, probs, isActive]);

  const orbStyle = useMemo((): React.CSSProperties => {
    if (!isActive) return { opacity: 0 };
    const palette = PALETTES[emotion] || PALETTES.NEUTRAL;
    return {
      opacity: 1,
      background: `radial-gradient(circle, ${palette.glow1} 0%, transparent 70%)`,
      animationDuration: emotion === "HAPPY" ? "3s" : emotion === "SAD" ? "6s" : emotion === "ANGRY" ? "1.5s" : "4s",
    };
  }, [emotion, isActive]);

  return (
    <div className="emotion-canvas" style={style}>
      <div className="emotion-orb emotion-orb--1" style={orbStyle} />
      <div className="emotion-orb emotion-orb--2" style={orbStyle} />
      <div className="emotion-orb emotion-orb--3" style={orbStyle} />
    </div>
  );
}
