"""
Batch STT processor — runs audio files through Whissle ASR and stores
per-chunk metadata (emotion/intent/age/gender probability distributions).

Supports two ASR backends:
1. Whissle local ASR (/transcribe/pcm) — returns rich metadata_probs
2. Whissle cloud API (/v1/conversation/STT) — returns tag-based metadata

The local ASR path is preferred because it returns full probability distributions
per category, which are essential for the feature engineering pipeline.
"""

import asyncio
import json
import logging
import re
import subprocess
from pathlib import Path
from typing import Any

import httpx

from ..config import settings
from ..data.storage import Storage

logger = logging.getLogger(__name__)

BYTES_PER_SEC = settings.sample_rate * 2  # 16-bit mono
PCM_CHUNK_BYTES = settings.pcm_chunk_seconds * BYTES_PER_SEC


def _strip_prefix(token: str) -> str:
    for prefix in ("EMOTION_", "INTENT_", "GENDER_", "AGE_"):
        if token.startswith(prefix):
            return token[len(prefix):]
    return token


def _top_label(probs_list: list[dict]) -> str:
    if not probs_list:
        return ""
    top = max(probs_list, key=lambda x: x.get("probability", 0))
    return _strip_prefix(top.get("token", ""))


def _extract_tag_metadata(transcript: str) -> dict[str, str]:
    """Extract metadata tags embedded in transcript text (cloud API format)."""
    meta: dict[str, str] = {}
    for tag, pattern in [
        ("emotion", r"EMOTION_(\w+)"),
        ("intent", r"INTENT_(\w+)"),
        ("gender", r"GENDER_(\w+)"),
        ("age_range", r"AGE_(\w+)"),
    ]:
        m = re.search(pattern, transcript)
        if m:
            meta[tag] = m.group(1)
    return meta


def _clean_transcript(text: str) -> str:
    """Remove metadata tags from transcript."""
    text = re.sub(r"\b(AGE|GENDER|EMOTION|INTENT)_\w+\b", "", text)
    return re.sub(r"\s+", " ", text).strip()


