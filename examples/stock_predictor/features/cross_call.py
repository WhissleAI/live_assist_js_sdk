"""
Cross-call comparison features.

Compares the current call's emotional/text signature with prior calls for the
same ticker. Captures quarter-over-quarter shifts in CEO tone, sentiment drift,
and confidence trajectory — powerful alpha signals.
"""

import json
import logging

import numpy as np

from ..data.storage import Storage

logger = logging.getLogger(__name__)


def extract_cross_call_features(
    source_id: int,
    ticker: str,
    storage: Storage,
) -> dict[str, float]:
    """Compare this source's features with prior sources for the same ticker."""
    features: dict[str, float] = {}

    current_feats = storage.get_features(source_id)
    if not current_feats:
        return _empty_cross_call_features()

    prior_sources = _get_prior_sources(source_id, ticker, storage, max_prior=5)
    if not prior_sources:
        return _empty_cross_call_features()

    prior_feat_list = []
    for s in prior_sources:
        f = storage.get_features(s["id"])
        if f:
            prior_feat_list.append(f)

    if not prior_feat_list:
        return _empty_cross_call_features()

    prev = prior_feat_list[0]  # most recent prior call

    # Emotion polarity shift quarter-over-quarter
    cur_pol = current_feats.get("emotion_polarity", 0.0)
    prev_pol = prev.get("emotion_polarity", 0.0)
    features["cross_emotion_polarity_delta"] = cur_pol - prev_pol

    # Sentiment shift quarter-over-quarter
    cur_sent = current_feats.get("text_sentiment_polarity", 0.0)
    prev_sent = prev.get("text_sentiment_polarity", 0.0)
    features["cross_sentiment_delta"] = cur_sent - prev_sent

    # Hedging density change (more hedging = bearish drift)
    cur_hedge = current_feats.get("hedging_density", 0.0)
    prev_hedge = prev.get("hedging_density", 0.0)
    features["cross_hedging_delta"] = cur_hedge - prev_hedge

    # Confidence density change
    cur_conf = current_feats.get("confidence_density", 0.0)
    prev_conf = prev.get("confidence_density", 0.0)
    features["cross_confidence_delta"] = cur_conf - prev_conf

    # Fear level change
    cur_fear = current_feats.get("emotion_mean_FEA", 0.0)
    prev_fear = prev.get("emotion_mean_FEA", 0.0)
    features["cross_fear_delta"] = cur_fear - prev_fear

    # Deception signal change
    cur_deception = current_feats.get("deception_signal_rate", 0.0)
    prev_deception = prev.get("deception_signal_rate", 0.0)
    features["cross_deception_delta"] = cur_deception - prev_deception

    # Multi-quarter trend (linear slope of emotion polarity across all prior calls)
    if len(prior_feat_list) >= 2:
        polarity_history = [f.get("emotion_polarity", 0.0) for f in reversed(prior_feat_list)]
        polarity_history.append(cur_pol)
        t = np.arange(len(polarity_history), dtype=float)
        features["cross_polarity_trend"] = float(np.polyfit(t, polarity_history, 1)[0])

        sent_history = [f.get("text_sentiment_polarity", 0.0) for f in reversed(prior_feat_list)]
        sent_history.append(cur_sent)
        features["cross_sentiment_trend"] = float(np.polyfit(t[:len(sent_history)], sent_history, 1)[0])
    else:
        features["cross_polarity_trend"] = 0.0
        features["cross_sentiment_trend"] = 0.0

    features["cross_prior_calls_count"] = float(len(prior_feat_list))

    return features


def _get_prior_sources(
    current_source_id: int,
    ticker: str,
    storage: Storage,
    max_prior: int = 5,
) -> list[dict]:
    """Get prior audio sources for the same ticker, ordered by most recent first."""
    try:
        all_sources = storage.get_sources_with_status(limit=500)
        same_ticker = [
            s for s in all_sources
            if s.get("ticker") == ticker and s["id"] != current_source_id
        ]
        same_ticker.sort(key=lambda s: s.get("event_date", ""), reverse=True)
        return same_ticker[:max_prior]
    except Exception as e:
        logger.warning("Failed to get prior sources for %s: %s", ticker, e)
        return []


def _empty_cross_call_features() -> dict[str, float]:
    return {
        "cross_emotion_polarity_delta": 0.0,
        "cross_sentiment_delta": 0.0,
        "cross_hedging_delta": 0.0,
        "cross_confidence_delta": 0.0,
        "cross_fear_delta": 0.0,
        "cross_deception_delta": 0.0,
        "cross_polarity_trend": 0.0,
        "cross_sentiment_trend": 0.0,
        "cross_prior_calls_count": 0.0,
    }
