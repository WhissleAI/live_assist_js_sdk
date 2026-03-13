"""SQLite + sentence-transformers vector memory for the SDK server."""

import hashlib
import json
import logging
import os
import sqlite3
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_instance = None


class VectorMemory:
    def __init__(self, db_path: str, embedding_model: str = "all-MiniLM-L6-v2"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._init_tables()
        self._model = None
        self._embedding_model_name = embedding_model

    def _init_tables(self):
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                source TEXT DEFAULT '',
                contact TEXT DEFAULT '',
                embedding TEXT,
                created_at REAL DEFAULT (strftime('%s','now')),
                UNIQUE(user_id, id)
            );
            CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                title TEXT DEFAULT '',
                mode TEXT DEFAULT 'meeting',
                start_time REAL DEFAULT (strftime('%s','now')),
                end_time REAL,
                status TEXT DEFAULT 'active',
                feedback_snapshot TEXT
            );

            CREATE TABLE IF NOT EXISTS transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                channel TEXT DEFAULT 'mic',
                text TEXT NOT NULL,
                timestamp REAL DEFAULT (strftime('%s','now')),
                metadata TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
        """)
        self._conn.commit()

    def _get_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self._embedding_model_name)
        return self._model

    def _embed(self, text: str) -> List[float]:
        model = self._get_model()
        return model.encode(text, normalize_embeddings=True).tolist()

    def store(self, user_id: str, content: str, category: str = "general", source: str = "", contact: str = "") -> str:
        mem_id = hashlib.md5(f"{user_id}:{content}".encode()).hexdigest()
        embedding = json.dumps(self._embed(content))
        self._conn.execute(
            "INSERT OR REPLACE INTO memories (id, user_id, content, category, source, contact, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (mem_id, user_id, content, category, source, contact, embedding),
        )
        self._conn.commit()
        return mem_id

    def search(self, user_id: str, query: str, limit: int = 10, category: Optional[str] = None, contact: Optional[str] = None, min_relevance: float = 0.15) -> List[Dict[str, Any]]:
        query_emb = self._embed(query)
        sql = "SELECT id, content, category, source, embedding, created_at FROM memories WHERE user_id = ?"
        params: list = [user_id]
        if category:
            sql += " AND category = ?"
            params.append(category)
        if contact:
            sql += " AND contact = ?"
            params.append(contact)

        rows = self._conn.execute(sql, params).fetchall()
        results = []
        for row in rows:
            emb = json.loads(row[4]) if row[4] else None
            if not emb:
                continue
            score = sum(a * b for a, b in zip(query_emb, emb))
            if score >= min_relevance:
                results.append({
                    "id": row[0], "content": row[1], "category": row[2],
                    "source": row[3], "score": score, "relevanceScore": score,
                    "timestamp": row[5],
                })
        results.sort(key=lambda x: x["relevanceScore"], reverse=True)
        return results[:limit]

    def get_stats(self, user_id: str) -> Dict[str, Any]:
        count = self._conn.execute("SELECT COUNT(*) FROM memories WHERE user_id = ?", (user_id,)).fetchone()[0]
        return {"total_memories": count}

    # Session CRUD
    def create_session(self, session_id: str, device_id: str, title: str = "", mode: str = "meeting") -> str:
        self._conn.execute(
            "INSERT INTO sessions (id, device_id, title, mode) VALUES (?, ?, ?, ?)",
            (session_id, device_id, title, mode),
        )
        self._conn.commit()
        return session_id

    def end_session(self, session_id: str, feedback_snapshot: Optional[Dict] = None):
        snap = json.dumps(feedback_snapshot) if feedback_snapshot else None
        self._conn.execute(
            "UPDATE sessions SET status = 'completed', end_time = ?, feedback_snapshot = ? WHERE id = ?",
            (time.time(), snap, session_id),
        )
        self._conn.commit()

    def list_sessions(self, device_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        if device_id:
            rows = self._conn.execute("SELECT id, device_id, title, mode, start_time, end_time, status FROM sessions WHERE device_id = ? ORDER BY start_time DESC LIMIT ?", (device_id, limit)).fetchall()
        else:
            rows = self._conn.execute("SELECT id, device_id, title, mode, start_time, end_time, status FROM sessions ORDER BY start_time DESC LIMIT ?", (limit,)).fetchall()
        return [{"id": r[0], "device_id": r[1], "title": r[2], "mode": r[3], "start_time": r[4], "end_time": r[5], "status": r[6]} for r in rows]

    def store_transcript(self, session_id: str, channel: str, text: str, metadata: Optional[Dict] = None):
        meta = json.dumps(metadata) if metadata else None
        self._conn.execute("INSERT INTO transcripts (session_id, channel, text, metadata) VALUES (?, ?, ?, ?)", (session_id, channel, text, meta))
        self._conn.commit()


def get_vector_memory() -> VectorMemory:
    global _instance
    if _instance is None:
        from .config import settings
        _instance = VectorMemory(settings.db_path, settings.embedding_model)
    return _instance
