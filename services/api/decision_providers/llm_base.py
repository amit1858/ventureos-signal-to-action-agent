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
import re
import socket
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

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
    """Raised when a live provider cannot return a valid decision.

    Carries an ``error_category`` so the UI can show a friendly diagnostic
    instead of a generic "failed" badge. Categories:

    * ``invalid_key`` - 401/403 from provider; user must fix the key.
    * ``model_not_found`` - 404 or body indicates the model id is wrong.
    * ``endpoint_unavailable`` - DNS / 5xx / refused; user/host issue.
    * ``rate_limited`` - 429 from provider.
    * ``timeout`` - request exceeded ``DECISION_PROVIDER_TIMEOUT``.
    * ``network`` - other transport failure (offline, TLS, etc).
    * ``http_error`` - HTTP failure that does not match the above.
    * ``invalid_output`` - provider answered but JSON shape was wrong.
    * ``unknown`` - last-resort bucket; details are still in the message.
    """

    def __init__(self, message: str, category: str = "unknown") -> None:
        super().__init__(message)
        self.error_category = category


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


# -- error classification (Phase 5.0A.1) ----------------------------------

_KEY_HINTS = (
    "invalid api key",
    "invalid_api_key",
    "authentication_error",
    "incorrect api key",
    "unauthorized",
    "permission_denied",
)
_MODEL_HINTS = (
    "model_not_found",
    "model not found",
    "does not exist",
    "no such model",
    "not_found_error",
    "invalid_request_error",  # Anthropic often returns this for bad model
    "unknown model",
)
_RATE_HINTS = ("rate_limit", "rate limited", "too many requests", "quota")

# Defense in depth: redact any key-like substring some providers echo back in
# their own error messages (OpenAI masks but still echoes a prefix/suffix). We
# never want to surface even a masked-by-provider key in our API response.
_KEY_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_*\-]{4,}", re.IGNORECASE),
    re.compile(r"nvapi-[A-Za-z0-9_*\-]{4,}", re.IGNORECASE),
    re.compile(r"Bearer\s+[A-Za-z0-9_\-]{4,}", re.IGNORECASE),
)


def _redact_keys(message: str) -> str:
    if not message:
        return message
    out = message
    for pat in _KEY_PATTERNS:
        out = pat.sub("[redacted]", out)
    return out


def _parse_provider_error_body(exc: urllib.error.HTTPError) -> Tuple[str, str]:
    """Best-effort: pull a stable category + a short safe message from the body.

    Returns ``(category, message)``. Provider error bodies look like:

    * OpenAI / NIM:  ``{"error": {"message": "...", "code": "model_not_found", ...}}``
    * Anthropic:     ``{"type": "error", "error": {"type": "not_found_error", "message": "..."}}``

    Falls back to ``("", "")`` when nothing useful can be extracted. Never raises.
    """
    try:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
    except Exception:  # noqa: BLE001 - defensive; never block diagnostics
        raw = ""
    if not raw:
        return "", ""

    err_type, err_code, err_msg = "", "", ""
    try:
        payload = json.loads(raw)
        err = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(err, dict):
            err_type = str(err.get("type", "") or "").lower()
            err_code = str(err.get("code", "") or "").lower()
            err_msg = str(err.get("message", "") or "")
        elif isinstance(err, str):
            err_msg = err
    except Exception:  # noqa: BLE001 - body may be HTML, not JSON
        err_msg = raw[:200]

    blob = " ".join(filter(None, [err_type, err_code, err_msg.lower()]))
    if any(h in blob for h in _MODEL_HINTS):
        category = "model_not_found"
    elif any(h in blob for h in _KEY_HINTS):
        category = "invalid_key"
    elif any(h in blob for h in _RATE_HINTS):
        category = "rate_limited"
    else:
        category = ""
    # Trim the surfaced message so we never leak provider internals or HTML,
    # and redact any key-like substring the provider might echo back.
    message = (err_msg or raw).strip().splitlines()[0][:240] if (err_msg or raw) else ""
    return category, _redact_keys(message)


