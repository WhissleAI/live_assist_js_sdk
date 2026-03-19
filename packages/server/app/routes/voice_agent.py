"""Voice Agent API routes — conversational chat with streaming."""

import json
import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from ..voice_agent_graph import stream_chat

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice-agent")


class ChatMessageModel(BaseModel):
    role: str
    content: str = ""
    tool_call_id: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None


class ToolFunctionModel(BaseModel):
    name: str
    description: str = ""
    parameters: Dict[str, Any] = Field(default_factory=dict)


class ToolDefinitionModel(BaseModel):
    type: str = "function"
    function: ToolFunctionModel


class VoiceAgentChatRequest(BaseModel):
    messages: List[ChatMessageModel]
    tools: Optional[List[ToolDefinitionModel]] = None
    temperature: float = 0.7
    max_tokens: int = 1024


@router.post("/chat/stream")
async def chat_stream(req: VoiceAgentChatRequest):
    """SSE streaming chat completion for the voice agent."""
    if not req.messages:
        return JSONResponse({"error": "No messages provided"}, status_code=400)

    messages = [m.model_dump(exclude_none=True) for m in req.messages]
    tools = [t.model_dump() for t in req.tools] if req.tools else None

    async def event_stream():
        try:
            async for chunk in stream_chat(
                messages=messages,
                tools=tools,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            ):
                yield chunk
        except Exception as e:
            logger.error("Voice agent chat stream error: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': 'Processing failed'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
