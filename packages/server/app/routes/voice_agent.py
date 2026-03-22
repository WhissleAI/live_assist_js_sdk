"""Voice Agent API routes — conversational chat with streaming."""

import json
import logging
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from ..voice_agent_graph import stream_chat
from ..config import settings

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


MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB
MAX_PDF_SIZE = MAX_UPLOAD_SIZE  # alias for /extract-pdf

ALLOWED_MENU_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
EXTENSION_MIME = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _get_file_mime(filename: str) -> str | None:
    """Return Gemini-compatible MIME type for the file extension, or None."""
    import os
    ext = os.path.splitext(filename)[1].lower()
    return EXTENSION_MIME.get(ext)


MENU_SCHEMA = {
    "type": "object",
    "properties": {
        "restaurant_name": {"type": "string", "nullable": True},
        "categories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string", "nullable": True},
                                "prices": {
                                    "type": "object",
                                    "properties": {
                                        "default": {"type": "number", "nullable": True},
                                        "small": {"type": "number", "nullable": True},
                                        "medium": {"type": "number", "nullable": True},
                                        "large": {"type": "number", "nullable": True},
                                        "extra_large": {"type": "number", "nullable": True},
                                    },
                                },
                            },
                            "required": ["name", "prices"],
                        },
                    },
                },
                "required": ["name", "items"],
            },
        },
    },
    "required": ["categories"],
}


def _get_genai_model(
    json_mode: bool = False,
    max_tokens: int = 8192,
    schema: dict | None = None,
):
    """Return a configured Gemini GenerativeModel or raise."""
    api_key = settings.gemini_api_key
    if not api_key:
        raise ValueError("GEMINI_API_KEY is required")
    from google import generativeai as genai
    genai.configure(api_key=api_key)
    gen_config: dict = {"max_output_tokens": max_tokens}
    if json_mode:
        gen_config["response_mime_type"] = "application/json"
        if schema:
            gen_config["response_schema"] = schema
    return genai.GenerativeModel("gemini-2.0-flash", generation_config=gen_config)


