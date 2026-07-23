"""Fail-closed configuration for the live HubSpot signal slice -- Phase 2A.

Deliberately SELF-CONTAINED (it does not touch the shared ``config.py``): the
live-signal slice owns its own operational contract so the near-protected central
config stays unchanged and HubSpot change semantics do not leak into it.

Every default is safe/closed:

* the slice is OFF unless ``LIVE_SIGNALS_ENABLED`` is truthy,
* an empty allow-list DENIES (never "allow all"),
* there is NO wildcard support -- a ``*`` token grants nothing,
* a malformed / blank value DENIES,
* while enabled, a missing ``LIVE_SIGNALS_DB_PATH`` fails closed,
* nothing here reads or logs a token or the environment as a whole.

Values are read from the local process environment only (populated from a local
``.env`` that is never committed). This module reads env at construction time via
:meth:`LiveSignalSettings.from_env`; callers construct it explicitly so tests can
inject an env mapping deterministically.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional

#: Default monitored CRM property (an absolute ISO ``date``). Chosen because it
#: maps 1:1 to the frozen detector's ``renewal_date`` normalization and is
#: clock-independent (unlike a relative "days from now" integer). The property is
#: configurable via ``LIVE_SIGNAL_MONITORED_PROPERTY`` so other CRM providers can
#: monitor a differently-named field without any detector change.
DEFAULT_MONITORED_PROPERTY = "s2a_renewal_date"

_TRUE = {"1", "true", "yes", "on"}
#: Tokens that must never be treated as an allow-list grant. ``*`` is explicitly
#: rejected so no wildcard/"allow all" can ever be configured by accident.
_WILDCARD_TOKENS = {"*", "all", "any"}


class LiveSignalConfigError(RuntimeError):
    """The live-signal slice is enabled but its configuration is not usable.

    Always fail closed: the adapter surfaces this as a refusal to read HubSpot,
    never as a silent "allow". The message is safe to show (no secrets)."""


def _flag(env: Mapping[str, str], name: str, default: bool = False) -> bool:
    raw = env.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE


def _str(env: Mapping[str, str], name: str, default: str = "") -> str:
    return (env.get(name, default) or "").strip()


def _parse_allowlist(raw: Optional[str]) -> frozenset:
    """CSV -> a set of exact-match ids. Fail closed:

    * ``None`` / blank -> empty set (DENY),
    * whitespace is trimmed and blank tokens dropped,
    * wildcard tokens (``*``/``all``/``any``) are DROPPED, never expanded,
    * membership is later tested by exact string equality only.
    """
    if not raw:
        return frozenset()
    tokens = set()
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        if token.lower() in _WILDCARD_TOKENS:
            # No wildcard support: a wildcard grants nothing.
            continue
        tokens.add(token)
    return frozenset(tokens)


@dataclass(frozen=True)
class LiveSignalSettings:
    """Immutable, fail-closed snapshot of the Phase 2A live-signal contract."""

    enabled: bool = False
    portal_allowlist: frozenset = frozenset()
    account_allowlist: frozenset = frozenset()
    db_path: str = ""
    monitored_property: str = DEFAULT_MONITORED_PROPERTY

    @classmethod
    def from_env(cls, env: Optional[Mapping[str, str]] = None) -> "LiveSignalSettings":
        env = os.environ if env is None else env
        prop = _str(env, "LIVE_SIGNAL_MONITORED_PROPERTY") or DEFAULT_MONITORED_PROPERTY
        return cls(
            enabled=_flag(env, "LIVE_SIGNALS_ENABLED", False),
            portal_allowlist=_parse_allowlist(env.get("LIVE_SIGNAL_PORTAL_ALLOWLIST")),
            account_allowlist=_parse_allowlist(env.get("LIVE_SIGNAL_ACCOUNT_ALLOWLIST")),
            db_path=_str(env, "LIVE_SIGNALS_DB_PATH"),
            monitored_property=prop,
        )

    # -- fail-closed predicates ------------------------------------------

    def account_allowed(self, account_id: Optional[str]) -> bool:
        """Exact-match membership. Blank input or empty allow-list -> DENY."""
        candidate = (account_id or "").strip()
        if not candidate or not self.account_allowlist:
            return False
        return candidate in self.account_allowlist

    def portal_allowed(self, portal_id: Optional[str]) -> bool:
        """Exact-match membership. Blank input or empty allow-list -> DENY."""
        candidate = (portal_id or "").strip()
        if not candidate or not self.portal_allowlist:
            return False
        return candidate in self.portal_allowlist

    def require_ready(self) -> None:
        """Validate the operational contract before any HubSpot use.

        Raises :class:`LiveSignalConfigError` (fail closed) when the slice is
        enabled but unusable. Does NOT check specific ids -- that ordering is the
        adapter's responsibility (account before network, portal before read)."""
        if not self.enabled:
            raise LiveSignalConfigError(
                "live signals are disabled (set LIVE_SIGNALS_ENABLED=true to enable)."
            )
        if not self.portal_allowlist:
            raise LiveSignalConfigError(
                "portal allow-list is empty; refusing to read any HubSpot portal."
            )
        if not self.account_allowlist:
            raise LiveSignalConfigError(
                "account allow-list is empty; refusing to read any HubSpot company."
            )
        if not self.db_path:
            raise LiveSignalConfigError(
                "LIVE_SIGNALS_DB_PATH is not set; a durable snapshot store is required."
            )
        if not self.monitored_property:
            raise LiveSignalConfigError("no monitored property is configured.")


__all__ = [
    "DEFAULT_MONITORED_PROPERTY",
    "LiveSignalConfigError",
    "LiveSignalSettings",
]
