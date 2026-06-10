# HubSpot Test CRM Integration

An **optional** connector that lets the Signal-to-Action Agent prove it works against a real CRM
without ever touching real customer data. The same synthetic records the agent already uses can
be seeded into a **HubSpot test portal**, synced back, analysed, and — after human approval —
written back as a **task or note**.

The connector mirrors the philosophy of `model_adapters`: the workflow core never imports a CRM
vendor. Everything talks to the `CRMConnector` interface (`crm_connectors/base.py`).

---

## Design & safety

| Guarantee | How it is enforced |
|-----------|--------------------|
| Optional | `HUBSPOT_ENABLED=false` by default; the synthetic flow is untouched. |
| Never breaks the app | A missing/invalid token maps to a typed `CRMError` → friendly HTTP 4xx/5xx with a UI-safe `detail`. |
| No real data | Seeding only ever pushes the project's generated synthetic dataset. |
| No email | The connector has no email capability. |
| No autonomous write | Writes require `HUBSPOT_WRITEBACK_ENABLED=true`; task/note also require the recommendation to be **approved**. |
| Token safety | Token is read from env, sent only as a Bearer header, and never returned, logged, or placed in an error. |

### Error → HTTP mapping

| Error | HTTP | Meaning |
|-------|------|---------|
| `CRMDisabledError` | 409 | `HUBSPOT_ENABLED` is false |
| `CRMConfigError` | 409 | No access token |
| `CRMWritebackDisabledError` | 409 | `HUBSPOT_WRITEBACK_ENABLED` is false |
| `CRMAuthError` | 502 | HubSpot returned 401 (bad token) |
| `CRMScopeError` | 502 | HubSpot returned 403 (missing scope) |
| `CRMRequestError` | 502 | Other HubSpot/network failure |

---

## Configuration

```bash
HUBSPOT_ENABLED=false
HUBSPOT_ACCESS_TOKEN=            # private-app token for a TEST portal (never commit)
HUBSPOT_PORTAL_ID=               # optional; used for record deep-links
HUBSPOT_SYNC_LIMIT=100
HUBSPOT_WRITEBACK_ENABLED=false
# Advanced (sane defaults):
HUBSPOT_PROPERTY_PREFIX=s2a_
HUBSPOT_BASE_URL=https://api.hubapi.com
HUBSPOT_TIMEOUT=30
```

### Required private-app scopes

| Scope | Purpose |
|-------|---------|
| `crm.objects.companies.read` | Sync companies → accounts |
| `crm.objects.companies.write` | Seed demo companies |
| `crm.objects.contacts.read` / `.write` | Seed one contact per company |
| `crm.objects.deals.read` / `.write` | Optional deal/opportunity signals |
| `crm.schemas.companies.write` | *(optional)* create `s2a_*` custom score properties |

If `crm.schemas.companies.write` is missing, seeding falls back to standard properties and sync
derives deterministic demo scores from the company id — the scoring engine still works.

### Creating the token

1. In a **HubSpot test account**: Settings → Integrations → **Private Apps** → *Create a private app*.
2. Name it `signal-to-action-agent`, add the scopes above, create, and **copy the token**.
3. Paste into `HUBSPOT_ACCESS_TOKEN`, set `HUBSPOT_ENABLED=true`, and (for writes)
   `HUBSPOT_WRITEBACK_ENABLED=true`.

---

## Data mapping

### HubSpot Company → internal `Account`

| Account field | HubSpot source | Fallback when absent |
|---------------|----------------|----------------------|
| `account_id` | company `id` | — |
| `account_name` | `name` | `Company {id}` |
| `industry` | `industry` | `Technology` |
| `region` | `city` / `state` / `country` | deterministic from id |
| `segment` | `s2a_segment` / lifecycle | deterministic (`SMB`/`Startup`/…) |
| `current_month_spend` | `s2a_current_month_spend` or `annualrevenue/12` | deterministic |
| `previous_month_spend` | `s2a_previous_month_spend` | deterministic |
| `product_usage_score` | `s2a_product_usage_score` | deterministic 0–100 |
| `engagement_score` | `s2a_engagement_score` | deterministic 0–100 |
| `support_risk_score` | `s2a_support_risk_score` | deterministic 0–100 |
| `campaign_response_score` | `s2a_campaign_response_score` | deterministic 0–100 |
| `growth_potential_score` | `s2a_growth_potential_score` | deterministic 0–100 |
| `last_contact_days` | `s2a_last_contact_days` | deterministic |
| `renewal_days` | `s2a_renewal_days` | deterministic |

