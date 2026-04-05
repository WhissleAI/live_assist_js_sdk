"""
Conviction Engine — aggregates multiple predictions per ticker into a single
actionable signal with time-decay weighting, live prices, and source breakdown.
"""

import json
import logging
import math
from collections import defaultdict
from datetime import datetime
from typing import Any

from ..data.storage import Storage
from ..data.stock_data import StockDataFetcher
from .risk import atr_stop, take_profit, risk_reward_ratio, position_size, confidence_tier
from .explainer import SignalExplainer

logger = logging.getLogger(__name__)

HALF_LIFE_DAYS = 90

SOURCE_TYPE_WEIGHTS: dict[str, float] = {
    "earnings_call": 1.0,
    "guidance_call": 1.2,
    "cfo_conference": 0.9,
    "ceo_interview": 0.8,
    "analyst_call": 0.7,
    "fed_speech": 0.6,
    "ecb_speech": 0.6,
    "boj_speech": 0.6,
    "boe_speech": 0.6,
    "congressional_testimony": 0.5,
}

FALLBACK_ATR_PCT = 0.02
CONFIDENCE_ATR_SCALE = {"high": 1.5, "moderate": 1.0, "low": 0.5}


def _time_decay_weight(event_date_str: str) -> float:
    """Exponential decay: weight = exp(-days / HALF_LIFE_DAYS)."""
    try:
        event_dt = datetime.fromisoformat(event_date_str[:10])
    except (ValueError, TypeError):
        return 0.01
    days = max(0, (datetime.now() - event_dt).days)
    return math.exp(-days / HALF_LIFE_DAYS)


