"""
Model training pipeline.

Trains XGBoost models for stock direction prediction using features
derived from Whissle STT metadata. Uses walk-forward cross-validation
to prevent look-ahead bias. Includes automatic feature selection and
metadata impact analysis.
"""

import json
import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, roc_auc_score, classification_report
from sklearn.model_selection import StratifiedKFold
from sklearn.feature_selection import mutual_info_classif
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

from ..config import settings
from ..data.storage import Storage

logger = logging.getLogger(__name__)

_META_COLS = {
    "source_id", "ticker", "event_date", "features_json",
    "return_1d", "return_5d", "return_20d",
    "abnormal_1d", "abnormal_5d", "abnormal_20d",
    "close_price", "high_price", "low_price", "volume",
    "vol_pre", "vol_post",
}

AUDIO_CATEGORIES = {"emotion", "divergence", "demographics", "intent", "cross_call"}
TEXT_CATEGORIES = {"text"}
MARKET_CATEGORIES = {"market_context"}


def _categorize_feature(name: str) -> str:
    lower = name.lower()
    if lower.startswith("cross_"):
        return "cross_call"
    if lower.startswith("mkt_"):
        return "market_context"
    if lower.startswith("intent_"):
        return "intent"
    if any(kw in lower for kw in ("divergence", "deception", "nervous_good", "confident_bad", "vocal_text")):
        return "divergence"
    if any(kw in lower for kw in ("sentiment", "hedging", "confidence_", "financial", "question_density", "lexical", "words_per")):
        return "text"
    if any(kw in lower for kw in ("gender", "age", "speaker")):
        return "demographics"
    if any(kw in lower for kw in ("emotion", "fear", "positive_emotion", "negative_emotion", "dominant_emotion")):
        return "emotion"
    return "other"


