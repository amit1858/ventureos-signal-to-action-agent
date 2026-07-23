"""Focused tests -- additive read-only Presentation Adapter + offline CLI presenter.

Plain-Python runner (no pytest, no network, no live provider). Prints a single summary
line ``Presentation adapter: N passed, N failed, N checks total`` so the repo-wide
regression aggregator can pick it up.

Every input is a serialized ``DemoJourneyResult`` fixture that was generated from the
REAL offline governed flow (not parsed from any Markdown report). The presentation layer
is a pure consumer: these tests prove it never claims more than the governed result
proved, hides technical detail by default, and performs no network / engine / provider /
ledger work.
"""

from __future__ import annotations

import ast
import contextlib
import io
import os
import socket
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

_FIXTURE_DIR = os.path.join(_HERE, "fixtures")
_FIXTURE_A = os.path.join(_FIXTURE_DIR, "demo_journey_live_single_source.json")
_FIXTURE_B = os.path.join(_FIXTURE_DIR, "demo_journey_controlled_execution.json")

from live_signals.demo_contracts import DemoJourneyResult  # noqa: E402
from live_signals.presentation import (  # noqa: E402
    FORBIDDEN_PHRASES,
    LABEL_AUDIT_VERIFIED,
    LABEL_CONTROLLED_OFFLINE,
    LABEL_DETERMINISTIC_FALLBACK,
    LABEL_HUMAN_APPROVED,
    LABEL_NO_CRM_WRITEBACK,
    LABEL_NVIDIA_GROUNDED,
    LABEL_NVIDIA_UNCONFIGURED,
    LABEL_REPLAY_NO_DUPLICATE,
    LABEL_SIMULATED_EXECUTION,
    LABEL_SINGLE_SOURCE_IDENTITY,
    STATUS_TONE_SUCCESS,
    PresentationEvidenceContext,
    PresentationViewModel,
    from_demo_journey_result,
)
from live_signals.presentation_cli import (  # noqa: E402
    load_fixture,
    main as cli_main,
    render_presentation,
)

_PASS = 0
_FAIL = 0


def _check(label: str, ok: bool) -> None:
    global _PASS, _FAIL
    if ok:
        _PASS += 1
        print(f"[PASS] {label}")
    else:
        _FAIL += 1
        print(f"[FAIL] {label}")


def _view_a() -> PresentationViewModel:
    return from_demo_journey_result(load_fixture(_FIXTURE_A))


def _view_b() -> PresentationViewModel:
    return from_demo_journey_result(load_fixture(_FIXTURE_B))


def _all_text(view: PresentationViewModel) -> str:
    parts = [
        view.headline, view.primary_narrative, view.recommendation,
        view.journey_label, view.governance_label, view.approval_label,
        view.execution_label, view.audit_label, view.replay_label,
        view.provider_label, view.source_result_reference,
    ]
    parts += view.evidence_items + view.safety_disclosures + view.technical_details
    return "\n".join(parts)


# 1. Journey A projection ------------------------------------------------------


def test_journey_a_projection():
    v = _view_a()
    _check("A headline mentions identity stop",
           "stopped at identity" in v.headline.lower())
    _check("A journey_label live single-source",
           "single-source" in v.journey_label.lower())
    _check("A narrative present", len(v.primary_narrative) > 20)
    _check("A recommendation advises corroboration",
           "corroborate" in v.recommendation.lower())


# 2. Journey B projection ------------------------------------------------------


def test_journey_b_projection():
    v = _view_b()
    _check("B headline mentions simulated execution",
           "simulated execution" in v.headline.lower())
    _check("B journey_label controlled",
           "controlled" in v.journey_label.lower())
    _check("B narrative mentions approval + simulated",
           "approval" in v.primary_narrative.lower()
           and "simulated" in v.primary_narrative.lower())


# 3. governed stop shown positively -------------------------------------------


