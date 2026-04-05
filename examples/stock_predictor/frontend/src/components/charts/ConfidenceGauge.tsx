import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";

export function ConfidenceGauge({
  value,
  size = 140,
  direction,
}: {
  value: number;
  size?: number;
  direction?: "UP" | "DOWN";
}) {
  const color = direction === "UP" ? "#10b981" : direction === "DOWN" ? "#ef4444" : "#338dff";
  const data = [{ value: value * 100, fill: color }];

  return (
    <div className="flex flex-col items-center">
      <RadialBarChart
        width={size}
        height={size}
        cx={size / 2}
        cy={size / 2}
        innerRadius={size * 0.32}
        outerRadius={size * 0.45}
        data={data}
        startAngle={225}
        endAngle={-45}
        barSize={size * 0.08}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar
          dataKey="value"
          cornerRadius={size * 0.04}
          background={{ fill: "#1e293b" }}
        />
        <text
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-surface-50 text-lg font-bold"
        >
          {(value * 100).toFixed(0)}%
        </text>
        <text
          x={size / 2}
          y={size / 2 + 16}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-surface-500 text-[10px] font-medium"
        >
          confidence
        </text>
      </RadialBarChart>
    </div>
  );
}