class ModelTrainer:
    """Train and evaluate stock prediction models."""

    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()
        self.model_dir = Path(settings.model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)

    def _select_features(
        self, X: np.ndarray, y: np.ndarray, feature_cols: list[str], max_features: int | None = None,
    ) -> tuple[np.ndarray, list[str]]:
        """Select top features using mutual information. Keeps feature count
        proportional to sample size to prevent overfitting."""
        n_samples = len(X)
        if max_features is None:
            max_features = max(8, min(n_samples // 8, 30))

        if len(feature_cols) <= max_features:
            return X, feature_cols

        mi_scores = mutual_info_classif(X, y, random_state=42, n_neighbors=3)
        top_indices = np.argsort(mi_scores)[::-1][:max_features]
        top_indices = np.sort(top_indices)

        selected_cols = [feature_cols[i] for i in top_indices]
        logger.info(
            "Feature selection: %d -> %d features (top MI: %s)",
            len(feature_cols), len(selected_cols),
            ", ".join(selected_cols[:5]),
        )
        return X[:, top_indices], selected_cols

    def train(self, target: str = "return_1d", horizon_label: str = "1d") -> dict[str, Any]:
        """Train an XGBoost model using walk-forward validation.

        Args:
            target: Column name for the target variable
            horizon_label: Label for this horizon (used in model filename)

        Returns:
            Dict with training results and metrics.
        """
        df = self.storage.get_all_features_df()
        if df.empty:
            raise ValueError("No training data available. Run the pipeline first.")

        df = df.sort_values("event_date").reset_index(drop=True)

        df["target_direction"] = (df[target] > 0).astype(int)

        feature_cols = [c for c in df.columns if c not in _META_COLS and c != "target_direction"]
        feature_cols = [c for c in feature_cols if df[c].dtype in (np.float64, np.int64, float, int)]

        valid_cols = [c for c in feature_cols if df[c].notna().sum() > len(df) * 0.5]
        logger.info("Using %d features (dropped %d low-coverage)", len(valid_cols), len(feature_cols) - len(valid_cols))

        X = df[valid_cols].fillna(0).values
        y = df["target_direction"].values
        dates = df["event_date"].values

        X, valid_cols = self._select_features(X, y, valid_cols)

        min_train = settings.walk_forward_min_train
        if len(X) < min_train + 20:
            logger.warning("Only %d samples — using k-fold CV", len(X))
            return self._kfold_train(X, y, valid_cols, df, target, horizon_label)

        return self._walk_forward_train(X, y, dates, valid_cols, df, target, horizon_label)

    def _get_xgb_params(self, n_samples: int) -> dict:
        """Adaptive hyperparameters based on dataset size."""
        if n_samples < 150:
            return {
                "n_estimators": 80,
                "max_depth": 3,
                "learning_rate": 0.08,
                "subsample": 0.85,
                "colsample_bytree": 0.7,
                "reg_alpha": 1.0,
                "reg_lambda": 3.0,
                "min_child_weight": 3,
                "gamma": 0.1,
            }
        if n_samples < 500:
            return {
                "n_estimators": 150,
                "max_depth": 4,
                "learning_rate": 0.06,
                "subsample": 0.8,
                "colsample_bytree": 0.8,
                "reg_alpha": 0.5,
                "reg_lambda": 2.0,
                "min_child_weight": 2,
                "gamma": 0.05,
            }
        return {
            "n_estimators": settings.xgb_n_estimators,
            "max_depth": settings.xgb_max_depth,
            "learning_rate": settings.xgb_learning_rate,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "reg_alpha": 0.1,
            "reg_lambda": 1.0,
            "min_child_weight": 1,
            "gamma": 0.0,
        }

    def _fit_model(
        self, X_train: np.ndarray, y_train: np.ndarray,
        X_val: np.ndarray | None = None, y_val: np.ndarray | None = None,
        params: dict | None = None,
    ) -> xgb.XGBClassifier:
        """Fit an XGBClassifier with optional early stopping."""
        p = params or self._get_xgb_params(len(X_train))
        n_pos = int(y_train.sum())
        n_neg = len(y_train) - n_pos
        scale_pos_weight = n_neg / max(n_pos, 1) if abs(n_pos - n_neg) > len(y_train) * 0.1 else 1.0

        early_stopping = 0
        if X_val is not None and y_val is not None and len(X_val) >= 5:
            early_stopping = 15

        model = xgb.XGBClassifier(
            **p,
            scale_pos_weight=scale_pos_weight,
            early_stopping_rounds=early_stopping if early_stopping > 0 else None,
            eval_metric="logloss",
            random_state=42,
            verbosity=0,
        )

        fit_kwargs: dict = {}
        if early_stopping > 0:
            fit_kwargs["eval_set"] = [(X_val, y_val)]

        model.fit(X_train, y_train, **fit_kwargs)
        return model

    def _walk_forward_train(
        self, X: np.ndarray, y: np.ndarray, dates: np.ndarray,
        feature_cols: list[str], df: pd.DataFrame,
        target: str, horizon_label: str,
    ) -> dict[str, Any]:
        """Walk-forward (expanding window) cross-validation."""
        min_train = settings.walk_forward_min_train
        step_size = max(1, (len(X) - min_train) // 10)
        params = self._get_xgb_params(len(X))

        all_preds, all_true, all_proba = [], [], []

        for split_idx in range(min_train, len(X), step_size):
            X_train, y_train = X[:split_idx], y[:split_idx]
            test_end = min(split_idx + step_size, len(X))
            X_test, y_test = X[split_idx:test_end], y[split_idx:test_end]
            if len(X_test) == 0:
                break

            scaler = StandardScaler()
            X_train_s = scaler.fit_transform(X_train)
            X_test_s = scaler.transform(X_test)

            model = self._fit_model(X_train_s, y_train, X_test_s, y_test, params)

            preds = model.predict(X_test_s)
            proba = model.predict_proba(X_test_s)[:, 1]
            all_preds.extend(preds.tolist())
            all_true.extend(y_test.tolist())
            all_proba.extend(proba.tolist())

        all_preds_arr = np.array(all_preds)
        all_true_arr = np.array(all_true)
        all_proba_arr = np.array(all_proba)

        accuracy = accuracy_score(all_true_arr, all_preds_arr)
        try:
            auc = roc_auc_score(all_true_arr, all_proba_arr)
        except ValueError:
            auc = 0.5

        returns = df[target].values[min_train:min_train + len(all_preds)]
        if len(returns) == len(all_preds):
            strategy_returns = np.where(all_preds_arr == 1, returns, -returns)
            sharpe = self._annualized_sharpe(strategy_returns)
        else:
            sharpe = 0.0

        logger.info("Walk-forward: acc=%.3f AUC=%.3f Sharpe=%.2f (%d test)", accuracy, auc, sharpe, len(all_preds))

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        final_model = self._fit_model(X_scaled, y, params=params)

        importance = dict(zip(feature_cols, final_model.feature_importances_.tolist()))
        importance = dict(sorted(importance.items(), key=lambda x: -x[1])[:30])
        calibration_map = self._build_calibration_map(all_proba_arr, all_true_arr)

        version = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_name = f"xgb_{horizon_label}_{version}"
        self._save_model(final_model, scaler, feature_cols, model_name, calibration_map)

        metadata_impact = self._compute_metadata_impact(X, y, feature_cols, params)

        result = {
            "model_version": model_name,
            "train_samples": len(X),
            "test_samples": len(all_preds),
            "accuracy": round(accuracy, 4),
            "auc_roc": round(auc, 4),
            "sharpe_ratio": round(sharpe, 4),
            "feature_importance": importance,
            "metadata_impact": metadata_impact,
            "classification_report": classification_report(all_true_arr, all_preds_arr, output_dict=True),
        }

        self.storage.insert_model_run(
            run_date=datetime.now().isoformat(),
            model_version=model_name,
            train_samples=len(X),
            test_samples=len(all_preds),
            accuracy=accuracy,
            auc_roc=auc,
            sharpe_ratio=sharpe,
            feature_importance_json=importance,
            params_json={
                "target": target,
                "horizon": horizon_label,
                "mode": "walk_forward",
                "n_features": len(feature_cols),
                "metadata_impact": metadata_impact,
                **params,
            },
        )
        return result

    def _kfold_train(
        self, X: np.ndarray, y: np.ndarray,
        feature_cols: list[str], df: pd.DataFrame,
        target: str, horizon_label: str,
    ) -> dict[str, Any]:
        """Stratified k-fold CV for small datasets — uses all data for both
        training and evaluation without wasting 20% on a single test fold."""
        n_folds = min(5, max(3, len(X) // 20))
        skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
        params = self._get_xgb_params(len(X))

        all_preds = np.zeros(len(X), dtype=int)
        all_proba = np.zeros(len(X))
        fold_accuracies = []

        for fold, (train_idx, test_idx) in enumerate(skf.split(X, y)):
            X_train, X_test = X[train_idx], X[test_idx]
            y_train, y_test = y[train_idx], y[test_idx]

            scaler = StandardScaler()
            X_train_s = scaler.fit_transform(X_train)
            X_test_s = scaler.transform(X_test)

            model = self._fit_model(X_train_s, y_train, X_test_s, y_test, params)

            preds = model.predict(X_test_s)
            proba = model.predict_proba(X_test_s)[:, 1]

            all_preds[test_idx] = preds
            all_proba[test_idx] = proba
            fold_acc = accuracy_score(y_test, preds)
            fold_accuracies.append(fold_acc)
            logger.info("  Fold %d: acc=%.3f (%d train / %d test)", fold + 1, fold_acc, len(train_idx), len(test_idx))

        accuracy = accuracy_score(y, all_preds)
        try:
            auc = roc_auc_score(y, all_proba)
        except ValueError:
            auc = 0.5

        returns = df[target].values
        if len(returns) == len(all_preds):
            strategy_returns = np.where(all_preds == 1, returns, -returns)
            sharpe = self._annualized_sharpe(strategy_returns)
        else:
            sharpe = 0.0

        logger.info(
            "K-fold CV (%d folds): acc=%.3f±%.3f AUC=%.3f Sharpe=%.2f",
            n_folds, accuracy, np.std(fold_accuracies), auc, sharpe,
        )

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        final_model = self._fit_model(X_scaled, y, params=params)

        importance = dict(zip(feature_cols, final_model.feature_importances_.tolist()))
        importance = dict(sorted(importance.items(), key=lambda x: -x[1])[:30])

        calibration_map = self._build_calibration_map(all_proba, y)

        version = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_name = f"xgb_{horizon_label}_{version}"
        self._save_model(final_model, scaler, feature_cols, model_name, calibration_map)

        metadata_impact = self._compute_metadata_impact(X, y, feature_cols, params)

        result = {
            "model_version": model_name,
            "train_samples": len(X),
            "test_samples": len(X),
            "accuracy": round(accuracy, 4),
            "auc_roc": round(auc, 4),
            "sharpe_ratio": round(sharpe, 4),
            "feature_importance": importance,
            "metadata_impact": metadata_impact,
            "fold_accuracies": [round(a, 4) for a in fold_accuracies],
            "classification_report": classification_report(y, all_preds, output_dict=True),
        }

        self.storage.insert_model_run(
            run_date=datetime.now().isoformat(),
            model_version=model_name,
            train_samples=len(X),
            test_samples=len(X),
            accuracy=accuracy,
            auc_roc=auc,
            sharpe_ratio=sharpe,
            feature_importance_json=importance,
            params_json={
                "target": target,
                "horizon": horizon_label,
                "mode": f"kfold_{n_folds}",
                "n_features": len(feature_cols),
                "fold_accuracies": [round(a, 4) for a in fold_accuracies],
                "metadata_impact": metadata_impact,
                **params,
            },
        )
        return result

    def _compute_metadata_impact(
        self, X: np.ndarray, y: np.ndarray,
        feature_cols: list[str], params: dict,
    ) -> dict[str, Any]:
        """Run ablation: compare full model vs audio-only vs text-only vs market-only.

        Returns accuracy for each subset to quantify the Whissle metadata advantage.
        """
        n_folds = min(5, max(3, len(X) // 20))
        skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)

        categories = {col: _categorize_feature(col) for col in feature_cols}

        subsets: dict[str, list[int]] = {
            "all": list(range(len(feature_cols))),
            "audio_metadata": [i for i, c in enumerate(feature_cols) if categories[c] in AUDIO_CATEGORIES],
            "text_only": [i for i, c in enumerate(feature_cols) if categories[c] in TEXT_CATEGORIES],
            "no_audio": [i for i, c in enumerate(feature_cols) if categories[c] not in AUDIO_CATEGORIES],
        }

        results: dict[str, Any] = {}
        category_counts: dict[str, int] = {}
        for cat in set(categories.values()):
            category_counts[cat] = sum(1 for c in categories.values() if c == cat)
        results["category_counts"] = category_counts

        for subset_name, indices in subsets.items():
            if len(indices) < 2:
                results[subset_name] = {"accuracy": 0.5, "n_features": len(indices)}
                continue

            X_sub = X[:, indices]
            fold_accs = []
            for train_idx, test_idx in skf.split(X_sub, y):
                scaler = StandardScaler()
                X_tr = scaler.fit_transform(X_sub[train_idx])
                X_te = scaler.transform(X_sub[test_idx])
                model = self._fit_model(X_tr, y[train_idx], params=params)
                preds = model.predict(X_te)
                fold_accs.append(accuracy_score(y[test_idx], preds))

            results[subset_name] = {
                "accuracy": round(float(np.mean(fold_accs)), 4),
                "n_features": len(indices),
            }

        audio_acc = results.get("audio_metadata", {}).get("accuracy", 0.5)
        no_audio_acc = results.get("no_audio", {}).get("accuracy", 0.5)
        results["audio_lift"] = round(audio_acc - no_audio_acc, 4)

        logger.info(
            "Metadata impact: all=%.3f audio=%.3f text=%.3f no_audio=%.3f lift=%+.3f",
            results.get("all", {}).get("accuracy", 0),
            audio_acc, results.get("text_only", {}).get("accuracy", 0),
            no_audio_acc, results["audio_lift"],
        )
        return results

    def train_all_horizons(self) -> dict[str, Any]:
        """Train models for all prediction horizons."""
        results = {}
        for horizon in settings.stock_lookahead_days:
            label = f"{horizon}d"
            logger.info("Training model for %s horizon...", label)
            try:
                results[label] = self.train(target=f"return_{label}", horizon_label=label)
            except Exception as e:
                logger.error("Training failed for %s: %s", label, e)
                results[label] = {"error": str(e)}
        return results

    def train_magnitude_model(self, target: str = "return_1d", horizon_label: str = "1d_mag") -> dict[str, Any]:
        """Train an XGBRegressor to predict return magnitude (continuous)."""
        from sklearn.metrics import mean_absolute_error, r2_score

        df = self.storage.get_all_features_df()
        if df.empty:
            raise ValueError("No training data available.")

        df = df.sort_values("event_date").reset_index(drop=True)
        df["target_return"] = df[target].fillna(0)

        feature_cols = [c for c in df.columns if c not in _META_COLS and c != "target_return"]
        feature_cols = [c for c in feature_cols if df[c].dtype in (np.float64, np.int64, float, int)]
        valid_cols = [c for c in feature_cols if df[c].notna().sum() > len(df) * 0.5]

        X = df[valid_cols].fillna(0).values
        y = df["target_return"].values

        split = int(len(X) * 0.8)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]

        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        X_test_s = scaler.transform(X_test)

        p = self._get_xgb_params(len(X))
        model = xgb.XGBRegressor(
            n_estimators=p["n_estimators"],
            max_depth=p["max_depth"],
            learning_rate=p["learning_rate"],
            subsample=p["subsample"],
            colsample_bytree=p["colsample_bytree"],
            reg_alpha=p["reg_alpha"],
            reg_lambda=p["reg_lambda"],
            random_state=42,
            verbosity=0,
        )
        model.fit(X_train_s, y_train)

        preds = model.predict(X_test_s)
        mae = mean_absolute_error(y_test, preds)
        r2 = r2_score(y_test, preds)

        logger.info("Magnitude model: MAE=%.4f, R²=%.4f", mae, r2)

        X_full_s = scaler.fit_transform(X)
        model.fit(X_full_s, y)

        version = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_name = f"xgb_{horizon_label}_{version}"
        self._save_model(model, scaler, valid_cols, model_name)

        return {
            "model_version": model_name,
            "type": "magnitude_regressor",
            "train_samples": len(X),
            "test_samples": len(X_test),
            "mae": round(mae, 6),
            "r2": round(r2, 4),
        }

    def _build_calibration_map(
        self, probabilities: np.ndarray, actuals: np.ndarray, n_bins: int = 10,
    ) -> dict:
        """Bin predicted probabilities and compute actual win rate per bin.

        Returns a dict mapping bin midpoint strings to actual win rates.
        E.g. {"0.525": 0.51, "0.575": 0.54, ..., "0.975": 0.93}
        """
        bins = np.linspace(0.5, 1.0, n_bins + 1)
        cal_map: dict[str, float] = {}
        for i in range(n_bins):
            lo, hi = bins[i], bins[i + 1]
            mask = (probabilities >= lo) & (probabilities < hi)
            if mask.sum() > 0:
                actual_rate = float(actuals[mask].mean())
                midpoint = round((lo + hi) / 2, 3)
                cal_map[str(midpoint)] = round(actual_rate, 4)
        logger.info("Calibration map (%d bins): %s", len(cal_map), cal_map)
        return cal_map

    def _save_model(self, model, scaler, feature_cols: list[str], model_name: str,
                    calibration_map: dict | None = None):
        """Save model, scaler, feature column list, and optional calibration map."""
        path = self.model_dir / model_name
        path.mkdir(parents=True, exist_ok=True)

        with open(path / "model.pkl", "wb") as f:
            pickle.dump(model, f)
        with open(path / "scaler.pkl", "wb") as f:
            pickle.dump(scaler, f)
        with open(path / "features.json", "w") as f:
            json.dump(feature_cols, f)
        if calibration_map:
            with open(path / "calibration.json", "w") as f:
                json.dump(calibration_map, f)

        logger.info("Model saved: %s", path)

    @staticmethod
    def _annualized_sharpe(daily_returns: np.ndarray, trading_days: int = 252) -> float:
        if len(daily_returns) < 2:
            return 0.0
        mean = np.mean(daily_returns)
        std = np.std(daily_returns)
        if std == 0:
            return 0.0
        return float(mean / std * np.sqrt(trading_days))