def test_governed_stop_shown_positively():
    v = _view_a()
    _check("A status_tone success (governed stop positive)",
           v.status_tone == STATUS_TONE_SUCCESS)
    _check("A governance_label uses 'Governed stop'",
           "governed stop" in v.governance_label.lower())
    _check("A governance_label not an error/failure word",
           "error" not in v.governance_label.lower()
           and "failed" not in v.governance_label.lower())


# 4. human approval shown explicitly ------------------------------------------


def test_human_approval_explicit():
    v = _view_b()
    _check("B approval_label human approved",
           "human approved" in v.approval_label.lower())
    _check("B safety includes Human approved",
           LABEL_HUMAN_APPROVED in v.safety_disclosures)


# 5. simulated execution labelled ---------------------------------------------


def test_simulated_execution_labelled():
    v = _view_b()
    _check("B execution_label simulated",
           "simulated execution" in v.execution_label.lower())
    _check("B safety includes Simulated execution",
           LABEL_SIMULATED_EXECUTION in v.safety_disclosures)


# 6. no CRM write-back labelled -----------------------------------------------


def test_no_crm_writeback_labelled():
    for name, v in (("A", _view_a()), ("B", _view_b())):
        _check(f"{name} safety includes No CRM write-back",
               LABEL_NO_CRM_WRITEBACK in v.safety_disclosures)


# 7. controlled offline corroboration labelled --------------------------------


def test_controlled_offline_labelled():
    v = _view_b()
    _check("B safety includes Controlled offline corroboration",
           LABEL_CONTROLLED_OFFLINE in v.safety_disclosures)
    _check("B evidence mentions controlled offline source",
           any("controlled offline" in item.lower() for item in v.evidence_items))


# 8. live multi-source never claimed ------------------------------------------


def test_live_multi_source_never_claimed():
    for name, v in (("A", _view_a()), ("B", _view_b())):
        text = _all_text(v).lower()
        _check(f"{name} never claims live multi-source identity",
               "live multi-source identity" not in text)
    vb = _view_b()
    _check("B explicitly discloses NOT live multi-source",
           any("not live multi-source" in d.lower() for d in vb.safety_disclosures))


# 9. provider unconfigured labelled -------------------------------------------


def test_provider_unconfigured_labelled():
    for name, v in (("A", _view_a()), ("B", _view_b())):
        _check(f"{name} provider_label NVIDIA unconfigured",
               v.provider_label == LABEL_NVIDIA_UNCONFIGURED)


# 10 + 11. deterministic fallback / grounded NVIDIA mapping (synthetic edits) --


def test_provider_state_mappings():
    base = load_fixture(_FIXTURE_A)

    grounded = base.model_copy(deep=True)
    grounded.explanation = grounded.explanation.model_copy(
        update={"provider_used": True, "provider_status": "configured",
                "validation_status": "grounded"}
    )
    gv = from_demo_journey_result(grounded)
    _check("grounded provider -> NVIDIA grounded",
           gv.provider_label == LABEL_NVIDIA_GROUNDED)
    _check("grounded label implies no authority",
           "decided" not in gv.provider_label.lower()
           and "approved" not in gv.provider_label.lower())

    error = base.model_copy(deep=True)
    error.explanation = error.explanation.model_copy(
        update={"provider_used": False, "provider_status": "error",
                "fallback_used": True}
    )
    ev = from_demo_journey_result(error)
    _check("provider error -> Deterministic fallback",
           ev.provider_label == LABEL_DETERMINISTIC_FALLBACK)

    rejected = base.model_copy(deep=True)
    rejected.explanation = rejected.explanation.model_copy(
        update={"provider_used": False, "validation_status": "rejected"}
    )
    rv = from_demo_journey_result(rejected)
    _check("provider rejected wording -> Deterministic fallback",
           rv.provider_label == LABEL_DETERMINISTIC_FALLBACK)


# 12. audit verified labelled -------------------------------------------------


