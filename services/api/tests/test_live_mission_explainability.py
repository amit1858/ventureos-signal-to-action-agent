"""Focused tests -- additive Explainability Layer (Phase 3).

Plain-Python runner (no pytest, no network, no live provider). Prints a single summary
line ``Explainability: N passed, N failed, N checks total`` so the repo-wide regression
aggregator can pick it up.

Every governed input is produced by the REAL offline flow (the frozen detector, the
deterministic mission selector, and the additive governance adapter over the protected
harness) via the committed evaluation-pack builders. Providers are always fakes.
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals.eval_scenarios import (  # noqa: E402
    ADVERSE_RENEWAL,
    BASELINE_RENEWAL,
    build_canonical_event,
    build_canonical_mission,
    corroborating_records,
)
from harness.audit_ledger import MissionAuditLedger
from harness.service import HarnessServiceDependencies
from live_signals.explainability import (
    ExplainabilityError,
    ExplanationProvider,
    ProviderExplanationDraft,
    ProvenanceMode,
    build_governed_facts,
    explain_governed_mission,
    validate_groundedness,
)
from live_signals.mission_governance_adapter import (
    EXECUTED,
    REJECTED,
    STOPPED_AWAITING_APPROVAL,
    STOPPED_IDENTITY_UNVERIFIED,
    LiveMissionIntegrationResult,
    integrate_live_mission,
)

_PASSED = 0
_FAILED = 0


def _check(label: str, condition: bool, detail: str = "") -> None:
    global _PASSED, _FAILED
    if condition:
        _PASSED += 1
        print(f"[PASS] {label}")
    else:
        _FAILED += 1
        print(f"[FAIL] {label} :: {detail}")


# -- real governed results (offline) -----------------------------------------


def _single_source_result():
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        corroborating_records=None,
    )
    return mission, event, result


def _corroborated_result(approval: str):
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval=approval,
        corroborating_records=corroborating_records(),
    )
    return mission, event, result


def _replay_result():
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    ledger = MissionAuditLedger(":memory:")
    deps = HarnessServiceDependencies(ledger=ledger)
    integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        dependencies=deps, corroborating_records=corroborating_records(),
    )
    second = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        dependencies=deps, corroborating_records=corroborating_records(),
    )
    ledger.close()
    return mission, event, second


def _facts_single_source():
    mission, event, result = _single_source_result()
    return build_governed_facts(
        mission, event, result, provenance_mode=ProvenanceMode.live_single_source,
    )


def _facts_awaiting():
    mission, event, result = _corroborated_result("none")
    return build_governed_facts(
        mission, event, result,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
    )


def _facts_rejected():
    mission, event, result = _corroborated_result("rejected")
    return build_governed_facts(
        mission, event, result,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
    )


def _facts_approved():
    mission, event, result = _corroborated_result("approved")
    return build_governed_facts(
        mission, event, result,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
    )


def _facts_replayed():
    mission, event, result = _replay_result()
    return build_governed_facts(
        mission, event, result,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
    )


# -- fake providers ----------------------------------------------------------


class _UnconfiguredProvider:
    def configured(self) -> bool:
        return False

    def generate_explanation(self, context):  # pragma: no cover - never called
        raise AssertionError("must not be called when unconfigured")


class _ErrorProvider:
    def configured(self) -> bool:
        return True

    def generate_explanation(self, context):
        raise RuntimeError("simulated provider failure")


class _HallucinationProvider:
    def configured(self) -> bool:
        return True

    def generate_explanation(self, context):
        return ProviderExplanationDraft(
            narrative=(
                "I automatically approved and executed the renewal task on your behalf; "
                "the write-back complete on 2025-01-01."
            ),
        )


class _AuthorityLeakProvider:
    def configured(self) -> bool:
        return True

    def generate_explanation(self, context):
        return ProviderExplanationDraft(
            narrative="VentureOS acted autonomously on your behalf and updated the CRM.",
        )


class _GroundedProvider:
    """Rewords the awaiting-approval facts truthfully."""

    def configured(self) -> bool:
        return True

    def generate_explanation(self, context):
        return ProviderExplanationDraft(
            headline="Renewal risk needs your review",
            narrative=(
                "The renewal date moved earlier, from 2026-08-31 to 2026-06-30 -- an "
                "adverse move. This is awaiting your approval and no action has been taken."
            ),
            recommended_next_step="Record an explicit approval decision to proceed.",
        )


class _StateTamperProvider:
    """Attempts to smuggle governed state through extra keys (must be ignored)."""

    def configured(self) -> bool:
        return True

    def generate_explanation(self, context):
        # extra="ignore" on the draft model drops any non-text field.
        return ProviderExplanationDraft.model_validate(
            {"narrative": "Awaiting your approval; no action has been taken.",
             "executed": True, "approval_status": "approved", "status": "executed"}
        )


# -- tests -------------------------------------------------------------------


def test_governed_facts_from_canonical_journey() -> None:
    facts = _facts_single_source()
    _check("facts account id", facts.account_id == "335064019691", facts.account_id)
    _check("facts source system", facts.source_system == "hubspot", facts.source_system)
    _check("facts external reference qualified",
           facts.external_reference == "hubspot:246820626:335064019691", facts.external_reference)
    _check("facts signal field", facts.signal_field == "renewal_date", facts.signal_field)
    _check("facts previous value", facts.previous_value == BASELINE_RENEWAL, facts.previous_value)
    _check("facts current value", facts.current_value == ADVERSE_RENEWAL, facts.current_value)
    _check("facts direction adverse", facts.direction == "adverse", facts.direction)
    _check("facts mission type", facts.mission_type == "renewal_risk", facts.mission_type)
    _check("facts priority high", facts.priority == "high", facts.priority)
    _check("facts movement mentions 62 days", "62 days earlier" in facts.movement_summary,
           facts.movement_summary)
    _check("facts identity unverified", facts.identity_status == "unverified", facts.identity_status)
    _check("facts execution status blocked-identity",
           facts.execution_status == STOPPED_IDENTITY_UNVERIFIED, facts.execution_status)
    _check("facts not executed", facts.executed is False)
    _check("facts provenance single-source",
           facts.provenance_mode == "live_single_source", facts.provenance_mode)


def test_broken_event_linkage_fails_closed() -> None:
    mission, event, result = _single_source_result()
    tampered = event.model_copy(update={"event_id": "SCE-DIFFERENT"})
    raised = False
    try:
        build_governed_facts(mission, tampered, result,
                             provenance_mode=ProvenanceMode.live_single_source)
    except ExplainabilityError:
        raised = True
    _check("broken event linkage fails closed", raised)


def test_broken_fingerprint_fails_closed() -> None:
    mission, event, result = _single_source_result()
    tampered = event.model_copy(update={"change_fingerprint": "sig1:TAMPERED"})
    raised = False
    try:
        build_governed_facts(mission, tampered, result,
                             provenance_mode=ProvenanceMode.live_single_source)
    except ExplainabilityError:
        raised = True
    _check("broken fingerprint fails closed", raised)


def test_invalid_provenance_fails_closed() -> None:
    mission, event, result = _single_source_result()
    raised = False
    try:
        build_governed_facts(mission, event, result, provenance_mode="not-a-mode")
    except ExplainabilityError:
        raised = True
    _check("invalid provenance fails closed", raised)


def test_inconsistent_state_fails_closed() -> None:
    mission, event, _ = _single_source_result()
    # executed True but approval was never granted -> must fail closed.
    bogus = LiveMissionIntegrationResult(
        status=EXECUTED, governance_status="completed", approval_input="none",
        verification_input="verified", executed=True, simulated_receipt_id="rcp-x",
        severity="high", ledger_mission_id=mission.mission_id,
    )
    raised = False
    try:
        build_governed_facts(mission, event, bogus,
                             provenance_mode=ProvenanceMode.controlled_offline_corroborated)
    except ExplainabilityError:
        raised = True
    _check("inconsistent approval/execution fails closed", raised)


def test_identity_block_explanation_truthful() -> None:
    facts = _facts_single_source()
    result = explain_governed_mission(facts)
    text = (result.narrative + " " + result.governance_explanation).lower()
    _check("identity block mentions identity", "identity" in text)
    _check("identity block mentions single source", "one trusted source" in text or "single" in text)
    _check("identity block says no action", "no action" in result.narrative.lower())
    _check("identity block advisory next step",
           "corroborate" in result.recommended_next_step.lower())
    _check("identity block status label",
           "identity" in result.status_label.lower())
    _check("identity block grounded", not validate_groundedness(
        result.narrative + " " + result.governance_explanation, facts))


def test_awaiting_approval_no_execution_claim() -> None:
    facts = _facts_awaiting()
    result = explain_governed_mission(facts)
    _check("awaiting status", facts.execution_status == STOPPED_AWAITING_APPROVAL,
           facts.execution_status)
    lowered = result.narrative.lower()
    _check("awaiting mentions approval required",
           "approval" in lowered and "required" in lowered)
    _check("awaiting says no action", "no action has been taken" in lowered)
    _check("awaiting grounded (no execution claim)",
           not validate_groundedness(result.narrative, facts))


def test_rejected_preserves_human_decision() -> None:
    facts = _facts_rejected()
    result = explain_governed_mission(facts)
    _check("rejected status", facts.execution_status == REJECTED, facts.execution_status)
    lowered = result.narrative.lower()
    _check("rejected mentions human rejection", "reject" in lowered)
    _check("rejected mentions audit ledger",
           "audit ledger" in lowered or "audit ledger" in result.governance_explanation.lower())
    _check("rejected not executed", facts.executed is False)
    _check("rejected grounded", not validate_groundedness(result.narrative, facts))


def test_approved_says_simulated_execution() -> None:
    facts = _facts_approved()
    result = explain_governed_mission(facts)
    _check("approved status executed", facts.execution_status == EXECUTED, facts.execution_status)
    lowered = (result.narrative + " " + result.governance_explanation).lower()
    _check("approved says simulated", "simulated" in lowered)
    _check("approved denies crm write-back", "no crm write-back" in lowered)
    _check("approved denies hubspot task", "no hubspot task" in lowered)
    _check("approved grounded", not validate_groundedness(
        result.narrative + " " + result.governance_explanation, facts))


def test_corroboration_never_live_multi_source() -> None:
    facts = _facts_approved()
    result = explain_governed_mission(facts)
    blob = (result.narrative + " " + result.governance_explanation).lower()
    _check("provenance is controlled offline",
           facts.provenance_mode == "controlled_offline_corroborated")
    _check("explanation states controlled/offline", "controlled" in blob and "offline" in blob)
    _check("explanation does NOT positively claim live multi-source",
           "live multi-source" not in blob or "not a live multi-source" in blob, blob)


def test_replay_states_no_duplicate() -> None:
    facts = _facts_replayed()
    result = explain_governed_mission(facts)
    _check("replay flagged", facts.replayed is True)
    lowered = result.narrative.lower()
    _check("replay says no duplicate",
           "no duplicate" in lowered and "replay" in lowered)
    _check("replay grounded", not validate_groundedness(result.narrative, facts))


def test_deterministic_without_provider() -> None:
    facts = _facts_awaiting()
    result = explain_governed_mission(facts, provider=None)
    _check("no-provider status unconfigured", result.provider_status == "unconfigured")
    _check("no-provider not used", result.provider_used is False)
    _check("no-provider not a fallback", result.fallback_used is False)
    _check("no-provider validation n/a", result.validation_status == "not_applicable")
    _check("no-provider has narrative", bool(result.narrative.strip()))


def test_provider_unconfigured_returns_fallback() -> None:
    facts = _facts_awaiting()
    result = explain_governed_mission(facts, provider=_UnconfiguredProvider())
    _check("unconfigured -> fallback used", result.fallback_used is True)
    _check("unconfigured provider not used", result.provider_used is False)
    _check("unconfigured provider status", result.provider_status == "unconfigured")


def test_provider_error_returns_fallback() -> None:
    facts = _facts_awaiting()
    result = explain_governed_mission(facts, provider=_ErrorProvider())
    _check("error -> fallback used", result.fallback_used is True)
    _check("error provider not used", result.provider_used is False)
    _check("error provider status", result.provider_status == "error")


def test_hallucination_rejected() -> None:
    facts = _facts_awaiting()
    result = explain_governed_mission(facts, provider=_HallucinationProvider())
    _check("hallucination -> fallback", result.fallback_used is True)
    _check("hallucination provider not used", result.provider_used is False)
    _check("hallucination validation rejected", result.validation_status == "rejected")
    _check("hallucination violations recorded", len(result.validation_violations) >= 2,
           str(result.validation_violations))
    # The returned text is the safe deterministic fallback, not the fabricated one.
    _check("hallucination narrative is deterministic",
           "on your behalf" not in result.narrative.lower())


def test_authority_leakage_rejected() -> None:
    facts = _facts_awaiting()
    result = explain_governed_mission(facts, provider=_AuthorityLeakProvider())
    _check("authority leak -> fallback", result.fallback_used is True)
    _check("authority leak rejected", result.validation_status == "rejected")
    _check("authority leak violation present",
           any("authority" in v or "write-back" in v for v in result.validation_violations),
           str(result.validation_violations))


def test_grounded_provider_accepted() -> None:
    facts = _facts_awaiting()
    result = explain_governed_mission(facts, provider=_GroundedProvider())
    _check("grounded provider used", result.provider_used is True)
    _check("grounded not fallback", result.fallback_used is False)
    _check("grounded validation grounded", result.validation_status == "grounded")
    _check("grounded headline overlaid", result.headline == "Renewal risk needs your review",
           result.headline)


def test_provider_cannot_change_state() -> None:
    facts = _facts_awaiting()
    deterministic = explain_governed_mission(facts, provider=None)
    tampered = explain_governed_mission(facts, provider=_StateTamperProvider())
    _check("state-tamper governed_facts unchanged",
           tampered.governed_facts.executed is False
           and tampered.governed_facts.approval_status == facts.approval_status
           and tampered.governed_facts.execution_status == facts.execution_status)
    _check("state-tamper status label is deterministic",
           tampered.status_label == deterministic.status_label, tampered.status_label)
    _check("state-tamper still grounded/accepted", tampered.validation_status == "grounded")


def test_no_secret_in_provider_context() -> None:
    facts = _facts_approved()
    ctx = facts.to_provider_context()
    joined = " ".join(str(k) + " " + str(v) for k, v in ctx.items()).lower()
    forbidden = ("bearer", "api_key", "apikey", "password", "authorization", "nvapi-",
                 "secret", "token", ":memory:", ".db", ".sqlite", "\\", "receipt_id")
    leaks = [t for t in forbidden if t in joined]
    _check("provider context has no secret/raw payload", not leaks, ", ".join(leaks))
    _check("provider context excludes ledger_reference", "ledger_reference" not in ctx)
    _check("provider context excludes account_id raw key", "account_id" not in ctx)


def test_output_is_voice_length() -> None:
    for builder in (_facts_single_source, _facts_awaiting, _facts_rejected,
                    _facts_approved, _facts_replayed):
        facts = builder()
        result = explain_governed_mission(facts)
        spoken = result.headline + ". " + result.narrative + " " + result.recommended_next_step
        words = len(spoken.split())
        _check(f"voice-length {facts.execution_status}", words <= 110, f"{words} words")


def test_parity_with_committed_eval_narrative() -> None:
    """Adapter-local validator must agree with the committed evals evaluator so the two
    never silently drift. Tests may import evals; production must not."""
    from evals.eval_narrative import evaluate_narrative

    facts = _facts_awaiting()
    nf = facts.narrative_facts()
    grounded = (
        "Curefoods' renewal moved earlier, from 2026-08-31 to 2026-06-30 -- an adverse "
        "signal. This is awaiting your approval; no action has been taken."
    )
    fabricated = (
        "I automatically approved and executed the renewal task on your behalf; "
        "the write-back complete on 2025-01-01."
    )
    local_g = not validate_groundedness(grounded, facts)
    eval_g = evaluate_narrative(grounded, nf).grounded
    local_b = not validate_groundedness(fabricated, facts)
    eval_b = evaluate_narrative(fabricated, nf).grounded
    _check("parity: grounded agrees", local_g == eval_g is True, f"{local_g} vs {eval_g}")
    _check("parity: fabricated agrees", local_b == eval_b is False, f"{local_b} vs {eval_b}")


_TESTS = [
    test_governed_facts_from_canonical_journey,
    test_broken_event_linkage_fails_closed,
    test_broken_fingerprint_fails_closed,
    test_invalid_provenance_fails_closed,
    test_inconsistent_state_fails_closed,
    test_identity_block_explanation_truthful,
    test_awaiting_approval_no_execution_claim,
    test_rejected_preserves_human_decision,
    test_approved_says_simulated_execution,
    test_corroboration_never_live_multi_source,
    test_replay_states_no_duplicate,
    test_deterministic_without_provider,
    test_provider_unconfigured_returns_fallback,
    test_provider_error_returns_fallback,
    test_hallucination_rejected,
    test_authority_leakage_rejected,
    test_grounded_provider_accepted,
    test_provider_cannot_change_state,
    test_no_secret_in_provider_context,
    test_output_is_voice_length,
    test_parity_with_committed_eval_narrative,
]


def main() -> int:
    for test in _TESTS:
        test()
    total = _PASSED + _FAILED
    print(f"\nExplainability: {_PASSED} passed, {_FAILED} failed, {total} checks total")
    return 1 if _FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
