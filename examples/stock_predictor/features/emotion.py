"""
Emotion-based features extracted from Whissle STT metadata.

These capture the emotional signature of an audio event (earnings call, etc.):
- Aggregate distributions
- Temporal dynamics (arc, shifts, volatility)
- Entropy and concentration
"""

import json
import math
from typing import Any

import numpy as np

EMOTION_LABELS = ["HAP", "SAD", "ANG", "FEA", "DIS", "SUR", "NEU", "NEUTRAL"]
POSITIVE_EMOTIONS = {"HAP", "SUR"}
NEGATIVE_EMOTIONS = {"SAD", "ANG", "FEA", "DIS"}


def _parse_probs(raw: str | list | None) -> list[dict]:
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
    return raw


def _probs_to_dict(probs: list[dict]) -> dict[str, float]:
    """Convert [{token, probability}, ...] to {label: prob}."""
    out: dict[str, float] = {}
    for p in probs:
        label = p.get("token", "").replace("EMOTION_", "")
        prob = p.get("probability", 0.0)
        out[label] = prob
    return out


def extract_emotion_features(chunks: list[dict]) -> dict[str, float]:
    """Extract all emotion features from a list of STT chunks."""
    features: dict[str, float] = {}

    if not chunks:
        return _empty_emotion_features()

    # Parse all probability distributions
    chunk_probs: list[dict[str, float]] = []
    for c in chunks:
        probs = _parse_probs(c.get("emotion_probs"))
        if probs:
            chunk_probs.append(_probs_to_dict(probs))

    if not chunk_probs:
        return _empty_emotion_features()

    # Aggregate distribution (mean across chunks)
    all_labels = set()
    for cp in chunk_probs:
        all_labels.update(cp.keys())

    agg: dict[str, float] = {}
    for label in all_labels:
        vals = [cp.get(label, 0.0) for cp in chunk_probs]
        agg[label] = float(np.mean(vals))

    # Dominant emotion
    dominant = max(agg, key=agg.get) if agg else "NEUTRAL"
    features["dominant_emotion_is_positive"] = 1.0 if dominant in POSITIVE_EMOTIONS else 0.0
    features["dominant_emotion_is_negative"] = 1.0 if dominant in NEGATIVE_EMOTIONS else 0.0

    # Per-emotion mean probabilities
    for label in EMOTION_LABELS:
        clean = label.upper()
        features[f"emotion_mean_{clean}"] = agg.get(clean, agg.get(label, 0.0))

    # Positive vs negative aggregate
    pos_score = sum(agg.get(e, 0.0) for e in POSITIVE_EMOTIONS)
    neg_score = sum(agg.get(e, 0.0) for e in NEGATIVE_EMOTIONS)
    features["positive_emotion_score"] = pos_score
    features["negative_emotion_score"] = neg_score
    features["emotion_polarity"] = pos_score - neg_score

    # Entropy (how mixed the emotions are)
    total = sum(agg.values())
    if total > 0:
        normalized = {k: v / total for k, v in agg.items()}
        entropy = -sum(p * math.log2(p + 1e-10) for p in normalized.values() if p > 0)
        features["emotion_entropy"] = entropy
    else:
        features["emotion_entropy"] = 0.0

    # Temporal dynamics
    if len(chunk_probs) >= 2:
        pos_series = [sum(cp.get(e, 0.0) for e in POSITIVE_EMOTIONS) for cp in chunk_probs]
        neg_series = [sum(cp.get(e, 0.0) for e in NEGATIVE_EMOTIONS) for cp in chunk_probs]

        # Trend (linear slope)
        t = np.arange(len(pos_series), dtype=float)
        features["positive_emotion_trend"] = float(np.polyfit(t, pos_series, 1)[0])
        features["negative_emotion_trend"] = float(np.polyfit(t, neg_series, 1)[0])

        # Volatility (std of emotion probabilities across chunks)
        features["emotion_volatility"] = float(np.std(pos_series) + np.std(neg_series))

        # Shift magnitude (start vs end)
        half = len(chunk_probs) // 2
        first_half_pos = np.mean(pos_series[:half])
        second_half_pos = np.mean(pos_series[half:])
        first_half_neg = np.mean(neg_series[:half])
        second_half_neg = np.mean(neg_series[half:])
        features["emotion_shift_positive"] = float(second_half_pos - first_half_pos)
        features["emotion_shift_negative"] = float(second_half_neg - first_half_neg)

        # Fear spikes (chunks where fear jumps > 0.15 above running mean)
        fear_series = [cp.get("FEA", 0.0) for cp in chunk_probs]
        if len(fear_series) > 2:
            fear_arr = np.array(fear_series)
            running_mean = np.convolve(fear_arr, np.ones(3) / 3, mode="same")
            spikes = np.sum((fear_arr - running_mean) > 0.15)
            features["fear_spike_count"] = float(spikes)
        else:
            features["fear_spike_count"] = 0.0

        # Emotion transitions (how often the dominant emotion changes)
        dominants = [max(cp, key=cp.get) for cp in chunk_probs]
        transitions = sum(1 for i in range(1, len(dominants)) if dominants[i] != dominants[i - 1])
        features["emotion_transition_rate"] = transitions / max(len(dominants) - 1, 1)
    else:
        features.update({
            "positive_emotion_trend": 0.0, "negative_emotion_trend": 0.0,
            "emotion_volatility": 0.0, "emotion_shift_positive": 0.0,
            "emotion_shift_negative": 0.0, "fear_spike_count": 0.0,
            "emotion_transition_rate": 0.0,
        })

    return features


def _empty_emotion_features() -> dict[str, float]:
    feats: dict[str, float] = {
        "dominant_emotion_is_positive": 0.0,
        "dominant_emotion_is_negative": 0.0,
        "positive_emotion_score": 0.0,
        "negative_emotion_score": 0.0,
        "emotion_polarity": 0.0,
        "emotion_entropy": 0.0,
        "positive_emotion_trend": 0.0,
        "negative_emotion_trend": 0.0,
        "emotion_volatility": 0.0,
        "emotion_shift_positive": 0.0,
        "emotion_shift_negative": 0.0,
        "fear_spike_count": 0.0,
        "emotion_transition_rate": 0.0,
    }
    for label in EMOTION_LABELS:
        feats[f"emotion_mean_{label.upper()}"] = 0.0
    return feats
