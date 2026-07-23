"""Focused tests -- build-time web Demo Mode exporter (``presentation_web_export``).

Plain-Python runner (no pytest, no network, no provider, no ledger). Prints a single
summary line ``Web export: N passed, N failed, N checks total`` for the repo-wide
regression aggregator.

These tests prove the exporter faithfully projects the two committed governed fixtures
into a web-safe, camelCase document, preserves replay truthfulness exactly (never
inferring replay from simulation), stays in sync with the committed generated JSON
(golden ``--check``), and leaks no secret, path, CRM payload, or forbidden claim.
"""

from __future__ import annotations

import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_API_DIR = os.path.abspath(os.path.join(_HERE, ".."))  # tests/ -> services/api
if _API_DIR not in sys.path:
    sys.path.insert(0, _API_DIR)

from live_signals.presentation import (  # noqa: E402
    FORBIDDEN_PHRASES,
    PresentationViewModel,
)
from live_signals import presentation_web_export as exporter  # noqa: E402

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


_EXPECTED_CAMEL_FIELDS = {
    "schemaVersion",
    "headline",
    "primaryNarrative",
    "recommendation",
    "journeyLabel",
    "governanceLabel",
    "approvalLabel",
    "executionLabel",
    "evidenceItems",
    "auditLabel",
    "replayLabel",
    "providerLabel",
    "safetyDisclosures",
    "statusTone",
    "technicalDetails",
    "sourceResultReference",
}


def _doc():
    return exporter.build_document()


def _journey(doc, key):
    return next(j for j in doc["journeys"] if j["key"] == key)


def _view_text(view) -> str:
    parts = [
        view["headline"],
        view["primaryNarrative"],
        view["recommendation"],
        view["journeyLabel"],
        view["governanceLabel"],
        view["approvalLabel"],
        view["executionLabel"],
        view["auditLabel"],
        view["replayLabel"],
        view["providerLabel"],
        view["statusTone"],
        view["sourceResultReference"],
        *view["evidenceItems"],
        *view["safetyDisclosures"],
        *view["technicalDetails"],
    ]
    return "\n".join(parts)


# 1. document shape -----------------------------------------------------------


def test_document_shape():
    doc = _doc()
    _check("schemaVersion is 1.0", doc["schemaVersion"] == "1.0")
    _check("exactly two journeys", len(doc["journeys"]) == 2)
    _check("journey keys are a and b",
           sorted(j["key"] for j in doc["journeys"]) == ["a", "b"])
    _check("defaultJourneyKey is a", doc["defaultJourneyKey"] == "a")
    _check("generatedFrom lists both fixtures", len(doc["generatedFrom"]) == 2)


# 2. field parity: exactly the PresentationViewModel fields (camelCase) --------


def test_field_parity_with_view_model():
    # The set of camel field names must be exactly the number of model fields, and
    # every projected view must carry exactly the expected camelCase key set.
    model_field_count = len(PresentationViewModel.model_fields)
    _check("camel field map covers every model field",
           len(_EXPECTED_CAMEL_FIELDS) == model_field_count)
    doc = _doc()
    for j in doc["journeys"]:
        for label, view in (("default", j["view"]), ("replay", j["replayValidatedView"])):
            if view is None:
                continue
            keys = set(view.keys())
            _check(f"{j['key']}:{label} has exact camelCase field set",
                   keys == _EXPECTED_CAMEL_FIELDS)
            _check(f"{j['key']}:{label} has no snake_case contract key",
                   not any("_" in k for k in keys))


# 3. Journey A -- governed stop, no replay-validated view ----------------------


def test_journey_a_governed_stop():
    a = _journey(_doc(), "a")
    v = a["view"]
    _check("A toggle unsupported", a["supportsReplayEvidenceToggle"] is False)
    _check("A has no replayValidatedView", a["replayValidatedView"] is None)
    _check("A governance is a governed stop",
           "governed stop" in v["governanceLabel"].lower())
    _check("A approval not reached", "not reached" in v["approvalLabel"].lower())
    _check("A no execution", "no execution" in v["executionLabel"].lower())
    _check("A replay not applicable", "not applicable" in v["replayLabel"].lower())
    _check("A safety has No CRM write-back", "No CRM write-back" in v["safetyDisclosures"])
    _check("A safety has no replay-duplicate claim",
           "Replay -- no duplicate action" not in v["safetyDisclosures"])
    _check("A status tone success", v["statusTone"] == "success")


