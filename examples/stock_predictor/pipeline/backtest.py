"""
Backtest simulation.

Uses real stock data + synthetic STT metadata to validate the full pipeline
end-to-end. Trains on recent history, predicts forward, evaluates results.

This is the "dry run" to understand what works before going live with
actual earnings call audio.

The synthetic metadata embeds realistic signal patterns:
- Stocks that went UP tend to have higher positive emotion, confidence language
- Stocks that went DOWN tend to have higher fear/negative emotion, hedging
- Some noise is added to make it non-trivial
- Cross-modal divergence is simulated (voice vs text mismatch)
"""

import json
import logging
import random
from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

from ..config import settings
from ..data.storage import Storage
from ..features.pipeline import FeaturePipeline
from ..models.trainer import ModelTrainer
from ..models.predictor import StockPredictor

logger = logging.getLogger(__name__)

BACKTEST_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
    "JPM", "BAC", "GS", "JNJ", "PFE",
    "XOM", "CVX", "DIS", "NFLX",
    "V", "MA", "HD", "WMT",
    "CRM", "ORCL", "INTC", "AMD",
    "KO", "PEP", "MCD", "BA",
]

EMOTION_LABELS = ["HAP", "SAD", "ANG", "FEA", "DIS", "SUR", "NEU"]


def _softmax(logits: list[float]) -> list[float]:
    arr = np.array(logits)
    exp = np.exp(arr - np.max(arr))
    return (exp / exp.sum()).tolist()


def _generate_emotion_probs(actual_return: float, noise: float = 0.4) -> list[dict]:
    """Generate synthetic emotion probabilities that correlate with actual return.

    Positive returns → higher happy/surprise, lower fear/sadness
    Negative returns → higher fear/sadness/anger, lower happy
    Noise controls how strong the correlation is (lower = stronger signal).
    """
    signal = np.clip(actual_return * 20, -2, 2)

    logits = [
        1.5 + signal + random.gauss(0, noise),       # HAP
        0.3 - signal * 0.7 + random.gauss(0, noise),  # SAD
        0.2 - signal * 0.5 + random.gauss(0, noise),  # ANG
        0.4 - signal * 1.0 + random.gauss(0, noise),  # FEA
        0.2 - signal * 0.3 + random.gauss(0, noise),  # DIS
        0.8 + signal * 0.5 + random.gauss(0, noise),  # SUR
        1.0 + random.gauss(0, noise * 0.5),           # NEU
    ]
    probs = _softmax(logits)
    return [
        {"token": f"EMOTION_{label}", "probability": round(p, 4)}
        for label, p in zip(EMOTION_LABELS, probs)
    ]


def _generate_gender_probs() -> list[dict]:
    male_p = random.uniform(0.5, 0.85)
    return [
        {"token": "GENDER_MALE", "probability": round(male_p, 4)},
        {"token": "GENDER_FEMALE", "probability": round(1 - male_p, 4)},
    ]


def _generate_age_probs() -> list[dict]:
    logits = [0.1, 0.3, 0.8, 1.5, 0.7]
    probs = _softmax([l + random.gauss(0, 0.3) for l in logits])
    labels = ["0_18", "18_30", "30_45", "45_60", "60+"]
    return [
        {"token": f"AGE_{l}", "probability": round(p, 4)}
        for l, p in zip(labels, probs)
    ]