def test_audit_verified_labelled():
    vb = _view_b()
    _check("B audit_label verified", "verified" in vb.audit_label.lower())
    _check("B safety includes Audit verified",
           LABEL_AUDIT_VERIFIED in vb.safety_disclosures)


# 13. replay semantics -- never inferred from simulation ----------------------


def _validated_context() -> PresentationEvidenceContext:
    return PresentationEvidenceContext(
        replay_validated=True, receipt_reused=True,
        duplicate_action_prevented=True, audit_revalidated=True,
        validation_reference="controlled Stage-2 end-to-end validation",
    )


def test_replay_not_observed_without_context():
    vb = _view_b()  # no evidence context supplied
    _check("B replay label says not observed in this result",
           "not observed" in vb.replay_label.lower())
    _check("B replay makes no separate-validation claim without context",
           "validated separately" not in vb.replay_label.lower())
    _check("B replay not inferred from simulation (no no-duplicate disclosure)",
           LABEL_REPLAY_NO_DUPLICATE not in vb.safety_disclosures)


def test_replay_validated_with_context():
    vb = from_demo_journey_result(
        load_fixture(_FIXTURE_B), evidence_context=_validated_context()
    )
    _check("B replay validated-separately wording",
           "validated separately" in vb.replay_label.lower()
           and "no duplicate" in vb.replay_label.lower())
    _check("B safety includes Replay -- no duplicate action with context",
           LABEL_REPLAY_NO_DUPLICATE in vb.safety_disclosures)


def test_replay_never_inferred_from_simulation():
    r = load_fixture(_FIXTURE_B)
    _check("fixture B is simulated", r.simulated is True)
    _check("fixture B replayed flag is False",
           r.explanation.governed_facts.replayed is False)
    v = from_demo_journey_result(r)
    _check("simulation alone yields no replay-no-duplicate disclosure",
           LABEL_REPLAY_NO_DUPLICATE not in v.safety_disclosures)
    _check("simulation alone -> replay not observed",
           "not observed" in v.replay_label.lower())


def test_replay_observed_when_typed_evidence_present():
    r = load_fixture(_FIXTURE_B)
    mutated = r.model_copy(deep=True)
    mutated.explanation = mutated.explanation.model_copy(
        update={
            "governed_facts": mutated.explanation.governed_facts.model_copy(
                update={"replayed": True}
            )
        }
    )
    v = from_demo_journey_result(mutated)
    _check("typed replayed=True -> observed wording",
           "observed in this journey result" in v.replay_label.lower())
    _check("typed replayed=True -> safety no-duplicate present",
           LABEL_REPLAY_NO_DUPLICATE in v.safety_disclosures)


def test_evidence_context_is_presentation_only():
    r = load_fixture(_FIXTURE_B)
    before = r.model_dump_json(by_alias=True)
    _ = from_demo_journey_result(r, evidence_context=_validated_context())
    after = r.model_dump_json(by_alias=True)
    _check("evidence context never mutates the governed result", before == after)
    ctx = _validated_context()
    frozen = True
    try:
        ctx.replay_validated = False  # type: ignore[misc]
        frozen = False
    except Exception:
        frozen = True
    _check("evidence context is frozen (no authority mutation)", frozen)


def test_cli_replay_flag_behaviour():
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = cli_main(["--fixture", _FIXTURE_B, "--replay-validated"])
    out = buf.getvalue().lower()
    _check("CLI --replay-validated returns 0", rc == 0)
    _check("CLI --replay-validated renders validated separately",
           "validated separately" in out)
    buf2 = io.StringIO()
    with contextlib.redirect_stdout(buf2):
        cli_main(["--fixture", _FIXTURE_B])
    out2 = buf2.getvalue().lower()
    _check("CLI default renders replay not observed", "not observed" in out2)
    _check("CLI default does not claim validated separately",
           "validated separately" not in out2)


# 14. Journey A has no receipt presentation -----------------------------------


