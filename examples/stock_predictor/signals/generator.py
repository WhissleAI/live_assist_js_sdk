"""
Convert raw predictions + stock data into actionable trade signals.
"""

import json
import logging
from datetime import datetime
from typing import Any

from ..data.storage import Storage
from .risk import (
    atr_stop,
    take_profit,
    risk_reward_ratio,
    position_size,
    confidence_tier,
    signal_strength,
)
from .explainer import SignalExplainer

logger = logging.getLogger(__name__)


class SignalGenerator:
    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()
        self.explainer = SignalExplainer()

    def generate_for_prediction(
        self, prediction_id: int, portfolio_value: float = 10_000, risk_pct: float = 0.02,
    ) -> dict[str, Any] | None:
        pred = self.storage.get_prediction_detail(prediction_id)
        if not pred:
            return None

        direction = pred.get("direction", 0)
        confidence = pred.get("confidence", 0.5)
        ticker = pred.get("ticker", "?")
        close = pred.get("close_price")
        high = pred.get("high_price")
        low = pred.get("low_price")
        vol_pre = pred.get("vol_pre")
        return_1d = pred.get("return_1d")

        if not close or close <= 0:
            return None

        entry = round(close, 2)
        expected_ret = return_1d if return_1d is not None else (0.02 if direction == 1 else -0.02)

        stop = atr_stop(close, high or close, low or close, vol_pre, direction)
        target = take_profit(entry, direction, expected_ret)
        rr = risk_reward_ratio(entry, stop, target)
        pos = position_size(portfolio_value, risk_pct, entry, stop)
        tier = confidence_tier(confidence)
        strength = signal_strength(confidence, expected_ret)

        features = pred.get("features_parsed") or {}
        explanation = self.explainer.explain(features, direction, confidence)

        signal = {
            "prediction_id": prediction_id,
            "ticker": ticker,
            "company_name": pred.get("company_name") or ticker,
            "event_date": pred.get("source_event_date") or pred.get("prediction_date", ""),
            "prediction_date": pred.get("prediction_date", ""),

            "action": "BUY" if direction == 1 else "SELL",
            "direction": direction,
            "confidence": round(confidence, 4),
            "confidence_tier": tier,
            "signal_strength": strength,

            "entry_price": entry,
            "stop_loss": stop,
            "take_profit": target,
            "risk_reward": rr,
            "expected_return_pct": round(expected_ret * 100, 2),

            "position": pos,
            "stop_distance_pct": round(abs(entry - stop) / entry * 100, 2),
            "target_distance_pct": round(abs(target - entry) / entry * 100, 2),

            "explanation": explanation,
            "key_signals": self.explainer.key_signals(features),

            "actual_return_1d": pred.get("return_1d"),
            "actual_return_5d": pred.get("return_5d"),
            "was_correct": pred.get("was_correct"),
            "model_version": pred.get("model_version"),
        }

        self.storage.upsert_trade_signal(prediction_id, json.dumps(signal))
        return signal

    def generate_all_signals(self, portfolio_value: float = 10_000) -> list[dict]:
        preds, _ = self.storage.get_predictions_paginated(limit=200)
        signals = []
        for p in preds:
            try:
                sig = self.generate_for_prediction(p["id"], portfolio_value=portfolio_value)
                if sig:
                    signals.append(sig)
            except Exception as e:
                logger.warning("Signal generation failed for prediction %d: %s", p["id"], e)
        return signals

    def get_todays_signals(self, portfolio_value: float = 10_000) -> dict:
        """Delegates to ConvictionEngine for per-ticker signals, falls back to legacy."""
        try:
            from .conviction import ConvictionEngine
            engine = ConvictionEngine(self.storage)
            convictions = engine.compute_all(portfolio_value)
            high = [c for c in convictions if c.get("confidence_tier") == "high"]
            moderate = [c for c in convictions if c.get("confidence_tier") == "moderate"]
            low = [c for c in convictions if c.get("confidence_tier") == "low"]
            return {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "total_signals": len(convictions),
                "high_confidence": high,
                "moderate_confidence": moderate,
                "low_confidence": low,
                "portfolio_value": portfolio_value,
            }
        except Exception as e:
            logger.warning("ConvictionEngine failed, falling back to legacy: %s", e)

        signals = self.generate_all_signals(portfolio_value)
        high = [s for s in signals if s["confidence_tier"] == "high"]
        moderate = [s for s in signals if s["confidence_tier"] == "moderate"]
        low = [s for s in signals if s["confidence_tier"] == "low"]

        high.sort(key=lambda s: -s["signal_strength"])
        moderate.sort(key=lambda s: -s["signal_strength"])

        return {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "total_signals": len(signals),
            "high_confidence": high,
            "moderate_confidence": moderate,
            "low_confidence": low,
            "portfolio_value": portfolio_value,
        }

    def get_track_record(self) -> dict:
        preds, total = self.storage.get_predictions_paginated(limit=500)

        evaluated = [p for p in preds if p.get("was_correct") is not None]
        wins = [p for p in evaluated if p["was_correct"]]
        losses = [p for p in evaluated if not p["was_correct"]]

        # Build source_type lookup in a single query
        source_type_map: dict[int, str] = {}
        source_ids = [p.get("source_id") for p in evaluated if p.get("source_id")]
        if source_ids:
            placeholders = ",".join(["?"] * len(source_ids))
            try:
                with self.storage._conn() as conn:
                    rows = conn.execute(
                        f"SELECT id, source_type FROM audio_sources WHERE id IN ({placeholders})",
                        source_ids,
                    ).fetchall()
                    for r in rows:
                        source_type_map[r[0]] = r[1]
            except Exception:
                pass

        cumulative_return = 0.0
        equity_curve = []
        monthly_returns: dict[str, float] = {}
        for p in sorted(evaluated, key=lambda x: x.get("prediction_date", "")):
            ret_1d = p.get("return_1d", 0) or 0
            trade_return = ret_1d if p["direction"] == 1 else -ret_1d
            cumulative_return += trade_return
            month_key = p.get("prediction_date", "")[:7]
            monthly_returns[month_key] = monthly_returns.get(month_key, 0) + trade_return

            source_type = source_type_map.get(p.get("source_id"), "unknown")

            equity_curve.append({
                "date": p.get("prediction_date", "")[:10],
                "ticker": p.get("ticker"),
                "return": round(trade_return * 100, 2),
                "cumulative": round(cumulative_return * 100, 2),
                "correct": p["was_correct"],
                "confidence": round(p.get("confidence", 0.5), 4),
                "source_type": source_type,
                "direction": p.get("direction", 0),
            })

        high_conf = [p for p in evaluated if (p.get("confidence") or 0) >= 0.85]
        high_conf_wins = [p for p in high_conf if p["was_correct"]]

        best_trade = max(equity_curve, key=lambda x: x["return"]) if equity_curve else None
        worst_trade = min(equity_curve, key=lambda x: x["return"]) if equity_curve else None

        return {
            "total_predictions": total,
            "evaluated": len(evaluated),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": round(len(wins) / len(evaluated), 4) if evaluated else None,
            "high_confidence_total": len(high_conf),
            "high_confidence_wins": len(high_conf_wins),
            "high_confidence_win_rate": round(len(high_conf_wins) / len(high_conf), 4) if high_conf else None,
            "cumulative_return_pct": round(cumulative_return * 100, 2),
            "equity_curve": equity_curve,
            "monthly_returns": {k: round(v * 100, 2) for k, v in monthly_returns.items()},
            "best_trade": best_trade,
            "worst_trade": worst_trade,
        }