def _generate_transcript(actual_return: float) -> str:
    """Generate synthetic transcript text with sentiment correlated to return."""
    positive_phrases = [
        "We are very confident in our growth trajectory.",
        "Revenue exceeded expectations significantly.",
        "Strong demand across all segments.",
        "Our margin expansion continues to accelerate.",
        "We delivered outstanding results this quarter.",
        "The momentum in our business is remarkable.",
        "We expect continued strong performance.",
    ]
    negative_phrases = [
        "We face some headwinds in the current environment.",
        "Results were somewhat below our expectations.",
        "The challenging macro environment impacted results.",
        "We are taking restructuring actions to improve efficiency.",
        "There was a decline in certain market segments.",
        "Uncertainty remains in the near-term outlook.",
        "We experienced some slowdown in demand.",
    ]
    neutral_phrases = [
        "Let me walk you through the quarterly results.",
        "We continue to invest in innovation.",
        "Our team has been executing on the strategy.",
        "We see opportunities in new markets.",
        "The competitive landscape remains dynamic.",
    ]

    # Weight selection by actual return
    if actual_return > 0.02:
        pool = positive_phrases * 3 + neutral_phrases + negative_phrases
    elif actual_return < -0.02:
        pool = negative_phrases * 3 + neutral_phrases + positive_phrases
    else:
        pool = neutral_phrases * 2 + positive_phrases + negative_phrases

    n_sentences = random.randint(3, 6)
    return " ".join(random.sample(pool, min(n_sentences, len(pool))))


def _generate_divergent_transcript(actual_return: float) -> str:
    """Sometimes the text says one thing but the voice emotion says another.
    This simulates cross-modal divergence — the key signal."""
    if random.random() < 0.2:
        if actual_return > 0:
            return "We face significant challenges ahead. " + _generate_transcript(-actual_return)
        else:
            return "We are extremely confident. " + _generate_transcript(-actual_return)
    return _generate_transcript(actual_return)


