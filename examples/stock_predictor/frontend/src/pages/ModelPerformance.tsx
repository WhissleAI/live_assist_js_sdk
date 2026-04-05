import { Loader2, RefreshCw, Mic, FileText, TrendingUp, Brain, Zap, BarChart3, ArrowRight } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { PageLoader } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccuracyLine } from "@/components/charts/AccuracyLine";
import { FeatureImportanceBar } from "@/components/charts/FeatureImportanceBar";
import { CategoryPie } from "@/components/charts/CategoryPie";
import { pct, num, shortDate } from "@/utils/format";
import { CATEGORY_COLORS } from "@/utils/colors";
import type { ModelRun, FeatureImportance } from "@/types";

const CATEGORY_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  emotion: {
    label: "Voice Emotion",
    description: "Real-time emotion probabilities (HAP, SAD, ANG, FEA, DIS, SUR, NEU) from Whissle STT — captures speaker confidence, stress, and emotional arcs that text alone cannot detect.",
    icon: "🎭",
  },
  divergence: {
    label: "Voice-Text Divergence",
    description: "The gap between what speakers say (positive words) and how they sound (fearful voice). This cross-modal signal detects deception, nervous optimism, and confident pessimism.",
    icon: "⚡",
  },
  demographics: {
    label: "Speaker Profile",
    description: "Age and gender probability distributions per audio chunk — tracks speaker composition shifts (e.g. CEO vs analyst segments) and diversity patterns during calls.",
    icon: "👥",
  },
  intent: {
    label: "Speaker Intent",
    description: "Classifies each audio segment as Question, Statement, Command, or Opinion — measures analyst skepticism, defensive behavior, and conversational dynamics.",
    icon: "🎯",
  },
  cross_call: {
    label: "Quarter-over-Quarter",
    description: "Compares this call's emotional and textual signature with previous calls for the same ticker — detects tone drift, increasing fear, and confidence trajectory shifts.",
    icon: "📊",
  },
  text: {
    label: "Transcript NLP",
    description: "Sentiment, hedging language, confidence words, financial terminology, question density, and lexical diversity extracted from spoken transcripts.",
    icon: "📝",
  },
  market_context: {
    label: "Market Context",
    description: "Price action, volume profile, VIX regime, and pre/post-event volatility at the time of the audio event — provides market backdrop for the prediction.",
    icon: "📈",
  },
  other: {
    label: "Other",
    description: "Metadata features like chunk count and data availability indicators.",
    icon: "📦",
  },
};

function ImpactBar({ label, value, maxValue, color }: {
  label: string; value: number; maxValue: number; color: string;
}) {
  const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-surface-400 w-24 text-right truncate">{label}</span>
      <div className="flex-1 h-5 rounded bg-surface-800 overflow-hidden">
        <div
          className="h-full rounded transition-all duration-500"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono text-surface-300 w-12 text-right">{value.toFixed(1)}%</span>
    </div>
  );
}