def test_journey_a_no_receipt():
    v = _view_a()
    _check("A execution_label says no execution",
           "no execution" in v.execution_label.lower())
    _check("A execution_label has no receipt claim",
           "receipt recorded" not in v.execution_label.lower())
    _check("A audit_label not applicable",
           "not applicable" in v.audit_label.lower())
    _check("A replay_label not applicable (nothing executed)",
           "not applicable" in v.replay_label.lower())
    _check("A safety omits Simulated execution",
           LABEL_SIMULATED_EXECUTION not in v.safety_disclosures)
    rendered = render_presentation(v)
    _check("A rendered default omits receipt",
           "receipt recorded" not in rendered.lower())


# 15 + 16. technical details hidden by default, shown with flag ----------------


def test_technical_details_visibility():
    v = _view_a()
    default = render_presentation(v, show_technical_details=False)
    withtech = render_presentation(v, show_technical_details=True)
    _check("default render hides Technical Details section",
           "Technical Details:" not in default)
    _check("default render hides failure_code",
           "ambiguous_identity" not in default)
    _check("flag render shows Technical Details section",
           "Technical Details:" in withtech)
    _check("flag render shows failure_code",
           "ambiguous_identity" in withtech)
    _check("failure_code only in technical_details projection",
           any("ambiguous_identity" in t for t in v.technical_details))


# 17. forbidden phrases absent ------------------------------------------------


def test_forbidden_phrases_absent():
    for name, v in (("A", _view_a()), ("B", _view_b())):
        for surface, text in (
            ("view", _all_text(v).lower()),
            ("render", render_presentation(v, show_technical_details=True).lower()),
        ):
            bad = [p for p in FORBIDDEN_PHRASES if p in text]
            _check(f"{name} {surface} has no forbidden phrase ({bad})", not bad)


# 18 + 19. fixtures: no secrets / no absolute paths ---------------------------


def test_fixtures_clean():
    secret_markers = ("nvapi-", "bearer ", "authorization", "api_key", "password",
                      "secret", "-----begin")
    path_markers = ("c:\\users", "/home/", "\\appdata\\", "/tmp/", ".sqlite",
                    "\\temp\\")
    for path in (_FIXTURE_A, _FIXTURE_B):
        raw = open(path, encoding="utf-8").read().lower()
        hits_s = [m for m in secret_markers if m in raw]
        hits_p = [m for m in path_markers if m in raw]
        _check(f"{os.path.basename(path)} no secret markers ({hits_s})", not hits_s)
        _check(f"{os.path.basename(path)} no absolute/temp path ({hits_p})", not hits_p)


# 20. fixtures parse as DemoJourneyResult -------------------------------------


def test_fixtures_parse():
    for path in (_FIXTURE_A, _FIXTURE_B):
        obj = load_fixture(path)
        _check(f"{os.path.basename(path)} parses to DemoJourneyResult",
               isinstance(obj, DemoJourneyResult))


# 21. builder is deterministic ------------------------------------------------


def test_builder_deterministic():
    r = load_fixture(_FIXTURE_B)
    v1 = from_demo_journey_result(r)
    v2 = from_demo_journey_result(r)
    _check("builder deterministic (equal view models)", v1 == v2)


# 22. builder does not mutate input -------------------------------------------


def test_builder_no_mutation():
    r = load_fixture(_FIXTURE_B)
    before = r.model_dump_json(by_alias=True)
    _ = from_demo_journey_result(r)
    after = r.model_dump_json(by_alias=True)
    _check("builder does not mutate input result", before == after)
    _check("view model is frozen (immutable)",
           _is_frozen(from_demo_journey_result(r)))


def _is_frozen(view: PresentationViewModel) -> bool:
    try:
        view.headline = "mutated"  # type: ignore[misc]
        return False
    except Exception:
        return True


# 23. CLI performs no network call --------------------------------------------


