"""Shared neuropsych scoring stream — used by /neuropsych/score/stream and Live Assist neuropsych mode."""

import json
import logging
from typing import Any, AsyncGenerator, Dict

from .llm_client import get_llm_client

logger = logging.getLogger(__name__)


def sse_neuropsych(event: str, data: dict) -> str:
    payload = json.dumps({**data, "event": event}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def extract_raw_score(test_type: str, scoring: Dict[str, Any]) -> Any:
    if test_type in ("craft_story_immediate", "craft_story_delayed"):
        return scoring.get("total_score")
    elif "fluency" in test_type:
        return scoring.get("total_correct")
    elif "digit_span" in test_type:
        return scoring.get("span_length")
    elif "trail_making" in test_type:
        return scoring.get("completion_time_sec")
    elif test_type == "naming":
        return 1 if scoring.get("correct") else 0
    return None


async def llm_generate(prompt: str, *, max_tokens: int = 1024, temperature: float = 0.0) -> str:
    client = get_llm_client()
    return (await client.generate(prompt, max_tokens=max_tokens, temperature=temperature)).strip()


async def dispatch_scoring(test_type: str, body: dict) -> Dict[str, Any]:
    transcript = body.get("transcript", "")
    words = body.get("words", [])

    if test_type in ("craft_story_immediate", "craft_story_delayed"):
        from .neuropsych.story_recall import score_story_units
        return await score_story_units(transcript, llm_generate=llm_generate)

    elif test_type.startswith("category_fluency"):
        from .neuropsych.fluency import score_category_fluency
        category = "animals" if "animals" in test_type else "vegetables"
        dur = body.get("duration_sec") or 60.0
        return score_category_fluency(words, category, float(dur))

    elif test_type.startswith("letter_fluency"):
        from .neuropsych.fluency import score_letter_fluency
        letter = test_type.split("_")[-1].upper()
        dur = body.get("duration_sec") or 60.0
        return score_letter_fluency(words, letter, float(dur))

    elif test_type.startswith("digit_span"):
        from .neuropsych.digit_span import score_digit_span
        direction = "backward" if "backward" in test_type else "forward"
        target = body.get("target_sequence", [])
        word_texts = [w.get("word", "") for w in words if not w.get("filler")]
        return score_digit_span(word_texts, target, direction)

    elif test_type.startswith("trail_making"):
        from .neuropsych.trail_making import score_trail_making
        variant = "B" if "b" in test_type.lower().split("_")[-1] else "A"
        return score_trail_making(words, variant)

    elif test_type == "naming":
        from .neuropsych.naming import score_naming_response
        return score_naming_response(
            transcript,
            body.get("target_word", ""),
            body.get("cue_level", "none"),
            body.get("response_latency_sec", 0.0),
        )

    return {"error": f"Unknown test type: {test_type}"}


async def stream_neuropsych_scoring(body: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """Yield SSE lines (same format as neuropsych_router)."""
    test_type = body.get("test_type", "")
    patient = body.get("patient", {})

    if not test_type:
        yield sse_neuropsych("error", {"message": "test_type is required"})
        return

    yield sse_neuropsych("mode_detected", {"mode": "neuropsych", "label": "Neuropsych Scoring"})

    try:
        scoring = await dispatch_scoring(test_type, body)
        yield sse_neuropsych("scoring", scoring)

        age = patient.get("age", 70)
        edu = patient.get("education_years", 14)

        from .neuropsych.normative import get_normative_comparison
        raw = extract_raw_score(test_type, scoring)
        normative: Dict[str, Any] = {"z_score": None, "classification": "Score unavailable"}
        if raw is not None:
            norm_test = test_type
            if test_type.startswith("digit_span"):
                raw = scoring.get("span_length", raw)
            normative = get_normative_comparison(norm_test, raw, age, edu)
        yield sse_neuropsych("normative", normative)

        try:
            speech_rate = body.get("speech_rate") or {}
            analysis_prompt = f"""You are a clinical neuropsychologist interpreting a UDS-3 test result.

Test: {test_type}
Raw score: {raw}
Z-score: {normative.get('z_score')}
Classification: {normative.get('classification', '')}
Speech rate: {speech_rate.get('words_per_minute', 'N/A')} WPM
Filler rate: {speech_rate.get('filler_rate', 'N/A')} per minute

Scoring details: {json.dumps(scoring, default=str)[:1500]}

Provide a concise clinical interpretation (2-3 sentences) noting:
1. Performance relative to age/education norms
2. Any qualitative observations (perseverations, intrusions, clustering patterns, temporal trends)
3. Which cognitive domain(s) this reflects

Be precise and clinical. Use standard neuropsychological terminology."""
            analysis = await llm_generate(analysis_prompt, max_tokens=500, temperature=0.2)
        except Exception as e:
            logger.error("Analysis LLM failed: %s", e)
            z = normative.get("z_score")
            analysis = f"Score: {raw}" + (f" (z={z}, {normative.get('classification', '')})" if z else "") + ". Automated analysis unavailable."

        yield sse_neuropsych("analysis", {"text": analysis})
        yield sse_neuropsych("done", {
            "summary": analysis,
            "test_type": test_type,
            "scoring": scoring,
            "normative": normative,
        })

    except Exception as e:
        logger.error("Neuropsych scoring error for %s: %s", test_type, e, exc_info=True)
        yield sse_neuropsych("error", {"message": f"Scoring failed: {e}"})
        yield sse_neuropsych("done", {"summary": f"Scoring error: {e}"})