export default function ModelPerformance() {
  const { data: histData, loading: histLoading, refetch: refetchHist } = useApi(
    () => api.modelHistory(),
    [],
  );
  const { data: featData, loading: featLoading } = useApi(
    () => api.featureImportance(),
    [],
  );
  const { data: impactData, loading: impactLoading } = useApi(
    () => api.metadataImpact(),
    [],
  );
  const [training, setTraining] = useState(false);
  const [retrainError, setRetrainError] = useState<string | null>(null);

  const runs: ModelRun[] = histData?.runs || [];
  const features: FeatureImportance[] = featData?.features || [];
  const latest = runs.length > 0 ? runs[runs.length - 1] : null;

  async function handleRetrain() {
    setTraining(true);
    setRetrainError(null);
    try {
      await api.triggerTrain();
      refetchHist();
    } catch (e: any) {
      setRetrainError(e.message);
    } finally {
      setTraining(false);
    }
  }

  if (histLoading || featLoading || impactLoading) return <PageLoader />;

  if (runs.length === 0) {
    return (
      <>
        <PageHeader title="Model Performance" />
        <EmptyState
          title="No models trained yet"
          description="Run the pipeline to train your first model."
          action={
            <button
              onClick={handleRetrain}
              disabled={training}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {training ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Train Model
            </button>
          }
        />
      </>
    );
  }

  const impact = impactData?.metadata_impact;
  const catImportance = impactData?.category_importance || {};
  const audioShare = impactData?.audio_share_pct ?? 0;
  const maxCatPct = Math.max(...Object.values(catImportance as Record<string, number>), 1);

  const audioCats = new Set(["emotion", "divergence", "demographics", "intent", "cross_call"]);
  const audioFeatures = features.filter(f => audioCats.has(f.category));
  const topAudioInTopN = features.slice(0, 10).filter(f => audioCats.has(f.category)).length;

  return (
    <>
      <PageHeader
        title="Model Performance"
        description={`${runs.length} training run${runs.length !== 1 ? "s" : ""} · ${impactData?.n_features ?? "—"} features selected`}
        action={
          <button
            onClick={handleRetrain}
            disabled={training}
            className="flex items-center gap-1.5 rounded-lg bg-surface-800 px-4 py-2 text-xs font-semibold text-surface-300 hover:bg-surface-700 disabled:opacity-50"
          >
            {training ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Retrain
          </button>
        }
      />

      {retrainError && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          Retrain failed: {retrainError}
        </div>
      )}

      {/* How It Works */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain size={16} className="text-brand-400" />
            How Whissle Audio Intelligence Works
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StepCard
              step={1}
              icon={<Mic size={18} className="text-amber-400" />}
              title="Audio Ingestion"
              desc="Earnings calls, CEO interviews, congressional testimony are discovered and downloaded automatically."
            />
            <StepCard
              step={2}
              icon={<Zap size={18} className="text-emerald-400" />}
              title="Whissle STT Analysis"
              desc="Each audio chunk gets real-time emotion, age, gender, and intent probabilities — metadata that text transcripts don't capture."
            />
            <StepCard
              step={3}
              icon={<BarChart3 size={18} className="text-blue-400" />}
              title="Feature Engineering"
              desc="Voice-text divergence, emotional arcs, speaker dynamics, cross-call shifts, and market context are computed as features."
            />
            <StepCard
              step={4}
              icon={<TrendingUp size={18} className="text-purple-400" />}
              title="ML Prediction"
              desc="XGBoost model with feature selection and k-fold validation predicts stock direction with confidence scoring."
            />
          </div>
        </div>
      </Card>

      {/* Latest Model Stats */}
      {latest && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
          <StatCard label="Accuracy" value={pct(latest.accuracy)} trend={latest.accuracy > 0.55 ? "up" : "neutral"} />
          <StatCard label="AUC-ROC" value={num(latest.auc_roc, 4)} />
          <StatCard label="Sharpe Ratio" value={num(latest.sharpe_ratio, 2)} trend={latest.sharpe_ratio > 0 ? "up" : "down"} />
          <StatCard label="Train Samples" value={latest.train_samples} />
          <StatCard label="Last Trained" value={shortDate(latest.run_date)} />
        </div>
      )}

      {/* Metadata Impact — the key differentiator section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic size={16} className="text-amber-400" />
            Audio Metadata Impact — The Whissle Differentiator
          </CardTitle>
          <p className="mt-1 text-xs text-surface-500">
            Traditional models only analyze text. Whissle adds voice emotion, speaker dynamics, and cross-modal divergence —
            signals invisible to text-only approaches.
          </p>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ablation Results */}
            <div>
              <h4 className="text-xs font-semibold text-surface-300 mb-3 uppercase tracking-wide">
                Ablation Analysis
              </h4>
              {impact ? (
                <div className="space-y-3">
                  <AblationRow
                    label="All Features"
                    accuracy={impact.all?.accuracy}
                    features={impact.all?.n_features}
                    highlight
                  />
                  <AblationRow
                    label="Audio Metadata Only"
                    accuracy={impact.audio_metadata?.accuracy}
                    features={impact.audio_metadata?.n_features}
                    color="text-amber-400"
                  />
                  <AblationRow
                    label="Text Only"
                    accuracy={impact.text_only?.accuracy}
                    features={impact.text_only?.n_features}
                    color="text-blue-400"
                  />
                  <AblationRow
                    label="Without Audio"
                    accuracy={impact.no_audio?.accuracy}
                    features={impact.no_audio?.n_features}
                    color="text-surface-500"
                  />
                  {impact.audio_lift != null && (
                    <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
                      impact.audio_lift > 0
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}>
                      {impact.audio_lift > 0
                        ? `Audio metadata adds +${(impact.audio_lift * 100).toFixed(1)}% accuracy over non-audio features`
                        : "Audio metadata signal needs more data to show lift — expected with <200 samples"}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-surface-500">Retrain to generate ablation analysis.</p>
              )}
            </div>

            {/* Category Importance Breakdown */}
            <div>
              <h4 className="text-xs font-semibold text-surface-300 mb-3 uppercase tracking-wide">
                Feature Category Importance
              </h4>
              <div className="space-y-2">
                {Object.entries(catImportance).map(([cat, pctVal]) => (
                  <ImpactBar
                    key={cat}
                    label={CATEGORY_LABELS[cat]?.label || cat}
                    value={pctVal as number}
                    maxValue={maxCatPct}
                    color={CATEGORY_COLORS[cat] || "#6b7280"}
                  />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                  <p className="text-[10px] text-amber-400/80 uppercase">Audio Metadata</p>
                  <p className="text-lg font-bold text-amber-400">{audioShare}%</p>
                  <p className="text-[10px] text-surface-500">{topAudioInTopN} of top 10 features</p>
                </div>
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
                  <p className="text-[10px] text-blue-400/80 uppercase">Text + Market</p>
                  <p className="text-lg font-bold text-blue-400">{(100 - audioShare).toFixed(1)}%</p>
                  <p className="text-[10px] text-surface-500">{10 - topAudioInTopN} of top 10 features</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Category Deep Dive */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={16} className="text-blue-400" />
            What Each Feature Category Measures
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(CATEGORY_LABELS)
              .filter(([cat]) => catImportance[cat] != null || features.some(f => f.category === cat))
              .map(([cat, info]) => {
                const share = catImportance[cat] ?? 0;
                const isAudio = audioCats.has(cat);
                return (
                  <div
                    key={cat}
                    className={`rounded-lg border px-4 py-3 ${
                      isAudio
                        ? "border-amber-500/20 bg-amber-500/5"
                        : "border-surface-800 bg-surface-900/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{info.icon}</span>
                      <span className="text-xs font-semibold text-surface-200">{info.label}</span>
                      {isAudio && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium uppercase">
                          Audio
                        </span>
                      )}
                      <span className="ml-auto text-[10px] font-mono text-surface-500">
                        {(share as number).toFixed(1)}% importance
                      </span>
                    </div>
                    <p className="text-[11px] text-surface-500 leading-relaxed">{info.description}</p>
                  </div>
                );
              })}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {runs.length > 1 && (
          <Card>
            <CardHeader><CardTitle>Performance Over Time</CardTitle></CardHeader>
            <AccuracyLine runs={runs} />
          </Card>
        )}

        {features.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Feature Category Breakdown</CardTitle></CardHeader>
            <CategoryPie features={features} />
          </Card>
        )}
      </div>

      {/* Feature Importance Chart */}
      {features.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Feature Importance (Top 20)</CardTitle>
            <p className="mt-1 text-xs text-surface-500">
              Colors indicate feature source: <InlineLegend />
            </p>
          </CardHeader>
          <FeatureImportanceBar features={features} maxItems={20} height={500} />
        </Card>
      )}

      {/* Training History */}
      <Card className="mt-6">
        <CardHeader><CardTitle>Training History</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-800">
                <th className="px-4 py-2 text-left text-xs text-surface-400">Date</th>
                <th className="px-4 py-2 text-left text-xs text-surface-400">Model</th>
                <th className="px-4 py-2 text-left text-xs text-surface-400">Samples</th>
                <th className="px-4 py-2 text-left text-xs text-surface-400">Accuracy</th>
                <th className="px-4 py-2 text-left text-xs text-surface-400">AUC</th>
                <th className="px-4 py-2 text-left text-xs text-surface-400">Sharpe</th>
              </tr>
            </thead>
            <tbody>
              {[...runs].reverse().map((r) => (
                <tr key={r.id} className="border-b border-surface-800/50">
                  <td className="px-4 py-2 text-surface-300">{shortDate(r.run_date)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-surface-500">{r.model_version?.slice(0, 16)}</td>
                  <td className="px-4 py-2 text-surface-300">{r.train_samples}</td>
                  <td className="px-4 py-2 font-mono text-surface-200">{pct(r.accuracy)}</td>
                  <td className="px-4 py-2 font-mono text-surface-200">{num(r.auc_roc, 4)}</td>
                  <td className="px-4 py-2 font-mono text-surface-200">{num(r.sharpe_ratio, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function StepCard({ step, icon, title, desc }: {
  step: number; icon: React.ReactNode; title: string; desc: string;
}) {
  return (
    <div className="relative rounded-lg border border-surface-800 bg-surface-900/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-bold text-brand-400">
          {step}
        </span>
        {icon}
        <span className="text-xs font-semibold text-surface-200">{title}</span>
      </div>
      <p className="text-[11px] text-surface-500 leading-relaxed">{desc}</p>
      {step < 4 && (
        <ArrowRight size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-700 hidden md:block" />
      )}
    </div>
  );
}

function AblationRow({ label, accuracy, features, highlight, color }: {
  label: string; accuracy?: number; features?: number; highlight?: boolean; color?: string;
}) {
  if (accuracy == null) return null;
  const accPct = (accuracy * 100).toFixed(1);
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
      highlight ? "bg-brand-500/10 border border-brand-500/20" : "bg-surface-800/50"
    }`}>
      <div>
        <span className={`text-xs font-medium ${color || "text-surface-200"}`}>{label}</span>
        {features != null && (
          <span className="text-[10px] text-surface-600 ml-2">({features} features)</span>
        )}
      </div>
      <span className={`text-sm font-mono font-bold ${highlight ? "text-brand-400" : color || "text-surface-300"}`}>
        {accPct}%
      </span>
    </div>
  );
}

function InlineLegend() {
  const items = [
    { label: "Emotion", color: CATEGORY_COLORS.emotion },
    { label: "Divergence", color: CATEGORY_COLORS.divergence },
    { label: "Demographics", color: CATEGORY_COLORS.demographics },
    { label: "Intent", color: CATEGORY_COLORS.intent },
    { label: "Cross-Call", color: CATEGORY_COLORS.cross_call },
    { label: "Text", color: CATEGORY_COLORS.text },
    { label: "Market", color: CATEGORY_COLORS.market_context },
  ];
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full inline-block" style={{ backgroundColor: i.color }} />
          <span className="text-[10px] text-surface-400">{i.label}</span>
        </span>
      ))}
    </span>
  );
}
