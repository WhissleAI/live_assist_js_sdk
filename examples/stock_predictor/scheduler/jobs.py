"""
Scheduled job definitions for the stock predictor pipeline.

Each function is a self-contained unit of work that the scheduler
calls periodically. They publish real-time progress via the SSE event bus.
"""

import asyncio
import json
import logging
import threading
from datetime import datetime
from typing import Any

from ..config import settings
from ..data.storage import Storage
from ..data.stock_data import StockDataFetcher
from ..stt.processor import BatchSTTProcessor
from ..features.pipeline import FeaturePipeline
from ..models.trainer import ModelTrainer
from ..models.predictor import StockPredictor
from ..signals.generator import SignalGenerator
from ..signals.conviction import ConvictionEngine
from ..pipeline.real_earnings import _search_and_download, AUDIO_DIR

logger = logging.getLogger(__name__)

_event_bus = None

# Dedicated event loop for running async code from scheduler threads.
# Created once, runs in its own daemon thread, never closed.
_async_loop: asyncio.AbstractEventLoop | None = None
_async_thread: threading.Thread | None = None


def _ensure_async_loop() -> asyncio.AbstractEventLoop:
    """Return a long-lived event loop running in a background thread."""
    global _async_loop, _async_thread
    if _async_loop is not None and _async_loop.is_running():
        return _async_loop
    _async_loop = asyncio.new_event_loop()
    _async_thread = threading.Thread(
        target=_async_loop.run_forever, daemon=True, name="async-bridge"
    )
    _async_thread.start()
    return _async_loop


def run_async(coro):
    """Run an async coroutine from sync code and block until it completes."""
    loop = _ensure_async_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result()


def set_event_bus(bus):
    global _event_bus
    _event_bus = bus


def _emit(event_type: str, message: str, details: dict | None = None, storage: Storage | None = None):
    if _event_bus:
        _event_bus.publish_sync(event_type, message, details)
    if storage:
        storage.log_activity(event_type, message, details)
    logger.info("[%s] %s", event_type, message)


# ---------------------------------------------------------------------------
# Source type configs — ticker-based (searched per watchlist ticker)
# ---------------------------------------------------------------------------

TICKER_SOURCE_TYPES: list[dict[str, Any]] = [
    {"type": "earnings_call",
     "search_template": "{ticker} {quarter} {year} earnings call",
     "enabled": True},
    {"type": "guidance_call",
     "search_template": "{ticker} {quarter} {year} guidance outlook forward",
     "enabled": True},
    {"type": "ceo_interview",
     "search_template": "{ticker} CEO interview {year}",
     "enabled": True},
    {"type": "cfo_conference",
     "search_template": "{ticker} CFO {year} investor conference presentation",
     "enabled": True},
    {"type": "analyst_call",
     "search_template": "{ticker} analyst day investor presentation {year}",
     "enabled": True},
    {"type": "ipo_roadshow",
     "search_template": "{ticker} IPO roadshow presentation {year}",
     "enabled": False},  # enable when tracking recent IPOs
]

# ---------------------------------------------------------------------------
# Source type configs — speaker-based (central banks, testimony)
# ---------------------------------------------------------------------------

CENTRAL_BANK_SOURCES: list[dict[str, Any]] = [
    {
        "type": "fed_speech",
        "institution": "Federal Reserve",
        "tickers": ["SPY", "QQQ"],
        "search_template": "{institution} {speaker} speech {year} {month}",
        "speakers": [
            "Jerome Powell", "Christopher Waller", "John Williams",
            "Michael Barr", "Michelle Bowman", "Lisa Cook",
            "Philip Jefferson", "Adriana Kugler", "Alberto Musalem",
            "Austan Goolsbee", "Beth Hammack",
        ],
        "enabled": True,
    },
    {
        "type": "ecb_speech",
        "institution": "ECB",
        "tickers": ["FXE", "EWG", "VGK"],
        "search_template": "{institution} {speaker} speech {year} {month}",
        "speakers": ["Christine Lagarde", "Luis de Guindos", "Isabel Schnabel", "Philip Lane"],
        "enabled": True,
    },
    {
        "type": "boj_speech",
        "institution": "Bank of Japan",
        "tickers": ["EWJ", "FXY"],
        "search_template": "{institution} {speaker} speech {year} {month}",
        "speakers": ["Kazuo Ueda"],
        "enabled": True,
    },
    {
        "type": "boe_speech",
        "institution": "Bank of England",
        "tickers": ["EWU", "FXB"],
        "search_template": "{institution} {speaker} speech {year} {month}",
        "speakers": ["Andrew Bailey", "Ben Broadbent"],
        "enabled": True,
    },
]

