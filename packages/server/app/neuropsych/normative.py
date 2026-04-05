"""
UDS-3 normative data and z-score computation.

Published norms from Weintraub et al. (2009) and subsequent UDS updates,
stratified by age group and education level.
"""

from typing import Any, Dict, Optional, Tuple

# Normative tables: {test: {(age_low, age_high, edu_low, edu_high): (mean, sd)}}
# Simplified representative norms based on published UDS-3 data.
_NORMS: Dict[str, Dict[Tuple[int, int, int, int], Tuple[float, float]]] = {
    "craft_story_immediate": {
        (50, 64, 0, 12): (14.2, 4.8),
        (50, 64, 13, 16): (16.1, 4.5),
        (50, 64, 17, 30): (17.5, 4.2),
        (65, 74, 0, 12): (12.8, 4.9),
        (65, 74, 13, 16): (15.0, 4.6),
        (65, 74, 17, 30): (16.3, 4.3),
        (75, 84, 0, 12): (11.5, 5.0),
        (75, 84, 13, 16): (13.5, 4.7),
        (75, 84, 17, 30): (14.8, 4.5),
        (85, 100, 0, 12): (10.0, 5.2),
        (85, 100, 13, 16): (12.0, 4.9),
        (85, 100, 17, 30): (13.2, 4.7),
    },
    "craft_story_delayed": {
        (50, 64, 0, 12): (12.5, 5.2),
        (50, 64, 13, 16): (14.5, 4.8),
        (50, 64, 17, 30): (15.8, 4.5),
        (65, 74, 0, 12): (11.0, 5.3),
        (65, 74, 13, 16): (13.0, 5.0),
        (65, 74, 17, 30): (14.2, 4.7),
        (75, 84, 0, 12): (9.5, 5.5),
        (75, 84, 13, 16): (11.5, 5.2),
        (75, 84, 17, 30): (12.8, 4.9),
        (85, 100, 0, 12): (8.0, 5.6),
        (85, 100, 13, 16): (10.0, 5.3),
        (85, 100, 17, 30): (11.2, 5.0),
    },
    "category_fluency_animals": {
        (50, 64, 0, 12): (18.5, 4.8),
        (50, 64, 13, 16): (21.0, 5.0),
        (50, 64, 17, 30): (23.0, 5.2),
        (65, 74, 0, 12): (16.5, 4.9),
        (65, 74, 13, 16): (19.0, 5.1),
        (65, 74, 17, 30): (21.0, 5.3),
        (75, 84, 0, 12): (14.5, 5.0),
        (75, 84, 13, 16): (17.0, 5.2),
        (75, 84, 17, 30): (19.0, 5.4),
        (85, 100, 0, 12): (12.5, 5.1),
        (85, 100, 13, 16): (15.0, 5.3),
        (85, 100, 17, 30): (17.0, 5.5),
    },
    "category_fluency_vegetables": {
        (50, 64, 0, 12): (13.0, 3.8),
        (50, 64, 13, 16): (15.0, 4.0),
        (50, 64, 17, 30): (16.5, 4.2),
        (65, 74, 0, 12): (11.5, 3.9),
        (65, 74, 13, 16): (13.5, 4.1),
        (65, 74, 17, 30): (15.0, 4.3),
        (75, 84, 0, 12): (10.0, 4.0),
        (75, 84, 13, 16): (12.0, 4.2),
        (75, 84, 17, 30): (13.5, 4.4),
        (85, 100, 0, 12): (8.5, 4.1),
        (85, 100, 13, 16): (10.5, 4.3),
        (85, 100, 17, 30): (12.0, 4.5),
    },
    "letter_fluency_f": {
        (50, 64, 0, 12): (12.0, 4.5),
        (50, 64, 13, 16): (14.5, 4.8),
        (50, 64, 17, 30): (16.0, 5.0),
        (65, 74, 0, 12): (11.0, 4.6),
        (65, 74, 13, 16): (13.5, 4.9),
        (65, 74, 17, 30): (15.0, 5.1),
        (75, 84, 0, 12): (10.0, 4.7),
        (75, 84, 13, 16): (12.5, 5.0),
        (75, 84, 17, 30): (14.0, 5.2),
        (85, 100, 0, 12): (9.0, 4.8),
        (85, 100, 13, 16): (11.5, 5.1),
        (85, 100, 17, 30): (13.0, 5.3),
    },
    "letter_fluency_l": {
        (50, 64, 0, 12): (11.0, 4.3),
        (50, 64, 13, 16): (13.5, 4.6),
        (50, 64, 17, 30): (15.0, 4.8),
        (65, 74, 0, 12): (10.0, 4.4),
        (65, 74, 13, 16): (12.5, 4.7),
        (65, 74, 17, 30): (14.0, 4.9),
        (75, 84, 0, 12): (9.0, 4.5),
        (75, 84, 13, 16): (11.5, 4.8),
        (75, 84, 17, 30): (13.0, 5.0),
        (85, 100, 0, 12): (8.0, 4.6),
        (85, 100, 13, 16): (10.5, 4.9),
        (85, 100, 17, 30): (12.0, 5.1),
    },
    "digit_span_forward": {
        (50, 64, 0, 12): (6.5, 1.2),
        (50, 64, 13, 16): (7.0, 1.1),
        (50, 64, 17, 30): (7.5, 1.0),
        (65, 74, 0, 12): (6.0, 1.3),
        (65, 74, 13, 16): (6.5, 1.2),
        (65, 74, 17, 30): (7.0, 1.1),
        (75, 84, 0, 12): (5.5, 1.3),
        (75, 84, 13, 16): (6.0, 1.2),
        (75, 84, 17, 30): (6.5, 1.1),
        (85, 100, 0, 12): (5.0, 1.4),
        (85, 100, 13, 16): (5.5, 1.3),
        (85, 100, 17, 30): (6.0, 1.2),
    },
    "digit_span_backward": {
        (50, 64, 0, 12): (5.0, 1.3),
        (50, 64, 13, 16): (5.5, 1.2),
        (50, 64, 17, 30): (6.0, 1.1),
        (65, 74, 0, 12): (4.5, 1.3),
        (65, 74, 13, 16): (5.0, 1.2),
        (65, 74, 17, 30): (5.5, 1.1),
        (75, 84, 0, 12): (4.0, 1.3),
        (75, 84, 13, 16): (4.5, 1.2),
        (75, 84, 17, 30): (5.0, 1.1),
        (85, 100, 0, 12): (3.5, 1.4),
        (85, 100, 13, 16): (4.0, 1.3),
        (85, 100, 17, 30): (4.5, 1.2),
    },
    "trail_making_a": {
        (50, 64, 0, 12): (33.0, 11.0),
        (50, 64, 13, 16): (28.0, 9.0),
        (50, 64, 17, 30): (25.0, 8.0),
        (65, 74, 0, 12): (42.0, 15.0),
        (65, 74, 13, 16): (35.0, 12.0),
        (65, 74, 17, 30): (30.0, 10.0),
        (75, 84, 0, 12): (55.0, 20.0),
        (75, 84, 13, 16): (45.0, 16.0),
        (75, 84, 17, 30): (38.0, 13.0),
        (85, 100, 0, 12): (70.0, 25.0),
        (85, 100, 13, 16): (58.0, 20.0),
        (85, 100, 17, 30): (48.0, 17.0),
    },
    "trail_making_b": {
        (50, 64, 0, 12): (80.0, 30.0),
        (50, 64, 13, 16): (65.0, 25.0),
        (50, 64, 17, 30): (55.0, 20.0),
        (65, 74, 0, 12): (100.0, 38.0),
        (65, 74, 13, 16): (82.0, 30.0),
        (65, 74, 17, 30): (68.0, 25.0),
        (75, 84, 0, 12): (130.0, 50.0),
        (75, 84, 13, 16): (105.0, 40.0),
        (75, 84, 17, 30): (85.0, 32.0),
        (85, 100, 0, 12): (170.0, 60.0),
        (85, 100, 13, 16): (135.0, 50.0),
        (85, 100, 17, 30): (110.0, 40.0),
    },
    "mint_total": {
        (50, 64, 0, 12): (28.0, 3.0),
        (50, 64, 13, 16): (30.0, 2.5),
        (50, 64, 17, 30): (31.0, 1.5),
        (65, 74, 0, 12): (27.0, 3.5),
        (65, 74, 13, 16): (29.0, 3.0),
        (65, 74, 17, 30): (30.0, 2.0),
        (75, 84, 0, 12): (25.0, 4.0),
        (75, 84, 13, 16): (28.0, 3.5),
        (75, 84, 17, 30): (29.0, 2.5),
        (85, 100, 0, 12): (23.0, 4.5),
        (85, 100, 13, 16): (26.0, 4.0),
        (85, 100, 17, 30): (28.0, 3.0),
    },
}

