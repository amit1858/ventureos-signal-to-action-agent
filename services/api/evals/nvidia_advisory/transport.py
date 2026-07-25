"""Live NVIDIA advisory transport (Step 7).

Reuses the existing stdlib HTTP client (``http_post_json``) and the shared error taxonomy
from ``decision_providers.llm_base`` — it is NOT a second independent HTTP client. It does
NOT modify the runtime ``NvidiaProvider`` (whose ``_complete`` is hardcoded to the decision
JSON shape). Instead it issues the evaluation-specific request: temperature 0, bounded
tokens, a correct ``Authorization: Bearer`` header, and the OpenAI-compatible chat shape
that NVIDIA NIM exposes. The API key is read from settings, sent only in the Authorization
header, and never logged or returned.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from config import Settings, get_settings
from decision_providers.llm_base import http_post_json

# Advisory replies are small, structured JSON — a tight token ceiling is enough and keeps
# latency and cost down.
DEFAULT_MAX_TOKENS = 700
DEFAULT_TEMPERATURE = 0.0


class NvidiaAdvisoryTransport:
    """A minimal, evaluation-scoped NVIDIA NIM caller."""

    def __init__(
        self,
        settings: Optional[Settings] = None,
        *,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        timeout: Optional[float] = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._max_tokens = max_tokens
        self._timeout = timeout if timeout is not None else self._settings.nvidia_timeout

    def configured(self) -> bool:
        return bool(self._settings.nvidia_api_key)

    def model_name(self) -> str:
        return self._settings.nvidia_model

    def base_url(self) -> str:
        return self._settings.nvidia_base_url

    def complete(self, system: str, user: str) -> str:
        """POST the evaluation prompt and return the raw model text. Raises on transport
        or HTTP error (the evaluator classifies and contains it)."""

        api_key = self._settings.nvidia_api_key
        url = f"{self._settings.nvidia_base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}"}
        payload: Dict[str, Any] = {
            "model": self.model_name(),
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": DEFAULT_TEMPERATURE,
            "max_tokens": self._max_tokens,
        }
        data = http_post_json(url, headers, payload, timeout=self._timeout)
        return data["choices"][0]["message"]["content"]
