"""
Cross-modal divergence features.

The key insight: when vocal emotion DIVERGES from textual sentiment,
it's a strong signal. A CEO saying "we're very confident" in a fearful
voice is more bearish than either signal alone.

This module computes the alignment/divergence between:
- Vocal emotion probabilities (from Whissle STT metadata)
- Textual sentiment (from NLP on transcripts)
"""

import json
import math

import numpy as np
from textblob import TextBlob


def _parse_probs(raw) -> list[dict]:
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
    return raw


def _vocal_valence(emotion_probs: list[dict]) -> float:
    """Map emotion probabilities to a single valence score [-1, 1]."""
    valence_map = {
        "HAP": 0.8, "SUR": 0.3, "NEU": 0.0, "NEUTRAL": 0.0,
        "SAD": -0.6, "ANG": -0.8, "FEA": -0.9, "DIS": -0.5,
    }
    total_weight = 0.0
    weighted_valence = 0.0
    for p in emotion_probs:
        label = p.get("token", "").replace("EMOTION_", "")
        prob = p.get("probability", 0.0)
        if label in valence_map:
            weighted_valence += valence_map[label] * prob
            total_weight += prob
    if total_weight > 0:
        return weighted_valence / total_weight
    return 0.0


def extract_divergence_features(chunks: list[dict]) -> dict[str, float]:
    """Compute vocal-textual divergence features per chunk, then aggregate."""
    features: dict[str, float] = {}

    chunk_divergences: list[float] = []
    chunk_vocal_valences: list[float] = []
    chunk_text_valences: list[float] = []

    for c in chunks:
        emotion_probs = _parse_probs(c.get("emotion_probs"))
        transcript = c.get("transcript", "").strip()

        if not emotion_probs or not transcript:
            continue

        vocal_v = _vocal_valence(emotion_probs)
        text_v = TextBlob(transcript).sentiment.polarity

        chunk_vocal_valences.append(vocal_v)
        chunk_text_valences.append(text_v)
        chunk_divergences.append(vocal_v - text_v)

    if not chunk_divergences:
        return _empty_divergence_features()

    arr_div = np.array(chunk_divergences)
    arr_vocal = np.array(chunk_vocal_valences)
    arr_text = np.array(chunk_text_valences)

    # Core divergence metrics
    features["mean_divergence"] = float(np.mean(arr_div))
    features["abs_mean_divergence"] = float(np.mean(np.abs(arr_div)))
    features["max_divergence"] = float(np.max(np.abs(arr_div)))
    features["divergence_std"] = float(np.std(arr_div))

    # Directional: positive = voice more positive than text, negative = voice more negative
    features["divergence_direction"] = 1.0 if np.mean(arr_div) > 0 else -1.0

    # Correlation between vocal and text valence
    if len(arr_vocal) > 2:
        corr = np.corrcoef(arr_vocal, arr_text)[0, 1]
        features["vocal_text_correlation"] = float(corr) if not math.isnan(corr) else 0.0
    else:
        features["vocal_text_correlation"] = 0.0

    # Deception signal: positive text + negative voice (or vice versa)
    # A CEO masking bad news with positive words but fearful voice
    deception_chunks = sum(
        1 for v, t in zip(arr_vocal, arr_text)
        if (v < -0.2 and t > 0.1) or (v > 0.2 and t < -0.1)
    )
    features["deception_signal_rate"] = deception_chunks / len(arr_div)

    # "Confident bad news" — negative text but calm/positive voice (actually bullish)
    confident_bad = sum(1 for v, t in zip(arr_vocal, arr_text) if v > 0.1 and t < -0.1)
    features["confident_bad_news_rate"] = confident_bad / len(arr_div)

    # "Nervous good news" — positive text but fearful voice (actually bearish)
    nervous_good = sum(1 for v, t in zip(arr_vocal, arr_text) if v < -0.2 and t > 0.1)
    features["nervous_good_news_rate"] = nervous_good / len(arr_div)

    # Temporal divergence shift
    if len(arr_div) >= 4:
        half = len(arr_div) // 2
        features["divergence_shift"] = float(np.mean(arr_div[half:]) - np.mean(arr_div[:half]))
    else:
        features["divergence_shift"] = 0.0

    return features


def _empty_divergence_features() -> dict[str, float]:
    return {
        "mean_divergence": 0.0,
        "abs_mean_divergence": 0.0,
        "max_divergence": 0.0,
        "divergence_std": 0.0,
        "divergence_direction": 0.0,
        "vocal_text_correlation": 0.0,
        "deception_signal_rate": 0.0,
        "confident_bad_news_rate": 0.0,
        "nervous_good_news_rate": 0.0,
        "divergence_shift": 0.0,
    }
