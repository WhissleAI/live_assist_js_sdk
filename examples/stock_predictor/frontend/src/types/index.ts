export interface Prediction {
  id: number;
  source_id: number;
  ticker: string;
  prediction_date: string;
  direction: number;
  confidence: number;
  predicted_return_1d: number | null;
  predicted_return_5d: number | null;
  predicted_return_20d: number | null;
  model_version: string;
  features_json: string | null;
  created_at: string;
  company_name: string | null;
  source_event_date: string | null;
  return_1d: number | null;
  return_5d: number | null;
  return_20d: number | null;
  close_price: number | null;
  open_price: number | null;
  actual_direction: number | null;
  actual_direction_label: string | null;
  was_correct: boolean | null;
}

export interface PredictionDetail extends Prediction {
  src_ticker: string;
  source_type: string;
  duration_sec: number | null;
  abnormal_1d: number | null;
  abnormal_5d: number | null;
  abnormal_20d: number | null;
  high_price: number | null;
  low_price: number | null;
  volume: number | null;
  vix_at_event: number | null;
  vol_pre: number | null;
  vol_post: number | null;
  features_parsed: Record<string, number> | null;
  feature_categories: Record<string, Record<string, number>>;
}

export interface DashboardData {
  total_sources: number;
  total_chunks: number;
  total_predictions: number;
  total_features: number;
  accuracy_rate: number | null;
  evaluated_predictions: number;
  high_confidence_accuracy: number | null;
  high_confidence_count: number;
  model_loaded: boolean;
  model_version: string | null;
  latest_model: ModelRun | null;
  recent_predictions: Prediction[];
}

export interface ModelRun {
  id: number;
  run_date: string;
  model_version: string;
  train_samples: number;
  test_samples: number;
  accuracy: number;
  auc_roc: number;
  sharpe_ratio: number;
  feature_importance_json: string | null;
  feature_importance?: Record<string, number>;
  params_json: string | null;
  params?: Record<string, unknown>;
  created_at: string;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  category: string;
}

export interface Source {
  id: number;
  source_type: string;
  ticker: string;
  company_name: string | null;
  event_date: string;
  audio_url: string | null;
  local_path: string | null;
  duration_sec: number | null;
  metadata_json: string | null;
  created_at: string;
  chunk_count: number;
  has_features: number;
  has_predictions: number;
  has_stock_data: number;
}

export interface EmotionTimelinePoint {
  chunk_idx: number;
  start_sec: number;
  end_sec: number;
  emotion: string;
  emotion_probs_parsed: Record<string, number> | null;
  transcript: string;
}

export interface PaginatedResponse<T> {
  predictions: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ActivityEvent {
  id: number;
  event_type: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface SSEEvent {
  type: string;
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface SchedulerStatus {
  scheduler_active: boolean;
  running: boolean;
  current_jobs: string[];
  current_job: string | null;
  jobs: SchedulerJob[];
}

export interface SchedulerJob {
  name: string;
  description: string;
  interval_hours: number;
  status: "idle" | "running" | "completed" | "error";
  last_run: string | null;
  last_duration_sec: number | null;
  last_result: Record<string, unknown> | null;
  last_error: string | null;
  run_count: number;
  error_count: number;
  next_run_in_sec: number | null;
}

export interface SourceBreakdown {
  prediction_id: number;
  source_id: number;
  source_type: string;
  event_date: string;
  direction: number;
  confidence: number;
  weight: number;
  freshness: number;
  company_name: string;
}

export interface VoteSummary {
  buy: number;
  sell: number;
  buy_weight: number;
  sell_weight: number;
}

export interface Conviction {
  ticker: string;
  company_name: string;
  direction: number;
  action: "BUY" | "SELL";
  confidence: number;
  freshness: number;
  source_count: number;
  vote_summary: VoteSummary;
  latest_source_id: number | null;
  latest_event_date: string | null;
  freshest_source_date: string | null;
  oldest_source_date: string | null;
  current_price: number | null;
  price_updated_at: string | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward: number | null;
  position_shares: number;
  expected_return_pct: number;
  confidence_tier: "high" | "moderate" | "low";
  signal_strength: number;
  quality: "strong" | "actionable" | "weak";
  explanation: string;
  source_breakdown: SourceBreakdown[];
  source_breakdown_json?: string;
}

export interface ConvictionsResponse {
  convictions: Conviction[];
  total: number;
  portfolio_value: number;
}

export interface MarketPrice {
  ticker: string;
  price: number;
  day_high: number;
  day_low: number;
  volume: number | null;
  market_cap: number | null;
  name: string;
}
