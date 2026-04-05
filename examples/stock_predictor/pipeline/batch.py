"""
Batch processing orchestrator.

Runs the full pipeline end-to-end:
1. Download earnings call audio (or register local files)
2. Process through Whissle STT
3. Fetch aligned stock data
4. Extract feature vectors
5. Train prediction models
"""

import asyncio
import logging
from typing import Any

from ..config import settings
from ..data.storage import Storage
from ..data.earnings import EarningsDownloader
from ..data.stock_data import StockDataFetcher
from ..stt.processor import BatchSTTProcessor
from ..features.pipeline import FeaturePipeline
from ..models.trainer import ModelTrainer

logger = logging.getLogger(__name__)


class BatchPipeline:
    """End-to-end batch processing pipeline."""

    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()
        self.earnings = EarningsDownloader(self.storage)
        self.stock_data = StockDataFetcher(self.storage)
        self.stt = BatchSTTProcessor(self.storage)
        self.features = FeaturePipeline(self.storage)
        self.trainer = ModelTrainer(self.storage)

    async def run_full(
        self,
        tickers: list[str] | None = None,
        audio_dir: str | None = None,
        skip_download: bool = False,
        skip_stt: bool = False,
        skip_train: bool = False,
    ) -> dict[str, Any]:
        """Run the complete batch pipeline.

        Args:
            tickers: Tickers to download earnings for (None = default list)
            audio_dir: Local directory with audio files to register
            skip_download: Skip the download step
            skip_stt: Skip STT processing (use existing chunks)
            skip_train: Skip model training
        """
        results: dict[str, Any] = {}

        # Step 1: Acquire audio
        if audio_dir:
            logger.info("=== Step 1: Registering local audio files ===")
            source_ids = self.earnings.register_local_files(audio_dir)
            results["registered_sources"] = len(source_ids)
        elif not skip_download:
            logger.info("=== Step 1: Downloading earnings call audio ===")
            source_ids = await self.earnings.download_from_api(tickers=tickers)
            results["downloaded_sources"] = len(source_ids)
        else:
            results["download"] = "skipped"

        total_sources = self.storage.count_sources()
        results["total_sources"] = total_sources
        logger.info("Total audio sources in DB: %d", total_sources)

        # Step 2: STT processing
        if not skip_stt:
            logger.info("=== Step 2: Processing audio through Whissle STT ===")
            processed = await self.stt.process_all_pending()
            results["stt_processed"] = processed
        else:
            results["stt"] = "skipped"

        # Step 3: Stock data
        logger.info("=== Step 3: Fetching stock market data ===")
        self.stock_data.fetch_and_store_for_all_sources()
        results["stock_data"] = "complete"

        # Step 4: Feature extraction
        logger.info("=== Step 4: Extracting feature vectors ===")
        feat_count = self.features.extract_all_pending()
        results["features_extracted"] = feat_count

        # Step 5: Train models
        if not skip_train:
            logger.info("=== Step 5: Training prediction models ===")
            train_results = self.trainer.train_all_horizons()
            results["training"] = train_results
        else:
            results["training"] = "skipped"

        logger.info("=== Batch pipeline complete ===")
        return results

    async def incremental_update(self) -> dict[str, Any]:
        """Process only new/pending items through the pipeline.

        Designed to be run daily or on-demand to process newly
        added audio without re-running everything.
        """
        results: dict[str, Any] = {}

        # Process pending STT
        stt_count = await self.stt.process_all_pending()
        results["stt_processed"] = stt_count

        # Fetch missing stock data
        self.stock_data.fetch_and_store_for_all_sources()

        # Extract pending features
        feat_count = self.features.extract_all_pending()
        results["features_extracted"] = feat_count

        return results
