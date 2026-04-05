"""
Prediction interface — loads trained models and generates predictions
for new audio sources.
"""

import json
import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

from ..config import settings
from ..data.storage import Storage
from ..features.pipeline import FeaturePipeline

logger = logging.getLogger(__name__)


class StockPredictor:
    """Generate stock predictions using trained models."""

    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()
        self.feature_pipeline = FeaturePipeline(self.storage)
        self.model_dir = Path(settings.model_dir)
        self._loaded_models: dict[str, dict] = {}
        self._magnitude_model: dict | None = None

    def load_model(self, model_name: str) -> bool:
        """Load a specific model version."""
        path = self.model_dir / model_name
        if not path.exists():
            logger.error("Model not found: %s", path)
            return False

        try:
            with open(path / "model.pkl", "rb") as f:
                model = pickle.load(f)
            with open(path / "scaler.pkl", "rb") as f:
                scaler = pickle.load(f)
            with open(path / "features.json") as f:
                feature_cols = json.load(f)

            calibration = None
            cal_path = path / "calibration.json"
            if cal_path.exists():
                with open(cal_path) as f:
                    calibration = json.load(f)
                logger.info("Loaded calibration map with %d bins", len(calibration))

            self._loaded_models[model_name] = {
                "model": model,
                "scaler": scaler,
                "feature_cols": feature_cols,
                "calibration": calibration,
            }
            logger.info("Loaded model: %s (%d features)", model_name, len(feature_cols))
            return True
        except Exception as e:
            logger.error("Failed to load model %s: %s", model_name, e)
            return False

    def load_latest(self) -> str | None:
        """Load the most recent model (classifier). Also loads magnitude model if available."""
        if not self.model_dir.exists():
            return None
        model_dirs = sorted(self.model_dir.iterdir(), key=lambda p: p.name, reverse=True)
        loaded = None
        for d in model_dirs:
            if not (d / "model.pkl").exists():
                continue
            if "_mag_" in d.name and self._magnitude_model is None:
                try:
                    with open(d / "model.pkl", "rb") as f:
                        model = pickle.load(f)
                    with open(d / "scaler.pkl", "rb") as f:
                        scaler = pickle.load(f)
                    with open(d / "features.json") as f:
                        feature_cols = json.load(f)
                    self._magnitude_model = {"model": model, "scaler": scaler, "feature_cols": feature_cols}
                    logger.info("Loaded magnitude model: %s", d.name)
                except Exception:
                    pass
            elif loaded is None:
                if self.load_model(d.name):
                    loaded = d.name
        return loaded

    def predict_for_source(self, source_id: int, model_name: str | None = None, force: bool = False) -> dict[str, Any]:
        """Generate prediction for an audio source.

        If features don't exist yet, they'll be extracted first.
        Skips if a prediction already exists for this source+model (unless force=True).
        """
        if model_name is None:
            if not self._loaded_models:
                model_name = self.load_latest()
            else:
                model_name = list(self._loaded_models.keys())[0]

        if not model_name or model_name not in self._loaded_models:
            raise ValueError(f"No model loaded. Available: {list(self._loaded_models.keys())}")

        if not force:
            existing = self.storage.get_predictions(source_id=source_id)
            for p in existing:
                if p.get("model_version") == model_name:
                    return p

        # Extract features if needed
        features = self.storage.get_features(source_id)
        if not features:
            features = self.feature_pipeline.extract_for_source(source_id)
            if not features:
                raise ValueError(f"Cannot extract features for source {source_id}")

        m = self._loaded_models[model_name]
        feature_cols = m["feature_cols"]
        scaler = m["scaler"]
        model = m["model"]

        # Build feature vector in correct order
        x = np.array([[features.get(col, 0.0) for col in feature_cols]])
        x_scaled = scaler.transform(x)

        proba = model.predict_proba(x_scaled)[0]
        direction = int(np.argmax(proba))
        raw_confidence = float(proba[direction])
        confidence = self._calibrate(raw_confidence, m.get("calibration"))

        src = self.storage.get_audio_source(source_id)
        ticker = src.get("ticker", "UNKNOWN") if src else "UNKNOWN"
        event_date = src.get("event_date") if src else None

        predicted_return = None
        if self._magnitude_model:
            try:
                mag_cols = self._magnitude_model["feature_cols"]
                x_mag = np.array([[features.get(c, 0.0) for c in mag_cols]])
                x_mag_s = self._magnitude_model["scaler"].transform(x_mag)
                predicted_return = float(self._magnitude_model["model"].predict(x_mag_s)[0])
            except Exception:
                pass

        result = {
            "source_id": source_id,
            "ticker": ticker,
            "prediction_date": event_date or datetime.now().strftime("%Y-%m-%d"),
            "direction": direction,
            "direction_label": "UP" if direction == 1 else "DOWN",
            "confidence": round(confidence, 4),
            "prob_up": round(float(proba[1]), 4),
            "prob_down": round(float(proba[0]), 4),
            "predicted_return_1d": round(predicted_return, 6) if predicted_return is not None else None,
            "model_version": model_name,
            "top_features": self._top_contributing_features(features, feature_cols, model),
        }

        self.storage.insert_prediction(
            source_id=source_id,
            ticker=ticker,
            prediction_date=result["prediction_date"],
            direction=direction,
            confidence=confidence,
            predicted_return_1d=predicted_return,
            model_version=model_name,
            features_json=features,
        )

        return result

    def predict_batch(self, source_ids: list[int], model_name: str | None = None) -> list[dict]:
        """Generate predictions for multiple sources."""
        results = []
        for sid in source_ids:
            try:
                results.append(self.predict_for_source(sid, model_name))
            except Exception as e:
                logger.error("Prediction failed for source %d: %s", sid, e)
                results.append({"source_id": sid, "error": str(e)})
        return results

    def _top_contributing_features(
        self, features: dict, feature_cols: list[str], model, top_n: int = 5
    ) -> list[dict]:
        """Identify top features driving this prediction."""
        importances = model.feature_importances_
        feature_values = [(col, features.get(col, 0.0), float(imp))
                          for col, imp in zip(feature_cols, importances)]
        feature_values.sort(key=lambda x: -x[2])
        return [
            {"feature": name, "value": round(val, 4), "importance": round(imp, 4)}
            for name, val, imp in feature_values[:top_n]
        ]

    @staticmethod
    def _calibrate(raw_confidence: float, calibration: dict | None) -> float:
        """Apply calibration map to raw confidence. Falls back to raw if no map."""
        if not calibration:
            return round(raw_confidence, 4)
        best_key = None
        best_dist = float("inf")
        for key_str in calibration:
            dist = abs(float(key_str) - raw_confidence)
            if dist < best_dist:
                best_dist = dist
                best_key = key_str
        if best_key is not None:
            return round(float(calibration[best_key]), 4)
        return round(raw_confidence, 4)
