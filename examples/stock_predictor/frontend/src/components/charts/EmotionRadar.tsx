import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { EMOTION_COLORS } from "@/utils/colors";

export function EmotionRadar({
  features,
  height = 280,
}: {
  features: Record<string, number>;
  height?: number;
}) {
  const EMOTIONS = ["happy", "sad", "angry", "fear", "surprise", "disgust", "neutral", "contempt"];
  const data = EMOTIONS.map((e) => ({
    emotion: e.charAt(0).toUpperCase() + e.slice(1),
    value: +(features[`emotion_mean_${e}`] || 0).toFixed(3),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis dataKey="emotion" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Radar
          dataKey="value"
          stroke="#f59e0b"
          fill="#f59e0b"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
