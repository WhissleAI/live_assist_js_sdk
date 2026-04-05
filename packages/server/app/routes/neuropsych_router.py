"""Neuropsychological test scoring route for the SDK server."""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..neuropsych_service import stream_neuropsych_scoring

router = APIRouter(prefix="/neuropsych")


@router.post("/score/stream")
async def score_stream(request: Request):
    body = await request.json()

    async def event_stream():
        async for chunk in stream_neuropsych_scoring(body):
            yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })
