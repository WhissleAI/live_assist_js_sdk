"""
Craft Story 21 scoring — LLM-based semantic matching of recalled
story units against canonical units.
"""

import json
import logging
from typing import Any, Dict, List

from .stimuli import CRAFT_STORY_UNITS

logger = logging.getLogger(__name__)


async def score_story_units(
    transcript: str,
    canonical_units: List[str] | None = None,
    *,
    llm_generate=None,
) -> Dict[str, Any]:
    """Score a patient's recall against the 25 Craft Story units.

    Uses LLM-based semantic matching: each canonical unit is compared to
    the transcript and classified as verbatim, paraphrase, or omitted.

    Returns dict with verbatim_count, paraphrase_count, total_score,
    intrusions, omissions, and per-unit detail.
    """
    units = canonical_units or CRAFT_STORY_UNITS
    if llm_generate is None:
        raise ValueError("llm_generate callable is required")

    prompt = f"""You are a neuropsychological test scorer for the Craft Story 21 recall test.

Compare the patient's recall against each canonical story unit and classify each as:
- "verbatim" — the patient used the exact word or a very close synonym
- "paraphrase" — the patient conveyed the same meaning with different words
- "omitted" — the patient did not mention this unit

Also identify any "intrusions" — details the patient added that are NOT in the original story.

Canonical story units (25 total):
{json.dumps(units, indent=2)}

Patient's recall transcript:
"{transcript}"

Respond with ONLY valid JSON (no markdown):
{{
  "units": [
    {{"unit": "Anna", "match": "verbatim"|"paraphrase"|"omitted", "patient_text": "..."}}
  ],
  "intrusions": ["detail not in story", ...]
}}"""

    try:
        raw = await llm_generate(prompt, max_tokens=2000, temperature=0.0)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]
        result = json.loads(raw)
    except Exception as e:
        logger.error("Story recall LLM scoring failed: %s", e)
        return {
            "verbatim_count": 0,
            "paraphrase_count": 0,
            "total_score": 0,
            "intrusions": [],
            "omissions": list(units),
            "unit_details": [],
            "error": str(e),
        }

    unit_details = result.get("units", [])
    verbatim = sum(1 for u in unit_details if u.get("match") == "verbatim")
    paraphrase = sum(1 for u in unit_details if u.get("match") == "paraphrase")
    omissions = [u["unit"] for u in unit_details if u.get("match") == "omitted"]
    intrusions = result.get("intrusions", [])

    return {
        "verbatim_count": verbatim,
        "paraphrase_count": paraphrase,
        "total_score": verbatim + paraphrase,
        "intrusions": intrusions,
        "omissions": omissions,
        "unit_details": unit_details,
    }
