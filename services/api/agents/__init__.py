"""The six workflow agents plus the orchestrator that coordinates them.

Each agent has a single responsibility and a typed input/output contract
(see schemas/agent_outputs.py). This is a *controlled* multi-agent workflow,
not a free-form chatbot: the orchestrator runs the agents in a fixed sequence
and records every step in the decision ledger.

    Signal Ingestion -> Account Health -> Opportunity
                     -> Governance -> Action -> Communication
"""

from agents.signal_ingestion_agent import SignalIngestionAgent
from agents.account_health_agent import AccountHealthAgent
from agents.opportunity_agent import OpportunityAgent
from agents.governance_agent import GovernanceAgent
from agents.action_agent import ActionAgent
from agents.communication_agent import CommunicationAgent
from agents.orchestrator import Orchestrator, AGENT_SEQUENCE

__all__ = [
    "SignalIngestionAgent",
    "AccountHealthAgent",
    "OpportunityAgent",
    "GovernanceAgent",
    "ActionAgent",
    "CommunicationAgent",
    "Orchestrator",
    "AGENT_SEQUENCE",
]
