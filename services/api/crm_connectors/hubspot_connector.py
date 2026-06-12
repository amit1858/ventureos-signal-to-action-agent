"""HubSpot CRM connector (test/sandbox portals only).

A dependency-free HubSpot client built on the standard library (``urllib``), in
the same spirit as the NVIDIA NIM adapter. It implements the
:class:`CRMConnector` interface:

* ``status`` / ``test_connection`` -- safe, read-only.
* ``sync_accounts``               -- read-only; maps companies -> internal schema.
* ``seed_demo_data`` / ``create_task`` / ``create_note`` -- writes, gated behind
  ``HUBSPOT_WRITEBACK_ENABLED`` (and, for task/note, human approval at the API).

Safety:
* The access token is read from the environment and sent only as a Bearer header.
  It is never returned in a result model, never logged, and never placed in an
  error message.
* Every error maps to a typed :class:`CRMError` with a UI-safe message.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from config import get_settings
from schemas.account import Account, Note
from schemas.signal import Signal

from crm_connectors import hubspot_mapper as mapper
from crm_connectors.base import (
    ConnectorStatus,
    CRMAuthError,
    CRMConfigError,
    CRMConnector,
    CRMDisabledError,
    CRMError,
    CRMRequestError,
    CRMScopeError,
    CRMWritebackDisabledError,
    MappedDataset,
    SyncResult,
    WritebackResult,
)

COMPANY_PROPERTIES = [
    "name",
    "industry",
    "city",
    "state",
    "country",
    "annualrevenue",
    "description",
] + [mapper.prop(p) for p in mapper.SCORE_PROPS + mapper.TEXT_PROPS]

# Transient HubSpot/gateway statuses worth retrying with backoff.
_RETRY_STATUSES = (429, 502, 503, 504)
_MAX_RETRIES = 4


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_ms() -> str:
    return str(int(time.time() * 1000))


class HubSpotConnector(CRMConnector):
    name = "hubspot"

    def __init__(self) -> None:
        s = get_settings()
        self.enabled = s.hubspot_enabled
        self.token = s.hubspot_token
        self.portal_id = s.hubspot_portal_id or None
        self.writeback_enabled = s.hubspot_writeback_enabled
        self.sync_limit = s.hubspot_sync_limit
        self.base_url = s.hubspot_base_url
        self.timeout = s.hubspot_timeout
        self._portal_attempted = False

    # -- gates ------------------------------------------------------------

    @property
    def configured(self) -> bool:
        return bool(self.token)

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise CRMDisabledError()

    def _require_configured(self) -> None:
        self._require_enabled()
        if not self.configured:
            raise CRMConfigError()

    def _require_writeback(self) -> None:
        self._require_configured()
        if not self.writeback_enabled:
            raise CRMWritebackDisabledError()

    # -- low-level HTTP ---------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> Tuple[int, dict]:
        url = f"{self.base_url}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        last_status, last_data = 0, {}
        for attempt in range(_MAX_RETRIES + 1):
            req = urllib.request.Request(
                url,
                data=data,
                method=method,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read().decode("utf-8")
                    return resp.status, (json.loads(raw) if raw else {})
            except urllib.error.HTTPError as exc:
                try:
                    parsed = json.loads(exc.read().decode("utf-8"))
                except (ValueError, OSError):
                    parsed = {}
                if exc.code in _RETRY_STATUSES and attempt < _MAX_RETRIES:
                    last_status, last_data = exc.code, parsed
                    self._sleep_backoff(attempt, exc.headers)
                    continue
                return exc.code, parsed
            except (urllib.error.URLError, TimeoutError):
                # Deliberately generic: never echo the URL/token in the message.
                if attempt < _MAX_RETRIES:
                    self._sleep_backoff(attempt, None)
                    continue
                raise CRMRequestError("Could not reach HubSpot. Check connectivity and the base URL.")
        return last_status, last_data

    @staticmethod
    def _sleep_backoff(attempt: int, headers) -> None:
        """Exponential backoff (0.5,1,2,4s, capped), honouring Retry-After when present."""
        delay = min(8.0, 0.5 * (2 ** attempt))
        if headers is not None:
            retry_after = headers.get("Retry-After")
            if retry_after:
                try:
                    delay = min(15.0, float(retry_after))
                except (TypeError, ValueError):
                    pass
        time.sleep(delay)

    def _checked(
        self,
        method: str,
        path: str,
        *,
        body: Optional[dict] = None,
        params: Optional[dict] = None,
        allow: Tuple[int, ...] = (),
    ) -> dict:
        status, data = self._request(method, path, body=body, params=params)
        if status in allow:
            return data
        if 200 <= status < 300:
            return data
        if status == 401:
            raise CRMAuthError()
        if status == 403:
            raise CRMScopeError()
        msg = ""
        if isinstance(data, dict):
            msg = str(data.get("message", ""))[:200]
        raise CRMRequestError(f"HubSpot returned HTTP {status}." + (f" {msg}" if msg else ""))

    # -- status / connection ----------------------------------------------

    def _base_status(self, connected: bool, message: str) -> ConnectorStatus:
        return ConnectorStatus(
            enabled=self.enabled,
            configured=self.configured,
            connected=connected,
            writeback_enabled=self.writeback_enabled,
            portal_id=self.portal_id,
            message=message,
        )

    def status(self) -> ConnectorStatus:
        if not self.enabled:
            return self._base_status(False, "HubSpot connector is available but not configured.")
        if not self.configured:
            return self._base_status(False, "Add HUBSPOT_ACCESS_TOKEN to enable test CRM integration.")
        return self._base_status(False, "Configured. Run Test connection to verify the token.")

    def test_connection(self) -> ConnectorStatus:
        self._require_configured()
        # One tiny, read-only call. 200 => connected.
        self._checked("GET", "/crm/v3/objects/companies", params={"limit": 1})
        self._resolve_portal_id()
        wb = " Write-back enabled." if self.writeback_enabled else " Write-back disabled (read-only)."
        return self._base_status(True, "Connected to HubSpot test portal." + wb)

    def _resolve_portal_id(self) -> None:
        """Best-effort: discover the portal id when not provided via env.

        Read-only and strictly non-failing -- if the account-info endpoint is
        unavailable (scope/plan), portal_id simply stays unset. The token is
        never exposed; only the numeric portal id (which appears in HubSpot
        deep-link URLs anyway) is stored.
        """
        if self.portal_id or self._portal_attempted:
            return
        self._portal_attempted = True
        try:
            status, data = self._request("GET", "/account-info/v3/details")
            if 200 <= status < 300 and isinstance(data, dict):
                pid = data.get("portalId") or data.get("hubId")
                if pid:
                    self.portal_id = str(pid)
        except CRMError:
            pass
        except Exception:
            pass

    # -- sync (read-only) -------------------------------------------------

    def sync_accounts(self, limit: int) -> Tuple[MappedDataset, SyncResult]:
        self._require_configured()
        cap = max(1, min(limit or self.sync_limit, self.sync_limit))

        self._resolve_portal_id()
        companies = self._list_objects(
            "companies", cap, properties=COMPANY_PROPERTIES
        )

        key = mapper.prop("account_id")
        accounts: List[Account] = []
        signals: List[Signal] = []
        notes: List[Note] = []
        for company in companies:
            props = company.get("properties", {}) or {}
            name = (props.get("name") or "").strip().lower()
            # Skip portal/system companies that are not our demo data: the default
            # "HubSpot" sample company, or any blank-named company. Demo companies
            # always carry our s2a_account_id marker, so an unmarked blank/system
            # record is never part of the seeded portfolio.
            if not props.get(key) and name in ("", "hubspot"):
                continue
            account = mapper.company_to_account(company)
            accounts.append(account)
            sigs, nts = mapper.derive_context(account)
            signals.extend(sigs)
            notes.extend(nts)

        # Best-effort informational counts (do not fail sync on these).
        deals_loaded = self._safe_count("deals", cap)
        contacts_loaded = self._safe_count("contacts", cap)

        dataset = MappedDataset(accounts=accounts, signals=signals, notes=notes)
        result = SyncResult(
            companies_loaded=len(accounts),
            contacts_loaded=contacts_loaded or len(accounts),
            deals_loaded=deals_loaded,
            activities_loaded=len(signals) + len(notes),
            last_synced_at=_now_iso(),
            source="HubSpot test CRM",
            portal_id=self.portal_id,
            message=f"Synced {len(accounts)} companies from HubSpot test portal.",
        )
        return dataset, result

    def _list_objects(self, obj: str, cap: int, properties: Optional[List[str]] = None) -> List[dict]:
        results: List[dict] = []
        after: Optional[str] = None
        while len(results) < cap:
            params: Dict[str, object] = {"limit": min(100, cap - len(results))}
            if properties:
                params["properties"] = ",".join(properties)
            if after:
                params["after"] = after
            data = self._checked("GET", f"/crm/v3/objects/{obj}", params=params)
            batch = data.get("results", []) if isinstance(data, dict) else []
            results.extend(batch)
            after = (((data or {}).get("paging") or {}).get("next") or {}).get("after")
            if not after or not batch:
                break
        return results[:cap]

    def _safe_count(self, obj: str, cap: int) -> int:
        try:
            return len(self._list_objects(obj, min(cap, 100)))
        except Exception:
            return 0

    def _existing_companies(self) -> List[dict]:
        """All companies in the portal (capped), with ``name`` and our demo marker
        ``s2a_account_id`` -- used for name-based upsert and scoped cleanup."""
        return self._list_objects(
            "companies", self.sync_limit, properties=["name", mapper.prop("account_id")]
        )

    # -- seeding (write) --------------------------------------------------

    def seed_demo_data(
        self,
        accounts: List[Account],
        signals_by_account: Dict[str, List[Signal]],
        notes_by_account: Dict[str, List[Note]],
    ) -> SyncResult:
        self._require_writeback()

        custom_ok = self._ensure_custom_properties()

        # Build name->id (upsert key) and the set of companies we previously seeded
        # (they carry the s2a_account_id marker) so re-seeding updates in place and
        # never creates duplicates. Falls back to create-only on a non-auth read error.
        by_name: Dict[str, str] = {}
        demo_ids: Dict[str, str] = {}
        marker = mapper.prop("account_id")
        if custom_ok:
            try:
                for c in self._existing_companies():
                    p = c.get("properties", {}) or {}
                    cid = str(c.get("id", ""))
                    nm = (p.get("name") or "").strip().lower()
                    if nm and nm not in by_name:
                        by_name[nm] = cid
                    if cid and p.get(marker):
                        demo_ids[cid] = nm
            except (CRMAuthError, CRMScopeError):
                raise
            except CRMError:
                by_name, demo_ids = {}, {}

        created = 0
        updated = 0
        contacts = 0
        deals = 0
        activities = 0
        skipped = 0
        kept_ids: set = set()

        for i, account in enumerate(accounts):
            props = mapper.account_to_company_properties(account, include_custom=custom_ok)
            nm = account.account_name.strip().lower()
            existing_id = by_name.get(nm)

            # Update an existing same-named company in place (no duplicate).
            if existing_id:
                try:
                    self._checked("PATCH", f"/crm/v3/objects/companies/{existing_id}", body={"properties": props})
                    updated += 1
                    kept_ids.add(existing_id)
                except (CRMAuthError, CRMScopeError):
                    raise
                except CRMRequestError:
                    skipped += 1
                continue

            try:
                result = self._checked("POST", "/crm/v3/objects/companies", body={"properties": props})
            except (CRMAuthError, CRMScopeError):
                # Systemic (token/scope) failure: abort fast rather than looping.
                raise
            except CRMRequestError:
                # Per-record / transient failure that survived retries: skip and continue.
                skipped += 1
                continue
            company_id = str(result.get("id", "")) if isinstance(result, dict) else ""
            if not company_id:
                skipped += 1
                continue
            created += 1
            by_name[nm] = company_id
            kept_ids.add(company_id)

            # One realistic contact per new company.
            if self._seed_contact(account, company_id):
                contacts += 1

            # Up to 3 notes carrying signal text -> HubSpot-side signal richness.
            for sig in signals_by_account.get(account.account_id, [])[:3]:
                body = f"[{sig.signal_type}] {sig.signal_description}"
                if self._seed_engagement("notes", {"hs_note_body": body, "hs_timestamp": _now_ms()}, company_id):
                    activities += 1

            # A deal for ~a third of companies (deterministic), favouring opportunity.
            if i % 3 == 0 or account.growth_potential_score >= 78:
                if self._seed_deal(account, company_id):
                    deals += 1

        # Scoped cleanup: archive previously-seeded demo companies (our marker) that
        # are no longer part of the target portfolio. Only runs when seeding mostly
        # succeeded, and never touches companies without our marker (e.g. the portal's
        # default sample company or any real record).
        total = created + updated
        archived = 0
        if total >= int(len(accounts) * 0.75):
            for cid in demo_ids:
                if cid in kept_ids:
                    continue
                try:
                    self._checked("DELETE", f"/crm/v3/objects/companies/{cid}")
                    archived += 1
                except CRMError:
                    pass

        mode = "custom properties" if custom_ok else "standard properties (deterministic scores on sync)"
        parts = []
        if created:
            parts.append(f"created {created}")
        if updated:
            parts.append(f"updated {updated}")
        if archived:
            parts.append(f"archived {archived} stale")
        detail = ", ".join(parts) if parts else "made no changes to"
        skipped_note = f" Skipped {skipped} on transient errors." if skipped else ""
        return SyncResult(
            companies_loaded=total,
            contacts_loaded=contacts,
            deals_loaded=deals,
            activities_loaded=activities,
            last_synced_at=_now_iso(),
            source="HubSpot test CRM",
            portal_id=self.portal_id,
            message=f"HubSpot demo portfolio reconciled by name: {detail} ({total} companies) using {mode}.{skipped_note}",
        )

    def _ensure_custom_properties(self) -> bool:
        """Best-effort create the property group + custom properties. Returns
        True if custom properties are usable, False to fall back to standard
        properties (e.g. when the token lacks schema-write scope)."""
        try:
            self._request(
                "POST",
                "/crm/v3/properties/companies/groups",
                body={"name": mapper.PROPERTY_GROUP, "label": "S2A Signal Intelligence"},
            )
            ok = False
            for definition in mapper.property_definitions():
                status, _ = self._request("POST", "/crm/v3/properties/companies", body=definition)
                if status in (200, 201, 409):  # created or already exists
                    ok = True
                elif status in (401, 403):
                    return False
            return ok
        except CRMError:
            return False
        except Exception:
            return False

    def _seed_contact(self, account: Account, company_id: str) -> bool:
        props = mapper.contact_for(account)
        status, created = self._request("POST", "/crm/v3/objects/contacts", body={"properties": props})
        if status not in (200, 201) or not isinstance(created, dict):
            return False
        contact_id = str(created.get("id", ""))
        if contact_id:
            self._associate("contacts", contact_id, "companies", company_id)
        return True

    def _seed_deal(self, account: Account, company_id: str) -> bool:
        props = mapper.deal_for(account)
        status, created = self._request("POST", "/crm/v3/objects/deals", body={"properties": props})
        if status not in (200, 201) or not isinstance(created, dict):
            return False
        deal_id = str(created.get("id", ""))
        if deal_id:
            self._associate("deals", deal_id, "companies", company_id)
        return True

    def _seed_engagement(self, obj: str, properties: dict, company_id: str) -> bool:
        status, created = self._request("POST", f"/crm/v3/objects/{obj}", body={"properties": properties})
        if status not in (200, 201) or not isinstance(created, dict):
            return False
        obj_id = str(created.get("id", ""))
        if obj_id:
            self._associate(obj, obj_id, "companies", company_id)
        return True

    def _associate(self, from_obj: str, from_id: str, to_obj: str, to_id: str) -> None:
        # v4 default association; best-effort (don't fail the whole seed on this).
        self._request(
            "PUT",
            f"/crm/v4/objects/{from_obj}/{from_id}/associations/default/{to_obj}/{to_id}",
        )

    # -- write-back (task / note) ----------------------------------------

    def create_task(self, *, account_id: str, account_name: str, title: str, body: str) -> WritebackResult:
        self._require_writeback()
        properties = {
            "hs_task_subject": title[:255],
            "hs_task_body": body,
            "hs_timestamp": _now_ms(),
            "hs_task_status": "NOT_STARTED",
            "hs_task_priority": "HIGH",
        }
        created = self._checked("POST", "/crm/v3/objects/tasks", body={"properties": properties})
        return self._writeback_result(
            obj="tasks",
            object_type="task",
            created=created,
            account_id=account_id,
            account_name=account_name,
            preview={"subject": title[:120], "body": body[:240]},
        )

    def create_note(self, *, account_id: str, account_name: str, body: str) -> WritebackResult:
        self._require_writeback()
        properties = {"hs_note_body": body, "hs_timestamp": _now_ms()}
        created = self._checked("POST", "/crm/v3/objects/notes", body={"properties": properties})
        return self._writeback_result(
            obj="notes",
            object_type="note",
            created=created,
            account_id=account_id,
            account_name=account_name,
            preview={"body": body[:240]},
        )

    def _writeback_result(
        self,
        *,
        obj: str,
        object_type: str,
        created: dict,
        account_id: str,
        account_name: str,
        preview: Dict[str, str],
    ) -> WritebackResult:
        external_id = str(created.get("id", "")) if isinstance(created, dict) else ""
        # Associate to the company when we have a HubSpot company id (numeric).
        if external_id and account_id.isdigit():
            self._associate(obj, external_id, "companies", account_id)
        created_at = (created.get("createdAt") if isinstance(created, dict) else None) or _now_iso()
        url = None
        if self.portal_id and external_id:
            type_id = "0-27" if object_type == "task" else "0-46"
            url = f"https://app.hubspot.com/contacts/{self.portal_id}/record/{type_id}/{external_id}"
        return WritebackResult(
            status="created",
            object_type=object_type,
            external_id=external_id,
            created_at=created_at,
            portal_id=self.portal_id,
            hubspot_url=url,
            account_id=account_id,
            account_name=account_name,
            payload_preview=preview,
        )
