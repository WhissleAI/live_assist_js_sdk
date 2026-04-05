import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { ModelRun } from "@/types";

export function AccuracyLine({ runs, height = 300 }: { runs: ModelRun[]; height?: number }) {
  const data = runs.map((r) => ({
    date: r.run_date?.slice(0, 10) || r.created_at?.slice(0, 10),
    accuracy: +(r.accuracy * 100).toFixed(1),
    auc: +(r.auc_roc * 100).toFixed(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} domain={[0, 100]} unit="%" />
        <Tooltip
          contentStyle={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 3" label={{ value: "50%", fill: "#475569", fontSize: 10 }} />
        <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} name="Accuracy %" />
        <Line type="monotone" dataKey="auc" stroke="#338dff" strokeWidth={2} dot={{ r: 3, fill: "#338dff" }} name="AUC-ROC %" />
      </LineChart>
    </ResponsiveContainer>
  );
}
