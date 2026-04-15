"""PostgreSQL logging for Interview Coach sessions."""

import json
import logging
import os
from typing import Any, Dict

logger = logging.getLogger(__name__)

_pool = None


async def get_pool():
    global _pool
    if _pool is None:
        import asyncpg

        dsn = os.environ.get("INTERVIEW_COACH_DB_URL", "")
        if not dsn:
            raise RuntimeError("INTERVIEW_COACH_DB_URL not set")
        _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
        await _ensure_schema(_pool)
    return _pool


async def _ensure_schema(pool):
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS interview_sessions (
                id SERIAL PRIMARY KEY,
                browser_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                difficulty TEXT,
                jd_text_hash TEXT,
                questions JSONB,
                answers JSONB,
                scores JSONB,
                verdict TEXT,
                verdict_reasoning TEXT,
                delivery_metrics JSONB,
                readiness_score INTEGER,
                duration_sec REAL,
                question_count INTEGER,
                top_strengths JSONB,
                growth_areas JSONB
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_browser_id
                ON interview_sessions(browser_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_created_at
                ON interview_sessions(created_at);
        """)


async def log_session(data: Dict[str, Any]) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row_id = await conn.fetchval(
            """
            INSERT INTO interview_sessions
                (browser_id, session_id, difficulty, jd_text_hash,
                 questions, answers, scores, verdict, verdict_reasoning,
                 delivery_metrics, readiness_score, duration_sec,
                 question_count, top_strengths, growth_areas)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            RETURNING id
            """,
            data.get("browser_id", ""),
            data.get("session_id", ""),
            data.get("difficulty", ""),
            data.get("jd_text_hash", ""),
            json.dumps(data.get("questions", [])),
            json.dumps(data.get("answers", [])),
            json.dumps(data.get("scores", {})),
            data.get("verdict", ""),
            data.get("verdict_reasoning", ""),
            json.dumps(data.get("delivery_metrics", {})),
            data.get("readiness_score", 0),
            data.get("duration_sec", 0),
            data.get("question_count", 0),
            json.dumps(data.get("top_strengths", [])),
            json.dumps(data.get("growth_areas", [])),
        )
        return row_id
