"""Live Assist API routes — trimmed for SDK distribution."""

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse

from ..models import ProcessStreamRequest, SessionStartRequest, SessionEndRequest
from ..live_assist_graph import LiveAssistWorkflow, LiveAssistContext
from ..vector_memory import get_vector_memory
from ..agents import get_agent_registry
from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/live-assist")

workflow = LiveAssistWorkflow()


@router.get("/agents")
async def list_agents():
    """List available smart agents."""
    registry = get_agent_registry()
    agents = registry.list_agents()
    return {
        "agents": [
            {"id": a.id, "name": a.name, "description": a.description, "mode": a.mode}
            for a in agents
        ]
    }


@router.post("/process/stream")
async def process_stream(req: ProcessStreamRequest, request: Request):
    """SSE streaming feedback for live conversation."""
    if not req.transcript or len(req.transcript.strip()) < 10:
        return JSONResponse({"error": "Transcript too short"}, status_code=400)

    agenda_items = None
    if req.agenda_items:
        agenda_items = [{"id": a.id, "title": a.title, "status": a.status, "confidence": a.confidence} for a in req.agenda_items]

    # Resolve agent: agent_id overrides custom_prompt and mode unless user provides custom_prompt
    custom_prompt = req.custom_prompt
    mode = req.mode
    if req.agent_id:
        registry = get_agent_registry()
        agent = registry.get(req.agent_id)
        if agent:
            if not custom_prompt:
                custom_prompt = agent.system_prompt
            mode = agent.mode

    intent_signals = req.intent_signals

    context = LiveAssistContext(
        user_id=req.user_id,
        mode=mode,
        context_filters=req.context_filters,
        user_personality=req.user_personality or None,
        user_timezone=req.user_timezone,
        documents_payload=[d for d in req.documents_payload] if req.documents_payload else [],
        custom_prompt=custom_prompt,
        emotion_profile=req.emotion_profile,
        intent_signals=intent_signals,
        voice_profile_summary=req.voice_profile_summary or None,
        entities=[e for e in req.entities] if req.entities else [],
        agenda_items=agenda_items,
    )

    async def event_stream():
        try:
            async for chunk in workflow.process_streaming(
                transcript=req.transcript,
                context=context,
                gemini_api_key=settings.gemini_api_key or None,
            ):
                yield chunk
        except Exception as e:
            logger.error("Process stream error: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'data': {'message': 'Processing failed'}})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'data': {'success': False}})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


@router.post("/session/start")
async def session_start(req: SessionStartRequest):
    """Create a new session."""
    session_id = str(uuid.uuid4())
    vm = get_vector_memory()
    vm.create_session(session_id, req.device_id or "sdk", req.title, req.mode)
    return {"session_id": session_id, "status": "active"}


@router.post("/session/end")
async def session_end(req: SessionEndRequest):
    """End a session. Stores feedback in DB and writes report to fixed location."""
    vm = get_vector_memory()
    vm.end_session(req.session_id, req.feedback_snapshot)
    sessions_dir = getattr(settings, "sessions_dir", "./data/sessions")
    if sessions_dir:
        try:
            import os
            os.makedirs(sessions_dir, exist_ok=True)
            path = os.path.join(sessions_dir, f"{req.session_id}.json")
            with open(path, "w") as f:
                json.dump(
                    {"session_id": req.session_id, "feedback_snapshot": req.feedback_snapshot},
                    f,
                    indent=2,
                )
        except Exception as e:
            logger.warning("Failed to write session file: %s", e)
    return {"session_id": req.session_id, "status": "completed"}


@router.get("/sessions")
async def list_sessions(device_id: Optional[str] = None, limit: int = 20):
    """List sessions."""
    vm = get_vector_memory()
    sessions = vm.list_sessions(device_id, limit)
    return {"sessions": sessions}
