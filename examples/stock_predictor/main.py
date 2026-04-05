#!/usr/bin/env python3
"""
CLI entry point for the Whissle Stock Predictor.

Usage:
    python -m stock_predictor batch --audio-dir ./earnings_audio
    python -m stock_predictor stt                          # process pending audio
    python -m stock_predictor features                     # extract pending features
    python -m stock_predictor train                        # train models
    python -m stock_predictor predict --source-id 42       # predict for a source
    python -m stock_predictor daily                        # run daily pipeline
    python -m stock_predictor serve                        # start API server
    python -m stock_predictor stats                        # show pipeline stats
    python -m stock_predictor register --dir ./audio       # register local audio files
"""

import asyncio
import json
import logging
import sys

import typer
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from .config import settings
from .data.storage import Storage
from .data.earnings import EarningsDownloader
from .data.stock_data import StockDataFetcher
from .stt.processor import BatchSTTProcessor
from .features.pipeline import FeaturePipeline
from .models.trainer import ModelTrainer
from .models.predictor import StockPredictor
from .pipeline.batch import BatchPipeline
from .pipeline.daily import DailyPipeline
from .pipeline.backtest import Backtest
from .pipeline.real_earnings import RealEarningsPipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

cli = typer.Typer(name="stock-predictor", help="Whissle Stock Predictor CLI")
console = Console()


@cli.command()
def batch(
    audio_dir: str = typer.Option("", help="Directory with local audio files"),
    tickers: str = typer.Option("", help="Comma-separated tickers"),
    skip_download: bool = typer.Option(True, help="Skip downloading from API"),
    skip_stt: bool = typer.Option(False, help="Skip STT processing"),
    skip_train: bool = typer.Option(False, help="Skip model training"),
):
    """Run the full batch pipeline."""
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()] or None
    pipeline = BatchPipeline()
    result = asyncio.run(pipeline.run_full(
        tickers=ticker_list,
        audio_dir=audio_dir or None,
        skip_download=skip_download,
        skip_stt=skip_stt,
        skip_train=skip_train,
    ))
    console.print(Panel(json.dumps(result, indent=2, default=str), title="Batch Pipeline Results"))


@cli.command()
def stt():
    """Process pending audio through Whissle STT."""
    processor = BatchSTTProcessor()
    count = asyncio.run(processor.process_all_pending())
    console.print(f"Processed {count} audio sources through STT")


@cli.command()
def features():
    """Extract features for pending sources."""
    pipeline = FeaturePipeline()
    count = pipeline.extract_all_pending()
    console.print(f"Extracted features for {count} sources")


@cli.command()
def stock_data():
    """Fetch stock market data for all sources."""
    fetcher = StockDataFetcher()
    fetcher.fetch_and_store_for_all_sources()
    console.print("Stock data fetch complete")


@cli.command()
def train(
    target: str = typer.Option("return_1d", help="Target variable"),
    horizon: str = typer.Option("1d", help="Horizon label"),
):
    """Train prediction models."""
    trainer = ModelTrainer()
    try:
        result = trainer.train(target=target, horizon_label=horizon)
        _print_training_results(result)
    except ValueError as e:
        console.print(f"[red]Error:[/red] {e}")


@cli.command()
def train_all():
    """Train models for all horizons (1d, 5d, 20d)."""
    trainer = ModelTrainer()
    results = trainer.train_all_horizons()
    for horizon, result in results.items():
        console.print(f"\n[bold]--- {horizon} horizon ---[/bold]")
        if "error" in result:
            console.print(f"[red]{result['error']}[/red]")
        else:
            _print_training_results(result)


