"""
Speaker demographics features from Whissle STT age/gender probabilities.

Captures the composition and shifts in who's speaking —
useful for earnings calls where different speakers (CEO vs analyst)
may signal different things.
"""

import json

import numpy as np


def _parse_probs(raw) -> list[dict]:
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
    return raw


def _probs_to_dict(probs: list[dict], prefix: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for p in probs:
        label = p.get("token", "").replace(f"{prefix}_", "")
        out[label] = p.get("probability", 0.0)
    return out


def extract_demographics_features(chunks: list[dict]) -> dict[str, float]:
    """Extract age/gender distribution features from STT chunks."""
    features: dict[str, float] = {}

    gender_dists: list[dict[str, float]] = []
    age_dists: list[dict[str, float]] = []

    for c in chunks:
        gp = _parse_probs(c.get("gender_probs"))
        ap = _parse_probs(c.get("age_probs"))
        if gp:
            gender_dists.append(_probs_to_dict(gp, "GENDER"))
        if ap:
            age_dists.append(_probs_to_dict(ap, "AGE"))

    # Gender features
    if gender_dists:
        all_labels = set()
        for gd in gender_dists:
            all_labels.update(gd.keys())
        for label in all_labels:
            vals = [gd.get(label, 0.0) for gd in gender_dists]
            features[f"gender_mean_{label}"] = float(np.mean(vals))
            features[f"gender_std_{label}"] = float(np.std(vals))

        male_probs = [gd.get("MALE", 0.0) for gd in gender_dists]
        female_probs = [gd.get("FEMALE", 0.0) for gd in gender_dists]
        features["gender_male_ratio"] = float(np.mean(male_probs))
        features["gender_diversity"] = float(np.std(male_probs))
    else:
        features.update({
            "gender_male_ratio": 0.5,
            "gender_diversity": 0.0,
        })

    # Age features
    age_order = ["0_18", "18_30", "30_45", "45_60", "60+"]
    if age_dists:
        all_labels = set()
        for ad in age_dists:
            all_labels.update(ad.keys())
        for label in all_labels:
            vals = [ad.get(label, 0.0) for ad in age_dists]
            features[f"age_mean_{label}"] = float(np.mean(vals))

        # Weighted average age (approximate midpoints)
        midpoints = {"0_18": 15, "18_30": 24, "30_45": 37, "45_60": 52, "60+": 65}
        avg_ages = []
        for ad in age_dists:
            weighted_sum = sum(ad.get(k, 0.0) * v for k, v in midpoints.items())
            total = sum(ad.get(k, 0.0) for k in midpoints)
            if total > 0:
                avg_ages.append(weighted_sum / total)
        features["speaker_avg_age"] = float(np.mean(avg_ages)) if avg_ages else 40.0
        features["speaker_age_std"] = float(np.std(avg_ages)) if len(avg_ages) > 1 else 0.0

        # Age shift (first half vs second half — speaker change detection)
        if len(age_dists) >= 4:
            half = len(age_dists) // 2
            first_avg = np.mean(avg_ages[:half]) if avg_ages[:half] else 40
            second_avg = np.mean(avg_ages[half:]) if avg_ages[half:] else 40
            features["age_shift"] = float(second_avg - first_avg)
        else:
            features["age_shift"] = 0.0
    else:
        features.update({
            "speaker_avg_age": 40.0,
            "speaker_age_std": 0.0,
            "age_shift": 0.0,
        })

    return features
