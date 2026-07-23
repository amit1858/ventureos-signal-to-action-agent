"""NVIDIA-backed ExplanationProvider adapter -- Real HubSpot Signal Vertical Slice.

Purely additive bridge that lets the governed Explainability Layer OPTIONALLY use NVIDIA
(Nemotron) to improve the WORDING of an already-governed explanation. It implements the
local ``ExplanationProvider`` boundary that ``live_signals.explainability`` expects
(``configured()`` + ``generate_explanation(context)``) and nothing more.

Design (reported with code evidence in the phase notes):

* The existing ``NvidiaProvider.decide(DecisionContext) -> ProviderDecision`` is NOT used:
  ``decide`` requires a numeric CRM ``DecisionContext`` and returns a revenue *decision*
  keyed to ``ACTION_VOCAB`` -- it cannot return the five presentation fields an
  ``ExplanationResult`` needs, and asking it to would force fabricated CRM numbers.
* Instead this adapter reuses the provider's own public completion primitive
  ``NvidiaProvider._complete(system, user) -> str`` (the exact transport
  ``decide``/``ping`` use: key, base URL, model, timeout, redaction) with a purpose-built
  *explanation* prompt and a strict 5-field JSON contract, then maps that JSON into a
  text-only ``ProviderExplanationDraft``.

The existing ``NvidiaProvider``, ``LLMDecisionProvider`` and ``ProviderDecision``
contracts are imported and reused UNMODIFIED. This adapter adds no business logic.

Hard boundaries (this adapter NEVER):
* passes secrets, raw CRM payloads, or ledger contents to the model;
* changes mission type, priority, governance state, approval, or execution;
* bypasses the Explainability groundedness gate, calls HubSpot, or writes to any CRM.

Only the whitelisted, secret-free ``GovernedFacts.to_provider_context()`` dict is sent.
Every failure mode (unconfigured, config error, timeout / ProviderError, invalid
structure) raises or reports so the Explainability Layer returns its deterministic
fallback. The governed facts and deterministic status label are never altered here.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from decision_providers.base import InvalidDecisionError, parse_decision_json
from decision_providers.nvidia_provider import NvidiaProvider
from live_signals.explainability import ProviderExplanationDraft

NVIDIA_EXPLANATION_ADAPTER_VERSION = "LIVE-NVIDIA-EXPLANATION-ADAPTER-v1"

#: The five presentation fields the model may reword. Order-stable for prompting.
_DRAFT_FIELDS = (
    "headline",
    "narrative",
    "governance_explanation",
    "evidence_summary",
    "recommended_next_step",
)

#: Whitelisted governed-context keys the model is allowed to see. Any key outside this
#: set (should there ever be one) is dropped before the prompt is built -- defence in
#: depth on top of ``GovernedFacts.to_provider_context`` already being secret-free.
_ALLOWED_CONTEXT_KEYS = frozenset(
    {
        "account_display_name", "source_system", "signal_field", "previous_value",
        "current_value", "direction", "movement_summary", "mission_type", "priority",
        "governance_status", "failure_code", "identity_status", "approval_required",
        "approval_status", "execution_status", "executed", "replayed", "receipt_present",
        "provenance_mode",
    }
)

_SYSTEM_PROMPT = (
    "You are a governed explanation writer for an enterprise revenue platform. "
    "You are given deterministic, already-governed facts about ONE mission and you may "
    "only improve the WORDING of an explanation. Strict rules: "
    "(1) The deterministic facts are authoritative; rewrite wording only. "
    "(2) Do NOT add facts. Do NOT invent dates, amounts, names, or evidence. "
    "(3) Do NOT infer or claim approval; do NOT claim autonomous action. "
    "(4) Do NOT claim any real CRM write-back or HubSpot task; if execution happened it "
    "was SIMULATED only -- preserve the simulated-versus-real distinction exactly. "
    "(5) If identity was corroborated with a controlled offline source, never call it a "
    "live multi-source integration. "
    "(6) Give exactly ONE concise recommended next step, advisory only. "
    "(7) Target a spoken summary understandable in under 60 seconds. "
    "(8) Return ONLY a JSON object with these keys: "
    + ", ".join(_DRAFT_FIELDS)
    + ". No prose, no code fences."
)

_JSON_SHAPE = (
    '{"headline":"...","narrative":"...","governance_explanation":"...",'
    '"evidence_summary":"...","recommended_next_step":"..."}'
)


class NvidiaExplanationError(RuntimeError):
    """Contained adapter failure (transport, timeout, or invalid structure).

    Raised with a generic, secret-free message. The Explainability Layer catches any
    exception from ``generate_explanation`` and returns its deterministic fallback."""


def _sanitize_context(context: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only whitelisted, JSON-safe scalar values (defence in depth)."""
    clean: Dict[str, Any] = {}
    for key, value in (context or {}).items():
        if key not in _ALLOWED_CONTEXT_KEYS:
            continue
        if isinstance(value, (str, bool, int, float)) or value is None:
            clean[key] = value
    return clean


