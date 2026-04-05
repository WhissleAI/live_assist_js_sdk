"""
Neuropsychological scoring tools for the Whissle agent.

Each scoring function is wrapped as a LangChain StructuredTool so it can be
bound to any LLM-based agent (Live Assist, Voice Agent, etc.).  Tools execute
server-side and return structured JSON results.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ── Pydantic input schemas ──────────────────────────────────────────────────

class WordInput(BaseModel):
    word: str
    start: float = 0.0
    end: float = 0.0
    confidence: float = 1.0
    filler: bool = False


class CraftStoryInput(BaseModel):
    transcript: str = Field(description="Patient's recalled story text")


class CategoryFluencyInput(BaseModel):
    words: List[WordInput] = Field(description="STT word timestamps from patient speech")
    category: str = Field(description="'animals' or 'vegetables'")
    duration_sec: float = Field(default=60.0, description="Test duration in seconds")


class LetterFluencyInput(BaseModel):
    words: List[WordInput] = Field(description="STT word timestamps from patient speech")
    letter: str = Field(description="Target letter (F, L, etc.)")
    duration_sec: float = Field(default=60.0, description="Test duration in seconds")


class DigitSpanInput(BaseModel):
    response_words: List[str] = Field(description="Spoken words from patient response")
    target_sequence: List[int] = Field(description="Expected digit sequence")
    direction: str = Field(default="forward", description="'forward' or 'backward'")


class TrailMakingInput(BaseModel):
    words: List[WordInput] = Field(description="STT word timestamps from patient speech")
    variant: str = Field(default="A", description="'A' (numbers) or 'B' (alternating)")


class NamingInput(BaseModel):
    response_text: str = Field(description="Patient's spoken naming response")
    target_word: str = Field(description="Correct target word")
    cue_level: str = Field(default="none", description="'none', 'semantic', or 'phonemic'")
    response_latency_sec: float = Field(default=0.0, description="Time from stimulus to response")


class NormativeInput(BaseModel):
    test_type: str = Field(description="Test identifier (e.g. 'letter_fluency_f', 'craft_story_immediate')")
    raw_score: float = Field(description="Raw test score")
    age: int = Field(description="Patient age in years")
    education_years: int = Field(description="Years of formal education")


class ClinicalAnalysisInput(BaseModel):
    test_type: str = Field(description="Test identifier")
    raw_score: float = Field(description="Raw score")
    z_score: Optional[float] = Field(default=None, description="Normative z-score if available")
    classification: str = Field(default="", description="Impairment classification")
    scoring_details: str = Field(default="", description="JSON string of detailed scoring output")
    speech_rate_wpm: float = Field(default=0.0)
    filler_rate: float = Field(default=0.0)


# ── Tool implementations ────────────────────────────────────────────────────

def _score_craft_story(transcript: str) -> str:
    """Craft Story scoring needs LLM — return a placeholder asking the agent to do semantic matching."""
    from .neuropsych.stimuli import CRAFT_STORY_UNITS
    return json.dumps({
        "note": "Craft Story requires LLM semantic matching. Use the transcript and these canonical units to score.",
        "canonical_units": CRAFT_STORY_UNITS,
        "patient_transcript": transcript,
        "instructions": (
            "Compare the patient transcript against each canonical unit. "
            "Classify each as 'verbatim', 'paraphrase', or 'omitted'. "
            "Return: verbatim_count, paraphrase_count, total_score (verbatim+paraphrase), "
            "omissions list, intrusions list."
        ),
    })


def _score_category_fluency(words: List[WordInput], category: str, duration_sec: float) -> str:
    from .neuropsych.fluency import score_category_fluency
    word_dicts = [w.model_dump() for w in words]
    result = score_category_fluency(word_dicts, category, duration_sec)
    return json.dumps(result, default=str)


def _score_letter_fluency(words: List[WordInput], letter: str, duration_sec: float) -> str:
    from .neuropsych.fluency import score_letter_fluency
    word_dicts = [w.model_dump() for w in words]
    result = score_letter_fluency(word_dicts, letter, duration_sec)
    return json.dumps(result, default=str)


def _score_digit_span(response_words: List[str], target_sequence: List[int], direction: str) -> str:
    from .neuropsych.digit_span import score_digit_span
    result = score_digit_span(response_words, target_sequence, direction)
    return json.dumps(result, default=str)


def _score_trail_making(words: List[WordInput], variant: str) -> str:
    from .neuropsych.trail_making import score_trail_making
    word_dicts = [w.model_dump() for w in words]
    result = score_trail_making(word_dicts, variant)
    return json.dumps(result, default=str)


def _score_naming(response_text: str, target_word: str, cue_level: str, response_latency_sec: float) -> str:
    from .neuropsych.naming import score_naming_response
    result = score_naming_response(response_text, target_word, cue_level, response_latency_sec)
    return json.dumps(result, default=str)


def _get_normative(test_type: str, raw_score: float, age: int, education_years: int) -> str:
    from .neuropsych.normative import get_normative_comparison
    result = get_normative_comparison(test_type, raw_score, age, education_years)
    return json.dumps(result, default=str)


def _generate_clinical_analysis(
    test_type: str, raw_score: float, z_score: Optional[float],
    classification: str, scoring_details: str,
    speech_rate_wpm: float, filler_rate: float,
) -> str:
    return json.dumps({
        "instruction": (
            "Generate a concise 2-3 sentence clinical interpretation noting: "
            "1) Performance relative to age/education norms, "
            "2) Qualitative observations, "
            "3) Cognitive domain(s) assessed. "
            "Use standard neuropsychological terminology."
        ),
        "test_type": test_type,
        "raw_score": raw_score,
        "z_score": z_score,
        "classification": classification,
        "scoring_details": scoring_details,
        "speech_rate_wpm": speech_rate_wpm,
        "filler_rate": filler_rate,
    })


# ── Exported tool list ──────────────────────────────────────────────────────

def get_neuropsych_tools() -> List[StructuredTool]:
    """Return all neuropsych scoring tools for binding to a chat model."""
    return [
        StructuredTool.from_function(
            func=_score_craft_story,
            name="score_craft_story",
            description=(
                "Score a Craft Story 21 recall test. Takes the patient's spoken transcript "
                "and returns canonical units for semantic matching. The agent should then "
                "classify each unit as verbatim/paraphrase/omitted."
            ),
            args_schema=CraftStoryInput,
        ),
        StructuredTool.from_function(
            func=_score_category_fluency,
            name="score_category_fluency",
            description=(
                "Score a category fluency test (animals or vegetables). Analyzes word timestamps "
                "to compute total correct, perseverations, intrusions, clustering, switching, "
                "and time-bin analysis."
            ),
            args_schema=CategoryFluencyInput,
        ),
        StructuredTool.from_function(
            func=_score_letter_fluency,
            name="score_letter_fluency",
            description=(
                "Score a letter fluency test (F, L, A, S, etc.). Analyzes word timestamps "
                "to compute total correct, perseverations, intrusions, and time-bin analysis."
            ),
            args_schema=LetterFluencyInput,
        ),
        StructuredTool.from_function(
            func=_score_digit_span,
            name="score_digit_span",
            description=(
                "Score a digit span trial (forward or backward). Compares spoken digit response "
                "against target sequence, handling word-to-digit conversion."
            ),
            args_schema=DigitSpanInput,
        ),
        StructuredTool.from_function(
            func=_score_trail_making,
            name="score_trail_making",
            description=(
                "Score an oral Trail Making Test (Part A or B). Validates spoken sequence, "
                "computes completion time, errors, self-corrections, and error types."
            ),
            args_schema=TrailMakingInput,
        ),
        StructuredTool.from_function(
            func=_score_naming,
            name="score_naming",
            description=(
                "Score a single MINT (Multilingual Naming Test) response. Classifies errors "
                "by type (phonemic paraphasia, semantic paraphasia, neologism) using "
                "phonemic similarity analysis."
            ),
            args_schema=NamingInput,
        ),
        StructuredTool.from_function(
            func=_get_normative,
            name="get_normative_comparison",
            description=(
                "Compute normative comparison for a test score. Returns z-score, percentile, "
                "impairment classification, and normative mean/SD based on age and education."
            ),
            args_schema=NormativeInput,
        ),
        StructuredTool.from_function(
            func=_generate_clinical_analysis,
            name="generate_clinical_analysis",
            description=(
                "Generate clinical analysis template for a neuropsych test result. "
                "Returns structured data for the agent to compose a clinical interpretation."
            ),
            args_schema=ClinicalAnalysisInput,
        ),
    ]


def get_openai_neuropsych_tool_definitions() -> List[Dict[str, Any]]:
    """OpenAI-compatible function definitions for /voice-agent/chat/stream and Next.js clients."""
    out: List[Dict[str, Any]] = []
    for t in get_neuropsych_tools():
        schema_cls = t.args_schema
        if schema_cls is None:
            parameters: Dict[str, Any] = {"type": "object", "properties": {}}
        elif hasattr(schema_cls, "model_json_schema"):
            parameters = schema_cls.model_json_schema()
        else:
            parameters = schema_cls.schema()
        out.append({
            "type": "function",
            "function": {
                "name": t.name,
                "description": (t.description or "").strip(),
                "parameters": parameters,
            },
        })
    return out
