"""Serper.dev external-signal provider (optional, dependency-free).

A live provider that queries the Serper.dev Google Search API for recent company
and industry news, built entirely on the standard library (``urllib``) -- exactly
like the HubSpot connector and the NVIDIA NIM adapter, so it adds **no new pip
dependencies**.

Safety contract (this provider must never destabilise the app):
* If no ``SERPER_API_KEY`` is configured, it transparently falls back to the
  deterministic :class:`MockProvider`.
* On any network / HTTP / parse error it falls back to mock signals and never
  raises. The service layer also wraps calls defensively.
* The API key is read from settings, sent only as the ``X-API-KEY`` header, and
  never logged or returned.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import List, Optional

from external_signals.base import ExternalSignal, ExternalSignalsProvider
from external_signals.mock_provider import MockProvider, _news_url
from external_signals import signal_mapper

logger = logging.getLogger("signal_to_action.external_signals")

_SERPER_NEWS_URL = "https://google.serper.dev/news"


class SerperProvider(ExternalSignalsProvider):
    """Live external context from Serper.dev, with a deterministic mock fallback."""

    name = "serper"

    def __init__(self, api_key: str = "", timeout: float = 10.0, max_results: int = 5) -> None:
        self.api_key = (api_key or "").strip()
        self.timeout = timeout
        self.max_results = max_results
        self._fallback = MockProvider()
        # live | fallback | mock -- what the most recent call actually used.
        # Pre-call sentinel: nothing live has been served yet. Set per call to
        # "live" (real results) or "fallback" (degraded to mock) by each search.
        self.last_mode = "mock"

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    # -- low-level HTTP ---------------------------------------------------

    def _post(self, query: str) -> Optional[dict]:
        body = json.dumps({"q": query, "num": self.max_results}).encode("utf-8")
        req = urllib.request.Request(
            _SERPER_NEWS_URL,
            data=body,
            method="POST",
            headers={
                "X-API-KEY": self.api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _map_news_item(self, item: dict) -> Optional[ExternalSignal]:
        title = (item.get("title") or "").strip()
        if not title:
            return None
        snippet = (item.get("snippet") or "").strip()
        stype = signal_mapper.classify_signal_type(f"{title} {snippet}")
        return ExternalSignal(
            signal_type=stype,
            title=title,
            summary=snippet or title,
            source=(item.get("source") or "Web").strip(),
            url=item.get("link"),
            published_at=item.get("date"),
            confidence="medium",
            relevance="medium",
            impact=signal_mapper.impact_for_type(stype),
            seller_takeaway=None,
        )

    def _search(self, query: str) -> List[ExternalSignal]:
        data = self._post(query)
        if not data:
            return []
        items = data.get("news") or data.get("organic") or []
        signals: List[ExternalSignal] = []
        for item in items[: self.max_results]:
            sig = self._map_news_item(item)
            if sig is not None:
                signals.append(sig)
        return signals

    # -- provider interface ----------------------------------------------

    def search_company_context(
        self, company_name: str, industry: str, region: str
    ) -> List[ExternalSignal]:
        if not self.configured:
            self.last_mode = "mock"
            return self._fallback.search_company_context(company_name, industry, region)
        query = " ".join(p for p in [company_name, industry, region] if p).strip()
        try:
            signals = self._search(query)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            logger.warning("Serper search failed (%s); using mock external signals.", type(exc).__name__)
            self.last_mode = "fallback"
            return self._fallback.search_company_context(company_name, industry, region)
        if not signals:
            self.last_mode = "fallback"
            return self._fallback.search_company_context(company_name, industry, region)
        # Ensure every signal has a useful link even if Serper omitted one.
        for s in signals:
            if not s.url:
                s.url = _news_url(company_name, s.title)
        self.last_mode = "live"
        return signals

    def get_industry_context(self, industry: str, region: str) -> List[ExternalSignal]:
        if not self.configured:
            self.last_mode = "mock"
            return self._fallback.get_industry_context(industry, region)
        query = " ".join(p for p in [industry, region, "market trends"] if p).strip()
        try:
            signals = self._search(query)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            logger.warning("Serper industry search failed (%s); using mock context.", type(exc).__name__)
            self.last_mode = "fallback"
            return self._fallback.get_industry_context(industry, region)
        if signals:
            self.last_mode = "live"
            return signals
        self.last_mode = "fallback"
        return self._fallback.get_industry_context(industry, region)
