"""SQLite storage layer for STT records, stock data, and features."""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pandas as pd

from ..config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audio_sources (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type     TEXT NOT NULL,           -- 'earnings_call', 'news', 'fed', 'custom'
    ticker          TEXT,
    company_name    TEXT,
    event_date      TEXT NOT NULL,            -- ISO date of the event
    audio_url       TEXT,
    local_path      TEXT,
    duration_sec    REAL,
    metadata_json   TEXT,                     -- arbitrary source metadata
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stt_chunks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       INTEGER NOT NULL REFERENCES audio_sources(id),
    chunk_idx       INTEGER NOT NULL,
    start_sec       REAL NOT NULL,
    end_sec         REAL NOT NULL,
    transcript      TEXT,
    -- Probability distributions stored as JSON arrays of {token, probability}
    emotion_probs   TEXT,
    intent_probs    TEXT,
    age_probs       TEXT,
    gender_probs    TEXT,
    -- Top-1 labels for quick queries
    emotion         TEXT,
    intent          TEXT,
    age_range       TEXT,
    gender          TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, chunk_idx)
);

CREATE TABLE IF NOT EXISTS stock_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       INTEGER NOT NULL REFERENCES audio_sources(id),
    ticker          TEXT NOT NULL,
    event_date      TEXT NOT NULL,
    -- Price data at event time
    open_price      REAL,
    close_price     REAL,
    high_price      REAL,
    low_price       REAL,
    volume          REAL,
    -- Returns at various horizons
    return_1d       REAL,
    return_5d       REAL,
    return_20d      REAL,
    -- Market-relative (abnormal) returns
    abnormal_1d     REAL,
    abnormal_5d     REAL,
    abnormal_20d    REAL,
    -- Volatility
    vix_at_event    REAL,
    vol_pre         REAL,
    vol_post        REAL,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(source_id, ticker)
);

