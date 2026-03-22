"""ASR WebSocket proxy — forwards browser WS to the local ASR server.

When the UI is served through a single-origin setup (e.g. ngrok tunnel),
the browser cannot reach the ASR server on a different port directly.
This proxy bridges the gap: client connects to /asr/stream on port 8765,
and we proxy everything to the real ASR server on port 8001.
"""

import asyncio
import logging
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
router = APIRouter()

ASR_UPSTREAM = os.getenv("ASR_UPSTREAM_URL", "ws://localhost:8001/asr/stream")


@router.websocket("/asr/stream")
async def asr_proxy(ws: WebSocket):
    """Proxy WebSocket to the local ASR server."""
    import websockets

    await ws.accept()

    upstream = None
    try:
        upstream = await websockets.connect(
            ASR_UPSTREAM,
            ping_interval=20,
            ping_timeout=10,
            max_size=2**20,
        )

        async def client_to_asr():
            try:
                while True:
                    msg = await ws.receive()
                    if msg.get("text") is not None:
                        await upstream.send(msg["text"])
                    elif msg.get("bytes") is not None:
                        await upstream.send(msg["bytes"])
            except WebSocketDisconnect:
                pass
            except Exception:
                pass

        async def asr_to_client():
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
                asyncio.create_task(client_to_asr()),
                asyncio.create_task(asr_to_client()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()

    except Exception as e:
        logger.error("ASR proxy error: %s", e)
        try:
            await ws.close(code=4003, reason="ASR proxy error")
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
