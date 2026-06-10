"""CRM connector layer -- the replaceable, *optional* customer-system boundary.

Mirrors the philosophy of ``model_adapters``: the workflow core never imports a
concrete CRM vendor. Everything talks to the :class:`CRMConnector` interface and
the typed result models below. Today the only implementation is HubSpot (test
instances), but the same interface could later wrap any CRM.

Hard safety rules encoded here:
* Reads (status, sync) are always safe.
* Writes (seed, task, note) require an explicit second gate
  (``HUBSPOT_WRITEBACK_ENABLED=true``) and, for task/note, prior human approval
  enforced at the API layer.
* Tokens are never placed in any result model, log line, or error message.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from schemas.account import Account, Note
from schemas.signal import Signal


# -- typed results --------------------------------------------------------


class ConnectorStatus(BaseModel):
    """Health/configuration snapshot for GET /api/integrations/hubspot/status."""

    provider: str = "hubspot"
    enabled: bool = Field(False, description="HUBSPOT_ENABLED master switch")
    configured: bool = Field(False, description="An access token is present")
    connected: bool = Field(False, description="A live test call succeeded")
    writeback_enabled: bool = Field(False, description="HUBSPOT_WRITEBACK_ENABLED gate")
    portal_id: Optional[str] = None
    message: str = ""


class SyncResult(BaseModel):
    """Outcome of POST /api/integrations/hubspot/sync (and of seeding)."""

    companies_loaded: int = 0
    contacts_loaded: int = 0
    deals_loaded: int = 0
    activities_loaded: int = 0
    last_synced_at: Optional[str] = None
    source: str = "HubSpot test CRM"
    portal_id: Optional[str] = None
    message: str = ""


class MappedDataset(BaseModel):
    """Internal-schema dataset produced by mapping HubSpot objects."""

    accounts: List[Account] = Field(default_factory=list)
    signals: List[Signal] = Field(default_factory=list)
    notes: List[Note] = Field(default_factory=list)


class WritebackResult(BaseModel):
    """Result of creating a HubSpot task/note after human approval."""

    status: str = "created"
    object_type: str = Field(..., description="task | note")
    external_id: Optional[str] = None
    created_at: Optional[str] = None
    connector: str = "hubspot"
    portal_id: Optional[str] = None
    hubspot_url: Optional[str] = None
    recommendation_id: str = ""
    account_id: str = ""
    account_name: str = ""
    approval_status: str = "approved"
    approved_at: Optional[str] = None
    payload_preview: Dict[str, str] = Field(default_factory=dict)
    safety_note: str = "Created in a HubSpot test instance after explicit human approval."


# -- errors ---------------------------------------------------------------


class CRMError(Exception):
    """Base for all connector errors. ``http_status`` maps cleanly to the API.

    ``message`` is always safe to surface to the UI (never contains secrets).
    """

    http_status: int = 502
    default_message: str = "CRM connector error."

    def __init__(self, message: Optional[str] = None):
        self.message = message or self.default_message
        super().__init__(self.message)


class CRMDisabledError(CRMError):
    http_status = 409
    default_message = "HubSpot connector is available but not enabled (set HUBSPOT_ENABLED=true)."


class CRMConfigError(CRMError):
    http_status = 409
    default_message = "Add HUBSPOT_ACCESS_TOKEN to enable the HubSpot test CRM integration."


class CRMWritebackDisabledError(CRMError):
    http_status = 409
    default_message = (
        "HubSpot write-back is disabled. Set HUBSPOT_WRITEBACK_ENABLED=true to allow "
        "seeding and approved task/note creation in the test instance."
    )


class CRMAuthError(CRMError):
    http_status = 502
    default_message = "HubSpot rejected the access token (401). Check the private-app token."


class CRMScopeError(CRMError):
    http_status = 502
    default_message = (
        "The HubSpot token is missing required scopes (403). See the README for the "
        "private-app scopes this integration needs."
    )


class CRMRequestError(CRMError):
    http_status = 502
    default_message = "The HubSpot request failed. The test instance may be unreachable."


# -- interface ------------------------------------------------------------


class CRMConnector(ABC):
    """Interface every CRM connector must implement."""

    name: str = "base"

    @abstractmethod
    def status(self) -> ConnectorStatus:
        """Config snapshot without making a network call (safe, cheap)."""

    @abstractmethod
    def test_connection(self) -> ConnectorStatus:
        """Make one lightweight live call and report connectivity."""

    @abstractmethod
    def seed_demo_data(
        self,
        accounts: List[Account],
        signals_by_account: Dict[str, List[Signal]],
        notes_by_account: Dict[str, List[Note]],
    ) -> SyncResult:
        """Push synthetic demo records into the CRM (requires write-back gate)."""

    @abstractmethod
    def sync_accounts(self, limit: int) -> Tuple[MappedDataset, SyncResult]:
        """Read CRM records and map them into the internal schema (read-only)."""

    @abstractmethod
    def create_task(
        self, *, account_id: str, account_name: str, title: str, body: str
    ) -> WritebackResult:
        """Create a follow-up task in the CRM (requires write-back gate)."""

    @abstractmethod
    def create_note(
        self, *, account_id: str, account_name: str, body: str
    ) -> WritebackResult:
        """Create a note in the CRM (requires write-back gate)."""
