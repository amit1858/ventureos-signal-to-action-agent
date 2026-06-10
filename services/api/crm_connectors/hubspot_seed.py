"""Seed a HubSpot test portal with the project's synthetic demo dataset.

Usage (from ``services/api``)::

    .venv\\Scripts\\python.exe crm_connectors/hubspot_seed.py

Requires, in the environment / ``.env``::

    HUBSPOT_ENABLED=true
    HUBSPOT_ACCESS_TOKEN=pat-...          # private-app token for a *test* portal
    HUBSPOT_WRITEBACK_ENABLED=true        # explicit write gate

This only ever writes synthetic, non-confidential records to a HubSpot test
instance. It never touches real customer data and never sends email.
"""

from __future__ import annotations

import os
import sys

# Allow running as a script: make the `services/api` dir importable.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional at runtime
    pass

from services import data_loader  # noqa: E402
from crm_connectors import get_crm_connector  # noqa: E402
from crm_connectors.base import CRMError  # noqa: E402


def main() -> int:
    connector = get_crm_connector()
    print("Signal-to-Action Agent — HubSpot demo seeding")
    print("-" * 52)

    status = connector.status()
    print(f"enabled            : {status.enabled}")
    print(f"configured (token) : {status.configured}")
    print(f"writeback enabled  : {status.writeback_enabled}")
    if status.portal_id:
        print(f"portal id          : {status.portal_id}")
    print()

    try:
        accounts = data_loader.synthetic_accounts()
        signals_by_account = data_loader.synthetic_signals_by_account()
        notes_by_account = data_loader.synthetic_notes_by_account()
    except data_loader.DataNotGeneratedError as exc:
        print(f"ERROR: {exc}")
        print("Run:  .venv\\Scripts\\python.exe ..\\..\\data\\generate_synthetic_data.py")
        return 2

    print(f"Loaded {len(accounts)} synthetic accounts to seed.")
    print("Pushing to HubSpot test portal (companies, contacts, notes, deals)...")
    try:
        result = connector.seed_demo_data(accounts, signals_by_account, notes_by_account)
    except CRMError as exc:
        print(f"\nSeeding stopped: {exc.message}")
        return 1

    print("\nSeed complete:")
    print(f"  companies  : {result.companies_loaded}")
    print(f"  contacts   : {result.contacts_loaded}")
    print(f"  deals      : {result.deals_loaded}")
    print(f"  activities : {result.activities_loaded}")
    print(f"  {result.message}")
    print("\nNext: start the API and POST /api/integrations/hubspot/sync, then run the workflow.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
