const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  dashboard: () => request<any>("/dashboard"),
  health: () => request<any>("/health"),

  predictions: (params?: {
    ticker?: string;
    limit?: number;
    offset?: number;
    sort_by?: string;
    sort_dir?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.ticker) sp.set("ticker", params.ticker);
    if (params?.limit) sp.set("limit", String(params.limit));
    if (params?.offset) sp.set("offset", String(params.offset));
    if (params?.sort_by) sp.set("sort_by", params.sort_by);
    if (params?.sort_dir) sp.set("sort_dir", params.sort_dir);
    const qs = sp.toString();
    return request<any>(`/predictions${qs ? `?${qs}` : ""}`);
  },

  predictionDetail: (id: number) => request<any>(`/predictions/${id}`),

  features: (sourceId: number) => request<any>(`/features/${sourceId}`),
  featureBreakdown: (sourceId: number) => request<any>(`/features/${sourceId}/breakdown`),

  sources: (limit = 100) => request<any>(`/sources?limit=${limit}`),
  source: (id: number) => request<any>(`/sources/${id}`),
  emotionTimeline: (sourceId: number) => request<any>(`/sources/${sourceId}/emotion-timeline`),

  modelInfo: () => request<any>("/model/info"),
  modelHistory: () => request<any>("/model/history"),
  featureImportance: () => request<any>("/model/feature-importance"),
  metadataImpact: () => request<any>("/model/metadata-impact"),

  tickers: () => request<any>("/tickers"),

  triggerTrain: () => request<any>("/pipeline/train", { method: "POST" }),
  triggerDaily: () => request<any>("/pipeline/daily", { method: "POST" }),

  analyze: (ticker: string, youtubeUrl?: string) => {
    const form = new FormData();
    form.set("ticker", ticker);
    if (youtubeUrl) form.set("youtube_url", youtubeUrl);
    return fetch(`${BASE}/pipeline/analyze`, { method: "POST", body: form }).then(
      async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      }
    );
  },

  predictSource: (sourceId: number) =>
    request<any>(`/predict/${sourceId}`, { method: "POST" }),

  todaysSignals: (portfolioValue = 10000) =>
    request<any>(`/signals/today?portfolio_value=${portfolioValue}`),

  signal: (predictionId: number, portfolioValue = 10000) =>
    request<any>(`/signals/${predictionId}?portfolio_value=${portfolioValue}`),

  trackRecord: () => request<any>("/track-record"),

  upcomingEarnings: (days = 14) => request<any>(`/calendar/upcoming?days=${days}`),
  recentEarnings: (days = 7) => request<any>(`/calendar/recent?days=${days}`),

  watchlist: () => request<any>("/watchlist"),
  addWatchlist: (ticker: string) =>
    request<any>(`/watchlist/${ticker}`, { method: "POST" }),
  removeWatchlist: (ticker: string) =>
    request<any>(`/watchlist/${ticker}`, { method: "DELETE" }),

  schedulerStatus: () => request<any>("/scheduler/status"),
  schedulerStart: () => request<any>("/scheduler/start", { method: "POST" }),
  schedulerStop: () => request<any>("/scheduler/stop", { method: "POST" }),
  schedulerRunJob: (name: string) =>
    request<any>(`/scheduler/run/${name}`, { method: "POST" }),

  activityLog: (limit = 100) => request<any>(`/activity?limit=${limit}`),
  recentEvents: () => request<any>("/events/recent"),

  convictions: (portfolioValue = 10000, minFreshness = 0) =>
    request<any>(`/convictions?portfolio_value=${portfolioValue}&min_freshness=${minFreshness}`),
  convictionDetail: (ticker: string, portfolioValue = 10000) =>
    request<any>(`/convictions/${ticker}?portfolio_value=${portfolioValue}`),
  marketPrice: (ticker: string) => request<any>(`/market/price/${ticker}`),
  diagnostics: () => request<any>("/diagnostics"),
};
