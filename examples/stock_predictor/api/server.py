"""
FastAPI server with /api prefix for JSON endpoints and static SPA serving.
"""

import asyncio
import json
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

from ..config import settings
from ..data.storage import Storage
from ..data.earnings import EarningsDownloader
from ..data.stock_data import StockDataFetcher
from ..stt.processor import BatchSTTProcessor
from ..features.pipeline import FeaturePipeline
from ..models.predictor import StockPredictor
from ..models.trainer import ModelTrainer
from ..pipeline.daily import DailyPipeline
from ..pipeline.batch import BatchPipeline
from ..signals.generator import SignalGenerator
from ..signals.conviction import ConvictionEngine
from ..scheduler.runner import SchedulerRunner
from ..scheduler.earnings_calendar import fetch_upcoming_earnings, fetch_recent_earnings
from ..scheduler.jobs import set_event_bus
from .events import event_bus

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Whissle Stock Predictor",
    description="Stock direction prediction powered by Whissle STT voice metadata analysis",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = Storage()
predictor = StockPredictor(storage)
stt_processor = BatchSTTProcessor(storage)
feature_pipeline = FeaturePipeline(storage)
trainer = ModelTrainer(storage)

_model_loaded = predictor.load_latest()
signal_gen = SignalGenerator(storage)
scheduler = SchedulerRunner(storage)

set_event_bus(event_bus)


@app.on_event("startup")
async def _auto_start_scheduler():
    event_bus.set_loop(asyncio.get_running_loop())
    scheduler.start()
    await event_bus.publish("system", "Server started — scheduler auto-started")

# ---------------------------------------------------------------------------
# API router — all JSON endpoints under /api
# ---------------------------------------------------------------------------
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": _model_loaded is not None,
        "model_version": _model_loaded,
        "total_sources": storage.count_sources(),
    }


@api.get("/dashboard")
async def dashboard():
    stats = storage.get_dashboard_stats()
    latest_model = storage.get_latest_model_run()
    recent_preds, _ = storage.get_predictions_paginated(limit=8)

    if latest_model and latest_model.get("feature_importance_json"):
        if isinstance(latest_model["feature_importance_json"], str):
            latest_model["feature_importance"] = json.loads(latest_model["feature_importance_json"])

    return {
        **stats,
        "model_loaded": _model_loaded is not None,
        "model_version": _model_loaded,
        "latest_model": latest_model,
        "recent_predictions": recent_preds,
    }


@api.get("/stats")
async def stats_endpoint():
    sources = storage.list_audio_sources()
    total_chunks = storage.count_stt_chunks()
    latest_model = storage.get_latest_model_run()
    recent_preds = storage.get_predictions(limit=10)

    return {
        "total_audio_sources": len(sources),
        "total_stt_chunks": total_chunks,
        "sources_by_type": _count_by(sources, "source_type"),
        "sources_by_ticker": _count_by(sources, "ticker"),
        "latest_model": latest_model,
        "recent_predictions": recent_preds,
    }


# ---- Predictions ----

@api.get("/predictions")
async def list_predictions(
    ticker: str = "",
    direction: int | None = None,
    limit: int = 50,
    offset: int = 0,
    sort_by: str = "prediction_date",
    sort_dir: str = "DESC",
):
    preds, total = storage.get_predictions_paginated(
        ticker=ticker or None,
        direction=direction,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return {"predictions": preds, "total": total, "limit": limit, "offset": offset}


@api.get("/predictions/{prediction_id}")
async def get_prediction(prediction_id: int):
    pred = storage.get_prediction_detail(prediction_id)
    if not pred:
        raise HTTPException(404, "Prediction not found")

    feature_cats: dict[str, dict[str, float]] = {}
    raw_feats = pred.get("features_parsed") or {}
    for key, val in raw_feats.items():
        if not isinstance(val, (int, float)):
            continue
        cat = _categorize_feature(key)
        feature_cats.setdefault(cat, {})[key] = round(float(val), 4)

    pred["feature_categories"] = feature_cats
    return pred


@api.post("/predict/{source_id}")
async def predict_source(source_id: int):
    src = storage.get_audio_source(source_id)
    if not src:
        raise HTTPException(404, f"Source {source_id} not found")
    try:
        result = predictor.predict_for_source(source_id)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@api.post("/predict/audio")
async def predict_from_audio(
    audio: UploadFile = File(...),
    ticker: str = Form(...),
    event_date: str = Form(default=""),
):
    if not event_date:
        event_date = datetime.now().strftime("%Y-%m-%d")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=Path(audio.filename or "audio.wav").suffix)
    content = await audio.read()
    tmp.write(content)
    tmp.close()

    try:
        source_id = storage.insert_audio_source(
            source_type="upload",
            ticker=ticker.upper(),
            event_date=event_date,
            local_path=tmp.name,
        )
        await stt_processor.process_source(source_id, tmp.name)
        features = feature_pipeline.extract_for_source(source_id)
        if not features:
            raise HTTPException(500, "Feature extraction failed — no STT data")
        result = predictor.predict_for_source(source_id)
        result["features"] = features
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Audio prediction failed: %s", e, exc_info=True)
        raise HTTPException(500, str(e))
    finally:
        Path(tmp.name).unlink(missing_ok=True)


