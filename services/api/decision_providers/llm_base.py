"""Shared base for live LLM decision providers (OpenAI / Anthropic / NVIDIA).

All three speak to a remote model over stdlib ``urllib`` only -- no third-party
SDKs. They share:

* one grounded prompt built from the deterministic :class:`DecisionContext`,
* strict-JSON parsing (``parse_decision_json`` + ``decision_from_payload``),
* retry-once-on-invalid-JSON then raise :class:`ProviderError`,
* never logging secrets (only the exception type is logged).

The router is responsible for turning a :class:`ProviderError` into a safe
deterministic fallback, so these classes simply raise on failure.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Tuple

from decision_providers.base import (
    ACTION_VOCAB,
    DecisionContext,
    DecisionProvider,
    InvalidDecisionError,
    ProviderDecision,
    decision_from_payload,
    parse_decision_json,
)

logger = logging.getLogger("signal_to_action.decision_providers")


class ProviderError(RuntimeError):
    """Raised when a live provider cannot return a valid decision."""


SYSTEM_PROMPT = (
    "You are a governed B2B revenue decision assistant for an enterprise seller. "
    "You reason over the deterministic account facts you are given and return ONE "
    "structured decision as STRICT JSON. Rules: "
    "(1) Never invent numbers; only use the figures provided. "
    "(2) recommended_action MUST be exactly one of: " + ", ".join(sorted(ACTION_VOCAB)) + ". "
    "(3) risk_level, opportunity_level and confidence MUST each be exactly one of: low, medium, high. "
    "(4) External signals are advisory supporting context only; they must NOT change ranking, "
    "scoring or governance. "
    "(5) You may disagree with the deterministic recommendation, but if you do you MUST explain why "
    "in 'reasoning'. "
    "(6) Your decision is advisory: a human approves before any CRM action; you never write to CRM. "
    "(7) Return ONLY a JSON object, no prose, no code fences."
)

JSON_SHAPE = (
    '{"risk_level":"low|medium|high","opportunity_level":"low|medium|high",'
    '"recommended_action":"one of the allowed actions","confidence":"low|medium|high",'
    '"executive_summary":"...","business_implication":"...","seller_implication":"...",'
    '"conversation_strategy":["step 1","step 2"],"opening_line":"...","crm_note":"...",'
    '"reasoning":["point 1","point 2"],"caveats":["caveat 1"]}'
)

_RETRY_SUFFIX = (
    "\n\nIMPORTANT: Your previous answer was not valid JSON in the required shape. "
    "Reply again with ONLY the JSON object, matching exactly this shape:\n" + JSON_SHAPE
)


def _facts(context: DecisionContext) -> Dict[str, Any]:
    """The grounded, non-secret fact sheet handed to the model."""
    facts: Dict[str, Any] = {
        "account_name": context.account_name,
        "industry": context.industry,
        "segment": context.segment,
        "region": context.region,
        "current_month_spend": context.current_month_spend,
        "previous_month_spend": context.previous_month_spend,
        "spend_delta_pct": context.spend_delta_pct,
        "product_usage_score": context.product_usage_score,
        "engagement_score": context.engagement_score,
        "support_risk_score": context.support_risk_score,
        "campaign_response_score": context.campaign_response_score,
        "last_contact_days": context.last_contact_days,
        "renewal_days": context.renewal_days,
        "growth_potential_score": context.growth_potential_score,
        "deterministic_analysis": {
            "priority_score": context.priority_score,
            "risk_level": context.risk_level,
            "risk_score": context.risk_score,
            "risk_factors": context.risk_factors,
            "opportunity_level": context.opportunity_level,
            "opportunity_score": context.opportunity_score,
            "opportunity_factors": context.opportunity_factors,
            "recommended_action": context.deterministic_action,
            "recommended_action_detail": context.deterministic_action_detail,
            "confidence_level": context.confidence_level,
            "governance_status": context.governance_status,
            "governance_caveats": context.governance_caveats,
            "evidence": context.evidence,
        },
    }
    if context.external_enabled:
        facts["external_context_advisory"] = {
            "summary": context.external_summary,
            "signals": [
                {"title": s.title, "source": s.source, "impact": s.impact, "summary": s.summary}
                for s in context.external_signals
            ],
        }
    return facts


def build_user_prompt(context: DecisionContext) -> str:
    facts = _facts(context)
    return (
        "Account facts (deterministic, from CRM):\n"
        + json.dumps(facts, indent=2, ensure_ascii=False)
        + "\n\nProduce your decision now as a JSON object with exactly these keys:\n"
        + JSON_SHAPE
    )


def http_post_json(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: float = 30.0) -> Dict[str, Any]:
    """POST JSON and return the decoded JSON response. Raises on HTTP/transport error."""
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    for key, value in headers.items():
        req.add_header(key, value)
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 -- fixed provider URLs
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


class LLMDecisionProvider(DecisionProvider):
    """Common behaviour for live LLM providers."""

    #: subclasses set the live mode label on the resulting decision
    mode = "live"

    def _complete(self, system: str, user: str) -> str:  # pragma: no cover - subclass
        """Make the HTTP call and return the raw text completion."""
        raise NotImplementedError

    def decide(self, context: DecisionContext) -> ProviderDecision:
        if not self.configured():
            raise ProviderError(f"{self.id} is not configured (no API key).")

        system = SYSTEM_PROMPT
        user = build_user_prompt(context)
        start = time.perf_counter()
        last_error: Exception | None = None

        for attempt in range(2):  # initial attempt + one retry on invalid JSON
            prompt = user if attempt == 0 else user + _RETRY_SUFFIX
            try:
                raw = self._complete(system, prompt)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
                logger.warning("%s call failed (%s).", self.id, type(exc).__name__)
                raise ProviderError(f"{self.id} transport error: {type(exc).__name__}") from exc
            except Exception as exc:  # noqa: BLE001 -- never leak provider internals
                logger.warning("%s unexpected error (%s).", self.id, type(exc).__name__)
                raise ProviderError(f"{self.id} error: {type(exc).__name__}") from exc

            try:
                payload = parse_decision_json(raw)
                latency_ms = int((time.perf_counter() - start) * 1000)
                return decision_from_payload(
                    payload,
                    provider=self.id,
                    model=self.model_name(),
                    context=context,
                    latency_ms=latency_ms,
                    mode=self.mode,
                )
            except InvalidDecisionError as exc:
                last_error = exc
                logger.info("%s returned invalid decision JSON (attempt %d).", self.id, attempt + 1)
                continue

        raise ProviderError(f"{self.id} returned invalid output: {last_error}")

    # -- small helpers for subclasses -------------------------------------

    @staticmethod
    def _messages(system: str, user: str) -> List[Dict[str, str]]:
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
