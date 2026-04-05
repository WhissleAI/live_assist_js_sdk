"""
Real earnings call pipeline.

Downloads actual earnings call audio from YouTube using yt-dlp,
processes through Whissle STT, fetches stock data, extracts features,
trains model, and generates predictions.

This is the "do it for real" script.
"""

import asyncio
import json
import logging
import os
import re
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ..config import settings
from ..data.storage import Storage
from ..data.stock_data import StockDataFetcher
from ..stt.processor import BatchSTTProcessor
from ..features.pipeline import FeaturePipeline
from ..models.trainer import ModelTrainer
from ..models.predictor import StockPredictor

logger = logging.getLogger(__name__)

# Curated list of recent earnings calls (Q3 2025 - Q1 2026)
# Format: (ticker, event_date, youtube_search_query)
# We use search queries because specific URLs may go stale
EARNINGS_CALLS = [
    # Q1 2026 (most recent)
    ("AAPL", "2026-01-30", "Apple Q1 2026 earnings call"),
    ("MSFT", "2026-01-29", "Microsoft Q2 FY2026 earnings call"),
    ("GOOGL", "2026-02-04", "Alphabet Q4 2025 earnings call"),
    ("AMZN", "2026-02-06", "Amazon Q4 2025 earnings call"),
    ("META", "2026-01-29", "Meta Q4 2025 earnings call"),
    ("NVDA", "2026-02-26", "Nvidia Q4 FY2026 earnings call"),
    ("TSLA", "2026-01-29", "Tesla Q4 2025 earnings call"),
    ("JPM", "2026-01-15", "JPMorgan Q4 2025 earnings call"),
    ("BAC", "2026-01-16", "Bank of America Q4 2025 earnings call"),
    ("GS", "2026-01-15", "Goldman Sachs Q4 2025 earnings call"),
    ("MS", "2026-01-16", "Morgan Stanley Q4 2025 earnings call"),
    ("WFC", "2026-01-15", "Wells Fargo Q4 2025 earnings call"),
    ("JNJ", "2026-01-22", "Johnson Johnson Q4 2025 earnings call"),
    ("UNH", "2026-01-16", "UnitedHealth Q4 2025 earnings call"),
    ("PFE", "2026-01-28", "Pfizer Q4 2025 earnings call"),
    ("MRK", "2026-02-06", "Merck Q4 2025 earnings call"),
    ("XOM", "2026-01-31", "ExxonMobil Q4 2025 earnings call"),
    ("CVX", "2026-01-31", "Chevron Q4 2025 earnings call"),
    ("DIS", "2026-02-05", "Disney Q1 FY2026 earnings call"),
    ("NFLX", "2026-01-21", "Netflix Q4 2025 earnings call"),
    ("CRM", "2026-02-26", "Salesforce Q4 FY2026 earnings call"),
    ("ORCL", "2026-03-10", "Oracle Q3 FY2026 earnings call"),
    ("INTC", "2026-01-30", "Intel Q4 2025 earnings call"),
    ("AMD", "2026-02-04", "AMD Q4 2025 earnings call"),
    ("V", "2026-01-30", "Visa Q1 FY2026 earnings call"),
    ("MA", "2026-01-30", "Mastercard Q4 2025 earnings call"),
    ("HD", "2026-02-25", "Home Depot Q4 FY2025 earnings call"),
    ("WMT", "2026-02-20", "Walmart Q4 FY2026 earnings call"),
    ("COST", "2026-03-06", "Costco Q2 FY2026 earnings call"),
    ("KO", "2026-02-11", "Coca-Cola Q4 2025 earnings call"),
    ("PEP", "2026-02-04", "PepsiCo Q4 2025 earnings call"),
    ("MCD", "2026-02-10", "McDonald's Q4 2025 earnings call"),
    ("BA", "2026-01-28", "Boeing Q4 2025 earnings call"),
    ("CAT", "2026-01-30", "Caterpillar Q4 2025 earnings call"),
    ("DE", "2026-02-19", "John Deere Q1 FY2026 earnings call"),

    # Q4 2025 / Q3 2025 (slightly older)
    ("AAPL", "2025-10-30", "Apple Q4 FY2025 earnings call"),
    ("MSFT", "2025-10-29", "Microsoft Q1 FY2026 earnings call"),
    ("GOOGL", "2025-10-29", "Alphabet Q3 2025 earnings call"),
    ("AMZN", "2025-10-31", "Amazon Q3 2025 earnings call"),
    ("META", "2025-10-29", "Meta Q3 2025 earnings call"),
    ("NVDA", "2025-11-20", "Nvidia Q3 FY2026 earnings call"),
    ("TSLA", "2025-10-23", "Tesla Q3 2025 earnings call"),
    ("JPM", "2025-10-15", "JPMorgan Q3 2025 earnings call"),
    ("NFLX", "2025-10-17", "Netflix Q3 2025 earnings call"),
    ("GS", "2025-10-15", "Goldman Sachs Q3 2025 earnings call"),
    ("JNJ", "2025-10-15", "Johnson Johnson Q3 2025 earnings call"),
    ("XOM", "2025-10-25", "ExxonMobil Q3 2025 earnings call"),
    ("AMD", "2025-10-28", "AMD Q3 2025 earnings call"),
    ("DIS", "2025-11-06", "Disney Q4 FY2025 earnings call"),
    ("KO", "2025-10-22", "Coca-Cola Q3 2025 earnings call"),
    ("MCD", "2025-10-28", "McDonald's Q3 2025 earnings call"),
    ("BA", "2025-10-23", "Boeing Q3 2025 earnings call"),
    ("WMT", "2025-11-19", "Walmart Q3 FY2026 earnings call"),
    ("HD", "2025-11-12", "Home Depot Q3 FY2025 earnings call"),
    ("V", "2025-10-28", "Visa Q4 FY2025 earnings call"),
    ("MA", "2025-10-31", "Mastercard Q3 2025 earnings call"),
    ("PFE", "2025-10-28", "Pfizer Q3 2025 earnings call"),
    ("CRM", "2025-11-20", "Salesforce Q3 FY2026 earnings call"),
    ("INTC", "2025-10-30", "Intel Q3 2025 earnings call"),
    ("UNH", "2025-10-15", "UnitedHealth Q3 2025 earnings call"),

    # Q3 2025 (older — for training depth)
    ("AAPL", "2025-08-01", "Apple Q3 FY2025 earnings call"),
    ("MSFT", "2025-07-22", "Microsoft Q4 FY2025 earnings call"),
    ("GOOGL", "2025-07-29", "Alphabet Q2 2025 earnings call"),
    ("AMZN", "2025-08-01", "Amazon Q2 2025 earnings call"),
    ("META", "2025-07-30", "Meta Q2 2025 earnings call"),
    ("NVDA", "2025-08-28", "Nvidia Q2 FY2026 earnings call"),
    ("TSLA", "2025-07-22", "Tesla Q2 2025 earnings call"),
    ("JPM", "2025-07-11", "JPMorgan Q2 2025 earnings call"),
    ("NFLX", "2025-07-17", "Netflix Q2 2025 earnings call"),
    ("GS", "2025-07-14", "Goldman Sachs Q2 2025 earnings call"),
    ("AMD", "2025-07-29", "AMD Q2 2025 earnings call"),
    ("DIS", "2025-08-06", "Disney Q3 FY2025 earnings call"),
    ("WMT", "2025-08-15", "Walmart Q2 FY2026 earnings call"),
    ("XOM", "2025-08-01", "ExxonMobil Q2 2025 earnings call"),
    ("BA", "2025-07-23", "Boeing Q2 2025 earnings call"),
]

