"""Signal Ingestion Agent.

Responsibility: load account + signal data, normalize signals, group them by
account, and emit a structured :class:`AccountContext` per account. This is the
entry point of the workflow -- it turns raw fragmented signals into clean,
typed context the downstream agents can reason over.
"""

from __future__ import annotations

from typing import List

from schemas.agent_outputs import AccountContext
from schemas.signal import SignalPolarity
from services import data_loader

AGENT_NAME = "Signal Ingestion Agent"


class SignalIngestionAgent:
    name = AGENT_NAME

    def run(self) -> List[AccountContext]:
        accounts = data_loader.load_accounts()
        signals = data_loader.signals_by_account()
        notes = data_loader.notes_by_account()

        contexts: List[AccountContext] = []
        for account in accounts:
            acc_signals = signals.get(account.account_id, [])
            acc_notes = notes.get(account.account_id, [])

            positive = sum(1 for s in acc_signals if s.positive_or_negative == SignalPolarity.positive)
            negative = sum(1 for s in acc_signals if s.positive_or_negative == SignalPolarity.negative)

            spend_delta = account.current_month_spend - account.previous_month_spend
            spend_delta_pct = (
                round(spend_delta / account.previous_month_spend * 100, 1)
                if account.previous_month_spend > 0
                else 0.0
            )

            contexts.append(
                AccountContext(
                    account=account,
                    signals=acc_signals,
                    notes=acc_notes,
                    positive_signal_count=positive,
                    negative_signal_count=negative,
                    spend_delta=round(spend_delta, 2),
                    spend_delta_pct=spend_delta_pct,
                )
            )
        return contexts
