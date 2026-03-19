"""TTS WebSocket proxy — forwards browser WS to Rime with auth headers.

Browsers cannot set custom headers on WebSocket connections, so Rime's
Authorization header requirement prevents direct browser-to-Rime connections.
This proxy adds the Authorization header during the upstream handshake.
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
import websockets

from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

RIME_WS_BASE = "wss://users-ws.rime.ai"


@router.websocket("/tts/ws3")
async def tts_proxy(
    ws: WebSocket,
    speaker: str = Query(default="cove"),
    modelId: str = Query(default="mist"),
    audioFormat: str = Query(default="pcm"),
    sampleRate: int = Query(default=22050),
    segment: str = Query(default="never"),
):
    """Proxy WebSocket to Rime /ws3 with server-side auth."""
    api_key = settings.rime_api_key
    if not api_key:
        await ws.close(code=4001, reason="RIME_API_KEY not configured on server")
        return

    await ws.accept()

    params = f"speaker={speaker}&modelId={modelId}&audioFormat={audioFormat}&sampleRate={sampleRate}&segment={segment}"
    rime_url = f"{RIME_WS_BASE}/ws3?{params}"
    headers = {"Authorization": f"Bearer {api_key}"}

    upstream: Optional[websockets.WebSocketClientProtocol] = None
    try:
        upstream = await websockets.connect(rime_url, additional_headers=headers)

        async def forward_to_rime():
            try:
                while True:
                    data = await ws.receive_text()
                    await upstream.send(data)
            except WebSocketDisconnect:
                pass
            except Exception:
                pass

        async def forward_from_rime():
            try:
                async for msg in upstream:
                    if isinstance(msg, str):
                        await ws.send_text(msg)
                    else:
                        await ws.send_bytes(msg)
            except websockets.exceptions.ConnectionClosed:
                pass
            except Exception:
                pass

        done, pending = await asyncio.wait(
            [
                asyncio.create_task(forward_to_rime()),
                asyncio.create_task(forward_from_rime()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()

    except websockets.exceptions.InvalidStatusCode as e:
        logger.error("Rime upstream connection rejected: %s", e)
        try:
            await ws.close(code=4002, reason=f"Rime rejected connection: {e.status_code}")
        except Exception:
            pass
    except Exception as e:
        logger.error("TTS proxy error: %s", e)
        try:
            await ws.close(code=4003, reason="TTS proxy error")
        except Exception:
            pass
    finally:
        if upstream:
            try:
                await upstream.close()
            except Exception:
                pass
        try:
            await ws.close()
        except Exception:
            pass
