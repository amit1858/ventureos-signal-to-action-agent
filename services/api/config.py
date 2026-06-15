"""Centralized application configuration -- the single source of truth for env.

Every operationally-relevant environment variable is read here, in one place,
exactly once per process (``get_settings`` is cached). Components ask
:func:`get_settings` for their values instead of calling ``os.getenv`` directly,
so there is one obvious place to see and validate the whole runtime contract.

Design rules (intentionally boring and predictable):
* Read env lazily (first ``get_settings()`` call), after ``load_dotenv()`` has run.
* Never raise on bad/missing config -- collect human-readable warnings instead
  (see :meth:`Settings.warnings`) and let the app start. Missing config should be
  a *warning*, never a surprise crash.
* Never expose secrets. :meth:`Settings.sanitized` returns booleans for token
  presence, never the tokens themselves.

The HubSpot custom-property prefix (``HUBSPOT_PROPERTY_PREFIX``) is intentionally
left as a domain constant inside ``crm_connectors.hubspot_mapper`` -- it is part
of the mapping logic, not an operational toggle.
"""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from typing import List

# -- provider taxonomy ----------------------------------------------------

#: Provider ids that route to the NVIDIA NIM / Nemotron adapter.
NVIDIA_PROVIDERS = {"nvidia", "nvidia-nim", "nim", "nemotron"}
#: Provider ids that are declared but not yet implemented (placeholders).
PLACEHOLDER_PROVIDERS = {"openai", "claude", "anthropic"}
#: Everything the factory understands today (anything else -> mock + warning).
KNOWN_PROVIDERS = {"mock"} | NVIDIA_PROVIDERS | PLACEHOLDER_PROVIDERS

#: External (outside-in) signal providers the factory understands.
EXTERNAL_SIGNAL_PROVIDERS = {"mock", "serper", "searchapi"}

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_TRUE = {"1", "true", "yes", "on"}


def _flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _str(name: str, default: str = "") -> str:
    return (os.getenv(name, default) or "").strip()