# 4. Journey B default -- simulated, replay NOT observed -----------------------


def test_journey_b_default():
    b = _journey(_doc(), "b")
    v = b["view"]
    _check("B toggle supported", b["supportsReplayEvidenceToggle"] is True)
    _check("B controlled offline corroboration disclosed",
           any("controlled offline" in e.lower() for e in v["evidenceItems"]))
    _check("B human approved", "human approved" in v["approvalLabel"].lower())
    _check("B simulated execution",
           "simulated execution" in v["executionLabel"].lower())
    _check("B audit verified", "audit chain verified" in v["auditLabel"].lower())
    _check("B replay NOT observed by default",
           "not observed" in v["replayLabel"].lower())
    _check("B default safety omits replay-duplicate claim",
           "Replay -- no duplicate action" not in v["safetyDisclosures"])
    _check("B safety has Not live multi-source execution",
           "Not live multi-source execution" in v["safetyDisclosures"])
    _check("B safety has No CRM write-back",
           "No CRM write-back" in v["safetyDisclosures"])


# 5. Journey B replay-validated view -- validated separately -------------------


def test_journey_b_replay_validated_view():
    b = _journey(_doc(), "b")
    rv = b["replayValidatedView"]
    _check("B has a replayValidatedView", rv is not None)
    _check("B replay-validated says validated separately",
           "validated separately" in rv["replayLabel"].lower())
    _check("B replay-validated safety includes replay-duplicate claim",
           "Replay -- no duplicate action" in rv["safetyDisclosures"])
    _check("B replay-validated still simulated (no upgrade to real)",
           "simulated execution" in rv["executionLabel"].lower())
    _check("B replay-validated still no CRM write-back",
           "No CRM write-back" in rv["safetyDisclosures"])


# 6. forbidden claims absent from every rendered string ------------------------


def test_forbidden_claims_absent():
    doc = _doc()
    for j in doc["journeys"]:
        for label, view in (("default", j["view"]), ("replay", j["replayValidatedView"])):
            if view is None:
                continue
            text = _view_text(view).lower()
            hits = [p for p in FORBIDDEN_PHRASES if p in text]
            _check(f"{j['key']}:{label} contains no forbidden claim ({hits})", not hits)


# 7. no secrets / local paths / CRM payloads in the document -------------------


def test_no_secret_or_path_leak():
    raw = exporter._serialize(_doc())
    secret_re = re.compile(
        r"nvapi-|Bearer |api[_-]?key|authorization|password|[A-Za-z]:\\\\|/home/|/tmp/",
        re.IGNORECASE,
    )
    _check("document has no secret markers", not secret_re.search(raw))
    _check("document has no windows abs path", "\\Users\\" not in raw)
    _check("document has no .sqlite/.db path",
           ".sqlite" not in raw and ".db\"" not in raw)


# 8. golden: on-disk generated JSON is in sync with a fresh build --------------


def test_generated_file_in_sync():
    _check("committed demo-journeys.generated.json matches --write output",
           exporter.check())


# 9. round-trip stability: build -> serialize -> parse -> equal ----------------


def test_round_trip_stable():
    doc = _doc()
    text = exporter._serialize(doc)
    parsed = json.loads(text)
    _check("serialized document round-trips to an equal object", parsed == doc)


def main() -> int:
    tests = [
        test_document_shape,
        test_field_parity_with_view_model,
        test_journey_a_governed_stop,
        test_journey_b_default,
        test_journey_b_replay_validated_view,
        test_forbidden_claims_absent,
        test_no_secret_or_path_leak,
        test_generated_file_in_sync,
        test_round_trip_stable,
    ]
    for t in tests:
        t()
    total = _PASS + _FAIL
    print(f"\nWeb export: {_PASS} passed, {_FAIL} failed, {total} checks total")
    return 1 if _FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
