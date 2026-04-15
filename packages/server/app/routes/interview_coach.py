"""Interview Coach session logging routes."""

import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/interview-coach")
logger = logging.getLogger(__name__)


@router.post("/log-session")
async def log_session_route(request: Request):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    browser_id = request.headers.get("x-device-id", data.get("browser_id", ""))
    if not browser_id:
        return JSONResponse({"error": "browser_id required"}, status_code=400)

    data["browser_id"] = browser_id

    try:
        from ..interview_coach_db import log_session

        row_id = await log_session(data)
        return JSONResponse({"ok": True, "id": row_id})
    except RuntimeError as e:
        logger.warning("Interview coach DB not configured: %s", e)
        return JSONResponse({"ok": True, "id": 0, "note": "logging disabled"})
    except Exception as e:
        logger.error("Session logging failed: %s", e)
        return JSONResponse({"error": "Logging failed"}, status_code=500)
