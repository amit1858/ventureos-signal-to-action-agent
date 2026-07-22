"""Versioned mission templates -- Real HubSpot Signal Vertical Slice, Phase 2B.

Static, deterministic, LLM-free template registry. A template supplies the fixed
human-readable framing (title/objective/recommended next step) for a mission type
and is addressed by a stable ``template_id`` + ``template_version``. Rendering is
pure string substitution over evidence values -- no model, no network, no clock.

Adding a new mission type = add a sibling ``MissionTemplate`` entry; the selector
and repository do not change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Mapping


@dataclass(frozen=True)
class MissionTemplate:
    """One versioned framing for a mission type.

    ``title_template`` / ``objective`` / ``recommended_next_step`` are deterministic
    text. ``title_template`` may reference evidence fields by name via
    ``str.format`` (e.g. ``{account_ref}``, ``{old}``, ``{new}``). No field here
    grants any execution authority -- the recommended next step is advisory only."""

    template_id: str
    template_version: str
    mission_type: str
    title_template: str
    objective: str
    recommended_next_step: str

    def render_title(self, **evidence: str) -> str:
        try:
            return self.title_template.format(**evidence)
        except (KeyError, IndexError):
            # Fail safe to the unrendered template rather than raising: the title is
            # descriptive, never authoritative.
            return self.title_template


#: The renewal-risk template: the single configured framing for Phase 2B.
RENEWAL_RISK_V1 = MissionTemplate(
    template_id="renewal_risk",
    template_version="v1",
    mission_type="renewal_risk",
    title_template="Renewal risk: {account_ref} renewal moved earlier ({old} -> {new})",
    objective=(
        "Protect the at-risk renewal for this account after its renewal date moved "
        "earlier, and confirm the account is on track ahead of the new date."
    ),
    recommended_next_step=(
        "Review the account's renewal readiness and schedule a proactive check-in "
        "with the account owner before the new renewal date."
    ),
)


#: Registry keyed by (template_id, template_version). Add siblings to extend.
_TEMPLATES: Dict[tuple, MissionTemplate] = {
    (RENEWAL_RISK_V1.template_id, RENEWAL_RISK_V1.template_version): RENEWAL_RISK_V1,
}


class MissionTemplateError(KeyError):
    """No template is registered for the requested id/version (fail closed)."""


def get_template(template_id: str, template_version: str) -> MissionTemplate:
    """Resolve a versioned template. Raises :class:`MissionTemplateError` if absent
    -- the service maps that to ``selection_error`` and never fabricates framing."""
    try:
        return _TEMPLATES[(template_id, template_version)]
    except KeyError as exc:
        raise MissionTemplateError(
            f"no mission template registered for {template_id}/{template_version}."
        ) from exc


def registry() -> Mapping[tuple, MissionTemplate]:
    """Read-only view of the registered templates (for tests/inspection)."""
    return dict(_TEMPLATES)


__all__ = [
    "MissionTemplate",
    "MissionTemplateError",
    "RENEWAL_RISK_V1",
    "get_template",
    "registry",
]