class ConvictionEngine:
    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()
        self.fetcher = StockDataFetcher(self.storage)
        self.explainer = SignalExplainer()

    def compute_all(self, portfolio_value: float = 10_000, risk_pct: float = 0.02) -> list[dict]:
        """Compute one conviction per ticker from all predictions."""
        preds, _ = self.storage.get_predictions_paginated(limit=500)
        if not preds:
            return []

        by_ticker: dict[str, list[dict]] = defaultdict(list)
        for p in preds:
            ticker = p.get("ticker")
            if ticker:
                by_ticker[ticker].append(p)

        tickers = list(by_ticker.keys())
        prices = self.fetcher.get_current_prices_batch(tickers)

        # Pre-fetch ATR data for all tickers (batch for efficiency)
        atr_cache: dict[str, dict] = {}
        for t in tickers:
            atr_data = self.fetcher.get_recent_atr(t)
            if atr_data:
                atr_cache[t] = atr_data

        results = []
        for ticker, ticker_preds in by_ticker.items():
            try:
                conv = self._compute_for_ticker(
                    ticker, ticker_preds, prices.get(ticker),
                    atr_cache.get(ticker),
                    portfolio_value, risk_pct,
                )
                if conv:
                    results.append(conv)
            except Exception as e:
                logger.warning("Conviction failed for %s: %s", ticker, e)

        results.sort(key=lambda c: -(c.get("signal_strength") or 0))
        return results

    def compute_for_ticker(self, ticker: str, portfolio_value: float = 10_000) -> dict | None:
        preds = self.storage.get_predictions(ticker=ticker, limit=50)
        if not preds:
            return None
        price_data = self.fetcher.get_current_price(ticker)
        atr_data = self.fetcher.get_recent_atr(ticker)
        return self._compute_for_ticker(ticker, preds, price_data, atr_data, portfolio_value)

    def _compute_for_ticker(
        self,
        ticker: str,
        preds: list[dict],
        price_data: dict | None,
        atr_data: dict | None,
        portfolio_value: float = 10_000,
        risk_pct: float = 0.02,
    ) -> dict | None:
        if not preds:
            return None

        weighted_up = 0.0
        weighted_down = 0.0
        total_weight = 0.0
        weighted_freshness_sum = 0.0
        source_breakdown = []
        vote_summary = {"buy": 0, "sell": 0, "buy_weight": 0.0, "sell_weight": 0.0}
        latest_source_id = None
        latest_event_date = None
        latest_dt = None
        freshest_date = None
        oldest_date = None
        predicted_returns: list[float] = []

        for p in preds:
            source = self.storage.get_audio_source(p.get("source_id")) if p.get("source_id") else None
            event_date = (source or {}).get("event_date") or p.get("prediction_date", "")[:10]
            source_type = (source or {}).get("source_type", "earnings_call")
            company_name = (source or {}).get("company_name") or p.get("company_name", ticker)

            decay_w = _time_decay_weight(event_date)
            type_w = SOURCE_TYPE_WEIGHTS.get(source_type, 0.5)
            weight = decay_w * type_w

            direction = p.get("direction", 0)
            confidence = p.get("confidence", 0.5)

            if direction == 1:
                weighted_up += weight * confidence
                vote_summary["buy"] += 1
                vote_summary["buy_weight"] += round(weight, 4)
            else:
                weighted_down += weight * confidence
                vote_summary["sell"] += 1
                vote_summary["sell_weight"] += round(weight, 4)
            total_weight += weight
            weighted_freshness_sum += weight * decay_w

            pred_ret = p.get("predicted_return_1d")
            if pred_ret is not None:
                predicted_returns.append(pred_ret)

            try:
                edt = datetime.fromisoformat(event_date[:10])
                if latest_dt is None or edt > latest_dt:
                    latest_dt = edt
                    latest_source_id = p.get("source_id")
                    latest_event_date = event_date[:10]
                if freshest_date is None or event_date[:10] > freshest_date:
                    freshest_date = event_date[:10]
                if oldest_date is None or event_date[:10] < oldest_date:
                    oldest_date = event_date[:10]
            except (ValueError, TypeError):
                pass

            source_breakdown.append({
                "prediction_id": p.get("id"),
                "source_id": p.get("source_id"),
                "source_type": source_type,
                "event_date": event_date[:10],
                "direction": direction,
                "confidence": round(confidence, 4),
                "weight": round(weight, 4),
                "freshness": round(decay_w, 4),
                "company_name": company_name,
            })

        if total_weight == 0:
            return None

        direction = 1 if weighted_up >= weighted_down else 0
        raw_confidence = max(weighted_up, weighted_down) / total_weight
        confidence = min(round(raw_confidence, 4), 0.99)
        freshness = round(weighted_freshness_sum / total_weight, 4)

        current_price = price_data["price"] if price_data else None
        company_name = price_data.get("name", ticker) if price_data else ticker

        # Expected return priority: magnitude model → realized returns → ATR-based → fallback
        atr_pct = (atr_data["atr_pct"] if atr_data else None) or FALLBACK_ATR_PCT
        tier = confidence_tier(confidence)

        if predicted_returns:
            expected_ret = abs(sum(predicted_returns) / len(predicted_returns))
            expected_ret = max(expected_ret, 0.003)
        else:
            realized = self._realized_return_for_ticker(ticker)
            if realized:
                expected_ret = realized
            else:
                scale = CONFIDENCE_ATR_SCALE.get(tier, 1.0)
                expected_ret = atr_pct * scale

        entry = stop = target = rr = None
        pos_shares = 0
        price_updated_at = datetime.now().isoformat()
        if current_price and current_price > 0:
            entry = round(current_price, 2)
            day_h = price_data.get("day_high", current_price) if price_data else current_price
            day_l = price_data.get("day_low", current_price) if price_data else current_price
            stop = atr_stop(current_price, day_h, day_l, atr_pct, direction)
            target = take_profit(entry, direction, expected_ret)
            rr = risk_reward_ratio(entry, stop, target)
            pos = position_size(portfolio_value, risk_pct, entry, stop)
            pos_shares = pos.get("shares", 0)

        # Signal strength: confidence × expected_return × freshness × rr_factor
        rr_factor = min((rr or 0), 3.0) / 3.0
        strength = round(confidence * expected_ret * 100 * max(freshness, 0.1) * max(rr_factor, 0.1), 2)

        # Quality gate
        if (rr or 0) >= 1.5 and freshness >= 0.6 and confidence >= 0.7:
            quality = "strong"
        elif (rr or 0) >= 1.0 and freshness >= 0.3:
            quality = "actionable"
        else:
            quality = "weak"

        latest_pred = max(preds, key=lambda p: p.get("prediction_date", ""))
        features = {}
        if latest_pred.get("features_json"):
            fj = latest_pred["features_json"]
            features = json.loads(fj) if isinstance(fj, str) else (fj if isinstance(fj, dict) else {})
        explanation = self.explainer.explain(features, direction, confidence)

        source_breakdown.sort(key=lambda s: -s["weight"])

        conv = {
            "ticker": ticker,
            "company_name": company_name,
            "direction": direction,
            "action": "BUY" if direction == 1 else "SELL",
            "confidence": confidence,
            "freshness": freshness,
            "source_count": len(preds),
            "vote_summary": vote_summary,
            "latest_source_id": latest_source_id,
            "latest_event_date": latest_event_date,
            "freshest_source_date": freshest_date,
            "oldest_source_date": oldest_date,
            "current_price": current_price,
            "price_updated_at": price_updated_at,
            "entry_price": entry,
            "stop_loss": stop,
            "take_profit": target,
            "risk_reward": rr,
            "position_shares": pos_shares,
            "expected_return_pct": round(expected_ret * 100, 2),
            "confidence_tier": tier,
            "signal_strength": strength,
            "quality": quality,
            "explanation": explanation,
            "source_breakdown": source_breakdown,
        }

        self.storage.upsert_conviction(
            ticker,
            company_name=company_name,
            direction=direction,
            confidence=confidence,
            freshness=freshness,
            source_count=len(preds),
            latest_source_id=latest_source_id,
            latest_event_date=latest_event_date,
            current_price=current_price,
            entry_price=entry,
            stop_loss=stop,
            take_profit=target,
            risk_reward=rr,
            position_shares=pos_shares,
            expected_return_pct=conv["expected_return_pct"],
            confidence_tier=tier,
            signal_strength=strength,
            explanation=explanation,
            source_breakdown_json=json.dumps(source_breakdown),
        )

        return conv

    def _realized_return_for_ticker(self, ticker: str) -> float | None:
        """Average absolute 1-day return from stock_records for this ticker."""
        try:
            records = self.storage.get_stock_records_for_ticker(ticker, limit=50)
            returns = []
            for r in records:
                ret = r.get("return_1d")
                if ret is not None:
                    returns.append(abs(ret))
            if returns:
                return max(sum(returns) / len(returns), 0.003)
        except Exception:
            pass
        return None