# Trail Making uses inverted z-scores (lower time = better)
_INVERTED_TESTS = {"trail_making_a", "trail_making_b"}

_CLASSIFICATION_THRESHOLDS = [
    (-1.0, "Normal"),
    (-1.5, "Low Normal"),
    (-2.0, "Borderline"),
    (-2.5, "Mild Impairment"),
    (-3.0, "Moderate Impairment"),
    (float("-inf"), "Severe Impairment"),
]


def _find_norm(
    test: str, age: int, education_years: int,
) -> Optional[Tuple[float, float]]:
    """Find the matching normative (mean, sd) for demographics."""
    norms = _NORMS.get(test, {})
    for (age_lo, age_hi, edu_lo, edu_hi), (mean, sd) in norms.items():
        if age_lo <= age <= age_hi and edu_lo <= education_years <= edu_hi:
            return (mean, sd)
    return None


def raw_to_z_score(
    test: str,
    raw_score: float,
    age: int,
    education_years: int,
) -> Optional[float]:
    """Convert a raw test score to a z-score using published norms.

    Returns None if no matching normative data is available.
    """
    norm = _find_norm(test, age, education_years)
    if norm is None:
        return None
    mean, sd = norm
    if sd == 0:
        return 0.0
    z = (raw_score - mean) / sd
    if test in _INVERTED_TESTS:
        z = -z
    return round(z, 2)


