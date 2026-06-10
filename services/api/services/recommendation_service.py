"""Recommendation service -- thin orchestration entry point for the API.

Loads the active model adapter, runs the orchestrator, persists the run to the
decision ledger (SQLite), and returns the typed API response.
"""

from __future__ import annotations

from datetime import datetime, timezone

from agents.orchestrator import Orchestrator
from model_adapters import get_model_adapter
from schemas.recommendation import RecommendationRequest, RecommendationResponse
from services import data_loader, ledger_service


def generate_recommendations(request: RecommendationRequest) -> RecommendationResponse:
    adapter = get_model_adapter()
    orchestrator = Orchestrator(adapter)

    recommendations, ledger = orchestrator.run(request.query, request.limit)

    # Stamp the active data source onto the ledger so the audit trail records
    # whether this run analysed the local synthetic dataset or a synced HubSpot
    # test portal. The orchestrator stays source-agnostic.
    source_label = data_loader.source_label()
    ledger.data_source = source_label
    if data_loader.active_source() == "hubspot":
        ledger.caveats.append("Accounts sourced from a HubSpot test CRM (synthetic demo records).")

    # Persist so approvals survive across requests and the trail is auditable.
    ledger_service.save_run(ledger, recommendations)

    return RecommendationResponse(
        query=request.query,
        recommendations=recommendations,
        decision_ledger=ledger,
        latency_ms=ledger.latency_ms,
        model_provider=ledger.model_provider,
        generated_at=datetime.now(timezone.utc),
        data_source=source_label,
    )
