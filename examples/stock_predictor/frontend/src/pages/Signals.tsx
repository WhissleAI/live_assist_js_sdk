import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Target,
  TrendingUp,
  Zap,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  FileText,
  Copy,
  Check,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { PageLoader } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { pct, shortDate } from "@/utils/format";
import type { Conviction, ConvictionsResponse, SourceBreakdown } from "@/types";

type SortKey = "conviction" | "freshness" | "ticker" | "expected_return";
type DirectionFilter = "all" | "buy" | "sell";
type FreshnessFilter = "all" | "fresh" | "aging" | "stale";
type TierFilter = "all" | "high" | "moderate" | "low";
type QualityFilter = "all" | "strong" | "actionable" | "weak";

function FreshnessDot({ freshness }: { freshness: number }) {
  const color = freshness >= 0.8 ? "bg-emerald-400" : freshness >= 0.4 ? "bg-yellow-400" : "bg-surface-500";
  const label = freshness >= 0.8 ? "Fresh" : freshness >= 0.4 ? "Aging" : "Stale";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[10px] text-surface-500">{label}</span>
    </span>
  );
}

function SourceTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    earnings_call: "Earnings",
    guidance_call: "Guidance",
    ceo_interview: "CEO Interview",
    cfo_conference: "CFO Conference",
    analyst_call: "Analyst Day",
    fed_speech: "Fed Speech",
    ecb_speech: "ECB Speech",
    boj_speech: "BOJ Speech",
    boe_speech: "BOE Speech",
    congressional_testimony: "Congress",
    ipo_roadshow: "IPO",
  };
  return <span className="text-[10px] bg-surface-800 rounded px-1.5 py-0.5 text-surface-400">{labels[type] || type}</span>;
}

function VoteBar({ buy, sell }: { buy: number; sell: number }) {
  const total = buy + sell;
  if (total === 0) return null;
  const buyPct = (buy / total) * 100;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-up font-medium">{buy}B</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-700 overflow-hidden min-w-[60px]">
        <div className="h-full rounded-full bg-up" style={{ width: `${buyPct}%` }} />
      </div>
      <span className="text-down font-medium">{sell}S</span>
    </div>
  );
}

function RiskRewardBar({ rr }: { rr: number | null }) {
  if (rr == null || rr === 0) return <span className="text-xs text-surface-500">R:R —</span>;
  const rewardPct = Math.min((rr / (1 + rr)) * 100, 100);
  const isWeak = rr < 1.0;
  return (
    <div className="flex items-center gap-1.5">
      {isWeak && <AlertTriangle size={10} className="text-amber-400" />}
      <span className={`text-xs font-mono ${isWeak ? "text-amber-400" : "text-surface-200"}`}>
        {rr}:1
      </span>
      <div className="w-16 h-1.5 rounded-full bg-down/40 overflow-hidden">
        <div className="h-full rounded-full bg-up" style={{ width: `${rewardPct}%` }} />
      </div>
    </div>
  );
}

