"""Additive Explainability Layer -- Real HubSpot Signal Vertical Slice, Phase 3.

Transforms the governed, deterministic result of one live-signal mission into ONE
concise, evidence-backed explanation suitable for UI, API, presenter mode, and (later)
voice. It is purely additive and imports only stable public contracts from Phase 1/2:

    SignalChangeEvent + LiveMission + LiveMissionIntegrationResult
      -> GovernedFacts               (typed, validated, secret-free)
      -> deterministic explanation   (authoritative product result)
      -> optional NVIDIA overlay      (wording only)
      -> narrative groundedness gate  (adapter-local, negation-aware)
      -> accepted provider text OR deterministic fallback

Hard boundaries (this layer NEVER):
* selects/replaces a mission, changes priority, or reinterprets evidence;
* overrides identity governance, infers/creates approval, or claims execution that did
  not occur;
* claims real CRM write-back, fabricates dates/values/identities/risks, creates new
  evidence, or triggers any external action.

The deterministic product result stays authoritative. An optional provider may ONLY
improve wording of the headline, narrative, governance explanation, evidence summary,
and advisory recommendation; it can never return or override a governed state field.

Dependency direction (reported deliberately): this PRODUCTION module does not import the
``evals`` package. ``evals`` is a validation/test harness that depends on production, not
the reverse; importing it here would invert that direction. Instead the same
groundedness checks (execution / approval / authority / write-back / identity / date
claims, with governed-negation awareness) are implemented locally. The focused test
cross-checks parity against the committed ``evals.eval_narrative.evaluate_narrative`` so
the two never silently drift.
"""

from __future__ import annotations

import re
from datetime import date
from enum import Enum
from typing import Dict, List, Optional, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field

from live_signals.contracts import SignalChangeEvent, SignalDirection
from live_signals.mission_contracts import LiveMission, MissionModel, MissionPriority
from live_signals.mission_governance_adapter import (
    BLOCKED,
    EXECUTED,
    FAILED,
    REJECTED,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
    LiveMissionIntegrationResult,
)

EXPLAINABILITY_VERSION = "LIVE-EXPLAINABILITY-v1"


class ExplainabilityError(ValueError):
    """Fail-closed error raised while building GovernedFacts (broken linkage,
    inconsistent governed state, or invalid provenance). No side effect occurs."""


# -- provenance --------------------------------------------------------------


class ProvenanceMode(str, Enum):
    """How the account identity behind this governed result was established.

    ``controlled_offline_corroborated`` must NEVER be presented as a live multi-source
    integration; it means a controlled, offline second source was supplied so the
    protected identity fabric could resolve the account for a governed proof.
    """

    live_single_source = "live_single_source"
    controlled_offline_corroborated = "controlled_offline_corroborated"


# -- typed contracts ---------------------------------------------------------


