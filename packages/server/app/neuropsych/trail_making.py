"""
Trail Making Test (Oral) — Parts A and B scoring.

Validates the spoken sequence against the expected order and
computes completion time, errors, and self-corrections.
"""

from typing import Any, Dict, List

from .stimuli import TMT_A_SEQUENCE, TMT_B_SEQUENCE

WORD_TO_NUMBER = {
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14",
    "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18",
    "nineteen": "19", "twenty": "20", "twenty-one": "21", "twenty-two": "22",
    "twenty-three": "23", "twenty-four": "24", "twenty-five": "25",
}


def _normalize_tmt_item(word: str) -> str:
    """Normalize a spoken TMT item to its canonical form."""
    w = word.lower().strip(".,!?;:'\"")
    if w in WORD_TO_NUMBER:
        return WORD_TO_NUMBER[w]
    if w.isdigit():
        return w
    if len(w) == 1 and w.isalpha():
        return w.upper()
    return w.upper()


def score_trail_making(
    words: List[Dict[str, Any]],
    variant: str = "A",
) -> Dict[str, Any]:
    """Score an oral Trail Making Test from word timestamps.

    Args:
        words: list of {word, start, end, confidence, filler} from STT
        variant: "A" (numbers only) or "B" (alternating numbers/letters)

    Returns dict with completion_time_sec, errors, self_corrections,
    error_types, sequence_produced, correct_items.
    """
    expected = list(TMT_A_SEQUENCE) if variant == "A" else list(TMT_B_SEQUENCE)

    content_words = [w for w in words if not w.get("filler", False)]
    if not content_words:
        return {
            "completion_time_sec": 0,
            "errors": [],
            "self_corrections": [],
            "error_types": {"sequencing": 0, "perseveration": 0, "omission": 0},
            "sequence_produced": [],
            "correct_items": 0,
            "total_expected": len(expected),
        }

    normalized = [
        {"item": _normalize_tmt_item(w["word"]), "time": w.get("start", 0), "original": w["word"]}
        for w in content_words
    ]

    first_time = content_words[0].get("start", 0)
    last_time = content_words[-1].get("end", content_words[-1].get("start", 0))
    completion_time = round(last_time - first_time, 3)

    errors: List[Dict[str, Any]] = []
    self_corrections: List[Dict[str, Any]] = []
    error_types = {"sequencing": 0, "perseveration": 0, "omission": 0}

    expected_idx = 0
    correct_items = 0
    sequence_produced: List[str] = []
    seen_items: List[str] = []

    for n in normalized:
        item = n["item"]
        sequence_produced.append(item)

        if item in seen_items:
            errors.append({
                "item": item,
                "time": n["time"],
                "type": "perseveration",
                "expected": expected[expected_idx] if expected_idx < len(expected) else None,
            })
            error_types["perseveration"] += 1
            continue

        if expected_idx < len(expected) and item == expected[expected_idx]:
            correct_items += 1
            seen_items.append(item)
            expected_idx += 1
        elif expected_idx + 1 < len(expected) and item == expected[expected_idx + 1]:
            errors.append({
                "item": expected[expected_idx],
                "time": n["time"],
                "type": "omission",
                "expected": expected[expected_idx],
            })
            error_types["omission"] += 1
            expected_idx += 1
            correct_items += 1
            seen_items.append(item)
            expected_idx += 1
        else:
            # Check if this is a self-correction (backtrack)
            if expected_idx > 0 and item == expected[expected_idx - 1]:
                self_corrections.append({"item": item, "time": n["time"]})
            else:
                errors.append({
                    "item": item,
                    "time": n["time"],
                    "type": "sequencing",
                    "expected": expected[expected_idx] if expected_idx < len(expected) else None,
                })
                error_types["sequencing"] += 1

    return {
        "completion_time_sec": completion_time,
        "errors": errors,
        "self_corrections": self_corrections,
        "error_types": error_types,
        "sequence_produced": sequence_produced,
        "correct_items": correct_items,
        "total_expected": len(expected),
    }
