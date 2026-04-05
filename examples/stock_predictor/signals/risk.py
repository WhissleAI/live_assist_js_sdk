"""
Risk management: ATR-based stops, position sizing, risk/reward calculation.
"""

import math


def atr_stop(
    close: float,
    high: float,
    low: float,
    vol_pre: float | None,
    direction: int,
    multiplier: float = 1.5,
) -> float:
    daily_range = high - low if high and low else close * 0.02
    vol_estimate = vol_pre if vol_pre and vol_pre > 0 else 0.02
    atr_estimate = max(daily_range, close * vol_estimate) * multiplier
    atr_estimate = min(atr_estimate, close * 0.05)  # cap at 5% to avoid absurd stops
    if direction == 1:
        return round(close - atr_estimate, 2)
    return round(close + atr_estimate, 2)


def take_profit(
    entry: float,
    direction: int,
    expected_return: float,
    min_target_pct: float = 0.005,
) -> float:
    magnitude = max(abs(expected_return), min_target_pct)
    if direction == 1:
        return round(entry * (1 + magnitude), 2)
    return round(entry * (1 - magnitude), 2)


def risk_reward_ratio(entry: float, stop: float, target: float) -> float:
    risk = abs(entry - stop)
    reward = abs(target - entry)
    if risk == 0:
        return 0.0
    return round(reward / risk, 2)


def position_size(
    portfolio_value: float,
    risk_pct: float,
    entry: float,
    stop: float,
) -> dict:
    risk_amount = portfolio_value * risk_pct
    risk_per_share = abs(entry - stop)
    if risk_per_share == 0:
        return {"shares": 0, "dollar_amount": 0, "risk_amount": 0}
    shares = int(risk_amount / risk_per_share)
    dollar_amount = round(shares * entry, 2)
    return {
        "shares": shares,
        "dollar_amount": dollar_amount,
        "risk_amount": round(risk_amount, 2),
        "max_loss": round(shares * risk_per_share, 2),
    }


def confidence_tier(confidence: float) -> str:
    if confidence >= 0.85:
        return "high"
    if confidence >= 0.65:
        return "moderate"
    return "low"


def signal_strength(confidence: float, expected_return: float) -> float:
    return round(confidence * abs(expected_return) * 100, 2)
