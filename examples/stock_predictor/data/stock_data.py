"""
Fetch historical stock market data and compute returns aligned with audio events.

Uses yfinance for OHLCV data and VIX.
"""

import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf

from ..config import settings
from .storage import Storage

logger = logging.getLogger(__name__)

MARKET_BENCHMARK = "SPY"
VIX_TICKER = "^VIX"


class StockDataFetcher:
    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()

    def get_current_price(self, ticker: str) -> dict | None:
        """Fetch current/latest price quote for a ticker via yfinance."""
        try:
            tk = yf.Ticker(ticker)
            info = tk.info
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            if not price:
                hist = tk.history(period="1d")
                if not hist.empty:
                    price = float(hist["Close"].iloc[-1])
            if not price:
                return None
            return {
                "price": float(price),
                "day_high": float(info.get("dayHigh") or price),
                "day_low": float(info.get("dayLow") or price),
                "volume": info.get("volume"),
                "market_cap": info.get("marketCap"),
                "name": info.get("shortName", ticker),
            }
        except Exception as e:
            logger.warning("Current price fetch failed for %s: %s", ticker, e)
            return None

    def get_current_prices_batch(self, tickers: list[str]) -> dict[str, dict]:
        """Fetch current prices for multiple tickers. Returns {ticker: price_dict}."""
        results = {}
        for t in tickers:
            data = self.get_current_price(t)
            if data:
                results[t] = data
        return results

    def get_recent_atr(self, ticker: str, days: int = 20) -> dict | None:
        """Compute Average True Range from recent price data."""
        try:
            df = yf.download(ticker, period=f"{days + 5}d", progress=False, auto_adjust=True)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            if df.empty or len(df) < 5:
                return None
            high = df["High"].values
            low = df["Low"].values
            close = df["Close"].values
            tr = []
            for i in range(1, len(df)):
                tr.append(max(
                    high[i] - low[i],
                    abs(high[i] - close[i - 1]),
                    abs(low[i] - close[i - 1]),
                ))
            if not tr:
                return None
            atr = float(np.mean(tr[-min(days, len(tr)):]))
            last_close = float(close[-1])
            return {
                "atr": round(atr, 4),
                "atr_pct": round(atr / last_close, 6) if last_close > 0 else 0.02,
                "last_close": last_close,
            }
        except Exception as e:
            logger.warning("ATR fetch failed for %s: %s", ticker, e)
            return None

    def fetch_and_store_for_all_sources(self):
        """Fetch stock data for every audio source that doesn't have a stock record yet."""
        sources = self.storage.list_audio_sources()
        processed = 0
        for src in sources:
            if not src.get("ticker"):
                continue
            existing = self.storage.get_stock_record(src["id"])
            if existing:
                continue
            try:
                self.fetch_for_source(src["id"], src["ticker"], src["event_date"])
                processed += 1
            except Exception as e:
                logger.warning("Stock data failed for %s on %s: %s", src["ticker"], src["event_date"], e)
        logger.info("Fetched stock data for %d sources", processed)

    def fetch_for_source(self, source_id: int, ticker: str, event_date: str):
        """Fetch OHLCV + returns for a single source and store in DB."""
        dt = datetime.fromisoformat(event_date)
        start = dt - timedelta(days=settings.stock_lookback_days + 30)
        end = dt + timedelta(days=max(settings.stock_lookahead_days) + 10)

        stock_df = self._download(ticker, start, end)
        bench_df = self._download(MARKET_BENCHMARK, start, end)

        if stock_df.empty:
            logger.warning("No stock data for %s around %s", ticker, event_date)
            return

        event_idx = self._nearest_trading_day(stock_df, dt)
        if event_idx is None:
            logger.warning("Cannot find trading day near %s for %s", event_date, ticker)
            return

        row = stock_df.iloc[event_idx]
        record: dict = {
            "source_id": source_id,
            "ticker": ticker.upper(),
            "event_date": event_date,
            "open_price": float(row["Open"]),
            "close_price": float(row["Close"]),
            "high_price": float(row["High"]),
            "low_price": float(row["Low"]),
            "volume": float(row["Volume"]),
        }

        for horizon in settings.stock_lookahead_days:
            future_idx = event_idx + horizon
            stock_ret = self._compute_return(stock_df, event_idx, future_idx)
            bench_ret = self._compute_return(bench_df, event_idx, future_idx) if not bench_df.empty else 0.0
            record[f"return_{horizon}d"] = stock_ret
            record[f"abnormal_{horizon}d"] = stock_ret - bench_ret

        try:
            vix_df = self._download(VIX_TICKER, start, end)
            vix_idx = self._nearest_trading_day(vix_df, dt)
            if vix_idx is not None:
                record["vix_at_event"] = float(vix_df.iloc[vix_idx]["Close"])
        except Exception:
            pass

        lookback = min(settings.stock_lookback_days, event_idx)
        if lookback >= 2:
            pre_returns = stock_df["Close"].pct_change().iloc[event_idx - lookback:event_idx]
            record["vol_pre"] = float(pre_returns.std()) if len(pre_returns) > 1 else None

        lookahead = min(5, len(stock_df) - event_idx - 1)
        if lookahead >= 2:
            post_returns = stock_df["Close"].pct_change().iloc[event_idx + 1:event_idx + 1 + lookahead]
            record["vol_post"] = float(post_returns.std()) if len(post_returns) > 1 else None

        self.storage.upsert_stock_record(**record)
        logger.info(
            "Stock data stored: %s on %s — return_1d=%.4f, abnormal_1d=%.4f",
            ticker, event_date, record.get("return_1d", 0), record.get("abnormal_1d", 0),
        )

    def _download(self, ticker: str, start: datetime, end: datetime) -> pd.DataFrame:
        try:
            df = yf.download(
                ticker,
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                progress=False,
                auto_adjust=True,
            )
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            return df
        except Exception as e:
            logger.warning("yfinance download failed for %s: %s", ticker, e)
            return pd.DataFrame()

    @staticmethod
    def _nearest_trading_day(df: pd.DataFrame, dt: datetime) -> int | None:
        if df.empty:
            return None
        idx = df.index.get_indexer([pd.Timestamp(dt)], method="nearest")[0]
        if idx < 0 or idx >= len(df):
            return None
        return int(idx)

    @staticmethod
    def _compute_return(df: pd.DataFrame, from_idx: int, to_idx: int) -> float:
        if to_idx >= len(df) or from_idx < 0:
            return 0.0
        p0 = df.iloc[from_idx]["Close"]
        p1 = df.iloc[to_idx]["Close"]
        if p0 == 0:
            return 0.0
        return float((p1 - p0) / p0)
