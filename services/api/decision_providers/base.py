"""Decision Provider layer -- BYOK multi-provider reasoning (Phase 5.0).

This is a NEW, additive abstraction that sits *alongside* the deterministic
engine. It never changes ranking, scoring, confidence, governance, approval or
CRM write-back. Every provider -- the Deterministic baseline, OpenAI, Anthropic
and NVIDIA -- consumes the **same** :class:`DecisionContext` and returns the
**same** :class:`ProviderDecision` contract, so they can be compared
apples-to-apples in the Evaluation Center.

Guarantees (so a provider can never destabilise the product):

* The deterministic provider is the source of truth, benchmark and fallback.
* LLM providers are **advisory**: their output must pass governance + human
  approval before any CRM action. They can never write to the CRM, create an
  autonomous action, or bypass approval.
* Any provider failure or invalid output falls back to the deterministic
  decision; the app flow always continues.

    DecisionContext (deterministic grounding)
            |
            v
    DecisionProvider.decide()  <- Deterministic | OpenAI | Anthropic | NVIDIA
            |
            v
    ProviderDecision (one strict contract)
"""

from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field

# -- vocabularies ---------------------------------------------------------

#: The bounded action vocabulary every provider must choose from. Identical to
#: the deterministic Action Agent's ``action_type`` set, so comparison across
#: providers is apples-to-apples (and an LLM can never invent a new action).
ACTION_VOCAB = (
    "support_escalation",
    "renewal_prep",
    "optimization_review",
    "reactivation",
    "follow_up",
    "monitor",
)

#: Ordered low -> high. Used for risk, opportunity and confidence levels.
LEVELS = ("low", "medium", "high")

#: The single most important governance guardrail for this layer. Appended to
#: every non-baseline (LLM) decision and surfaced in the API + UI.
ADVISORY_CAVEAT = (
    "LLM-generated decisions are advisory and must pass governance and human "
    "approval before any CRM action."
)


class ProviderMode(str, Enum):
    """How a single decision was actually produced."""

    deterministic = "deterministic"  # the baseline engine
    live = "live"  # a live LLM call succeeded and validated
    fallback = "fallback"  # an LLM was selected but we fell back to baseline
    not_configured = "not_configured"  # provider has no key (BYOK not supplied)


class InvalidDecisionError(ValueError):
    """Raised when an LLM returns output that cannot be validated into the
    contract. The router catches this and falls back to the deterministic
    decision (recording ``provider_error``)."""


# -- input contract -------------------------------------------------------


class ContextSignal(BaseModel):
    """A synthesized external signal carried into the prompt (advisory only)."""

    title: str = ""
    source: str = ""
    summary: str = ""
    impact: str = "neutral"
    url: Optional[str] = None
    published_at: Optional[str] = None


class DecisionContext(BaseModel):
    """The deterministic grounding handed identically to every provider.

    All numbers come straight from the deterministic engine (scoring, the
    health/opportunity/governance/action agents and the fusion brief). A
    provider only *reasons over and phrases* these facts -- it never recomputes
    ranking, scoring or governance.
    """

    account_id: str
    account_name: str
    industry: str = ""
    segment: str = ""
    region: str = ""

    # -- internal CRM facts ----------------------------------------------
    current_month_spend: float = 0.0
    previous_month_spend: float = 0.0
    spend_delta_pct: float = 0.0
    product_usage_score: float = 0.0
    engagement_score: float = 0.0
    support_risk_score: float = 0.0
    campaign_response_score: float = 0.0
    last_contact_days: int = 0
    renewal_days: int = 0
    growth_potential_score: float = 0.0

    # -- deterministic analysis (the baseline truth) ---------------------
    priority_score: float = 0.0
    risk_score: float = 0.0
    risk_level: str = "low"
    risk_factors: List[str] = Field(default_factory=list)
    opportunity_score: float = 0.0
    opportunity_level: str = "low"
    opportunity_factors: List[str] = Field(default_factory=list)
    deterministic_action: str = "follow_up"
    deterministic_action_detail: str = ""
    confidence_score: float = 0.0
    confidence_level: str = "low"
    governance_status: str = "review_required"
    governance_caveats: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)

    # -- external supporting context (advisory only) ---------------------
    external_enabled: bool = False
    external_summary: str = ""
    external_signals: List[ContextSignal] = Field(default_factory=list)

    # -- narrative grounding from the deterministic fusion brief ----------
    # Selected, already-deterministic brief fields the providers may reuse /
    # improve on. Never authoritative for risk/opportunity/action.
    brief_executive_summary: str = ""
    brief_business_implication: str = ""
    brief_seller_implication: str = ""
    brief_opening_line: str = ""
    brief_conversation_strategy: List[str] = Field(default_factory=list)
    brief_crm_note: str = ""


