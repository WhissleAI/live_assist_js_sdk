# Whissle Stock Predictor

Stock direction prediction powered by **Whissle STT voice metadata analysis**. Extracts emotion, demographics, intent, and cross-modal divergence features from earnings call audio — signals that text-only models completely miss — and combines them with transcript NLP and market context to predict stock price movements.

## What Makes This Different

Traditional quantitative models analyze text transcripts or price data. This system analyzes **how executives sound** — not just what they say. When a CEO says "we're very confident" but their voice carries fear, that vocal-textual divergence is a powerful bearish signal.

The Whissle STT pipeline produces per-chunk probabilities for:
- **Emotion** — HAP, SAD, ANG, FEA, DIS, SUR, NEU
- **Demographics** — age bracket and gender distributions
- **Intent** — QUESTION, STATEMENT, COMMAND, OPINION

These metadata streams become features that capture deception signals, emotional arcs, speaker dynamics, and quarter-over-quarter tone shifts — all unavailable to text-only approaches.

## Architecture

```
Audio Sources (YouTube, uploads, APIs)
        │
        ▼
┌─────────────────────┐
│   Audio Ingestion    │  Earnings calls, CEO interviews,
│   (yt-dlp / upload)  │  congressional testimony, Fed speeches
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   Whissle STT       │  Chunk-level emotion, age, gender,
│   (api.whissle.ai)  │  intent probabilities + transcript
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Feature Engineering │  7 extractors → 60+ raw features
│  + Feature Selection │  Mutual information → top ~13
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   XGBoost Model      │  Direction classifier + magnitude regressor
│   (k-fold / walk-fwd)│  with adaptive regularization
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   Conviction Engine  │  Per-ticker aggregation, time-decay,
│   + Risk Management  │  ATR stops, position sizing
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   React Dashboard    │  Real-time signals, model performance,
│   (Vite + Tailwind)  │  pipeline monitoring, track record
└─────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- A [Whissle API](https://api.whissle.ai) auth token

### Installation

```bash
cd stock_predictor

# Python dependencies
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
npm run build
cd ..
```

### Configuration

Create a `.env` file in the `stock_predictor/` directory:

```env
WHISSLE_AUTH_TOKEN=your_token_here

# Optional overrides
API_PORT=8900
XGB_N_ESTIMATORS=300
XGB_MAX_DEPTH=6
XGB_LEARNING_RATE=0.05
WALK_FORWARD_MIN_TRAIN=200
```

### Running

```bash
# Start the full application (API + frontend + scheduler)
python -m stock_predictor serve

# Open http://localhost:8900
```

The scheduler starts automatically and handles:
- Discovering and ingesting new audio sources
- Processing STT, extracting features, generating predictions
- Retraining models weekly
- Refreshing convictions every 30 minutes

## CLI Commands

```bash
# Full batch pipeline
python -m stock_predictor batch --tickers AAPL,MSFT,GOOG

# Individual pipeline steps
python -m stock_predictor stt              # Process pending audio through Whissle STT
python -m stock_predictor features         # Extract features for pending sources
python -m stock_predictor stock-data       # Fetch stock data for all sources
python -m stock_predictor train            # Train direction model
python -m stock_predictor train-all        # Train all horizons (1d, 5d, 20d)
python -m stock_predictor predict --source-id 42
python -m stock_predictor daily            # Daily prediction pipeline

# Real earnings pipeline (YouTube → STT → predict)
python -m stock_predictor real --max-calls 50