def build_explanation_prompt(context: Dict[str, Any]) -> str:
    """Build the user prompt from the whitelisted governed context only."""
    facts = _sanitize_context(context)
    return (
        "Governed facts (deterministic, authoritative):\n"
        + json.dumps(facts, indent=2, ensure_ascii=False, sort_keys=True)
        + "\n\nRewrite the explanation wording now as a JSON object with exactly these "
        "keys:\n" + _JSON_SHAPE
    )


def _draft_from_payload(payload: Dict[str, Any]) -> ProviderExplanationDraft:
    """Map a parsed JSON object into a text-only draft.

    Only the five presentation fields are read; any other key (including anything that
    looks like a governed state field) is ignored. Missing/blank fields stay ``None`` so
    the Explainability Layer keeps its deterministic text for them."""
    fields: Dict[str, Optional[str]] = {}
    for key in _DRAFT_FIELDS:
        value = payload.get(key)
        fields[key] = value.strip() if isinstance(value, str) and value.strip() else None
    # ``ProviderExplanationDraft`` uses ``extra="ignore"`` so smuggled state keys drop.
    return ProviderExplanationDraft(**fields)


class NvidiaExplanationProvider:
    """Optional NVIDIA overlay implementing the ``ExplanationProvider`` boundary.

    Reuses an injected (or default) ``NvidiaProvider`` for configuration and transport
    without modifying it. Construct with a fake in tests to stay fully offline."""

    def __init__(self, provider: Optional[NvidiaProvider] = None) -> None:
        self._provider = provider if provider is not None else NvidiaProvider()

    def configured(self) -> bool:
        """Delegate to the underlying provider; any error is treated as unconfigured."""
        try:
            return bool(self._provider.configured())
        except Exception:  # noqa: BLE001 - never let config probing raise into the gate
            return False

    def generate_explanation(self, context: Dict[str, Any]) -> ProviderExplanationDraft:
        """Reword the governed explanation via NVIDIA and return a text-only draft.

        Raises :class:`NvidiaExplanationError` on any transport/parse failure so the
        Explainability Layer falls back to deterministic text. Never leaks secrets."""
        system = _SYSTEM_PROMPT
        user = build_explanation_prompt(context)
        try:
            raw = self._provider._complete(system, user)  # noqa: SLF001 - reuse transport
        except Exception as exc:  # noqa: BLE001 - contain transport/timeout/provider errors
            raise NvidiaExplanationError(
                f"nvidia explanation call failed: {type(exc).__name__}"
            ) from exc

        try:
            payload = parse_decision_json(raw)
        except InvalidDecisionError as exc:
            raise NvidiaExplanationError("nvidia returned no valid JSON object") from exc

        return _draft_from_payload(payload)


__all__ = [
    "NVIDIA_EXPLANATION_ADAPTER_VERSION",
    "NvidiaExplanationError",
    "NvidiaExplanationProvider",
    "build_explanation_prompt",
]
