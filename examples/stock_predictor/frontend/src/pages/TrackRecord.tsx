import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { Trophy, TrendingUp, Target, Filter } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { PageLoader } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { pct } from "@/utils/format";

type Period = "7d" | "30d" | "90d" | "all";

function daysAgo(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
}

export default function TrackRecord() {
  const { data, loading } = useApi(() => api.trackRecord(), []);
  const [period, setPeriod] = useState<Period>("all");

  const filtered = useMemo(() => {
    if (!data) return null;
    const equity = data.equity_curve || [];
    if (period === "all") return { ...data, equity_curve: equity };

    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const cutoff = daysAgo(days);
    const filteredEquity = equity.filter((t: any) => t.date >= cutoff);
    const wins = filteredEquity.filter((t: any) => t.correct);
    const losses = filteredEquity.filter((t: any) => !t.correct);
    const cumRet = filteredEquity.reduce((sum: number, t: any) => sum + (t.return || 0), 0);
    const highConf = filteredEquity.filter((t: any) => t.confidence >= 0.85);
    const highConfWins = highConf.filter((t: any) => t.correct);

    let runningCum = 0;
    const recomputed = filteredEquity.map((t: any) => {
      runningCum += t.return || 0;
      return { ...t, cumulative: Math.round(runningCum * 100) / 100 };
    });

    return {
      ...data,
      equity_curve: recomputed,
      evaluated: filteredEquity.length,
      wins: wins.length,
      losses: losses.length,
      win_rate: filteredEquity.length > 0 ? wins.length / filteredEquity.length : null,
      cumulative_return_pct: Math.round(cumRet * 100) / 100,
      high_confidence_total: highConf.length,
      high_confidence_wins: highConfWins.length,
      high_confidence_win_rate: highConf.length > 0 ? highConfWins.length / highConf.length : null,
      best_trade: recomputed.length > 0 ? recomputed.reduce((a: any, b: any) => (b.return > a.return ? b : a)) : null,
    };
  }, [data, period]);

  if (loading) return <PageLoader />;
  if (!data || data.evaluated === 0) {
    return (
      <>
        <PageHeader title="Track Record" />
        <EmptyState
          icon={<Trophy size={48} />}
          title="No track record yet"
          description="Predictions need actual outcomes to build a track record."
        />
      </>
    );
  }

  const d = filtered!;
  const equity = d.equity_curve || [];
  const monthly = Object.entries(data.monthly_returns || {}).map(([month, ret]) => ({
    month,
    return: ret as number,
  }));

  const sourceTypeBreakdown = useMemo(() => {
    const equityData = period === "all" ? (data.equity_curve || []) : (filtered?.equity_curve || []);
    const groups: Record<string, { wins: number; total: number; returns: number }> = {};
    for (const t of equityData) {
      const type = (t as any).source_type || "unknown";
      if (!groups[type]) groups[type] = { wins: 0, total: 0, returns: 0 };
      groups[type].total += 1;
      groups[type].returns += (t as any).return || 0;
      if ((t as any).correct) groups[type].wins += 1;
    }
    return Object.entries(groups)
      .map(([type, { wins, total, returns }]) => ({
        type, wins, total,
        rate: total > 0 ? wins / total : 0,
        avgReturn: total > 0 ? returns / total : 0,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [data, filtered, period]);

  const tierBreakdown = useMemo(() => {
    const equityData = period === "all" ? (data.equity_curve || []) : (filtered?.equity_curve || []);
    const tiers: Record<string, { wins: number; total: number; returns: number }> = {
      high: { wins: 0, total: 0, returns: 0 },
      moderate: { wins: 0, total: 0, returns: 0 },
      low: { wins: 0, total: 0, returns: 0 },
    };
    for (const t of equityData) {
      const conf = (t as any).confidence || 0.5;
      const tier = conf >= 0.85 ? "high" : conf >= 0.65 ? "moderate" : "low";
      tiers[tier].total += 1;
      tiers[tier].returns += (t as any).return || 0;
      if ((t as any).correct) tiers[tier].wins += 1;
    }
    return Object.entries(tiers)
      .filter(([, v]) => v.total > 0)
      .map(([tier, { wins, total, returns }]) => ({
        tier, wins, total,
        rate: wins / total,
        avgReturn: total > 0 ? returns / total : 0,
      }));
  }, [data, filtered, period]);

  return (
    <>
      <PageHeader
        title="Track Record"
        description="Performance proof — how the model performs over time"
        action={
          <div className="flex gap-1 rounded-lg bg-surface-900 border border-surface-800 p-1">
            {(["7d", "30d", "90d", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  period === p ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300"
                }`}
              >
                {p === "all" ? "All" : p}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <StatCard
          label="Win Rate"
          value={d.win_rate != null ? pct(d.win_rate) : "—"}
          sub={`${d.wins}W / ${d.losses}L`}
          icon={<Trophy size={20} className={d.win_rate > 0.55 ? "text-up" : "text-surface-400"} />}
          trend={d.win_rate > 0.55 ? "up" : d.win_rate < 0.45 ? "down" : "neutral"}
        />
        <StatCard
          label="High-Conf Win Rate"
          value={d.high_confidence_win_rate != null ? pct(d.high_confidence_win_rate) : "—"}
          sub={`${d.high_confidence_wins} of ${d.high_confidence_total}`}
          icon={<Target size={20} />}
          trend={d.high_confidence_win_rate > 0.6 ? "up" : "neutral"}
        />
        <StatCard
          label="Cumulative Return"
          value={`${d.cumulative_return_pct >= 0 ? "+" : ""}${d.cumulative_return_pct}%`}
          icon={<TrendingUp size={20} />}
          trend={d.cumulative_return_pct > 0 ? "up" : "down"}
        />
        <StatCard
          label="Evaluated"
          value={d.evaluated}
          sub={`of ${data.total_predictions} total`}
        />
        <StatCard
          label="Best Trade"
          value={d.best_trade ? `${d.best_trade.return >= 0 ? "+" : ""}${d.best_trade.return}%` : "—"}
          sub={d.best_trade?.ticker || ""}
          trend={d.best_trade && d.best_trade.return >= 0 ? "up" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Equity curve */}
        {equity.length > 1 && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Equity Curve (Cumulative Return %)</CardTitle></CardHeader>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={equity} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, "Cumulative"]}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Line type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Confidence Tier Breakdown */}
        {tierBreakdown.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Filter size={16} /> By Confidence Tier</CardTitle></CardHeader>
            <div className="space-y-3">
              {tierBreakdown.map(({ tier, wins, total, rate, avgReturn }) => (
                <div key={tier}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-surface-300 capitalize">{tier}</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-mono ${avgReturn >= 0 ? "text-up" : "text-down"}`}>
                        avg {avgReturn >= 0 ? "+" : ""}{avgReturn.toFixed(1)}%
                      </span>
                      <span className="text-xs text-surface-400">{wins}/{total} — {pct(rate)}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        rate >= 0.6 ? "bg-emerald-500" : rate >= 0.5 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(rate * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Source Type Breakdown */}
        {sourceTypeBreakdown.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Filter size={16} /> By Source Type</CardTitle></CardHeader>
            <div className="space-y-3">
              {sourceTypeBreakdown.map(({ type, wins, total, rate, avgReturn }) => (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-surface-300">{type.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-mono ${avgReturn >= 0 ? "text-up" : "text-down"}`}>
                        avg {avgReturn >= 0 ? "+" : ""}{avgReturn.toFixed(1)}%
                      </span>
                      <span className="text-xs text-surface-400">{wins}/{total} — {pct(rate)}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        rate >= 0.6 ? "bg-emerald-500" : rate >= 0.5 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(rate * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Monthly returns */}
        {monthly.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Monthly Returns</CardTitle></CardHeader>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthly} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="return" radius={[4, 4, 0, 0]}>
                  {monthly.map((m, i) => (
                    <Cell key={i} fill={m.return >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Trade log */}
        <Card className={monthly.length > 0 && sourceTypeBreakdown.length > 0 ? "lg:col-span-2" : ""}>
          <CardHeader><CardTitle>Trade Log</CardTitle></CardHeader>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-800">
                  <th className="px-3 py-2 text-left text-surface-400">Date</th>
                  <th className="px-3 py-2 text-left text-surface-400">Ticker</th>
                  <th className="px-3 py-2 text-left text-surface-400">Dir</th>
                  <th className="px-3 py-2 text-left text-surface-400">Conf</th>
                  <th className="px-3 py-2 text-left text-surface-400">Source</th>
                  <th className="px-3 py-2 text-left text-surface-400">Return</th>
                  <th className="px-3 py-2 text-left text-surface-400">Result</th>
                </tr>
              </thead>
              <tbody>
                {equity.map((t: any, i: number) => (
                  <tr key={i} className="border-b border-surface-800/50">
                    <td className="px-3 py-1.5 text-surface-400">{t.date}</td>
                    <td className="px-3 py-1.5 font-semibold text-surface-200">{t.ticker}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={t.direction === 1 ? "up" : "down"} className="text-[9px] px-1">
                        {t.direction === 1 ? "BUY" : "SELL"}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-surface-400">
                      {t.confidence != null ? pct(t.confidence) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-surface-500">
                      {(t.source_type || "").replace(/_/g, " ")}
                    </td>
                    <td className={`px-3 py-1.5 font-mono ${t.return >= 0 ? "text-up" : "text-down"}`}>
                      {t.return >= 0 ? "+" : ""}{t.return}%
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant={t.correct ? "correct" : "wrong"}>{t.correct ? "W" : "L"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
