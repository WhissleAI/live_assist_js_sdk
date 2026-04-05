import { ReactNode } from "react";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
}) {
  const trendColor =
    trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-surface-400";

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-bold text-surface-50">{value}</p>
          {sub && <p className={`mt-1 text-xs font-medium ${trendColor}`}>{sub}</p>}
        </div>
        {icon && <div className="text-surface-500">{icon}</div>}
      </div>
    </Card>
  );
}