# ---- Features ----

@api.get("/features/{source_id}")
async def get_features(source_id: int):
    features = storage.get_features(source_id)
    if not features:
        raise HTTPException(404, "No features for this source")

    categorized: dict[str, dict[str, float]] = {}
    for key, val in features.items():
        if not isinstance(val, (int, float)):
            continue
        cat = _categorize_feature(key)
        categorized.setdefault(cat, {})[key] = round(float(val), 4)

    return {"source_id": source_id, "features": features, "categories": categorized}


@api.get("/features/{source_id}/breakdown")
async def get_feature_breakdown(source_id: int):
    features = storage.get_features(source_id)
    if not features:
        raise HTTPException(404, "No features for this source")

    categorized: dict[str, dict[str, float]] = {}
    for key, val in features.items():
        if not isinstance(val, (int, float)):
            continue
        cat = _categorize_feature(key)
        categorized.setdefault(cat, {})[key] = round(float(val), 4)

    return {"source_id": source_id, "categories": categorized, "total_features": len(features)}


# ---- Sources ----

@api.get("/sources")
async def list_sources(limit: int = 100):
    return {"sources": storage.get_sources_with_status(limit=limit)}


@api.get("/sources/{source_id}")
async def get_source(source_id: int):
    src = storage.get_audio_source(source_id)
    if not src:
        raise HTTPException(404, "Source not found")
    chunks_info = storage.get_source_chunks_summary(source_id)
    features = storage.get_features(source_id)
    stock = storage.get_stock_record(source_id)
    return {**src, "chunks": chunks_info, "features": features, "stock": stock}


@api.get("/sources/{source_id}/emotion-timeline")
async def get_emotion_timeline(source_id: int):
    timeline = storage.get_source_emotion_timeline(source_id)
    return {"source_id": source_id, "timeline": timeline}


@api.post("/source/register")
async def register_source(
    ticker: str = Form(...),
    event_date: str = Form(...),
    audio_url: str = Form(default=""),
    source_type: str = Form(default="custom"),
):
    kwargs: dict[str, Any] = {
        "source_type": source_type,
        "ticker": ticker.upper(),
        "event_date": event_date,
    }
    if audio_url:
        downloader = EarningsDownloader(storage)
        source_id = await downloader.download_from_url(audio_url, ticker, event_date)
        if source_id is None:
            raise HTTPException(500, "Failed to download audio")
        return {"source_id": source_id}

    source_id = storage.insert_audio_source(**kwargs)
    return {"source_id": source_id}


# ---- Model ----

@api.get("/model/info")
async def model_info():
    latest = storage.get_latest_model_run()
    if not latest:
        return {"message": "No model trained yet"}
    if latest.get("feature_importance_json"):
        if isinstance(latest["feature_importance_json"], str):
            latest["feature_importance"] = json.loads(latest["feature_importance_json"])
    return latest


@api.get("/model/history")
async def model_history():
    runs = storage.get_model_runs_history()
    return {"runs": runs, "total": len(runs)}


@api.get("/model/feature-importance")
async def feature_importance():
    latest = storage.get_latest_model_run()
    if not latest or not latest.get("feature_importance_json"):
        return {"features": [], "message": "No model trained yet"}

    raw = latest["feature_importance_json"]
    if isinstance(raw, str):
        raw = json.loads(raw)

    sorted_feats = sorted(raw.items(), key=lambda x: -x[1])
    categorized = []
    for name, imp in sorted_feats:
        categorized.append({
            "feature": name,
            "importance": round(imp, 4),
            "category": _categorize_feature(name),
        })
    return {"features": categorized}