# Utilities
python -m stock_predictor stats            # Pipeline statistics
python -m stock_predictor register --dir ./audio_files
```

## Project Structure

```
stock_predictor/
├── config.py               # Central settings (env + defaults)
├── main.py                 # Typer CLI entry point
│
├── api/
│   ├── server.py           # FastAPI app — 40+ REST endpoints + SSE
│   └── events.py           # Server-Sent Events bus for live updates
│
├── data/
│   ├── storage.py          # SQLite ORM — all tables and queries
│   ├── stock_data.py       # yfinance integration — prices, returns, ATR, VIX
│   └── earnings.py         # Audio downloader (YouTube/yt-dlp, URLs, uploads)
│
├── features/
│   ├── pipeline.py         # Orchestrator — combines all extractors
│   ├── emotion.py          # Voice emotion distributions, arcs, entropy, fear spikes
│   ├── demographics.py     # Speaker age/gender profiles, composition shifts
│   ├── text.py             # Transcript NLP — sentiment, hedging, financial terms
│   ├── divergence.py       # Voice-text divergence — deception, nervous optimism
│   ├── intent.py           # Speaker intent — question ratio, transitions
│   ├── cross_call.py       # Quarter-over-quarter tone comparison
│   └── market_context.py   # Price action, volume, VIX regime at event time
│
├── models/
│   ├── trainer.py          # XGBoost training — feature selection, k-fold CV,
│   │                       #   walk-forward validation, metadata impact ablation
│   └── predictor.py        # Model loading, inference, confidence calibration
│
├── signals/
│   ├── conviction.py       # Per-ticker conviction aggregation with time decay
│   ├── generator.py        # Prediction → trade signal conversion
│   ├── risk.py             # ATR-based stops, take-profits, position sizing
│   └── explainer.py        # Human-readable signal explanations
│
├── pipeline/
│   ├── batch.py            # Full batch orchestrator
│   ├── daily.py            # Daily incremental pipeline
│   ├── real_earnings.py    # Real YouTube → STT → predict pipeline
│   └── backtest.py         # Historical backtesting
│
├── scheduler/
│   ├── runner.py           # Thread-based scheduler with per-job state
│   ├── jobs.py             # Job definitions — SSE progress publishing
│   └── earnings_calendar.py # Yahoo Finance earnings calendar integration
│
├── stt/
│   └── processor.py        # Whissle ASR — batch processing + chunk storage
│
└── frontend/               # React SPA (Vite + TypeScript + Tailwind)
    └── src/
        ├── pages/          # 10 pages — Dashboard, Signals, Model, Pipeline, etc.
        ├── components/     # Charts (Recharts), layout, and UI components
        ├── api/client.ts   # Typed API client
        ├── hooks/          # useSSE for real-time updates
        └── types/          # TypeScript interfaces
```

## Feature Categories

| Category | Source | Features | Description |
|----------|--------|----------|-------------|
| **Voice Emotion** | Whissle STT | 21 | Per-chunk emotion probabilities, polarity, entropy, temporal dynamics, fear spikes, transition rates |
| **Voice-Text Divergence** | Whissle STT + NLP | 10 | Cross-modal alignment — detects deception (positive words + fearful voice), nervous optimism, confident pessimism |
| **Speaker Demographics** | Whissle STT | 8 | Age/gender distributions, speaker composition shifts (CEO vs analyst segments) |
| **Speaker Intent** | Whissle STT | 4 | Question/statement classification — measures analyst skepticism and defensive behavior |
| **Cross-Call** | Whissle STT | 9 | Quarter-over-quarter comparison — tone drift, fear trajectory, confidence changes |
| **Transcript NLP** | TextBlob | 13 | Sentiment, hedging density, confidence language, financial terms, lexical diversity |
| **Market Context** | yfinance | 7 | Price range, volume profile, pre/post volatility, VIX regime |

With only ~100 training samples, mutual information feature selection automatically narrows ~70 raw features down to the ~13 most predictive ones.

## Model Training

The training pipeline adapts to dataset size:

| Dataset Size | Strategy | Regularization |
|-------------|----------|----------------|
| < 150 samples | Stratified k-fold CV (3-5 folds) | Aggressive: depth=3, alpha=1.0, lambda=3.0 |
| 150-500 samples | Stratified k-fold CV (5 folds) | Moderate: depth=4, alpha=0.5, lambda=2.0 |
| 500+ samples | Walk-forward expanding window | Standard: depth=6, alpha=0.1, lambda=1.0 |

Each training run also produces a **metadata impact ablation** — comparing accuracy of:
- All features combined
- Audio metadata only (emotion + divergence + demographics + intent + cross-call)
- Text only
- Without audio

This quantifies the Whissle metadata advantage and is displayed on the Model page.

## Conviction Engine

Raw predictions are aggregated into **one conviction per ticker**:

1. **Time-weighted voting** — recent predictions carry exponentially more weight
2. **Live price integration** — entry, stop, and target update with current market data
3. **ATR-based risk management** — dynamic stop-losses and take-profits scaled by volatility
4. **Quality scoring** — Strong / Actionable / Weak based on R:R ratio, freshness, and confidence
5. **Position sizing** — Kelly-criterion-inspired sizing based on portfolio value and risk

## Scheduler Jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| `discover_and_ingest` | 4h | Find and download new audio from earnings calendars + watchlist |
| `process_pending` | 1h | Run STT → features → predictions for new sources |
| `update_outcomes` | 6h | Fetch actual stock returns for past predictions |
| `regenerate_signals` | 2h | Rebuild trade signals from latest predictions |
| `refresh_convictions` | 30m | Update convictions with live market prices |
| `retrain_model` | 168h | Weekly model retrain with validation gate |
| `reextract_features` | 336h | Re-run feature extractors on all sources (picks up new extractors) |

## API Endpoints

### Core Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Overview stats |
| GET | `/api/predictions` | Paginated predictions list |
| GET | `/api/predictions/{id}` | Full prediction detail with features |
| GET | `/api/sources` | Audio sources with processing status |
| GET | `/api/sources/{id}` | Source detail with chunks, features, stock data |
| GET | `/api/sources/{id}/emotion-timeline` | Per-chunk emotion data for visualization |

### Signals & Convictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/convictions` | Per-ticker conviction signals with risk levels |
| GET | `/api/convictions/{ticker}` | Single ticker conviction detail |
| GET | `/api/signals/today` | Today's raw trade signals |
| GET | `/api/track-record` | Historical accuracy and performance |
| GET | `/api/market/price/{ticker}` | Live stock price |