@router.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    """Extract text from a scanned/image PDF using Gemini vision."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return JSONResponse({"error": "Only PDF files are accepted"}, status_code=400)

    contents = await file.read()
    if len(contents) > MAX_PDF_SIZE:
        return JSONResponse({"error": f"PDF too large (max {MAX_PDF_SIZE // (1024*1024)}MB)"}, status_code=413)

    try:
        model = _get_genai_model()
        response = model.generate_content([
            {"mime_type": "application/pdf", "data": contents},
            (
                "Extract ALL text content from this PDF document. "
                "Preserve the structure — headings, sections, item names, prices, descriptions. "
                "Output clean plain text, no markdown formatting. "
                "If it's a menu, list every item with its price."
            ),
        ])
        text = response.text.strip() if response.text else ""
        if not text:
            return JSONResponse({"error": "Could not extract text from PDF"}, status_code=422)
        return JSONResponse({"text": text, "filename": file.filename})
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=503)
    except ImportError:
        return JSONResponse({"error": "google-generativeai package not installed"}, status_code=503)
    except Exception as e:
        logger.error("PDF extraction failed: %s", e)
        return JSONResponse({"error": f"PDF extraction failed: {str(e)}"}, status_code=500)


MENU_STRUCTURE_PROMPT = (
    "Convert this menu text into structured JSON matching the provided schema. "
    "Rules: single price → default field. Multiple sizes → use small/medium/large/extra_large, "
    "set default to null. Prices are numbers (not strings). No price found → null. "
    "Descriptions: very short or null. Preserve exact item names.\n\nMenu text:\n"
)


def _repair_json(raw: str) -> str:
    """Best-effort repair of truncated/malformed JSON."""
    import re
    raw = raw.strip()
    # Remove markdown fences
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
    # Remove trailing comma or partial key-value
    raw = re.sub(r',\s*$', '', raw)
    raw = re.sub(r',?\s*"[^"]*$', '', raw)
    # Close open structures
    opens = raw.count('{') - raw.count('}')
    open_b = raw.count('[') - raw.count(']')
    raw += ']' * max(0, open_b)
    raw += '}' * max(0, opens)
    return raw


def _parse_menu_json(raw: str) -> dict:
    """Parse JSON with repair fallback."""
    import json as _json
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
    try:
        return _json.loads(raw)
    except _json.JSONDecodeError:
        logger.warning("JSON parse failed, attempting repair (len=%d)...", len(raw))
        repaired = _repair_json(raw)
        return _json.loads(repaired)


MENU_IMAGE_PROMPT = (
    "Extract ALL menu items from this restaurant menu image into structured JSON "
    "matching the provided schema. Rules: single price → default field. Multiple sizes → "
    "use small/medium/large/extra_large, set default to null. Prices are numbers. "
    "No price found → null. Descriptions: very short or null. Preserve exact item names."
)


@router.post("/extract-menu")
async def extract_menu(file: UploadFile = File(...)):
    """Extract structured menu from a PDF or image using Gemini vision."""
    import os
    import json as _json

    if not file.filename:
        return JSONResponse({"error": "No filename provided"}, status_code=400)

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_MENU_EXTENSIONS:
        return JSONResponse(
            {"error": f"Unsupported file type. Accepted: {', '.join(sorted(ALLOWED_MENU_EXTENSIONS))}"},
            status_code=400,
        )

    mime = _get_file_mime(file.filename)
    if not mime:
        return JSONResponse({"error": "Could not determine file type"}, status_code=400)

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        return JSONResponse({"error": f"File too large (max {MAX_UPLOAD_SIZE // (1024*1024)}MB)"}, status_code=413)

    is_pdf = ext == ".pdf"

    try:
        if is_pdf:
            # Two-pass for PDFs: OCR text first, then structure
            ocr_model = _get_genai_model(max_tokens=16384)
            ocr_response = ocr_model.generate_content([
                {"mime_type": mime, "data": contents},
                "You are a menu transcription expert. Extract ALL text from EVERY page of this restaurant menu. "
                "For EVERY item, include its name and ALL listed prices (with sizes if applicable). "
                "Organize by category/section as they appear. Plain text, no markdown formatting. "
                "Do NOT skip any items or pages. Be thorough and complete.",
            ])
            menu_text = ocr_response.text.strip() if ocr_response.text else ""
            if not menu_text:
                return JSONResponse({"error": "Could not read text from file"}, status_code=422)

            logger.info("Menu OCR pass done: %d chars", len(menu_text))

            json_model = _get_genai_model(json_mode=True, max_tokens=32768, schema=MENU_SCHEMA)
            prompt = MENU_STRUCTURE_PROMPT + menu_text
        else:
            # Single pass for images: Gemini reads images natively
            json_model = _get_genai_model(json_mode=True, max_tokens=32768, schema=MENU_SCHEMA)
            prompt = [
                {"mime_type": mime, "data": contents},
                MENU_IMAGE_PROMPT,
            ]

        last_error = None
        for attempt in range(2):
            try:
                struct_response = json_model.generate_content(prompt)
                raw = struct_response.text.strip() if struct_response.text else ""
                if not raw:
                    last_error = "Empty response from extraction"
                    logger.warning("Attempt %d: empty response, retrying...", attempt + 1)
                    continue

                menu = _parse_menu_json(raw)
                n_cats = len(menu.get("categories", []))
                n_items = sum(len(c.get("items", [])) for c in menu.get("categories", []))
                logger.info("Menu structured (attempt %d): %d categories, %d items, %d chars JSON",
                            attempt + 1, n_cats, n_items, len(raw))
                return JSONResponse({"menu": menu, "filename": file.filename})

            except _json.JSONDecodeError as e:
                last_error = str(e)
                logger.warning("Attempt %d JSON parse failed: %s", attempt + 1, e)
                continue

        return JSONResponse(
            {"error": f"Could not structure menu after retries: {last_error}"},
            status_code=422,
        )

    except ImportError:
        return JSONResponse({"error": "google-generativeai package not installed"}, status_code=503)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=503)
    except Exception as e:
        logger.error("Menu extraction failed: %s", e)
        return JSONResponse({"error": f"Menu extraction failed: {str(e)}"}, status_code=500)
