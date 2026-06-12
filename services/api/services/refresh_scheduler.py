"""Background data-refresh scheduler (optional, opt-in, single-instance).

When ``HUBSPOT_REFRESH_INTERVAL_SECONDS`` is greater than zero, this runs a single
daemon thread that periodically re-syncs the active dataset from HubSpot so a
long-running backend never serves stale numbers. It is intentionally conservative:

* **Single instance.** ``start`` is guarded so a second scheduler can never spawn
  (no thread explosion, no duplicate syncs).
* **Event-based sleep.** It waits on a :class:`threading.Event`, so shutdown is
  immediate and clean -- no busy-loop, no leaked thread.
* **Never downgrades.** The refresh callable only swaps in new data on success; on
  any failure the last-good dataset is kept (the loop logs a warning and continues).
* **Never interrupts requests.** It only calls the same read-only sync the manual
  endpoint uses; request threads read an atomically-swapped snapshot.

Default behaviour is OFF (interval ``0``). Recommended production value: ``900``.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Callable, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RefreshScheduler:
    """A single, safe, periodic refresh loop."""

    def __init__(self, refresh: Callable[[], object], interval_seconds: int, logger) -> None:
        self._refresh = refresh
        self._interval = max(0, int(interval_seconds))
        self._log = logger
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._started_at: Optional[str] = None
        self._last_run_at: Optional[str] = None
        self._last_success_at: Optional[str] = None
        self._last_error: Optional[str] = None
        self._runs = 0
        self._failures = 0

    # -- lifecycle --------------------------------------------------------

    def start(self) -> bool:
        """Start the loop if enabled and not already running. Returns started?."""
        with self._lock:
            if self._interval <= 0:
                self._log.info("Background refresh disabled (HUBSPOT_REFRESH_INTERVAL_SECONDS=0).")
                return False
            if self._thread is not None and self._thread.is_alive():
                self._log.info("Background refresh already running; not starting another.")
                return False
            self._stop.clear()
            self._started_at = _now_iso()
            self._thread = threading.Thread(target=self._run, name="hubspot-refresh", daemon=True)
            self._thread.start()
            self._log.info("Background refresh scheduler started: every %s seconds.", self._interval)
            return True

    def stop(self, timeout: float = 5.0) -> None:
        """Signal the loop to stop and wait briefly for it to exit."""
        self._stop.set()
        thread = self._thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout)
        self._log.info("Background refresh scheduler stopped.")

    # -- loop -------------------------------------------------------------

    def _run(self) -> None:
        # Wait one full interval before the first refresh so we never double-sync
        # immediately after the startup auto-sync. Event.wait returns True only
        # when stop() is called, so this exits promptly on shutdown.
        while not self._stop.wait(self._interval):
            self._tick()

    def _tick(self) -> None:
        self._last_run_at = _now_iso()
        with self._lock:
            self._runs += 1
        try:
            result = self._refresh()
            with self._lock:
                self._last_error = None
            if result is None:
                self._log.info("Background refresh tick skipped (active source is not HubSpot).")
            else:
                self._last_success_at = _now_iso()
                self._log.info(
                    "Background refresh ok: %s companies refreshed.",
                    getattr(result, "companies_loaded", "?"),
                )
        except Exception as exc:  # noqa: BLE001 -- the loop must never die
            with self._lock:
                self._failures += 1
                self._last_error = str(exc)
            self._log.warning("Background refresh failed (%s). Keeping last-good data.", exc)

    # -- introspection ----------------------------------------------------

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def status(self) -> dict:
        with self._lock:
            return {
                "enabled": self._interval > 0,
                "running": self.is_running(),
                "interval_seconds": self._interval,
                "started_at": self._started_at,
                "runs": self._runs,
                "failures": self._failures,
                "last_run_at": self._last_run_at,
                "last_success_at": self._last_success_at,
                "last_error": self._last_error,
            }