@cli.command()
def backtest(
    tickers: str = typer.Option("", help="Comma-separated tickers (default: top 28)"),
    train_days: int = typer.Option(30, help="Number of trading days to train on"),
    predict_days: int = typer.Option(5, help="Number of trading days to predict"),
    noise: float = typer.Option(0.4, help="Noise level in synthetic metadata (lower = stronger signal)"),
):
    """Run a backtest with real stock data + synthetic STT metadata."""
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()] or None
    bt = Backtest()
    console.print(Panel(
        f"Training on {train_days} days, predicting {predict_days} days\n"
        f"Tickers: {len(ticker_list) if ticker_list else 28} | Noise: {noise}",
        title="Backtest Starting",
    ))
    result = bt.run(tickers=ticker_list, train_days=train_days, predict_days=predict_days, noise_level=noise)

    if "error" in result:
        console.print(f"[red]Error:[/red] {result['error']}")
        return

    # Summary
    s = result["summary"]
    summary_table = Table(title="Backtest Results")
    summary_table.add_column("Metric", style="cyan")
    summary_table.add_column("Value", style="green")
    summary_table.add_row("Total Predictions", str(s["total_predictions"]))
    summary_table.add_row("Accuracy", f"{s['accuracy']:.1%}")
    summary_table.add_row("High-Confidence Count", str(s["high_confidence_count"]))
    summary_table.add_row("High-Confidence Accuracy", f"{s['high_confidence_accuracy']:.1%}")
    summary_table.add_row("Strategy Return", f"{s['cumulative_strategy_return']:+.4%}")
    summary_table.add_row("Buy & Hold Return", f"{s['cumulative_buy_hold_return']:+.4%}")
    summary_table.add_row("Strategy Sharpe", str(s["strategy_sharpe"]))
    console.print(summary_table)

    # Feature categories
    cat = result.get("feature_category_importance", {})
    if cat:
        cat_table = Table(title="Feature Category Importance (%)")
        cat_table.add_column("Category")
        cat_table.add_column("Importance %")
        for k, v in sorted(cat.items(), key=lambda x: -x[1]):
            cat_table.add_row(k, f"{v:.1f}%")
        console.print(cat_table)

    # Top features
    top_feats = result.get("top_features", [])
    if top_feats:
        ft = Table(title="Top 10 Features")
        ft.add_column("Feature")
        ft.add_column("Importance")
        for name, imp in top_feats:
            ft.add_row(name, f"{imp:.4f}")
        console.print(ft)

    # Per-ticker results
    ticker_data = result.get("per_ticker", {})
    if ticker_data:
        tt = Table(title="Per-Ticker Accuracy")
        tt.add_column("Ticker")
        tt.add_column("Accuracy")
        tt.add_column("Predictions")
        tt.add_column("Avg Return")
        for t, d in list(ticker_data.items())[:20]:
            color = "green" if d["accuracy"] > 0.55 else ("red" if d["accuracy"] < 0.45 else "yellow")
            tt.add_row(t, f"[{color}]{d['accuracy']:.0%}[/{color}]", str(d["total"]), f"{d['avg_return']:+.4%}")
        console.print(tt)

    # Lessons
    lessons = result.get("lessons", [])
    if lessons:
        lesson_text = "\n".join(f"  {i+1}. {l}" for i, l in enumerate(lessons))
        console.print(Panel(lesson_text, title="Lessons Learned", border_style="yellow"))


