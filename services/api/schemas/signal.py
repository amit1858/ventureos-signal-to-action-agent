"""Signal contracts -- a normalized customer signal from a source system."""

from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field


class SignalPolarity(str, Enum):
    """Whether a signal is good news, bad news, or neutral context."""

    positive = "positive"
    negative = "negative"
    neutral = "neutral"


class Signal(BaseModel):
    """A single normalized signal attached to an account.

    Signals are the raw fuel of the workflow. The Signal Ingestion Agent loads
    and groups these; downstream agents turn them into evidence.
    """

    signal_id: str = Field(..., description="Stable unique id, e.g. SIG-00042")
    account_id: str = Field(..., description="Account this signal belongs to")
    signal_type: str = Field(
        ...,
        description="e.g. usage_spike, usage_drop, support_ticket, payment_delay, "
        "campaign_click, login_drop, renewal_upcoming, nps_response",
    )
    signal_date: date = Field(..., description="Date the signal was observed")
    signal_strength: float = Field(
        ..., ge=0.0, le=1.0, description="Normalized magnitude 0..1 (1 = very strong)"
    )
    signal_description: str = Field(..., description="Human-readable description")
    source_system: str = Field(
        ..., description="Originating system: CRM, Billing, Support, Telemetry, Marketing"
    )
    positive_or_negative: SignalPolarity = Field(
        ..., description="Signal polarity used by health/opportunity agents"
    )
