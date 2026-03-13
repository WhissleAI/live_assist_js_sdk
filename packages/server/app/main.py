"""Live Assist SDK Server — lightweight FastAPI app."""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routes.live_assist import router as live_assist_router

logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO))

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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "live-assist-sdk"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