AUDIO_DIR = Path(settings.data_dir) / "audio" / "real_earnings"
MAX_AUDIO_MINUTES = 20  # Cap each download to 20 min (enough for key sections)


def _search_and_download(query: str, output_path: Path, max_minutes: int = MAX_AUDIO_MINUTES) -> bool:
    """Search YouTube and download the best matching audio."""
    if output_path.exists() and output_path.stat().st_size > 10000:
        logger.info("Already downloaded: %s", output_path.name)
        return True

    tmp_template = str(output_path.with_suffix("")) + "_tmp.%(ext)s"

    try:
        result = subprocess.run(
            [
                "yt-dlp",
                f"ytsearch1:{query}",
                "--extract-audio",
                "--audio-format", "mp3",
                "--audio-quality", "5",
                "--max-downloads", "1",
                "--no-playlist",
                "--output", tmp_template,
                "--quiet",
                "--no-warnings",
            ],
            capture_output=True,
            timeout=300,
        )

        # Find the downloaded file (yt-dlp exit 101 = max downloads reached = OK)
        parent = output_path.parent
        stem = output_path.stem + "_tmp"
        found = None
        for f in parent.glob(f"{stem}*"):
            if f.stat().st_size > 10000:
                found = f
                break

        if found:
            # Trim to max_minutes using ffmpeg
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(found),
                    "-t", str(max_minutes * 60),
                    "-acodec", "libmp3lame", "-q:a", "5",
                    str(output_path),
                ],
                capture_output=True, timeout=120,
            )
            found.unlink(missing_ok=True)

            if output_path.exists() and output_path.stat().st_size > 10000:
                logger.info("Downloaded: %s (%.1f MB)", output_path.name, output_path.stat().st_size / 1e6)
                return True

        if result.returncode not in (0, 101):
            stderr = result.stderr.decode(errors="replace")[:300]
            logger.warning("yt-dlp failed for '%s' (rc=%d): %s", query, result.returncode, stderr)
    except subprocess.TimeoutExpired:
        logger.warning("Download timed out for '%s'", query)
    except Exception as e:
        logger.warning("Download error for '%s': %s", query, e)

    for f in output_path.parent.glob(f"{output_path.stem}_tmp*"):
        f.unlink(missing_ok=True)

    return False


