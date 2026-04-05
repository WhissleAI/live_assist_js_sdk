import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Filter } from "lucide-react";
import { api } from "@/api/client";
import { useApi } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Th, Td } from "@/components/ui/Table";
import { PageLoader } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { pct, pctSigned, shortDate } from "@/utils/format";
import type { Prediction } from "@/types";

const PAGE_SIZE = 25;

export default function Predictions() {
  const navigate = useNavigate();
  const [ticker, setTicker] = useState("");
  const [page, setPage] = useState(0);

  const { data, loading, error } = useApi(
    () => api.predictions({ ticker: ticker || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [ticker, page],
  );
  const { data: tickerList } = useApi(() => api.tickers(), []);

  const preds: Prediction[] = data?.predictions || [];
  const total: number = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const wins = preds.filter((p) => p.was_correct === true).length;
  const losses = preds.filter((p) => p.was_correct === false).length;
  const evaluated = wins + losses;

  return (
    <>
      <PageHeader title="Predictions" description={`${total} total predictions`} />

      {/* Filters */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-surface-400" />
            <select
              value={ticker}
              onChange={(e) => { setTicker(e.target.value); setPage(0); }}
              className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-1.5 text-xs text-surface-200 focus:border-brand-500 focus:outline-none"
            >
              <option value="">All Tickers</option>
              {(tickerList?.tickers || []).map((t: string) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {evaluated > 0 && (
            <div className="ml-auto flex items-center gap-3 text-xs">
              <span className="text-surface-400">
                Page Win Rate: <span className="font-semibold text-surface-200">{pct(wins / evaluated)}</span>
              </span>
              <Badge variant="correct">{wins}W</Badge>
              <Badge variant="wrong">{losses}L</Badge>
            </div>
          )}
        </div>
      </Card>

      {error ? (
        <p className="text-red-400 p-4">Error: {error}</p>
      ) : loading ? (
        <PageLoader />
      ) : preds.length === 0 ? (
        <EmptyState title="No predictions yet" description="Run the pipeline or analyze an earnings call to generate predictions." />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <Table>
              <thead>
                <tr className="border-b border-surface-800">
                  <Th>Ticker</Th>
                  <Th>Date</Th>
                  <Th>Direction</Th>
                  <Th>Confidence</Th>
                  <Th>P(Up)</Th>
                  <Th>P(Down)</Th>
                  <Th>Actual Return</Th>
                  <Th>Result</Th>
                  <Th>Model</Th>
                </tr>
              </thead>
              <tbody>
                {preds.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/predictions/${p.id}`)}
                    className="cursor-pointer border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors"
                  >
                    <Td className="font-semibold">{p.ticker}</Td>
                    <Td>{shortDate(p.prediction_date)}</Td>
                    <Td>
                      <Badge variant={p.direction === 1 ? "up" : "down"}>
                        {p.direction === 1 ? (
                          <><ArrowUpRight size={12} /> UP</>
                        ) : (
                          <><ArrowDownRight size={12} /> DOWN</>
                        )}
                      </Badge>
                    </Td>
                    <Td className="font-mono">{pct(p.confidence)}</Td>
                    <Td className="font-mono text-up">{p.direction === 1 ? pct(p.confidence) : pct(1 - p.confidence)}</Td>
                    <Td className="font-mono text-down">{p.direction === 0 ? pct(p.confidence) : pct(1 - p.confidence)}</Td>
                    <Td className="font-mono">
                      {p.return_1d != null ? (
                        <span className={p.return_1d >= 0 ? "text-up" : "text-down"}>
                          {pctSigned(p.return_1d)}
                        </span>
                      ) : "—"}
                    </Td>
                    <Td>
                      {p.was_correct === true && <Badge variant="correct">Correct</Badge>}
                      {p.was_correct === false && <Badge variant="wrong">Wrong</Badge>}
                      {p.was_correct == null && <Badge variant="pending">Pending</Badge>}
                    </Td>
                    <Td className="font-mono text-xs text-surface-500">{p.model_version?.slice(0, 12) || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-surface-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="rounded-lg bg-surface-800 px-3 py-1.5 text-xs font-medium text-surface-300 hover:bg-surface-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg bg-surface-800 px-3 py-1.5 text-xs font-medium text-surface-300 hover:bg-surface-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