@api.get("/model/metadata-impact")
async def metadata_impact():
    """Return the metadata impact analysis from the latest training run."""
    latest = storage.get_latest_model_run()
    if not latest:
        return {"message": "No model trained yet"}

    params_raw = latest.get("params_json")
    if isinstance(params_raw, str):
        params_raw = json.loads(params_raw)

    impact = (params_raw or {}).get("metadata_impact")

    feat_raw = latest.get("feature_importance_json")
    if isinstance(feat_raw, str):
        feat_raw = json.loads(feat_raw)

    audio_cats = {"emotion", "divergence", "demographics", "intent", "cross_call"}
    category_importance: dict[str, float] = {}
    if feat_raw:
        for name, imp in feat_raw.items():
            cat = _categorize_feature(name)
            category_importance[cat] = category_importance.get(cat, 0.0) + imp

    total_imp = sum(category_importance.values()) or 1.0
    audio_importance = sum(v for k, v in category_importance.items() if k in audio_cats)
    text_importance = category_importance.get("text", 0.0)
    market_importance = category_importance.get("market_context", 0.0)

    return {
        "metadata_impact": impact,
        "category_importance": {
            k: round(v / total_imp * 100, 1) for k, v in
            sorted(category_importance.items(), key=lambda x: -x[1])
        },
        "audio_share_pct": round(audio_importance / total_imp * 100, 1),
        "text_share_pct": round(text_importance / total_imp * 100, 1),
        "market_share_pct": round(market_importance / total_imp * 100, 1),
        "train_samples": latest.get("train_samples"),
        "accuracy": latest.get("accuracy"),
        "mode": (params_raw or {}).get("mode"),
        "n_features": (params_raw or {}).get("n_features"),
    }


# ---- Tickers ----

@api.get("/tickers")
async def list_tickers():
    return {"tickers": storage.get_distinct_tickers()}


# ---- Pipelines ----

@api.post("/pipeline/daily")
async def trigger_daily():
    pipeline = DailyPipeline(storage)
    result = await pipeline.run()
    return result


@api.post("/pipeline/batch")
async def trigger_batch(
    audio_dir: str = Form(default=""),
    skip_download: bool = Form(default=True),
    skip_stt: bool = Form(default=False),
    skip_train: bool = Form(default=False),
):
    pipeline = BatchPipeline(storage)
    result = await pipeline.run_full(
        audio_dir=audio_dir or None,
        skip_download=skip_download,
        skip_stt=skip_stt,
        skip_train=skip_train,
    )
    return result


@api.post("/pipeline/train")
async def trigger_train():
    try:
        results = trainer.train_all_horizons()
        return {"status": "complete", "results": results}
    except Exception as e:
        raise HTTPException(500, str(e))