class BatchSTTProcessor:
    """Process audio files through Whissle ASR at scale."""

    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()
        self.asr_url = settings.whissle_asr_url.rstrip("/")
        self.auth_token = settings.whissle_auth_token

    async def process_all_pending(self) -> int:
        """Process all audio sources that don't have STT chunks yet."""
        sources = self.storage.get_unprocessed_sources()
        logger.info("Found %d unprocessed audio sources", len(sources))

        processed = 0
        for src in sources:
            try:
                await self.process_source(src["id"], src["local_path"])
                processed += 1
            except Exception as e:
                logger.error("STT failed for source %d (%s): %s", src["id"], src.get("ticker", "?"), e)
        return processed

    async def process_source(self, source_id: int, audio_path: str):
        """Process a single audio file: convert to PCM, chunk, transcribe, store."""
        logger.info("Processing source %d: %s", source_id, audio_path)

        pcm_data = self._convert_to_pcm(audio_path)
        if not pcm_data:
            raise RuntimeError(f"Failed to convert {audio_path} to PCM")

        duration_sec = len(pcm_data) / BYTES_PER_SEC
        chunks = self._split_chunks(pcm_data)
        logger.info("Source %d: %.1fs audio → %d chunks", source_id, duration_sec, len(chunks))

        src = self.storage.get_audio_source(source_id)
        if src and not src.get("duration_sec"):
            pass  # Could update duration here

        sem = asyncio.Semaphore(settings.asr_concurrency)
        results: list[dict] = []

        async def transcribe_chunk(idx: int, chunk: bytes):
            async with sem:
                return await self._transcribe_pcm_chunk(chunk, idx)

        tasks = [transcribe_chunk(i, c) for i, c in enumerate(chunks)]
        raw_results = await asyncio.gather(*tasks)
        results = sorted(raw_results, key=lambda r: r["chunk_idx"])

        db_chunks = []
        for r in results:
            chunk_idx = r["chunk_idx"]
            start_sec = round(chunk_idx * settings.pcm_chunk_seconds, 1)
            end_sec = round(min(start_sec + settings.pcm_chunk_seconds, duration_sec), 1)

            meta_probs = r.get("metadata_probs", {})
            raw_transcript = r.get("transcript", "")

            emotion_probs = meta_probs.get("emotion", [])
            intent_probs = meta_probs.get("intent", [])
            age_probs = meta_probs.get("age", [])
            gender_probs = meta_probs.get("gender", [])

            tag_meta = _extract_tag_metadata(raw_transcript) if not emotion_probs else {}
            clean_text = _clean_transcript(raw_transcript)

            db_chunks.append({
                "source_id": source_id,
                "chunk_idx": chunk_idx,
                "start_sec": start_sec,
                "end_sec": end_sec,
                "transcript": clean_text,
                "emotion_probs": json.dumps(emotion_probs) if emotion_probs else None,
                "intent_probs": json.dumps(intent_probs) if intent_probs else None,
                "age_probs": json.dumps(age_probs) if age_probs else None,
                "gender_probs": json.dumps(gender_probs) if gender_probs else None,
                "emotion": _top_label(emotion_probs) or tag_meta.get("emotion", ""),
                "intent": _top_label(intent_probs) or tag_meta.get("intent", ""),
                "age_range": _top_label(age_probs) or tag_meta.get("age_range", ""),
                "gender": _top_label(gender_probs) or tag_meta.get("gender", ""),
            })

        self.storage.insert_stt_chunks(db_chunks)
        logger.info("Source %d: stored %d STT chunks", source_id, len(db_chunks))

    async def _transcribe_pcm_chunk(self, pcm_chunk: bytes, chunk_idx: int) -> dict[str, Any]:
        """Send a PCM chunk to the ASR endpoint."""
        url = f"{self.asr_url}/asr/transcribe/pcm"
        form_data = {
            "sample_rate": str(settings.sample_rate),
            "channels": "1",
            "bit_depth": "16",
            "metadata_prob": "true",
            "top_k": "5",
        }

        try:
            async with httpx.AsyncClient(timeout=settings.asr_timeout_sec) as client:
                resp = await client.post(
                    url,
                    data=form_data,
                    files={"file": ("audio.pcm", pcm_chunk, "application/octet-stream")},
                )
                if resp.status_code == 200:
                    result = resp.json()
                    return {
                        "chunk_idx": chunk_idx,
                        "transcript": result.get("transcript", ""),
                        "metadata_probs": result.get("metadata_probs", {}),
                    }
                else:
                    logger.warning("ASR chunk %d: status %d — %s", chunk_idx, resp.status_code, resp.text[:200])
        except Exception as e:
            logger.warning("ASR chunk %d error: %s", chunk_idx, e)

        # Fallback: try cloud API
        return await self._transcribe_cloud_fallback(pcm_chunk, chunk_idx)

    async def _transcribe_cloud_fallback(self, pcm_chunk: bytes, chunk_idx: int) -> dict[str, Any]:
        """Fallback to Whissle cloud STT API (returns tag-based metadata)."""
        if not self.auth_token:
            return {"chunk_idx": chunk_idx, "transcript": "", "metadata_probs": {}}

        url = f"https://api.whissle.ai/v1/conversation/STT?auth_token={self.auth_token}"
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    url,
                    files={"audio": ("chunk.wav", pcm_chunk, "audio/wav")},
                    headers={"Accept": "*/*"},
                )
                if resp.status_code == 200:
                    result = resp.json()
                    transcript = ""
                    if isinstance(result, str):
                        transcript = result
                    elif isinstance(result, dict):
                        for key in ("transcript", "text", "transcription", "result"):
                            if key in result:
                                transcript = result[key]
                                break
                    return {
                        "chunk_idx": chunk_idx,
                        "transcript": transcript,
                        "metadata_probs": {},
                    }
        except Exception as e:
            logger.warning("Cloud fallback chunk %d error: %s", chunk_idx, e)

        return {"chunk_idx": chunk_idx, "transcript": "", "metadata_probs": {}}

    def _convert_to_pcm(self, audio_path: str) -> bytes | None:
        """Convert any audio format to raw 16kHz 16-bit mono PCM."""
        if not Path(audio_path).exists():
            logger.error("Audio file not found: %s", audio_path)
            return None
        try:
            result = subprocess.run(
                [
                    "ffmpeg", "-y", "-i", audio_path,
                    "-f", "s16le", "-acodec", "pcm_s16le",
                    "-ar", str(settings.sample_rate), "-ac", "1",
                    "pipe:1",
                ],
                capture_output=True,
                timeout=300,
            )
            if result.returncode == 0 and len(result.stdout) > 0:
                logger.info("Converted %s → PCM (%d bytes)", audio_path, len(result.stdout))
                return result.stdout
            logger.error("ffmpeg failed for %s: %s", audio_path, result.stderr.decode(errors="replace")[:500])
        except subprocess.TimeoutExpired:
            logger.error("ffmpeg timed out for %s", audio_path)
        except FileNotFoundError:
            logger.error("ffmpeg not found — install ffmpeg")
        return None

    def _split_chunks(self, pcm_data: bytes) -> list[bytes]:
        """Split PCM data into fixed-size chunks, dropping tiny trailing fragments."""
        chunks = []
        for i in range(0, len(pcm_data), PCM_CHUNK_BYTES):
            chunk = pcm_data[i:i + PCM_CHUNK_BYTES]
            if len(chunk) > BYTES_PER_SEC:  # at least 1 second
                chunks.append(chunk)
        return chunks
