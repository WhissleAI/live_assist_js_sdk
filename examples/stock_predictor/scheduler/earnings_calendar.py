"""
Fetch upcoming earnings dates from Yahoo Finance.
"""

import logging
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

SP500_TOP = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
    "JPM", "JNJ", "V", "UNH", "HD", "PG", "MA", "DIS", "BAC",
    "XOM", "NFLX", "CRM", "ORCL", "COST", "ADBE", "CSCO", "PFE",
    "MRK", "CVX", "WFC", "GS", "MS", "AMD", "INTC", "QCOM", "TXN",
    "AVGO", "LLY", "ABT", "TMO", "DHR", "MCD", "NKE", "SBUX",
    "LOW", "PYPL", "BKNG", "ISRG", "GILD", "MDLZ", "ADP",
]


def fetch_upcoming_earnings(days_ahead: int = 14, tickers: list[str] | None = None) -> list[dict]:
    watch = tickers or SP500_TOP
    today = datetime.now().date()
    cutoff = today + timedelta(days=days_ahead)
    results = []

    for ticker in watch:
        try:
            tk = yf.Ticker(ticker)
            cal = tk.get_earnings_dates(limit=4)
            if cal is None or cal.empty:
                continue

            for date_idx, row in cal.iterrows():
                earn_date = pd.Timestamp(date_idx).date()
                if today <= earn_date <= cutoff:
                    eps_est = row.get("EPS Estimate")
                    eps_act = row.get("Reported EPS")
                    results.append({
                        "ticker": ticker,
                        "date": str(earn_date),
                        "eps_estimate": float(eps_est) if pd.notna(eps_est) else None,
                        "eps_actual": float(eps_act) if pd.notna(eps_act) else None,
                        "reported": pd.notna(eps_act),
                        "company": tk.info.get("shortName", ticker) if hasattr(tk, "info") else ticker,
                    })
        except Exception as e:
            logger.debug("Earnings fetch failed for %s: %s", ticker, e)

    results.sort(key=lambda x: x["date"])
    return results


def fetch_recent_earnings(days_back: int = 7, tickers: list[str] | None = None) -> list[dict]:
    watch = tickers or SP500_TOP
    today = datetime.now().date()
    cutoff = today - timedelta(days=days_back)
    results = []

    for ticker in watch:
        try:
            tk = yf.Ticker(ticker)
            cal = tk.get_earnings_dates(limit=8)
            if cal is None or cal.empty:
                continue

            for date_idx, row in cal.iterrows():
                earn_date = pd.Timestamp(date_idx).date()
                if cutoff <= earn_date <= today:
                    eps_est = row.get("EPS Estimate")
                    eps_act = row.get("Reported EPS")
                    surprise = None
                    if pd.notna(eps_est) and pd.notna(eps_act) and eps_est != 0:
                        surprise = round((float(eps_act) - float(eps_est)) / abs(float(eps_est)) * 100, 1)
                    results.append({
                        "ticker": ticker,
                        "date": str(earn_date),
                        "eps_estimate": float(eps_est) if pd.notna(eps_est) else None,
                        "eps_actual": float(eps_act) if pd.notna(eps_act) else None,
                        "surprise_pct": surprise,
                        "beat": float(eps_act) > float(eps_est) if pd.notna(eps_act) and pd.notna(eps_est) else None,
                    })
        except Exception as e:
            logger.debug("Recent earnings fetch failed for %s: %s", ticker, e)

    results.sort(key=lambda x: x["date"], reverse=True)
    return results
