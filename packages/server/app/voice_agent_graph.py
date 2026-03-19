"""
LangGraph-based conversational agent for the Voice Agent example.

Accepts a multi-turn messages array and optional tool definitions.
Streams SSE events: text_chunk, tool_call, done.
Tool execution is client-side — the server only invokes the LLM.
"""

import json
import logging
import uuid
from typing import List, Dict, Any, Optional, AsyncGenerator

from langchain_core.messages import (
    BaseMessage,
    SystemMessage,
    HumanMessage,
    AIMessage,
    AIMessageChunk,
    ToolMessage,
)

from .chat_models import get_chat_model

logger = logging.getLogger(__name__)


def _convert_messages(raw: List[Dict[str, Any]]) -> List[BaseMessage]:
    """Convert frontend message dicts to LangChain message objects."""
    out: List[BaseMessage] = []
    for m in raw:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            out.append(SystemMessage(content=content))
        elif role == "user":
            out.append(HumanMessage(content=content))
        elif role == "assistant":
            tool_calls = m.get("tool_calls")
            if tool_calls:
                lc_tool_calls = []
                for tc in tool_calls:
                    lc_tool_calls.append({
                        "id": tc.get("id", str(uuid.uuid4())),
                        "name": tc.get("name", ""),
                        "args": tc.get("arguments", {}),
                    })
                out.append(AIMessage(content=content, tool_calls=lc_tool_calls))
            else:
                out.append(AIMessage(content=content))
        elif role == "tool":
            tool_call_id = m.get("tool_call_id", "")
            out.append(ToolMessage(content=content, tool_call_id=tool_call_id))
    return out


def _convert_tools(raw: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
    """Normalise OpenAI-format tool defs for LangChain bind_tools."""
    if not raw:
        return None
    tools = []
    for t in raw:
        fn = t.get("function", {})
        tools.append({
            "type": "function",
            "function": {
                "name": fn.get("name", ""),
                "description": fn.get("description", ""),
                "parameters": fn.get("parameters", {}),
            },
        })
    return tools


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def stream_chat(
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> AsyncGenerator[str, None]:
    """Run the voice-agent LLM call and yield SSE event strings."""

    lc_messages = _convert_messages(messages)
    lc_tools = _convert_tools(tools)

    model = get_chat_model(temperature=temperature, max_tokens=max_tokens)

    if lc_tools:
        model = model.bind_tools(lc_tools)

    collected_tool_calls: List[Dict[str, Any]] = []
    tool_call_chunks: Dict[int, Dict[str, Any]] = {}

    try:
        async for chunk in model.astream(lc_messages):
            if not isinstance(chunk, AIMessageChunk):
                continue

            # Stream text content
            if chunk.content:
                text = chunk.content if isinstance(chunk.content, str) else str(chunk.content)
                if text:
                    yield _sse({"type": "text_chunk", "content": text})

            # Accumulate tool call chunks
            if hasattr(chunk, "tool_call_chunks") and chunk.tool_call_chunks:
                for tc_chunk in chunk.tool_call_chunks:
                    idx = tc_chunk.get("index", 0)
                    if idx not in tool_call_chunks:
                        tool_call_chunks[idx] = {
                            "id": tc_chunk.get("id", ""),
                            "name": tc_chunk.get("name", ""),
                            "args": "",
                        }
                    entry = tool_call_chunks[idx]
                    if tc_chunk.get("id"):
                        entry["id"] = tc_chunk["id"]
                    if tc_chunk.get("name"):
                        entry["name"] = tc_chunk["name"]
                    if tc_chunk.get("args"):
                        entry["args"] += tc_chunk["args"]

            # Complete tool calls from the full message
            if hasattr(chunk, "tool_calls") and chunk.tool_calls:
                for tc in chunk.tool_calls:
                    collected_tool_calls.append({
                        "id": tc.get("id", str(uuid.uuid4())),
                        "name": tc.get("name", ""),
                        "arguments": tc.get("args", {}),
                    })

    except Exception as e:
        logger.error("Voice agent LLM error: %s", e)
        yield _sse({"type": "error", "message": str(e)})
        yield _sse({"type": "done"})
        return

    # Emit any accumulated tool call chunks that weren't in collected_tool_calls
    if tool_call_chunks and not collected_tool_calls:
        for _idx, entry in sorted(tool_call_chunks.items()):
            tc_id = entry["id"] or f"call_{uuid.uuid4().hex[:8]}"
            try:
                args = json.loads(entry["args"]) if entry["args"] else {}
            except json.JSONDecodeError:
                args = {}
            yield _sse({
                "type": "tool_call",
                "id": tc_id,
                "name": entry["name"],
                "arguments": args,
            })

    # Emit fully-formed tool calls
    for tc in collected_tool_calls:
        yield _sse({
            "type": "tool_call",
            "id": tc["id"],
            "name": tc["name"],
            "arguments": tc["arguments"],
        })

    yield _sse({"type": "done"})