# -- output contract ------------------------------------------------------


class ProviderDecision(BaseModel):
    """The single strict decision contract every provider returns."""

    provider: str
    model: str
    mode: str = ProviderMode.deterministic.value

    risk_level: str = "low"
    opportunity_level: str = "low"
    recommended_action: str = "follow_up"
    confidence: str = "low"

    executive_summary: str = ""
    business_implication: str = ""
    seller_implication: str = ""
    conversation_strategy: List[str] = Field(default_factory=list)
    opening_line: str = ""
    crm_note: str = ""
    reasoning: List[str] = Field(default_factory=list)
    caveats: List[str] = Field(default_factory=list)
    latency_ms: int = 0

    # -- additive, safe metadata (not required by the core contract) ------
    is_baseline: bool = False
    provider_error: Optional[str] = None


# -- normalisation helpers ------------------------------------------------


def normalize_level(value: object, default: str = "low") -> str:
    """Coerce an arbitrary value into one of ``LEVELS`` (low|medium|high)."""
    if isinstance(value, str):
        v = value.strip().lower()
        if v in LEVELS:
            return v
        # tolerate common synonyms an LLM might emit
        if v in {"med", "mid", "moderate"}:
            return "medium"
        if v in {"hi", "elevated", "critical", "severe"}:
            return "high"
        if v in {"lo", "minimal", "none"}:
            return "low"
    return default if default in LEVELS else "low"


def normalize_action(value: object, default: str = "follow_up") -> str:
    """Coerce an arbitrary value into the bounded ``ACTION_VOCAB``."""
    if isinstance(value, str):
        v = value.strip().lower().replace(" ", "_").replace("-", "_")
        if v in ACTION_VOCAB:
            return v
        # tolerate close phrasings an LLM might emit
        synonyms = {
            "escalate": "support_escalation",
            "support": "support_escalation",
            "renewal": "renewal_prep",
            "renew": "renewal_prep",
            "optimize": "optimization_review",
            "optimization": "optimization_review",
            "recover_customer": "reactivation",
            "recover": "reactivation",
            "reactivate": "reactivation",
            "win_back": "reactivation",
            "expand": "follow_up",
            "expansion": "follow_up",
            "followup": "follow_up",
            "check_in": "follow_up",
            "monitor_only": "monitor",
            "hold": "monitor",
            "no_action": "monitor",
        }
        if v in synonyms:
            return synonyms[v]
    return default if default in ACTION_VOCAB else "follow_up"


def level_from_score(score: float, *, high: float = 0.6, medium: float = 0.35) -> str:
    """Map a 0..1 score to low|medium|high using shared thresholds."""
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "low"
    if s >= high:
        return "high"
    if s >= medium:
        return "medium"
    return "low"


def _as_str_list(value: object, *, limit: int = 8, max_len: int = 600) -> List[str]:
    """Coerce a value into a clean, bounded list of non-empty strings."""
    if isinstance(value, str):
        items: List[object] = [value]
    elif isinstance(value, (list, tuple)):
        items = list(value)
    else:
        items = []
    out: List[str] = []
    for item in items:
        if item is None:
            continue
        text = str(item).strip()
        if not text:
            continue
        out.append(text[:max_len])
        if len(out) >= limit:
            break
    return out


# -- JSON extraction + validation (the "reject invalid output" gate) ------

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


def parse_decision_json(raw: str) -> dict:
    """Extract a JSON object from a model response.

    Tolerant of code fences and leading/trailing prose. Raises
    :class:`InvalidDecisionError` if no JSON object can be recovered.
    """
    if not raw or not raw.strip():
        raise InvalidDecisionError("empty response")

    candidates: List[str] = []
    fenced = _FENCE_RE.search(raw)
    if fenced:
        candidates.append(fenced.group(1).strip())
    # Greedy first "{" .. last "}" slice as a fallback.
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(raw[start : end + 1])
    candidates.append(raw.strip())

    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except (ValueError, TypeError):
            continue
        if isinstance(data, dict):
            return data
    raise InvalidDecisionError("no JSON object found in response")


