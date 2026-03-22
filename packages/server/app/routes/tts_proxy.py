"""TTS WebSocket proxy — forwards browser WS to Rime with auth headers.

Keeps the client connection alive and auto-reconnects to Rime upstream
when Rime closes the connection (which happens after each synthesis flush).
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
MAX_RECONNECT_ATTEMPTS = 5
RECONNECT_DELAY = 0.3


@router.websocket("/tts/ws3")
async def tts_proxy(
    ws: WebSocket,
    speaker: str = Query(default="cove"),
    modelId: str = Query(default="mist"),
    audioFormat: str = Query(default="pcm"),
    sampleRate: int = Query(default=22050),
    segment: str = Query(default="never"),
):
    """Proxy WebSocket to Rime /ws3 with server-side auth and upstream auto-reconnect."""
    api_key = settings.rime_api_key
    if not api_key:
        await ws.close(code=4001, reason="RIME_API_KEY not configured on server")
        return

    await ws.accept()

    params = f"speaker={speaker}&modelId={modelId}&audioFormat={audioFormat}&sampleRate={sampleRate}&segment={segment}"
    rime_url = f"{RIME_WS_BASE}/ws3?{params}"
    headers = {"Authorization": f"Bearer {api_key}"}

    # Shared state between tasks
    upstream: Optional[websockets.WebSocketClientProtocol] = None
    upstream_lock = asyncio.Lock()
    client_alive = True

    async def connect_upstream() -> Optional[websockets.WebSocketClientProtocol]:
        """Connect (or reconnect) to Rime upstream."""
        for attempt in range(MAX_RECONNECT_ATTEMPTS):
            try:
                conn = await websockets.connect(
                    rime_url,
                    additional_headers=headers,
                    ping_interval=20,
                    ping_timeout=10,
                )
                return conn
            except Exception as e:
                logger.warning("Rime connect attempt %d failed: %s", attempt + 1, e)
                if attempt < MAX_RECONNECT_ATTEMPTS - 1:
                    await asyncio.sleep(RECONNECT_DELAY * (attempt + 1))
        return None

    async def ensure_upstream() -> Optional[websockets.WebSocketClientProtocol]:
        """Get a live upstream connection, reconnecting if needed."""
        nonlocal upstream
        async with upstream_lock:
            if upstream is not None:
                # Cross-version check: try .open (v10/v11), fall back to checking .close_code (v12+)
                is_alive = getattr(upstream, "open", None)
                if is_alive is None:
                    # v12+: connection is alive if close_code is not set
                    is_alive = getattr(upstream, "close_code", "NOT_FOUND") is None
                if is_alive:
                    return upstream
                # Connection is dead
                try:
                    await upstream.close()
                except Exception:
                    pass
                upstream = None
            upstream = await connect_upstream()
            return upstream

    async def forward_to_rime():
        """Read from client, forward to Rime. Reconnect upstream as needed."""
        nonlocal client_alive
        try:
            while client_alive:
                try:
                    data = await ws.receive_text()
                except WebSocketDisconnect:
                    client_alive = False
                    return

                conn = await ensure_upstream()
                if not conn:
                    logger.error("Cannot reach Rime upstream after retries")
                    client_alive = False
                    return

                try:
                    await conn.send(data)
                except websockets.exceptions.ConnectionClosed:
                    # Upstream died mid-send — reconnect and retry once
                    conn = await ensure_upstream()
                    if conn:
                        try:
                            await conn.send(data)
                        except Exception:
                            pass
        except Exception:
            client_alive = False

    async def forward_from_rime():
        """Read from Rime, forward to client. Restart when upstream closes."""
        nonlocal upstream, client_alive
        while client_alive:
            conn = await ensure_upstream()
            if not conn:
                await asyncio.sleep(0.5)
                continue
            try:
                async for msg in conn:
                    if not client_alive:
                        return
                    try:
                        if isinstance(msg, str):
                            await ws.send_text(msg)
                        else:
                            await ws.send_bytes(msg)
                    except Exception:
                        client_alive = False
                        return
            except websockets.exceptions.ConnectionClosed:
                # Upstream closed (normal after flush) — loop will reconnect
                async with upstream_lock:
                    upstream = None
            except Exception:
                async with upstream_lock:
                    upstream = None

    try:
        upstream = await connect_upstream()
        if not upstream:
            await ws.close(code=4002, reason="Cannot connect to Rime")
            return

        await asyncio.gather(
            forward_to_rime(),
            forward_from_rime(),
        )
    except Exception as e:
        logger.error("TTS proxy error: %s", e)
    finally:
        client_alive = False
        if upstream:
            try:
                await upstream.close()
            except Exception:
                pass
        try:
            await ws.close()
        except Exception:
            pass
