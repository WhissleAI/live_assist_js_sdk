"""
Digit Span Forward and Backward scoring.

Handles word-to-digit normalization from STT output and compares
the response sequence against the target.
"""

from typing import Any, Dict, List, Optional

WORD_TO_DIGIT = {
    "zero": 0, "oh": 0, "o": 0,
    "one": 1, "won": 1,
    "two": 2, "to": 2, "too": 2,
    "three": 3,
    "four": 4, "for": 4, "fore": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8, "ate": 8,
    "nine": 9,
}


def _word_to_digit(word: str) -> Optional[int]:
    """Convert a spoken word to its digit value."""
    w = word.lower().strip(".,!?;:'\"")
    if w in WORD_TO_DIGIT:
        return WORD_TO_DIGIT[w]
    if w.isdigit() and len(w) == 1:
        return int(w)
    return None


def normalize_digit_response(words: List[str]) -> List[int]:
    """Convert a list of spoken words to digit values, skipping non-digits."""
    result = []
    for w in words:
        d = _word_to_digit(w)
        if d is not None:
            result.append(d)
    return result


def score_digit_span(
    response_words: List[str],
    target_sequence: List[int],
    direction: str = "forward",
) -> Dict[str, Any]:
    """Score a single digit span trial.

    Args:
        response_words: list of spoken words from STT
        target_sequence: expected digit sequence
        direction: "forward" or "backward"

    Returns dict with correct, response_digits, target, errors, span_length.
    """
    response_digits = normalize_digit_response(response_words)

    expected = list(target_sequence)
    if direction == "backward":
        expected = list(reversed(expected))

    correct = response_digits == expected

    errors: List[Dict[str, Any]] = []
    for i in range(max(len(response_digits), len(expected))):
        resp_d = response_digits[i] if i < len(response_digits) else None
        exp_d = expected[i] if i < len(expected) else None
        if resp_d != exp_d:
            errors.append({
                "position": i,
                "expected": exp_d,
                "got": resp_d,
            })

    return {
        "correct": correct,
        "response_digits": response_digits,
        "target": expected,
        "direction": direction,
        "span_length": len(target_sequence),
        "errors": errors,
    }


def compute_digit_span_score(
    trial_results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute overall digit span score from multiple trials.

    UDS-3 scoring: longest span at which at least 1 of 2 trials is correct.
    """
    max_forward = 0
    max_backward = 0
    forward_total = 0
    backward_total = 0

    for trial in trial_results:
        if trial["correct"]:
            span = trial["span_length"]
            if trial["direction"] == "forward":
                max_forward = max(max_forward, span)
                forward_total += 1
            else:
                max_backward = max(max_backward, span)
                backward_total += 1

    return {
        "forward_span": max_forward,
        "backward_span": max_backward,
        "forward_correct_trials": forward_total,
        "backward_correct_trials": backward_total,
        "total_correct_trials": forward_total + backward_total,
    }
