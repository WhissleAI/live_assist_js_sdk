"""
Scheduler runner with per-job tracking, background dispatch, and rich status.
"""

import logging
import threading
import time
import traceback
from datetime import datetime
from typing import Any, Callable

from ..data.storage import Storage
from . import jobs

logger = logging.getLogger(__name__)

SCHEDULE = [
    {"name": "discover_and_ingest", "func": jobs.discover_and_ingest, "interval_hours": 4,
     "description": "Auto-discover earnings, guidance, CFO talks, central bank speeches, testimony — process end-to-end"},
    {"name": "update_outcomes", "func": jobs.update_outcomes, "interval_hours": 6,
     "description": "Fetch actual stock returns for past predictions"},
    {"name": "process_pending", "func": jobs.process_pending, "interval_hours": 1,
     "description": "Run STT → features → predict on queued audio"},
    {"name": "regenerate_signals", "func": jobs.regenerate_signals, "interval_hours": 2,
     "description": "Refresh trade signals for all predictions"},
    {"name": "refresh_convictions", "func": jobs.refresh_convictions, "interval_hours": 0.5,
     "description": "Refresh per-ticker convictions with live prices (every 30 min)"},
    {"name": "retrain_model", "func": jobs.retrain_model, "interval_hours": 168,
     "description": "Retrain ML model (weekly) with accuracy validation gate"},
    {"name": "reextract_features", "func": jobs.reextract_features, "interval_hours": 336,
     "description": "Re-extract features with latest extractors (every 2 weeks)"},
]


class JobState:
    """Tracks the state of a single job across runs."""
    __slots__ = ("name", "description", "interval_hours", "func",
                 "status", "last_run", "last_duration_sec", "last_result",
                 "last_error", "run_count", "error_count")

    def __init__(self, name: str, description: str, interval_hours: float, func: Callable):
        self.name = name
        self.description = description
        self.interval_hours = interval_hours
        self.func = func
        self.status: str = "idle"  # idle | running | completed | error
        self.last_run: float | None = None
        self.last_duration_sec: float | None = None
        self.last_result: Any = None
        self.last_error: str | None = None
        self.run_count: int = 0
        self.error_count: int = 0

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "interval_hours": self.interval_hours,
            "status": self.status,
            "last_run": datetime.fromtimestamp(self.last_run).isoformat() if self.last_run else None,
            "last_duration_sec": round(self.last_duration_sec, 1) if self.last_duration_sec else None,
            "last_result": _safe_serialize(self.last_result),
            "last_error": self.last_error,
            "run_count": self.run_count,
            "error_count": self.error_count,
            "next_run_in_sec": self._next_run_in(),
        }

    def _next_run_in(self) -> int | None:
        if self.last_run is None:
            return 0
        elapsed = time.time() - self.last_run
        remaining = max(0, self.interval_hours * 3600 - elapsed)
        return int(remaining)

    def is_due(self) -> bool:
        if self.last_run is None:
            return True
        return time.time() - self.last_run >= self.interval_hours * 3600


def _safe_serialize(obj: Any) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return {k: _safe_serialize(v) for k, v in list(obj.items())[:10]}
    if isinstance(obj, (str, int, float, bool)):
        return obj
    return str(obj)[:200]


class SchedulerRunner:
    def __init__(self, storage: Storage | None = None):
        self.storage = storage or Storage()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._jobs: dict[str, JobState] = {}
        for spec in SCHEDULE:
            js = JobState(spec["name"], spec["description"], spec["interval_hours"], spec["func"])
            self._jobs[spec["name"]] = js

    # ---- lifecycle ----

    def start(self):
        if self._thread and self._thread.is_alive():
            logger.warning("Scheduler already running")
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="scheduler")
        self._thread.start()
        logger.info("Scheduler started with %d jobs", len(self._jobs))

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Scheduler stopped")

    # ---- main loop ----

    def _loop(self):
        while not self._stop_event.is_set():
            for js in self._jobs.values():
                if self._stop_event.is_set():
                    break
                if js.is_due() and js.status != "running":
                    self._execute(js)
            self._stop_event.wait(timeout=30)

    def _execute(self, js: JobState):
        js.status = "running"
        js.last_error = None
        start = time.time()
        try:
            logger.info("Running job: %s", js.name)
            result = js.func(self.storage)
            js.last_result = result
            js.status = "completed"
            js.run_count += 1
        except Exception as e:
            js.last_error = f"{type(e).__name__}: {e}"
            js.status = "error"
            js.error_count += 1
            logger.error("Job %s failed: %s", js.name, e, exc_info=True)
        finally:
            js.last_run = time.time()
            js.last_duration_sec = time.time() - start

    # ---- manual trigger (runs in a background thread) ----

    def run_now(self, job_name: str) -> dict:
        js = self._jobs.get(job_name)
        if not js:
            return {"status": "error", "message": f"Unknown job: {job_name}"}
        if js.status == "running":
            return {"status": "already_running", "job": job_name}

        t = threading.Thread(target=self._execute, args=(js,), daemon=True,
                             name=f"job-{job_name}")
        t.start()
        return {"status": "started", "job": job_name}

    # ---- status ----

    @property
    def running_jobs(self) -> list[str]:
        return [name for name, js in self._jobs.items() if js.status == "running"]

    @property
    def status(self) -> dict:
        running_list = self.running_jobs
        return {
            "scheduler_active": self._thread is not None and self._thread.is_alive(),
            "current_jobs": running_list,
            "current_job": running_list[0] if running_list else None,  # compat
            "running": self._thread is not None and self._thread.is_alive(),  # compat
            "jobs": [js.to_dict() for js in self._jobs.values()],
        }
