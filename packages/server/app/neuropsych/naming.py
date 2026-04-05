"""
Multilingual Naming Test (MINT) response scoring.

Classifies naming errors by type using phonemic and semantic distance
from the target word.
"""

from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional


def _phonemic_similarity(a: str, b: str) -> float:
    """Compute phonemic similarity ratio between two words."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def score_naming_response(
    response_text: str,
    target_word: str,
    cue_level: str = "none",
    response_latency_sec: float = 0.0,
) -> Dict[str, Any]:
    """Score a single naming test response.

    Args:
        response_text: what the patient said (from STT)
        target_word: expected correct answer
        cue_level: "none", "semantic", or "phonemic"
        response_latency_sec: time from stimulus to response

    Returns dict with correct, error_type, phonemic_similarity,
    response, target, cue_level, response_latency_sec.
    """
    response = response_text.lower().strip(".,!?;:'\" ")
    target = target_word.lower().strip()

    if not response or response in ("i don't know", "pass", "skip", "no"):
        return {
            "correct": False,
            "error_type": "no_response",
            "phonemic_similarity": 0.0,
            "response": response_text,
            "target": target_word,
            "cue_level": cue_level,
            "response_latency_sec": response_latency_sec,
        }

    if response == target or response.rstrip("s") == target or target.rstrip("s") == response:
        return {
            "correct": True,
            "error_type": None,
            "phonemic_similarity": 1.0,
            "response": response_text,
            "target": target_word,
            "cue_level": cue_level,
            "response_latency_sec": response_latency_sec,
        }

    sim = _phonemic_similarity(response, target)

    if sim >= 0.6:
        error_type = "phonemic_paraphasia"
    elif sim >= 0.3:
        error_type = "semantic_paraphasia"
    else:
        error_type = "neologism" if sim < 0.15 else "unrelated"

    return {
        "correct": False,
        "error_type": error_type,
        "phonemic_similarity": round(sim, 3),
        "response": response_text,
        "target": target_word,
        "cue_level": cue_level,
        "response_latency_sec": response_latency_sec,
    }


def score_naming_test(
    trial_results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute overall MINT score from per-item results.

    MINT score = total correct without cues + correct with semantic cue +
    correct with phonemic cue.
    """
    spontaneous_correct = sum(1 for t in trial_results if t["correct"] and t["cue_level"] == "none")
    semantic_cue_correct = sum(1 for t in trial_results if t["correct"] and t["cue_level"] == "semantic")
    phonemic_cue_correct = sum(1 for t in trial_results if t["correct"] and t["cue_level"] == "phonemic")
    total_correct = sum(1 for t in trial_results if t["correct"])

    error_types: Dict[str, int] = {}
    for t in trial_results:
        if not t["correct"] and t.get("error_type"):
            et = t["error_type"]
            error_types[et] = error_types.get(et, 0) + 1

    latencies = [t["response_latency_sec"] for t in trial_results if t.get("response_latency_sec", 0) > 0]
    mean_latency = sum(latencies) / max(1, len(latencies))

    return {
        "total_correct": total_correct,
        "spontaneous_correct": spontaneous_correct,
        "semantic_cue_correct": semantic_cue_correct,
        "phonemic_cue_correct": phonemic_cue_correct,
        "total_items": len(trial_results),
        "error_types": error_types,
        "mean_response_latency_sec": round(mean_latency, 3),
    }
