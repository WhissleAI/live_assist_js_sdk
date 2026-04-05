export interface EmotionPalette {
  bg: string;
  glow1: string;
  glow2: string;
  glow3: string;
  /** Core RGB for canvas drawing (0-255) */
  rgb: [number, number, number];
}

export const EMOTION_PALETTES: Record<string, EmotionPalette> = {
  HAPPY:    { bg: "#fef9c3", glow1: "rgba(250,204,21,0.55)", glow2: "rgba(253,224,71,0.4)",  glow3: "rgba(251,191,36,0.3)",  rgb: [250, 204, 21]  },
  SAD:      { bg: "#dbeafe", glow1: "rgba(59,130,246,0.5)",  glow2: "rgba(96,165,250,0.35)", glow3: "rgba(37,99,235,0.25)",  rgb: [59, 130, 246]  },
  ANGRY:    { bg: "#fecaca", glow1: "rgba(239,68,68,0.55)",  glow2: "rgba(220,38,38,0.4)",   glow3: "rgba(185,28,28,0.3)",   rgb: [239, 68, 68]   },
  FEAR:     { bg: "#ede9fe", glow1: "rgba(139,92,246,0.5)",  glow2: "rgba(167,139,250,0.35)",glow3: "rgba(109,40,217,0.25)", rgb: [139, 92, 246]  },
  SURPRISE: { bg: "#ffedd5", glow1: "rgba(249,115,22,0.55)", glow2: "rgba(251,146,60,0.4)",  glow3: "rgba(234,88,12,0.3)",   rgb: [249, 115, 22]  },
  DISGUST:  { bg: "#dcfce7", glow1: "rgba(34,197,94,0.5)",   glow2: "rgba(74,222,128,0.35)", glow3: "rgba(22,163,74,0.25)",  rgb: [34, 197, 94]   },
  NEUTRAL:  { bg: "#f3f4f6", glow1: "rgba(156,163,175,0.3)", glow2: "rgba(209,213,219,0.2)", glow3: "rgba(107,114,128,0.15)",rgb: [120, 140, 200] },
};

export function getEmotionRgb(emotion: string): [number, number, number] {
  return (EMOTION_PALETTES[emotion] || EMOTION_PALETTES.NEUTRAL).rgb;
}

export function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