### Model
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/model/info` | Latest model metadata |
| GET | `/api/model/history` | All training runs |
| GET | `/api/model/feature-importance` | Ranked features with categories |
| GET | `/api/model/metadata-impact` | Audio vs text ablation analysis |

### Pipeline Control
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pipeline/train` | Trigger model retrain |
| POST | `/api/pipeline/daily` | Trigger daily pipeline |
| POST | `/api/pipeline/analyze` | Analyze a specific ticker or YouTube URL |
| POST | `/api/predict/{source_id}` | Predict for a specific source |
| GET | `/api/diagnostics` | Pipeline health metrics |

### Scheduler
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scheduler/status` | Job statuses, run counts, next run times |
| POST | `/api/scheduler/start` | Start the scheduler |
| POST | `/api/scheduler/stop` | Graceful shutdown |
| POST | `/api/scheduler/run/{job}` | Run a specific job immediately |

### Real-time
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | SSE stream for live pipeline updates |
| GET | `/api/activity` | Recent activity log |

## Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Overview cards, top convictions, onboarding |
| Signals | `/signals` | Per-ticker conviction cards with risk levels, filters, copy-to-clipboard |
| Watchlist | `/watchlist` | Manage tracked tickers, upcoming/recent earnings |
| Track Record | `/track-record` | Historical accuracy by source type, tier, and period |
| Predictions | `/predictions` | Full prediction log with pagination |
| Prediction Detail | `/predictions/:id` | Feature breakdown, emotion radar, confidence gauge |
| Analyze | `/analyze` | Submit a ticker or YouTube URL for on-demand analysis |
| Pipeline | `/pipeline` | Source processing status, scheduler controls, data health |
| Model | `/model` | Performance metrics, audio metadata impact, feature importance |
| Settings | `/settings` | Configuration and system info |

## Tech Stack

**Backend**
- Python 3.12+ with FastAPI + Uvicorn
- XGBoost for ML (direction classifier + magnitude regressor)
- scikit-learn for preprocessing and feature selection
- yfinance for market data
- TextBlob for transcript NLP
- SQLite for storage
- SSE (sse-starlette) for real-time updates

**Frontend**
- React 18 + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Recharts for data visualization
- Lucide React for icons
- React Router for navigation

**External Services**
- [Whissle ASR API](https://api.whissle.ai) for speech-to-text with emotion/demographics/intent metadata
- Yahoo Finance (via yfinance) for stock data and earnings calendars
- yt-dlp for YouTube audio download

## Database Schema

The SQLite database (`store/stock_predictor.db`) contains:

| Table | Purpose |
|-------|---------|
| `audio_sources` | Registered audio files with ticker, date, type, metadata |
| `stt_chunks` | Per-chunk STT results with transcript + emotion/age/gender/intent probs |
| `stock_records` | Price data, returns (1d/5d/20d), abnormal returns, VIX, volume |
| `feature_vectors` | Extracted feature JSON per source |
| `model_runs` | Training history with accuracy, AUC, Sharpe, feature importance |
| `predictions` | Model predictions with direction, confidence, predicted returns |
| `trade_signals` | Generated trade signals with risk parameters |
| `ticker_convictions` | Aggregated per-ticker convictions |
| `activity_log` | Pipeline event log |
| `watchlist` | User-tracked tickers |
| `source_types_config` | Configurable audio source types and search parameters |

## License

Internal — Whissle proprietary.