class GovernedFacts(MissionModel):
    """Validated, secret-free projection of one governed live-signal outcome.

    Every field is derived deterministically from the ``SignalChangeEvent``, the
    ``LiveMission`` and the ``LiveMissionIntegrationResult``. It carries no credential,
    no raw CRM payload, no database path and no execution authority -- only the governed
    business facts an explanation (or a provider prompt) may reference."""

    schema_version: str = "1.0"
    # -- account identity ----------------------------------------------------
    account_id: str
    account_display_name: str = ""
    source_system: str
    source_record_id: str
    external_reference: str
    # -- signal --------------------------------------------------------------
    signal_type: str
    signal_field: str
    previous_value: str
    current_value: str
    direction: str
    movement_summary: str
    source_event_id: str
    change_fingerprint: str
    # -- mission -------------------------------------------------------------
    mission_id: str
    mission_type: str
    priority: str
    rule_id: str = ""
    rule_version: str = ""
    template_id: str = ""
    template_version: str = ""
    # -- governance / execution ---------------------------------------------
    governance_status: str
    failure_code: Optional[str] = None
    identity_status: str
    approval_required: bool = False
    approval_status: str
    execution_status: str
    executed: bool = False
    replayed: bool = False
    receipt_present: bool = False
    ledger_reference: Optional[str] = None
    provenance_mode: str

    def to_provider_context(self) -> Dict[str, object]:
        """Minimal, whitelisted, secret-free context for an optional provider.

        Deliberately omits any raw payload, credential, ledger path or internal id that
        is not a governed business fact. The provider only rewords these facts."""
        return {
            "account_display_name": self.account_display_name or self.account_id,
            "source_system": self.source_system,
            "signal_field": self.signal_field,
            "previous_value": self.previous_value,
            "current_value": self.current_value,
            "direction": self.direction,
            "movement_summary": self.movement_summary,
            "mission_type": self.mission_type,
            "priority": self.priority,
            "governance_status": self.governance_status,
            "failure_code": self.failure_code,
            "identity_status": self.identity_status,
            "approval_required": self.approval_required,
            "approval_status": self.approval_status,
            "execution_status": self.execution_status,
            "executed": self.executed,
            "replayed": self.replayed,
            "receipt_present": self.receipt_present,
            "provenance_mode": self.provenance_mode,
        }

    def narrative_facts(self) -> Dict[str, object]:
        """Facts dict shaped for the groundedness validator (and parity with the
        committed ``evals.eval_narrative`` fact keys)."""
        return {
            "account_display_name": self.account_display_name or self.account_id,
            "old_value": self.previous_value,
            "new_value": self.current_value,
            "direction": self.direction,
            "mission_type": self.mission_type,
            "priority": self.priority,
            "identity_status": self.identity_status,
            "approval_status": self.approval_status,
            "execution_status": self.execution_status,
            "executed": self.executed,
        }


class ExplanationResult(MissionModel):
    """One explanation of a governed mission outcome, ready for UI/API/voice."""

    schema_version: str = "1.0"
    headline: str
    narrative: str
    recommended_next_step: str
    governance_explanation: str
    evidence_summary: str
    status_label: str
    provider_status: str  # "unconfigured" | "configured" | "error"
    provider_used: bool = False
    fallback_used: bool = False
    validation_status: str  # "not_applicable" | "grounded" | "rejected"
    validation_violations: List[str] = Field(default_factory=list)
    governed_facts: GovernedFacts


# -- optional provider boundary ----------------------------------------------


class ProviderExplanationDraft(BaseModel):
    """Text-only draft an optional provider may return. Product state is NOT here:
    a provider can never carry a governed status, approval, or execution field."""

    model_config = ConfigDict(extra="ignore")

    headline: Optional[str] = None
    narrative: Optional[str] = None
    governance_explanation: Optional[str] = None
    evidence_summary: Optional[str] = None
    recommended_next_step: Optional[str] = None


@runtime_checkable
class ExplanationProvider(Protocol):
    """Minimal duck-typed provider boundary (compatible with the existing
    ``LLMDecisionProvider`` pattern: ``configured()`` + a single generate call).

    Implementations receive ONLY the governed, non-secret context and return wording."""

    def configured(self) -> bool: ...

    def generate_explanation(
        self, context: Dict[str, object]
    ) -> ProviderExplanationDraft: ...


# -- fact builder (fail-closed) ----------------------------------------------


def _movement_summary(event: SignalChangeEvent) -> str:
    """Deterministic, human plain-language movement description."""
    field = event.monitored_field.replace("_", " ")
    old, new = event.old_value, event.new_value
    try:
        d_old = date.fromisoformat(old)
        d_new = date.fromisoformat(new)
        days = abs((d_new - d_old).days)
        if d_new < d_old:
            return f"{field} moved {days} days earlier (from {old} to {new})"
        if d_new > d_old:
            return f"{field} moved {days} days later (from {old} to {new})"
        return f"{field} is unchanged at {new}"
    except ValueError:
        return f"{field} changed from {old} to {new}"


def _identity_status(result: LiveMissionIntegrationResult) -> str:
    if result.status == STOPPED_IDENTITY_UNVERIFIED:
        return "unverified"
    return "corroborated"


