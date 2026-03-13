"""LLM client abstraction — supports Gemini, Anthropic, and local endpoints."""

import logging
from typing import Optional

from .config import settings

logger = logging.getLogger(__name__)

_client = None


class LLMClient:
    """Unified interface for LLM generation."""

    def __init__(self, provider: str, api_key: str = "", local_url: str = ""):
        self.provider = provider
        self.api_key = api_key
        self.local_url = local_url

    async def generate(self, prompt: str, max_tokens: int = 1024, temperature: float = 0.7) -> str:
        if self.provider == "gemini":
            return await self._gemini(prompt, max_tokens, temperature)
        elif self.provider == "anthropic":
            return await self._anthropic(prompt, max_tokens, temperature)
        elif self.provider == "local":
            return await self._local(prompt, max_tokens, temperature)
        raise ValueError(f"Unknown LLM provider: {self.provider}")

    async def _gemini(self, prompt: str, max_tokens: int, temperature: float) -> str:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash",
                google_api_key=self.api_key,
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
            result = await llm.ainvoke(prompt)
            content = result.content if hasattr(result, "content") else str(result)
            if isinstance(content, list):
                content = "".join(str(c) for c in content)
            return content if isinstance(content, str) else str(content)
        except Exception as e:
            logger.error("Gemini generation failed: %s", e)
            raise

    async def _anthropic(self, prompt: str, max_tokens: int, temperature: float) -> str:
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=self.api_key)
            msg = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}],
            )
            return msg.content[0].text
        except Exception as e:
            logger.error("Anthropic generation failed: %s", e)
            raise

    async def _local(self, prompt: str, max_tokens: int, temperature: float) -> str:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{self.local_url}/v1/chat/completions",
                json={"model": "default", "messages": [{"role": "user", "content": prompt}], "max_tokens": max_tokens, "temperature": temperature},
            )
            res.raise_for_status()
            data = res.json()
            return data["choices"][0]["message"]["content"]


def get_llm_client() -> LLMClient:
    global _client
    if _client is None:
        _client = LLMClient(
            provider=settings.llm_provider,
            api_key=settings.gemini_api_key or settings.anthropic_api_key,
            local_url=settings.local_llm_url,
        )
    return _client