@api.post("/pipeline/analyze")
async def analyze_ticker(
    ticker: str = Form(...),
    youtube_url: str = Form(default=""),
):
    """One-click: register source, run STT, extract features, predict."""
    event_date = datetime.now().strftime("%Y-%m-%d")

    source_id = storage.insert_audio_source(
        source_type="analysis",
        ticker=ticker.upper(),
        event_date=event_date,
        audio_url=youtube_url or None,
    )

    try:
        if youtube_url:
            from ..pipeline.real_earnings import RealEarningsPipeline
            rp = RealEarningsPipeline(storage)
            downloaded = rp._download_single(youtube_url, ticker, event_date)
            if not downloaded:
                raise HTTPException(500, "Failed to download audio from URL")

        pending = storage.get_unprocessed_sources()
        source_pending = [s for s in pending if s["id"] == source_id]
        if source_pending:
            await stt_processor.process_source(source_id, source_pending[0].get("local_path", ""))

        features = feature_pipeline.extract_for_source(source_id)
        if not features:
            return {"source_id": source_id, "status": "partial", "message": "STT done but features empty"}

        if _model_loaded:
            result = predictor.predict_for_source(source_id)
            return {"status": "complete", "prediction": result}

        return {"source_id": source_id, "status": "features_ready", "features_count": len(features)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Analysis failed for %s: %s", ticker, e, exc_info=True)
        raise HTTPException(500, str(e))


# ---- Signals ----

@api.get("/signals/today")
async def todays_signals(portfolio_value: float = 10_000):
    return signal_gen.get_todays_signals(portfolio_value)


@api.get("/signals/{prediction_id}")
async def get_signal(prediction_id: int, portfolio_value: float = 10_000):
    sig = signal_gen.generate_for_prediction(prediction_id, portfolio_value=portfolio_value)
    if not sig:
        raise HTTPException(404, "Signal not found")
    return sig


@api.get("/track-record")
async def track_record():
    return signal_gen.get_track_record()


# ---- Earnings Calendar ----

@api.get("/calendar/upcoming")
async def upcoming_earnings(days: int = 14):
    try:
        events = fetch_upcoming_earnings(days_ahead=days)
        return {"events": events, "days_ahead": days}
    except Exception as e:
        logger.error("Earnings calendar failed: %s", e)
        return {"events": [], "error": str(e)}


@api.get("/calendar/recent")
async def recent_earnings(days: int = 7):
    try:
        events = fetch_recent_earnings(days_back=days)
        return {"events": events, "days_back": days}
    except Exception as e:
        return {"events": [], "error": str(e)}


# ---- Watchlist ----

@api.get("/watchlist")
async def get_watchlist():
    items = storage.get_watchlist()
    return {"watchlist": items}


@api.post("/watchlist/{ticker}")
async def add_watchlist(ticker: str, notes: str = ""):
    storage.add_to_watchlist(ticker.upper(), notes)
    return {"status": "added", "ticker": ticker.upper()}


@api.delete("/watchlist/{ticker}")
async def remove_watchlist(ticker: str):
    storage.remove_from_watchlist(ticker.upper())
    return {"status": "removed", "ticker": ticker.upper()}


# ---- Convictions ----

@api.get("/convictions")
async def get_convictions(portfolio_value: float = 10000, min_freshness: float = 0.0):
    """Per-ticker conviction signals with live prices and source breakdown."""
    cached = storage.get_all_convictions(min_freshness=min_freshness)
    if cached:
        return {"convictions": cached, "total": len(cached), "portfolio_value": portfolio_value}
    engine = ConvictionEngine(storage)
    convictions = engine.compute_all(portfolio_value)
    return {"convictions": convictions, "total": len(convictions), "portfolio_value": portfolio_value}


@api.get("/convictions/{ticker}")
async def get_conviction_detail(ticker: str, portfolio_value: float = 10000):
    """Deep-dive on a single ticker conviction with full source breakdown."""
    engine = ConvictionEngine(storage)
    conv = engine.compute_for_ticker(ticker.upper(), portfolio_value)
    if not conv:
        raise HTTPException(404, f"No conviction data for {ticker}")
    return conv


@api.get("/market/price/{ticker}")
async def get_market_price(ticker: str):
    """Live price quote for a ticker."""
    fetcher = StockDataFetcher(storage)
    data = fetcher.get_current_price(ticker.upper())
    if not data:
        raise HTTPException(404, f"Could not fetch price for {ticker}")
    return {"ticker": ticker.upper(), **data}


@api.get("/diagnostics")
async def diagnostics():
    """Data pipeline health diagnostics."""
    return storage.get_diagnostics()


# ---- SSE Events & Activity ----

@api.get("/events")
async def sse_events():
    """Server-Sent Events stream — frontend subscribes for real-time progress."""
    return EventSourceResponse(event_bus.subscribe())


@api.get("/activity")
async def activity_log(limit: int = 100, event_type: str = ""):
    events = storage.get_activity_log(limit=limit, event_type=event_type or None)
    return {"events": events, "total": len(events)}


@api.get("/events/recent")
async def recent_events():
    return {"events": event_bus.recent}


# ---- Scheduler ----

@api.get("/scheduler/status")
async def scheduler_status():
    return scheduler.status


@api.post("/scheduler/start")
async def scheduler_start():
    scheduler.start()
    return {"status": "started"}


@api.post("/scheduler/stop")
async def scheduler_stop():
    scheduler.stop()
    return {"status": "stopped"}


@api.post("/scheduler/run/{job_name}")
async def scheduler_run_job(job_name: str):
    return scheduler.run_now(job_name)


# ---------------------------------------------------------------------------
# Register API router
# ---------------------------------------------------------------------------
app.include_router(api)


# ---------------------------------------------------------------------------
# SPA static file serving — must come AFTER API routes
# ---------------------------------------------------------------------------
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIR.exists() and (FRONTEND_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="static-assets")

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        file_path = FRONTEND_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIR / "index.html")
else:
    @app.get("/")
    async def root_redirect():
        return {
            "message": "Whissle Stock Predictor API",
            "docs": "/docs",
            "api": "/api/health",
            "frontend": "Run `cd frontend && npm run build` to enable the dashboard",
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EMOTION_KEYWORDS = {"emotion", "positive", "negative", "polarity", "entropy", "fear", "transition"}
_TEXT_KEYWORDS = {"sentiment", "hedging", "confidence_hedging", "financial", "question", "words", "lexical", "subjectivity"}
_DIVERGENCE_KEYWORDS = {"divergence", "deception", "nervous", "confident_bad", "vocal_text"}
_DEMOGRAPHICS_KEYWORDS = {"gender", "age", "speaker", "demographic"}
_INTENT_KEYWORDS = {"intent"}
_CROSS_CALL_KEYWORDS = {"cross_"}


def _categorize_feature(name: str) -> str:
    lower = name.lower()
    if lower.startswith("cross_"):
        return "cross_call"
    if lower.startswith("mkt_"):
        return "market_context"
    if any(kw in lower for kw in _DIVERGENCE_KEYWORDS):
        return "divergence"
    if any(kw in lower for kw in _INTENT_KEYWORDS):
        return "intent"
    if any(kw in lower for kw in _TEXT_KEYWORDS):
        return "text"
    if any(kw in lower for kw in _DEMOGRAPHICS_KEYWORDS):
        return "demographics"
    if any(kw in lower for kw in _EMOTION_KEYWORDS):
        return "emotion"
    return "other"


def _count_by(items: list[dict], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        val = item.get(key, "unknown")
        counts[val] = counts.get(val, 0) + 1
    return counts
