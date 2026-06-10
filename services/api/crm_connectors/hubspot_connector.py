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
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

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
    "annualrevenue",
    "description",
] + [mapper.prop(p) for p in mapper.SCORE_PROPS + mapper.TEXT_PROPS]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_ms() -> str:
    return str(int(time.time() * 1000))


class HubSpotConnector(CRMConnector):
    name = "hubspot"

    def __init__(self) -> None:
        self.enabled = os.getenv("HUBSPOT_ENABLED", "false").strip().lower() in ("1", "true", "yes")
        self.token = os.getenv("HUBSPOT_ACCESS_TOKEN", "").strip()
        self.portal_id = os.getenv("HUBSPOT_PORTAL_ID", "").strip() or None
        self.writeback_enabled = os.getenv("HUBSPOT_WRITEBACK_ENABLED", "false").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        self.sync_limit = int(os.getenv("HUBSPOT_SYNC_LIMIT", "100"))
        self.base_url = os.getenv("HUBSPOT_BASE_URL", "https://api.hubapi.com").rstrip("/")
        self.timeout = float(os.getenv("HUBSPOT_TIMEOUT", "30"))

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
            return exc.code, parsed
        except (urllib.error.URLError, TimeoutError):
            # Deliberately generic: never echo the URL/token in the message.
            raise CRMRequestError("Could not reach HubSpot. Check connectivity and the base URL.")

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
        wb = " Write-back enabled." if self.writeback_enabled else " Write-back disabled (read-only)."
        return self._base_status(True, "Connected to HubSpot test portal." + wb)

    # -- sync (read-only) -------------------------------------------------

    def sync_accounts(self, limit: int) -> Tuple[MappedDataset, SyncResult]:
        self._require_configured()
        cap = max(1, min(limit or self.sync_limit, self.sync_limit))

        companies = self._list_objects(
            "companies", cap, properties=COMPANY_PROPERTIES
        )

        accounts: List[Account] = []
        signals: List[Signal] = []
        notes: List[Note] = []
        for company in companies:
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

    # -- seeding (write) --------------------------------------------------

    def seed_demo_data(
        self,
        accounts: List[Account],
        signals_by_account: Dict[str, List[Signal]],
        notes_by_account: Dict[str, List[Note]],
    ) -> SyncResult:
        self._require_writeback()

        custom_ok = self._ensure_custom_properties()

        companies = 0
        contacts = 0
        deals = 0
        activities = 0

        for i, account in enumerate(accounts):
            props = mapper.account_to_company_properties(account, include_custom=custom_ok)
            created = self._checked("POST", "/crm/v3/objects/companies", body={"properties": props})
            company_id = str(created.get("id", "")) if isinstance(created, dict) else ""
            if not company_id:
                continue
            companies += 1

            # One contact per company.
            if self._seed_contact(account, company_id):
                contacts += 1

            # A note carrying the strongest signal text for ~every other account.
            sigs = signals_by_account.get(account.account_id, [])
            if sigs:
                body = sigs[0].signal_description
                if self._seed_engagement("notes", {"hs_note_body": body, "hs_timestamp": _now_ms()}, company_id):
                    activities += 1

            # A deal for higher-growth accounts.
            if account.growth_potential_score >= 60 and i % 2 == 0:
                if self._seed_deal(account, company_id):
                    deals += 1

        mode = "custom properties" if custom_ok else "standard properties (deterministic scores on sync)"
        return SyncResult(
            companies_loaded=companies,
            contacts_loaded=contacts,
            deals_loaded=deals,
            activities_loaded=activities,
            last_synced_at=_now_iso(),
            source="HubSpot test CRM",
            portal_id=self.portal_id,
            message=f"Seeded {companies} companies into HubSpot using {mode}.",
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
        slug = "".join(c for c in account.account_name.lower() if c.isalnum())[:24] or "contact"
        props = {
            "email": f"{slug}@example-test.invalid",
            "firstname": "Demo",
            "lastname": account.account_name,
            "company": account.account_name,
        }
        status, created = self._request("POST", "/crm/v3/objects/contacts", body=props)
        if status not in (200, 201) or not isinstance(created, dict):
            return False
        contact_id = str(created.get("id", ""))
        if contact_id:
            self._associate("contacts", contact_id, "companies", company_id)
        return True

    def _seed_deal(self, account: Account, company_id: str) -> bool:
        props = {
            "dealname": f"{account.account_name} — expansion (demo)",
            "amount": str(int(account.current_month_spend)),
            "pipeline": "default",
            "dealstage": "appointmentscheduled",
        }
        status, created = self._request("POST", "/crm/v3/objects/deals", body=props)
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
