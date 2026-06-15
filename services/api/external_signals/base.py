"""External (outside-in) signal layer -- interface and typed contracts.

This package adds *supporting* public context (company news, market trends,
funding, leadership changes, expansion, layoffs, regulatory, competitive /
macroeconomic pressure) on top of a recommendation. It is intentionally
**decoupled** from the deterministic engine:

* External signals are NEVER the source of truth. Ranking, scoring, governance,
  confidence and CRM write-back stay 100% deterministic and internal.
* The layer is additive and optional. When ``EXTERNAL_SIGNALS_ENABLED`` is false
  (the default) every call returns a well-formed, empty, disabled result -- the
  product behaves exactly as before.
* Nothing here can crash the app: providers fall back to deterministic mock data
  and the service swallows provider errors.

    recommendation ---> ExternalSignalsProvider (interface)
                              <--- MockProvider | SerperProvider
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from pydantic import BaseModel, Field

# -- signal taxonomy ------------------------------------------------------

#: The bounded set of external signal types the UI knows how to present.
SIGNAL_TYPES = (
    "company_news",
    "market_trend",
    "funding",
    "leadership_change",
    "expansion",
    "layoffs",
    "regulatory",
    "competitive_pressure",
    "macroeconomic",
    "customer_growth_signal",
    "customer_risk_signal",
)

# Direction of an external signal from the seller's point of view.
IMPACT_POSITIVE = "positive"
IMPACT_NEGATIVE = "negative"
IMPACT_NEUTRAL = "neutral"

#: Shown on every external-signals response. The single most important guardrail.
EXTERNAL_CONTEXT_CAVEAT = (
    "External signals are supporting context only and should be verified by the "
    "seller before action. They never change ranking, scoring, governance, "
    "confidence or CRM write-back."
)


# -- typed models ---------------------------------------------------------


class ExternalSignal(BaseModel):
    """One piece of public, outside-in context about an account."""

    signal_type: str = Field(..., description="One of SIGNAL_TYPES")
    title: str = Field(..., description="Short headline")
    summary: str = Field(..., description="One- or two-sentence plain-English summary")
    source: str = Field(..., description="Publisher / surface the context came from")
    url: Optional[str] = Field(default=None, description="Link to read more (may be a search link)")
    published_at: Optional[str] = Field(default=None, description="ISO date if known")
    confidence: str = Field(default="medium", description="low | medium | high")
    relevance: str = Field(default="medium", description="How relevant to THIS account: low | medium | high")
    impact: str = Field(default=IMPACT_NEUTRAL, description="positive | negative | neutral (seller view)")
    seller_takeaway: Optional[str] = Field(default=None, description="What the seller should consider")


class ExternalSummary(BaseModel):
    """A rolled-up narrative for an account's external context."""

    summary: str = ""
    seller_takeaway: str = ""


class ExternalSignalsResult(BaseModel):
    """The response contract for GET /api/external-signals/{account_id}.

    Fully self-contained and decoupled from ``Recommendation`` so it can never
    affect the deterministic recommendation contract.
    """

    account_id: str
    account_name: str
    enabled: bool
    provider: str
    signals: List[ExternalSignal] = Field(default_factory=list)
    summary: str = ""
    seller_takeaway: str = ""
    caveat: str = EXTERNAL_CONTEXT_CAVEAT
    generated_at: Optional[str] = None
    cached: bool = False
    note: Optional[str] = Field(default=None, description="Why the layer is empty/disabled, when applicable")


class ExternalSignalsProvider(ABC):
    """Interface every external-signal provider must implement."""

    #: Short provider id surfaced in diagnostics, e.g. "mock" or "serper".
    name: str = "base"

    @abstractmethod
    def search_company_context(
        self, company_name: str, industry: str, region: str
    ) -> List[ExternalSignal]:
        """Return account-specific external context."""

    @abstractmethod
    def get_industry_context(self, industry: str, region: str) -> List[ExternalSignal]:
        """Return broader market/industry context (not company specific)."""

    def summarize_external_signals(self, account, search_results: List[ExternalSignal]) -> ExternalSummary:
        """Roll a list of signals up into an account-level narrative.

        Default implementation is deterministic and shared by every provider; it
        ties the external direction to the account's internal trajectory without
        ever changing the underlying numbers.
        """
        from external_signals.signal_mapper import summarize

        return summarize(account, search_results)
