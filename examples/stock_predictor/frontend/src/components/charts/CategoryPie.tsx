import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { CATEGORY_COLORS } from "@/utils/colors";
import type { FeatureImportance } from "@/types";

export function CategoryPie({
  features,
  height = 260,
}: {
  features: FeatureImportance[];
  height?: number;
}) {
  const categoryTotals: Record<string, number> = {};
  for (const f of features) {
    categoryTotals[f.category] = (categoryTotals[f.category] || 0) + f.importance;
  }

  const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
  const data = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: +((value / total) * 100).toFixed(1),
      rawName: name,
    }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={80}
          innerRadius={45}
          paddingAngle={3}
          dataKey="value"
          label={({ name, value }) => `${name} ${value}%`}
          labelLine={{ stroke: "#475569" }}
        >
          {data.map((d) => (
            <Cell key={d.rawName} fill={CATEGORY_COLORS[d.rawName] || "#6b7280"} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v: number) => [`${v}%`, "Share"]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