def build_governed_facts(
    mission: LiveMission,
    event: SignalChangeEvent,
    integration_result: LiveMissionIntegrationResult,
    *,
    provenance_mode: object,
) -> GovernedFacts:
    """Deterministically build validated ``GovernedFacts``. Fails closed on any broken
    linkage, inconsistent governed state, or invalid/missing provenance."""
    # 1. Provenance must be present and valid.
    try:
        provenance = ProvenanceMode(provenance_mode)
    except ValueError as exc:
        raise ExplainabilityError(
            f"invalid or missing provenance_mode {provenance_mode!r}; "
            f"expected one of {[m.value for m in ProvenanceMode]}."
        ) from exc

    # 2. Evidence linkage must match (mission <-> event).
    if mission.source_event_id != event.event_id:
        raise ExplainabilityError(
            "linkage mismatch: mission.source_event_id != event.event_id."
        )
    if mission.change_fingerprint != event.change_fingerprint:
        raise ExplainabilityError(
            "linkage mismatch: mission.change_fingerprint != event.change_fingerprint."
        )

    # 3. Mission identity must agree with the integration result where it is known.
    if (
        integration_result.ledger_mission_id
        and integration_result.ledger_mission_id != mission.mission_id
    ):
        raise ExplainabilityError(
            "linkage mismatch: integration_result.ledger_mission_id != mission.mission_id."
        )

    # 4. Approval / execution state must be internally consistent (fail closed).
    executed = bool(integration_result.executed)
    status = integration_result.status
    receipt_present = bool(integration_result.simulated_receipt_id)
    if executed and status != EXECUTED:
        raise ExplainabilityError(
            f"inconsistent state: executed=True but status={status!r}."
        )
    if status == EXECUTED and not executed:
        raise ExplainabilityError(
            "inconsistent state: status=executed but executed=False."
        )
    if executed and integration_result.approval_input != "approved":
        raise ExplainabilityError(
            "inconsistent state: executed=True but approval_input!='approved'."
        )
    if receipt_present and not executed:
        raise ExplainabilityError(
            "inconsistent state: a simulated receipt exists but executed=False."
        )
    if not receipt_present and executed:
        raise ExplainabilityError(
            "inconsistent state: executed=True but no simulated receipt id."
        )

    source_system = (event.source or "hubspot").split("_")[0] or "hubspot"
    external_reference = f"{source_system}:{event.portal_id}:{event.source_record_id}"

    return GovernedFacts(
        account_id=mission.account_id,
        account_display_name=event.account_ref,
        source_system=source_system,
        source_record_id=event.source_record_id,
        external_reference=external_reference,
        signal_type=f"{event.monitored_field}_change",
        signal_field=event.monitored_field,
        previous_value=event.old_value,
        current_value=event.new_value,
        direction=event.direction.value,
        movement_summary=_movement_summary(event),
        source_event_id=mission.source_event_id,
        change_fingerprint=mission.change_fingerprint,
        mission_id=mission.mission_id,
        mission_type=mission.mission_type,
        priority=mission.priority.value,
        rule_id=mission.rule_id,
        rule_version=mission.rule_version,
        template_id=mission.template_id,
        template_version=mission.template_version,
        governance_status=integration_result.governance_status,
        failure_code=integration_result.failure_code,
        identity_status=_identity_status(integration_result),
        approval_required=bool(integration_result.approval_required),
        approval_status=integration_result.approval_input,
        execution_status=status,
        executed=executed,
        replayed=bool(integration_result.replayed),
        receipt_present=receipt_present,
        ledger_reference=(
            integration_result.ledger_latest_record_id
            or integration_result.ledger_mission_id
        ),
        provenance_mode=provenance.value,
    )


# -- deterministic explanation -----------------------------------------------


def _provenance_note(facts: GovernedFacts) -> str:
    if facts.provenance_mode == ProvenanceMode.controlled_offline_corroborated.value:
        return (
            "Identity was resolved using a controlled, offline corroborating source for "
            "this proof -- this is not a live multi-source integration."
        )
    return "Identity rests on a single live source (HubSpot) only."


