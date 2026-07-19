"""Cross-language contract fixture generator (Release 2.2, Commit 10).

Produces the deterministic, canonical-JSON contract fixtures that pin the
Python <-> TypeScript boundary. Each fixture is generated from the REAL Python
service (``execute_mission``) over a canonical scenario -- never hand-authored --
so the committed fixtures are, by construction, a faithful serialization of the
governed ``HarnessServiceRequest`` / ``HarnessServiceResponse`` (and the nested
``MissionExecutionPayload``) that the TypeScript Mission BFF must consume.

Determinism guarantees:
  * fixed request_id / correlation_id / mission_id per fixture
  * fixed idempotency keys
  * injected (never wall-clock) timestamps
  * canonical JSON: sorted keys, 2-space indent, trailing newline, UTF-8
  * camelCase serialization (the wire contract) via ``model_dump(by_alias=True)``

The fixtures carry NO PersonaResponse, NO credentials, NO database paths, and
NO live-provider detail -- language is composed on the TypeScript side and never
crosses back into Python.

Usage:
    python services/api/harness/generate_contract_fixtures.py --write   # (re)write committed fixtures
    python services/api/harness/generate_contract_fixtures.py --check   # verify committed fixtures are current
    python services/api/harness/generate_contract_fixtures.py           # same as --check
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Callable, Dict, List, Tuple

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from harness.audit_ledger import MissionAuditLedger  # noqa: E402
from harness.evaluation import (  # noqa: E402
    ambiguous_account_blocked,
    approval_rejected,
    default_injected_timestamps,
    renewal_risk_happy_path,
    support_escalation_happy_path,
    unsupported_signal_blocked,
    verification_failed_revision,
)
from harness.service import (  # noqa: E402
    HarnessServiceDependencies,
    HarnessServiceRequest,
    HarnessServiceResponse,
    execute_mission,
)

FIXTURES_DIRNAME = os.path.join("fixtures", "contracts")
FIXTURES_DIR = os.path.join(_HERE, "fixtures", "contracts")

# The generator pins these; the scenario factories own the mission_id.
_FIXED_TIMESTAMPS = default_injected_timestamps()


def _request_dict(scenario, request_id: str, correlation_id: str,
                  idempotency_key: str, **overrides) -> HarnessServiceRequest:
    """Build a fully-pinned HarnessServiceRequest from a canonical scenario."""
    data = dict(
        request_id=request_id,
        correlation_id=correlation_id,
        scenario_id=scenario.scenario_id,
        mission_id=scenario.mission_id,
        mission_version=scenario.mission_version,
        signals=scenario.signals,
        source_records=scenario.source_records,
        actor=scenario.actor,
        actor_role=scenario.actor_role,
        approval=scenario.approval,
        approval_channel=scenario.approval_channel.value,
        verification_outcome=scenario.verification_outcome,
        request_revision_after_block=scenario.request_revision_after_block,
        inject_payload_mismatch=scenario.inject_payload_mismatch,
        replay_execution=scenario.replay_execution,
        injected_timestamps=dict(_FIXED_TIMESTAMPS),
        idempotency_key=idempotency_key,
    )
    data.update(overrides)
    return HarnessServiceRequest(**data)


def _envelope(request: HarnessServiceRequest, response: HarnessServiceResponse,
              name: str, description: str) -> dict:
    return {
        "name": name,
        "description": description,
        "request": request.model_dump(by_alias=True, mode="json"),
        "response": response.model_dump(by_alias=True, mode="json"),
    }


# -- individual fixture builders --------------------------------------------
# Each returns a wire-shaped envelope dict. All inputs are pinned; nothing
# depends on a clock, environment variable, network, or provider.


def _simple(name: str, description: str, scenario_factory: Callable) -> dict:
    scenario = scenario_factory()
    request = _request_dict(
        scenario,
        request_id=f"REQ-{name}",
        correlation_id=f"CORR-{name}",
        idempotency_key=f"IDEMP-{scenario.mission_id}",
    )
    response = execute_mission(request, HarnessServiceDependencies())
    return _envelope(request, response, name, description)


def _idempotency_conflict() -> dict:
    """A GENUINE durable idempotency collision: two governed missions share one
    caller-owned ledger and the same mission_id but carry different action
    payloads. The second receipt append collides and the service translates it
    into a typed ``idempotency_conflict`` error -- not a generic internal fault.
    Serialized fixture == the SECOND (colliding) request/response.
    """
    name = "error_idempotency_conflict"
    mission_id = "M-IDEMPOTENCY-CONFLICT"
    ledger = MissionAuditLedger(":memory:")
    try:
        deps = HarnessServiceDependencies(ledger=ledger)
        first_req = _request_dict(
            renewal_risk_happy_path(),
            request_id="REQ-idempotency-conflict-first",
            correlation_id="CORR-idempotency-conflict-first",
            idempotency_key=f"IDEMP-{mission_id}",
            mission_id=mission_id,
        )
        first = execute_mission(first_req, deps)
        if first.status != "completed":  # pragma: no cover - guards fixture intent
            raise RuntimeError(f"idempotency setup must complete first, got {first.status!r}")

        clash_req = _request_dict(
            support_escalation_happy_path(),
            request_id="REQ-idempotency-conflict",
            correlation_id="CORR-idempotency-conflict",
            idempotency_key=f"IDEMP-{mission_id}",
            mission_id=mission_id,
        )
        clash = execute_mission(clash_req, deps)
        return _envelope(
            clash_req, clash, name,
            "A genuine durable idempotency collision maps to a typed "
            "idempotency_conflict service error (HTTP 409), with no executable "
            "payload and no leaked stack trace, path, or SQL.",
        )
    finally:
        ledger.close()


def _internal_safe_failure() -> dict:
    """A closed caller-owned ledger forces an internal fault deep in evaluation.
    The service must fail closed with a BFF-safe ``internal_service_failure`` --
    no stack trace, no path, no SQL -- carrying only a coarse error category.
    """
    name = "error_internal_safe_failure"
    scenario = renewal_risk_happy_path()
    ledger = MissionAuditLedger(":memory:")
    ledger.close()  # deliberately closed BEFORE use to force a safe internal fault
    request = _request_dict(
        scenario,
        request_id=f"REQ-{name}",
        correlation_id=f"CORR-{name}",
        idempotency_key=f"IDEMP-{scenario.mission_id}-internal",
        mission_id="M-INTERNAL-SAFE-1",
    )
    response = execute_mission(request, HarnessServiceDependencies(ledger=ledger))
    return _envelope(
        request, response, name,
        "An internal fault is translated into a BFF-safe "
        "internal_service_failure error carrying only a coarse error category "
        "(no trace, no path, no SQL).",
    )


# Ordered (filename-prefixed) fixture registry.
_BUILDERS: List[Tuple[str, Callable[[], dict]]] = [
    ("01_completed_renewal_risk",
     lambda: _simple("completed_renewal_risk",
                     "A governance-valid renewal-risk mission: completed, "
                     "execution-eligible, with a MissionExecutionPayload.",
                     renewal_risk_happy_path)),
    ("02_completed_support_escalation",
     lambda: _simple("completed_support_escalation",
                     "A governance-valid support-escalation mission: completed, "
                     "execution-eligible, with a MissionExecutionPayload.",
                     support_escalation_happy_path)),
    ("03_blocked_unsupported_signal",
     lambda: _simple("blocked_unsupported_signal",
                     "An unsupported signal is blocked at template selection "
                     "(no_matching_template); no plan, agents, tools, approval, "
                     "or payload.",
                     unsupported_signal_blocked)),
    ("04_blocked_ambiguous_account",
     lambda: _simple("blocked_ambiguous_account",
                     "Ambiguous identity blocks before template selection "
                     "(ambiguous_identity); no canonical account fabricated, no "
                     "payload.",
                     ambiguous_account_blocked)),
    ("05_rejected_approval",
     lambda: _simple("rejected_approval",
                     "A verified mission whose human approval is rejected: "
                     "status rejected, no executable payload.",
                     approval_rejected)),
    ("06_revision_required",
     lambda: _simple("revision_required",
                     "Verification fails and a revision is requested: status "
                     "revision_required, no executable payload.",
                     verification_failed_revision)),
    ("07_error_idempotency_conflict", _idempotency_conflict),
    ("08_error_internal_safe_failure", _internal_safe_failure),
]


def canonical_json(obj: dict) -> str:
    """Canonical, byte-stable JSON: sorted keys, 2-space indent, UTF-8, newline."""
    return json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def build_all() -> Dict[str, str]:
    """Return an ordered mapping of ``<filename>.json -> canonical JSON text``,
    including a ``manifest.json`` index. Fully deterministic."""
    files: Dict[str, str] = {}
    manifest_entries: List[dict] = []
    for stem, builder in _BUILDERS:
        env = builder()
        filename = f"{stem}.json"
        files[filename] = canonical_json(env)
        response = env["response"]
        manifest_entries.append({
            "name": env["name"],
            "file": filename,
            "status": response["status"],
            "missionId": env["request"]["missionId"],
            "executionEligible": response["executionEligible"],
            "hasExecutionPayload": response.get("missionExecutionPayload") is not None,
            "resultHash": response["resultHash"],
        })

    manifest = {
        "schemaVersion": "1.0",
        "note": (
            "Deterministic Python-generated contract fixtures for the "
            "Harness <-> TypeScript boundary. Regenerate with "
            "generate_contract_fixtures.py --write; do not edit by hand."
        ),
        "fixtures": manifest_entries,
    }
    files["manifest.json"] = canonical_json(manifest)
    return files


def write_all(target_dir: str) -> List[str]:
    os.makedirs(target_dir, exist_ok=True)
    written: List[str] = []
    for filename, text in build_all().items():
        path = os.path.join(target_dir, filename)
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        written.append(filename)
    return written


def check_all(target_dir: str) -> Tuple[bool, List[str]]:
    """Compare freshly-generated fixtures against those committed on disk.
    Returns (ok, problems). Never writes."""
    generated = build_all()
    problems: List[str] = []

    if not os.path.isdir(target_dir):
        return False, [f"fixtures directory missing: {target_dir}"]

    on_disk = {f for f in os.listdir(target_dir) if f.endswith(".json")}
    expected = set(generated)
    for missing in sorted(expected - on_disk):
        problems.append(f"missing fixture on disk: {missing}")
    for extra in sorted(on_disk - expected):
        problems.append(f"stale fixture on disk (not generated): {extra}")

    for filename, text in generated.items():
        path = os.path.join(target_dir, filename)
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            current = handle.read()
        if current != text:
            problems.append(f"fixture drift: {filename} differs from generator output")

    return (not problems), problems


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate/verify contract fixtures.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--write", action="store_true", help="(re)write committed fixtures")
    group.add_argument("--check", action="store_true", help="verify committed fixtures are current")
    args = parser.parse_args(argv)

    if args.write:
        written = write_all(FIXTURES_DIR)
        print(f"wrote {len(written)} fixture files to {FIXTURES_DIR}")
        for name in written:
            print(f"  - {name}")
        return 0

    ok, problems = check_all(FIXTURES_DIR)
    if ok:
        print(f"OK: committed fixtures are current ({len(build_all())} files).")
        return 0
    print("DRIFT: committed fixtures are stale or missing:")
    for problem in problems:
        print(f"  - {problem}")
    print("Run: python services/api/harness/generate_contract_fixtures.py --write")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