TESTIMONY_SOURCE: dict[str, Any] = {
    "type": "congressional_testimony",
    "search_template": "{speaker} {venue} testimony {year}",
    "speakers": [
        {"name": "Jamie Dimon", "ticker": "JPM", "venue": "Senate Banking"},
        {"name": "Tim Cook", "ticker": "AAPL", "venue": "Senate"},
        {"name": "Mark Zuckerberg", "ticker": "META", "venue": "Senate Commerce"},
        {"name": "Sundar Pichai", "ticker": "GOOGL", "venue": "Senate Judiciary"},
        {"name": "Sam Altman", "ticker": "MSFT", "venue": "Senate"},
        {"name": "Satya Nadella", "ticker": "MSFT", "venue": "Congress"},
        {"name": "Andy Jassy", "ticker": "AMZN", "venue": "Senate"},
        {"name": "Jensen Huang", "ticker": "NVDA", "venue": "Congress"},
    ],
    "enabled": True,
}


def _quarter_label(dt: datetime) -> str:
    q = (dt.month - 1) // 3 + 1
    return f"Q{q} {dt.year}"


# ---------------------------------------------------------------------------
# Job: discover_and_ingest
# ---------------------------------------------------------------------------

def discover_and_ingest(storage: Storage | None = None):
    storage = storage or Storage()
    _emit("ingestion_start", "Starting autonomous ingestion cycle", storage=storage)

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    total_new = 0
    total_new += _ingest_earnings(storage)
    total_new += _ingest_watchlist(storage)
    total_new += _ingest_central_bank(storage)
    total_new += _ingest_testimony(storage)

    if total_new == 0:
        _emit("ingestion_complete", "No new audio found to process", storage=storage)
        return {"new_sources": 0}

    results = _process_pipeline(storage)
    results["new_sources"] = total_new
    _emit("ingestion_complete",
          f"Ingestion done: {total_new} new sources, {results.get('predictions_made', 0)} predictions",
          details=results, storage=storage)
    return results


def _ingest_earnings(storage: Storage) -> int:
    from .earnings_calendar import fetch_recent_earnings
    try:
        recent = fetch_recent_earnings(days_back=14)
    except Exception as e:
        _emit("ingestion_error", f"Earnings calendar fetch failed: {e}", storage=storage)
        return 0

    existing_keys = {f"{s.get('ticker')}_{s.get('event_date')}" for s in storage.list_audio_sources()}
    new_count = 0

    for event in recent:
        ticker, date = event["ticker"], event["date"]
        if f"{ticker}_{date}" in existing_keys:
            continue
        quarter = _quarter_label(datetime.strptime(date, "%Y-%m-%d"))
        query = f"{ticker} {quarter} earnings call"
        safe_name = f"{ticker}_{date.replace('-', '')}.mp3"
        output_path = AUDIO_DIR / safe_name

        _emit("download_start", f"Downloading: {ticker} ({date})",
              details={"ticker": ticker, "date": date}, storage=storage)

        if _search_and_download(query, output_path):
            sid = storage.insert_audio_source(
                source_type="earnings_call", ticker=ticker,
                company_name=event.get("company", ticker), event_date=date,
                local_path=str(output_path),
                metadata_json=json.dumps({"source": "youtube", "auto_discovered": True,
                                          "eps_estimate": event.get("eps_estimate"),
                                          "eps_actual": event.get("eps_actual")}),
            )
            _emit("download_complete", f"Downloaded: {ticker} ({date})",
                  details={"source_id": sid, "ticker": ticker}, storage=storage)
            new_count += 1
        else:
            _emit("download_failed", f"Failed: {ticker} ({date})", storage=storage)
    return new_count