@cli.command()
def real(
    max_calls: int = typer.Option(75, help="Max earnings calls to download"),
    skip_download: bool = typer.Option(False, help="Skip downloading audio"),
    skip_stt: bool = typer.Option(False, help="Skip STT processing"),
    predict_days: int = typer.Option(5, help="Predict recent N days of calls"),
):
    """Run the full real-data pipeline: download earnings calls, STT, train, predict."""
    pipeline = RealEarningsPipeline()
    console.print(Panel(
        f"Max calls: {max_calls} | Skip download: {skip_download} | Skip STT: {skip_stt}",
        title="Real Earnings Pipeline",
    ))
    result = asyncio.run(pipeline.run(
        max_calls=max_calls,
        skip_download=skip_download,
        skip_stt=skip_stt,
        predict_recent_days=predict_days,
    ))

    if "error" in result:
        console.print(f"[red]Error:[/red] {result['error']}")
        console.print(json.dumps({k: v for k, v in result.items() if k != "predictions"}, indent=2, default=str))
        return

    # Training results
    tr = result.get("training", {})
    if tr and "error" not in tr:
        t = Table(title="Training Results")
        t.add_column("Metric", style="cyan")
        t.add_column("Value", style="green")
        t.add_row("Model", str(tr.get("model")))
        t.add_row("Samples", str(tr.get("samples")))
        t.add_row("Accuracy", f"{tr.get('accuracy', 0):.1%}")
        t.add_row("AUC-ROC", f"{tr.get('auc_roc', 0):.4f}")
        t.add_row("Sharpe", f"{tr.get('sharpe', 0):.2f}")
        console.print(t)

        top_f = tr.get("top_features", [])
        if top_f:
            ft = Table(title="Top Features (Real Data)")
            ft.add_column("Feature")
            ft.add_column("Importance")
            for name, imp in top_f[:15]:
                ft.add_row(name, f"{imp:.4f}")
            console.print(ft)

    # Evaluation
    ev = result.get("evaluation", {})
    if ev and "message" not in ev:
        e = Table(title="Prediction Evaluation")
        e.add_column("Metric", style="cyan")
        e.add_column("Value", style="green")
        e.add_row("Evaluated", str(ev.get("total_evaluated")))
        e.add_row("Accuracy", f"{ev.get('accuracy', 0):.1%}")
        e.add_row("High-Conf Count", str(ev.get("high_confidence_count")))
        e.add_row("High-Conf Accuracy", f"{ev.get('high_confidence_accuracy', 0):.1%}")
        e.add_row("Strategy Return", f"{ev.get('strategy_cumulative', 0):+.4%}")
        e.add_row("Buy & Hold Return", f"{ev.get('buy_hold_cumulative', 0):+.4%}")
        e.add_row("Sharpe", str(ev.get("strategy_sharpe")))
        console.print(e)

        per_ticker = ev.get("per_ticker", {})
        if per_ticker:
            pt = Table(title="Per-Ticker Results")
            pt.add_column("Ticker")
            pt.add_column("Accuracy")
            pt.add_column("Predictions")
            pt.add_column("Strategy Return")
            for tk, d in list(per_ticker.items())[:25]:
                color = "green" if d["accuracy"] > 0.55 else ("red" if d["accuracy"] < 0.45 else "yellow")
                pt.add_row(
                    tk,
                    f"[{color}]{d['accuracy']:.0%}[/{color}]",
                    str(d["predictions"]),
                    f"{d['strategy_return']:+.4%}",
                )
            console.print(pt)

    # Recent predictions
    preds = result.get("predictions", [])
    if preds:
        p = Table(title=f"Predictions ({len(preds)} calls)")
        p.add_column("Ticker")
        p.add_column("Date")
        p.add_column("Predicted")
        p.add_column("Confidence")
        p.add_column("Actual 1d")
        p.add_column("Correct?")
        for pr in preds[:30]:
            direction = pr.get("direction_label", "?")
            d_color = "green" if direction == "UP" else "red"
            actual = pr.get("actual_return_1d")
            actual_str = f"{actual:+.2%}" if actual is not None else "?"
            correct = pr.get("correct")
            c_str = "[green]YES[/green]" if correct else ("[red]NO[/red]" if correct is not None else "?")
            p.add_row(
                pr.get("ticker", "?"),
                pr.get("prediction_date", "?")[:10],
                f"[{d_color}]{direction}[/{d_color}]",
                f"{pr.get('confidence', 0):.1%}",
                actual_str,
                c_str,
            )
        console.print(p)

    # Summary panel
    console.print(Panel(
        f"Sources: {result.get('total_sources', 0)} | "
        f"Chunks: {result.get('total_chunks', 0)} | "
        f"STT Processed: {result.get('stt_processed', 'skipped')} | "
        f"Features: {result.get('features_extracted', 0)}",
        title="Pipeline Summary",
    ))


@cli.command()
def predict(
    source_id: int = typer.Option(..., help="Audio source ID to predict"),
):
    """Generate prediction for a specific source."""
    pred = StockPredictor()
    pred.load_latest()
    try:
        result = pred.predict_for_source(source_id)
        _print_prediction(result)
    except Exception as e:
        console.print(f"[red]Error:[/red] {e}")


@cli.command()
def daily():
    """Run the daily prediction pipeline."""
    pipeline = DailyPipeline()
    result = asyncio.run(pipeline.run())
    console.print(Panel(json.dumps(result, indent=2, default=str), title="Daily Pipeline Results"))


@cli.command()
def serve(
    host: str = typer.Option(settings.api_host, help="Bind host"),
    port: int = typer.Option(settings.api_port, help="Bind port"),
):
    """Start the prediction API server."""
    import uvicorn
    console.print(f"Starting Stock Predictor API on {host}:{port}")
    uvicorn.run("stock_predictor.api.server:app", host=host, port=port, reload=True)


