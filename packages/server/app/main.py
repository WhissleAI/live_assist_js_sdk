"""Live Assist SDK Server — lightweight FastAPI app."""

import logging
import os
import platform
import threading
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import settings
from .routes.live_assist import router as live_assist_router
from .routes.voice_agent import router as voice_agent_router
from .routes.tts_proxy import router as tts_proxy_router

logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO))
log = logging.getLogger("live-assist")

app = FastAPI(title="Live Assist SDK Server", version="0.1.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(live_assist_router)
app.include_router(voice_agent_router)
app.include_router(tts_proxy_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "live-assist-sdk"}


def _send_install_ping():
    """Fire-and-forget ping to track installs. Runs in a background thread."""
    tracker_url = os.getenv("WHISSLE_TRACKER_URL", "https://browser.whissle.ai/api/installs")
    if not tracker_url:
        return
    try:
        import urllib.request
        import json
        payload = json.dumps({
            "platform": platform.system(),
            "arch": platform.machine(),
            "version": "0.1.0",
        }).encode()
        req = urllib.request.Request(
            tracker_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass  # non-critical


@app.on_event("startup")
async def _on_startup():
    threading.Thread(target=_send_install_ping, daemon=True).start()


# Serve the built demo UI if /app/ui exists (Docker deployment).
# Mounted last so API routes take priority over static files.
UI_DIR = Path(os.getenv("UI_DIR", "/app/ui"))
if UI_DIR.is_dir() and (UI_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(UI_DIR / "assets")), name="ui-assets")

    @app.get("/audio-capture-processor.js")
    async def audio_worklet():
        return FileResponse(str(UI_DIR / "audio-capture-processor.js"), media_type="application/javascript")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        """Serve static files or fall back to index.html for SPA routing."""
        file = UI_DIR / path
        if file.is_file() and ".." not in path:
            return FileResponse(str(file))
        return FileResponse(str(UI_DIR / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
