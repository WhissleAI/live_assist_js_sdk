"""SDK server configuration — all settings via environment variables."""

import os
from dataclasses import dataclass


@dataclass
class Settings:
    host: str = "0.0.0.0"
    port: int = 8765
    llm_provider: str = "gemini"  # gemini | anthropic | local
    gemini_api_key: str = ""
    anthropic_api_key: str = ""
    local_llm_url: str = ""
    db_path: str = "./data/live_assist.db"
    sessions_dir: str = "./data/sessions"
    embedding_model: str = "all-MiniLM-L6-v2"
    cors_origins: str = "*"
    log_level: str = "INFO"


def load_settings() -> Settings:
    return Settings(
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8765")),
        llm_provider=os.getenv("LLM_PROVIDER", "gemini"),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        local_llm_url=os.getenv("LOCAL_LLM_URL", ""),
        db_path=os.getenv("DB_PATH", "./data/live_assist.db"),
        sessions_dir=os.getenv("SESSIONS_DIR", "./data/sessions"),
        embedding_model=os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
        cors_origins=os.getenv("CORS_ORIGINS", "*"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )


settings = load_settings()
