"""Strict advisory result parsing (Step 4 enforcement).

Free-form model output never passes unchecked: the raw text must be a single strict-JSON
object that validates against :class:`AdvisoryModelOutput` (unknown fields forbidden,
score range-checked, enum + bounds enforced). Markdown-wrapped JSON, missing fields, extra
fields, out-of-range scores, and empty/oversized reasons all become a contained
``invalid_output`` provider error. Never raises.
"""

from __future__ import annotations

import json
from typing import Union

from pydantic import ValidationError

from decision_providers.llm_base import _redact_keys
from evals.nvidia_advisory.contracts import AdvisoryError, AdvisoryModelOutput


def parse_advisory_output(
    raw: str,
    *,
    scenario_id: str = "",
    deterministic_dimension: str = "",
    advisory_dimension: str = "",
    provider: str = "nvidia",
) -> Union[AdvisoryModelOutput, AdvisoryError]:
    """Parse + strictly validate raw model text. Returns the typed output or an error."""

    def _error(message: str) -> AdvisoryError:
        return AdvisoryError(
            scenario_id=scenario_id,
            deterministic_dimension=deterministic_dimension,
            advisory_dimension=advisory_dimension,
            status="provider_error",
            category="invalid_output",
            message=_redact_keys(message)[:240],
            provider=provider,
        )

    if raw is None or not str(raw).strip():
        return _error("empty provider response")

    text = str(raw).strip()
    # STRICT: only a bare JSON object is accepted. Markdown/code-fenced or prose-wrapped
    # output is treated as invalid and fails closed (never leniently unwrapped).
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return _error("advisory output was not strict JSON")

    if not isinstance(data, dict):
        return _error("advisory output was not a JSON object")

    try:
        return AdvisoryModelOutput(**data)
    except ValidationError as exc:
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(p) for p in first.get("loc", ())) or "output"
        msg = first.get("msg", "invalid advisory output")
        return _error(f"advisory schema violation at {loc}: {msg}")
    except (TypeError, ValueError) as exc:
        return _error(f"advisory output could not be validated: {type(exc).__name__}")
