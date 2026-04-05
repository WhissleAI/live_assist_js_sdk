import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, CheckCircle, XCircle } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { ConfidenceGauge } from "@/components/charts/ConfidenceGauge";
import { EmotionRadar } from "@/components/charts/EmotionRadar";
import { FeatureImportanceBar } from "@/components/charts/FeatureImportanceBar";
import { pct, pctSigned, shortDate, num } from "@/utils/format";
import { CATEGORY_COLORS } from "@/utils/colors";
import type { PredictionDetail as PredictionDetailType, FeatureImportance } from "@/types";

export default function PredictionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pred, loading, error } = useApi<PredictionDetailType>(
    () => api.predictionDetail(Number(id)),
    [id],
  );

  if (loading) return <PageLoader />;
  if (error) return <p className="p-6 text-red-400">{error}</p>;
  if (!pred) return null;

  const dirLabel = pred.direction === 1 ? "UP" : "DOWN";
  const feats = pred.features_parsed || {};
  const cats = pred.feature_categories || {};

  const topFeatures: FeatureImportance[] = Object.entries(cats)
    .flatMap(([category, fmap]) =>
      Object.entries(fmap).map(([feature, importance]) => ({ feature, importance, category }))
    )
    .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
    .slice(0, 20);

  return (
    <>
      <div className="mb-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200">
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <PageHeader
        title={`${pred.ticker} — ${shortDate(pred.prediction_date)}`}
        description={pred.company_name || pred.source_type || ""}
      />

      {/* Hero row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Confidence gauge */}
        <Card className="flex flex-col items-center justify-center">
          <ConfidenceGauge value={pred.confidence} direction={dirLabel as any} size={160} />
          <Badge variant={pred.direction === 1 ? "up" : "down"} className="mt-2 text-base px-3 py-1">
            {pred.direction === 1 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            {dirLabel}
          </Badge>
        </Card>

        {/* Probabilities */}
        <Card>
          <CardHeader><CardTitle>Probabilities</CardTitle></CardHeader>
          <div className="space-y-3">
            <ProbBar label="P(UP)" value={pred.direction === 1 ? pred.confidence : 1 - pred.confidence} color="#10b981" />
            <ProbBar label="P(DOWN)" value={pred.direction === 0 ? pred.confidence : 1 - pred.confidence} color="#ef4444" />
          </div>
        </Card>

        {/* Outcome */}
        <Card>
          <CardHeader><CardTitle>Outcome</CardTitle></CardHeader>
          <div className="space-y-2 text-sm">
            <Row label="Actual 1d" value={pctSigned(pred.return_1d)} color={pred.return_1d != null ? (pred.return_1d >= 0 ? "text-up" : "text-down") : ""} />
            <Row label="Actual 5d" value={pctSigned(pred.return_5d)} color={pred.return_5d != null ? (pred.return_5d >= 0 ? "text-up" : "text-down") : ""} />
            <Row label="Actual 20d" value={pctSigned(pred.return_20d)} color={pred.return_20d != null ? (pred.return_20d >= 0 ? "text-up" : "text-down") : ""} />
            <div className="pt-2">
              {pred.was_correct === true && (
                <div className="flex items-center gap-1.5 text-up"><CheckCircle size={16} /> Prediction Correct</div>
              )}
              {pred.was_correct === false && (
                <div className="flex items-center gap-1.5 text-down"><XCircle size={16} /> Prediction Wrong</div>
              )}
              {pred.was_correct == null && (
                <Badge variant="pending">Outcome Pending</Badge>
              )}
            </div>
          </div>
        </Card>

        {/* Stock Context */}
        <Card>
          <CardHeader><CardTitle>Stock Context</CardTitle></CardHeader>
          <div className="space-y-2 text-sm">
            <Row label="Close" value={pred.close_price != null ? `$${num(pred.close_price)}` : "—"} />
            <Row label="Open" value={pred.open_price != null ? `$${num(pred.open_price)}` : "—"} />
            <Row label="Volume" value={pred.volume != null ? `${(pred.volume / 1e6).toFixed(1)}M` : "—"} />
            <Row label="VIX" value={num(pred.vix_at_event)} />
            <Row label="Vol (pre)" value={num(pred.vol_pre, 4)} />
            <Row label="Vol (post)" value={num(pred.vol_post, 4)} />
          </div>
        </Card>
      </div>

      {/* Feature breakdown */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Emotion radar */}
        {cats.emotion && Object.keys(cats.emotion).length > 0 && (
          <Card>
            <CardHeader><CardTitle>Emotion Profile</CardTitle></CardHeader>
            <EmotionRadar features={feats} />
          </Card>
        )}

        {/* Divergence signals */}
        <Card>
          <CardHeader><CardTitle>Voice-Text Divergence</CardTitle></CardHeader>
          <p className="mb-3 text-xs text-surface-500">
            Cross-modal divergence between vocal emotion and textual sentiment — the key predictive signal.
          </p>
          <div className="space-y-2">
            {Object.entries(cats.divergence || {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span className="text-surface-400">{k.replace(/_/g, " ")}</span>
                <span className="font-mono text-surface-200">{v.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Feature importance */}
      {topFeatures.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Feature Attribution (Top 20)</CardTitle>
            <div className="mt-2 flex gap-3">
              {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                <span key={cat} className="flex items-center gap-1 text-[10px] text-surface-400">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                  {cat}
                </span>
              ))}
            </div>
          </CardHeader>
          <FeatureImportanceBar features={topFeatures} maxItems={20} height={500} />
        </Card>
      )}

      {/* Raw features (collapsed) */}
      <details className="mt-6">
        <summary className="cursor-pointer text-xs text-surface-500 hover:text-surface-300">
          Raw feature vector ({Object.keys(feats).length} features)
        </summary>
        <Card className="mt-2">
          <pre className="max-h-80 overflow-auto text-[11px] text-surface-400 font-mono">
            {JSON.stringify(feats, null, 2)}
          </pre>
        </Card>
      </details>
    </>
  );
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-surface-400">{label}</span>
        <span className="font-mono" style={{ color }}>{pct(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-800">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

function Row({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-400">{label}</span>
      <span className={`font-mono ${color || "text-surface-200"}`}>{value}</span>
    </div>
  );
}
