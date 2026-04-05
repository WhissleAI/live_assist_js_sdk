"""
Market context features derived from stock records at event time.

Transforms raw price/volume data into informative features the model
can learn from — volatility regime, price position, volume profile.
"""

import logging
import math

from ..data.storage import Storage

logger = logging.getLogger(__name__)


def extract_market_context_features(source_id: int, storage: Storage) -> dict[str, float]:
    """Extract market context features from the stock record for this source."""
    record = storage.get_stock_record(source_id)
    if not record:
        return _empty_market_features()

    features: dict[str, float] = {}

    close = record.get("close_price") or 0
    high = record.get("high_price") or close
    low = record.get("low_price") or close
    volume = record.get("volume") or 0
    vol_pre = record.get("vol_pre")
    vol_post = record.get("vol_post")
    vix = record.get("vix_at_event")

    # Intraday range as % of close
    if close > 0:
        features["mkt_price_range_pct"] = (high - low) / close
        features["mkt_close_position"] = (close - low) / max(high - low, 0.01)
    else:
        features["mkt_price_range_pct"] = 0.0
        features["mkt_close_position"] = 0.5

    # Volume (log-scaled for normalization)
    features["mkt_volume_log"] = math.log1p(volume) if volume > 0 else 0.0

    # Pre-event volatility
    features["mkt_vol_pre"] = vol_pre if vol_pre is not None else 0.0

    # Post-event vol expansion (vol_post / vol_pre)
    if vol_pre and vol_pre > 0 and vol_post and vol_post > 0:
        features["mkt_vol_expansion"] = vol_post / vol_pre
    else:
        features["mkt_vol_expansion"] = 1.0

    # VIX regime: 0 = calm (<15), 1 = normal (15-25), 2 = stressed (>25)
    if vix is not None:
        features["mkt_vix_level"] = vix
        if vix < 15:
            features["mkt_vix_regime"] = 0.0
        elif vix < 25:
            features["mkt_vix_regime"] = 1.0
        else:
            features["mkt_vix_regime"] = 2.0
    else:
        features["mkt_vix_level"] = 20.0
        features["mkt_vix_regime"] = 1.0

    return features


def _empty_market_features() -> dict[str, float]:
    return {
        "mkt_price_range_pct": 0.0,
        "mkt_close_position": 0.5,
        "mkt_volume_log": 0.0,
        "mkt_vol_pre": 0.0,
        "mkt_vol_expansion": 1.0,
        "mkt_vix_level": 20.0,
        "mkt_vix_regime": 1.0,
    }
