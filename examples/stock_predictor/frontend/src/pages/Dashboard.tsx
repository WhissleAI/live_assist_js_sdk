import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Target,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Calendar,
  Brain,
  Clock,
  Activity,
  Rocket,
  Eye,
  BarChart3,
} from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { useSSE } from "@/hooks/useSSE";
import { PageHeader } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { pct, shortDate } from "@/utils/format";
import type { Conviction, ConvictionsResponse, DashboardData, SchedulerStatus } from "@/types";

function FreshnessDot({ freshness }: { freshness: number }) {
  const color =
    freshness >= 0.8
      ? "bg-emerald-400"
      : freshness >= 0.4
        ? "bg-yellow-400"
        : "bg-surface-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={`Freshness: ${(freshness * 100).toFixed(0)}%`} />;
}

function ConvictionCard({ c, onClick }: { c: Conviction; onClick: () => void }) {
  const isBuy = c.direction === 1;
  return (
    <button
      onClick={onClick}
      className="flex flex-col justify-between rounded-xl border border-surface-800 bg-surface-900/60 p-4 text-left hover:border-surface-600 transition-all min-w-[200px]"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-surface-100">{c.ticker}</span>
          <FreshnessDot freshness={c.freshness} />
        </div>
        <Badge variant={isBuy ? "up" : "down"}>
          {isBuy ? <><ArrowUpRight size={12} /> BUY</> : <><ArrowDownRight size={12} /> SELL</>}
        </Badge>
      </div>
      <p className="text-xs text-surface-500 mb-2 truncate">{c.company_name}</p>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-lg font-semibold text-surface-100">
          {c.current_price ? `$${c.current_price.toFixed(2)}` : "—"}
        </span>
        {c.take_profit && c.current_price && (
          <span className={`text-xs font-medium ${isBuy ? "text-up" : "text-down"}`}>
            target ${c.take_profit.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-surface-400">{pct(c.confidence)} confidence</span>
        <span className="text-surface-500">{c.source_count} source{c.source_count !== 1 ? "s" : ""}</span>
      </div>
    </button>
  );
}

function OnboardingCard({ navigate }: { navigate: (path: string) => void }) {
  const steps = [
    { label: "Start the pipeline", desc: "Begin auto-discovery of earnings calls", path: "/pipeline", icon: Rocket, done: false },
    { label: "Add to watchlist", desc: "Track specific tickers you care about", path: "/watchlist", icon: Eye, done: false },
    { label: "Check track record", desc: "See how the model has performed", path: "/track-record", icon: BarChart3, done: false },
  ];
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket size={16} className="text-brand-400" /> Get Started
        </CardTitle>
      </CardHeader>
      <p className="text-xs text-surface-400 mb-4">
        Welcome! Here's how to start using the Stock Predictor to make data-driven decisions:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map((s, i) => (
          <button
            key={i}
            onClick={() => navigate(s.path)}
            className="flex items-start gap-3 rounded-lg border border-surface-800 bg-surface-900/50 p-3 text-left hover:border-surface-600 transition-colors"
          >
            <div className="rounded-lg bg-brand-600/15 p-2">
              <s.icon size={16} className="text-brand-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-surface-200">{s.label}</p>
              <p className="text-[10px] text-surface-500 mt-0.5">{s.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: dashData, loading: dashLoading, error: dashError } = useApi<DashboardData>(() => api.dashboard(), []);
  const { data: convData, loading: convLoading } = useApi<ConvictionsResponse>(() => api.convictions(), []);
  const { data: schedData } = useApi<SchedulerStatus>(() => api.schedulerStatus(), []);
  const { data: upcoming } = useApi<any>(() => api.upcomingEarnings(14), []);
  const { events: liveEvents, connected } = useSSE();
  const navigate = useNavigate();

  if (dashLoading && convLoading) return <PageLoader />;
  if (dashError) return <p className="text-red-400 p-6">Error: {dashError}</p>;

  const convictions = convData?.convictions ?? [];
  const topPicks = convictions.slice(0, 5);
  const schedulerActive = schedData?.scheduler_active ?? false;
  const recentActivity = liveEvents.slice(0, 5);
  const upcomingEvents = upcoming?.earnings?.slice(0, 5) ?? [];
  const d = dashData;

  const isFirstTime = !d || (d.total_sources === 0 && d.total_predictions === 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const isMarketOpen = new Date().getDay() >= 1 && new Date().getDay() <= 5 && hour >= 9 && hour < 16;

  return (
    <>
      <PageHeader
        title={`${greeting}. Here are today's top picks.`}
        description={
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isMarketOpen ? "bg-emerald-400 animate-pulse" : "bg-surface-500"}`} />
            Market {isMarketOpen ? "Open" : "Closed"}
            {schedulerActive && (
              <>
                <span className="text-surface-600 mx-1">|</span>
                <span className="h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
                Pipeline Active
              </>
            )}
          </span>
        }
      />

      {/* Onboarding for first-time users */}
      {isFirstTime && <OnboardingCard navigate={navigate} />}

      {/* Top Picks Row */}
      {topPicks.length > 0 ? (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-200">Top Picks</h2>
            <button
              onClick={() => navigate("/signals")}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-0.5"
            >
              View all signals <ChevronRight size={12} />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {topPicks.map((c) => (
              <ConvictionCard
                key={c.ticker}
                c={c}
                onClick={() => navigate(`/signals?ticker=${c.ticker}`)}
              />
            ))}
          </div>
        </div>
      ) : !isFirstTime ? (
        <Card className="mb-6">
          <div className="py-8 text-center">
            <Zap size={32} className="mx-auto mb-3 text-surface-600" />
            <p className="text-sm text-surface-400">No conviction signals yet.</p>
            <p className="text-xs text-surface-500 mt-1">
              Signals will appear once the pipeline processes audio sources and generates predictions.
            </p>
            <button
              onClick={() => navigate("/pipeline")}
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Go to Pipeline
            </button>
          </div>
        </Card>
      ) : null}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard
          label="Win Rate (30d)"
          value={d?.accuracy_rate != null ? pct(d.accuracy_rate) : "—"}
          sub={d && d.evaluated_predictions > 0 ? `${d.evaluated_predictions} evaluated` : "No evaluations yet"}
          icon={<Target size={20} />}
          trend={d?.accuracy_rate != null ? (d.accuracy_rate > 0.55 ? "up" : d.accuracy_rate < 0.45 ? "down" : "neutral") : undefined}
        />
        <StatCard
          label="High-Conf Accuracy"
          value={d?.high_confidence_accuracy != null ? pct(d.high_confidence_accuracy) : "—"}
          sub={d && d.high_confidence_count > 0 ? `${d.high_confidence_count} high-conf calls` : "No data"}
          icon={<Zap size={20} />}
          trend={d?.high_confidence_accuracy != null ? (d.high_confidence_accuracy > 0.6 ? "up" : "neutral") : undefined}
        />
        <StatCard
          label="Active Signals"
          value={convictions.length}
          sub={`${convictions.filter(c => c.freshness >= 0.8).length} fresh`}
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          label="Sources Analyzed"
          value={d?.total_sources ?? 0}
          sub={d ? `${d.total_predictions} predictions made` : ""}
          icon={<Brain size={20} />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming Events */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Calendar size={16} /> Upcoming Events</CardTitle>
            <button
              onClick={() => navigate("/watchlist")}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-0.5"
            >
              Watchlist <ChevronRight size={12} />
            </button>
          </CardHeader>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-surface-500 py-4">No upcoming earnings in the next 14 days.</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((e: any, i: number) => {
                const days = Math.ceil(
                  (new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-surface-800/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-surface-100">
                        {e.ticker}
                      </span>
                      <span className="text-xs text-surface-400">{e.company || ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-surface-500" />
                      <span className="text-xs text-surface-400">
                        {days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent Pipeline Activity */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Activity size={16} /> Recent Activity</CardTitle>
            <button
              onClick={() => navigate("/pipeline")}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-0.5"
            >
              Pipeline <ChevronRight size={12} />
            </button>
          </CardHeader>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-surface-500 py-4">No recent events. Start the scheduler to begin processing.</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-surface-800/40 px-3 py-2"
                >
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-surface-300 truncate">{ev.message}</p>
                    <p className="text-[10px] text-surface-500 mt-0.5">{shortDate(ev.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Model Health */}
      {d?.latest_model && (
        <Card className="mt-6">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Brain size={16} /> Model Health</CardTitle>
            <button
              onClick={() => navigate("/model")}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-0.5"
            >
              Details <ChevronRight size={12} />
            </button>
          </CardHeader>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-surface-500">Accuracy</p>
              <p className="text-lg font-semibold text-surface-100">{pct(d.latest_model.accuracy)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500">AUC-ROC</p>
              <p className="text-lg font-semibold text-surface-100">{d.latest_model.auc_roc?.toFixed(4) || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500">Last Trained</p>
              <p className="text-lg font-semibold text-surface-100">{shortDate(d.latest_model.run_date)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500">Version</p>
              <p className="text-sm font-mono text-surface-300">{d.model_version || "—"}</p>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
