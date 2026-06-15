"""SearchAPI.io external-signal provider (optional, dependency-free).

A live provider that queries the SearchAPI.io Google News engine for recent
company and industry news. Built entirely on the standard library (``urllib``)
so it adds **no new pip dependencies**, exactly like the Serper provider and the
HubSpot connector.

Why a separate provider: a SearchAPI.io key is not a Serper key, and the two
services speak different protocols. Forcing one onto the other would be brittle,
so Phase 4.1 adds this clean implementation selected by
``EXTERNAL_SIGNALS_PROVIDER=searchapi``.

Safety contract (must never destabilise the app):

* With no key it transparently falls back to the deterministic :class:`MockProvider`.
* On any network / HTTP / parse error it falls back to mock signals and never raises.
* The key is sent only in the ``Authorization: Bearer`` header (never in the URL
  or query string), and is never logged or returned. Using the header keeps the
  key out of any logged request URL.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Optional

from external_signals.base import ExternalSignal, ExternalSignalsProvider
from external_signals.mock_provider import MockProvider, _news_url
from external_signals import signal_mapper

logger = logging.getLogger("signal_to_action.external_signals")

_SEARCHAPI_URL = "https://www.searchapi.io/api/v1/search"


class SearchApiProvider(ExternalSignalsProvider):
    """Live external context from SearchAPI.io, with a deterministic mock fallback."""

    name = "searchapi"

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

    def _get(self, query: str) -> Optional[dict]:
        # Key goes in the Authorization header, never the URL/query string.
        params = urllib.parse.urlencode(
            {"engine": "google_news", "q": query, "num": self.max_results}
        )
        req = urllib.request.Request(
            f"{_SEARCHAPI_URL}?{params}",
            method="GET",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    @staticmethod
    def _source_name(item: dict) -> str:
        src = item.get("source")
        if isinstance(src, dict):
            return (src.get("name") or src.get("title") or "Web").strip()
        return (src or "Web").strip()

    def _map_item(self, item: dict) -> Optional[ExternalSignal]:
        title = (item.get("title") or "").strip()
        if not title:
            return None
        snippet = (item.get("snippet") or item.get("description") or "").strip()
        stype = signal_mapper.classify_signal_type(f"{title} {snippet}")
        return ExternalSignal(
            signal_type=stype,
            title=title,
            summary=snippet or title,
            source=self._source_name(item),
            url=item.get("link") or item.get("url"),
            published_at=item.get("date") or item.get("published_at"),
            confidence="medium",
            relevance="medium",
            impact=signal_mapper.impact_for_type(stype),
            seller_takeaway=None,
        )

    def _search(self, query: str) -> List[ExternalSignal]:
        data = self._get(query)
        if not data:
            return []
        items = (
            data.get("news_results")
            or data.get("organic_results")
            or data.get("articles")
            or []
        )
        signals: List[ExternalSignal] = []
        for item in items[: self.max_results]:
            sig = self._map_item(item)
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
            logger.warning("SearchAPI search failed (%s); using mock external signals.", type(exc).__name__)
            self.last_mode = "fallback"
            return self._fallback.search_company_context(company_name, industry, region)
        if not signals:
            self.last_mode = "fallback"
            return self._fallback.search_company_context(company_name, industry, region)
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
            logger.warning("SearchAPI industry search failed (%s); using mock context.", type(exc).__name__)
            self.last_mode = "fallback"
            return self._fallback.get_industry_context(industry, region)
        if signals:
            self.last_mode = "live"
            return signals
        self.last_mode = "fallback"
        return self._fallback.get_industry_context(industry, region)
