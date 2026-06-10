"""Deterministic mock model adapter.

This is the MVP's active model provider. It produces deterministic, genuinely
useful, business-ready text from the structured ``payload`` -- no network, no
API key, no randomness. That determinism is exactly what we want for demos and
for the evaluation harness.

When NVIDIA access is available, swap to :class:`NvidiaNimAdapter` by setting
``MODEL_PROVIDER=nvidia-nim`` -- the agents do not change.
"""

from __future__ import annotations

import time

from model_adapters.base import (
    GenerationRequest,
    GenerationTask,
    ModelAdapter,
    ModelResponse,
)


def _money(value) -> str:
    try:
        return f"${float(value):,.0f}"
    except (TypeError, ValueError):
        return str(value)


def _lead_lower(text: str) -> str:
    """Lowercase only the first character (preserves acronyms like MoM/NPS)."""
    return text[0].lower() + text[1:] if text else text


class MockAdapter(ModelAdapter):
    """Template-driven, deterministic text generation."""

    provider = "mock"
    model = "mock-deterministic-v1"

    def generate(self, request: GenerationRequest) -> ModelResponse:
        start = time.perf_counter()
        task = request.task
        p = request.payload
        name = request.account_name

        if task == GenerationTask.priority_reason:
            text = self._priority_reason(name, p)
        elif task == GenerationTask.risk_summary:
            text = self._risk_summary(name, p)
        elif task == GenerationTask.opportunity_summary:
            text = self._opportunity_summary(name, p)
        elif task == GenerationTask.email:
            text = self._email(name, p)
        elif task == GenerationTask.call_script:
            text = self._call_script(name, p)
        elif task == GenerationTask.voice_summary:
            text = self._voice_summary(name, p)
        else:  # pragma: no cover - guarded by enum
            text = ""

        latency_ms = int((time.perf_counter() - start) * 1000)
        return ModelResponse(
            text=text.strip(),
            provider=self.provider,
            model=self.model,
            tokens=len(text.split()),
            latency_ms=latency_ms,
        )

    def health(self) -> dict:
        return {"provider": self.provider, "model": self.model, "ready": True, "mode": "deterministic"}

    # -- task templates ---------------------------------------------------

    def _priority_reason(self, name: str, p: dict) -> str:
        drivers = p.get("top_drivers") or []
        driver_text = "; ".join(drivers[:3]) if drivers else "a balanced risk/opportunity profile"
        rank = p.get("priority_rank", "top")
        return (
            f"{name} ranks #{rank} this week because of {driver_text}. "
            f"The combined priority score is {p.get('priority_score', 0):.2f} on a 0-1 scale, "
            f"weighting support risk, spend movement and growth potential most heavily."
        )

    def _risk_summary(self, name: str, p: dict) -> str:
        factors = p.get("risk_factors") or []
        if not factors:
            return f"No material risk factors detected for {name}; account health looks stable."
        lead = _lead_lower(factors[0])
        rest = [_lead_lower(f) for f in factors[1:]]
        body = f"{name} shows {lead}"
        if rest:
            body += " alongside " + ", ".join(rest)
        return body + ". These patterns typically precede churn or stalled growth if left unaddressed."

    def _opportunity_summary(self, name: str, p: dict) -> str:
        factors = p.get("opportunity_factors") or []
        if not factors:
            return f"Limited near-term expansion signal for {name}; keep monitoring."
        lead = _lead_lower(factors[0])
        rest = [_lead_lower(f) for f in factors[1:]]
        body = f"{name} has open upside from {lead}"
        if rest:
            body += " and " + ", ".join(rest)
        return body + ". A well-timed seller touch could convert this into expansion this quarter."

    def _email(self, name: str, p: dict) -> str:
        action = str(p.get("recommended_action", "a quick check-in")).rstrip(".")
        reason = p.get("headline_reason", "we noticed some changes in your account")
        spend_delta_pct = p.get("spend_delta_pct")
        value_line = ""
        if isinstance(spend_delta_pct, (int, float)) and spend_delta_pct <= -10:
            value_line = (
                f" We also noticed usage is down about {abs(spend_delta_pct):.0f}% recently, and want to "
                "make sure you're getting full value from what you're already paying for."
            )
        return (
            f"Subject: A quick idea for {name}\n\n"
            f"Hi {name} team,\n\n"
            f"I was reviewing your account and {reason}.{value_line}\n\n"
            f"Recommended next step: {action}.\n\n"
            "Would 20 minutes this week work? I'd be happy to share a couple of concrete, tailored "
            "suggestions for your team.\n\n"
            "Best regards,\nYour Account Team"
        )

    def _call_script(self, name: str, p: dict) -> str:
        action = str(p.get("recommended_action", "schedule a follow-up")).rstrip(".")
        action_lc = _lead_lower(action)
        risk = p.get("headline_risk", "recent changes in the account")
        opp = p.get("headline_opportunity", "a clear path to more value")
        return (
            f"CALL SCRIPT - {name}\n"
            f"1. Open: \"Hi, thanks for taking a moment. I wanted to reach out proactively about your account.\"\n"
            f"2. Reason: \"On our side we noticed {risk}. I want to make sure we get ahead of it.\"\n"
            f"3. Value: \"At the same time, I see {opp}, and I think there's an easy win here.\"\n"
            f"4. Ask: \"Could we set up time to {action_lc}? I can walk you through the specifics.\"\n"
            f"5. Close: \"Great - I'll send a calendar invite and a short summary so your team is aligned.\""
        )

    def _voice_summary(self, name: str, p: dict) -> str:
        action = p.get("recommended_action", "follow up")
        rank = p.get("priority_rank", "a top")
        return (
            f"{name} is priority number {rank} this week. "
            f"Recommended next step: {action.lower()}. Human approval required before anything is sent."
        )
