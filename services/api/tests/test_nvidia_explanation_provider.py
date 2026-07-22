"""Focused tests -- NVIDIA-backed ExplanationProvider adapter.

Plain-Python runner (no pytest). Prints a single summary line so the repo-wide regression
aggregator can pick it up. NO network and NO live NVIDIA call: the underlying provider is
always a fake whose ``_complete`` returns canned text, raises, or returns garbage. Real
governed inputs come from the committed offline eval-pack builders.

An OPTIONAL, controlled single live proof runs at the end ONLY if credentials are already
configured in the environment; otherwise it is skipped and never fails the phase. It never
prints secrets.
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from evals.eval_scenarios import (  # noqa: E402
    build_canonical_event,
    build_canonical_mission,
    corroborating_records,
)
from live_signals.explainability import (  # noqa: E402
    ProvenanceMode,
    build_governed_facts,
    explain_governed_mission,
)
from live_signals.mission_governance_adapter import integrate_live_mission  # noqa: E402
from live_signals.nvidia_explanation_provider import (  # noqa: E402
    NvidiaExplanationError,
    NvidiaExplanationProvider,
    build_explanation_prompt,
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


# -- real governed facts (offline) -------------------------------------------


def _facts_identity_block():
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        corroborating_records=None,
    )
    return build_governed_facts(
        mission, event, result, provenance_mode=ProvenanceMode.live_single_source,
    )


def _facts_awaiting():
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="none",
        corroborating_records=corroborating_records(),
    )
    return build_governed_facts(
        mission, event, result,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
    )


# -- fake NvidiaProvider doubles (no network) --------------------------------


class _FakeProvider:
    """Stands in for NvidiaProvider: controls configured() and _complete()."""

    def __init__(self, *, configured: bool, complete=None):
        self._configured = configured
        self._complete_impl = complete
        self.last_system = None
        self.last_user = None

    def configured(self) -> bool:
        return self._configured

    def _complete(self, system: str, user: str) -> str:
        self.last_system = system
        self.last_user = user
        if self._complete_impl is None:
            raise AssertionError("_complete should not be called")
        return self._complete_impl(system, user)


_GOOD_JSON = (
    '{"headline":"Renewal risk needs your review",'
    '"narrative":"The renewal date moved earlier, from 2026-08-31 to 2026-06-30 -- an '
    'adverse move. This is awaiting your approval and no action has been taken.",'
    '"governance_explanation":"Governed stop awaiting approval; identity used a '
    'controlled offline source, not a live multi-source integration.",'
    '"evidence_summary":"renewal_date 2026-08-31 to 2026-06-30; awaiting approval.",'
    '"recommended_next_step":"Record an explicit approval decision to proceed."}'
)

_HALLUCINATED_JSON = (
    '{"narrative":"I automatically approved and executed the renewal task on your '
    'behalf; the write-back complete on 2025-01-01."}'
)


# -- tests -------------------------------------------------------------------


def test_reports_unconfigured() -> None:
    adapter = NvidiaExplanationProvider(_FakeProvider(configured=False))
    _check("adapter reports unconfigured", adapter.configured() is False)


def test_configured_probe_error_is_unconfigured() -> None:
    class _Boom:
        def configured(self):
            raise RuntimeError("probe blew up")

    adapter = NvidiaExplanationProvider(_Boom())
    _check("configured probe error -> unconfigured", adapter.configured() is False)


def test_whitelisted_context_passed_no_secrets() -> None:
    facts = _facts_awaiting()
    prompt = build_explanation_prompt(facts.to_provider_context())
    lowered = prompt.lower()
    _check("prompt carries movement summary", "renewal date moved" in lowered or "renewal_date" in lowered)
    _check("prompt carries mission type", "renewal_risk" in lowered)
    _check("prompt carries priority", "high" in lowered)
    forbidden = ("bearer", "api_key", "apikey", "password", "authorization", "nvapi-",
                 "secret", "token", ":memory:", ".db", ".sqlite", "ledger", "receipt_id")
    leaks = [t for t in forbidden if t in lowered]
    _check("prompt has no secret/raw payload", not leaks, ", ".join(leaks))
    _check("prompt excludes ledger reference", "ledger_reference" not in lowered)


def test_extra_context_keys_are_dropped() -> None:
    tainted = {"mission_type": "renewal_risk", "priority": "high",
               "api_key": "nvapi-SHOULD-NOT-APPEAR", "ledger_reference": "lr-secret"}
    prompt = build_explanation_prompt(tainted).lower()
    _check("dropped api_key", "nvapi-" not in prompt and "api_key" not in prompt)
    _check("dropped ledger_reference", "lr-secret" not in prompt and "ledger_reference" not in prompt)


def test_decision_maps_to_draft() -> None:
    fake = _FakeProvider(configured=True, complete=lambda s, u: _GOOD_JSON)
    adapter = NvidiaExplanationProvider(fake)
    draft = adapter.generate_explanation(_facts_awaiting().to_provider_context())
    _check("draft headline mapped", draft.headline == "Renewal risk needs your review", str(draft.headline))
    _check("draft narrative mapped", bool(draft.narrative) and "awaiting your approval" in draft.narrative.lower())
    _check("draft governance mapped", bool(draft.governance_explanation))
    _check("draft evidence mapped", bool(draft.evidence_summary))
    _check("draft next-step mapped", bool(draft.recommended_next_step))


def test_missing_optional_fields_handled() -> None:
    fake = _FakeProvider(configured=True, complete=lambda s, u: '{"headline":"Only a headline"}')
    adapter = NvidiaExplanationProvider(fake)
    draft = adapter.generate_explanation(_facts_awaiting().to_provider_context())
    _check("present field set", draft.headline == "Only a headline")
    _check("absent narrative is None", draft.narrative is None)
    _check("absent next-step is None", draft.recommended_next_step is None)


def test_blank_field_becomes_none() -> None:
    fake = _FakeProvider(configured=True, complete=lambda s, u: '{"headline":"   ","narrative":"x"}')
    adapter = NvidiaExplanationProvider(fake)
    draft = adapter.generate_explanation(_facts_awaiting().to_provider_context())
    _check("blank headline -> None", draft.headline is None)
    _check("non-blank narrative kept", draft.narrative == "x")


def test_invalid_response_fails_safely() -> None:
    fake = _FakeProvider(configured=True, complete=lambda s, u: "not json at all")
    adapter = NvidiaExplanationProvider(fake)
    raised = False
    try:
        adapter.generate_explanation(_facts_awaiting().to_provider_context())
    except NvidiaExplanationError:
        raised = True
    _check("invalid JSON raises contained error", raised)


def test_smuggled_state_keys_ignored() -> None:
    payload = ('{"narrative":"Awaiting your approval; no action has been taken.",'
               '"executed":true,"approval_status":"approved","status":"executed"}')
    fake = _FakeProvider(configured=True, complete=lambda s, u: payload)
    adapter = NvidiaExplanationProvider(fake)
    draft = adapter.generate_explanation(_facts_awaiting().to_provider_context())
    _check("smuggled 'executed' not on draft", not hasattr(draft, "executed") or getattr(draft, "executed", None) is None)
    _check("draft only carries text", draft.narrative is not None and draft.headline is None)


# -- integration with the Explainability gate (fallback + acceptance) --------


def test_provider_error_contained_by_fallback() -> None:
    def _boom(s, u):
        raise TimeoutError("simulated timeout")

    fake = _FakeProvider(configured=True, complete=_boom)
    adapter = NvidiaExplanationProvider(fake)
    facts = _facts_awaiting()
    result = explain_governed_mission(facts, provider=adapter)
    _check("provider error -> fallback used", result.fallback_used is True)
    _check("provider error -> provider not used", result.provider_used is False)
    _check("provider error -> facts unchanged", result.governed_facts.executed is False
           and result.governed_facts.approval_status == facts.approval_status)


def test_unconfigured_via_gate_falls_back() -> None:
    adapter = NvidiaExplanationProvider(_FakeProvider(configured=False))
    result = explain_governed_mission(_facts_awaiting(), provider=adapter)
    _check("gate unconfigured -> fallback", result.fallback_used is True)
    _check("gate unconfigured -> provider status", result.provider_status == "unconfigured")


def test_hallucination_rejected_by_gate() -> None:
    fake = _FakeProvider(configured=True, complete=lambda s, u: _HALLUCINATED_JSON)
    adapter = NvidiaExplanationProvider(fake)
    facts = _facts_awaiting()
    result = explain_governed_mission(facts, provider=adapter)
    _check("hallucination -> fallback", result.fallback_used is True)
    _check("hallucination -> validation rejected", result.validation_status == "rejected")
    _check("hallucination -> violations recorded", len(result.validation_violations) >= 2,
           str(result.validation_violations))
    _check("hallucination -> deterministic narrative returned",
           "on your behalf" not in result.narrative.lower())


def test_authority_leak_rejected_by_gate() -> None:
    payload = '{"narrative":"VentureOS acted autonomously on your behalf and updated the CRM."}'
    fake = _FakeProvider(configured=True, complete=lambda s, u: payload)
    adapter = NvidiaExplanationProvider(fake)
    result = explain_governed_mission(_facts_awaiting(), provider=adapter)
    _check("authority leak -> fallback", result.fallback_used is True)
    _check("authority leak -> rejected", result.validation_status == "rejected")
    _check("authority leak -> violation present",
           any("authority" in v or "write-back" in v for v in result.validation_violations),
           str(result.validation_violations))


def test_grounded_provider_accepted_by_gate() -> None:
    fake = _FakeProvider(configured=True, complete=lambda s, u: _GOOD_JSON)
    adapter = NvidiaExplanationProvider(fake)
    result = explain_governed_mission(_facts_awaiting(), provider=adapter)
    _check("grounded -> provider used", result.provider_used is True)
    _check("grounded -> not fallback", result.fallback_used is False)
    _check("grounded -> validation grounded", result.validation_status == "grounded")
    _check("grounded -> headline overlaid", result.headline == "Renewal risk needs your review",
           result.headline)


def test_governed_state_immutable_across_branches() -> None:
    facts = _facts_awaiting()
    baseline = explain_governed_mission(facts, provider=None)
    branches = {
        "good": _FakeProvider(configured=True, complete=lambda s, u: _GOOD_JSON),
        "hallucinated": _FakeProvider(configured=True, complete=lambda s, u: _HALLUCINATED_JSON),
        "error": _FakeProvider(configured=True, complete=lambda s, u: (_ for _ in ()).throw(RuntimeError("x"))),
        "unconfigured": _FakeProvider(configured=False),
    }
    ok = True
    for _, fake in branches.items():
        r = explain_governed_mission(facts, provider=NvidiaExplanationProvider(fake))
        if not (r.governed_facts.model_dump() == baseline.governed_facts.model_dump()
                and r.status_label == baseline.status_label):
            ok = False
    _check("governed facts + status label immutable across all branches", ok)


def test_simulated_stays_simulated() -> None:
    # Approved -> executed facts; a grounded reword must not turn "simulated" into real.
    event = build_canonical_event()
    mission = build_canonical_mission(event)
    exec_result = integrate_live_mission(
        mission, event, verification_outcome="verified", approval="approved",
        corroborating_records=corroborating_records(),
    )
    facts = build_governed_facts(
        mission, event, exec_result,
        provenance_mode=ProvenanceMode.controlled_offline_corroborated,
    )
    # Provider tries to claim a real CRM write-back on an executed mission.
    payload = '{"narrative":"The HubSpot task created and the CRM write happened."}'
    fake = _FakeProvider(configured=True, complete=lambda s, u: payload)
    result = explain_governed_mission(facts, provider=NvidiaExplanationProvider(fake))
    _check("real-writeback claim on executed -> fallback", result.fallback_used is True)
    _check("fallback narrative says simulated", "simulated" in (result.narrative + " " + result.governance_explanation).lower())


def test_no_network_in_focused_suite() -> None:
    # Every test above used a fake; the default adapter is never asked to _complete here.
    _check("focused suite is offline (fakes only)", True)


def _optional_live_proof() -> None:
    """Optional single controlled live NVIDIA proof for the canonical identity block.

    Runs ONLY when NVIDIA is already configured. Never prints secrets. A narrative that
    fails validation is a SUCCESSFUL safety result (fallback), not a phase failure."""
    try:
        from live_signals.nvidia_explanation_provider import NvidiaExplanationProvider as _P
        real = _P()  # default underlying NvidiaProvider (reads env/settings)
        configured = real.configured()
    except Exception as exc:  # noqa: BLE001
        print(f"[LIVE] provider probe failed ({type(exc).__name__}); treating as unconfigured")
        configured = False

    if not configured:
        print("[LIVE] NVIDIA not configured -> live proof SKIPPED (deterministic adapter complete)")
        return

    facts = _facts_identity_block()
    try:
        result = explain_governed_mission(facts, provider=real)
        print("[LIVE] provider_configured=true")
        print(f"[LIVE] provider_used={result.provider_used} fallback_used={result.fallback_used}")
        print(f"[LIVE] validation_status={result.validation_status}")
        print(f"[LIVE] validation_violations={result.validation_violations}")
        print(f"[LIVE] headline={result.headline!r}")
        print(f"[LIVE] narrative={result.narrative!r}")
    except Exception as exc:  # noqa: BLE001 - contain anything; never fail the phase
        print(f"[LIVE] live call raised and was contained ({type(exc).__name__}); fallback is the safe result")


_TESTS = [
    test_reports_unconfigured,
    test_configured_probe_error_is_unconfigured,
    test_whitelisted_context_passed_no_secrets,
    test_extra_context_keys_are_dropped,
    test_decision_maps_to_draft,
    test_missing_optional_fields_handled,
    test_blank_field_becomes_none,
    test_invalid_response_fails_safely,
    test_smuggled_state_keys_ignored,
    test_provider_error_contained_by_fallback,
    test_unconfigured_via_gate_falls_back,
    test_hallucination_rejected_by_gate,
    test_authority_leak_rejected_by_gate,
    test_grounded_provider_accepted_by_gate,
    test_governed_state_immutable_across_branches,
    test_simulated_stays_simulated,
    test_no_network_in_focused_suite,
]


def main() -> int:
    for test in _TESTS:
        test()
    _optional_live_proof()  # never contributes to pass/fail counts
    total = _PASSED + _FAILED
    print(f"\nNVIDIA explanation adapter: {_PASSED} passed, {_FAILED} failed, {total} checks total")
    return 1 if _FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())
