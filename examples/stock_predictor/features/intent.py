"""
Intent features from Whissle STT intent classification.

Each STT chunk may have intent probabilities (e.g. COMMAND, QUESTION, OPINION,
STATEMENT). The distribution of speaker intents through a call reveals:
- How much grilling analysts do (question density)
- Whether the CEO shifts from statements to opinions (defensive behavior)
- Temporal dynamics of intent transitions
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


def _probs_to_dict(probs: list[dict], prefix: str = "INTENT") -> dict[str, float]:
    out: dict[str, float] = {}
    for p in probs:
        label = p.get("token", "").replace(f"{prefix}_", "")
        out[label] = p.get("probability", 0.0)
    return out


def extract_intent_features(chunks: list[dict]) -> dict[str, float]:
    """Extract intent distribution and transition features from STT chunks."""
    features: dict[str, float] = {}

    intent_dists: list[dict[str, float]] = []
    top_intents: list[str] = []

    for c in chunks:
        ip = _parse_probs(c.get("intent_probs"))
        if ip:
            d = _probs_to_dict(ip)
            intent_dists.append(d)
            if d:
                top_intents.append(max(d, key=d.get))

    if not intent_dists:
        return _empty_intent_features()

    all_labels = set()
    for d in intent_dists:
        all_labels.update(d.keys())

    for label in all_labels:
        vals = [d.get(label, 0.0) for d in intent_dists]
        features[f"intent_mean_{label.lower()}"] = float(np.mean(vals))

    # Question-heavy calls signal analyst skepticism
    question_labels = {"QUESTION", "question", "Query", "QUERY"}
    q_vals = []
    for d in intent_dists:
        q_vals.append(sum(d.get(ql, 0.0) for ql in question_labels))
    features["intent_question_ratio"] = float(np.mean(q_vals)) if q_vals else 0.0

    # Transition rate (how often the dominant intent changes)
    if len(top_intents) >= 2:
        transitions = sum(
            1 for i in range(1, len(top_intents))
            if top_intents[i] != top_intents[i - 1]
        )
        features["intent_transition_rate"] = transitions / max(len(top_intents) - 1, 1)
    else:
        features["intent_transition_rate"] = 0.0

    # Temporal shift: first half vs second half intent distribution
    if len(intent_dists) >= 4:
        half = len(intent_dists) // 2
        first_q = np.mean(q_vals[:half]) if q_vals[:half] else 0
        second_q = np.mean(q_vals[half:]) if q_vals[half:] else 0
        features["intent_question_shift"] = float(second_q - first_q)
    else:
        features["intent_question_shift"] = 0.0

    # Intent diversity (entropy-like measure)
    agg: dict[str, float] = {}
    for label in all_labels:
        agg[label] = float(np.mean([d.get(label, 0.0) for d in intent_dists]))
    total = sum(agg.values())
    if total > 0:
        normalized = {k: v / total for k, v in agg.items()}
        import math
        entropy = -sum(p * math.log2(p + 1e-10) for p in normalized.values() if p > 0)
        features["intent_entropy"] = entropy
    else:
        features["intent_entropy"] = 0.0

    return features


def _empty_intent_features() -> dict[str, float]:
    return {
        "intent_question_ratio": 0.0,
        "intent_transition_rate": 0.0,
        "intent_question_shift": 0.0,
        "intent_entropy": 0.0,
    }