def _evidence_summary(facts: GovernedFacts) -> str:
    parts = [
        f"account {facts.account_display_name or facts.account_id} "
        f"({facts.external_reference})",
        f"signal {facts.signal_field}: {facts.previous_value} -> {facts.current_value} "
        f"({facts.direction})",
        f"event {facts.source_event_id}",
        f"fingerprint {facts.change_fingerprint}",
    ]
    if facts.ledger_reference:
        parts.append(f"ledger {facts.ledger_reference}")
    if facts.receipt_present:
        parts.append("simulated receipt recorded")
    return "; ".join(parts) + "."


def _deterministic_explanation(facts: GovernedFacts) -> Dict[str, str]:
    """Build the authoritative deterministic explanation text from governed state.

    Follows VentureOS principles: AI speaks first, narrative before metrics, exactly one
    recommendation, evidence visible, governed stop explained, advisory only, and
    understandable in under 60 seconds."""
    name = facts.account_display_name or facts.account_id
    mission_label = facts.mission_type.replace("_", "-")
    movement = facts.movement_summary

    if facts.execution_status == STOPPED_IDENTITY_UNVERIFIED:
        headline = f"{name}: {facts.priority}-priority {mission_label} mission stopped at identity."
        narrative = (
            f"{name}'s {movement}, creating a {facts.priority}-priority {mission_label} "
            f"mission. VentureOS stopped before execution because the account identity "
            f"was supported by only one trusted source. No action was taken."
        )
        governance = (
            f"Governed stop at identity resolution (failure code "
            f"{facts.failure_code or 'ambiguous_identity'}). {_provenance_note(facts)}"
        )
        recommended = (
            "Corroborate this account through a second governed source, then re-run the "
            "governed mission."
        )
        label = "Stopped -- identity not corroborated"
    elif facts.execution_status == STOPPED_AWAITING_APPROVAL:
        headline = f"{name}: {facts.priority}-priority {mission_label} mission awaiting your approval."
        narrative = (
            f"{name}'s {movement}, creating a {facts.priority}-priority {mission_label} "
            f"mission. Identity is corroborated, but no action has been taken: explicit "
            f"human approval is still required. No execution has occurred and no receipt exists."
        )
        governance = (
            f"Governed stop awaiting approval. {_provenance_note(facts)}"
        )
        recommended = (
            "Review the evidence and record an explicit approval decision; nothing runs "
            "until you approve."
        )
        label = "Awaiting approval"
    elif facts.execution_status == REJECTED:
        headline = f"{name}: {mission_label} mission rejected by human decision."
        narrative = (
            f"{name}'s {movement} created a {facts.priority}-priority {mission_label} "
            f"mission. A human explicitly rejected it, so no action was taken. The "
            f"rejection is preserved in the audit ledger."
        )
        governance = f"Human rejection recorded. {_provenance_note(facts)}"
        recommended = "No further action. The recorded rejection stands in the audit ledger."
        label = "Rejected by human decision"
    elif facts.execution_status == EXECUTED:
        replay = (
            " This was a safe replay of the prior governed result -- the same simulated "
            "receipt was reused and no duplicate action occurred."
            if facts.replayed
            else ""
        )
        headline = f"{name}: {mission_label} mission -- simulated execution complete."
        narrative = (
            f"{name}'s {movement} created a {facts.priority}-priority {mission_label} "
            f"mission. After explicit human approval, VentureOS ran the simulated action "
            f"exactly once and recorded a receipt.{replay} No CRM write-back has occurred."
        )
        governance = (
            f"Approved, then simulated execution only -- no HubSpot task and no CRM "
            f"write-back. {_provenance_note(facts)}"
        )
        recommended = (
            "Confirm the simulated receipt in the audit ledger; no live CRM change has "
            "been made."
        )
        label = "Replayed -- no duplicate execution" if facts.replayed else "Simulated execution complete"
    else:  # BLOCKED / FAILED and any other governed stop
        headline = f"{name}: {mission_label} mission did not proceed."
        narrative = (
            f"{name}'s {movement} created a {facts.priority}-priority {mission_label} "
            f"mission, but it did not proceed to execution. No action was taken."
        )
        governance = (
            f"Governed stop ({facts.execution_status}"
            + (f", {facts.failure_code}" if facts.failure_code else "")
            + f"). {_provenance_note(facts)}"
        )
        recommended = "Review the governed stop reason before any further step."
        label = "Did not proceed"

    return {
        "headline": headline,
        "narrative": narrative,
        "recommended_next_step": recommended,
        "governance_explanation": governance,
        "evidence_summary": _evidence_summary(facts),
        "status_label": label,
    }


