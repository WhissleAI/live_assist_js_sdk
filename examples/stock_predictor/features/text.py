"""
Text-based features from transcripts.

NLP features extracted from the spoken content — sentiment, hedging language,
confidence language, financial terms, question density, etc.
"""

import re
from typing import Any

from textblob import TextBlob

HEDGING_WORDS = {
    "might", "maybe", "perhaps", "possibly", "could", "uncertain",
    "unclear", "hopefully", "somewhat", "relatively", "approximately",
    "roughly", "potentially", "conceivably", "likely", "unlikely",
    "may", "appear", "seems", "suggest",
}

CONFIDENCE_WORDS = {
    "definitely", "certainly", "absolutely", "confident", "strong",
    "robust", "excellent", "outstanding", "exceptional", "impressive",
    "solid", "remarkable", "significant", "substantial", "clearly",
    "expect", "committed", "delivered", "achieved", "exceeded",
}

NEGATIVE_FINANCIAL = {
    "decline", "loss", "losses", "headwind", "headwinds", "challenging",
    "deterioration", "weakness", "slowdown", "downturn", "miss",
    "missed", "shortfall", "impairment", "restructuring", "layoff",
    "layoffs", "recession", "contraction", "default", "downgrade",
}

POSITIVE_FINANCIAL = {
    "growth", "revenue", "beat", "exceeded", "outperformed", "margin",
    "expansion", "recovery", "upside", "tailwind", "momentum",
    "acceleration", "record", "breakthrough", "innovation", "dividend",
    "buyback", "upgrade", "bullish", "optimistic",
}


def _count_matches(text: str, word_set: set[str]) -> int:
    words = re.findall(r"\b\w+\b", text.lower())
    return sum(1 for w in words if w in word_set)


def extract_text_features(chunks: list[dict]) -> dict[str, float]:
    """Extract NLP features from transcript chunks."""
    features: dict[str, float] = {}

    transcripts = [c.get("transcript", "") for c in chunks if c.get("transcript")]
    if not transcripts:
        return _empty_text_features()

    full_text = " ".join(transcripts)
    word_count = len(re.findall(r"\b\w+\b", full_text))
    sentence_count = max(len(re.split(r"[.!?]+", full_text)), 1)

    # TextBlob sentiment
    blob = TextBlob(full_text)
    features["text_sentiment_polarity"] = float(blob.sentiment.polarity)
    features["text_sentiment_subjectivity"] = float(blob.sentiment.subjectivity)

    # Per-chunk sentiment trajectory
    chunk_sentiments = []
    for t in transcripts:
        if t.strip():
            s = TextBlob(t).sentiment.polarity
            chunk_sentiments.append(s)

    if len(chunk_sentiments) >= 2:
        import numpy as np
        arr = np.array(chunk_sentiments)
        t_axis = np.arange(len(arr), dtype=float)
        features["sentiment_trend"] = float(np.polyfit(t_axis, arr, 1)[0])
        features["sentiment_volatility"] = float(np.std(arr))

        half = len(arr) // 2
        features["sentiment_shift"] = float(np.mean(arr[half:]) - np.mean(arr[:half]))
    else:
        features["sentiment_trend"] = 0.0
        features["sentiment_volatility"] = 0.0
        features["sentiment_shift"] = 0.0

    # Lexical features (normalized by word count)
    norm = max(word_count, 1)
    features["hedging_density"] = _count_matches(full_text, HEDGING_WORDS) / norm
    features["confidence_density"] = _count_matches(full_text, CONFIDENCE_WORDS) / norm
    features["negative_financial_density"] = _count_matches(full_text, NEGATIVE_FINANCIAL) / norm
    features["positive_financial_density"] = _count_matches(full_text, POSITIVE_FINANCIAL) / norm

    # Confidence-to-hedging ratio
    hedge_count = _count_matches(full_text, HEDGING_WORDS)
    conf_count = _count_matches(full_text, CONFIDENCE_WORDS)
    features["confidence_hedging_ratio"] = conf_count / max(hedge_count, 1)

    # Question density (analysts asking pointed questions is a signal)
    question_count = full_text.count("?")
    features["question_density"] = question_count / max(sentence_count, 1)

    # Word rate (words per chunk — proxy for speaking speed/fluency)
    features["avg_words_per_chunk"] = word_count / max(len(transcripts), 1)

    # Repetition (repeated phrases can signal nervousness)
    words = re.findall(r"\b\w+\b", full_text.lower())
    if len(words) > 10:
        unique_ratio = len(set(words)) / len(words)
        features["lexical_diversity"] = unique_ratio
    else:
        features["lexical_diversity"] = 1.0

    return features


def _empty_text_features() -> dict[str, float]:
    return {
        "text_sentiment_polarity": 0.0,
        "text_sentiment_subjectivity": 0.0,
        "sentiment_trend": 0.0,
        "sentiment_volatility": 0.0,
        "sentiment_shift": 0.0,
        "hedging_density": 0.0,
        "confidence_density": 0.0,
        "negative_financial_density": 0.0,
        "positive_financial_density": 0.0,
        "confidence_hedging_ratio": 1.0,
        "question_density": 0.0,
        "avg_words_per_chunk": 0.0,
        "lexical_diversity": 1.0,
    }
