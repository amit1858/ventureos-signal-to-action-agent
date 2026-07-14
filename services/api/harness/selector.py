"""Deterministic mission-template selector (Release 2.2).

``select(signals, canonical_account_context) -> SelectionResult`` is a pure
function: no model call, no randomness, no clock. It walks a fixed first-match
precedence ladder and returns the selected template id together with the rule
that matched and a human-readable rationale. Identical input always yields an
identical result.

When no rule matches, an explicit deterministic fallback is returned (never an
error, never a guess) and ``is_fallback`` is set.
"""

from __future__ import annotations

from typing import Callable, List, Mapping, Optional, Tuple

from pydantic import Field

from harness.contracts import HarnessModel
from harness.templates import (
    RENEWAL_RISK_PARALLEL_V1,
    SUPPORT_ESCALATION_SEQUENTIAL_V1,
)

# Explicit deterministic fallback: the fully-implemented renewal template.
FALLBACK_TEMPLATE_ID = RENEWAL_RISK_PARALLEL_V1


class SelectionResult(HarnessModel):
    """The deterministic outcome of template selection."""

    selected_template_id: str
    matched_rule_id: str
    matched_rules: List[str] = Field(default_factory=list)
    rationale: str
    is_fallback: bool = False


Signals = Mapping[str, object]
AccountContext = Optional[Mapping[str, object]]
Rule = Tuple[str, Callable[[Signals, AccountContext], bool], str, str]


def _lower(value: object) -> str:
    return str(value).strip().lower() if value is not None else ""


def _severity(signals: Signals) -> str:
    return _lower(signals.get("severity") or signals.get("priority"))


def _is_renewal(signals: Signals, _account: AccountContext) -> bool:
    mission_type = _lower(signals.get("mission_type"))
    signal_type = _lower(signals.get("signal_type"))
    if mission_type == "renewal_risk":
        return True
    if signal_type in {"renewal_risk", "churn_risk", "renewal"}:
        return True
    return False


def _is_support_escalation_critical(signals: Signals, _account: AccountContext) -> bool:
    mission_type = _lower(signals.get("mission_type"))
    signal_type = _lower(signals.get("signal_type"))
    is_support = mission_type == "support_escalation" or signal_type in {
        "support_escalation",
        "support_ticket",
        "escalation",
    }
    return is_support and _severity(signals) in {"critical", "high"}


# First-match precedence ladder. Order is authoritative and deterministic.
_RULES: List[Rule] = [
    (
        "R1_renewal_risk",
        _is_renewal,
        RENEWAL_RISK_PARALLEL_V1,
        "Signal indicates renewal/churn risk -> renewal-risk-parallel-v1 (parallel analysis).",
    ),
    (
        "R2_support_escalation_critical",
        _is_support_escalation_critical,
        SUPPORT_ESCALATION_SEQUENTIAL_V1,
        "Signal indicates a critical/high support escalation -> "
        "support-escalation-sequential-v1 (sequential chain).",
    ),
]


def select(signals: Signals, canonical_account_context: AccountContext = None) -> SelectionResult:
    """Deterministically select a mission template for the given signals."""
    if signals is None:
        signals = {}
    matched: List[str] = []
    for rule_id, predicate, template_id, rationale in _RULES:
        if predicate(signals, canonical_account_context):
            matched.append(rule_id)
            return SelectionResult(
                selected_template_id=template_id,
                matched_rule_id=rule_id,
                matched_rules=matched,
                rationale=rationale,
                is_fallback=False,
            )
    return SelectionResult(
        selected_template_id=FALLBACK_TEMPLATE_ID,
        matched_rule_id="R_fallback",
        matched_rules=["R_fallback"],
        rationale="No specific rule matched -> deterministic fallback to "
        f"{FALLBACK_TEMPLATE_ID}.",
        is_fallback=True,
    )


__all__ = ["FALLBACK_TEMPLATE_ID", "SelectionResult", "select"]
