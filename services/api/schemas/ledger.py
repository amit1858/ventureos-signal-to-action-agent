"""Decision ledger contracts -- the auditable trace of a workflow run.

The ledger is what makes this a *governed* system rather than a chatbot: every
run records which agents fired, how much evidence was used, the reasoning
summary, the confidence, the caveats, and the human-approval state.
"""

from __future__ import annotations

from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class LedgerAgentStep(BaseModel):
    """One agent's contribution within a single workflow run."""

    agent_name: str = Field(..., description="e.g. Account Health Agent")
    status: str = Field(..., description="completed | skipped | error")
    summary: str = Field(..., description="What this agent concluded, in one line")
    evidence_count: int = Field(0, ge=0, description="Evidence items this agent produced")
    duration_ms: int = Field(0, ge=0, description="Wall-clock time for this step")


class DecisionLedger(BaseModel):
    """The full, replayable trace returned alongside recommendations."""

    ledger_id: str = Field(..., description="Stable unique id, e.g. LDG-9f3a")
    timestamp: datetime = Field(..., description="When the run started (UTC)")
    user_query: str = Field(..., description="The natural-language business question")
    agents_invoked: List[str] = Field(default_factory=list)
    evidence_used: int = Field(0, ge=0, description="Total evidence items considered")
    reasoning_summary: str = Field(..., description="How the workflow reached its ranking")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Aggregate confidence 0..1")
    caveats: List[str] = Field(default_factory=list, description="Governance caveats for the run")
    final_recommendation: str = Field(..., description="One-line summary of the top action set")
    approval_status: str = Field(
        "pending_human_approval",
        description="Run-level gate; individual actions stay pending until a human acts",
    )
    steps: List[LedgerAgentStep] = Field(default_factory=list, description="Per-agent trace")
    model_provider: str = Field(..., description="Active model adapter, e.g. mock | nvidia-nim")
    latency_ms: int = Field(0, ge=0, description="Total run latency")
    data_source: str = Field(
        "Synthetic local dataset",
        description="Active data source for this run: 'Synthetic local dataset' | 'HubSpot test CRM'",
    )