class Backtest:
    """Run a backtest simulation with real stock data + synthetic metadata."""

    def __init__(self, db_path: str | None = None):
        bt_db = db_path or str(settings.data_dir + "/backtest.db")
        self.storage = Storage(db_path=bt_db)
        self.feature_pipeline = FeaturePipeline(self.storage)
        self.trainer = ModelTrainer(self.storage)

    def run(
        self,
        tickers: list[str] | None = None,
        train_days: int = 30,
        predict_days: int = 5,
        noise_level: float = 0.4,
    ) -> dict[str, Any]:
        """Run the full backtest.

        1. Fetch real stock data for the last train_days + predict_days
        2. Generate synthetic STT metadata with signals correlated to actual returns
        3. Train model on train_days of data
        4. Predict for predict_days
        5. Evaluate and report
        """
        tickers = tickers or BACKTEST_TICKERS
        total_days = train_days + predict_days + 10  # buffer for weekends/holidays

        logger.info(
            "Backtest: %d tickers, %d train days, %d predict days, noise=%.2f",
            len(tickers), train_days, predict_days, noise_level,
        )

        # Step 1: Fetch stock data
        end_date = datetime.now()
        start_date = end_date - timedelta(days=total_days * 2)  # extra buffer

        logger.info("Fetching stock data for %d tickers...", len(tickers))
        all_stock_data = self._fetch_stock_data(tickers, start_date, end_date)

        if not all_stock_data:
            return {"error": "Failed to fetch stock data"}

        # Step 2: Generate synthetic audio sources + STT chunks + stock records
        logger.info("Generating synthetic STT metadata...")
        train_sources, test_sources = self._generate_synthetic_data(
            all_stock_data, tickers, train_days, predict_days, noise_level
        )

        logger.info("Generated %d training events, %d test events", len(train_sources), len(test_sources))

        # Step 3: Extract features
        logger.info("Extracting features...")
        for sid in train_sources + test_sources:
            self.feature_pipeline.extract_for_source(sid)

        # Step 4: Train model
        logger.info("Training model on %d events...", len(train_sources))
        try:
            train_result = self.trainer.train(target="return_1d", horizon_label="1d_backtest")
        except Exception as e:
            logger.error("Training failed: %s", e)
            return {"error": f"Training failed: {e}"}

        # Step 5: Predict test set
        logger.info("Predicting %d test events...", len(test_sources))
        predictor = StockPredictor(self.storage)
        model_name = predictor.load_latest()
        if not model_name:
            return {"error": "No model available after training"}

        predictions = []
        for sid in test_sources:
            try:
                pred = predictor.predict_for_source(sid, model_name)
                stock_rec = self.storage.get_stock_record(sid)
                actual_return = stock_rec.get("return_1d", 0) if stock_rec else 0
                actual_direction = 1 if actual_return > 0 else 0

                pred["actual_return"] = actual_return
                pred["actual_direction"] = actual_direction
                pred["correct"] = pred["direction"] == actual_direction
                predictions.append(pred)
            except Exception as e:
                logger.warning("Prediction failed for source %d: %s", sid, e)

        # Step 6: Evaluate
        results = self._evaluate(predictions, train_result)
        return results

    def _fetch_stock_data(
        self, tickers: list[str], start: datetime, end: datetime
    ) -> dict[str, pd.DataFrame]:
        data = {}
        for ticker in tickers:
            try:
                df = yf.download(ticker, start=start.strftime("%Y-%m-%d"),
                                 end=end.strftime("%Y-%m-%d"), progress=False, auto_adjust=True)
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                if not df.empty and len(df) > 10:
                    data[ticker] = df
            except Exception as e:
                logger.warning("Failed to fetch %s: %s", ticker, e)
        # Also fetch SPY for benchmarking
        try:
            spy = yf.download("SPY", start=start.strftime("%Y-%m-%d"),
                              end=end.strftime("%Y-%m-%d"), progress=False, auto_adjust=True)
            if isinstance(spy.columns, pd.MultiIndex):
                spy.columns = spy.columns.get_level_values(0)
            data["SPY"] = spy
        except Exception:
            pass
        return data

    def _generate_synthetic_data(
        self,
        stock_data: dict[str, pd.DataFrame],
        tickers: list[str],
        train_days: int,
        predict_days: int,
        noise: float,
    ) -> tuple[list[int], list[int]]:
        """Create synthetic audio sources + STT + stock records in the DB."""
        train_ids: list[int] = []
        test_ids: list[int] = []

        spy_df = stock_data.get("SPY", pd.DataFrame())

        for ticker in tickers:
            df = stock_data.get(ticker)
            if df is None or len(df) < train_days + predict_days + 5:
                continue

            # Use the last (train_days + predict_days) trading days
            recent = df.tail(train_days + predict_days + 5)
            train_rows = recent.iloc[:-(predict_days + 5)]
            test_rows = recent.iloc[-(predict_days + 5):-5]

            # Generate one "event" per 5 trading days (weekly earnings proxy)
            for label, rows, id_list in [("train", train_rows, train_ids), ("test", test_rows, test_ids)]:
                for i in range(0, len(rows) - 1, max(1, len(rows) // (len(rows) // 5 + 1))):
                    if i + 1 >= len(rows):
                        break
                    event_date = rows.index[i].strftime("%Y-%m-%d")
                    close_price = float(rows.iloc[i]["Close"])

                    # Calculate actual 1-day return
                    if i + 1 < len(rows):
                        next_close = float(rows.iloc[i + 1]["Close"])
                        return_1d = (next_close - close_price) / close_price
                    else:
                        return_1d = 0.0

                    # Calculate 5-day return if possible
                    return_5d = 0.0
                    if i + 5 < len(df):
                        idx = df.index.get_loc(rows.index[i])
                        if idx + 5 < len(df):
                            return_5d = float((df.iloc[idx + 5]["Close"] - close_price) / close_price)

                    # SPY benchmark return
                    spy_return_1d = 0.0
                    if not spy_df.empty:
                        spy_idx = spy_df.index.get_indexer([rows.index[i]], method="nearest")[0]
                        if 0 <= spy_idx < len(spy_df) - 1:
                            spy_return_1d = float(
                                (spy_df.iloc[spy_idx + 1]["Close"] - spy_df.iloc[spy_idx]["Close"])
                                / spy_df.iloc[spy_idx]["Close"]
                            )

                    # Register source
                    source_id = self.storage.insert_audio_source(
                        source_type="backtest",
                        ticker=ticker,
                        company_name=f"{ticker} (synthetic)",
                        event_date=event_date,
                        metadata_json=json.dumps({"synthetic": True, "noise": noise}),
                    )

                    # Generate synthetic STT chunks (5-8 chunks per "call")
                    n_chunks = random.randint(5, 8)
                    chunks = []
                    for ci in range(n_chunks):
                        chunk_return = return_1d + random.gauss(0, 0.01)
                        emotion_probs = _generate_emotion_probs(chunk_return, noise)
                        transcript = _generate_divergent_transcript(chunk_return)

                        chunks.append({
                            "source_id": source_id,
                            "chunk_idx": ci,
                            "start_sec": ci * 10.0,
                            "end_sec": (ci + 1) * 10.0,
                            "transcript": transcript,
                            "emotion_probs": json.dumps(emotion_probs),
                            "intent_probs": None,
                            "age_probs": json.dumps(_generate_age_probs()),
                            "gender_probs": json.dumps(_generate_gender_probs()),
                            "emotion": max(emotion_probs, key=lambda x: x["probability"])["token"].replace("EMOTION_", ""),
                            "intent": "",
                            "age_range": "45_60",
                            "gender": "MALE",
                        })
                    self.storage.insert_stt_chunks(chunks)

                    # Store stock record
                    self.storage.upsert_stock_record(
                        source_id=source_id,
                        ticker=ticker,
                        event_date=event_date,
                        open_price=float(rows.iloc[i]["Open"]),
                        close_price=close_price,
                        high_price=float(rows.iloc[i]["High"]),
                        low_price=float(rows.iloc[i]["Low"]),
                        volume=float(rows.iloc[i]["Volume"]),
                        return_1d=return_1d,
                        return_5d=return_5d,
                        return_20d=0.0,
                        abnormal_1d=return_1d - spy_return_1d,
                        abnormal_5d=0.0,
                        abnormal_20d=0.0,
                    )

                    id_list.append(source_id)

        return train_ids, test_ids

    def _evaluate(self, predictions: list[dict], train_result: dict) -> dict[str, Any]:
        """Evaluate predictions and generate a comprehensive report."""
        if not predictions:
            return {"error": "No predictions to evaluate"}

        correct = [p for p in predictions if p.get("correct")]
        incorrect = [p for p in predictions if not p.get("correct")]
        accuracy = len(correct) / len(predictions)

        # Strategy returns: go long on UP predictions, short on DOWN
        strategy_returns = []
        for p in predictions:
            ret = p.get("actual_return", 0)
            if p.get("direction") == 1:
                strategy_returns.append(ret)
            else:
                strategy_returns.append(-ret)

        strategy_returns = np.array(strategy_returns)
        buy_hold_returns = np.array([p.get("actual_return", 0) for p in predictions])

        # Per-ticker analysis
        ticker_results: dict[str, dict] = {}
        for p in predictions:
            t = p.get("ticker", "?")
            if t not in ticker_results:
                ticker_results[t] = {"correct": 0, "total": 0, "returns": []}
            ticker_results[t]["total"] += 1
            if p.get("correct"):
                ticker_results[t]["correct"] += 1
            ticker_results[t]["returns"].append(
                p["actual_return"] if p["direction"] == 1 else -p["actual_return"]
            )

        for t in ticker_results:
            tr = ticker_results[t]
            tr["accuracy"] = round(tr["correct"] / max(tr["total"], 1), 4)
            tr["avg_return"] = round(float(np.mean(tr["returns"])), 6)
            del tr["returns"]

        # High confidence analysis
        high_conf = [p for p in predictions if p.get("confidence", 0) > 0.65]
        high_conf_correct = [p for p in high_conf if p.get("correct")]
        high_conf_accuracy = len(high_conf_correct) / max(len(high_conf), 1)

        # Feature importance from training
        feature_importance = train_result.get("feature_importance", {})
        top_features = list(feature_importance.items())[:10]

        # Identify which feature categories matter most
        category_importance: dict[str, float] = {
            "emotion": 0, "divergence": 0, "text": 0, "demographics": 0, "other": 0,
        }
        for feat, imp in feature_importance.items():
            if "emotion" in feat or "fear" in feat or "positive_emotion" in feat or "negative_emotion" in feat:
                category_importance["emotion"] += imp
            elif "divergence" in feat or "deception" in feat or "nervous" in feat or "confident_bad" in feat:
                category_importance["divergence"] += imp
            elif "sentiment" in feat or "hedging" in feat or "confidence" in feat or "text_" in feat or "financial" in feat or "question" in feat or "lexical" in feat or "words" in feat:
                category_importance["text"] += imp
            elif "gender" in feat or "age" in feat or "speaker" in feat:
                category_importance["demographics"] += imp
            else:
                category_importance["other"] += imp

        total_imp = sum(category_importance.values()) or 1
        category_importance = {k: round(v / total_imp * 100, 1) for k, v in category_importance.items()}

        # Lessons learned
        lessons = []
        if accuracy > 0.55:
            lessons.append("Model shows predictive signal above random (>55%). The voice metadata correlates with price movement.")
        elif accuracy > 0.5:
            lessons.append("Marginal signal detected. Need more data or lower noise (real audio) to confirm.")
        else:
            lessons.append("No clear signal in this run. With synthetic data this is expected — real earnings calls will have stronger patterns.")

        if high_conf_accuracy > accuracy + 0.05:
            lessons.append(f"High-confidence predictions ({high_conf_accuracy:.0%}) outperform overall ({accuracy:.0%}). The confidence filter works — use it in production.")
        
        if category_importance.get("divergence", 0) > 15:
            lessons.append("Cross-modal divergence features are significant! Voice-text mismatch is a real signal.")
        
        if category_importance.get("emotion", 0) > 30:
            lessons.append("Emotion features dominate. The Whissle STT emotion probabilities are the strongest predictor.")
        
        if category_importance.get("text", 0) > 30:
            lessons.append("Text-based features are important. Hedging/confidence language in transcripts carries signal.")

        best_tickers = sorted(ticker_results.items(), key=lambda x: x[1]["accuracy"], reverse=True)[:5]
        worst_tickers = sorted(ticker_results.items(), key=lambda x: x[1]["accuracy"])[:5]
        
        if best_tickers:
            lessons.append(f"Best predicted tickers: {', '.join(t[0] for t in best_tickers)}. Focus on these for initial deployment.")
        if worst_tickers:
            lessons.append(f"Hardest to predict: {', '.join(t[0] for t in worst_tickers)}. May need sector-specific models.")

        cum_strategy = float(np.sum(strategy_returns))
        cum_buyhold = float(np.sum(buy_hold_returns))
        if cum_strategy > cum_buyhold:
            lessons.append(f"Strategy ({cum_strategy:+.2%}) outperformed buy-and-hold ({cum_buyhold:+.2%}). Signal has economic value.")
        else:
            lessons.append(f"Buy-and-hold ({cum_buyhold:+.2%}) beat strategy ({cum_strategy:+.2%}). Need stronger signal or better position sizing.")

        return {
            "summary": {
                "total_predictions": len(predictions),
                "accuracy": round(accuracy, 4),
                "high_confidence_count": len(high_conf),
                "high_confidence_accuracy": round(high_conf_accuracy, 4),
                "cumulative_strategy_return": round(cum_strategy, 6),
                "cumulative_buy_hold_return": round(cum_buyhold, 6),
                "strategy_sharpe": round(float(np.mean(strategy_returns) / max(np.std(strategy_returns), 1e-8) * np.sqrt(252)), 2),
            },
            "training": {
                "model_version": train_result.get("model_version"),
                "train_accuracy": train_result.get("accuracy"),
                "train_auc": train_result.get("auc_roc"),
                "samples": train_result.get("train_samples"),
            },
            "feature_category_importance": category_importance,
            "top_features": top_features,
            "per_ticker": dict(sorted(ticker_results.items(), key=lambda x: -x[1]["accuracy"])),
            "lessons": lessons,
            "predictions_detail": [
                {
                    "ticker": p.get("ticker"),
                    "direction": p.get("direction_label"),
                    "confidence": p.get("confidence"),
                    "actual_return": round(p.get("actual_return", 0), 6),
                    "correct": p.get("correct"),
                }
                for p in predictions
            ],
        }
