"""
NACC UDS Form C2 export — maps session results to NACC field codes
and generates CSV rows for submission.
"""

import csv
import io
from typing import Any, Dict, List, Optional

# NACC Form C2 field code mapping
_FIELD_MAP = {
    "craft_story_immediate": "CRAFTVRS",
    "craft_story_delayed": "CRAFTDVR",
    "craft_story_immediate_paraphrase": "CRAFTCUE",
    "category_fluency_animals": "ANIMALS",
    "category_fluency_vegetables": "VEG",
    "letter_fluency_f": "TRATEFLU",
    "letter_fluency_l": "TRATELFL",
    "digit_span_forward": "DIGFORCT",
    "digit_span_forward_span": "DIGFORSL",
    "digit_span_backward": "DIGBACCT",
    "digit_span_backward_span": "DIGBACLS",
    "trail_making_a": "TRATEFLA",
    "trail_making_b": "TRATEFLB",
    "mint_total": "MINTTOTS",
}

_HEADER_FIELDS = [
    "NACCID", "VISITDATE", "FORMVER",
    "CRAFTVRS", "CRAFTCUE", "CRAFTDVR",
    "ANIMALS", "VEG",
    "TRATEFLU", "TRATELFL",
    "DIGFORCT", "DIGFORSL", "DIGBACCT", "DIGBACLS",
    "TRATEFLA", "TRATEFLB",
    "MINTTOTS",
    "MOCATOTS",
]


def generate_form_c2(
    session_results: Dict[str, Any],
    patient_id: str = "",
    visit_date: str = "",
) -> Dict[str, Any]:
    """Map a completed session's results to NACC Form C2 fields.

    Args:
        session_results: dict keyed by test_type with scoring dicts
        patient_id: NACC participant ID
        visit_date: date of visit (YYYY-MM-DD)

    Returns dict with 'fields' (code->value mapping) and 'csv' (CSV string).
    """
    fields: Dict[str, Any] = {
        "NACCID": patient_id,
        "VISITDATE": visit_date,
        "FORMVER": "3.2",
    }

    for test_key, nacc_code in _FIELD_MAP.items():
        result = session_results.get(test_key)
        if result is None:
            fields[nacc_code] = ""
            continue

        if test_key in ("craft_story_immediate", "craft_story_delayed"):
            fields[nacc_code] = result.get("verbatim_count", "")
        elif test_key == "craft_story_immediate_paraphrase":
            imm = session_results.get("craft_story_immediate")
            fields[nacc_code] = imm.get("paraphrase_count", "") if imm else ""
        elif test_key in ("category_fluency_animals", "category_fluency_vegetables"):
            fields[nacc_code] = result.get("total_correct", "")
        elif test_key.startswith("letter_fluency"):
            fields[nacc_code] = result.get("total_correct", "")
        elif test_key == "digit_span_forward":
            fields[nacc_code] = result.get("forward_correct_trials", "")
        elif test_key == "digit_span_forward_span":
            fields[nacc_code] = result.get("forward_span", "")
        elif test_key == "digit_span_backward":
            fields[nacc_code] = result.get("backward_correct_trials", "")
        elif test_key == "digit_span_backward_span":
            fields[nacc_code] = result.get("backward_span", "")
        elif test_key == "trail_making_a":
            fields[nacc_code] = result.get("completion_time_sec", "")
        elif test_key == "trail_making_b":
            fields[nacc_code] = result.get("completion_time_sec", "")
        elif test_key == "mint_total":
            fields[nacc_code] = result.get("total_correct", "")

    csv_str = _generate_csv_row(fields)
    return {"fields": fields, "csv": csv_str}


def _generate_csv_row(fields: Dict[str, Any]) -> str:
    """Generate a single CSV row from field values."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(_HEADER_FIELDS)
    writer.writerow([fields.get(h, "") for h in _HEADER_FIELDS])
    return output.getvalue()