@cli.command()
def register(
    dir: str = typer.Option(..., help="Directory with audio files"),
    pattern: str = typer.Option(r"(\w+)_(\d{4})Q(\d)", help="Filename regex pattern"),
):
    """Register local audio files into the database."""
    dl = EarningsDownloader()
    ids = dl.register_local_files(dir, pattern)
    console.print(f"Registered {len(ids)} audio files")


@cli.command()
def stats():
    """Show pipeline statistics."""
    storage = Storage()

    sources = storage.list_audio_sources()
    total_chunks = storage.count_stt_chunks()
    latest_model = storage.get_latest_model_run()
    recent_preds = storage.get_predictions(limit=5)

    table = Table(title="Pipeline Statistics")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("Total Audio Sources", str(len(sources)))
    table.add_row("Total STT Chunks", str(total_chunks))
    table.add_row("Unprocessed Sources", str(len(storage.get_unprocessed_sources())))
    table.add_row("Sources Without Features", str(len(storage.get_sources_without_features())))

    if latest_model:
        table.add_row("Latest Model", latest_model.get("model_version", "none"))
        table.add_row("Model Accuracy", f"{latest_model.get('accuracy', 0):.4f}")
        table.add_row("Model AUC-ROC", f"{latest_model.get('auc_roc', 0):.4f}")
        table.add_row("Sharpe Ratio", f"{latest_model.get('sharpe_ratio', 0):.4f}")

    console.print(table)

    if sources:
        ticker_counts: dict[str, int] = {}
        for s in sources:
            t = s.get("ticker", "unknown")
            ticker_counts[t] = ticker_counts.get(t, 0) + 1
        ticker_table = Table(title="Sources by Ticker (top 20)")
        ticker_table.add_column("Ticker")
        ticker_table.add_column("Count")
        for t, c in sorted(ticker_counts.items(), key=lambda x: -x[1])[:20]:
            ticker_table.add_row(t, str(c))
        console.print(ticker_table)

    if recent_preds:
        pred_table = Table(title="Recent Predictions")
        pred_table.add_column("Ticker")
        pred_table.add_column("Date")
        pred_table.add_column("Direction")
        pred_table.add_column("Confidence")
        for p in recent_preds:
            direction = "UP" if p.get("direction") == 1 else "DOWN"
            color = "green" if direction == "UP" else "red"
            pred_table.add_row(
                p.get("ticker", "?"),
                p.get("prediction_date", "?")[:10],
                f"[{color}]{direction}[/{color}]",
                f"{p.get('confidence', 0):.2%}",
            )
        console.print(pred_table)


def _print_training_results(result: dict):
    table = Table(title=f"Model: {result.get('model_version', '?')}")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="green")
    table.add_row("Train Samples", str(result.get("train_samples", 0)))
    table.add_row("Test Samples", str(result.get("test_samples", 0)))
    table.add_row("Accuracy", f"{result.get('accuracy', 0):.4f}")
    table.add_row("AUC-ROC", f"{result.get('auc_roc', 0):.4f}")
    table.add_row("Sharpe Ratio", f"{result.get('sharpe_ratio', 0):.4f}")
    console.print(table)

    importance = result.get("feature_importance", {})
    if importance:
        imp_table = Table(title="Top Feature Importance")
        imp_table.add_column("Feature")
        imp_table.add_column("Importance")
        for feat, imp in list(importance.items())[:15]:
            imp_table.add_row(feat, f"{imp:.4f}")
        console.print(imp_table)


def _print_prediction(result: dict):
    direction = result.get("direction_label", "?")
    confidence = result.get("confidence", 0)
    color = "green" if direction == "UP" else "red"

    panel = Panel(
        f"[bold {color}]{direction}[/bold {color}] with {confidence:.1%} confidence\n\n"
        f"Ticker: {result.get('ticker', '?')}\n"
        f"P(UP): {result.get('prob_up', 0):.4f}\n"
        f"P(DOWN): {result.get('prob_down', 0):.4f}\n"
        f"Model: {result.get('model_version', '?')}",
        title=f"Prediction for Source #{result.get('source_id', '?')}",
    )
    console.print(panel)

    top_feats = result.get("top_features", [])
    if top_feats:
        ft = Table(title="Key Drivers")
        ft.add_column("Feature")
        ft.add_column("Value")
        ft.add_column("Importance")
        for f in top_feats:
            ft.add_row(f["feature"], f"{f['value']:.4f}", f"{f['importance']:.4f}")
        console.print(ft)


if __name__ == "__main__":
    cli()
