"""Chat model factory — returns a LangChain BaseChatModel for multi-turn chat.

Supports Gemini and Anthropic with streaming and tool-binding.
Separate from llm_client.py which exposes a single-prompt generate() interface.
"""

import logging
from typing import Optional

from langchain_core.language_models.chat_models import BaseChatModel

from .config import settings

logger = logging.getLogger(__name__)


def get_chat_model(
    provider: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> BaseChatModel:
    """Return a streaming-capable LangChain chat model."""
    provider = provider or settings.llm_provider

    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        api_key = settings.gemini_api_key
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required when LLM_PROVIDER=gemini")
        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=api_key,
            max_output_tokens=max_tokens,
            temperature=temperature,
            streaming=True,
        )

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        api_key = settings.anthropic_api_key
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic")
        return ChatAnthropic(
            model="claude-sonnet-4-20250514",
            api_key=api_key,
            max_tokens=max_tokens,
            temperature=temperature,
            streaming=True,
        )

    raise ValueError(f"Unsupported chat model provider: {provider}")
