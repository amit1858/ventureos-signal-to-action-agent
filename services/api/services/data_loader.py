"""Data loader — source-aware (synthetic local dataset or synced HubSpot CRM).

Historically this read only the generated synthetic CSV/JSON files. It is now a
thin dispatcher: the whole pipeline (Signal Ingestion Agent, scoring,
``/api/accounts``, dataset summary) keeps calling the same public functions, but
the *active source* can be switched to a HubSpot-synced dataset at runtime via
:func:`set_hubspot_dataset`. The synthetic readers stay cached and remain the
default, so the offline demo is always available.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import threading
from functools import lru_cache
from typing import Dict, List, Optional

from schemas.account import Account, AccountDetail, Note
from schemas.signal import Signal

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
ACCOUNTS_CSV = os.path.join(DATA_DIR, "synthetic_accounts.csv")
SIGNALS_CSV = os.path.join(DATA_DIR, "synthetic_signals.csv")
NOTES_JSON = os.path.join(DATA_DIR, "synthetic_notes.json")

SYNTHETIC_LABEL = "Synthetic local dataset"
HUBSPOT_LABEL = "HubSpot test CRM"

logger = logging.getLogger("signal_to_action.data")


class DataNotGeneratedError(RuntimeError):
    """Raised when the synthetic data files are missing."""


# -- active-source state --------------------------------------------------
#
# Reads and writes go through ``_LOCK`` so the background auto-sync / refresh
# thread can swap in a new dataset without a request thread ever observing a
# half-updated state. ``_HS`` (the HubSpot-synced dataset) is replaced
# atomically as one new dict reference, and every reader copies the list it
# needs while holding the lock, so each call returns an internally-consistent
# snapshot. (Synthetic disk reads happen outside the lock; they are cached.)

_LOCK = threading.RLock()

_SOURCE: Dict[str, object] = {
    "name": "synthetic",  # "synthetic" | "hubspot"
    "label": SYNTHETIC_LABEL,
    "mode": "synthetic",  # UI data-source mode badge
    "synced_at": None,
    "counts": {},
    "portal_id": None,
    "connector": None,
    "message": "",
}

_HS: Dict[str, list] = {"accounts": [], "signals": [], "notes": []}


def _require(path: str) -> None:
    if not os.path.exists(path):
        raise DataNotGeneratedError(
            f"Missing data file: {path}. Run: python data/generate_synthetic_data.py"
        )


# -- synthetic readers (cached) ------------------------------------------


@lru_cache(maxsize=1)
def _synthetic_accounts() -> List[Account]:
    _require(ACCOUNTS_CSV)
    with open(ACCOUNTS_CSV, newline="", encoding="utf-8") as f:
        return [Account(**row) for row in csv.DictReader(f)]


@lru_cache(maxsize=1)
def _synthetic_signals() -> List[Signal]:
    _require(SIGNALS_CSV)
    with open(SIGNALS_CSV, newline="", encoding="utf-8") as f:
        return [Signal(**row) for row in csv.DictReader(f)]


@lru_cache(maxsize=1)
def _synthetic_notes() -> List[Note]:
    _require(NOTES_JSON)
    with open(NOTES_JSON, encoding="utf-8") as f:
        return [Note(**row) for row in json.load(f)]


# -- public dispatchers (used across the pipeline) -----------------------


def load_accounts() -> List[Account]:
    with _LOCK:
        if _SOURCE["name"] == "hubspot":
            return list(_HS["accounts"])
    try:
        return _synthetic_accounts()
    except DataNotGeneratedError:
        with _LOCK:
            if _HS["accounts"]:
                logger.warning("Synthetic accounts unavailable; serving last-good HubSpot cache.")
                return list(_HS["accounts"])
        raise


def load_signals() -> List[Signal]:
    with _LOCK:
        if _SOURCE["name"] == "hubspot":
            return list(_HS["signals"])
    try:
        return _synthetic_signals()
    except DataNotGeneratedError:
        with _LOCK:
            if _HS["accounts"]:
                logger.warning("Synthetic signals unavailable; serving last-good HubSpot cache.")
                return list(_HS["signals"])
        raise


def load_notes() -> List[Note]:
    with _LOCK:
        if _SOURCE["name"] == "hubspot":
            return list(_HS["notes"])
    try:
        return _synthetic_notes()
    except DataNotGeneratedError:
        with _LOCK:
            if _HS["accounts"]:
                logger.warning("Synthetic notes unavailable; serving last-good HubSpot cache.")
                return list(_HS["notes"])
        raise


def signals_by_account() -> Dict[str, List[Signal]]:
    grouped: Dict[str, List[Signal]] = {}
    for s in load_signals():
        grouped.setdefault(s.account_id, []).append(s)
    return grouped


def notes_by_account() -> Dict[str, List[Note]]:
    grouped: Dict[str, List[Note]] = {}
    for n in load_notes():
        grouped.setdefault(n.account_id, []).append(n)
    return grouped


def get_account(account_id: str) -> Account | None:
    for a in load_accounts():
        if a.account_id == account_id:
            return a
    return None


def get_account_detail(account_id: str) -> AccountDetail | None:
    account = get_account(account_id)
    if account is None:
        return None
    sigs = signals_by_account().get(account_id, [])
    notes = notes_by_account().get(account_id, [])
    return AccountDetail(**account.model_dump(), signals=sigs, notes=notes)


def dataset_summary() -> dict:
    """Lightweight stats for the UI dataset panel (reflects the active source)."""
    accounts = load_accounts()
    signals = load_signals()
    notes = load_notes()
    industries = sorted({a.industry for a in accounts})
    regions = sorted({a.region for a in accounts})
    with _LOCK:
        src_name = _SOURCE["name"]
        src_label = _SOURCE["label"]
        src_mode = _SOURCE["mode"]
        synced_at = _SOURCE["synced_at"]
        portal_id = _SOURCE["portal_id"]
    return {
        "accounts": len(accounts),
        "signals": len(signals),
        "notes": len(notes),
        "industries": industries,
        "regions": regions,
        "source": src_name,
        "source_label": src_label,
        "data_source_mode": src_mode,
        "last_synced_at": synced_at,
        "portal_id": portal_id,
    }


# -- source control -------------------------------------------------------


def set_hubspot_dataset(
    accounts: List[Account],
    signals: List[Signal],
    notes: List[Note],
    *,
    synced_at: Optional[str] = None,
    counts: Optional[Dict[str, int]] = None,
    portal_id: Optional[str] = None,
    connector: str = "hubspot",
    message: str = "",
) -> None:
    """Switch the active source to a HubSpot-synced dataset (atomic swap)."""
    new_hs: Dict[str, list] = {
        "accounts": list(accounts),
        "signals": list(signals),
        "notes": list(notes),
    }
    global _HS
    with _LOCK:
        _HS = new_hs
        _SOURCE.update(
            name="hubspot",
            label=HUBSPOT_LABEL,
            mode="hubspot",
            synced_at=synced_at,
            counts=counts or {},
            portal_id=portal_id,
            connector=connector,
            message=message,
        )


def use_synthetic() -> None:
    """Revert the active source to the local synthetic dataset."""
    with _LOCK:
        _SOURCE.update(
            name="synthetic",
            label=SYNTHETIC_LABEL,
            mode="synthetic",
            synced_at=None,
            counts={},
            portal_id=None,
            connector=None,
            message="",
        )


def active_source() -> str:
    with _LOCK:
        return str(_SOURCE["name"])


def source_label() -> str:
    with _LOCK:
        return str(_SOURCE["label"])


def sync_meta() -> dict:
    """Source metadata for the UI runtime card and the decision ledger."""
    with _LOCK:
        return {
            "source": _SOURCE["name"],
            "label": _SOURCE["label"],
            "mode": _SOURCE["mode"],
            "synced_at": _SOURCE["synced_at"],
            "counts": dict(_SOURCE["counts"]) if isinstance(_SOURCE["counts"], dict) else {},
            "portal_id": _SOURCE["portal_id"],
            "connector": _SOURCE["connector"],
            "message": _SOURCE["message"],
        }


def runtime_state() -> dict:
    """Consistent snapshot of the active-source state for /api/system/status."""
    with _LOCK:
        counts = dict(_SOURCE["counts"]) if isinstance(_SOURCE["counts"], dict) else {}
        return {
            "source": str(_SOURCE["name"]),
            "source_label": str(_SOURCE["label"]),
            "data_source_mode": str(_SOURCE["mode"]),
            "last_synced_at": _SOURCE["synced_at"],
            "portal_id": _SOURCE["portal_id"],
            "connector": _SOURCE["connector"],
            "counts": counts,
            "hubspot_cache_ready": bool(_HS["accounts"]),
        }


# -- synthetic accessors (always synthetic, for the seed script) ----------


def synthetic_accounts() -> List[Account]:
    return _synthetic_accounts()


def synthetic_signals_by_account() -> Dict[str, List[Signal]]:
    grouped: Dict[str, List[Signal]] = {}
    for s in _synthetic_signals():
        grouped.setdefault(s.account_id, []).append(s)
    return grouped


def synthetic_notes_by_account() -> Dict[str, List[Note]]:
    grouped: Dict[str, List[Note]] = {}
    for n in _synthetic_notes():
        grouped.setdefault(n.account_id, []).append(n)
    return grouped


def reload() -> None:
    """Clear caches after regenerating synthetic data."""
    _synthetic_accounts.cache_clear()
    _synthetic_signals.cache_clear()
    _synthetic_notes.cache_clear()
