"""NVIDIA decision provider (live when ``NVIDIA_API_KEY`` is set).

NVIDIA NIM / Nemotron exposes an OpenAI-compatible Chat Completions API, so this
provider reuses that wire format over stdlib ``urllib``. Base URL and model are
configurable (``NVIDIA_BASE_URL`` / ``NVIDIA_MODEL``, with the older
``NVIDIA_NIM_*`` names accepted as aliases via settings). The key is sent only in
the Authorization header and never logged.
"""

from __future__ import annotations

from typing import Any, Dict

from config import get_settings
from decision_providers.llm_base import LLMDecisionProvider, http_post_json


class NvidiaProvider(LLMDecisionProvider):
    id = "nvidia"
    label = "NVIDIA Nemotron"

    def model_name(self) -> str:
        return self.session_model() or get_settings().nvidia_model

    def configured(self) -> bool:
        return bool(self.session_key()) or get_settings().nvidia_configured

    def _complete(self, system: str, user: str) -> str:
        settings = get_settings()
        api_key = self.session_key() or settings.nvidia_api_key
        base_url = self.session_base_url() or settings.nvidia_base_url
        url = f"{base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}"}
        payload: Dict[str, Any] = {
            "model": self.model_name(),
            "messages": self._messages(system, user),
            "temperature": 0.2,
            "max_tokens": 900,
        }
        data = http_post_json(url, headers, payload, timeout=settings.decision_provider_timeout)
        return data["choices"][0]["message"]["content"]