# -- adapter-local groundedness validator (negation-aware) -------------------

_EXECUTION_CLAIMS = (
    "executed", "task created", "created a task", "created the task", "action taken",
    "action was taken", "has been sent", "i sent", "completed the action",
)
_WRITEBACK_CLAIMS = (
    "wrote back", "write-back complete", "writeback", "pushed to hubspot",
    "updated the crm", "crm write", "hubspot task created", "created a hubspot task",
    "real crm", "live crm change",
)
_APPROVAL_CLAIMS = ("approved", "approval granted", "sign-off received", "signed off")
_AUTHORITY_CLAIMS = (
    "automatically", "on your behalf", "without approval", "i approved",
    "no approval needed", "auto-executed", "auto executed", "autonomous",
)
_IDENTITY_VERIFIED_CLAIMS = (
    "identity verified", "identity confirmed", "identity is verified",
    "fully corroborated", "multi-source verified",
)
_PRIORITY_WORDS = ("low", "medium", "high", "critical")
_COMPETITOR_MISSION_TERMS = (
    "expansion mission", "reactivation mission", "upsell mission",
    "support escalation mission", "churn-save mission", "optimization mission",
)
_DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_NEGATORS = ("no ", "not ", "never ", "n't ", "without ", "awaiting ", "pending ", "before ")


def _asserts(text: str, needles) -> Optional[str]:
    for needle in needles:
        start = 0
        while True:
            idx = text.find(needle, start)
            if idx < 0:
                break
            window = text[max(0, idx - 16):idx]
            if not any(neg in window for neg in _NEGATORS):
                return needle
            start = idx + len(needle)
    return None


def validate_groundedness(text: str, facts: GovernedFacts) -> List[str]:
    """Return a list of groundedness violations for ``text`` against ``facts``.

    Governed-negation aware: "no action has been taken" is a denial, not a claim. An
    empty list means the narrative is grounded."""
    lowered = (text or "").strip().lower()
    violations: List[str] = []

    # False execution claim.
    hit = _asserts(lowered, _EXECUTION_CLAIMS)
    if hit and not facts.executed:
        violations.append(f"claims execution ({hit!r}) but execution_status={facts.execution_status!r}")

    # Real CRM write-back / HubSpot task is never legitimate in this phase.
    hit = _asserts(lowered, _WRITEBACK_CLAIMS)
    if hit:
        violations.append(f"claims real CRM write-back ({hit!r}); only simulated execution is permitted")

    # False approval claim.
    hit = _asserts(lowered, _APPROVAL_CLAIMS)
    if hit and facts.approval_status != "approved":
        violations.append(f"claims approval ({hit!r}) but approval_status={facts.approval_status!r}")

    # Autonomous-authority claim (never legitimate).
    hit = _asserts(lowered, _AUTHORITY_CLAIMS)
    if hit:
        violations.append(f"claims autonomous authority ({hit!r})")

    # False identity-verification claim.
    hit = _asserts(lowered, _IDENTITY_VERIFIED_CLAIMS)
    if hit and facts.identity_status == "unverified":
        violations.append(f"claims identity verified ({hit!r}) but identity_status='unverified'")

    # Fabricated dates: any ISO date must be governed evidence.
    allowed_dates = {facts.previous_value.strip(), facts.current_value.strip()}
    for found in _DATE_RE.findall(text or ""):
        if found not in allowed_dates:
            violations.append(f"asserts a date not in evidence: {found}")

    # Incorrect priority label.
    for word in _PRIORITY_WORDS:
        for pattern in (f"{word}-priority", f"{word} priority", f"{word}-risk priority"):
            if pattern in lowered and word != facts.priority:
                violations.append(f"asserts priority {word!r} but governed priority={facts.priority!r}")
                break

    # Incorrect / competing mission type.
    hit = _asserts(lowered, _COMPETITOR_MISSION_TERMS)
    if hit and facts.mission_type.replace("_", " ") not in hit:
        violations.append(f"asserts a different mission type ({hit!r}) than {facts.mission_type!r}")

    return violations


