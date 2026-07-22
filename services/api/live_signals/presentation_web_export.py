"""Build-time adapter: export governed ``PresentationViewModel`` data for the web Demo Mode.

Architecture::

    DemoJourneyResult fixture  ->  from_demo_journey_result  ->  PresentationViewModel
                                                              ->  camelCase JSON (web-safe)

This script is the ONLY place the web Demo Mode's data is produced. It reads the two
already-validated, committed serialized ``DemoJourneyResult`` fixtures, runs the exact
committed presentation projection (never a reimplementation), and writes a single,
web-safe, camelCase JSON document that the Next.js app consumes read-only.

It never calls a network, a provider, HubSpot, Salesforce, or the journey orchestrator,
never executes a mission, and never writes a ledger record. It only projects already
governed facts. The emitted document carries ONLY the safe presentation view model --
no secrets, no local paths, no CRM payloads, no raw ``DemoJourneyResult`` internals.

Replay truthfulness is preserved exactly:

* Journey A carries no replay-validated view (nothing executed).
* Journey B carries a default view (replay "not observed in this result") AND a separate
  ``replayValidatedView`` produced ONLY when a presentation-only
  ``PresentationEvidenceContext`` is supplied. Replay is never inferred from simulation.

Usage::

    python -m live_signals.presentation_web_export --write   # regenerate the committed JSON
    python -m live_signals.presentation_web_export --check    # verify it is in sync (CI/golden)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from live_signals.demo_contracts import DemoJourneyResult
from live_signals.presentation import (
    PresentationEvidenceContext,
    PresentationViewModel,
    from_demo_journey_result,
)

# -- paths (computed from this file; no hard-coded absolute paths) -------------

_LIVE_SIGNALS_DIR = Path(__file__).resolve().parent
_API_DIR = _LIVE_SIGNALS_DIR.parent
_REPO_ROOT = _API_DIR.parent.parent
_FIXTURES_DIR = _API_DIR / "tests" / "fixtures"
_OUTPUT_PATH = (
    _REPO_ROOT / "apps" / "web" / "lib" / "demo-mode" / "data" / "demo-journeys.generated.json"
)

SCHEMA_VERSION = "1.0"

_JOURNEY_A_FIXTURE = "demo_journey_live_single_source.json"
_JOURNEY_B_FIXTURE = "demo_journey_controlled_execution.json"

# The separately-validated replay evidence context for Journey B. This is
# presentation-only: it never mutates the journey result and is never used to infer
# replay from simulation. It only lets the presenter honestly state that replay safety
# was proven during the controlled Stage-2 end-to-end validation.
_REPLAY_EVIDENCE_CONTEXT = PresentationEvidenceContext(
    replay_validated=True,
    receipt_reused=True,
    duplicate_action_prevented=True,
    audit_revalidated=True,
    validation_reference="controlled Stage-2 end-to-end validation",
)

# snake_case (Python model) -> camelCase (web wire). Explicit map keeps the boundary
# obvious and lets the TypeScript parity test assert an exact, versioned field set.
_CAMEL_FIELDS: Dict[str, str] = {
    "schema_version": "schemaVersion",
    "headline": "headline",
    "primary_narrative": "primaryNarrative",
    "recommendation": "recommendation",
    "journey_label": "journeyLabel",
    "governance_label": "governanceLabel",
    "approval_label": "approvalLabel",
    "execution_label": "executionLabel",
    "evidence_items": "evidenceItems",
    "audit_label": "auditLabel",
    "replay_label": "replayLabel",
    "provider_label": "providerLabel",
    "safety_disclosures": "safetyDisclosures",
    "status_tone": "statusTone",
    "technical_details": "technicalDetails",
    "source_result_reference": "sourceResultReference",
}


def _view_to_camel(view: PresentationViewModel) -> Dict[str, Any]:
    """Serialize a frozen ``PresentationViewModel`` to a camelCase, web-safe dict."""
    raw = view.model_dump()
    out: Dict[str, Any] = {}
    for snake, camel in _CAMEL_FIELDS.items():
        out[camel] = raw[snake]
    return out


def _load(fixture_name: str) -> DemoJourneyResult:
    text = (_FIXTURES_DIR / fixture_name).read_text(encoding="utf-8")
    return DemoJourneyResult.model_validate_json(text)


def _project(
    fixture_name: str, *, evidence_context: Optional[PresentationEvidenceContext] = None
) -> Dict[str, Any]:
    result = _load(fixture_name)
    view = from_demo_journey_result(result, evidence_context=evidence_context)
    return _view_to_camel(view)


def build_document() -> Dict[str, Any]:
    """Build the full web Demo Mode document from the committed fixtures."""
    journey_a_default = _project(_JOURNEY_A_FIXTURE)
    journey_b_default = _project(_JOURNEY_B_FIXTURE)
    journey_b_replay = _project(
        _JOURNEY_B_FIXTURE, evidence_context=_REPLAY_EVIDENCE_CONTEXT
    )

    journeys: List[Dict[str, Any]] = [
        {
            "key": "a",
            "title": "Journey A \u2014 Governed Stop",
            "subtitle": "Live single-source governed stop",
            "supportsReplayEvidenceToggle": False,
            "view": journey_a_default,
            "replayValidatedView": None,
        },
        {
            "key": "b",
            "title": "Journey B \u2014 Governed Simulated Execution",
            "subtitle": "Controlled governed simulated execution",
            "supportsReplayEvidenceToggle": True,
            "view": journey_b_default,
            "replayValidatedView": journey_b_replay,
        },
    ]

    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedBy": "services/api/live_signals/presentation_web_export.py",
        "generatedFrom": [_JOURNEY_A_FIXTURE, _JOURNEY_B_FIXTURE],
        "defaultJourneyKey": "a",
        "journeys": journeys,
    }


def _serialize(doc: Dict[str, Any]) -> str:
    """Stable, deterministic serialization (trailing newline for POSIX-friendly diffs)."""
    return json.dumps(doc, indent=2, ensure_ascii=True) + "\n"


def write() -> Path:
    doc = build_document()
    _OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    _OUTPUT_PATH.write_text(_serialize(doc), encoding="utf-8")
    return _OUTPUT_PATH


def check() -> bool:
    """Return True when the on-disk generated document exactly matches a fresh build."""
    if not _OUTPUT_PATH.exists():
        return False
    expected = _serialize(build_document())
    actual = _OUTPUT_PATH.read_text(encoding="utf-8")
    return expected == actual


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="live_signals.presentation_web_export",
        description="Export web-safe PresentationViewModel data for the Demo Mode.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true", help="Regenerate the committed JSON.")
    group.add_argument(
        "--check", action="store_true", help="Verify the committed JSON is in sync."
    )
    args = parser.parse_args(argv)

    if args.write:
        path = write()
        rel = path.relative_to(_REPO_ROOT)
        print(f"web-export: wrote {rel}")
        return 0

    if check():
        print("web-export check: generated demo-journeys.json matches")
        return 0
    print("web-export check: OUT OF SYNC -- run --write to regenerate")
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
