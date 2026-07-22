"""Thin, offline CLI presenter for a governed ``DemoJourneyResult``.

Loads ONE local, serialized ``DemoJourneyResult`` fixture, validates it with the
existing typed contract, builds a ``PresentationViewModel`` and renders a plain-text,
narrative-first presentation. Technical details are shown only with an explicit flag.

Hard boundaries (enforced by tests): the CLI accepts only a local ``--fixture`` path
(no remote URLs), performs no network call, calls neither HubSpot nor a provider, never
runs the journey orchestrator, executes no mission, and writes no ledger record. Fixture
loading is deliberately separate from projection logic.

Usage::

    python -m live_signals.presentation_cli --fixture <path-to-fixture.json>
    python -m live_signals.presentation_cli --fixture <path> --show-technical-details
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

from live_signals.demo_contracts import DemoJourneyResult
from live_signals.presentation import (
    PresentationEvidenceContext,
    PresentationViewModel,
    from_demo_journey_result,
)


def load_fixture(path: str) -> DemoJourneyResult:
    """Load and validate ONE local serialized ``DemoJourneyResult``.

    This is pure I/O + typed validation. It performs no network access and builds no
    presentation -- projection is kept separate on purpose.
    """
    fixture_path = Path(path)
    text = fixture_path.read_text(encoding="utf-8")
    return DemoJourneyResult.model_validate_json(text)


def render_presentation(
    view: PresentationViewModel, *, show_technical_details: bool = False
) -> str:
    """Render a plain-text, narrative-first presentation. Never emits raw JSON."""
    lines: List[str] = [
        "VENTUREOS SIGNAL-TO-ACTION",
        "",
        view.headline,
        "",
        view.primary_narrative,
        "",
        "Recommended next step:",
        view.recommendation,
        "",
        f"Journey: {view.journey_label}",
        "",
        "Governance:",
        view.governance_label,
        "",
        "Evidence:",
    ]
    lines.extend(f"- {item}" for item in view.evidence_items)
    lines.extend(
        [
            "",
            "Approval:",
            view.approval_label,
            "",
            "Execution:",
            view.execution_label,
            "",
            "Audit:",
            view.audit_label,
            "",
            "Replay:",
            view.replay_label,
            "",
            "Explanation Provider:",
            view.provider_label,
            "",
            "Safety:",
        ]
    )
    lines.extend(f"- {item}" for item in view.safety_disclosures)

    if show_technical_details:
        lines.extend(["", "Technical Details:"])
        lines.extend(f"- {item}" for item in view.technical_details)

    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="live_signals.presentation_cli",
        description="Offline presenter for one governed VentureOS demo journey.",
    )
    parser.add_argument(
        "--fixture",
        required=True,
        help="Path to a local serialized DemoJourneyResult JSON fixture.",
    )
    parser.add_argument(
        "--show-technical-details",
        action="store_true",
        help="Also render the collapsed technical-details section.",
    )
    parser.add_argument(
        "--replay-validated",
        action="store_true",
        help=(
            "Presentation-only: state that replay safety was proven during a SEPARATE "
            "controlled validation (not observed inside this fixture). Never infers "
            "replay from simulation."
        ),
    )
    parser.add_argument(
        "--validation-reference",
        default="controlled Stage-2 end-to-end validation",
        help="Human reference for the separate replay validation (with --replay-validated).",
    )
    return parser


def _evidence_context(args: argparse.Namespace) -> "PresentationEvidenceContext | None":
    if not args.replay_validated:
        return None
    return PresentationEvidenceContext(
        replay_validated=True,
        receipt_reused=True,
        duplicate_action_prevented=True,
        audit_revalidated=True,
        validation_reference=args.validation_reference,
    )


def main(argv: List[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    result = load_fixture(args.fixture)
    view = from_demo_journey_result(result, evidence_context=_evidence_context(args))
    print(render_presentation(view, show_technical_details=args.show_technical_details))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