function QualityBadge({ quality }: { quality: string }) {
  const styles: Record<string, string> = {
    strong: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    actionable: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    weak: "bg-surface-700/50 text-surface-500 border-surface-700",
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide ${styles[quality] || styles.weak}`}>
      {quality}
    </span>
  );
}

function timeAgo(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Signals() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightTicker = searchParams.get("ticker");
  const [portfolio, setPortfolio] = useState(10000);
  const [sortBy, setSortBy] = useState<SortKey>("conviction");
  const [dirFilter, setDirFilter] = useState<DirectionFilter>("all");
  const [freshnessFilter, setFreshnessFilter] = useState<FreshnessFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");

  const { data, loading } = useApi<ConvictionsResponse>(
    () => api.convictions(portfolio),
    [portfolio],
  );

  const filtered = useMemo(() => {
    let list = data?.convictions ?? [];
    if (dirFilter !== "all") list = list.filter((c) => (dirFilter === "buy" ? c.direction === 1 : c.direction === 0));
    if (freshnessFilter === "fresh") list = list.filter((c) => c.freshness >= 0.8);
    else if (freshnessFilter === "aging") list = list.filter((c) => c.freshness >= 0.4 && c.freshness < 0.8);
    else if (freshnessFilter === "stale") list = list.filter((c) => c.freshness < 0.4);
    if (tierFilter !== "all") list = list.filter((c) => c.confidence_tier === tierFilter);
    if (qualityFilter !== "all") list = list.filter((c) => c.quality === qualityFilter);

    const sorted = [...list];
    switch (sortBy) {
      case "freshness": sorted.sort((a, b) => b.freshness - a.freshness); break;
      case "ticker": sorted.sort((a, b) => a.ticker.localeCompare(b.ticker)); break;
      case "expected_return": sorted.sort((a, b) => Math.abs(b.expected_return_pct) - Math.abs(a.expected_return_pct)); break;
      default: sorted.sort((a, b) => b.signal_strength - a.signal_strength);
    }

    if (highlightTicker) {
      const idx = sorted.findIndex(c => c.ticker === highlightTicker);
      if (idx > 0) {
        const [item] = sorted.splice(idx, 1);
        sorted.unshift(item);
      }
    }
    return sorted;
  }, [data, dirFilter, freshnessFilter, tierFilter, qualityFilter, sortBy, highlightTicker]);

  if (loading) return <PageLoader />;

  const all = data?.convictions ?? [];
  if (all.length === 0) {
    return (
      <>
        <PageHeader title="Signals" />
        <EmptyState
          icon={<Zap size={48} />}
          title="No conviction signals yet"
          description="Signals are generated once predictions exist. Start the pipeline to process audio sources."
        />
      </>
    );
  }

  const highCount = all.filter((c) => c.confidence_tier === "high").length;
  const freshCount = all.filter((c) => c.freshness >= 0.8).length;
  const strongCount = all.filter((c) => c.quality === "strong").length;

  return (
    <>
      <PageHeader
        title="Signals"
        description={`${all.length} ticker${all.length !== 1 ? "s" : ""} — one conviction per ticker, based on all analyzed sources`}
        action={
          <div className="flex items-center gap-2">
            <label className="text-xs text-surface-400">Portfolio $</label>
            <input
              type="number"
              value={portfolio}
              onChange={(e) => setPortfolio(Number(e.target.value) || 10000)}
              className="w-28 rounded-lg border border-surface-700 bg-surface-800 px-3 py-1.5 text-xs text-surface-200 focus:border-brand-500 focus:outline-none"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <StatCard label="High Confidence" value={highCount} sub="85%+ confidence" icon={<Zap size={20} className="text-up" />} />
        <StatCard label="Fresh Signals" value={freshCount} sub="Source within ~20 days" icon={<TrendingUp size={20} className="text-emerald-400" />} />
        <StatCard label="Total Tickers" value={all.length} icon={<Target size={20} />} />
        <StatCard label="Strong Signals" value={strongCount} sub="R:R ≥ 1.5 + fresh" icon={<Shield size={20} className="text-emerald-400" />} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-surface-800 bg-surface-900/50 px-4 py-3">
        <SlidersHorizontal size={14} className="text-surface-500" />
        <FilterSelect label="Sort" value={sortBy} onChange={(v) => setSortBy(v as SortKey)}
          options={[["conviction", "Conviction"], ["freshness", "Freshness"], ["ticker", "Ticker"], ["expected_return", "Expected Return"]]} />
        <FilterSelect label="Direction" value={dirFilter} onChange={(v) => setDirFilter(v as DirectionFilter)}
          options={[["all", "All"], ["buy", "Buy"], ["sell", "Sell"]]} />
        <FilterSelect label="Freshness" value={freshnessFilter} onChange={(v) => setFreshnessFilter(v as FreshnessFilter)}
          options={[["all", "All"], ["fresh", "Fresh"], ["aging", "Aging"], ["stale", "Stale"]]} />
        <FilterSelect label="Tier" value={tierFilter} onChange={(v) => setTierFilter(v as TierFilter)}
          options={[["all", "All"], ["high", "High"], ["moderate", "Moderate"], ["low", "Low"]]} />
        <FilterSelect label="Quality" value={qualityFilter} onChange={(v) => setQualityFilter(v as QualityFilter)}
          options={[["all", "All"], ["strong", "Strong"], ["actionable", "Actionable"], ["weak", "Weak"]]} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((c) => (
          <ConvictionCard
            key={c.ticker}
            conviction={c}
            navigate={navigate}
            highlighted={c.ticker === highlightTicker}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-surface-500 text-center py-8">No signals match the current filters.</p>
      )}
    </>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-surface-500 uppercase">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs text-surface-300 focus:border-brand-500 focus:outline-none"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function ConvictionCard({ conviction: c, navigate, highlighted }: { conviction: Conviction; navigate: any; highlighted?: boolean }) {
  const [expanded, setExpanded] = useState(highlighted ?? false);
  const [copied, setCopied] = useState(false);
  const isBuy = c.direction === 1;

  const sources = c.source_breakdown || [];
  const typeGroups = sources.reduce<Record<string, number>>((acc, s) => {
    acc[s.source_type] = (acc[s.source_type] || 0) + 1;
    return acc;
  }, {});
  const typeSummary = Object.entries(typeGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${t.replace(/_/g, " ")}`)
    .join(", ");

  const agingSources = sources.filter((s) => s.freshness < 0.8).length;
  const vote = c.vote_summary;

  function copyTradeOrder() {
    const stopLabel = isBuy ? "Stop Loss" : "Exit If Wrong";
    const lines = [
      `${c.action} ${c.ticker}`,
      c.entry_price ? `Entry: $${c.entry_price.toFixed(2)}` : null,
      c.take_profit ? `Target: $${c.take_profit.toFixed(2)}` : null,
      c.stop_loss ? `${stopLabel}: $${c.stop_loss.toFixed(2)}` : null,
      c.position_shares > 0 ? `Size: ${c.position_shares} shares` : null,
      `Confidence: ${pct(c.confidence)} (${c.confidence_tier})`,
      c.risk_reward ? `R:R ${c.risk_reward}:1` : null,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card className={`relative overflow-hidden ${highlighted ? "ring-1 ring-brand-500/50" : ""} ${c.quality === "weak" ? "opacity-60" : ""}`}>
      <div className={`absolute left-0 top-0 h-full w-1 ${isBuy ? "bg-up" : "bg-down"}`} />

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-surface-50">{c.ticker}</span>
            <Badge variant={isBuy ? "up" : "down"} className="text-xs px-2">
              {isBuy ? <><ArrowUpRight size={12} /> BUY</> : <><ArrowDownRight size={12} /> SELL</>}
            </Badge>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              c.confidence_tier === "high" ? "bg-up/20 text-up" :
              c.confidence_tier === "moderate" ? "bg-amber-500/20 text-amber-400" :
              "bg-surface-700 text-surface-400"
            }`}>
              {pct(c.confidence)}
            </span>
            <QualityBadge quality={c.quality} />
            <FreshnessDot freshness={c.freshness} />
          </div>
          <p className="text-[11px] text-surface-500">
            {c.company_name} · {c.source_count} source{c.source_count !== 1 ? "s" : ""} · Latest: {shortDate(c.latest_event_date)}
            {agingSources > 0 && (
              <span className="text-amber-500/80"> · {agingSources} of {sources.length} sources aging</span>
            )}
          </p>
        </div>
        <button
          onClick={copyTradeOrder}
          className="flex items-center gap-1 rounded-md bg-surface-800 px-2 py-1 text-[10px] text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-colors"
          title="Copy trade order"
        >
          {copied ? <><Check size={10} className="text-up" /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
      </div>

      {/* Vote Summary Bar */}
      {vote && (vote.buy + vote.sell) > 1 && (
        <div className="mt-2">
          <VoteBar buy={vote.buy} sell={vote.sell} />
        </div>
      )}

      {/* Price Levels */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-surface-800/50 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] text-surface-500 mb-1"><Target size={12} /> Current</div>
          <p className="text-sm font-semibold text-surface-200">
            {c.current_price != null ? `$${c.current_price.toFixed(2)}` : "—"}
          </p>
          {c.price_updated_at && (
            <p className="text-[9px] text-surface-600 flex items-center gap-0.5 mt-0.5">
              <Clock size={8} /> {timeAgo(c.price_updated_at)}
            </p>
          )}
        </div>
        <PriceLevel
          label={isBuy ? "Target" : "Profit Target"}
          value={c.take_profit != null ? `$${c.take_profit.toFixed(2)}` : "—"}
          sub={c.expected_return_pct != null ? `+${c.expected_return_pct.toFixed(1)}%` : undefined}
          icon={<TrendingUp size={12} />}
          color="text-up"
        />
        <PriceLevel
          label={isBuy ? "Stop Loss" : "Exit If Wrong"}
          value={c.stop_loss != null ? `$${c.stop_loss.toFixed(2)}` : "—"}
          sub={c.stop_loss != null && c.entry_price != null
            ? `${isBuy ? "" : "+"}$${Math.abs(c.stop_loss - c.entry_price).toFixed(2)} risk`
            : undefined}
          icon={<Shield size={12} />}
          color="text-down"
        />
      </div>

      {/* Risk/Reward & Position */}
      <div className="mt-3 flex items-center justify-between border-t border-surface-800 pt-3">
        <div className="flex gap-4 text-xs items-center">
          <RiskRewardBar rr={c.risk_reward} />
          {c.position_shares > 0 && (
            <span className="text-surface-400">
              Size <span className="font-mono text-surface-200">{c.position_shares} shares</span>
            </span>
          )}
          <span className="text-surface-500 truncate max-w-[200px]">{typeSummary}</span>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-surface-500 hover:text-surface-300">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded: Source Breakdown + Explanation */}
      {expanded && (
        <div className="mt-3 border-t border-surface-800 pt-3 space-y-3">
          {c.explanation && (
            <div className="rounded-lg bg-surface-800/50 p-3">
              <p className="text-xs text-surface-300 leading-relaxed whitespace-pre-wrap">
                {c.explanation.replace(/\*\*/g, "")}
              </p>
            </div>
          )}

          {c.freshest_source_date && c.oldest_source_date && (
            <div className="text-[10px] text-surface-500">
              Sources from {shortDate(c.oldest_source_date)} to {shortDate(c.freshest_source_date)}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
              <FileText size={12} /> Source Breakdown
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {sources.map((s: SourceBreakdown, i: number) => (
                <div key={i} className="flex items-center justify-between rounded bg-surface-800/40 px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <SourceTypeLabel type={s.source_type} />
                    <span className="text-xs text-surface-300 truncate">{shortDate(s.event_date)}</span>
                    <FreshnessDot freshness={s.freshness} />
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant={s.direction === 1 ? "up" : "down"} className="text-[10px] px-1.5">
                      {s.direction === 1 ? "UP" : "DOWN"}
                    </Badge>
                    <span className="text-[10px] font-mono text-surface-400">{pct(s.confidence)}</span>
                    <span className="text-[10px] font-mono text-surface-500">w:{s.weight.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {sources[0]?.prediction_id && (
            <button
              onClick={() => navigate(`/predictions/${sources[0].prediction_id}`)}
              className="w-full rounded-lg bg-surface-800 px-3 py-2 text-xs font-medium text-surface-300 hover:bg-surface-700"
            >
              View Latest Prediction Detail
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function PriceLevel({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string; icon: any; color: string;
}) {
  return (
    <div className="rounded-lg bg-surface-800/50 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] text-surface-500 mb-1">{icon} {label}</div>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-surface-500">{sub}</p>}
    </div>
  );
}