def classify_http_error(exc: urllib.error.HTTPError) -> Tuple[str, str]:
    """Map an :class:`HTTPError` to a ``(category, safe_message)`` pair."""
    code = int(getattr(exc, "code", 0) or 0)
    body_category, body_message = _parse_provider_error_body(exc)
    if code in (401, 403):
        category = body_category if body_category in ("invalid_key", "rate_limited") else "invalid_key"
        message = body_message or "Invalid API key. Check the key, then test again."
        return category, message
    if code == 404:
        category = "model_not_found" if body_category in ("", "model_not_found") else body_category
        # 404 usually means the model id is wrong; mention both options so users
        # know to try the dropdown defaults or update the base URL.
        message = body_message or "Model not found at this endpoint. Pick a model from the list or check the base URL."
        return category, message
    if code == 429:
        return "rate_limited", body_message or "Rate limited by the provider. Wait a moment and retry."
    if 500 <= code < 600:
        return "endpoint_unavailable", body_message or f"Provider returned {code}. Try again shortly."
    # Other 4xx - prefer parsed category when we have one.
    category = body_category or "http_error"
    message = body_message or f"HTTP {code}"
    return category, message


def classify_transport_error(exc: BaseException) -> Tuple[str, str]:
    """Map a transport-level exception to a ``(category, safe_message)`` pair."""
    if isinstance(exc, socket.timeout) or isinstance(exc, TimeoutError):
        return "timeout", "Request timed out. The endpoint may be slow or unreachable."
    if isinstance(exc, urllib.error.URLError):
        # URLError wraps DNS errors, refused connections, TLS errors, etc.
        reason = getattr(exc, "reason", None)
        if isinstance(reason, socket.timeout) or isinstance(reason, TimeoutError):
            return "timeout", "Request timed out. The endpoint may be slow or unreachable."
        if isinstance(reason, socket.gaierror):
            return "endpoint_unavailable", "Endpoint hostname could not be resolved. Check the base URL."
        return "endpoint_unavailable", "Could not reach the provider. Check network or base URL."
    if isinstance(exc, OSError):
        return "network", "Network error reaching the provider."
    return "unknown", f"Unexpected error: {type(exc).__name__}"


class LLMDecisionProvider(DecisionProvider):
    """Common behaviour for live LLM providers."""

    #: subclasses set the live mode label on the resulting decision
    mode = "live"

    # -- BYOK credential resolution (session overrides env) ----------------

    def session_key(self) -> str:
        """The per-session BYOK key, if one was injected for this request."""
        return self.credential.key() if self.credential else ""

    def session_model(self) -> str:
        """A per-session model override, if supplied."""
        return self.credential.pick_model() if self.credential else ""

    def session_base_url(self) -> str:
        """A per-session base-url override, if supplied."""
        return self.credential.pick_base_url() if self.credential else ""

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
            except urllib.error.HTTPError as exc:
                category, message = classify_http_error(exc)
                logger.warning("%s call failed (HTTP %s, %s).", self.id, getattr(exc, "code", 0), category)
                raise ProviderError(f"{self.id}: {message}", category=category) from exc
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                category, message = classify_transport_error(exc)
                logger.warning("%s call failed (%s, %s).", self.id, type(exc).__name__, category)
                raise ProviderError(f"{self.id}: {message}", category=category) from exc
            except Exception as exc:  # noqa: BLE001 -- never leak provider internals
                logger.warning("%s unexpected error (%s).", self.id, type(exc).__name__)
                raise ProviderError(
                    f"{self.id} error: {type(exc).__name__}", category="unknown"
                ) from exc

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

        raise ProviderError(
            f"{self.id} returned invalid output: {last_error}", category="invalid_output"
        )

    # -- lightweight connection test (Phase 5.0A "Test Connection") --------

    def ping(self) -> Dict[str, Any]:
        """Make a minimal request to verify the credential works.

        Returns ``{"ok": True, "model": ..., "latency_ms": ...}`` on success.
        Raises :class:`ProviderError` (with ``error_category``) on failure --
        invalid_key / model_not_found / rate_limited / endpoint_unavailable /
        timeout / network / http_error. Never logs or returns the key value.
        """
        if not self.configured():
            raise ProviderError(f"{self.id} has no API key.", category="invalid_key")

        system = "You are a connection check for an enterprise application."
        user = 'Reply with only this JSON object: {"status":"ok"}.'
        start = time.perf_counter()
        try:
            self._complete(system, user)
        except urllib.error.HTTPError as exc:
            category, message = classify_http_error(exc)
            raise ProviderError(message, category=category) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            category, message = classify_transport_error(exc)
            raise ProviderError(message, category=category) from exc
        except Exception as exc:  # noqa: BLE001 -- never leak provider internals
            raise ProviderError(
                f"Unexpected error: {type(exc).__name__}", category="unknown"
            ) from exc

        latency_ms = int((time.perf_counter() - start) * 1000)
        return {"ok": True, "model": self.model_name(), "latency_ms": latency_ms}

    # -- small helpers for subclasses -------------------------------------

    @staticmethod
    def _messages(system: str, user: str) -> List[Dict[str, str]]:
        return [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
