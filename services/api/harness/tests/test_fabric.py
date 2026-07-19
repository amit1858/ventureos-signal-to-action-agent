"""Customer Context Fabric tests (Release 2.2, Commit 3).

Plain-Python, no pytest. Covers deterministic identity resolution: name/domain/
crosswalk matching, canonical assembly, confidence, evidence, provenance,
conflict surfacing, fail-closed behaviour and planner integration.

Run directly:  python services/api/harness/tests/test_fabric.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, "..", ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.fabric import (  # noqa: E402
    RESOLUTION_THRESHOLD,
    SourceAccountRecord,
    ambiguous_source_records,
    cluster_records,
    default_source_records,
    name_key,
    normalize_account_name,
    normalize_domain,
    resolve_demo_account,
    resolve_identity,
)
from harness.planner import plan_mission_for_signals  # noqa: E402
from harness.policy_validator import validate  # noqa: E402
from harness.registries import (  # noqa: E402
    default_agent_registry,
    default_tool_registry,
)
from harness.templates import default_template_registry  # noqa: E402

_RESULTS: list[tuple[str, bool, str]] = []


def _check(name: str, condition: bool, detail: str = "") -> None:
    _RESULTS.append((name, bool(condition), detail))


# -- normalization ----------------------------------------------------------


def test_name_normalization() -> None:
    _check("name normalization drops legal suffix",
           normalize_account_name("Curefoods Inc.") == "curefoods")
    _check("name normalization is case/punct insensitive",
           name_key("CureFoods Private Limited") == "curefoods")


def test_domain_normalization() -> None:
    _check("domain normalization strips scheme/www/path",
           normalize_domain("https://www.Curefoods.com/accounts") == "curefoods.com")


# -- resolution -------------------------------------------------------------


def test_three_sources_resolve_to_one_account() -> None:
    res = resolve_demo_account()
    _check("three sources resolve (resolved=True)", res.resolved is True and res.blocked is False)
    _check("exactly one cluster found", res.clusters_found == 1)
    acct = res.canonical_account
    _check("canonical account produced", acct is not None)
    if acct is not None:
        _check("canonical draws on all three sources", len(acct.source_record_ids) == 3,
               str(acct.source_record_ids))


def test_stable_venture_os_id() -> None:
    a = resolve_demo_account().canonical_account
    b = resolve_identity(default_source_records()).canonical_account
    _check("venture os id is stable", a is not None and b is not None
           and a.venture_os_id == b.venture_os_id == "VOS-CUREFOODS",
           None if a is None else a.venture_os_id)
    _check("canonical name is stable", a is not None and a.canonical_name == "Curefoods",
           None if a is None else a.canonical_name)


def test_deterministic_confidence() -> None:
    c1 = resolve_demo_account().confidence
    c2 = resolve_identity(default_source_records()).confidence
    # crosswalk (0.5) + domain (0.3) + name (0.2) all corroborated -> 1.0
    _check("confidence is deterministic", c1 == c2)
    _check("full corroboration confidence == 1.0", c1 == 1.0, str(c1))


def test_evidence_lists_fields_and_records() -> None:
    res = resolve_demo_account()
    types = {ev.signal_type for ev in res.evidence}
    _check("evidence includes crosswalk/domain/name", types == {"crosswalk", "domain", "name"}, str(types))
    for ev in res.evidence:
        _check(f"evidence '{ev.signal_type}' cites >= 2 records", len(ev.source_records) >= 2,
               str(ev.source_records))


def test_provenance_identifies_field_sources() -> None:
    res = resolve_demo_account()
    prov = {p.field: p for p in res.provenance}
    # Salesforce has highest precedence, so single-owner + name come from it.
    _check("provenance records canonical_name source",
           "canonical_name" in prov and prov["canonical_name"].source_system == "salesforce")
    _check("provenance records owner source (salesforce only)",
           "owner" in prov and prov["owner"].source_system == "salesforce"
           and prov["owner"].value == "A. Rao")
    _check("every canonical field has provenance", len(res.provenance) >= 5, str(len(res.provenance)))


def test_conflicts_retained_and_surfaced() -> None:
    res = resolve_demo_account()
    conflict_fields = {c.field for c in res.conflicts}
    _check("industry conflict surfaced", "industry" in conflict_fields, str(conflict_fields))
    _check("region conflict surfaced", "region" in conflict_fields, str(conflict_fields))
    _check("arr conflict surfaced", "arr" in conflict_fields, str(conflict_fields))
    # Conflicting values are retained, not discarded.
    industry = next(c for c in res.conflicts if c.field == "industry")
    values = {v.value for v in industry.values}
    _check("both industry values retained", {"Food & Beverage", "Foodtech"}.issubset(values), str(values))
    _check("canonical_name not a conflict (normalized equal)", "canonical_name" not in conflict_fields)


def test_ambiguous_identity_fails_closed() -> None:
    res = resolve_identity(ambiguous_source_records())
    _check("ambiguous identity blocked", res.resolved is False and res.blocked is True)
    _check("ambiguous produces no canonical account", res.canonical_account is None)
    _check("ambiguous block reason is stable/non-empty", bool(res.block_reason))
    _check("ambiguous reason names conflicting crosswalk", "crosswalk" in (res.block_reason or ""),
           res.block_reason)


def test_unrelated_accounts_not_merged() -> None:
    # Curefoods (3) + one unrelated Acme record.
    from harness.fabric import hubspot_fixtures

    records = default_source_records() + [hubspot_fixtures()[1]]  # HS-2002 Acme Robotics
    clusters = cluster_records(records)
    _check("unrelated account forms a separate cluster", len(clusters) == 2, str(len(clusters)))
    # Mixed input fails closed rather than wrongly merging Acme into Curefoods.
    res = resolve_identity(records)
    _check("mixed unrelated input fails closed", res.resolved is False and res.blocked is True)
    _check("no canonical account merges unrelated records", res.canonical_account is None)


def test_single_source_insufficient_corroboration() -> None:
    res = resolve_identity([default_source_records()[0]])
    _check("single source fails closed (no cross-source corroboration)",
           res.resolved is False and res.blocked is True)
    _check("single source confidence below threshold", res.confidence < RESOLUTION_THRESHOLD,
           str(res.confidence))


def test_byte_identical_output() -> None:
    a = resolve_identity(default_source_records()).model_dump_json(by_alias=True)
    b = resolve_identity(default_source_records()).model_dump_json(by_alias=True)
    _check("resolution serialization is byte-identical", a == b)
    _check("camelCase emitted on the boundary", "ventureOsId" in a and "sourceRecordIds" in a)


def test_planner_uses_canonical_account() -> None:
    res = resolve_demo_account()
    ref = res.canonical_ref()
    _check("canonical_ref returns a CanonicalAccountRef",
           ref is not None and ref.venture_os_id == "VOS-CUREFOODS")

    agents, tools, templates = (
        default_agent_registry(),
        default_tool_registry(),
        default_template_registry(),
    )
    renewal = plan_mission_for_signals(
        mission_id="M-CCF-RENEWAL",
        signals={"mission_type": "renewal_risk", "severity": "high", "signal_id": "SIG-1"},
        canonical_account=ref,
        agent_registry=agents,
        tool_registry=tools,
        template_registry=templates,
    )
    _check("renewal planning works with canonical account",
           renewal.template_id == "renewal-risk-parallel-v1"
           and renewal.mission_definition.canonical_account.venture_os_id == "VOS-CUREFOODS")
    pol_r = validate(renewal, agent_registry=agents, tool_registry=tools, template_registry=templates)
    _check("renewal plan passes policy with canonical account", pol_r.passed is True)

    support = plan_mission_for_signals(
        mission_id="M-CCF-SUPPORT",
        signals={"mission_type": "support_escalation", "severity": "critical", "signal_id": "SIG-2"},
        canonical_account=ref,
        agent_registry=agents,
        tool_registry=tools,
        template_registry=templates,
    )
    _check("support planning works with canonical account",
           support.template_id == "support-escalation-sequential-v1"
           and support.mission_definition.canonical_account.venture_os_id == "VOS-CUREFOODS")
    pol_s = validate(support, agent_registry=agents, tool_registry=tools, template_registry=templates)
    _check("support plan passes policy structurally with canonical account", pol_s.passed is True)


_TESTS = [
    test_name_normalization,
    test_domain_normalization,
    test_three_sources_resolve_to_one_account,
    test_stable_venture_os_id,
    test_deterministic_confidence,
    test_evidence_lists_fields_and_records,
    test_provenance_identifies_field_sources,
    test_conflicts_retained_and_surfaced,
    test_ambiguous_identity_fails_closed,
    test_unrelated_accounts_not_merged,
    test_single_source_insufficient_corroboration,
    test_byte_identical_output,
    test_planner_uses_canonical_account,
]


def run() -> tuple[int, int]:
    del _RESULTS[:]
    for test in _TESTS:
        try:
            test()
        except Exception as exc:  # noqa: BLE001
            _check(f"{test.__name__} raised", False, f"{type(exc).__name__}: {exc}")
    passed = sum(1 for _, ok, _ in _RESULTS if ok)
    failed = sum(1 for _, ok, _ in _RESULTS if not ok)
    for name, ok, detail in _RESULTS:
        status = "PASS" if ok else "FAIL"
        line = f"[{status}] {name}"
        if not ok and detail:
            line += f"  -- {detail}"
        print(line)
    print(f"\nFabric: {passed} passed, {failed} failed, {len(_RESULTS)} checks total")
    return passed, failed


if __name__ == "__main__":
    _, failed_count = run()
    sys.exit(1 if failed_count else 0)
