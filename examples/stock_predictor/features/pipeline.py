"""
Feature pipeline orchestrator.

Combines all feature extractors (emotion, demographics, text, divergence)
into a single feature vector per audio source.
"""

import logging

from ..data.storage import Storage
from .emotion import extract_emotion_features
from .demographics import extract_demographics_features
from .text import extract_text_features
from .divergence import extract_divergence_features
from .intent import extract_intent_features
from .cross_call import extract_cross_call_features
from .market_context import extract_market_context_features

logger = logging.getLogger(__name__)


class FeaturePipeline:
    """Orchestrate feature extraction for audio sources."""

    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()

    def extract_all_pending(self) -> int:
        """Extract features for all sources that have STT chunks but no features yet."""
        sources = self.storage.get_sources_without_features()
        logger.info("Found %d sources pending feature extraction", len(sources))

        processed = 0
        for src in sources:
            try:
                self.extract_for_source(src["id"])
                processed += 1
            except Exception as e:
                logger.error("Feature extraction failed for source %d: %s", src["id"], e)
        return processed

    def extract_for_source(self, source_id: int) -> dict[str, float]:
        """Extract full feature vector for a single source."""
        chunks = self.storage.get_stt_chunks(source_id)
        if not chunks:
            logger.warning("No STT chunks for source %d", source_id)
            return {}

        features: dict[str, float] = {}

        # Emotion features
        emotion_feats = extract_emotion_features(chunks)
        features.update(emotion_feats)

        # Demographics features
        demo_feats = extract_demographics_features(chunks)
        features.update(demo_feats)

        # Text features
        text_feats = extract_text_features(chunks)
        features.update(text_feats)

        # Intent features (analyst skepticism, speaker defensiveness)
        intent_feats = extract_intent_features(chunks)
        features.update(intent_feats)

        # Cross-modal divergence (the secret sauce)
        div_feats = extract_divergence_features(chunks)
        features.update(div_feats)

        # Cross-call comparison (quarter-over-quarter tone shifts)
        src = self.storage.get_audio_source(source_id)
        ticker = src.get("ticker") if src else None
        if ticker:
            cross_feats = extract_cross_call_features(source_id, ticker, self.storage)
            features.update(cross_feats)

        # Market context features (price action, volatility, VIX)
        mkt_feats = extract_market_context_features(source_id, self.storage)
        features.update(mkt_feats)

        # Meta features
        features["chunk_count"] = float(len(chunks))
        features["has_metadata_probs"] = 1.0 if any(c.get("emotion_probs") for c in chunks) else 0.0

        self.storage.upsert_features(source_id, features)
        logger.info("Extracted %d features for source %d", len(features), source_id)
        return features