def test_cli_no_network():
    real_socket = socket.socket

    def _blocked(*args, **kwargs):
        raise AssertionError("presentation CLI attempted a network socket")

    socket.socket = _blocked  # type: ignore[assignment]
    try:
        rc = cli_main(["--fixture", _FIXTURE_A])
        _check("CLI runs with sockets blocked (no network)", rc == 0)
    finally:
        socket.socket = real_socket


# 24 + 25 + 26. CLI/module do not import engine / provider / ledger symbols ----


def _imported_symbols(path: str):
    tree = ast.parse(open(path, encoding="utf-8").read())
    modules, names = set(), set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                modules.add(a.name)
        elif isinstance(node, ast.ImportFrom):
            modules.add(node.module or "")
            for a in node.names:
                names.add(a.name)
    return modules, names


def test_presentation_imports_are_safe():
    forbidden_modules = {"requests", "httpx", "urllib", "urllib.request", "socket",
                         "http.client", "aiohttp"}
    forbidden_names = {"run_demo_journey", "integrate_live_mission", "execute_mission",
                       "generate_mission_for_event", "MissionAuditLedger",
                       "build_summary", "explain_governed_mission"}
    for path in (
        os.path.join(_API_DIR, "live_signals", "presentation.py"),
        os.path.join(_API_DIR, "live_signals", "presentation_cli.py"),
    ):
        modules, names = _imported_symbols(path)
        base = os.path.basename(path)
        bad_m = forbidden_modules & modules
        bad_n = forbidden_names & names
        _check(f"{base} imports no network module ({bad_m})", not bad_m)
        _check(f"{base} imports no engine/provider/ledger symbol ({bad_n})", not bad_n)


def test_cli_creates_no_ledger_file():
    prev = os.getcwd()
    tmp = tempfile.mkdtemp()
    os.chdir(tmp)
    try:
        cli_main(["--fixture", _FIXTURE_B, "--show-technical-details"])
        leftovers = [f for f in os.listdir(tmp)
                     if f.endswith((".sqlite", ".db", ".sqlite3"))]
        _check(f"CLI wrote no ledger/db file ({leftovers})", not leftovers)
    finally:
        os.chdir(prev)


# 27 + 28. additive-only intent (imports resolve; only new modules referenced) -


def test_additive_only_intent():
    # The presentation layer references existing contracts read-only and adds no
    # execution path. Proven structurally by the import-safety test above and by the
    # fact that constructing view models touches no external resource. Here we assert
    # the two new modules import cleanly without side effects beyond definitions.
    import importlib

    for mod in ("live_signals.presentation", "live_signals.presentation_cli"):
        m = importlib.import_module(mod)
        _check(f"{mod} imports cleanly", m is not None)


def main() -> int:
    tests = [
        test_journey_a_projection,
        test_journey_b_projection,
        test_governed_stop_shown_positively,
        test_human_approval_explicit,
        test_simulated_execution_labelled,
        test_no_crm_writeback_labelled,
        test_controlled_offline_labelled,
        test_live_multi_source_never_claimed,
        test_provider_unconfigured_labelled,
        test_provider_state_mappings,
        test_audit_verified_labelled,
        test_replay_not_observed_without_context,
        test_replay_validated_with_context,
        test_replay_never_inferred_from_simulation,
        test_replay_observed_when_typed_evidence_present,
        test_evidence_context_is_presentation_only,
        test_cli_replay_flag_behaviour,
        test_journey_a_no_receipt,
        test_technical_details_visibility,
        test_forbidden_phrases_absent,
        test_fixtures_clean,
        test_fixtures_parse,
        test_builder_deterministic,
        test_builder_no_mutation,
        test_cli_no_network,
        test_presentation_imports_are_safe,
        test_cli_creates_no_ledger_file,
        test_additive_only_intent,
    ]
    for t in tests:
        t()
    total = _PASS + _FAIL
    print(f"\nPresentation adapter: {_PASS} passed, {_FAIL} failed, {total} checks total")
    return 1 if _FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
