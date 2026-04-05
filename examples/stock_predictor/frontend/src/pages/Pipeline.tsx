import { useState, useEffect } from "react";
import {
  Radio,
  Loader2,
  CheckCircle2,
  XCircle,
  Download,
  Mic,
  TrendingUp,
  Brain,
  Zap,
  BarChart3,
  Play,
  Clock,
  Power,
  PowerOff,
  RefreshCw,
  Timer,
  AlertCircle,
  Database,
} from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { useSSE } from "@/hooks/useSSE";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Th, Td } from "@/components/ui/Table";
import { PageLoader } from "@/components/ui/Spinner";
import { shortDate } from "@/utils/format";
import type { ActivityEvent, SSEEvent, SchedulerStatus, SchedulerJob, Source } from "@/types";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  download_start: <Download size={14} className="text-brand-400" />,
  download_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  download_failed: <XCircle size={14} className="text-red-400" />,
  stt_start: <Mic size={14} className="text-amber-400" />,
  stt_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  features_start: <BarChart3 size={14} className="text-purple-400" />,
  features_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  predict_start: <TrendingUp size={14} className="text-brand-400" />,
  predict_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  predict_skip: <Clock size={14} className="text-surface-500" />,
  signals_start: <Zap size={14} className="text-amber-400" />,
  signals_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  conviction_start: <Zap size={14} className="text-brand-400" />,
  conviction_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  retrain_start: <Brain size={14} className="text-purple-400" />,
  retrain_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  retrain_rejected: <XCircle size={14} className="text-red-400" />,
  retrain_error: <XCircle size={14} className="text-red-400" />,
  ingestion_start: <Play size={14} className="text-brand-400" />,
  ingestion_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  ingestion_error: <XCircle size={14} className="text-red-400" />,
  outcomes_start: <TrendingUp size={14} className="text-amber-400" />,
  outcomes_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  stock_data_start: <BarChart3 size={14} className="text-amber-400" />,
  stock_data_complete: <CheckCircle2 size={14} className="text-emerald-400" />,
  system: <Radio size={14} className="text-brand-400" />,
};

function eventColor(type: string): string {
  if (type.includes("error") || type.includes("failed") || type.includes("rejected")) return "text-red-400";
  if (type.includes("complete")) return "text-emerald-400";
  if (type.includes("start")) return "text-brand-400";
  return "text-surface-400";
}

function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return ts; }
}

function fmtDateTime(ts: string) {
  try { return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return ts; }
}

