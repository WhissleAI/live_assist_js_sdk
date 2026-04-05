"""
Earnings call audio downloader.

Supports multiple sources:
1. earningscall.biz API (bulk earnings call audio)
2. Local audio files (manual placement)
3. URL-based download (direct audio links)

Each downloaded audio is registered in the DB with its associated ticker and event date.
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from ..config import settings
from .storage import Storage

logger = logging.getLogger(__name__)

EARNINGS_API_BASE = "https://v2.api.earningscall.biz/v2"

POPULAR_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "JPM", "BAC", "GS", "MS", "WFC",
    "JNJ", "PFE", "UNH", "MRK",
    "XOM", "CVX", "COP",
    "DIS", "NFLX", "CRM", "ORCL", "INTC", "AMD",
    "V", "MA", "PYPL",
    "HD", "WMT", "COST", "TGT",
    "BA", "CAT", "DE",
    "KO", "PEP", "MCD",
]


class EarningsDownloader:
    """Download and register earnings call audio."""

    def __init__(self, storage: Storage | None = None, api_key: str = ""):
        self.storage = storage or Storage()
        self.api_key = api_key or os.environ.get("EARNINGS_API_KEY", "")
        self.audio_dir = Path(settings.data_dir) / "audio" / "earnings"
        self.audio_dir.mkdir(parents=True, exist_ok=True)

    async def download_from_api(
        self,
        tickers: list[str] | None = None,
        years: list[int] | None = None,
        quarters: list[int] | None = None,
    ) -> list[int]:
        """Download earnings call audio from earningscall.biz API.

        Returns list of source_ids for newly registered audio files.
        """
        tickers = tickers or POPULAR_TICKERS
        current_year = datetime.now().year
        years = years or list(range(current_year - 2, current_year + 1))
        quarters = quarters or [1, 2, 3, 4]

        source_ids: list[int] = []
        sem = asyncio.Semaphore(3)

        async def fetch_one(ticker: str, year: int, quarter: int):
            async with sem:
                sid = await self._download_single(ticker, year, quarter)
                if sid:
                    source_ids.append(sid)

        tasks = [
            fetch_one(t, y, q)
            for t in tickers for y in years for q in quarters
        ]
        await asyncio.gather(*tasks)

        logger.info("Downloaded %d earnings calls", len(source_ids))
        return source_ids

    async def _download_single(self, ticker: str, year: int, quarter: int) -> int | None:
        """Download a single earnings call. Returns source_id or None."""
        filename = f"{ticker}_{year}Q{quarter}.mp3"
        local_path = self.audio_dir / filename

        if local_path.exists():
            logger.debug("Already exists: %s", filename)
            return self._register_if_needed(ticker, year, quarter, str(local_path))

        if not self.api_key:
            logger.debug("No EARNINGS_API_KEY — skipping API download for %s", filename)
            return None

        url = f"{EARNINGS_API_BASE}/audio"
        params = {
            "apikey": self.api_key,
            "ticker": ticker,
            "year": year,
            "quarter": quarter,
        }

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200 and len(resp.content) > 10_000:
                    local_path.write_bytes(resp.content)
                    logger.info("Downloaded %s (%.1f MB)", filename, len(resp.content) / 1e6)
                    return self._register_if_needed(ticker, year, quarter, str(local_path))
                else:
                    logger.debug("No audio for %s %dQ%d (status=%d)", ticker, year, quarter, resp.status_code)
        except Exception as e:
            logger.warning("Download error for %s: %s", filename, e)
        return None

    def _register_if_needed(self, ticker: str, year: int, quarter: int, local_path: str) -> int:
        """Register in DB if not already there."""
        existing = self.storage.list_audio_sources(source_type="earnings_call", ticker=ticker)
        event_date = self._quarter_end_date(year, quarter)
        for src in existing:
            if src.get("event_date") == event_date:
                return src["id"]

        return self.storage.insert_audio_source(
            source_type="earnings_call",
            ticker=ticker.upper(),
            company_name="",
            event_date=event_date,
            local_path=local_path,
            metadata_json=json.dumps({"year": year, "quarter": quarter}),
        )

    def register_local_files(self, directory: str, pattern: str = r"(\w+)_(\d{4})Q(\d)") -> list[int]:
        """Scan a directory for audio files and register them.

        Expects filenames like AAPL_2024Q3.mp3 — extracts ticker, year, quarter
        from the filename via regex.
        """
        source_ids: list[int] = []
        p = Path(directory)
        for f in sorted(p.glob("*")):
            if f.suffix.lower() not in (".mp3", ".wav", ".m4a", ".ogg", ".webm"):
                continue
            m = re.match(pattern, f.stem)
            if not m:
                logger.warning("Cannot parse ticker/date from %s — skipping", f.name)
                continue
            ticker, year, quarter = m.group(1), int(m.group(2)), int(m.group(3))
            sid = self._register_if_needed(ticker.upper(), year, quarter, str(f))
            source_ids.append(sid)
            logger.info("Registered %s → source_id=%d", f.name, sid)
        return source_ids

    async def download_from_url(self, url: str, ticker: str, event_date: str) -> int | None:
        """Download audio from a direct URL and register it."""
        ext = Path(url).suffix or ".mp3"
        safe_date = event_date.replace("-", "")
        filename = f"{ticker}_{safe_date}{ext}"
        local_path = self.audio_dir / filename

        if not local_path.exists():
            try:
                async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        local_path.write_bytes(resp.content)
                        logger.info("Downloaded %s (%.1f MB)", filename, len(resp.content) / 1e6)
                    else:
                        logger.error("Download failed: %s → %d", url, resp.status_code)
                        return None
            except Exception as e:
                logger.error("Download error: %s", e)
                return None

        return self.storage.insert_audio_source(
            source_type="earnings_call",
            ticker=ticker.upper(),
            company_name="",
            event_date=event_date,
            audio_url=url,
            local_path=str(local_path),
        )

    @staticmethod
    def _quarter_end_date(year: int, quarter: int) -> str:
        month = {1: 3, 2: 6, 3: 9, 4: 12}[quarter]
        last_day = {3: 31, 6: 30, 9: 30, 12: 31}[month]
        return f"{year}-{month:02d}-{last_day:02d}"