@dataclass(frozen=True)
class Settings:
    """Immutable snapshot of the runtime configuration."""

    # -- app ---------------------------------------------------------------
    api_version: str = "0.1.0"
    cors_origins: str = "*"
    log_level: str = "INFO"
    db_path: str = field(default_factory=lambda: os.path.join(_API_DIR, "signal_to_action.db"))

    # -- model provider ----------------------------------------------------
    model_provider: str = "mock"
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/nemotron-4-340b-instruct"
    nvidia_timeout: float = 30.0
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # -- HubSpot connector -------------------------------------------------
    hubspot_enabled: bool = False
    hubspot_token: str = ""
    hubspot_portal_id: str = ""
    hubspot_writeback_enabled: bool = False
    hubspot_sync_limit: int = 100
    hubspot_base_url: str = "https://api.hubapi.com"
    hubspot_timeout: float = 30.0
    hubspot_auto_sync_on_startup: bool = False
    hubspot_refresh_interval_seconds: int = 0

    # -- external (outside-in) signals -------------------------------------
    external_signals_enabled: bool = False
    external_signals_provider: str = "mock"
    serper_api_key: str = ""
    searchapi_api_key: str = ""
    external_signals_cache_ttl_minutes: int = 1440
    external_signals_refresh_limit: int = 10

    # -- derived -----------------------------------------------------------

    @classmethod
    def load(cls) -> "Settings":
        """Build a Settings snapshot from the current environment."""
        return cls(
            cors_origins=_str("CORS_ORIGINS", "*") or "*",
            log_level=_str("LOG_LEVEL", "INFO") or "INFO",
            db_path=os.getenv("DB_PATH") or os.path.join(_API_DIR, "signal_to_action.db"),
            model_provider=(_str("MODEL_PROVIDER", "mock") or "mock").lower(),
            nvidia_api_key=_str("NVIDIA_API_KEY"),
            nvidia_base_url=_str("NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/"),
            nvidia_model=_str("NVIDIA_NIM_MODEL", "nvidia/nemotron-4-340b-instruct"),
            nvidia_timeout=_float("NVIDIA_NIM_TIMEOUT", 30.0),
            openai_api_key=_str("OPENAI_API_KEY"),
            anthropic_api_key=_str("ANTHROPIC_API_KEY"),
            hubspot_enabled=_flag("HUBSPOT_ENABLED", False),
            hubspot_token=_str("HUBSPOT_ACCESS_TOKEN"),
            hubspot_portal_id=_str("HUBSPOT_PORTAL_ID"),
            hubspot_writeback_enabled=_flag("HUBSPOT_WRITEBACK_ENABLED", False),
            hubspot_sync_limit=_int("HUBSPOT_SYNC_LIMIT", 100),
            hubspot_base_url=_str("HUBSPOT_BASE_URL", "https://api.hubapi.com").rstrip("/"),
            hubspot_timeout=_float("HUBSPOT_TIMEOUT", 30.0),
            hubspot_auto_sync_on_startup=_flag("HUBSPOT_AUTO_SYNC_ON_STARTUP", False),
            hubspot_refresh_interval_seconds=_int("HUBSPOT_REFRESH_INTERVAL_SECONDS", 0),
            external_signals_enabled=_flag("EXTERNAL_SIGNALS_ENABLED", False),
            external_signals_provider=(_str("EXTERNAL_SIGNALS_PROVIDER", "mock") or "mock").lower(),
            serper_api_key=_str("SERPER_API_KEY"),
            searchapi_api_key=_str("SEARCHAPI_API_KEY"),
            external_signals_cache_ttl_minutes=_int("EXTERNAL_SIGNALS_CACHE_TTL_MINUTES", 1440),
            external_signals_refresh_limit=_int("EXTERNAL_SIGNALS_REFRESH_LIMIT", 10),
        )

    @property
    def hubspot_configured(self) -> bool:
        """A token is present (the connector can attempt live calls)."""
        return bool(self.hubspot_token)

    @property
    def hubspot_ready(self) -> bool:
        """Enabled *and* configured -- safe to attempt a startup/refresh sync."""
        return self.hubspot_enabled and self.hubspot_configured

    @property
    def cors_allow_origins(self) -> List[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def provider_implemented(self) -> bool:
        """Whether the selected provider has a live code path today."""
        return self.model_provider == "mock" or self.model_provider in NVIDIA_PROVIDERS

    @property
    def external_signals_api_key(self) -> str:
        """The key for the configured external provider.

        Forgiving for the demo: the ``searchapi`` provider prefers
        ``SEARCHAPI_API_KEY`` but accepts ``SERPER_API_KEY`` if that is where the
        operator pasted the key, and vice versa. Returns "" for the mock provider.
        """
        provider = (self.external_signals_provider or "mock").lower()
        if provider == "searchapi":
            return self.searchapi_api_key or self.serper_api_key
        if provider == "serper":
            return self.serper_api_key or self.searchapi_api_key
        return ""

    @property
    def external_signals_live_ready(self) -> bool:
        """A live external provider is selected *and* has a usable key."""
        provider = (self.external_signals_provider or "mock").lower()
        return provider in {"serper", "searchapi"} and bool(self.external_signals_api_key)

    def warnings(self) -> List[str]:
        """Human-readable configuration warnings (logged at startup)."""
        w: List[str] = []
        p = self.model_provider
        if p not in KNOWN_PROVIDERS:
            w.append(f"Unknown MODEL_PROVIDER '{p}'; the mock provider will be used.")
        elif p in PLACEHOLDER_PROVIDERS:
            w.append(
                f"MODEL_PROVIDER '{p}' is a placeholder (not yet implemented); "
                "the mock provider will be used until it is wired."
            )
        elif p in NVIDIA_PROVIDERS and not self.nvidia_api_key:
            w.append(
                "MODEL_PROVIDER selects NVIDIA but NVIDIA_API_KEY is empty; "
                "narrative generation will fail until a key is set."
            )

        if self.hubspot_enabled and not self.hubspot_configured:
            w.append("HUBSPOT_ENABLED=true but HUBSPOT_ACCESS_TOKEN is empty; HubSpot stays off (synthetic data).")
        if self.hubspot_writeback_enabled and not self.hubspot_ready:
            w.append("HUBSPOT_WRITEBACK_ENABLED=true but HubSpot is not enabled+configured; write-back will be inert.")
        if self.hubspot_auto_sync_on_startup and not self.hubspot_ready:
            w.append("HUBSPOT_AUTO_SYNC_ON_STARTUP=true but HubSpot is not enabled+configured; startup stays on synthetic.")
        if self.hubspot_refresh_interval_seconds > 0 and not self.hubspot_ready:
            w.append("HUBSPOT_REFRESH_INTERVAL_SECONDS is set but HubSpot is not enabled+configured; background refresh will not run.")
        if 0 < self.hubspot_refresh_interval_seconds < 60:
            w.append("HUBSPOT_REFRESH_INTERVAL_SECONDS is below 60s; this may hit HubSpot rate limits.")

        if self.external_signals_enabled:
            ep = self.external_signals_provider
            if ep not in EXTERNAL_SIGNAL_PROVIDERS:
                w.append(f"Unknown EXTERNAL_SIGNALS_PROVIDER '{ep}'; the mock external-signal provider will be used.")
            elif ep in {"serper", "searchapi"} and not self.external_signals_api_key:
                key_var = "SEARCHAPI_API_KEY" if ep == "searchapi" else "SERPER_API_KEY"
                w.append(
                    f"EXTERNAL_SIGNALS_PROVIDER={ep} but {key_var} is empty; "
                    "falling back to mock external signals."
                )
        if (self.serper_api_key or self.searchapi_api_key) and not self.external_signals_enabled:
            w.append("An external-search API key is set but EXTERNAL_SIGNALS_ENABLED is false; the external-signal layer stays off.")

        if self.cors_origins.strip() == "*":
            w.append("CORS_ORIGINS=* allows any browser origin (fine for the demo; set your Vercel domain for production).")
        return w

    def sanitized(self) -> dict:
        """Secret-free snapshot for the /api/system/config diagnostics endpoint."""
        return {
            "api_version": self.api_version,
            "log_level": self.log_level,
            "cors_origins": self.cors_origins,
            "db_path": os.path.basename(self.db_path),
            "model_provider": self.model_provider,
            "provider_implemented": self.provider_implemented,
            "nvidia_configured": bool(self.nvidia_api_key),
            "nvidia_base_url": self.nvidia_base_url,
            "nvidia_model": self.nvidia_model,
            "openai_configured": bool(self.openai_api_key),
            "anthropic_configured": bool(self.anthropic_api_key),
            "hubspot_enabled": self.hubspot_enabled,
            "hubspot_configured": self.hubspot_configured,
            "hubspot_writeback_enabled": self.hubspot_writeback_enabled,
            "hubspot_portal_id": self.hubspot_portal_id or None,
            "hubspot_sync_limit": self.hubspot_sync_limit,
            "hubspot_base_url": self.hubspot_base_url,
            "hubspot_auto_sync_on_startup": self.hubspot_auto_sync_on_startup,
            "hubspot_refresh_interval_seconds": self.hubspot_refresh_interval_seconds,
            "external_signals_enabled": self.external_signals_enabled,
            "external_signals_provider": self.external_signals_provider,
            "serper_configured": bool(self.serper_api_key),
            "searchapi_configured": bool(self.searchapi_api_key),
            "external_signals_live_ready": self.external_signals_live_ready,
            "external_signals_cache_ttl_minutes": self.external_signals_cache_ttl_minutes,
            "external_signals_refresh_limit": self.external_signals_refresh_limit,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings snapshot (read once, then cached)."""
    return Settings.load()


def configure_logging(level: str = "INFO") -> logging.Logger:
    """Configure the ``signal_to_action`` logger tree once.

    Attaches a single stdout handler and disables propagation so messages are not
    duplicated by uvicorn's root logger. Idempotent.
    """
    lg = logging.getLogger("signal_to_action")
    if not lg.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S%z",
            )
        )
        lg.addHandler(handler)
        lg.propagate = False
    lg.setLevel(getattr(logging, level.upper(), logging.INFO))
    return lg
