"""Orchestrator -- coordinates the controlled multi-agent workflow.

Sequence (fixed and auditable):

    Signal Ingestion -> [score all] -> Account Health -> Opportunity
                     -> Governance -> (route by query) -> Action -> Communication

Deterministic scoring + the first four agents run for *every* account (cheap, no
model calls). The query is then used to filter/rank candidates, and only the top
``limit`` accounts get an Action proposal, model-generated explanations, and
seller-ready communications. Every run produces a DecisionLedger.

This module is intentionally framework-free so it can later be mapped onto
NVIDIA NeMo Agent Toolkit / NemoClaw without changing the agent contracts.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, List, Optional, Tuple

from agents.account_health_agent import AccountHealthAgent
from agents.action_agent import ActionAgent
from agents.communication_agent import CommunicationAgent
from agents.governance_agent import GovernanceAgent
from agents.opportunity_agent import OpportunityAgent
from agents.signal_ingestion_agent import SignalIngestionAgent
from model_adapters import GenerationRequest, GenerationTask, ModelAdapter, get_model_adapter
from schemas.agent_outputs import (
    AccountContext,
    GovernanceAssessment,
    HealthAssessment,
    OpportunityAssessment,
)
from schemas.ledger import DecisionLedger, LedgerAgentStep
from schemas.recommendation import ApprovalStatus, Recommendation, ScoreBreakdown
from services import scoring_service

AGENT_SEQUENCE = [
    "Signal Ingestion Agent",
    "Account Health Agent",
    "Opportunity Agent",
    "Governance Agent",
    "Action Agent",
    "Communication Agent",
]


@dataclass
class AccountAnalysis:
    """Per-account intermediate state carried through the workflow."""

    context: AccountContext
    breakdown: ScoreBreakdown
    health: HealthAssessment
    opportunity: OpportunityAssessment
    governance: GovernanceAssessment


def _short_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


class Orchestrator:
    def __init__(self, adapter: Optional[ModelAdapter] = None):
        self.adapter = adapter or get_model_adapter()
        self.ingestion = SignalIngestionAgent()
        self.health_agent = AccountHealthAgent()
        self.opportunity_agent = OpportunityAgent()
        self.governance_agent = GovernanceAgent()
        self.action_agent = ActionAgent()
        self.comms_agent = CommunicationAgent(self.adapter)

    # -- public API -------------------------------------------------------

    def run(self, query: str, limit: int = 10) -> Tuple[List[Recommendation], DecisionLedger]:
        t0 = time.perf_counter()
        timings = {name: 0.0 for name in AGENT_SEQUENCE}

        # 1) Signal ingestion (all accounts)
        s = time.perf_counter()
        contexts = self.ingestion.run()
        timings["Signal Ingestion Agent"] += time.perf_counter() - s
        total_signals = sum(len(c.signals) for c in contexts)

        # 2-4) Score + health + opportunity + governance (all accounts, no model)
        analyses: List[AccountAnalysis] = []
        for ctx in contexts:
            breakdown = scoring_service.compute_breakdown(ctx.account)

            s = time.perf_counter()
            health = self.health_agent.run(ctx, breakdown)
            timings["Account Health Agent"] += time.perf_counter() - s

            s = time.perf_counter()
            opportunity = self.opportunity_agent.run(ctx, breakdown)
            timings["Opportunity Agent"] += time.perf_counter() - s

            s = time.perf_counter()
            governance = self.governance_agent.run(ctx, breakdown, health, opportunity)
            timings["Governance Agent"] += time.perf_counter() - s

            analyses.append(AccountAnalysis(ctx, breakdown, health, opportunity, governance))

        # 5) Interpret the business question -> ordered candidate accounts
        ordered = self._route_query(query, analyses)
        top = ordered[:limit]

        # 6) Action + model explanations + communications (top accounts only)
        recommendations: List[Recommendation] = []
        surfaced_evidence = 0
        for rank, an in enumerate(top, start=1):
            s = time.perf_counter()
            action = self.action_agent.run(an.context, an.breakdown, an.health, an.opportunity, an.governance)
            timings["Action Agent"] += time.perf_counter() - s

            s = time.perf_counter()
            drivers = scoring_service.top_drivers(an.breakdown)
            priority_reason = self._generate(
                GenerationTask.priority_reason,
                an.context.account.account_name,
                {"priority_rank": rank, "priority_score": an.breakdown.priority_score, "top_drivers": drivers},
            )
            risk_summary = (
                self._generate(
                    GenerationTask.risk_summary,
                    an.context.account.account_name,
                    {"risk_factors": an.health.risk_factors},
                )
                if an.health.risk_factors
                else an.health.health_summary
            )
            opportunity_summary = (
                self._generate(
                    GenerationTask.opportunity_summary,
                    an.context.account.account_name,
                    {"opportunity_factors": an.opportunity.opportunity_factors},
                )
                if an.opportunity.opportunity_factors
                else an.opportunity.opportunity_summary
            )
            comms = self.comms_agent.run(an.context, action, an.health, an.opportunity, an.breakdown, rank)
            timings["Communication Agent"] += time.perf_counter() - s

            evidence = list(an.health.evidence) + list(an.opportunity.evidence)
            surfaced_evidence += len(evidence)

            recommendations.append(
                Recommendation(
                    recommendation_id=_short_id("REC"),
                    account_id=an.context.account.account_id,
                    account_name=an.context.account.account_name,
                    priority_rank=rank,
                    priority_score=an.breakdown.priority_score,
                    priority_reason=priority_reason,
                    risk_summary=risk_summary,
                    opportunity_summary=opportunity_summary,
                    recommended_action=action.recommended_action,
                    action_type=action.action_type,
                    confidence_score=an.governance.confidence_score,
                    evidence=evidence,
                    governance_caveats=an.governance.caveats,
                    governance_status=an.governance.governance_status,
                    draft_email=comms.draft_email,
                    call_script=comms.call_script,
                    voice_summary=comms.voice_summary,
                    approval_status=ApprovalStatus.pending,
                    score_breakdown=an.breakdown,
                    agents_invoked=list(AGENT_SEQUENCE),
                )
            )

        total_latency_ms = int((time.perf_counter() - t0) * 1000)
        ledger = self._build_ledger(
            query=query,
            contexts_count=len(contexts),
            total_signals=total_signals,
            analyses=analyses,
            recommendations=recommendations,
            surfaced_evidence=surfaced_evidence,
            timings=timings,
            latency_ms=total_latency_ms,
        )
        return recommendations, ledger

    # -- helpers ----------------------------------------------------------

    def _generate(self, task: GenerationTask, account_name: str, payload: dict) -> str:
        return self.adapter.generate(
            GenerationRequest(task=task, account_name=account_name, payload=payload)
        ).text

    def _route_query(self, query: str, analyses: List[AccountAnalysis]) -> List[AccountAnalysis]:
        """Map the natural-language question to a filter + sort strategy.

        Always falls back to a pure priority ranking so a run never returns empty.
        """
        q = query.lower()

        def by_priority(a: AccountAnalysis) -> float:
            return a.breakdown.priority_score

        filter_fn: Optional[Callable[[AccountAnalysis], bool]] = None
        sort_key: Callable[[AccountAnalysis], float] = by_priority
        reverse = True

        def has_support_ticket(a: AccountAnalysis) -> bool:
            return any(s.signal_type == "support_ticket" for s in a.context.signals)

        if "declining spend" in q and ("growth" in q or "potential" in q):
            filter_fn = lambda a: a.breakdown.spend_decline >= 0.10 and a.context.account.growth_potential_score >= 55
            sort_key = lambda a: a.opportunity.opportunity_score
        elif "support" in q and ("escalat" in q or "support-led" in q or "support led" in q or "risk" in q):
            filter_fn = lambda a: a.breakdown.support_risk >= 0.50 or has_support_ticket(a)
            sort_key = lambda a: a.breakdown.support_risk
        elif "campaign" in q or "responded to campaign" in q:
            filter_fn = lambda a: a.context.account.campaign_response_score >= 65 and a.context.account.last_contact_days > 30
            sort_key = lambda a: a.context.account.campaign_response_score
        elif "renewal" in q:
            filter_fn = lambda a: a.context.account.renewal_days <= 45
            sort_key = lambda a: a.breakdown.renewal_urgency
        elif "grow" in q and ("next month" in q or "most likely" in q):
            filter_fn = lambda a: a.context.account.growth_potential_score >= 50
            sort_key = lambda a: a.opportunity.opportunity_score
        elif "not be contacted" in q or "should not" in q or "do not contact" in q or "not contact" in q:
            filter_fn = lambda a: a.health.risk_score < 0.30 and a.opportunity.opportunity_score < 0.45
            sort_key = lambda a: a.health.risk_score
            reverse = False
        elif "weak evidence" in q or "manual" in q or "reviewed manually" in q:
            filter_fn = lambda a: a.governance.governance_status != "ok" or a.governance.evidence_count < 2
            sort_key = lambda a: a.governance.confidence_score
            reverse = False

        candidates = [a for a in analyses if filter_fn(a)] if filter_fn else list(analyses)
        if not candidates:  # robustness: never return an empty board
            candidates = list(analyses)
        candidates.sort(key=sort_key, reverse=reverse)
        return candidates

    def _build_ledger(
        self,
        query: str,
        contexts_count: int,
        total_signals: int,
        analyses: List[AccountAnalysis],
        recommendations: List[Recommendation],
        surfaced_evidence: int,
        timings: dict,
        latency_ms: int,
    ) -> DecisionLedger:
        n_at_risk = sum(1 for a in analyses if a.health.risk_score >= 0.5)
        n_opportunity = sum(1 for a in analyses if a.opportunity.opportunity_score >= 0.5)
        n_review = sum(1 for a in analyses if a.governance.governance_status != "ok")
        top_n = len(recommendations)

        health_ev = sum(len(r.evidence) for r in recommendations)  # surfaced evidence

        def ms(name: str) -> int:
            return int(timings.get(name, 0.0) * 1000)

        steps = [
            LedgerAgentStep(
                agent_name="Signal Ingestion Agent",
                status="completed",
                summary=f"Ingested {contexts_count} accounts and normalized {total_signals} signals.",
                evidence_count=total_signals,
                duration_ms=ms("Signal Ingestion Agent"),
            ),
            LedgerAgentStep(
                agent_name="Account Health Agent",
                status="completed",
                summary=f"Assessed risk across {contexts_count} accounts; {n_at_risk} flagged at elevated risk.",
                evidence_count=health_ev,
                duration_ms=ms("Account Health Agent"),
            ),
            LedgerAgentStep(
                agent_name="Opportunity Agent",
                status="completed",
                summary=f"Scored growth potential; {n_opportunity} accounts show clear upside.",
                evidence_count=0,
                duration_ms=ms("Opportunity Agent"),
            ),
            LedgerAgentStep(
                agent_name="Governance Agent",
                status="completed",
                summary=f"Checked evidence and confidence; {n_review} accounts require review. Human approval enforced.",
                evidence_count=0,
                duration_ms=ms("Governance Agent"),
            ),
            LedgerAgentStep(
                agent_name="Action Agent",
                status="completed",
                summary=f"Proposed a typed next-best action for the top {top_n} accounts.",
                evidence_count=0,
                duration_ms=ms("Action Agent"),
            ),
            LedgerAgentStep(
                agent_name="Communication Agent",
                status="completed",
                summary=f"Drafted seller-ready comms for top {top_n} accounts via the {self.adapter.provider} adapter.",
                evidence_count=0,
                duration_ms=ms("Communication Agent"),
            ),
        ]

        confidences = [r.confidence_score for r in recommendations]
        avg_conf = round(sum(confidences) / len(confidences), 4) if confidences else 0.0

        caveats = [
            "All recommendations require explicit human approval before any action is executed.",
            "Recommendations are generated from synthetic demonstration data.",
        ]
        if any(r.confidence_score < 0.55 for r in recommendations):
            caveats.append("Some surfaced accounts have limited evidence and are flagged for manual review.")

        if recommendations:
            top = recommendations[0]
            final = f"Top action: {top.recommended_action} for {top.account_name} (rank #1)."
        else:
            final = "No accounts matched the query criteria."

        reasoning = (
            f"Ranked {contexts_count} accounts with a deterministic priority score (support risk, "
            f"spend movement, growth potential, renewal urgency, engagement and contact recency). "
            f"Interpreted the query and surfaced the top {top_n}. The {self.adapter.provider} model "
            f"adapter generated explanations and seller-ready drafts. Every action is pending human approval."
        )

        return DecisionLedger(
            ledger_id=_short_id("LDG"),
            timestamp=datetime.now(timezone.utc),
            user_query=query,
            agents_invoked=list(AGENT_SEQUENCE),
            evidence_used=surfaced_evidence,
            reasoning_summary=reasoning,
            confidence_score=avg_conf,
            caveats=caveats,
            final_recommendation=final,
            approval_status="pending_human_approval",
            steps=steps,
            model_provider=self.adapter.provider,
            latency_ms=latency_ms,
        )