def _ingest_watchlist(storage: Storage) -> int:
    """Search for ticker-based source types across all watchlist tickers."""
    watchlist = storage.get_watchlist()
    if not watchlist:
        return 0
    all_sources = storage.list_audio_sources()
    # Build a map of ticker+source_type -> most recent event_date
    recent_map: dict[str, str] = {}
    for s in all_sources:
        key = f"{s.get('ticker')}_{s.get('source_type')}"
        existing_date = recent_map.get(key, "")
        event_date = s.get("event_date", "")
        if event_date > existing_date:
            recent_map[key] = event_date

    now = datetime.now()
    quarter = _quarter_label(now)
    today_str = now.strftime("%Y-%m-%d")
    new_count = 0

    # Cooldown periods per source type (days)
    cooldowns = {
        "earnings_call": 30,
        "guidance_call": 30,
        "ceo_interview": 14,
        "cfo_conference": 30,
        "analyst_call": 30,
        "ipo_roadshow": 90,
    }

    for item in watchlist:
        ticker = item["ticker"]
        for stype in TICKER_SOURCE_TYPES:
            if not stype.get("enabled"):
                continue
            key = f"{ticker}_{stype['type']}"
            last_date = recent_map.get(key)
            cooldown_days = cooldowns.get(stype["type"], 14)
            if last_date:
                try:
                    days_since = (now - datetime.strptime(last_date, "%Y-%m-%d")).days
                    if days_since < cooldown_days:
                        continue
                except (ValueError, TypeError):
                    pass

            template = stype["search_template"]
            query = template.format(ticker=ticker, quarter=quarter, year=now.year, month=now.strftime("%B"))
            safe_name = f"{ticker}_{stype['type']}_{today_str.replace('-', '')}.mp3"
            output_path = AUDIO_DIR / safe_name
            if output_path.exists() and output_path.stat().st_size > 10000:
                continue
            _emit("download_start", f"Searching {stype['type'].replace('_', ' ')}: {ticker}",
                  details={"ticker": ticker, "type": stype["type"]}, storage=storage)
            if _search_and_download(query, output_path):
                storage.insert_audio_source(
                    source_type=stype["type"], ticker=ticker, company_name=ticker,
                    event_date=today_str, local_path=str(output_path),
                    metadata_json=json.dumps({"source": "youtube", "auto_discovered": True,
                                              "source_subtype": stype["type"]}),
                )
                _emit("download_complete", f"Downloaded {stype['type'].replace('_', ' ')}: {ticker}", storage=storage)
                new_count += 1
                recent_map[key] = today_str
    return new_count


def _ingest_central_bank(storage: Storage) -> int:
    """Search for speeches from all configured central bank speakers."""
    now = datetime.now()
    month_label = now.strftime("%B")
    new_count = 0

    for bank in CENTRAL_BANK_SOURCES:
        if not bank.get("enabled"):
            continue
        institution = bank["institution"]
        for speaker in bank.get("speakers", []):
            for ticker in bank.get("tickers", ["SPY"]):
                slug = speaker.replace(" ", "")
                safe_name = f"{bank['type']}_{slug}_{now.strftime('%Y%m')}.mp3"
                output_path = AUDIO_DIR / safe_name
                if output_path.exists() and output_path.stat().st_size > 10000:
                    continue

                query = bank["search_template"].format(
                    institution=institution, speaker=speaker,
                    year=now.year, month=month_label)
                _emit("download_start", f"Searching {institution}: {speaker}",
                      details={"speaker": speaker, "institution": institution}, storage=storage)

                if _search_and_download(query, output_path):
                    storage.insert_audio_source(
                        source_type=bank["type"], ticker=ticker, company_name=speaker,
                        event_date=now.strftime("%Y-%m-%d"), local_path=str(output_path),
                        metadata_json=json.dumps({"source": "youtube", "auto_discovered": True,
                                                  "speaker": speaker, "institution": institution}),
                    )
                    _emit("download_complete", f"Downloaded {institution} speech: {speaker}",
                          details={"speaker": speaker}, storage=storage)
                    new_count += 1
                break  # one ticker per speaker per cycle
    return new_count


