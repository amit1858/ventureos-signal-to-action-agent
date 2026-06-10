"""Model adapter interface -- the replaceable model-provider layer.

The whole point of this package is that the workflow never imports a concrete
model vendor. Agents depend only on :class:`ModelAdapter`. Today the active
implementation is the deterministic :class:`MockAdapter`; tomorrow it can be the
:class:`NvidiaNimAdapter` (NVIDIA NIM / Nemotron) -- with zero changes to agents.

    agents ---> ModelAdapter (interface) <--- MockAdapter | NvidiaNimAdapter
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum

from pydantic import BaseModel, Field


class GenerationTask(str, Enum):
    """The bounded set of generation tasks the workflow asks a model to do.

    Keeping this an enum (instead of free-form prompts) is what makes the system
    governable and testable: every model call has a known, typed purpose.
    """

    priority_reason = "priority_reason"
    risk_summary = "risk_summary"
    opportunity_summary = "opportunity_summary"
    email = "email"
    call_script = "call_script"
    voice_summary = "voice_summary"


class GenerationRequest(BaseModel):
    """A typed request to the model layer.

    ``payload`` carries the already-computed, deterministic facts (scores,
    evidence, the chosen action). The model's job is only to *phrase* them well,
    never to invent the underlying decision.
    """

    task: GenerationTask
    account_name: str
    payload: dict = Field(default_factory=dict)


class ModelResponse(BaseModel):
    """A typed response from the model layer."""

    text: str
    provider: str
    model: str
    tokens: int = 0
    latency_ms: int = 0


class ModelAdapter(ABC):
    """Interface every model provider must implement."""

    #: Short provider id surfaced in the ledger/UI, e.g. "mock" or "nvidia-nim".
    provider: str = "base"
    #: Human-friendly model name.
    model: str = "base"

    @abstractmethod
    def generate(self, request: GenerationRequest) -> ModelResponse:
        """Produce text for a single, typed generation task."""

    @abstractmethod
    def health(self) -> dict:
        """Return adapter health/readiness info for GET /api/health."""

    def describe(self) -> dict:
        """Static description of the active provider (for the UI status card)."""
        return {"provider": self.provider, "model": self.model}
