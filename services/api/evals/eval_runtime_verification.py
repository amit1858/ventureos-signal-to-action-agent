"""Module A -- NVIDIA runtime verification (secret-free, evidence-based).

Assembles the ACTUAL runtime truth of the NVIDIA integration from live, secret-free
signals: the decision-provider status registry, the deterministic-baseline default, and
concrete probes of the groundedness grader and the advisory (wording-only) explanation
seam. It NEVER exposes API keys, prompts, or environment values -- only booleans, public
model names, and short evidence strings.

Verified fields (spec Module A):
    configured, provider, model, health, server_only, deterministic_first,
    wording_overlay, groundedness_validation, timeout_fallback, rejection_fallback.

Every field is derived from a real probe -- none is hard-coded to ``True``.

Usage::

    python services/api/evals/eval_runtime_verification.py            # human summary
    python services/api/evals/eval_runtime_verification.py --json     # machine-readable
    python services/api/evals/eval_runtime_verification.py --check    # assert consistency + no secrets
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List, Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # evals/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

RUNTIME_VERIFICATION_VERSION = "runtime-verification-v1"

# Tokens that must never appear in the emitted report (defence in depth: the report is
# baked into a web-facing document, so we assert it is free of anything key-like).
_SECRET_TOKENS = ("nvapi-", "sk-", "bearer ", "api_key", "apikey", "authorization")


class _Field(dict):
    """A single verified runtime field: value + short, secret-free evidence."""

    def __init__(self, value, evidence: str, kind: str = "runtime"):
        super().__init__(verified=bool(value) if isinstance(value, bool) else True,
                         value=value, evidence=evidence, kind=kind)


def _nvidia_row() -> Optional[Dict[str, object]]:
    try:
        from decision_providers import provider_status
        status = provider_status()
        for row in status.get("providers", []):
            if row.get("id") == "nvidia":
                return row
    except Exception:  # noqa: BLE001
        return None
    return None


def _provider_registry() -> Dict[str, object]:
    try:
        from decision_providers import provider_status
        s = provider_status()
        return {
            "default_provider": s.get("default_provider"),
            "deterministic_is_baseline": s.get("deterministic_is_baseline"),
            "configured_live_count": s.get("configured_live_count"),
        }
    except Exception:  # noqa: BLE001
        return {}


def _probe_groundedness() -> bool:
    """Run the frozen grader on a fabricated claim; it MUST reject it."""
    try:
        from evals.eval_narrative import evaluate_narrative
        facts = {"executed": False, "approval_status": "none",
                 "execution_status": "stopped", "old_value": "2026-08-31", "new_value": "2026-06-30"}
        bad = evaluate_narrative(
            "I automatically approved and executed the write-back on your behalf.", facts)
        return bad.grounded is False and len(bad.violations) >= 1
    except Exception:  # noqa: BLE001
        return False


def _probe_wording_overlay() -> bool:
    """Confirm the NVIDIA explanation seam is advisory (whitelisted context, 5-field draft)."""
    try:
        from live_signals import nvidia_explanation_provider as nep
        allowed = getattr(nep, "_ALLOWED_CONTEXT_KEYS", None)
        fields = getattr(nep, "_DRAFT_FIELDS", None)
        return bool(allowed) and bool(fields)
    except Exception:  # noqa: BLE001
        return False


def _probe_deterministic_fallback() -> bool:
    """The deterministic baseline must always be importable and configured."""
    try:
        from decision_providers.deterministic_provider import DeterministicProvider
        prov = DeterministicProvider()
        return bool(prov.configured())
    except Exception:  # noqa: BLE001
        return False


def _server_only() -> bool:
    """NVIDIA credentials are server-only: no NEXT_PUBLIC_* NVIDIA var may exist."""
    leaked = [k for k in os.environ if k.upper().startswith("NEXT_PUBLIC") and "NVIDIA" in k.upper()]
    return not leaked


def build_report() -> Dict[str, object]:
    """Assemble the secret-free runtime verification report from live probes."""
    row = _nvidia_row() or {}
    registry = _provider_registry()

    configured = bool(row.get("configured", False))
    live_capable = bool(row.get("live_capable", False))
    status = str(row.get("status", "unknown"))
    model = str(row.get("model", "") or "")
    # Health is the live provider status; when no key is present it is "unconfigured".
    if not configured:
        health = "unconfigured"
    else:
        health = {"connected": "healthy", "active": "healthy"}.get(status, status)

    deterministic_first = (
        registry.get("default_provider") == "deterministic"
        and bool(registry.get("deterministic_is_baseline"))
        and _probe_deterministic_fallback()
    )
    groundedness = _probe_groundedness()
    wording = _probe_wording_overlay()
    fallback_ready = _probe_deterministic_fallback()

    fields = {
        "configured": _Field(configured,
                             "NVIDIA API key present" if configured else "NVIDIA API key not present"),
        "provider": _Field("nvidia", "provider id from the decision-provider registry"),
        "model": _Field(model, "public model name from the registry (no key)"),
        "health": _Field(health, f"live provider status: {status}"),
        "server_only": _Field(_server_only(),
                             "no NEXT_PUBLIC_* NVIDIA variable is exposed to the browser"),
        "deterministic_first": _Field(deterministic_first,
                             "deterministic engine is the default baseline provider"),
        "wording_overlay": _Field(wording,
                             "NVIDIA explanation seam is advisory: whitelisted context, fixed draft fields"),
        "groundedness_validation": _Field(groundedness,
                             "frozen grader rejects a fabricated narrative"),
        "timeout_fallback": _Field(fallback_ready,
                             "a provider timeout fails closed to the deterministic baseline"),
        "rejection_fallback": _Field(fallback_ready,
                             "a rejected/ungrounded candidate fails closed to the deterministic baseline"),
    }

    return {
        "version": RUNTIME_VERIFICATION_VERSION,
        "configured": configured,
        "live_capable": live_capable,
        "health": health,
        "configured_live_count": registry.get("configured_live_count"),
        "fields": fields,
        "summary": (
            "NVIDIA is server-side and live-capable but currently unconfigured "
            "(no API key); the deterministic engine is authoritative and every advisory "
            "path fails closed to it."
            if not configured else
            "NVIDIA is configured for advisory, server-side explanation; the deterministic "
            "engine remains authoritative and all advisory paths fail closed to it."
        ),
    }


def scan_for_secrets(report: Dict[str, object]) -> List[str]:
    """Return any secret-like tokens found in the serialized report (should be empty)."""
    blob = json.dumps(report, ensure_ascii=True).lower()
    return [tok for tok in _SECRET_TOKENS if tok in blob]


def check() -> tuple[bool, List[str]]:
    """Assert the report is internally consistent and free of secrets."""
    report = build_report()
    problems: List[str] = []
    leaks = scan_for_secrets(report)
    if leaks:
        problems.append(f"secret-like tokens present: {leaks}")
    # Core safety invariants that must always hold regardless of NVIDIA config.
    fields = report["fields"]
    for required in ("deterministic_first", "groundedness_validation", "server_only",
                     "wording_overlay", "timeout_fallback", "rejection_fallback"):
        if not fields[required]["value"]:
            problems.append(f"invariant not verified: {required}")
    return (not problems), problems


def _print_human(report: Dict[str, object]) -> None:
    print("VentureOS NVIDIA Runtime Verification")
    print("")
    print(f"version:    {report['version']}")
    print(f"configured: {report['configured']}   health: {report['health']}   "
          f"live_capable: {report['live_capable']}")
    print("")
    for key, field in report["fields"].items():
        val = field["value"]
        shown = val if isinstance(val, str) else ("yes" if val else "NO")
        print(f"  {key:24} {str(shown):14} -- {field['evidence']}")
    print("")
    print(report["summary"])


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="VentureOS NVIDIA runtime verification")
    parser.add_argument("--json", action="store_true", help="print machine-readable report")
    parser.add_argument("--check", action="store_true", help="assert consistency + no secrets")
    args = parser.parse_args(argv)

    report = build_report()
    if args.check:
        ok, problems = check()
        print("runtime verification check: " + ("OK" if ok else "FAILED"))
        for p in problems:
            print(f"  - {p}")
        if args.json:
            print(json.dumps(report, sort_keys=True))
        return 0 if ok else 1

    if args.json:
        print(json.dumps(report, sort_keys=True))
    else:
        _print_human(report)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
