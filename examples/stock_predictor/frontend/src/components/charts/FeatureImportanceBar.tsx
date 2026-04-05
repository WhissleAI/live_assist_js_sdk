import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CATEGORY_COLORS } from "@/utils/colors";
import type { FeatureImportance } from "@/types";

export function FeatureImportanceBar({
  features,
  maxItems = 15,
  height = 400,
}: {
  features: FeatureImportance[];
  maxItems?: number;
  height?: number;
}) {
  const data = features.slice(0, maxItems).map((f) => ({
    name: f.feature.replace(/_/g, " "),
    rawName: f.feature,
    value: f.importance,
    category: f.category,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis
          dataKey="name"
          type="category"
          tick={{ fill: "#cbd5e1", fontSize: 11 }}
          width={110}
        />
        <Tooltip
          contentStyle={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v: number) => [v.toFixed(4), "Importance"]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={CATEGORY_COLORS[d.category] || "#6b7280"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
