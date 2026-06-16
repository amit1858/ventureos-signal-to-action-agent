"""Signal-to-Action Agent -- FastAPI application.

Run from this directory:
    python -m uvicorn main:app --reload --port 8000

Endpoints:
    GET  /api/health
    GET  /api/meta
    GET  /api/system/status        (diagnostics: version, uptime, source, provider)
    GET  /api/system/config        (active configuration, secrets redacted)
    GET  /api/system/threads        (live threads + refresh-scheduler status)
    GET  /api/accounts
    GET  /api/accounts/{account_id}
    GET  /api/external-signals/{account_id}   (outside-in context for one account)
    GET  /api/external-signals/{account_id}/brief  (executive fusion narrative)
    POST /api/external-signals/refresh        (refresh priority accounts only)
    POST /api/recommendations
    POST /api/actions/{recommendation_id}/approve
    POST /api/actions/{recommendation_id}/reject
    GET  /api/integrations/hubspot/status
    POST /api/integrations/hubspot/seed
    POST /api/integrations/hubspot/sync
    POST /api/integrations/hubspot/use-synthetic
    POST /api/actions/{recommendation_id}/hubspot-task
    POST /api/actions/{recommendation_id}/hubspot-note
    GET  /api/actions/{recommendation_id}/writebacks

Startup / lifecycle:
    Configuration is centralised in ``config.py`` and validated at startup (missing
    config produces warnings, never crashes). If HUBSPOT_AUTO_SYNC_ON_STARTUP=true
    and the connector is enabled and configured, a best-effort, read-only sync runs
    in a background thread so a cold-started backend serves live CRM data without a
    manual sync. It never blocks startup, never seeds, never writes back, and falls
    back to synthetic data on any failure. When HUBSPOT_REFRESH_INTERVAL_SECONDS > 0
    a single background scheduler keeps the data fresh, keeping last-good data on any
    refresh failure (it never downgrades a live demo). See docs/OPERATIONS.md.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time

# Make this directory importable no matter how the server is launched.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from typing import Dict, Optional

from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

from config import configure_logging, get_settings  # noqa: E402

_settings = get_settings()
configure_logging(_settings.log_level)
logger = logging.getLogger("signal_to_action.api")

# Process start marker for uptime reporting (see /api/system/status).
_PROCESS_START = time.monotonic()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_STARTED_AT_ISO = _now_iso()


from model_adapters import get_model_adapter  # noqa: E402
from schemas.account import AccountDetail, AccountListResponse  # noqa: E402
from schemas.recommendation import (  # noqa: E402
    ApprovalStatus,
    Recommendation,
    RecommendationRequest,
    RecommendationResponse,
)
from services import data_loader, ledger_service  # noqa: E402
from services import scoring_service  # noqa: E402
from services.recommendation_service import generate_recommendations  # noqa: E402
from services.refresh_scheduler import RefreshScheduler  # noqa: E402
import external_signals  # noqa: E402
from external_signals import ExecutiveBrief, ExternalSignalsResult  # noqa: E402
import decision_providers  # noqa: E402
from decision_providers.base import ProviderCredential, ProviderDecision  # noqa: E402
from agents.orchestrator import AGENT_SEQUENCE  # noqa: E402
from crm_connectors import (  # noqa: E402
    ConnectorStatus,
    CRMError,
    SyncResult,
    WritebackResult,
    get_crm_connector,
)

API_VERSION = _settings.api_version

SUGGESTED_QUERIES = [
    "Which SMB accounts need attention this week and why?",
    "Which accounts have declining spend but high growth potential?",
    "Which accounts have support risk and should be escalated?",
    "Which accounts responded to campaigns but have no recent follow-up?",
    "Which renewal accounts need proactive engagement?",
    "Which accounts are most likely to grow next month?",
    "Which accounts should not be contacted yet and why?",
    "Which accounts need a support-led action instead of sales outreach?",
    "Which accounts have weak evidence and should be reviewed manually?",
    "What are the top 5 actions for this week?",
]

app = FastAPI(
    title="Signal-to-Action Agent API",
    description="Sovereign multi-agent workflow for explainable, human-approved next-best actions.",
    version=API_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


_scheduler: Optional[RefreshScheduler] = None


def _scheduled_refresh():
    """Refresh callable for the background scheduler.

    Respects a manual switch to synthetic: if an operator toggled the source to
    synthetic (e.g. to demo offline mode), the scheduler will not yank them back
    to HubSpot. Returns the SyncResult on a real refresh, or ``None`` when skipped.
    """
    if data_loader.active_source() != "hubspot":
        return None
    return _perform_hubspot_sync()


def _perform_hubspot_sync(limit: int = 0) -> SyncResult:
    """Read HubSpot companies and switch the active dataset to the synced records.

    Shared by the manual ``/sync`` endpoint and the optional startup auto-sync so
    the two paths can never drift. Read-only against HubSpot: it never seeds and
    never writes back tasks/notes.
    """
    connector = get_crm_connector()
    dataset, result = connector.sync_accounts(limit or connector.sync_limit)
    data_loader.set_hubspot_dataset(
        dataset.accounts,
        dataset.signals,
        dataset.notes,
        synced_at=result.last_synced_at,
        counts={
            "companies": result.companies_loaded,
            "contacts": result.contacts_loaded,
            "deals": result.deals_loaded,
            "activities": result.activities_loaded,
        },
        portal_id=result.portal_id,
        message=result.message,
    )
    return result


def _auto_sync_hubspot_on_startup() -> None:
    """Best-effort: switch the active source to HubSpot at boot.

    Lets a cold-started backend (e.g. Render free tier, which resets to synthetic
    on every restart) serve live CRM data without a manual sync. Safety contract:
    read-only (never seeds, never writes back), never raises, never blocks request
    serving, and never logs the token. On any failure the backend simply stays on
    the synthetic dataset.
    """
    connector = get_crm_connector()
    if not connector.enabled:
        logger.info("HubSpot auto-sync skipped: HUBSPOT_ENABLED is false; staying on synthetic data.")
        return
    if not connector.configured:
        logger.info("HubSpot auto-sync skipped: no access token configured; staying on synthetic data.")
        return
    logger.info("HubSpot connection configured; synchronizing companies, contacts and deals...")
    try:
        result = _perform_hubspot_sync()
        logger.info(
            "Loaded %s companies, %s contacts, %s deals, %s activities from HubSpot.",
            result.companies_loaded,
            result.contacts_loaded,
            result.deals_loaded,
            result.activities_loaded,
        )
        logger.info("Active source is now the HubSpot test CRM.")
    except CRMError as exc:
        logger.warning("HubSpot auto-sync failed (%s). Staying on synthetic data.", exc.message)
    except Exception as exc:  # noqa: BLE001 -- startup must never crash on connector issues
        logger.warning("HubSpot auto-sync error (%s). Staying on synthetic data.", exc)


@app.on_event("startup")
def _startup() -> None:
    logger.info("Application starting (version %s)...", API_VERSION)
    logger.info("Loading configuration...")
    for warning in _settings.warnings():
        logger.warning("Config: %s", warning)

    adapter = get_model_adapter()
    logger.info("Model provider ready: %s (%s).", adapter.provider, adapter.model)

    ledger_service.init_db()
    logger.info("Decision ledger ready (sqlite: %s).", os.path.basename(ledger_service.DB_PATH))

    logger.info("Checking HubSpot configuration...")
    if _settings.hubspot_auto_sync_on_startup and _settings.hubspot_ready:
        # Run off the startup path in a daemon thread so the server binds
        # immediately and the platform health check always succeeds, even if
        # HubSpot is slow. The active source flips to HubSpot once the read
        # completes (a few seconds later); until then it serves synthetic data.
        logger.info("HubSpot auto-sync enabled; starting background sync thread.")
        threading.Thread(
            target=_auto_sync_hubspot_on_startup,
            name="hubspot-auto-sync",
            daemon=True,
        ).start()
    elif _settings.hubspot_auto_sync_on_startup:
        logger.info(
            "HubSpot auto-sync requested but HubSpot is not enabled+configured; starting on synthetic data."
        )
    else:
        logger.info(
            "HubSpot auto-sync disabled (HUBSPOT_AUTO_SYNC_ON_STARTUP not true); starting on synthetic data."
        )

    global _scheduler
    _scheduler = RefreshScheduler(
        _scheduled_refresh, _settings.hubspot_refresh_interval_seconds, logger
    )
    if _settings.hubspot_refresh_interval_seconds > 0 and _settings.hubspot_ready:
        _scheduler.start()
    elif _settings.hubspot_refresh_interval_seconds > 0:
        logger.info(
            "Background refresh configured but HubSpot is not enabled+configured; refresh will not start."
        )

    logger.info("Backend ready.")


@app.on_event("shutdown")
def _shutdown() -> None:
    logger.info("Application shutting down...")
    if _scheduler is not None:
        _scheduler.stop()


# -- request/response helpers --------------------------------------------


class RejectRequest(BaseModel):
    reason: Optional[str] = None


class ActionResult(BaseModel):
    recommendation_id: str
    approval_status: ApprovalStatus
    message: str
    recommendation: Recommendation


class HubspotActionRequest(BaseModel):
    """Optional overrides for a HubSpot task/note write-back."""

    title: Optional[str] = None
    body: Optional[str] = None


# -- endpoints ------------------------------------------------------------


@app.get("/")
def root() -> dict:
    return {
        "name": "Signal-to-Action Agent API",
        "version": API_VERSION,
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
def health() -> dict:
    adapter = get_model_adapter()
    data_ready = True
    data_error = None
    try:
        data_loader.load_accounts()
    except data_loader.DataNotGeneratedError as exc:
        data_ready = False
        data_error = str(exc)
    return {
        "status": "ok" if data_ready else "degraded",
        "version": API_VERSION,
        "model_provider": adapter.provider,
        "model": adapter.model,
        "model_health": adapter.health(),
        "data_ready": data_ready,
        "data_error": data_error,
        "active_source": data_loader.active_source(),
        "agents": AGENT_SEQUENCE,
    }


@app.get("/api/meta")
def meta() -> dict:
    """Powers the UI left panel: dataset summary, providers, suggested queries."""
    adapter = get_model_adapter()
    try:
        summary = data_loader.dataset_summary()
    except data_loader.DataNotGeneratedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    sync = data_loader.sync_meta()
    return {
        "dataset": summary,
        "data_source": {
            "source": sync["source"],
            "source_label": sync["label"],
            "data_source_mode": sync["mode"],
            "last_synced_at": sync["synced_at"],
            "portal_id": sync["portal_id"],
            "counts": sync["counts"],
        },
        "model_provider": adapter.provider,
        "model": adapter.model,
        "agents": AGENT_SEQUENCE,
        "suggested_queries": SUGGESTED_QUERIES,
        "external_signals": external_signals.meta_block(),
        "scoring_weights": {
            "support_risk": 0.20,
            "spend_decline": 0.20,
            "growth_potential": 0.20,
            "renewal_urgency": 0.15,
            "campaign_response": 0.10,
            "engagement_gap": 0.10,
            "last_contact_gap": 0.05,
        },
    }


# -- system diagnostics (additive, read-only) -----------------------------


@app.get("/api/system/status")
def system_status(
    probe: bool = Query(False, description="Make one live HubSpot connectivity check"),
) -> dict:
    """Single source of truth for debugging the running backend.

    Aggregates version, uptime, active data source, HubSpot state, model provider
    and dataset counts. Non-blocking by default; pass ``?probe=true`` to make one
    live HubSpot read to confirm the token end-to-end.
    """
    adapter = get_model_adapter()
    connector = get_crm_connector()
    state = data_loader.runtime_state()

    data_ready = True
    data_error = None
    try:
        data_loader.load_accounts()
    except data_loader.DataNotGeneratedError as exc:
        data_ready = False
        data_error = str(exc)

    summary: dict = {}
    try:
        summary = data_loader.dataset_summary()
    except data_loader.DataNotGeneratedError:
        summary = {}

    # By default reflect the last successful sync (no network call). With probe,
    # confirm connectivity live but never let a failure raise.
    hubspot_connected = state["source"] == "hubspot"
    if probe and connector.configured and connector.enabled:
        try:
            hubspot_connected = connector.test_connection().connected
        except CRMError:
            hubspot_connected = False

    return {
        "backend": "Signal-to-Action Agent API",
        "version": API_VERSION,
        "status": "ok" if data_ready else "degraded",
        "health": "ok" if data_ready else "degraded",
        "uptime_seconds": round(time.monotonic() - _PROCESS_START, 1),
        "startup_time": _STARTED_AT_ISO,
        "source": state["source"],
        "source_mode": state["data_source_mode"],
        "source_label": state["source_label"],
        "hubspot_connected": hubspot_connected,
        "portal_id": state["portal_id"],
        "auto_sync_enabled": _settings.hubspot_auto_sync_on_startup,
        "refresh_interval_seconds": _settings.hubspot_refresh_interval_seconds,
        "provider": adapter.provider,
        "model": adapter.model,
        "last_sync": state["last_synced_at"],
        "dataset_counts": {
            "accounts": summary.get("accounts"),
            "signals": summary.get("signals"),
            "notes": summary.get("notes"),
            "synced": state["counts"],
        },
        "data_ready": data_ready,
        "data_error": data_error,
        "external_signals": external_signals.status_block(),
        "agents": AGENT_SEQUENCE,
    }


@app.get("/api/system/config")
def system_config() -> dict:
    """Active configuration with secrets redacted, plus validation warnings.

    Token values are never returned -- only booleans indicating whether each
    credential is present.
    """
    s = get_settings()
    return {"config": s.sanitized(), "warnings": s.warnings()}


@app.get("/api/system/threads")
def system_threads() -> dict:
    """Live thread inventory and background-refresh scheduler status."""
    threads = [
        {"name": t.name, "alive": t.is_alive(), "daemon": t.daemon}
        for t in threading.enumerate()
    ]
    scheduler = _scheduler.status() if _scheduler is not None else {"enabled": False, "running": False}
    return {"threads": threads, "thread_count": len(threads), "refresh_scheduler": scheduler}


@app.get("/api/accounts", response_model=AccountListResponse)
def list_accounts(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AccountListResponse:
    try:
        accounts = data_loader.load_accounts()
    except data_loader.DataNotGeneratedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    page = accounts[offset : offset + limit]
    return AccountListResponse(total=len(accounts), limit=limit, offset=offset, accounts=page)


@app.get("/api/accounts/{account_id}", response_model=AccountDetail)
def get_account(account_id: str) -> AccountDetail:
    try:
        detail = data_loader.get_account_detail(account_id)
    except data_loader.DataNotGeneratedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return detail


# -- external (outside-in) signals (additive, decoupled, optional) --------


@app.get("/api/external-signals/{account_id}", response_model=ExternalSignalsResult)
def get_external_signals(account_id: str) -> ExternalSignalsResult:
    """Outside-in public context for one account (supporting context only).

    Fully decoupled from the recommendation contract: the deterministic ranking,
    scoring, governance and CRM write-back never read this. When the layer is
    disabled (the default) a well-formed *disabled* result is returned and no
    external work is done. Never raises on provider/network errors.
    """
    try:
        account = data_loader.get_account(account_id)
    except data_loader.DataNotGeneratedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return external_signals.get_account_signals(account)


@app.get("/api/external-signals/{account_id}/brief", response_model=ExecutiveBrief)
def get_external_signals_brief(account_id: str) -> ExecutiveBrief:
    """Executive Intelligence Fusion brief for one account (Phase 4.1).

    A convenience view that returns just the fused narrative (internal + external
    context, business and seller implications, conversation strategy, suggested
    opening line, confidence, caveats and cited sources). The full
    ``GET /api/external-signals/{account_id}`` response also embeds this brief, so
    this endpoint is purely additive and never breaks existing clients.

    Explanatory only: it never changes ranking, scoring, governance or write-back.
    """
    try:
        account = data_loader.get_account(account_id)
    except data_loader.DataNotGeneratedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    result = external_signals.get_account_signals(account)
    if result.brief is not None:
        return result.brief
    # Layer disabled (or no brief): synthesise an internal-led brief so the
    # endpoint still returns a well-formed, useful response.
    from external_signals import fusion

    return fusion.build_brief(account, list(result.signals))


@app.post("/api/external-signals/refresh")
def refresh_external_signals() -> dict:
    """Refresh external signals for the highest-priority accounts only.

    Priority is the existing deterministic ranking; the number refreshed is
    capped by EXTERNAL_SIGNALS_REFRESH_LIMIT. No-ops safely when the layer is
    disabled, and never raises on provider errors.
    """
    try:
        accounts = data_loader.load_accounts()
    except data_loader.DataNotGeneratedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    priority = [account for account, _ in scoring_service.rank_accounts(accounts)]
    return external_signals.refresh_accounts(priority)


# -- BYOK decision providers (Phase 5.0 + 5.0A; additive, read-only) ------
# A higher-level reasoning layer that lets multiple providers (Deterministic
# baseline + OpenAI + Anthropic + NVIDIA) reason over the SAME deterministic
# account context and return ONE structured decision contract, surfaced as a
# read-only Comparison Mode in the Evaluation Center. These endpoints never
# persist, never write to the CRM, and never change ranking/scoring/governance.
# LLM decisions are advisory and must pass governance + human approval.
#
# Phase 5.0A adds a true BYOK user experience: keys may be brought through the
# UI (session-scoped in the browser) and passed in the REQUEST BODY for a single
# request. Such keys are used only for that request -- never persisted, cached,
# logged or returned. Infrastructure mode (env vars) and user BYOK mode coexist.


class ProviderCredentialIn(BaseModel):
    """A per-session BYOK credential supplied from the browser for one request.

    Never persisted, cached, logged or returned. ``api_key`` is consumed only for
    the lifetime of the request; ``model`` / ``base_url`` are optional overrides.
    """

    api_key: str = ""
    model: str = ""
    base_url: str = ""


class DecisionSessionIn(BaseModel):
    """Optional session payload for evaluate / compare (Phase 5.0A BYOK).

    ``credentials`` maps provider id -> credential. Absent providers fall back to
    environment configuration, so both modes work together.
    """

    provider: Optional[str] = None
    credentials: Dict[str, ProviderCredentialIn] = Field(default_factory=dict)


class TestConnectionIn(BaseModel):
    """Request body for the BYOK 'Test Connection' action."""

    provider: str
    api_key: str = ""
    model: str = ""
    base_url: str = ""


def _to_credentials(body: Optional[DecisionSessionIn]) -> Optional[Dict[str, ProviderCredential]]:
    """Convert an inbound session payload to the router's credential map.

    Returns ``None`` when nothing usable was supplied so the router stays in
    pure infrastructure mode. Only credentials that actually carry a key (or an
    override) are forwarded -- empty entries are ignored.
    """
    if body is None or not body.credentials:
        return None
    creds: Dict[str, ProviderCredential] = {}
    for pid, cred in body.credentials.items():
        if cred is None:
            continue
        if cred.api_key.strip() or cred.model.strip() or cred.base_url.strip():
            creds[(pid or "").lower()] = ProviderCredential(
                api_key=cred.api_key,
                model=cred.model,
                base_url=cred.base_url,
            )
    return creds or None


@app.get("/api/decision-providers/status")
def decision_providers_status() -> dict:
    """Secret-free status of every decision provider (BYOK).

    Returns provider ids, labels, model names and presence booleans only -- never
    any API key value. The deterministic provider is always active; live LLM
    providers report ``configured`` / ``not_configured`` based on whether their
    BYOK key is present.
    """
    return decision_providers.provider_status()


@app.post("/api/decision-providers/test")
def decision_providers_test(body: TestConnectionIn) -> dict:
    """Test a BYOK credential against a live provider (Phase 5.0A).

    Makes one minimal request with the supplied session key and returns a
    secret-free result (``status``: connected | no_key | failed | unsupported).
    The key is used only for this check -- never persisted, cached, logged or
    returned. Never raises for credential problems.
    """
    credential = ProviderCredential(api_key=body.api_key, model=body.model, base_url=body.base_url)
    return decision_providers.test_provider(body.provider, credential)


@app.post("/api/decision-providers/evaluate/{account_id}", response_model=ProviderDecision)
def decision_providers_evaluate(
    account_id: str,
    provider: Optional[str] = Query(None, description="deterministic | openai | anthropic | nvidia"),
    body: Optional[DecisionSessionIn] = None,
) -> ProviderDecision:
    """Evaluate one account with one decision provider (defaults to configured).

    Read-only and advisory: no persistence, no CRM write-back, no change to
    ranking/scoring/governance. A not-configured provider returns a placeholder
    decision; any live-provider failure falls back to the deterministic baseline.
    Optional session BYOK keys may be supplied in the request body (Phase 5.0A);
    the ``provider`` query param takes precedence, then ``body.provider``.
    """
    chosen = provider or (body.provider if body else None)
    credentials = _to_credentials(body)
    decision = decision_providers.evaluate_account(account_id, chosen, credentials)
    if decision is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return decision


@app.post("/api/decision-providers/compare/{account_id}")
def decision_providers_compare(
    account_id: str,
    body: Optional[DecisionSessionIn] = None,
) -> dict:
    """Compare the deterministic baseline against every provider for one account.

    Read-only: returns the baseline decision, each provider's decision (live,
    fallback or not_configured), field-by-field differences, agreement/divergence
    analytics and evaluation notes. Never persists, never writes to the CRM and
    never changes ranking/scoring/governance. LLM decisions are advisory only.
    Optional session BYOK keys may be supplied in the request body (Phase 5.0A).
    """
    credentials = _to_credentials(body)
    result = decision_providers.compare_account(account_id, credentials)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    return result


@app.post("/api/recommendations", response_model=RecommendationResponse)
def post_recommendations(request: RecommendationRequest) -> RecommendationResponse:
    try:
        return generate_recommendations(request)
    except data_loader.DataNotGeneratedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/api/recommendations/{recommendation_id}", response_model=Recommendation)
def get_recommendation(recommendation_id: str) -> Recommendation:
    rec = ledger_service.get_recommendation(recommendation_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Recommendation {recommendation_id} not found")
    return rec


@app.post("/api/actions/{recommendation_id}/approve", response_model=ActionResult)
def approve_action(recommendation_id: str) -> ActionResult:
    rec = ledger_service.set_approval(recommendation_id, ApprovalStatus.approved)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Recommendation {recommendation_id} not found")
    return ActionResult(
        recommendation_id=recommendation_id,
        approval_status=rec.approval_status,
        message=f"Action approved for {rec.account_name}. A human has authorized this next step.",
        recommendation=rec,
    )


@app.post("/api/actions/{recommendation_id}/reject", response_model=ActionResult)
def reject_action(recommendation_id: str, body: Optional[RejectRequest] = None) -> ActionResult:
    reason = body.reason if body else None
    rec = ledger_service.set_approval(recommendation_id, ApprovalStatus.rejected, reason)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Recommendation {recommendation_id} not found")
    suffix = f" Reason: {reason}" if reason else ""
    return ActionResult(
        recommendation_id=recommendation_id,
        approval_status=rec.approval_status,
        message=f"Action rejected for {rec.account_name}.{suffix}",
        recommendation=rec,
    )


# -- HubSpot test CRM integration (optional) ------------------------------


def _compose_writeback_text(rec: Recommendation) -> tuple[str, str]:
    """Build a seller-ready title + body from an approved recommendation."""
    title = rec.recommended_action
    evidence = "; ".join(e.label for e in rec.evidence[:5]) or "See decision ledger"
    body = (
        f"Account: {rec.account_name} (priority #{rec.priority_rank}, "
        f"score {round(rec.priority_score * 100)})\n\n"
        f"Why now: {rec.priority_reason}\n\n"
        f"Risk: {rec.risk_summary}\n"
        f"Opportunity: {rec.opportunity_summary}\n\n"
        f"Next-best action: {rec.recommended_action}\n"
        f"Confidence: {round(rec.confidence_score * 100)}%\n"
        f"Evidence: {evidence}\n\n"
        "Created by Signal-to-Action Agent after explicit human approval. "
        "Synthetic demo data — no autonomous execution."
    )
    return title, body


def _require_approved(recommendation_id: str) -> Recommendation:
    rec = ledger_service.get_recommendation(recommendation_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Recommendation {recommendation_id} not found")
    if rec.approval_status != ApprovalStatus.approved:
        raise HTTPException(
            status_code=409,
            detail="Approve this recommendation before creating a HubSpot follow-up.",
        )
    return rec


@app.get("/api/integrations/hubspot/status")
def hubspot_status(probe: bool = Query(False, description="Make a live connectivity check")) -> dict:
    """Connector configuration + (optionally) a live connectivity probe.

    Always safe to call. With ``probe=true`` it makes one lightweight read-only
    call so the UI 'Test connection' button can verify the token.
    """
    connector = get_crm_connector()
    status = connector.status()
    if probe and status.configured and status.enabled:
        try:
            status = connector.test_connection()
        except CRMError as exc:
            status = ConnectorStatus(
                enabled=connector.enabled,
                configured=connector.configured,
                connected=False,
                writeback_enabled=connector.writeback_enabled,
                portal_id=connector.portal_id,
                message=exc.message,
            )
    meta = data_loader.sync_meta()
    return {
        **status.model_dump(),
        "active_source": meta["source"],
        "data_source_mode": meta["mode"],
        "data_source_label": meta["label"],
        "last_synced_at": meta["synced_at"],
        "records": meta["counts"],
    }


@app.post("/api/integrations/hubspot/seed", response_model=SyncResult)
def hubspot_seed() -> SyncResult:
    """Push the synthetic demo dataset into the HubSpot test portal (write-gated)."""
    connector = get_crm_connector()
    try:
        accounts = data_loader.synthetic_accounts()
        signals = data_loader.synthetic_signals_by_account()
        notes = data_loader.synthetic_notes_by_account()
    except data_loader.DataNotGeneratedError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    try:
        return connector.seed_demo_data(accounts, signals, notes)
    except CRMError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message)


@app.post("/api/integrations/hubspot/sync", response_model=SyncResult)
def hubspot_sync(limit: int = Query(0, ge=0, le=500)) -> SyncResult:
    """Read HubSpot companies and switch the active dataset to the synced records."""
    try:
        return _perform_hubspot_sync(limit)
    except CRMError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message)


@app.post("/api/integrations/hubspot/use-synthetic")
def hubspot_use_synthetic() -> dict:
    """Revert the active dataset to the local synthetic data (keeps demo stable)."""
    data_loader.use_synthetic()
    return {"active_source": data_loader.active_source(), "label": data_loader.source_label()}


@app.post("/api/actions/{recommendation_id}/hubspot-task", response_model=WritebackResult)
def hubspot_task(recommendation_id: str, body: Optional[HubspotActionRequest] = None) -> WritebackResult:
    rec = _require_approved(recommendation_id)
    connector = get_crm_connector()
    title, default_body = _compose_writeback_text(rec)
    title = (body.title if body and body.title else title)[:255]
    text = body.body if body and body.body else default_body
    try:
        result = connector.create_task(
            account_id=rec.account_id, account_name=rec.account_name, title=title, body=text
        )
    except CRMError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message)
    result.recommendation_id = recommendation_id
    result.approved_at = _now_iso()
    ledger_service.save_writeback(result)
    return result


@app.post("/api/actions/{recommendation_id}/hubspot-note", response_model=WritebackResult)
def hubspot_note(recommendation_id: str, body: Optional[HubspotActionRequest] = None) -> WritebackResult:
    rec = _require_approved(recommendation_id)
    connector = get_crm_connector()
    _, default_body = _compose_writeback_text(rec)
    text = body.body if body and body.body else default_body
    try:
        result = connector.create_note(
            account_id=rec.account_id, account_name=rec.account_name, body=text
        )
    except CRMError as exc:
        raise HTTPException(status_code=exc.http_status, detail=exc.message)
    result.recommendation_id = recommendation_id
    result.approved_at = _now_iso()
    ledger_service.save_writeback(result)
    return result


@app.get("/api/actions/{recommendation_id}/writebacks")
def list_writebacks(recommendation_id: str) -> dict:
    """Return any CRM write-backs already recorded for a recommendation."""
    return {"recommendation_id": recommendation_id, "writebacks": ledger_service.get_writebacks(recommendation_id)}
