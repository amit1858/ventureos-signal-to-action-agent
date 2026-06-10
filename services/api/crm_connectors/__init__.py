"""Optional CRM connector layer for Signal-to-Action Agent.

The workflow core never imports a concrete CRM vendor; it depends only on the
:class:`CRMConnector` interface and the typed result models re-exported here.
Use :func:`get_crm_connector` to obtain the configured connector (HubSpot today).
"""

from __future__ import annotations

from functools import lru_cache

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

__all__ = [
    "ConnectorStatus",
    "SyncResult",
    "MappedDataset",
    "WritebackResult",
    "CRMConnector",
    "CRMError",
    "CRMDisabledError",
    "CRMConfigError",
    "CRMWritebackDisabledError",
    "CRMAuthError",
    "CRMScopeError",
    "CRMRequestError",
    "get_crm_connector",
]


@lru_cache(maxsize=1)
def get_crm_connector() -> CRMConnector:
    """Return the configured CRM connector.

    Reads the environment lazily so that importing this package never requires a
    token. Today this is always the HubSpot connector; the indirection keeps the
    vendor swappable, exactly like ``model_adapters``.
    """
    from crm_connectors.hubspot_connector import HubSpotConnector

    return HubSpotConnector()