class RealEarningsPipeline:
    """Full pipeline with real earnings call audio."""

    def __init__(self, db_path: str | None = None):
        real_db = db_path or str(Path(settings.data_dir) / "real_earnings.db")
        self.storage = Storage(db_path=real_db)
        self.stock_fetcher = StockDataFetcher(self.storage)
        self.stt = BatchSTTProcessor(self.storage)
        self.features = FeaturePipeline(self.storage)
        self.trainer = ModelTrainer(self.storage)

    async def run(
        self,
        max_calls: int = 100,
        skip_download: bool = False,
        skip_stt: bool = False,
        predict_recent_days: int = 5,
    ) -> dict[str, Any]:
        """Run the full real-data pipeline."""
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        results: dict[str, Any] = {}

        # ── Step 1: Download audio ──
        if not skip_download:
            logger.info("=== Step 1: Downloading earnings call audio ===")
            downloaded, failed = self._download_audio(max_calls)
            results["downloaded"] = downloaded
            results["download_failed"] = failed
        else:
            results["download"] = "skipped"

        # Register all downloaded audio in DB
        registered = self._register_audio()
        results["registered_sources"] = registered
        total = self.storage.count_sources()
        results["total_sources"] = total
        logger.info("Total sources in DB: %d", total)

        if total == 0:
            return {**results, "error": "No audio sources available"}

        # ── Step 2: Process through Whissle STT ──
        if not skip_stt:
            logger.info("=== Step 2: Processing through Whissle STT ===")
            stt_count = await self.stt.process_all_pending()
            results["stt_processed"] = stt_count
        else:
            results["stt"] = "skipped"

        total_chunks = self.storage.count_stt_chunks()
        results["total_chunks"] = total_chunks

        if total_chunks == 0:
            return {**results, "error": "No STT chunks generated"}

        # ── Step 3: Fetch stock data ──
        logger.info("=== Step 3: Fetching stock market data ===")
        self.stock_fetcher.fetch_and_store_for_all_sources()
        results["stock_data"] = "fetched"

        # ── Step 4: Extract features ──
        logger.info("=== Step 4: Extracting features ===")
        feat_count = self.features.extract_all_pending()
        results["features_extracted"] = feat_count

        # ── Step 5: Train model ──
        logger.info("=== Step 5: Training model ===")
        df = self.storage.get_all_features_df()
        if df.empty or len(df) < 10:
            return {**results, "error": f"Not enough training data: {len(df)} samples"}

        try:
            train_result = self.trainer.train(target="return_1d", horizon_label="1d_real")
            results["training"] = {
                "model": train_result.get("model_version"),
                "accuracy": train_result.get("accuracy"),
                "auc_roc": train_result.get("auc_roc"),
                "sharpe": train_result.get("sharpe_ratio"),
                "samples": train_result.get("train_samples"),
                "top_features": list(train_result.get("feature_importance", {}).items())[:15],
            }
        except Exception as e:
            logger.error("Training failed: %s", e)
            results["training"] = {"error": str(e)}
            return results

        # ── Step 6: Predict recent earnings ──
        logger.info("=== Step 6: Generating predictions ===")
        predictions = self._predict_recent(predict_recent_days, train_result.get("model_version"))
        results["predictions"] = predictions

        # ── Step 7: Evaluate predictions vs actual ──
        logger.info("=== Step 7: Evaluating results ===")
        evaluation = self._evaluate_predictions(predictions)
        results["evaluation"] = evaluation

        return results

    def _download_audio(self, max_calls: int) -> tuple[int, int]:
        """Download earnings call audio from YouTube."""
        downloaded = 0
        failed = 0

        for ticker, date, query in EARNINGS_CALLS[:max_calls]:
            safe_name = f"{ticker}_{date.replace('-', '')}.mp3"
            output_path = AUDIO_DIR / safe_name

            if _search_and_download(query, output_path):
                downloaded += 1
            else:
                failed += 1

            if downloaded >= max_calls:
                break

        logger.info("Download complete: %d succeeded, %d failed", downloaded, failed)
        return downloaded, failed

    def _register_audio(self) -> int:
        """Register all audio files in the directory into the DB."""
        registered = 0
        existing = {s.get("local_path") for s in self.storage.list_audio_sources()}

        for f in sorted(AUDIO_DIR.glob("*.mp3")):
            if str(f) in existing:
                continue

            m = re.match(r"([A-Z]+)_(\d{4})(\d{2})(\d{2})", f.stem)
            if not m:
                continue

            ticker = m.group(1)
            date = f"{m.group(2)}-{m.group(3)}-{m.group(4)}"

            self.storage.insert_audio_source(
                source_type="earnings_call",
                ticker=ticker,
                company_name=ticker,
                event_date=date,
                local_path=str(f),
                metadata_json=json.dumps({"source": "youtube", "real": True}),
            )
            registered += 1

        return registered

    def _predict_recent(self, days: int, model_version: str | None) -> list[dict]:
        """Predict for the most recent earnings calls."""
        predictor = StockPredictor(self.storage)
        if model_version:
            predictor.load_model(model_version)
        else:
            predictor.load_latest()

        cutoff = (datetime.now() - timedelta(days=days * 7)).strftime("%Y-%m-%d")
        sources = self.storage.list_audio_sources()
        recent = sorted(
            [s for s in sources if s.get("event_date", "") >= cutoff],
            key=lambda s: s["event_date"],
            reverse=True,
        )

        predictions = []
        for src in recent:
            features = self.storage.get_features(src["id"])
            if not features:
                continue
            try:
                pred = predictor.predict_for_source(src["id"])
                stock = self.storage.get_stock_record(src["id"])
                if stock:
                    pred["actual_return_1d"] = stock.get("return_1d")
                    pred["actual_return_5d"] = stock.get("return_5d")
                    actual_dir = 1 if (stock.get("return_1d") or 0) > 0 else 0
                    pred["actual_direction"] = actual_dir
                    pred["correct"] = pred["direction"] == actual_dir
                predictions.append(pred)
            except Exception as e:
                logger.warning("Predict failed for %s (%s): %s", src.get("ticker"), src.get("event_date"), e)

        return predictions

    def _evaluate_predictions(self, predictions: list[dict]) -> dict[str, Any]:
        """Evaluate prediction accuracy against actual returns."""
        with_actual = [p for p in predictions if "actual_direction" in p]
        if not with_actual:
            return {"message": "No predictions with actual returns to evaluate"}

        correct = [p for p in with_actual if p.get("correct")]
        accuracy = len(correct) / len(with_actual)

        # High confidence
        high_conf = [p for p in with_actual if p.get("confidence", 0) > 0.6]
        high_conf_correct = [p for p in high_conf if p.get("correct")]
        high_conf_accuracy = len(high_conf_correct) / max(len(high_conf), 1)

        # Strategy vs buy-hold
        strategy_returns = []
        buy_hold_returns = []
        for p in with_actual:
            ret = p.get("actual_return_1d", 0) or 0
            buy_hold_returns.append(ret)
            strategy_returns.append(ret if p.get("direction") == 1 else -ret)

        strat_arr = np.array(strategy_returns)
        bh_arr = np.array(buy_hold_returns)

        # Per-ticker breakdown
        ticker_stats: dict[str, dict] = {}
        for p in with_actual:
            t = p.get("ticker", "?")
            if t not in ticker_stats:
                ticker_stats[t] = {"correct": 0, "total": 0, "strat_ret": []}
            ticker_stats[t]["total"] += 1
            if p.get("correct"):
                ticker_stats[t]["correct"] += 1
            ret = p.get("actual_return_1d", 0) or 0
            ticker_stats[t]["strat_ret"].append(ret if p.get("direction") == 1 else -ret)

        per_ticker = {}
        for t, d in ticker_stats.items():
            per_ticker[t] = {
                "accuracy": round(d["correct"] / max(d["total"], 1), 3),
                "predictions": d["total"],
                "strategy_return": round(float(np.sum(d["strat_ret"])), 6),
            }

        return {
            "total_evaluated": len(with_actual),
            "accuracy": round(accuracy, 4),
            "high_confidence_count": len(high_conf),
            "high_confidence_accuracy": round(high_conf_accuracy, 4),
            "strategy_cumulative": round(float(np.sum(strat_arr)), 6),
            "buy_hold_cumulative": round(float(np.sum(bh_arr)), 6),
            "strategy_sharpe": round(
                float(np.mean(strat_arr) / max(np.std(strat_arr), 1e-8) * np.sqrt(252)), 2
            ),
            "per_ticker": dict(sorted(per_ticker.items(), key=lambda x: -x[1]["accuracy"])),
        }