# -- public explanation boundary ---------------------------------------------


def _combined_text(fields: Dict[str, str]) -> str:
    return " \n".join(
        str(fields.get(key, ""))
        for key in (
            "headline", "narrative", "governance_explanation",
            "evidence_summary", "recommended_next_step",
        )
    )


def explain_governed_mission(
    facts: GovernedFacts,
    *,
    provider: Optional[ExplanationProvider] = None,
) -> ExplanationResult:
    """Produce ONE explanation for a governed mission outcome.

    The deterministic explanation is authoritative and always available. If an optional
    ``provider`` is supplied AND configured AND its reworded narrative passes the
    groundedness gate, the provider wording is used; otherwise the deterministic text is
    returned. A provider can never change a governed state field, and any provider error
    or ungrounded output falls back silently to the deterministic explanation."""
    base = _deterministic_explanation(facts)

    # No provider requested: deterministic-only (not a fallback -- the intended path).
    if provider is None:
        return _result(base, facts, provider_status="unconfigured",
                       provider_used=False, fallback_used=False,
                       validation_status="not_applicable", violations=[])

    # Provider present but not configured -> deterministic fallback (case F).
    try:
        configured = bool(provider.configured())
    except Exception:  # noqa: BLE001 - never let a provider destabilise the product
        configured = False
    if not configured:
        return _result(base, facts, provider_status="unconfigured",
                       provider_used=False, fallback_used=True,
                       validation_status="not_applicable", violations=[])

    # Provider error is contained -> deterministic fallback (case G).
    try:
        draft = provider.generate_explanation(facts.to_provider_context())
    except Exception:  # noqa: BLE001 - contain any provider failure
        return _result(base, facts, provider_status="error",
                       provider_used=False, fallback_used=True,
                       validation_status="not_applicable", violations=[])

    # Overlay wording only; product state fields are never taken from the provider.
    overlaid = dict(base)
    for key in ("headline", "narrative", "governance_explanation",
                "evidence_summary", "recommended_next_step"):
        value = getattr(draft, key, None)
        if isinstance(value, str) and value.strip():
            overlaid[key] = value.strip()

    violations = validate_groundedness(_combined_text(overlaid), facts)
    if violations:
        # Hallucination or authority leakage -> deterministic fallback (case H).
        return _result(base, facts, provider_status="configured",
                       provider_used=False, fallback_used=True,
                       validation_status="rejected", violations=violations)

    # Grounded provider wording accepted.
    return _result(overlaid, facts, provider_status="configured",
                   provider_used=True, fallback_used=False,
                   validation_status="grounded", violations=[])


def _result(
    fields: Dict[str, str],
    facts: GovernedFacts,
    *,
    provider_status: str,
    provider_used: bool,
    fallback_used: bool,
    validation_status: str,
    violations: List[str],
) -> ExplanationResult:
    return ExplanationResult(
        headline=fields["headline"],
        narrative=fields["narrative"],
        recommended_next_step=fields["recommended_next_step"],
        governance_explanation=fields["governance_explanation"],
        evidence_summary=fields["evidence_summary"],
        status_label=fields["status_label"],
        provider_status=provider_status,
        provider_used=provider_used,
        fallback_used=fallback_used,
        validation_status=validation_status,
        validation_violations=list(violations),
        governed_facts=facts,
    )


__all__ = [
    "EXPLAINABILITY_VERSION",
    "ExplainabilityError",
    "ProvenanceMode",
    "GovernedFacts",
    "ExplanationResult",
    "ProviderExplanationDraft",
    "ExplanationProvider",
    "build_governed_facts",
    "explain_governed_mission",
    "validate_groundedness",
]
