import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, ArrowUpRight, ArrowDownRight, Zap } from "lucide-react";
import { api } from "@/api/client";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceGauge } from "@/components/charts/ConfidenceGauge";
import { pct } from "@/utils/format";

export default function Analyze() {
  const navigate = useNavigate();
  const [ticker, setTicker] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!ticker.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.analyze(ticker.trim(), youtubeUrl.trim() || undefined);
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const pred = result?.prediction;

  return (
    <>
      <PageHeader
        title="Analyze Earnings Call"
        description="Enter a ticker and optional YouTube URL to analyze an earnings call"
      />

      <Card className="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-surface-400">Ticker Symbol</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-surface-400">YouTube URL (optional)</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-surface-500">
              If empty, we'll auto-search YouTube for "{ticker} earnings call"
            </p>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={running || !ticker.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {running ? (
              <><Loader2 size={16} className="animate-spin" /> Analyzing…</>
            ) : (
              <><Zap size={16} /> Analyze</>
            )}
          </button>
        </div>
      </Card>

      {error && (
        <Card className="mt-6 max-w-2xl border-red-900/50">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {result && !pred && (
        <Card className="mt-6 max-w-2xl">
          <p className="text-sm text-surface-300">
            Status: <Badge variant="info">{result.status}</Badge>
          </p>
          {result.message && <p className="mt-2 text-xs text-surface-500">{result.message}</p>}
          {result.features_count && (
            <p className="mt-1 text-xs text-surface-500">{result.features_count} features extracted</p>
          )}
        </Card>
      )}

      {pred && (
        <Card className="mt-6 max-w-2xl">
          <CardHeader><CardTitle>Prediction Result</CardTitle></CardHeader>
          <div className="flex items-center gap-8">
            <ConfidenceGauge
              value={pred.confidence}
              direction={pred.direction_label}
              size={150}
            />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-400">Ticker:</span>
                <span className="font-semibold text-surface-100">{pred.ticker}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-400">Direction:</span>
                <Badge variant={pred.direction === 1 ? "up" : "down"} className="text-sm px-3 py-1">
                  {pred.direction === 1 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {pred.direction_label}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-400">Confidence:</span>
                <span className="font-mono text-surface-200">{pct(pred.confidence)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-400">Model:</span>
                <span className="font-mono text-xs text-surface-500">{pred.model_version}</span>
              </div>
            </div>
          </div>

          {pred.top_features && pred.top_features.length > 0 && (
            <div className="mt-4 border-t border-surface-800 pt-4">
              <h4 className="mb-2 text-xs font-semibold text-surface-400 uppercase">Key Drivers</h4>
              <div className="space-y-1.5">
                {pred.top_features.map((f: any) => (
                  <div key={f.feature} className="flex items-center justify-between text-xs">
                    <span className="text-surface-300">{f.feature.replace(/_/g, " ")}</span>
                    <span className="font-mono text-surface-500">{typeof f.value === "number" ? f.value.toFixed(4) : String(f.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => navigate(`/predictions`)}
            className="mt-4 w-full rounded-lg bg-surface-800 px-3 py-2 text-xs font-medium text-surface-300 hover:bg-surface-700"
          >
            View All Predictions
          </button>
        </Card>
      )}
    </>
  );
}