All deterministic fallbacks are derived from an MD5 of the company id, so a given company always
maps to the same scores (stable demos). Scores are clamped to the schema's `0..100` range.

### Derived signals (so agents have evidence)

Because a fresh test portal may have no associated engagements, `sync` deterministically derives
1–5 signals per account from its profile, matching the synthetic archetypes:

| Condition | Signal type | Polarity |
|-----------|-------------|----------|
| `support_risk_score ≥ 60` | `support_ticket` | negative |
| spend dropped ≥ 15% MoM | `usage_drop` | negative |
| `campaign_response ≥ 65` and `last_contact > 30d` | `campaign_click` | positive |
| `renewal_days ≤ 45` | `renewal_upcoming` | neutral |
| `growth_potential ≥ 70` and no spend drop | `usage_spike` | positive |

This keeps the Account Health, Opportunity, Governance and query-routing logic fully functional on
HubSpot-sourced data, with **no changes to the agents or orchestrator**.

### Other objects

- **Deals** → counted for sync telemetry; `deal_to_signal()` maps amount/stage/close-date to an
  opportunity signal when associated data is used.
- **Notes / Tasks** → `engagement_to_signal()` / `engagement_to_note()` map activity text to
  engagement/support signals.

---

## Endpoints

| Method | Endpoint | Notes |
|--------|----------|-------|
| `GET` | `/api/integrations/hubspot/status` | `?probe=true` makes one live read-only call |
| `POST` | `/api/integrations/hubspot/seed` | requires write-back gate |
| `POST` | `/api/integrations/hubspot/sync` | switches active dataset to HubSpot |
| `POST` | `/api/integrations/hubspot/use-synthetic` | revert to synthetic |
| `POST` | `/api/actions/{id}/hubspot-task` | requires prior approval |
| `POST` | `/api/actions/{id}/hubspot-note` | requires prior approval |
| `GET` | `/api/actions/{id}/writebacks` | audit list of writes for a recommendation |

The active data source is also stamped onto `RecommendationResponse.data_source` and
`DecisionLedger.data_source`, and a caveat is appended to the ledger when HubSpot is the source.

---

## Demo runbook

1. **Seed** (one-time): `.venv\Scripts\python.exe crm_connectors\hubspot_seed.py`
   (or `POST /api/integrations/hubspot/seed`). Open HubSpot → show the synthetic companies.
2. Open the agent UI → **CRM Integration** card shows **Connected**.
3. Click **Sync from HubSpot** → cards/ledger/runtime now show **Source: HubSpot test CRM**.
4. Run the workflow: *"Which SMB accounts need attention this week and why?"*
5. Select the top account → review evidence, confidence, governance, decision ledger.
6. **Approve** the recommendation.
7. **Create HubSpot task** (or note) → the result panel shows the external id (deep-link),
   timestamp, payload preview, and safety note.
8. Open HubSpot → show the task/note exists on the company.

Use **Use synthetic** in the CRM card at any time to return to the offline demo.

---

## Limitations / assumptions

- Single connector implementation (HubSpot); the interface is vendor-neutral.
- Deal-stage updates are intentionally **not** performed in v1 (read/annotate only).
- Sync telemetry counts (contacts/deals) are best-effort and capped at 100 for speed.
- Custom-property creation is best-effort; without schema-write scope the connector degrades to
  deterministic mapping with no loss of workflow function.
- The synced dataset lives in process memory (per the MVP's in-memory data loader); re-sync after
  an API restart.
