# Phase 14E — External System Change Detection

**STATUS: READY FOR REVIEW**

## Goal (evolved scope per user)

Detect changes in the external data source (HubSpot or synthetic dataset), show what changed in executive language, name the agents that would react, and correlate each change with the most recent recommendation delta — so an executive instantly sees *what changed in the source, who reacted, and whether ranking moved*.

## Implementation

Frontend-only overlay. Strictly additive. ZERO change to ranking, scoring, governance, approval, Decision Ledger, lifecycle, CRM writeback, HubSpot connector contracts, agent orchestration, BYOK, backend APIs.

### Architecture

```
       backend /api/recommendations
                │
                ▼
        accounts[] + driftOverlay
                │
                ▼
    recordExternalSnapshot(accounts, {source, lastSync})
                │
                ▼
    diff vs prior snapshot (per-account, 6 dimensions)
                │
                ▼
    ExternalChangeEvent[]  ──┬── executive_summary
                             ├── reacting_agents (dimension → agents map)
                             ├── magnitude / impact classification
                             └── linked_delta (recommendation correlation)
                │
                ▼
    localStorage: s2a_ext_snapshot_v1 / s2a_ext_events_v1 / s2a_ext_meta_v1
                │
                ▼
    <ExternalChangeMonitorPanel /> rendered in Portfolio Intelligence zone
```

### Dimension → Agent map

| Dimension | Reacting agents |
|---|---|
| spend | Risk Agent, Opportunity Agent |
| support_risk | Risk Agent, Governance Agent |
| usage | Telemetry Agent, Risk Agent |
| engagement | Telemetry Agent, Opportunity Agent |
| renewal | Opportunity Agent, Governance Agent |
| growth_potential | Opportunity Agent |

### Magnitude thresholds

- **Spend** — pct change: ≥20% major · ≥10% moderate · ≥5% minor floor
- **Renewal (days)** — ≥14d major · ≥7d moderate · ≥3d minor floor
- **Score dims (0-100)** — ≥15pt major · ≥8pt moderate · ≥3pt minor floor

### Executive language

Each event renders a one-line summary keyed to the dimension:
- *"Acme's monthly spend dropped 25% in HubSpot test CRM since the last sync."*
- *"Beta's support risk climbed 18 points in HubSpot test CRM since the last sync."*
- *"Curefoods' renewal window tightened from 60d to 38d in HubSpot test CRM."*

## Files

| Status | Path | LOC |
|---|---|---|
| NEW | `apps/web/lib/externalChangeMonitor.ts` | ~330 |
| NEW | `apps/web/components/command/ExternalChangeMonitor.tsx` | ~265 |
| MOD | `apps/web/components/command/CommandCenter.tsx` | +13 |

## Validation

### Build
- `npx tsc --noEmit` → **EXIT 0**
- `npm run build` → **EXIT 0**, First Load JS **183 → 184 kB** (+1 kB rounded; selector + component live in same dynamic chunk)

### Harness (selector logic)

Validated against shimmed localStorage + shimmed `driftEngine` (empty overlay) + shimmed `recommendationDelta` (seeded delta).

Scenarios:
1. **Baseline run** (no prior snapshot) → 0 events ✓
2. **Mutation run**:
   - ACC-A spend 500k → 375k (-25%) → emits **spend / major / risk** event, linked_delta_id resolved ✓
   - ACC-B support_risk 30 → 48 (+18pts) → emits **support_risk / major / risk** event, reacting agents include Governance Agent ✓
   - ACC-D added → `records_added: 1` ✓
   - ACC-C removed → `records_removed: 1` ✓
   - Executive summaries render in correct grammar ✓
3. **No-change run** → 0 events, `events_last_window` resets to 0, `events_total` unchanged ✓

## Regression

| Domain | Status |
|---|---|
| Ranker | unchanged |
| Recommendation engine | unchanged |
| Scoring | unchanged |
| Governance | unchanged |
| Approval logic | unchanged |
| Decision Ledger architecture | unchanged |
| Lifecycle states | unchanged |
| CRM writeback | unchanged |
| HubSpot connector | unchanged |
| Agent orchestration | unchanged |
| Backend contracts | unchanged |
| BYOK | unchanged |

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | First Load JS +1 kB rounded (actual delta in shared chunk) | Within budget; Phase 14F should hold flat. |
| R2 | `executive_summary` copy is heuristic-driven (template + dimension) | Acceptable for demo; future LLM provider can re-render. |
| R3 | Demo continuity depends on drift overlay (backend mock returns identical accounts each call) | `effectiveRow()` applies drift overlay so subsequent snapshots reflect drift-applied values; baseline state acknowledged on first run. |
| R4 | localStorage-bound store (200 event cap) | Acceptable for demo; backend persistence is a future hardening item. |
| R5 | recommendation-delta correlation is best-effort (matches by account_id + 60s window vs prior snapshot) | Surfaced inline as "Recommendation impact"; absent = "No ranking change required". |

---

**STATUS: READY FOR REVIEW**

Per delivery model: do NOT commit, deploy, or advance to Phase 14F until explicit approval.