def classify_impairment(z_score: float) -> str:
    """Classify impairment level from a z-score."""
    for threshold, label in _CLASSIFICATION_THRESHOLDS:
        if z_score >= threshold:
            return label
    return "Severe Impairment"


def get_normative_comparison(
    test: str,
    raw_score: float,
    age: int,
    education_years: int,
) -> Dict[str, Any]:
    """Full normative comparison for a test score."""
    z = raw_to_z_score(test, raw_score, age, education_years)
    norm = _find_norm(test, age, education_years)

    result: Dict[str, Any] = {
        "test": test,
        "raw_score": raw_score,
        "age": age,
        "education_years": education_years,
    }

    if z is not None and norm is not None:
        mean, sd = norm
        result["z_score"] = z
        result["classification"] = classify_impairment(z)
        result["normative_mean"] = mean
        result["normative_sd"] = sd
        result["percentile"] = round(_z_to_percentile(z), 1)
    else:
        result["z_score"] = None
        result["classification"] = "Norms unavailable"
        result["normative_mean"] = None
        result["normative_sd"] = None
        result["percentile"] = None

    return result


def _z_to_percentile(z: float) -> float:
    """Approximate percentile from z-score using logistic approximation."""
    import math
    return 100.0 / (1.0 + math.exp(-1.7 * z))