def decision_from_payload(
    payload: dict,
    *,
    provider: str,
    model: str,
    context: DecisionContext,
    latency_ms: int,
    mode: str = ProviderMode.live.value,
) -> ProviderDecision:
    """Validate + coerce a parsed LLM payload into a :class:`ProviderDecision`.

    Missing or unusable fields fall back to the deterministic context values, so
    a partially-valid response still yields a safe, grounded decision. Raises
    :class:`InvalidDecisionError` only when the payload carries no usable
    narrative at all (so the caller can fall back to the baseline).
    """
    if not isinstance(payload, dict):
        raise InvalidDecisionError("payload is not an object")

    exec_summary = str(payload.get("executive_summary", "")).strip()
    business = str(payload.get("business_implication", "")).strip()
    seller = str(payload.get("seller_implication", "")).strip()
    reasoning = _as_str_list(payload.get("reasoning"))
    strategy = _as_str_list(payload.get("conversation_strategy"))

    # A response with no narrative signal at all is treated as invalid so we
    # fall back to the deterministic baseline rather than show an empty card.
    if not any([exec_summary, business, seller, reasoning, strategy]):
        raise InvalidDecisionError("no usable narrative fields in response")

    caveats = _as_str_list(payload.get("caveats"), limit=6)
    if ADVISORY_CAVEAT not in caveats:
        caveats.append(ADVISORY_CAVEAT)

    return ProviderDecision(
        provider=provider,
        model=model,
        mode=mode,
        risk_level=normalize_level(payload.get("risk_level"), context.risk_level),
        opportunity_level=normalize_level(
            payload.get("opportunity_level"), context.opportunity_level
        ),
        recommended_action=normalize_action(
            payload.get("recommended_action"), context.deterministic_action
        ),
        confidence=normalize_level(payload.get("confidence"), context.confidence_level),
        executive_summary=exec_summary or context.brief_executive_summary,
        business_implication=business or context.brief_business_implication,
        seller_implication=seller or context.brief_seller_implication,
        conversation_strategy=strategy or list(context.brief_conversation_strategy),
        opening_line=str(payload.get("opening_line", "")).strip() or context.brief_opening_line,
        crm_note=str(payload.get("crm_note", "")).strip() or context.brief_crm_note,
        reasoning=reasoning,
        caveats=caveats,
        latency_ms=max(0, int(latency_ms)),
        is_baseline=False,
        provider_error=None,
    )


def fallback_decision(
    baseline: ProviderDecision,
    *,
    provider: str,
    model: str,
    error: str,
    latency_ms: int,
) -> ProviderDecision:
    """Build a safe fallback decision that mirrors the deterministic baseline
    but is attributed to the failed provider and records the error."""
    caveats = list(baseline.caveats)
    note = f"{provider} was unavailable; showing the deterministic baseline decision."
    if note not in caveats:
        caveats.append(note)
    if ADVISORY_CAVEAT not in caveats:
        caveats.append(ADVISORY_CAVEAT)
    return baseline.model_copy(
        update={
            "provider": provider,
            "model": model,
            "mode": ProviderMode.fallback.value,
            "latency_ms": max(0, int(latency_ms)),
            "caveats": caveats,
            "is_baseline": False,
            "provider_error": error,
        }
    )


def not_configured_decision(*, provider: str, model: str) -> ProviderDecision:
    """A placeholder decision for a provider with no key (BYOK not supplied)."""
    return ProviderDecision(
        provider=provider,
        model=model,
        mode=ProviderMode.not_configured.value,
        caveats=[
            f"{provider} is not configured. Add its API key to enable a live comparison.",
        ],
        is_baseline=False,
    )


# -- provider interface ---------------------------------------------------


class DecisionProvider(ABC):
    """Interface every decision provider implements."""

    #: Short id surfaced in the API/UI, e.g. "deterministic" | "openai".
    id: str = "base"
    #: Human-friendly label.
    label: str = "Base"

    def model_name(self) -> str:
        """The concrete model id this provider would use."""
        return "n/a"

    def configured(self) -> bool:
        """Whether this provider has the credentials it needs to run live.

        The deterministic provider is always configured; LLM providers require a
        BYOK key. Never raises and never exposes the key itself.
        """
        return True

    @abstractmethod
    def decide(self, context: DecisionContext) -> ProviderDecision:
        """Produce a structured decision from the deterministic context.

        LLM implementations raise on any failure (missing key, network error or
        invalid output after one retry); the router catches that and falls back
        to the deterministic baseline.
        """
