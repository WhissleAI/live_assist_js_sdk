"""
Category and Letter fluency scoring with clustering and switching analysis.
"""

import logging
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional

from .stimuli import ANIMAL_SUBCATEGORIES

logger = logging.getLogger(__name__)

_CATEGORY_MEMBERS: Dict[str, set] = {}


def _get_category_set(category: str) -> set:
    """Build a flat set of known valid members for a category."""
    if category not in _CATEGORY_MEMBERS:
        if category == "animals":
            members = set()
            for subcat_words in ANIMAL_SUBCATEGORIES.values():
                members.update(w.lower() for w in subcat_words)
            _CATEGORY_MEMBERS[category] = members
        else:
            _CATEGORY_MEMBERS[category] = set()
    return _CATEGORY_MEMBERS[category]


def _normalize_word(w: str) -> str:
    """Lowercase, strip punctuation, and basic singular/plural normalization."""
    w = w.lower().strip(".,!?;:'\"")
    if w.endswith("es") and len(w) > 4:
        return w[:-2]
    if w.endswith("s") and len(w) > 3:
        return w[:-1]
    return w


def _is_perseveration(word: str, seen: List[str], threshold: float = 0.75) -> bool:
    """Check if word is a fuzzy duplicate of any previously seen word."""
    nw = _normalize_word(word)
    for s in seen:
        ns = _normalize_word(s)
        if ns == nw:
            return True
        if SequenceMatcher(None, ns, nw).ratio() >= threshold:
            return True
    return False


def _find_subcategory(word: str, category: str) -> Optional[str]:
    """Return the subcategory label for a word, if known."""
    if category != "animals":
        return None
    nw = _normalize_word(word)
    for subcat, members in ANIMAL_SUBCATEGORIES.items():
        if nw in [m.lower() for m in members]:
            return subcat
    return None


def score_category_fluency(
    words: List[Dict[str, Any]],
    category: str,
    duration_sec: float = 60.0,
) -> Dict[str, Any]:
    """Score a category fluency trial from word timestamps.

    Args:
        words: list of {word, start, end, confidence, filler} from STT
        category: e.g. "animals", "vegetables"
        duration_sec: test duration (default 60s)

    Returns dict with total_correct, perseverations, intrusions, clusters,
    n_switches, mean_cluster_size, time_bins.
    """
    valid_set = _get_category_set(category)
    content_words = [w for w in words if not w.get("filler", False)]

    correct: List[Dict[str, Any]] = []
    perseverations: List[Dict[str, Any]] = []
    intrusions: List[Dict[str, Any]] = []
    seen_correct: List[str] = []

    for w in content_words:
        word_text = w["word"]
        nw = _normalize_word(word_text)

        if _is_perseveration(word_text, seen_correct):
            perseverations.append({"word": word_text, "time": w.get("start", 0)})
            continue

        if valid_set and nw not in valid_set:
            intrusions.append({"word": word_text, "time": w.get("start", 0)})
            continue

        seen_correct.append(word_text)
        subcat = _find_subcategory(word_text, category)
        correct.append({
            "word": word_text,
            "time": w.get("start", 0),
            "subcategory": subcat,
        })

    # Clustering and switching analysis
    clusters: List[Dict[str, Any]] = []
    current_cluster: List[str] = []
    current_subcat: Optional[str] = None
    n_switches = 0

    for item in correct:
        sc = item.get("subcategory")
        if sc is None:
            if current_cluster:
                clusters.append({"subcategory": current_subcat, "words": list(current_cluster), "size": len(current_cluster)})
            current_cluster = [item["word"]]
            current_subcat = "unknown"
            n_switches += 1
        elif sc != current_subcat:
            if current_cluster:
                clusters.append({"subcategory": current_subcat, "words": list(current_cluster), "size": len(current_cluster)})
            current_cluster = [item["word"]]
            current_subcat = sc
            n_switches += 1
        else:
            current_cluster.append(item["word"])

    if current_cluster:
        clusters.append({"subcategory": current_subcat, "words": list(current_cluster), "size": len(current_cluster)})

    cluster_sizes = [c["size"] for c in clusters]
    mean_cluster_size = sum(cluster_sizes) / max(1, len(cluster_sizes))

    # Time-bin analysis (quartiles)
    bin_size = duration_sec / 4.0
    time_bins = [0, 0, 0, 0]
    for item in correct:
        t = item["time"]
        idx = min(3, int(t / bin_size))
        time_bins[idx] += 1

    return {
        "total_correct": len(correct),
        "perseverations": perseverations,
        "perseveration_count": len(perseverations),
        "intrusions": intrusions,
        "intrusion_count": len(intrusions),
        "clusters": clusters,
        "n_switches": max(0, n_switches - 1),
        "mean_cluster_size": round(mean_cluster_size, 2),
        "time_bins": time_bins,
        "correct_words": correct,
    }


def score_letter_fluency(
    words: List[Dict[str, Any]],
    letter: str,
    duration_sec: float = 60.0,
) -> Dict[str, Any]:
    """Score a letter fluency trial (F, A, S, L, etc.)."""
    content_words = [w for w in words if not w.get("filler", False)]
    letter_lower = letter.lower()

    correct: List[Dict[str, Any]] = []
    perseverations: List[Dict[str, Any]] = []
    intrusions: List[Dict[str, Any]] = []
    seen_correct: List[str] = []

    for w in content_words:
        word_text = w["word"]
        nw = _normalize_word(word_text)

        if _is_perseveration(word_text, seen_correct):
            perseverations.append({"word": word_text, "time": w.get("start", 0)})
            continue

        if not nw.startswith(letter_lower):
            intrusions.append({"word": word_text, "time": w.get("start", 0)})
            continue

        seen_correct.append(word_text)
        correct.append({"word": word_text, "time": w.get("start", 0)})

    bin_size = duration_sec / 4.0
    time_bins = [0, 0, 0, 0]
    for item in correct:
        idx = min(3, int(item["time"] / bin_size))
        time_bins[idx] += 1

    return {
        "total_correct": len(correct),
        "perseverations": perseverations,
        "perseveration_count": len(perseverations),
        "intrusions": intrusions,
        "intrusion_count": len(intrusions),
        "time_bins": time_bins,
        "correct_words": correct,
    }
