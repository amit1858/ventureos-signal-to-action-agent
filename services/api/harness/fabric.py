"""Enterprise Customer Context Fabric (Release 2.2, Commit 3).

The Fabric is the deterministic identity-resolution layer that runs BEFORE memory
retrieval and mission planning. It takes source account records fetched from
multiple CRMs (HubSpot, Salesforce, Dynamics) and resolves them into a single
canonical VentureOS account -- the ``CanonicalAccountRef`` the Mission Planner
already consumes.

Everything here is deterministic and offline:

* NO live CRM authentication, NO network access, NO writes back to any CRM.
* Source records are static fixtures modelling what connectors would return.
* Identity resolution is pure and byte-reproducible: name normalization, domain
  matching and external-id crosswalk matching only -- no model call, no clock, no
  randomness.
* It FAILS CLOSED. Ambiguous, conflicting or under-corroborated identities never
  produce a canonical account; they are blocked with a stable reason.

This module is additive and touches no protected engine.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Sequence, Tuple

from pydantic import Field

from harness.contracts import CanonicalAccountRef, HarnessModel

# -- tunables (deterministic constants) -------------------------------------

# Source precedence for canonical field selection. Highest precedence first.
SOURCE_PRECEDENCE: Tuple[str, ...] = ("salesforce", "hubspot", "dynamics")

# Signal weights used for the confidence score. A signal only contributes when it
# is CORROBORATED across >= 2 distinct source systems.
CROSSWALK_WEIGHT = 0.5
DOMAIN_WEIGHT = 0.3
NAME_WEIGHT = 0.2

# Minimum confidence for an identity to resolve. Below this the Fabric fails closed.
RESOLUTION_THRESHOLD = 0.5

# Legal / boilerplate suffix tokens dropped during account-name normalization.
_LEGAL_SUFFIXES = frozenset(
    {
        "inc", "llc", "ltd", "limited", "corp", "corporation", "co", "company",
        "pvt", "private", "gmbh", "plc", "sa", "ag", "llp", "group", "holdings",
    }
)

# Canonical field order -- fixed for deterministic provenance / conflict output.
_CANONICAL_FIELDS: Tuple[str, ...] = ("canonical_name", "domain", "industry", "region", "arr", "owner")


# -- normalization ----------------------------------------------------------


def normalize_account_name(name: Optional[str]) -> str:
    """Deterministically normalize an account name for matching.

    Lower-cases, strips punctuation, drops legal suffixes and collapses spaces.
    ``"Curefoods Inc."`` -> ``"curefoods"``.
    """
    if not name:
        return ""
    lowered = re.sub(r"[^a-z0-9]+", " ", str(name).lower())
    tokens = [t for t in lowered.split() if t and t not in _LEGAL_SUFFIXES]
    return " ".join(tokens)


def name_key(name: Optional[str]) -> str:
    """A spaceless key form of a normalized name (used for ids and matching)."""
    return normalize_account_name(name).replace(" ", "")


def normalize_domain(domain: Optional[str]) -> str:
    """Deterministically normalize a domain for matching.

    Strips scheme, ``www.``, any path and port. ``"https://www.Curefoods.com/x"``
    -> ``"curefoods.com"``.
    """
    if not domain:
        return ""
    value = str(domain).strip().lower()
    value = re.sub(r"^[a-z]+://", "", value)
    value = value.split("/", 1)[0]
    value = value.split(":", 1)[0]
    if value.startswith("www."):
        value = value[4:]
    return value


# -- source record model ----------------------------------------------------


class SourceAccountRecord(HarnessModel):
    """One account record as returned by a (simulated) CRM connector.

    ``external_ids`` is the crosswalk map -- shared keys such as ``duns`` or
    ``venture_os_ref`` let records from different systems be matched exactly.
    """

    source_system: str = Field(..., description="hubspot | salesforce | dynamics")
    source_record_id: str
    account_name: str
    domain: Optional[str] = None
    external_ids: Dict[str, str] = Field(default_factory=dict)
    industry: Optional[str] = None
    region: Optional[str] = None
    arr: Optional[float] = None
    owner: Optional[str] = None

    @property
    def ref(self) -> str:
        """Stable ``system:record_id`` handle used in evidence and provenance."""
        return f"{self.source_system}:{self.source_record_id}"


# -- resolution output models ----------------------------------------------


class MatchEvidence(HarnessModel):
    """One corroborated matching signal and the source records that agree on it."""

    signal_type: str = Field(..., description="crosswalk | domain | name")
    matched_value: str
    source_records: List[str] = Field(default_factory=list)
    weight: float = 0.0


class FieldProvenance(HarnessModel):
    """Which single source a canonical field value was taken from."""

    field: str
    value: Optional[str] = None
    source_system: str
    source_record_id: str


class ConflictValue(HarnessModel):
    source_system: str
    source_record_id: str
    value: Optional[str] = None


class FieldConflict(HarnessModel):
    """A field where sources disagree. All values are retained and surfaced."""

    field: str
    values: List[ConflictValue] = Field(default_factory=list)


class CanonicalAccount(HarnessModel):
    """The single governed identity produced from >= 2 corroborating sources."""

    venture_os_id: str
    canonical_name: str
    normalized_name: str
    domain: Optional[str] = None
    industry: Optional[str] = None
    region: Optional[str] = None
    arr: Optional[float] = None
    owner: Optional[str] = None
    source_record_ids: List[str] = Field(default_factory=list)

    def ref(self) -> CanonicalAccountRef:
        """The minimal cross-language ref the Mission Planner consumes."""
        return CanonicalAccountRef(
            venture_os_id=self.venture_os_id,
            canonical_name=self.canonical_name,
        )


class IdentityResolution(HarnessModel):
    """The deterministic outcome of resolving source records into one identity.

    ``resolved`` is ``True`` only for a single, unambiguous, sufficiently
    corroborated cluster. Otherwise ``blocked`` is ``True`` with a stable reason
    and ``canonical_account`` is ``None`` -- the Fabric fails closed.
    """

    resolved: bool = False
    blocked: bool = False
    block_reason: Optional[str] = None
    clusters_found: int = 0
    confidence: float = 0.0
    canonical_account: Optional[CanonicalAccount] = None
    evidence: List[MatchEvidence] = Field(default_factory=list)
    provenance: List[FieldProvenance] = Field(default_factory=list)
    conflicts: List[FieldConflict] = Field(default_factory=list)

    def canonical_ref(self) -> Optional[CanonicalAccountRef]:
        if self.canonical_account is None:
            return None
        return self.canonical_account.ref()


# -- clustering (deterministic union-find) ----------------------------------


def _sorted_records(records: Sequence[SourceAccountRecord]) -> List[SourceAccountRecord]:
    return sorted(records, key=lambda r: (r.source_system, r.source_record_id))


def _records_link(a: SourceAccountRecord, b: SourceAccountRecord) -> bool:
    """Two records link if they share a crosswalk id, a domain, or a name."""
    for key, value in a.external_ids.items():
        if value and b.external_ids.get(key) == value:
            return True
    da, db = normalize_domain(a.domain), normalize_domain(b.domain)
    if da and da == db:
        return True
    na, nb = name_key(a.account_name), name_key(b.account_name)
    if na and na == nb:
        return True
    return False


def cluster_records(records: Sequence[SourceAccountRecord]) -> List[List[SourceAccountRecord]]:
    """Group records into deterministic connected components by match links."""
    ordered = _sorted_records(records)
    n = len(ordered)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[max(rx, ry)] = min(rx, ry)

    for i in range(n):
        for j in range(i + 1, n):
            if _records_link(ordered[i], ordered[j]):
                union(i, j)

    groups: Dict[int, List[SourceAccountRecord]] = {}
    for idx, rec in enumerate(ordered):
        groups.setdefault(find(idx), []).append(rec)
    # Order clusters by their first (smallest-index) member for determinism.
    return [groups[root] for root in sorted(groups)]


# -- confidence + evidence --------------------------------------------------


def _corroborated_evidence(cluster: Sequence[SourceAccountRecord]) -> List[MatchEvidence]:
    """Evidence for signals agreed on by >= 2 distinct source systems."""
    evidence: List[MatchEvidence] = []

    # Crosswalk: (key, value) shared across >= 2 systems.
    crosswalk: Dict[Tuple[str, str], Dict[str, List[str]]] = {}
    for rec in cluster:
        for key, value in rec.external_ids.items():
            if not value:
                continue
            bucket = crosswalk.setdefault((key, value), {"systems": [], "refs": []})
            bucket["systems"].append(rec.source_system)
            bucket["refs"].append(rec.ref)
    for (key, value), bucket in sorted(crosswalk.items()):
        if len(set(bucket["systems"])) >= 2:
            evidence.append(
                MatchEvidence(
                    signal_type="crosswalk",
                    matched_value=f"{key}={value}",
                    source_records=sorted(bucket["refs"]),
                    weight=CROSSWALK_WEIGHT,
                )
            )

    # Domain shared across >= 2 systems.
    domains: Dict[str, Dict[str, List[str]]] = {}
    for rec in cluster:
        dom = normalize_domain(rec.domain)
        if not dom:
            continue
        bucket = domains.setdefault(dom, {"systems": [], "refs": []})
        bucket["systems"].append(rec.source_system)
        bucket["refs"].append(rec.ref)
    for dom, bucket in sorted(domains.items()):
        if len(set(bucket["systems"])) >= 2:
            evidence.append(
                MatchEvidence(
                    signal_type="domain",
                    matched_value=dom,
                    source_records=sorted(bucket["refs"]),
                    weight=DOMAIN_WEIGHT,
                )
            )

    # Normalized name shared across >= 2 systems.
    names: Dict[str, Dict[str, List[str]]] = {}
    for rec in cluster:
        nk = name_key(rec.account_name)
        if not nk:
            continue
        bucket = names.setdefault(nk, {"systems": [], "refs": []})
        bucket["systems"].append(rec.source_system)
        bucket["refs"].append(rec.ref)
    for nk, bucket in sorted(names.items()):
        if len(set(bucket["systems"])) >= 2:
            evidence.append(
                MatchEvidence(
                    signal_type="name",
                    matched_value=nk,
                    source_records=sorted(bucket["refs"]),
                    weight=NAME_WEIGHT,
                )
            )

    return evidence


def _confidence(evidence: Sequence[MatchEvidence]) -> float:
    """Sum of distinct corroborated signal-type weights, capped at 1.0."""
    weight_by_type = {"crosswalk": CROSSWALK_WEIGHT, "domain": DOMAIN_WEIGHT, "name": NAME_WEIGHT}
    present = {ev.signal_type for ev in evidence}
    total = sum(weight_by_type[t] for t in present)
    return round(min(1.0, total), 4)


# -- crosswalk conflict (fail-closed trigger) -------------------------------


def _crosswalk_conflict(cluster: Sequence[SourceAccountRecord]) -> Optional[str]:
    """Return a stable reason if a crosswalk key holds >1 distinct value."""
    by_key: Dict[str, set] = {}
    for rec in cluster:
        for key, value in rec.external_ids.items():
            if value:
                by_key.setdefault(key, set()).add(value)
    for key in sorted(by_key):
        if len(by_key[key]) > 1:
            values = ", ".join(sorted(by_key[key]))
            return f"conflicting crosswalk identifier '{key}': {values}"
    return None


# -- canonical assembly (precedence + provenance + conflicts) ---------------


def _field_comparable(field: str, value: object) -> str:
    if value is None or value == "":
        return ""
    if field == "canonical_name":
        return name_key(str(value))
    if field == "domain":
        return normalize_domain(str(value))
    if field == "arr":
        return str(value)
    return str(value).strip().lower()


def _source_value(rec: SourceAccountRecord, field: str) -> object:
    if field == "canonical_name":
        return rec.account_name
    if field == "domain":
        return normalize_domain(rec.domain) or None
    return getattr(rec, field, None)


def _precedence_index(source_system: str) -> int:
    try:
        return SOURCE_PRECEDENCE.index(source_system)
    except ValueError:
        return len(SOURCE_PRECEDENCE)


def _build_canonical(
    cluster: Sequence[SourceAccountRecord],
) -> Tuple[CanonicalAccount, List[FieldProvenance], List[FieldConflict]]:
    ordered = sorted(cluster, key=lambda r: (_precedence_index(r.source_system), r.source_record_id))

    provenance: List[FieldProvenance] = []
    conflicts: List[FieldConflict] = []
    chosen: Dict[str, object] = {}

    for field in _CANONICAL_FIELDS:
        # Chosen value: first non-empty by source precedence.
        picked: Optional[SourceAccountRecord] = None
        for rec in ordered:
            val = _source_value(rec, field)
            if val not in (None, ""):
                picked = rec
                break
        if picked is not None:
            picked_val = _source_value(picked, field)
            chosen[field] = picked_val
            provenance.append(
                FieldProvenance(
                    field=field,
                    value=None if picked_val is None else str(picked_val),
                    source_system=picked.source_system,
                    source_record_id=picked.source_record_id,
                )
            )

        # Conflict: >1 distinct comparable value across records that have one.
        contributors = [
            (rec, _source_value(rec, field))
            for rec in _sorted_records(cluster)
            if _source_value(rec, field) not in (None, "")
        ]
        distinct = {_field_comparable(field, v) for _, v in contributors}
        if len(distinct) > 1:
            conflicts.append(
                FieldConflict(
                    field=field,
                    values=[
                        ConflictValue(
                            source_system=rec.source_system,
                            source_record_id=rec.source_record_id,
                            value=None if v is None else str(v),
                        )
                        for rec, v in contributors
                    ],
                )
            )

    canonical_name = str(chosen.get("canonical_name") or "")
    nkey = name_key(canonical_name)

    # venture_os_id: a shared explicit crosswalk id wins; else derive from name.
    venture_os_id = _venture_os_id(cluster, nkey)

    arr_val = chosen.get("arr")
    account = CanonicalAccount(
        venture_os_id=venture_os_id,
        canonical_name=canonical_name,
        normalized_name=normalize_account_name(canonical_name),
        domain=(str(chosen["domain"]) if chosen.get("domain") else None),
        industry=(str(chosen["industry"]) if chosen.get("industry") else None),
        region=(str(chosen["region"]) if chosen.get("region") else None),
        arr=(float(arr_val) if arr_val not in (None, "") else None),
        owner=(str(chosen["owner"]) if chosen.get("owner") else None),
        source_record_ids=[rec.ref for rec in _sorted_records(cluster)],
    )
    return account, provenance, conflicts


def _venture_os_id(cluster: Sequence[SourceAccountRecord], nkey: str) -> str:
    explicit: set = set()
    for rec in cluster:
        val = rec.external_ids.get("venture_os_ref")
        if val:
            explicit.add(val)
    if len(explicit) == 1:
        return next(iter(explicit))
    return f"VOS-{nkey.upper()}" if nkey else "VOS-UNKNOWN"


# -- public resolution entry point ------------------------------------------


def resolve_identity(records: Sequence[SourceAccountRecord]) -> IdentityResolution:
    """Resolve source records into one canonical account, or fail closed.

    Deterministic and offline. Same inputs always produce byte-identical output.
    """
    clusters = cluster_records(records)

    if not clusters:
        return IdentityResolution(
            resolved=False, blocked=True, block_reason="no source records provided", clusters_found=0
        )

    if len(clusters) > 1:
        return IdentityResolution(
            resolved=False,
            blocked=True,
            block_reason=f"ambiguous identity: {len(clusters)} distinct account clusters found",
            clusters_found=len(clusters),
        )

    cluster = clusters[0]

    conflict_reason = _crosswalk_conflict(cluster)
    if conflict_reason is not None:
        return IdentityResolution(
            resolved=False, blocked=True, block_reason=conflict_reason, clusters_found=1
        )

    evidence = _corroborated_evidence(cluster)
    confidence = _confidence(evidence)
    if confidence < RESOLUTION_THRESHOLD:
        return IdentityResolution(
            resolved=False,
            blocked=True,
            block_reason=(
                f"insufficient corroboration: confidence {confidence} < threshold {RESOLUTION_THRESHOLD}"
            ),
            clusters_found=1,
            confidence=confidence,
            evidence=evidence,
        )

    account, provenance, conflicts = _build_canonical(cluster)
    return IdentityResolution(
        resolved=True,
        blocked=False,
        block_reason=None,
        clusters_found=1,
        confidence=confidence,
        canonical_account=account,
        evidence=evidence,
        provenance=provenance,
        conflicts=conflicts,
    )


# -- static fixtures (NVIDIA architecture proof, offline) -------------------


def hubspot_fixtures() -> List[SourceAccountRecord]:
    return [
        SourceAccountRecord(
            source_system="hubspot",
            source_record_id="HS-1001",
            account_name="Curefoods Inc.",
            domain="curefoods.com",
            external_ids={"duns": "8899-CF"},
            industry="Food & Beverage",
            region="APAC",
            arr=250000.0,
        ),
        SourceAccountRecord(
            source_system="hubspot",
            source_record_id="HS-2002",
            account_name="Acme Robotics",
            domain="acmerobotics.io",
            external_ids={"duns": "1234-AR"},
            industry="Industrial Automation",
            region="EMEA",
            arr=90000.0,
        ),
    ]


def salesforce_fixtures() -> List[SourceAccountRecord]:
    return [
        SourceAccountRecord(
            source_system="salesforce",
            source_record_id="SF-5555",
            account_name="Curefoods",
            domain="https://www.curefoods.com/accounts",
            external_ids={"duns": "8899-CF"},
            industry="Foodtech",
            region="India",
            arr=260000.0,
            owner="A. Rao",
        ),
    ]


def dynamics_fixtures() -> List[SourceAccountRecord]:
    return [
        SourceAccountRecord(
            source_system="dynamics",
            source_record_id="DY-7777",
            account_name="CureFoods Private Limited",
            domain="curefoods.com",
            external_ids={"duns": "8899-CF"},
            industry="Food & Beverage",
            arr=250000.0,
        ),
    ]


def default_source_records() -> List[SourceAccountRecord]:
    """The three-source Curefoods demo set that resolves to one canonical account."""
    return [
        hubspot_fixtures()[0],
        salesforce_fixtures()[0],
        dynamics_fixtures()[0],
    ]


def ambiguous_source_records() -> List[SourceAccountRecord]:
    """Two same-named records with conflicting crosswalk ids -> fails closed."""
    return [
        SourceAccountRecord(
            source_system="hubspot",
            source_record_id="HS-9001",
            account_name="Globex",
            domain="globex-hs.com",
            external_ids={"duns": "111-GX"},
        ),
        SourceAccountRecord(
            source_system="salesforce",
            source_record_id="SF-9002",
            account_name="Globex",
            domain="globex-sf.com",
            external_ids={"duns": "222-GX"},
        ),
    ]


def resolve_demo_account() -> IdentityResolution:
    """Resolve the built-in Curefoods demo set. Convenience for planning/tests."""
    return resolve_identity(default_source_records())


__all__ = [
    "SOURCE_PRECEDENCE",
    "CROSSWALK_WEIGHT",
    "DOMAIN_WEIGHT",
    "NAME_WEIGHT",
    "RESOLUTION_THRESHOLD",
    "normalize_account_name",
    "name_key",
    "normalize_domain",
    "SourceAccountRecord",
    "MatchEvidence",
    "FieldProvenance",
    "ConflictValue",
    "FieldConflict",
    "CanonicalAccount",
    "IdentityResolution",
    "cluster_records",
    "resolve_identity",
    "hubspot_fixtures",
    "salesforce_fixtures",
    "dynamics_fixtures",
    "default_source_records",
    "ambiguous_source_records",
    "resolve_demo_account",
]
