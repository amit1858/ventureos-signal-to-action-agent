"""OpenAI decision provider (live when ``OPENAI_API_KEY`` is set).

Talks to the Chat Completions API over stdlib ``urllib``. Uses JSON response
mode for reliability. The key is read from settings, sent only in the
Authorization header, and never logged or returned by any API.
"""

from __future__ import annotations

from typing import Any, Dict

from config import get_settings
from decision_providers.llm_base import LLMDecisionProvider, http_post_json


class OpenAIProvider(LLMDecisionProvider):
    id = "openai"
    label = "OpenAI"

    def model_name(self) -> str:
        return get_settings().openai_model

    def configured(self) -> bool:
        return get_settings().openai_configured

    def _complete(self, system: str, user: str) -> str:
        settings = get_settings()
        url = f"{settings.openai_base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
        payload: Dict[str, Any] = {
            "model": settings.openai_model,
            "messages": self._messages(system, user),
            "temperature": 0.2,
            "max_tokens": 900,
            "response_format": {"type": "json_object"},
        }
        data = http_post_json(url, headers, payload, timeout=settings.decision_provider_timeout)
        return data["choices"][0]["message"]["content"]
