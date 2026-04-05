import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X, Eye, Calendar, ArrowUpRight, ArrowDownRight, Zap, Clock } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/AppShell";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { pct, shortDate } from "@/utils/format";
import type { Conviction, ConvictionsResponse } from "@/types";

function FreshnessDot({ freshness }: { freshness: number }) {
  const color = freshness >= 0.8 ? "bg-emerald-400" : freshness >= 0.4 ? "bg-yellow-400" : "bg-surface-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export default function Watchlist() {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApi(() => api.watchlist(), []);
  const { data: calData, loading: calLoading } = useApi(() => api.upcomingEarnings(14), []);
  const { data: convData } = useApi<ConvictionsResponse>(() => api.convictions(), []);
  const [newTicker, setNewTicker] = useState("");
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const watchlist = data?.watchlist || [];
  const upcoming = calData?.events || calData?.earnings || [];
  const convictions = convData?.convictions ?? [];

  const convictionMap = useMemo(() => {
    const map: Record<string, Conviction> = {};
    for (const c of convictions) map[c.ticker] = c;
    return map;
  }, [convictions]);

  async function handleAdd() {
    if (!newTicker.trim()) return;
    setAdding(true);
    setActionError(null);
    try {
      await api.addWatchlist(newTicker.trim().toUpperCase());
      setNewTicker("");
      refetch();
    } catch (e: any) {
      setActionError(`Failed to add: ${e.message}`);
    }
    setAdding(false);
  }

  async function handleRemove(ticker: string) {
    setActionError(null);
    try {
      await api.removeWatchlist(ticker);
      refetch();
    } catch (e: any) {
      setActionError(`Failed to remove ${ticker}: ${e.message}`);
    }
  }

  if (loading) return <PageLoader />;
  if (error) return <p className="text-red-400 p-6">Error: {error}</p>;

  const watchedTickers = new Set(watchlist.map((w: any) => w.ticker));

  return (
    <>
      <PageHeader title="Watchlist" description="Track tickers and see conviction signals" />

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {actionError}
        </div>
      )}

      <Card className="mb-6 max-w-lg">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Add ticker (e.g. AAPL)"
            className="flex-1 rounded-lg border border-surface-700 bg-surface-800 px-4 py-2 text-sm text-surface-100 placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newTicker.trim()}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Watchlist with conviction badges */}
        <Card>
          <CardHeader><CardTitle>Your Watchlist ({watchlist.length})</CardTitle></CardHeader>
          {watchlist.length === 0 ? (
            <p className="text-sm text-surface-500">Add tickers to track their earnings and conviction signals.</p>
          ) : (
            <div className="space-y-2">
              {watchlist.map((w: any) => {
                const conv = convictionMap[w.ticker];
                const nextEarnings = upcoming.find((e: any) => e.ticker === w.ticker);
                return (
                  <div
                    key={w.ticker}
                    className="flex items-center justify-between rounded-lg bg-surface-800/50 px-4 py-3 hover:bg-surface-800 transition-colors cursor-pointer"
                    onClick={() => conv && navigate("/signals")}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-sm font-bold text-surface-100">{w.ticker}</span>

                      {conv && (
                        <div className="flex items-center gap-1.5">
                          <Badge variant={conv.direction === 1 ? "up" : "down"} className="text-[10px] px-1.5">
                            {conv.direction === 1 ? <><ArrowUpRight size={10} /> BUY</> : <><ArrowDownRight size={10} /> SELL</>}
                          </Badge>
                          <span className="text-[10px] font-mono text-surface-400">{pct(conv.confidence)}</span>
                          <FreshnessDot freshness={conv.freshness} />
                        </div>
                      )}

                      {!conv && (
                        <span className="text-[10px] text-surface-600">No signal</span>
                      )}

                      {nextEarnings && (
                        <Badge variant="info" className="text-[10px]">
                          <Calendar size={10} /> {shortDate(nextEarnings.date)}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {conv && (
                        <span className="text-xs text-surface-500">
                          {conv.source_count} src · {shortDate(conv.latest_event_date)}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemove(w.ticker); }}
                        className="text-surface-600 hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Upcoming Earnings */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar size={16} /> Upcoming Earnings</CardTitle></CardHeader>
          {calLoading ? (
            <p className="text-sm text-surface-500 py-4 text-center">Loading earnings calendar...</p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-surface-500">No upcoming earnings found in the next 14 days.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {upcoming.slice(0, 20).map((e: any, i: number) => {
                const days = Math.ceil(
                  (new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <div
                    key={`${e.ticker}-${i}`}
                    className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                      watchedTickers.has(e.ticker) ? "bg-brand-600/10 border border-brand-600/20" : "bg-surface-800/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-surface-100">{e.ticker}</span>
                      {watchedTickers.has(e.ticker) && <Eye size={12} className="text-brand-400" />}
                      {convictionMap[e.ticker] && (
                        <Badge variant={convictionMap[e.ticker].direction === 1 ? "up" : "down"} className="text-[10px] px-1.5">
                          {convictionMap[e.ticker].direction === 1 ? "BUY" : "SELL"} {pct(convictionMap[e.ticker].confidence)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-surface-400">
                          <Clock size={10} />
                          {days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
                        </div>
                      </div>
                      {!watchedTickers.has(e.ticker) && (
                        <button
                          onClick={() => api.addWatchlist(e.ticker).then(refetch).catch(() => {})}
                          className="text-[10px] text-brand-400 hover:text-brand-300"
                        >
                          + Watch
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
