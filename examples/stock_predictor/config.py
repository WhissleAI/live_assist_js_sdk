"""Central configuration loaded from environment / .env file."""

from pathlib import Path
from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent


class Settings(BaseSettings):
    # Whissle ASR
    whissle_asr_url: str = "https://api.whissle.ai"
    whissle_auth_token: str = ""
    asr_concurrency: int = 4
    asr_timeout_sec: int = 30

    # Data paths
    data_dir: str = str(PROJECT_ROOT / "store")
    db_path: str = str(PROJECT_ROOT / "store" / "stock_predictor.db")

    # Stock data
    stock_lookback_days: int = 5
    stock_lookahead_days: list[int] = [1, 5, 20]

    # Feature engineering
    pcm_chunk_seconds: int = 10
    sample_rate: int = 16000

    # Model
    model_dir: str = str(PROJECT_ROOT / "store" / "models")
    xgb_n_estimators: int = 300
    xgb_max_depth: int = 6
    xgb_learning_rate: float = 0.05
    walk_forward_min_train: int = 200

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8900

    class Config:
        env_file = str(PROJECT_ROOT / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