function fmtDuration(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec.toFixed(0)}s`;
  return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
}

function fmtCountdown(sec: number | null) {
  if (sec == null || sec <= 0) return "now";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function JobStatusBadge({ status }: { status: SchedulerJob["status"] }) {
  if (status === "running")
    return <Badge variant="pending"><Loader2 size={10} className="animate-spin" /> Running</Badge>;
  if (status === "completed")
    return <Badge variant="correct"><CheckCircle2 size={10} /> Done</Badge>;
  if (status === "error")
    return <Badge variant="wrong"><XCircle size={10} /> Error</Badge>;
  return <Badge variant="neutral">Idle</Badge>;
}

export default function Pipeline() {
  const [tab, setTab] = useState<"live" | "sources">("live");
  const { events: liveEvents, connected } = useSSE();
  const { data: logData, loading: logLoading } = useApi<{ events: ActivityEvent[] }>(
    () => api.activityLog(50), [],
  );
  const { data: schedData, refetch: refetchSched } = useApi<SchedulerStatus>(
    () => api.schedulerStatus(), [],
  );
  const { data: srcData, loading: srcLoading } = useApi(() => api.sources(200), []);
  const { data: diagData } = useApi<any>(() => api.diagnostics(), []);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(refetchSched, 3000);
    return () => clearInterval(id);
  }, [refetchSched]);

  async function toggleScheduler() {
    setActionError(null);
    try {
      if (schedData?.scheduler_active) await api.schedulerStop();
      else await api.schedulerStart();
      refetchSched();
    } catch (e: any) {
      setActionError(e.message);
    }
  }

  async function runJob(name: string) {
    setActionError(null);
    try {
      await api.schedulerRunJob(name);
      refetchSched();
    } catch (e: any) {
      setActionError(`Failed to start ${name}: ${e.message}`);
    }
  }

  const active = schedData?.scheduler_active ?? false;
  const jobs = schedData?.jobs ?? [];
  const runningJobs = jobs.filter((j) => j.status === "running");
  const historicalEvents = logData?.events ?? [];
  const sources: Source[] = srcData?.sources || [];

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Data ingestion, processing, and job control"
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
              <span className="text-xs text-surface-500">{connected ? "Live" : "Reconnecting..."}</span>
            </div>
            <button
              onClick={toggleScheduler}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                active ? "bg-red-500/15 text-red-400 hover:bg-red-500/25" : "bg-up/15 text-up hover:bg-up/25"
              }`}
            >
              {active ? <PowerOff size={12} /> : <Power size={12} />}
              {active ? "Stop Scheduler" : "Start Scheduler"}
            </button>
          </div>
        }
      />

      {actionError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          <AlertCircle size={14} /> {actionError}
        </div>
      )}

      {runningJobs.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-5 py-3">
          <Loader2 size={16} className="animate-spin text-brand-400" />
          <span className="text-sm font-medium text-brand-300">
            Running:{" "}
            {runningJobs.map((j) => (
              <span key={j.name} className="text-brand-200 mr-2">{j.name.replace(/_/g, " ")}</span>
            ))}
          </span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-surface-900 border border-surface-800 p-1 w-fit mb-4">
        <button
          onClick={() => setTab("live")}
          className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
            tab === "live" ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300"
          }`}
        >
          <Radio size={12} className="inline mr-1.5" /> Live
        </button>
        <button
          onClick={() => setTab("sources")}
          className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
            tab === "sources" ? "bg-surface-700 text-surface-100" : "text-surface-500 hover:text-surface-300"
          }`}
        >
          <Database size={12} className="inline mr-1.5" /> Sources ({sources.length})
        </button>
      </div>

      {tab === "live" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Live Stream</CardTitle>
                  <Badge variant={connected ? "correct" : "wrong"}>
                    {connected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
              </CardHeader>
              {liveEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Radio size={28} className="text-surface-600 mb-2" />
                  <p className="text-sm text-surface-500">Waiting for pipeline events...</p>
                  <p className="text-xs text-surface-600 mt-1">Events appear here in real-time as jobs run</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                  {liveEvents.map((evt, i) => (
                    <LiveEventRow key={`${evt.timestamp}-${i}`} event={evt} />
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent History</CardTitle></CardHeader>
              {logLoading ? (
                <PageLoader />
              ) : historicalEvents.length === 0 ? (
                <p className="text-sm text-surface-500 py-4 text-center">No activity logged yet</p>
              ) : (
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                  {historicalEvents.map((evt) => (
                    <HistoricalRow key={evt.id} event={evt} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Jobs</h3>
              <Badge variant={active ? "correct" : "neutral"}>
                {active ? "Scheduler Active" : "Scheduler Stopped"}
              </Badge>
            </div>
            {jobs.map((job) => (
              <JobCard key={job.name} job={job} onRun={runJob} />
            ))}
          </div>
        </div>
      ) : (
        /* Sources Tab */
        <Card className="overflow-hidden p-0">
          {srcLoading ? (
            <PageLoader />
          ) : sources.length === 0 ? (
            <div className="py-12 text-center">
              <Database size={32} className="mx-auto mb-3 text-surface-600" />
              <p className="text-sm text-surface-500">No audio sources yet. Start the pipeline to ingest data.</p>
            </div>
          ) : (
            <Table>
              <thead>
                <tr className="border-b border-surface-800">
                  <Th>ID</Th>
                  <Th>Ticker</Th>
                  <Th>Type</Th>
                  <Th>Event Date</Th>
                  <Th>Chunks</Th>
                  <Th>Features</Th>
                  <Th>Predicted</Th>
                  <Th>Stock Data</Th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
                    <Td className="font-mono text-xs text-surface-500">#{s.id}</Td>
                    <Td className="font-semibold">{s.ticker || "—"}</Td>
                    <Td><Badge variant="neutral">{s.source_type}</Badge></Td>
                    <Td>{shortDate(s.event_date)}</Td>
                    <Td>
                      {s.chunk_count > 0 ? (
                        <span className="flex items-center gap-1 text-up"><Mic size={12} /> {s.chunk_count}</span>
                      ) : (
                        <span className="text-surface-600">—</span>
                      )}
                    </Td>
                    <Td><StatusDot ok={s.has_features > 0} /></Td>
                    <Td><StatusDot ok={s.has_predictions > 0} /></Td>
                    <Td><StatusDot ok={s.has_stock_data > 0} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {diagData && (
        <Card className="mt-6">
          <CardHeader><CardTitle>Data Health</CardTitle></CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <HealthMetric label="Pending STT" value={diagData.sources_pending_stt} ok={diagData.sources_pending_stt === 0} />
            <HealthMetric label="Pending Features" value={diagData.sources_pending_features} ok={diagData.sources_pending_features === 0} />
            <HealthMetric label="Pending Predictions" value={diagData.features_pending_predictions} ok={diagData.features_pending_predictions === 0} />
            <HealthMetric label="Pending Outcomes" value={diagData.predictions_pending_outcomes} ok={false} />
            <HealthMetric label="Missing Return Est." value={diagData.predictions_missing_return_estimate} ok={diagData.predictions_missing_return_estimate === 0} />
            <HealthMetric label="Total Predictions" value={diagData.total_predictions} ok={true} />
            <HealthMetric label="Model Age" value={diagData.model_age_days != null ? `${diagData.model_age_days}d` : "—"} ok={diagData.model_age_days != null && diagData.model_age_days < 14} />
          </div>
        </Card>
      )}
    </>
  );
}

function HealthMetric({ label, value, ok }: { label: string; value: any; ok: boolean }) {
  return (
    <div className="rounded-lg bg-surface-800/50 p-3">
      <p className="text-[10px] text-surface-500 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${ok ? "text-surface-200" : "text-amber-400"}`}>{value}</p>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 size={14} className="text-up" /> : <Clock size={14} className="text-surface-600" />;
}

function JobCard({ job, onRun }: { job: SchedulerJob; onRun: (name: string) => void }) {
  const isRunning = job.status === "running";
  const hasError = job.status === "error";

  return (
    <Card className={`relative overflow-hidden ${isRunning ? "border-brand-500/30" : hasError ? "border-red-500/20" : ""}`}>
      {isRunning && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-brand-500/50">
          <div className="h-full w-1/3 bg-brand-400 animate-[slide_1.5s_ease-in-out_infinite]" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-surface-100 capitalize">{job.name.replace(/_/g, " ")}</span>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="text-[11px] text-surface-500 leading-snug">{job.description}</p>
        </div>
        <button
          onClick={() => onRun(job.name)}
          disabled={isRunning}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all flex-shrink-0 ${
            isRunning ? "bg-brand-500/10 text-brand-400 cursor-not-allowed" : "bg-surface-700 text-surface-300 hover:bg-surface-600 hover:text-surface-100"
          }`}
        >
          {isRunning ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          {isRunning ? "Running..." : "Run Now"}
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-surface-500">
        <span className="flex items-center gap-1"><RefreshCw size={9} /> every {job.interval_hours}h</span>
        {job.last_run && <span className="flex items-center gap-1"><Clock size={9} /> {fmtDateTime(job.last_run)}</span>}
        {job.last_duration_sec != null && <span className="flex items-center gap-1"><Timer size={9} /> {fmtDuration(job.last_duration_sec)}</span>}
        {job.next_run_in_sec != null && !isRunning && <span className="flex items-center gap-1 text-surface-600">next in {fmtCountdown(job.next_run_in_sec)}</span>}
        {job.run_count > 0 && <span className="text-surface-600">{job.run_count} runs{job.error_count > 0 ? ` · ${job.error_count} errors` : ""}</span>}
      </div>
      {hasError && job.last_error && (
        <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5">
          <p className="text-[11px] text-red-400 font-mono break-all">{job.last_error}</p>
        </div>
      )}
      {job.status === "completed" && job.last_result && (
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(job.last_result).slice(0, 4).map(([k, v]) => (
            <span key={k} className="rounded bg-surface-800 px-2 py-0.5 text-[10px] text-surface-400">
              {k}: <span className="text-surface-300 font-mono">{String(v)}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function LiveEventRow({ event }: { event: SSEEvent }) {
  const icon = EVENT_ICONS[event.type] || <Radio size={14} className="text-surface-500" />;
  const color = eventColor(event.type);
  const details = event.details || {};
  const detailKeys = Object.keys(details).filter((k) => details[k] != null);

  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-surface-800/30 px-3 py-2 hover:bg-surface-800/50 transition-colors">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${color}`}>{event.message}</p>
        {detailKeys.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-2">
            {detailKeys.slice(0, 4).map((k) => (
              <span key={k} className="text-[10px] text-surface-500">
                {k}: <span className="text-surface-400 font-mono">{String(details[k])}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="text-[10px] text-surface-600 whitespace-nowrap flex-shrink-0">{fmtTime(event.timestamp)}</span>
    </div>
  );
}

function HistoricalRow({ event }: { event: ActivityEvent }) {
  const icon = EVENT_ICONS[event.event_type] || <Radio size={14} className="text-surface-500" />;
  const color = eventColor(event.event_type);

  return (
    <div className="flex items-start gap-2.5 rounded-lg px-3 py-2 hover:bg-surface-800/30 transition-colors">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0"><p className={`text-xs ${color}`}>{event.message}</p></div>
      <span className="text-[10px] text-surface-600 whitespace-nowrap flex-shrink-0">{fmtDateTime(event.created_at)}</span>
    </div>
  );
}
