import { useState } from "react";
import { Loader2, RefreshCw, Play, Power, PowerOff, Clock } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { num, shortDate } from "@/utils/format";
import type { DashboardData, SchedulerStatus } from "@/types";

export default function Settings() {
  const { data, loading, error, refetch } = useApi<DashboardData>(() => api.dashboard(), []);
  const { data: schedData, error: schedError, refetch: refetchSched } = useApi<SchedulerStatus>(() => api.schedulerStatus(), []);
  const [trainStatus, setTrainStatus] = useState<string | null>(null);
  const [dailyStatus, setDailyStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleTrain() {
    setTrainStatus("running");
    try {
      await api.triggerTrain();
      setTrainStatus("complete");
      refetch();
    } catch (e: any) {
      setTrainStatus(`error: ${e.message}`);
    }
  }

  async function handleDaily() {
    setDailyStatus("running");
    try {
      await api.triggerDaily();
      setDailyStatus("complete");
      refetch();
    } catch (e: any) {
      setDailyStatus(`error: ${e.message}`);
    }
  }

  async function toggleScheduler() {
    setActionError(null);
    try {
      if (schedData?.running) {
        await api.schedulerStop();
      } else {
        await api.schedulerStart();
      }
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

  if (loading) return <PageLoader />;
  if (error) return <p className="text-red-400 p-6">Error: {error}</p>;

  const schedulerRunning = schedData?.scheduler_active ?? schedData?.running ?? false;
  const schedulerJobs = schedData?.jobs ?? [];

  return (
    <>
      <PageHeader title="Settings" description="Configuration, scheduler, and pipeline controls" />

      {(actionError || schedError) && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {actionError || schedError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 max-w-3xl lg:grid-cols-2">
        {/* Database stats */}
        <Card>
          <CardHeader><CardTitle>Database</CardTitle></CardHeader>
          <div className="space-y-2 text-sm">
            <Row label="Audio Sources" value={String(data?.total_sources || 0)} />
            <Row label="STT Chunks" value={(data?.total_chunks || 0).toLocaleString()} />
            <Row label="Feature Vectors" value={String(data?.total_features || 0)} />
            <Row label="Predictions" value={String(data?.total_predictions || 0)} />
          </div>
        </Card>

        {/* Model */}
        <Card>
          <CardHeader><CardTitle>Active Model</CardTitle></CardHeader>
          <div className="space-y-2 text-sm">
            <Row label="Version" value={data?.model_version || "None"} />
            <Row label="Status" value={data?.model_loaded ? "Loaded" : "Not loaded"} />
            {data?.latest_model && (
              <>
                <Row label="Trained" value={shortDate(data.latest_model.run_date)} />
                <Row label="Samples" value={String(data.latest_model.train_samples)} />
                <Row label="AUC-ROC" value={num(data.latest_model.auc_roc, 4)} />
              </>
            )}
          </div>
        </Card>

        {/* Scheduler */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Auto Scheduler</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={schedulerRunning ? "correct" : "neutral"}>
                  {schedulerRunning ? "Active" : "Stopped"}
                </Badge>
                <button
                  onClick={toggleScheduler}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    schedulerRunning
                      ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                      : "bg-up/15 text-up hover:bg-up/25"
                  }`}
                >
                  {schedulerRunning ? <PowerOff size={12} /> : <Power size={12} />}
                  {schedulerRunning ? "Stop" : "Start"}
                </button>
              </div>
            </div>
          </CardHeader>
          <p className="mb-3 text-xs text-surface-500">
            The scheduler automatically discovers new earnings calls, downloads audio,
            processes through STT, extracts features, predicts, and generates trade signals.
          </p>
          {schedulerJobs.length > 0 && (
            <div className="space-y-1.5">
              {schedulerJobs.map((j) => (
                <div key={j.name} className="flex items-center justify-between rounded-lg bg-surface-800/50 px-3 py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Clock size={12} className="text-surface-500" />
                      <span className="text-xs font-semibold text-surface-200 capitalize">{j.name.replace(/_/g, " ")}</span>
                      {j.status === "running" && (
                        <Loader2 size={10} className="animate-spin text-brand-400" />
                      )}
                    </div>
                    {j.description && (
                      <p className="text-[10px] text-surface-500 ml-5 mt-0.5">{j.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-[11px]">
                      <span className="text-surface-500">every {j.interval_hours}h</span>
                      {j.last_run && (
                        <span className="text-surface-600 ml-2">last: {shortDate(j.last_run)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => runJob(j.name)}
                      disabled={j.status === "running"}
                      className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold bg-surface-700 text-surface-300 hover:bg-surface-600 disabled:opacity-50 transition-colors"
                    >
                      {j.status === "running" ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                      Run
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Pipeline controls */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Manual Pipeline Controls</CardTitle></CardHeader>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              label="Retrain Model"
              icon={<RefreshCw size={14} />}
              onClick={handleTrain}
              status={trainStatus}
            />
            <ActionButton
              label="Run Daily Pipeline"
              icon={<Play size={14} />}
              onClick={handleDaily}
              status={dailyStatus}
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-400">{label}</span>
      <span className="font-mono text-surface-200">{value}</span>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  status,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  status: string | null;
}) {
  const isRunning = status === "running";
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={isRunning}
        className="flex items-center gap-1.5 rounded-lg bg-surface-800 px-4 py-2.5 text-xs font-semibold text-surface-300 hover:bg-surface-700 disabled:opacity-50 transition-colors"
      >
        {isRunning ? <Loader2 size={14} className="animate-spin" /> : icon}
        {label}
      </button>
      {status && status !== "running" && (
        <span className={`text-xs ${status === "complete" ? "text-up" : "text-red-400"}`}>
          {status}
        </span>
      )}
    </div>
  );
}