CREATE TABLE IF NOT EXISTS feature_vectors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       INTEGER NOT NULL REFERENCES audio_sources(id) UNIQUE,
    features_json   TEXT NOT NULL,            -- full feature dict
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS predictions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id       INTEGER REFERENCES audio_sources(id),
    ticker          TEXT NOT NULL,
    prediction_date TEXT NOT NULL,
    direction       INTEGER,                  -- 1=up, 0=down
    confidence      REAL,
    predicted_return_1d  REAL,
    predicted_return_5d  REAL,
    predicted_return_20d REAL,
    model_version   TEXT,
    features_json   TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_date        TEXT NOT NULL,
    model_version   TEXT NOT NULL,
    train_samples   INTEGER,
    test_samples    INTEGER,
    accuracy        REAL,
    auc_roc         REAL,
    sharpe_ratio    REAL,
    feature_importance_json TEXT,
    params_json     TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trade_signals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    prediction_id   INTEGER UNIQUE REFERENCES predictions(id),
    signal_json     TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchlist (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker          TEXT NOT NULL UNIQUE,
    added_at        TEXT DEFAULT (datetime('now')),
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type      TEXT NOT NULL,
    message         TEXT NOT NULL,
    details_json    TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticker_convictions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker               TEXT NOT NULL UNIQUE,
    company_name         TEXT,
    direction            INTEGER,
    confidence           REAL,
    freshness            REAL,
    source_count         INTEGER,
    latest_source_id     INTEGER REFERENCES audio_sources(id),
    latest_event_date    TEXT,
    current_price        REAL,
    entry_price          REAL,
    stop_loss            REAL,
    take_profit          REAL,
    risk_reward          REAL,
    position_shares      INTEGER,
    expected_return_pct  REAL,
    confidence_tier      TEXT,
    signal_strength      REAL,
    explanation          TEXT,
    source_breakdown_json TEXT,
    updated_at           TEXT DEFAULT (datetime('now'))
);
"""


class Storage:
    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or settings.db_path
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # ---- audio_sources ----

    def insert_audio_source(self, **kwargs) -> int:
        cols = list(kwargs.keys())
        placeholders = ", ".join(["?"] * len(cols))
        sql = f"INSERT INTO audio_sources ({', '.join(cols)}) VALUES ({placeholders})"
        with self._conn() as conn:
            cur = conn.execute(sql, list(kwargs.values()))
            return cur.lastrowid

    def get_audio_source(self, source_id: int) -> dict | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM audio_sources WHERE id=?", (source_id,)).fetchone()
            return dict(row) if row else None

    def list_audio_sources(self, source_type: str | None = None, ticker: str | None = None) -> list[dict]:
        sql = "SELECT * FROM audio_sources WHERE 1=1"
        params: list[Any] = []
        if source_type:
            sql += " AND source_type=?"
            params.append(source_type)
        if ticker:
            sql += " AND ticker=?"
            params.append(ticker.upper())
        sql += " ORDER BY event_date DESC"
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(sql, params).fetchall()]

    def count_sources(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM audio_sources").fetchone()[0]

    # ---- stt_chunks ----

    def insert_stt_chunks(self, chunks: list[dict]):
        if not chunks:
            return
        cols = list(chunks[0].keys())
        placeholders = ", ".join(["?"] * len(cols))
        sql = f"INSERT OR REPLACE INTO stt_chunks ({', '.join(cols)}) VALUES ({placeholders})"
        with self._conn() as conn:
            conn.executemany(sql, [list(c.values()) for c in chunks])

    def get_stt_chunks(self, source_id: int) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM stt_chunks WHERE source_id=? ORDER BY chunk_idx", (source_id,)
            ).fetchall()
            return [dict(r) for r in rows]

    def count_stt_chunks(self, source_id: int | None = None) -> int:
        sql = "SELECT COUNT(*) FROM stt_chunks"
        params: list = []
        if source_id is not None:
            sql += " WHERE source_id=?"
            params.append(source_id)
        with self._conn() as conn:
            return conn.execute(sql, params).fetchone()[0]

    # ---- stock_records ----

    def upsert_stock_record(self, **kwargs):
        cols = list(kwargs.keys())
        placeholders = ", ".join(["?"] * len(cols))
        updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c not in ("source_id", "ticker"))
        sql = (
            f"INSERT INTO stock_records ({', '.join(cols)}) VALUES ({placeholders}) "
            f"ON CONFLICT(source_id, ticker) DO UPDATE SET {updates}"
        )
        with self._conn() as conn:
            conn.execute(sql, list(kwargs.values()))

    def get_stock_record(self, source_id: int) -> dict | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM stock_records WHERE source_id=?", (source_id,)).fetchone()
            return dict(row) if row else None

    def get_stock_records_for_ticker(self, ticker: str, limit: int = 100) -> list[dict]:
        """Get all stock records for a ticker, ordered by event_date DESC."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM stock_records WHERE ticker=? ORDER BY event_date DESC LIMIT ?",
                (ticker.upper(), limit),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_diagnostics(self) -> dict:
        """Data health diagnostics."""
        with self._conn() as conn:
            sources_no_chunks = conn.execute("""
                SELECT COUNT(*) FROM audio_sources a
                LEFT JOIN stt_chunks c ON c.source_id = a.id
                WHERE c.id IS NULL AND a.local_path IS NOT NULL
            """).fetchone()[0]
            sources_no_features = conn.execute("""
                SELECT COUNT(*) FROM audio_sources a
                JOIN stt_chunks c ON c.source_id = a.id
                LEFT JOIN feature_vectors f ON f.source_id = a.id
                WHERE f.id IS NULL
            """).fetchone()[0]
            features_no_predictions = conn.execute("""
                SELECT COUNT(*) FROM feature_vectors f
                LEFT JOIN predictions p ON p.source_id = f.source_id
                WHERE p.id IS NULL
            """).fetchone()[0]
            predictions_no_outcome = conn.execute("""
                SELECT COUNT(*) FROM predictions p
                LEFT JOIN stock_records s ON s.source_id = p.source_id
                WHERE s.return_1d IS NULL OR s.id IS NULL
            """).fetchone()[0]
            null_predicted_return = conn.execute(
                "SELECT COUNT(*) FROM predictions WHERE predicted_return_1d IS NULL"
            ).fetchone()[0]
            total_predictions = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
            latest_model = conn.execute(
                "SELECT created_at FROM model_runs ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
            model_age_days = None
            if latest_model:
                from datetime import datetime
                try:
                    last_trained = datetime.fromisoformat(latest_model[0])
                    model_age_days = (datetime.now() - last_trained).days
                except Exception:
                    pass
            return {
                "sources_pending_stt": sources_no_chunks,
                "sources_pending_features": sources_no_features,
                "features_pending_predictions": features_no_predictions,
                "predictions_pending_outcomes": predictions_no_outcome,
                "predictions_missing_return_estimate": null_predicted_return,
                "total_predictions": total_predictions,
                "model_age_days": model_age_days,
            }

    # ---- feature_vectors ----

    def upsert_features(self, source_id: int, features: dict):
        sql = (
            "INSERT INTO feature_vectors (source_id, features_json) VALUES (?, ?) "
            "ON CONFLICT(source_id) DO UPDATE SET features_json=excluded.features_json"
        )
        with self._conn() as conn:
            conn.execute(sql, (source_id, json.dumps(features)))

    def get_features(self, source_id: int) -> dict | None:
        with self._conn() as conn:
            row = conn.execute("SELECT features_json FROM feature_vectors WHERE source_id=?", (source_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def get_all_features_df(self) -> pd.DataFrame:
        """Load all feature vectors joined with stock records into a DataFrame."""
        sql = """
        SELECT
            f.source_id,
            a.ticker,
            a.event_date,
            f.features_json,
            s.return_1d, s.return_5d, s.return_20d,
            s.abnormal_1d, s.abnormal_5d, s.abnormal_20d,
            s.vix_at_event,
            s.close_price, s.high_price, s.low_price, s.volume,
            s.vol_pre, s.vol_post
        FROM feature_vectors f
        JOIN audio_sources a ON a.id = f.source_id
        JOIN stock_records s ON s.source_id = f.source_id
        ORDER BY a.event_date
        """
        with self._conn() as conn:
            rows = conn.execute(sql).fetchall()

        if not rows:
            return pd.DataFrame()

        records = []
        for r in rows:
            d = dict(r)
            feats = json.loads(d.pop("features_json"))
            d.update(feats)
            records.append(d)
        return pd.DataFrame(records)

    # ---- predictions ----

    def insert_prediction(self, **kwargs):
        if "features_json" in kwargs and isinstance(kwargs["features_json"], dict):
            kwargs["features_json"] = json.dumps(kwargs["features_json"])
        cols = list(kwargs.keys())
        placeholders = ", ".join(["?"] * len(cols))
        sql = f"INSERT INTO predictions ({', '.join(cols)}) VALUES ({placeholders})"
        with self._conn() as conn:
            conn.execute(sql, list(kwargs.values()))

    def get_predictions(self, ticker: str | None = None, source_id: int | None = None, limit: int = 50) -> list[dict]:
        sql = "SELECT * FROM predictions WHERE 1=1"
        params: list = []
        if ticker:
            sql += " AND ticker=?"
            params.append(ticker.upper())
        if source_id is not None:
            sql += " AND source_id=?"
            params.append(source_id)
        sql += " ORDER BY prediction_date DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(sql, params).fetchall()]

    # ---- model_runs ----

    def insert_model_run(self, **kwargs):
        for k in ("feature_importance_json", "params_json"):
            if k in kwargs and isinstance(kwargs[k], dict):
                kwargs[k] = json.dumps(kwargs[k])
        cols = list(kwargs.keys())
        placeholders = ", ".join(["?"] * len(cols))
        sql = f"INSERT INTO model_runs ({', '.join(cols)}) VALUES ({placeholders})"
        with self._conn() as conn:
            conn.execute(sql, list(kwargs.values()))

    def get_latest_model_run(self) -> dict | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM model_runs ORDER BY created_at DESC LIMIT 1").fetchone()
            return dict(row) if row else None

    # ---- unprocessed sources ----

    def get_unprocessed_sources(self) -> list[dict]:
        """Sources that have audio but no STT chunks yet."""
        sql = """
        SELECT a.* FROM audio_sources a
        LEFT JOIN stt_chunks c ON c.source_id = a.id
        WHERE c.id IS NULL AND a.local_path IS NOT NULL
        ORDER BY a.event_date
        """
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(sql).fetchall()]

    def get_sources_without_features(self) -> list[dict]:
        """Sources that have STT chunks but no feature vectors yet."""
        sql = """
        SELECT a.* FROM audio_sources a
        JOIN stt_chunks c ON c.source_id = a.id
        LEFT JOIN feature_vectors f ON f.source_id = a.id
        WHERE f.id IS NULL
        GROUP BY a.id
        ORDER BY a.event_date
        """
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(sql).fetchall()]

    # ---- Frontend-oriented queries ----

    def get_dashboard_stats(self) -> dict:
        with self._conn() as conn:
            total_sources = conn.execute("SELECT COUNT(*) FROM audio_sources").fetchone()[0]
            total_chunks = conn.execute("SELECT COUNT(*) FROM stt_chunks").fetchone()[0]
            total_predictions = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
            total_features = conn.execute("SELECT COUNT(*) FROM feature_vectors").fetchone()[0]

            accuracy_row = conn.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN p.direction = (CASE WHEN s.return_1d > 0 THEN 1 ELSE 0 END) THEN 1 ELSE 0 END) as correct,
                    SUM(CASE WHEN p.confidence > 0.7 THEN 1 ELSE 0 END) as high_conf,
                    SUM(CASE WHEN p.confidence > 0.7 AND p.direction = (CASE WHEN s.return_1d > 0 THEN 1 ELSE 0 END) THEN 1 ELSE 0 END) as high_conf_correct
                FROM predictions p
                JOIN stock_records s ON s.source_id = p.source_id
                WHERE s.return_1d IS NOT NULL
            """).fetchone()

            total_eval = accuracy_row[0] or 0
            correct = accuracy_row[1] or 0
            high_conf = accuracy_row[2] or 0
            high_conf_correct = accuracy_row[3] or 0

            return {
                "total_sources": total_sources,
                "total_chunks": total_chunks,
                "total_predictions": total_predictions,
                "total_features": total_features,
                "accuracy_rate": round(correct / total_eval, 4) if total_eval > 0 else None,
                "evaluated_predictions": total_eval,
                "high_confidence_accuracy": round(high_conf_correct / high_conf, 4) if high_conf > 0 else None,
                "high_confidence_count": high_conf,
            }

    def get_predictions_paginated(
        self, ticker: str | None = None, direction: int | None = None,
        limit: int = 50, offset: int = 0, sort_by: str = "prediction_date",
        sort_dir: str = "DESC",
    ) -> tuple[list[dict], int]:
        where_clauses = ["1=1"]
        params: list[Any] = []
        if ticker:
            where_clauses.append("p.ticker = ?")
            params.append(ticker.upper())
        if direction is not None:
            where_clauses.append("p.direction = ?")
            params.append(direction)

        where_sql = " AND ".join(where_clauses)
        allowed_sorts = {"prediction_date", "confidence", "ticker", "created_at"}
        sort_col = sort_by if sort_by in allowed_sorts else "prediction_date"
        sort_direction = "ASC" if sort_dir.upper() == "ASC" else "DESC"

        count_sql = f"SELECT COUNT(*) FROM predictions p WHERE {where_sql}"
        data_sql = f"""
            SELECT p.*, a.company_name, a.event_date as source_event_date,
                   s.return_1d, s.return_5d, s.return_20d,
                   s.close_price, s.open_price
            FROM predictions p
            LEFT JOIN audio_sources a ON a.id = p.source_id
            LEFT JOIN stock_records s ON s.source_id = p.source_id
            WHERE {where_sql}
            ORDER BY p.{sort_col} {sort_direction}
            LIMIT ? OFFSET ?
        """
        with self._conn() as conn:
            total = conn.execute(count_sql, params).fetchone()[0]
            rows = conn.execute(data_sql, params + [limit, offset]).fetchall()

        results = []
        for r in rows:
            d = dict(r)
            ret_1d = d.get("return_1d")
            if ret_1d is not None:
                actual_dir = 1 if ret_1d > 0 else 0
                d["actual_direction"] = actual_dir
                d["actual_direction_label"] = "UP" if actual_dir == 1 else "DOWN"
                d["was_correct"] = d.get("direction") == actual_dir
            else:
                d["actual_direction"] = None
                d["actual_direction_label"] = None
                d["was_correct"] = None
            results.append(d)
        return results, total

    def get_prediction_detail(self, prediction_id: int) -> dict | None:
        sql = """
            SELECT p.*, a.ticker as src_ticker, a.company_name, a.event_date as source_event_date,
                   a.source_type, a.duration_sec,
                   s.return_1d, s.return_5d, s.return_20d,
                   s.abnormal_1d, s.abnormal_5d, s.abnormal_20d,
                   s.close_price, s.open_price, s.high_price, s.low_price, s.volume,
                   s.vix_at_event, s.vol_pre, s.vol_post
            FROM predictions p
            LEFT JOIN audio_sources a ON a.id = p.source_id
            LEFT JOIN stock_records s ON s.source_id = p.source_id
            WHERE p.id = ?
        """
        with self._conn() as conn:
            row = conn.execute(sql, (prediction_id,)).fetchone()
            if not row:
                return None
            d = dict(row)
            ret_1d = d.get("return_1d")
            if ret_1d is not None:
                actual_dir = 1 if ret_1d > 0 else 0
                d["actual_direction"] = actual_dir
                d["was_correct"] = d.get("direction") == actual_dir
            if d.get("features_json") and isinstance(d["features_json"], str):
                d["features_parsed"] = json.loads(d["features_json"])
            return d

    def get_model_runs_history(self) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM model_runs ORDER BY created_at ASC"
            ).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                if d.get("feature_importance_json") and isinstance(d["feature_importance_json"], str):
                    d["feature_importance"] = json.loads(d["feature_importance_json"])
                if d.get("params_json") and isinstance(d["params_json"], str):
                    d["params"] = json.loads(d["params_json"])
                results.append(d)
            return results

    def get_distinct_tickers(self) -> list[str]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT DISTINCT ticker FROM audio_sources WHERE ticker IS NOT NULL ORDER BY ticker"
            ).fetchall()
            return [r[0] for r in rows]

    def get_source_emotion_timeline(self, source_id: int) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT chunk_idx, start_sec, end_sec, emotion, emotion_probs, transcript "
                "FROM stt_chunks WHERE source_id = ? ORDER BY chunk_idx",
                (source_id,),
            ).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                if d.get("emotion_probs") and isinstance(d["emotion_probs"], str):
                    d["emotion_probs_parsed"] = json.loads(d["emotion_probs"])
                results.append(d)
            return results

    def get_source_chunks_summary(self, source_id: int) -> dict:
        with self._conn() as conn:
            total = conn.execute(
                "SELECT COUNT(*) FROM stt_chunks WHERE source_id = ?", (source_id,)
            ).fetchone()[0]
            emotions = conn.execute(
                "SELECT emotion, COUNT(*) as cnt FROM stt_chunks "
                "WHERE source_id = ? AND emotion IS NOT NULL GROUP BY emotion ORDER BY cnt DESC",
                (source_id,),
            ).fetchall()
            return {
                "total_chunks": total,
                "emotion_distribution": {r[0]: r[1] for r in emotions},
            }

    def get_sources_with_status(self, limit: int = 100) -> list[dict]:
        sql = """
            SELECT a.*,
                   (SELECT COUNT(*) FROM stt_chunks c WHERE c.source_id = a.id) as chunk_count,
                   (SELECT COUNT(*) FROM feature_vectors f WHERE f.source_id = a.id) as has_features,
                   (SELECT COUNT(*) FROM predictions p WHERE p.source_id = a.id) as has_predictions,
                   (SELECT COUNT(*) FROM stock_records s WHERE s.source_id = a.id) as has_stock_data
            FROM audio_sources a
            ORDER BY a.event_date DESC
            LIMIT ?
        """
        with self._conn() as conn:
            return [dict(r) for r in conn.execute(sql, (limit,)).fetchall()]

    # ---- trade_signals ----

    def upsert_trade_signal(self, prediction_id: int, signal_json: str):
        sql = (
            "INSERT INTO trade_signals (prediction_id, signal_json) VALUES (?, ?) "
            "ON CONFLICT(prediction_id) DO UPDATE SET signal_json=excluded.signal_json, "
            "created_at=datetime('now')"
        )
        with self._conn() as conn:
            conn.execute(sql, (prediction_id, signal_json))

    def get_trade_signal(self, prediction_id: int) -> dict | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT signal_json FROM trade_signals WHERE prediction_id=?", (prediction_id,)
            ).fetchone()
            return json.loads(row[0]) if row else None

    def get_all_trade_signals(self) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT signal_json FROM trade_signals ORDER BY created_at DESC"
            ).fetchall()
            return [json.loads(r[0]) for r in rows]

    # ---- watchlist ----

    def add_to_watchlist(self, ticker: str, notes: str = "") -> int:
        sql = (
            "INSERT INTO watchlist (ticker, notes) VALUES (?, ?) "
            "ON CONFLICT(ticker) DO UPDATE SET notes=excluded.notes"
        )
        with self._conn() as conn:
            cur = conn.execute(sql, (ticker.upper(), notes))
            return cur.lastrowid

    def remove_from_watchlist(self, ticker: str):
        with self._conn() as conn:
            conn.execute("DELETE FROM watchlist WHERE ticker=?", (ticker.upper(),))

    def get_watchlist(self) -> list[dict]:
        with self._conn() as conn:
            rows = conn.execute("SELECT * FROM watchlist ORDER BY added_at DESC").fetchall()
            return [dict(r) for r in rows]

    # ---- activity_log ----

    def log_activity(self, event_type: str, message: str, details: dict | None = None):
        sql = "INSERT INTO activity_log (event_type, message, details_json) VALUES (?, ?, ?)"
        with self._conn() as conn:
            conn.execute(sql, (event_type, message, json.dumps(details) if details else None))

    def get_activity_log(self, limit: int = 100, event_type: str | None = None) -> list[dict]:
        if event_type:
            sql = "SELECT * FROM activity_log WHERE event_type=? ORDER BY created_at DESC LIMIT ?"
            params = (event_type, limit)
        else:
            sql = "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?"
            params = (limit,)
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                if d.get("details_json"):
                    d["details"] = json.loads(d["details_json"])
                    del d["details_json"]
                else:
                    d["details"] = None
                    d.pop("details_json", None)
                result.append(d)
            return result

    # ---- ticker_convictions ----

    def upsert_conviction(self, ticker: str, **kwargs):
        kwargs["ticker"] = ticker.upper()
        cols = list(kwargs.keys())
        placeholders = ", ".join(["?"] * len(cols))
        updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c != "ticker")
        updates += ", updated_at=datetime('now')"
        sql = (
            f"INSERT INTO ticker_convictions ({', '.join(cols)}) VALUES ({placeholders}) "
            f"ON CONFLICT(ticker) DO UPDATE SET {updates}"
        )
        with self._conn() as conn:
            conn.execute(sql, list(kwargs.values()))

    def get_conviction(self, ticker: str) -> dict | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM ticker_convictions WHERE ticker=?", (ticker.upper(),)
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            if d.get("source_breakdown_json"):
                d["source_breakdown"] = json.loads(d["source_breakdown_json"])
            return d

    def get_all_convictions(self, min_freshness: float = 0.0) -> list[dict]:
        sql = "SELECT * FROM ticker_convictions WHERE freshness >= ? ORDER BY confidence DESC"
        with self._conn() as conn:
            rows = conn.execute(sql, (min_freshness,)).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                if d.get("source_breakdown_json"):
                    d["source_breakdown"] = json.loads(d["source_breakdown_json"])
                result.append(d)
            return result

    def get_convictions_by_tier(self, tier: str) -> list[dict]:
        sql = "SELECT * FROM ticker_convictions WHERE confidence_tier=? ORDER BY confidence DESC"
        with self._conn() as conn:
            rows = conn.execute(sql, (tier,)).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                if d.get("source_breakdown_json"):
                    d["source_breakdown"] = json.loads(d["source_breakdown_json"])
                result.append(d)
            return result
