"""Anthropic (Claude) decision provider (live when ``ANTHROPIC_API_KEY`` is set).

Talks to the Messages API over stdlib ``urllib``. Anthropic has no dedicated
JSON mode, so the strict-JSON prompt plus tolerant parsing in ``llm_base`` does
the work. The key is sent only in the ``x-api-key`` header and never logged.
"""

from __future__ import annotations

from typing import Any, Dict

from config import get_settings
from decision_providers.llm_base import LLMDecisionProvider, http_post_json


class AnthropicProvider(LLMDecisionProvider):
    id = "anthropic"
    label = "Anthropic Claude"

    def model_name(self) -> str:
        return self.session_model() or get_settings().anthropic_model

    def configured(self) -> bool:
        return bool(self.session_key()) or get_settings().anthropic_configured

    def _complete(self, system: str, user: str) -> str:
        settings = get_settings()
        api_key = self.session_key() or settings.anthropic_api_key
        base_url = self.session_base_url() or settings.anthropic_base_url
        url = f"{base_url}/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": settings.anthropic_version,
        }
        payload: Dict[str, Any] = {
            "model": self.model_name(),
            "max_tokens": 900,
            "temperature": 0.2,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        data = http_post_json(url, headers, payload, timeout=settings.decision_provider_timeout)
        # Messages API returns a list of content blocks; concatenate text blocks.
        blocks = data.get("content", [])
        text_parts = [b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"]
        return "".join(text_parts) or (blocks[0].get("text", "") if blocks else "")
