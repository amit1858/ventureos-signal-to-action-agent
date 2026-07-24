"""Local, timestamped evaluation artifact (Step 10).

Live-mode runs write one JSON artifact under ``artifacts/nvidia-advisory/`` (git-ignored;
never committed in Gate 1). A defensive secret guard refuses to write if any key-like
token slips into the payload.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict

_HERE = os.path.dirname(os.path.abspath(__file__))
# evals/nvidia_advisory -> services/api -> services -> <repo root>
_REPO_ROOT = os.path.abspath(os.path.join(_HERE, "..", "..", "..", ".."))
DEFAULT_ARTIFACT_DIR = os.path.join(_REPO_ROOT, "artifacts", "nvidia-advisory")

_SECRET_PATTERNS = (
    re.compile(r"nvapi-[A-Za-z0-9_\-]{6,}", re.IGNORECASE),
    re.compile(r"sk-[A-Za-z0-9_\-]{6,}", re.IGNORECASE),
    re.compile(r"Bearer\s+[A-Za-z0-9_\-]{6,}", re.IGNORECASE),
    re.compile(r"Authorization\s*[:=]\s*\S+", re.IGNORECASE),
)


def assert_no_secrets(payload: Dict[str, Any]) -> None:
    """Raise if the serialized payload contains a key-like token."""

    blob = json.dumps(payload, ensure_ascii=False, default=str)
    for pat in _SECRET_PATTERNS:
        if pat.search(blob):
            raise ValueError("refusing to write advisory artifact: possible secret detected")


def write_artifact(summary: Dict[str, Any], *, commit: str, out_dir: str = DEFAULT_ARTIFACT_DIR) -> str:
    """Write the summary as a timestamped artifact and return its path."""

    assert_no_secrets(summary)
    os.makedirs(out_dir, exist_ok=True)
    ts = str(summary.get("finished_at") or summary.get("started_at") or "run").replace(":", "").replace("-", "")
    safe_ts = re.sub(r"[^0-9A-Za-z]", "", ts)[:20] or "run"
    short = (commit or "unknown")[:7]
    path = os.path.join(out_dir, f"nvidia-advisory-{safe_ts}-{short}.json")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(summary, indent=2, ensure_ascii=False, default=str) + "\n")
    return path