def _ingest_testimony(storage: Storage) -> int:
    """Search for congressional/senate testimony from major CEOs."""
    if not TESTIMONY_SOURCE.get("enabled"):
        return 0
    now = datetime.now()
    new_count = 0

    for entry in TESTIMONY_SOURCE.get("speakers", []):
        speaker = entry["name"]
        ticker = entry["ticker"]
        venue = entry["venue"]
        slug = speaker.replace(" ", "")
        safe_name = f"TESTIMONY_{slug}_{now.strftime('%Y')}.mp3"
        output_path = AUDIO_DIR / safe_name
        if output_path.exists() and output_path.stat().st_size > 10000:
            continue

        query = TESTIMONY_SOURCE["search_template"].format(
            speaker=speaker, venue=venue, year=now.year)
        _emit("download_start", f"Searching testimony: {speaker} ({venue})",
              details={"speaker": speaker, "venue": venue, "ticker": ticker}, storage=storage)

        if _search_and_download(query, output_path):
            storage.insert_audio_source(
                source_type="congressional_testimony", ticker=ticker,
                company_name=speaker, event_date=now.strftime("%Y-%m-%d"),
                local_path=str(output_path),
                metadata_json=json.dumps({"source": "youtube", "auto_discovered": True,
                                          "speaker": speaker, "venue": venue}),
            )
            _emit("download_complete", f"Downloaded testimony: {speaker}",
                  details={"speaker": speaker, "ticker": ticker}, storage=storage)
            new_count += 1
    return new_count


def _process_pipeline(storage: Storage) -> dict:
    """STT → stock data → features → predict → signals."""
    results: dict[str, Any] = {}

    # STT (async — uses the dedicated bridge loop)
    _emit("stt_start", "Processing audio through Whissle STT", storage=storage)
    stt = BatchSTTProcessor(storage)
    stt_count = run_async(stt.process_all_pending())
    results["stt_processed"] = stt_count
    _emit("stt_complete", f"STT processed {stt_count} sources", details={"count": stt_count}, storage=storage)

    # Stock data
    _emit("stock_data_start", "Fetching stock market data", storage=storage)
    StockDataFetcher(storage).fetch_and_store_for_all_sources()
    _emit("stock_data_complete", "Stock data updated", storage=storage)

    # Features
    _emit("features_start", "Extracting features", storage=storage)
    feat_count = FeaturePipeline(storage).extract_all_pending()
    results["features_extracted"] = feat_count
    _emit("features_complete", f"Extracted features for {feat_count} sources",
          details={"count": feat_count}, storage=storage)

    # Predict
    _emit("predict_start", "Generating predictions", storage=storage)
    predictor = StockPredictor(storage)
    if not predictor.load_latest():
        _emit("predict_skip", "No trained model — skipping predictions", storage=storage)
        results["predictions_made"] = 0
        return results

    predictions_made = 0
    for src in storage.list_audio_sources():
        if storage.get_predictions(source_id=src["id"]):
            continue
        if not storage.get_features(src["id"]):
            continue
        try:
            predictor.predict_for_source(src["id"])
            predictions_made += 1
        except Exception as e:
            logger.debug("Predict failed for source %d: %s", src["id"], e)
    results["predictions_made"] = predictions_made
    _emit("predict_complete", f"Generated {predictions_made} new predictions",
          details={"count": predictions_made}, storage=storage)

    # Signals
    _emit("signals_start", "Generating trade signals", storage=storage)
    signals = SignalGenerator(storage).generate_all_signals()
    results["signals_generated"] = len(signals)
    _emit("signals_complete", f"Generated {len(signals)} trade signals",
          details={"count": len(signals)}, storage=storage)
    return results


# ---------------------------------------------------------------------------
# Job: update_outcomes
# ---------------------------------------------------------------------------

