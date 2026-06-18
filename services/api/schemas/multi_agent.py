"""Phase 7 -- Multi-Agent Strategic Reasoning contracts.

Specialist agents that reason independently over the SAME deterministic context
and collaborate to produce a richer narrative. They never change ranking,
scoring, confidence, governance or CRM write-back -- the Governed Decision
Engine remains the source of truth. Every agent output is independent and
visible; no agent overwrites another.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class AgentAttribution(BaseModel):
    """Provider attribution for a single agent output."""

    provider: str = "deterministic"
    model: str = "governed-engine"
    mode: str = "deterministic"  # deterministic | live | fallback | not_configured
    latency_ms: int = 0


class RiskAssessment(BaseModel):
    objective: str = "Identify churn, adoption, support and renewal risks."
    risk_level: str = "low"
    risk_drivers: List[str] = Field(default_factory=list)
    risk_evidence: List[str] = Field(default_factory=list)
    risk_narrative: str = ""
    recommended_mitigation: str = ""
    confidence: str = "medium"
    attribution: AgentAttribution = Field(default_factory=AgentAttribution)


class GrowthAssessment(BaseModel):
    objective: str = "Identify expansion, upsell and renewal acceleration."
    opportunity_level: str = "low"
    opportunity_drivers: List[str] = Field(default_factory=list)
    opportunity_evidence: List[str] = Field(default_factory=list)
    growth_narrative: str = ""
    suggested_motion: str = ""
    confidence: str = "medium"
    attribution: AgentAttribution = Field(default_factory=AgentAttribution)


class ResearchAssessment(BaseModel):
    objective: str = "Analyse external market intelligence (advisory)."
    market_themes: List[str] = Field(default_factory=list)
    competitor_activity: List[str] = Field(default_factory=list)
    company_developments: List[str] = Field(default_factory=list)
    industry_context: str = ""
    relevance_score: str = "low"
    sources: List[str] = Field(default_factory=list)
    narrative: str = ""
    confidence: str = "low"
    attribution: AgentAttribution = Field(default_factory=AgentAttribution)


class EngagementPlan(BaseModel):
    objective: str = "Generate seller-ready actions (advisory, approval-gated)."
    executive_summary: str = ""
    opening_line: str = ""
    conversation_strategy: List[str] = Field(default_factory=list)
    outreach_recommendation: str = ""
    crm_note_draft: str = ""
    follow_up_suggestion: str = ""
    confidence: str = "medium"
    attribution: AgentAttribution = Field(default_factory=AgentAttribution)


class GovernanceReview(BaseModel):
    objective: str = "Challenge every recommendation; surface what cannot be proven."
    evidence_sufficiency: str = "medium"  # low | medium | high
    contradictions: List[str] = Field(default_factory=list)
    unsupported_claims: List[str] = Field(default_factory=list)
    risk_warnings: List[str] = Field(default_factory=list)
    blocked_actions: List[str] = Field(default_factory=list)
    confidence_assessment: str = "medium"
    summary: str = ""
    attribution: AgentAttribution = Field(default_factory=AgentAttribution)


class AgentReport(BaseModel):
    """Per-account multi-agent collaboration result."""

    account_id: str
    account_name: str
    generated_at: str
    provider_used: str = "deterministic"
    consensus_score: float = 1.0  # 0..1, agreement across the 4 reasoning agents
    consensus_label: str = "high"  # low | medium | high
    contradictions: List[str] = Field(default_factory=list)
    risk: RiskAssessment
    growth: GrowthAssessment
    research: ResearchAssessment
    engagement: EngagementPlan
    governance_review: GovernanceReview


class PortfolioPriority(BaseModel):
    account_id: str
    account_name: str
    priority_rank: int
    reason: str
    recommended_action: str


class PortfolioRecommendation(BaseModel):
    """Output of the Portfolio (Chief-of-Staff) agent across all accounts."""

    objective: str = "Allocate the seller's day across the full portfolio."
    generated_at: str
    provider_used: str = "deterministic"
    top_priorities: List[PortfolioPriority] = Field(default_factory=list)
    biggest_risk: Optional[PortfolioPriority] = None
    biggest_opportunity: Optional[PortfolioPriority] = None
    resource_allocation: str = ""
    portfolio_observations: List[str] = Field(default_factory=list)
    executive_summary: str = ""
    confidence: str = "medium"
    caveats: List[str] = Field(default_factory=list)
