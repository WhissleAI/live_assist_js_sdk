"""
Daily prediction pipeline.

Designed to run daily (via cron or manual trigger):
1. Check for new audio sources added today
2. Process them through STT
3. Extract features
4. Generate predictions using the latest trained model
5. Store predictions and optionally send alerts
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

from ..config import settings
from ..data.storage import Storage
from ..data.stock_data import StockDataFetcher
from ..stt.processor import BatchSTTProcessor
from ..features.pipeline import FeaturePipeline
from ..models.predictor import StockPredictor

logger = logging.getLogger(__name__)


class DailyPipeline:
    """Daily prediction pipeline."""

    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()
        self.stock_data = StockDataFetcher(self.storage)
        self.stt = BatchSTTProcessor(self.storage)
        self.features = FeaturePipeline(self.storage)
        self.predictor = StockPredictor(self.storage)

    async def run(self) -> dict[str, Any]:
        """Run the daily prediction pipeline."""
        logger.info("=== Daily prediction pipeline starting ===")
        results: dict[str, Any] = {"run_date": datetime.now().isoformat()}

        # Load the latest model
        model_name = self.predictor.load_latest()
        if not model_name:
            logger.error("No trained model found. Run batch pipeline first.")
            results["error"] = "No trained model available"
            return results
        results["model"] = model_name

        # Process any pending STT
        stt_count = await self.stt.process_all_pending()
        results["stt_processed"] = stt_count

        # Extract features for any unprocessed sources
        feat_count = self.features.extract_all_pending()
        results["features_extracted"] = feat_count

        # Find sources from the last 7 days that have features but no predictions
        recent_sources = self._get_recent_unpredicted()
        logger.info("Found %d recent sources to predict", len(recent_sources))

        if not recent_sources:
            results["predictions"] = []
            results["message"] = "No new sources to predict"
            return results

        # Generate predictions
        source_ids = [s["id"] for s in recent_sources]
        predictions = self.predictor.predict_batch(source_ids)
        results["predictions"] = predictions

        # Summary
        up_preds = [p for p in predictions if p.get("direction") == 1]
        down_preds = [p for p in predictions if p.get("direction") == 0]
        high_conf = [p for p in predictions if p.get("confidence", 0) > 0.7]

        results["summary"] = {
            "total_predictions": len(predictions),
            "up_signals": len(up_preds),
            "down_signals": len(down_preds),
            "high_confidence": len(high_conf),
            "high_confidence_picks": [
                {
                    "ticker": p.get("ticker"),
                    "direction": p.get("direction_label"),
                    "confidence": p.get("confidence"),
                }
                for p in high_conf
            ],
        }

        logger.info(
            "Daily pipeline complete: %d predictions (%d up, %d down, %d high-confidence)",
            len(predictions), len(up_preds), len(down_preds), len(high_conf),
        )
        return results

    def _get_recent_unpredicted(self, days: int = 7) -> list[dict]:
        """Get sources from the last N days that have features but no prediction."""
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        sources = self.storage.list_audio_sources()
        recent = [s for s in sources if s.get("event_date", "") >= cutoff]

        unpredicted = []
        for s in recent:
            features = self.storage.get_features(s["id"])
            if not features:
                continue
            existing_preds = self.storage.get_predictions(ticker=s.get("ticker"))
            already_predicted = any(
                p.get("source_id") == s["id"] for p in existing_preds
            )
            if not already_predicted:
                unpredicted.append(s)
        return unpredicted
