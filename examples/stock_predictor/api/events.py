"""
Server-Sent Events (SSE) event bus.

Lets the pipeline publish progress events that the frontend
subscribes to via GET /api/events.
"""

import asyncio
import json
import logging
import threading
from datetime import datetime
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


class EventBus:
    """
    Thread-safe event bus for SSE streaming.

    The scheduler runs in a background *thread*, but SSE subscribers
    live in the asyncio event loop. We bridge the gap with
    `loop.call_soon_threadsafe` so queue writes always happen on
    the correct thread.
    """

    def __init__(self, max_history: int = 200):
        self._subscribers: list[asyncio.Queue] = []
        self._history: list[dict] = []
        self._max_history = max_history
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def _build_event(self, event_type: str, message: str, details: dict | None = None) -> dict:
        return {
            "type": event_type,
            "message": message,
            "details": details or {},
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    def _push_to_subscribers(self, event: dict):
        """Must be called from the event loop thread."""
        for q in self._subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def publish(self, event_type: str, message: str, details: dict | None = None):
        """Publish from async code (already on the event loop)."""
        event = self._build_event(event_type, message, details)
        with self._lock:
            self._history.append(event)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]
        self._push_to_subscribers(event)

    def publish_sync(self, event_type: str, message: str, details: dict | None = None):
        """
        Publish from sync code running in a background thread.
        Uses call_soon_threadsafe to schedule queue writes on the event loop.
        """
        event = self._build_event(event_type, message, details)
        with self._lock:
            self._history.append(event)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]

        loop = self._loop
        if loop is not None and loop.is_running():
            loop.call_soon_threadsafe(self._push_to_subscribers, event)
        else:
            # fallback: try direct (only works if same thread)
            self._push_to_subscribers(event)

    async def subscribe(self) -> AsyncGenerator[dict, None]:
        """Yield event dicts. sse_starlette handles SSE framing."""
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        with self._lock:
            self._subscribers.append(q)
        try:
            for past in self._history[-20:]:
                yield {"data": json.dumps(past)}
            while True:
                event = await q.get()
                yield {"data": json.dumps(event)}
        finally:
            with self._lock:
                self._subscribers.remove(q)

    @property
    def recent(self) -> list[dict]:
        with self._lock:
            return list(self._history[-50:])


event_bus = EventBus()