def update_outcomes(storage: Storage | None = None):
    storage = storage or Storage()
    _emit("outcomes_start", "Updating prediction outcomes", storage=storage)
    fetcher = StockDataFetcher(storage)
    updated = 0
    for src in storage.list_audio_sources():
        if not src.get("ticker"):
            continue
        record = storage.get_stock_record(src["id"])
        if record and record.get("return_1d") is not None:
            continue
        try:
            fetcher.fetch_for_source(src["id"], src["ticker"], src["event_date"])
            updated += 1
        except Exception as e:
            logger.debug("Stock data refresh failed for %s: %s", src["ticker"], e)
    _emit("outcomes_complete", f"Updated outcomes for {updated} sources",
          details={"updated": updated}, storage=storage)
    return {"updated": updated}


# ---------------------------------------------------------------------------
# Job: process_pending
# ---------------------------------------------------------------------------

def process_pending(storage: Storage | None = None):
    storage = storage or Storage()
    return _process_pipeline(storage)


# ---------------------------------------------------------------------------
# Job: regenerate_signals
# ---------------------------------------------------------------------------

def regenerate_signals(storage: Storage | None = None, portfolio_value: float = 10_000):
    storage = storage or Storage()
    signals = SignalGenerator(storage).generate_all_signals(portfolio_value)
    _emit("signals_complete", f"Regenerated {len(signals)} trade signals",
          details={"count": len(signals)}, storage=storage)
    return {"count": len(signals)}


# ---------------------------------------------------------------------------
# Job: retrain_model (with validation gate)
# ---------------------------------------------------------------------------

def retrain_model(storage: Storage | None = None):
    storage = storage or Storage()
    _emit("retrain_start", "Starting model retraining", storage=storage)

    current_model = storage.get_latest_model_run()
    current_accuracy = current_model.get("accuracy", 0) if current_model else 0

    trainer = ModelTrainer(storage)
    try:
        result = trainer.train(target="return_1d", horizon_label="1d_scheduled")
        new_accuracy = result.get("accuracy", 0)

        if current_accuracy > 0 and new_accuracy < current_accuracy * 0.95:
            _emit("retrain_rejected",
                  f"New model rejected: accuracy {new_accuracy:.4f} < 95% of current {current_accuracy:.4f}",
                  details={"new_accuracy": new_accuracy, "current_accuracy": current_accuracy},
                  storage=storage)
            return {"status": "rejected", "new_accuracy": new_accuracy, "current_accuracy": current_accuracy}

        # Also train magnitude model for return prediction
        try:
            mag_result = trainer.train_magnitude_model()
            result["magnitude_model"] = mag_result
            _emit("retrain_magnitude", f"Magnitude model trained: MAE={mag_result.get('mae', '?')}",
                  details=mag_result, storage=storage)
        except Exception as e:
            logger.warning("Magnitude model training failed (non-fatal): %s", e)

        _emit("retrain_complete",
              f"Model retrained: accuracy={new_accuracy:.4f} (prev: {current_accuracy:.4f})",
              details={"accuracy": new_accuracy, "model_version": result.get("model_version")},
              storage=storage)
        return result
    except Exception as e:
        _emit("retrain_error", f"Retrain failed: {e}", storage=storage)
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# Job: refresh_convictions
# ---------------------------------------------------------------------------

def reextract_features(storage: Storage | None = None):
    """Re-extract features for all sources using latest extractors."""
    storage = storage or Storage()
    _emit("reextract_start", "Re-extracting features for all sources", storage=storage)
    pipeline = FeaturePipeline(storage)
    sources = storage.list_audio_sources()
    updated = 0
    for src in sources:
        chunks = storage.get_stt_chunks(src["id"])
        if not chunks:
            continue
        try:
            pipeline.extract_for_source(src["id"])
            updated += 1
        except Exception as e:
            logger.debug("Re-extract failed for source %d: %s", src["id"], e)
    _emit("reextract_complete", f"Re-extracted features for {updated} sources",
          details={"updated": updated}, storage=storage)
    return {"updated": updated}


def refresh_convictions(storage: Storage | None = None, portfolio_value: float = 10_000):
    storage = storage or Storage()
    _emit("conviction_start", "Refreshing ticker convictions with live prices", storage=storage)
    engine = ConvictionEngine(storage)
    convictions = engine.compute_all(portfolio_value)
    _emit("conviction_complete",
          f"Refreshed {len(convictions)} ticker convictions",
          details={"count": len(convictions)}, storage=storage)
    return {"count": len(convictions)}
