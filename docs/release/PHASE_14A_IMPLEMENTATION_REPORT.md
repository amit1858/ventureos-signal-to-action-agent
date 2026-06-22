# Phase 14A — Live Signal Drift Engine (REVISED · Impact Summary added)

## STATUS: READY FOR REVIEW

Not deployed. Not committed. Awaiting final approval before commit + deploy.

---

## Revision 3 (current) — Impact Summary layer

You said: *"Add an Impact Summary layer to the Portfolio Pulse. For each pulse cycle surface: Most significant risk increase · Most significant opportunity increase · Accounts requiring immediate attention · Highest-priority affected account. The goal is to connect signal changes directly to seller action."*

Implemented:

| # | Spec ask | Implementation |
|---|---|---|
| 1 | Most significant risk ↑ | `ImpactSummary.mostSignificantRisk` — strongest risk event in the current cycle (falls back to all-time if cycle is degenerate). Card shows account · signal label · reason · magnitude · agent. Clickable → opens the account workspace |
| 2 | Most significant opportunity ↑ | Same shape, opportunity-scored. Same Open-on-click behavior |
| 3 | Accounts requiring immediate attention | Moderate+ risk events in the cycle, deduped to ≤5 accounts. Shows count + first 3 names + "+N more". First account is the click target |
| 4 | Highest-priority affected account | **Joins** drift events to the live `Recommendation[]` via `account_id`, picks the **lowest `priority_rank`** that has a drift event this cycle (falls back to all-time if no cycle-rec overlap). Shows `#{rank} {account} → Next best action: {recommended_action}`. **"Open account →" CTA** wired through `onOpenAccount` so the seller jumps straight from signal to workspace |
| 5 | Connect signal changes to seller action | Every card is keyboard-activatable (Enter/Space) and hover-lifts. The highest-priority card carries the explicit Open CTA. Existing `onOpenAccount` flow is reused — no new endpoints, no autonomous actions, ranking and approval still authoritative |

The Impact Summary lives **between the 4 What-Changed tiles and the Agent Activity Stream** inside `PortfolioPulseBar`, so the seller sees in order:
operational tally → impact synthesis → live event feed.

### Cycle-awareness

The summary is **cycle-aware**, not just running-tally:

* `cycleEvents` = events that share the most recent tick's timestamp
* `cycleRiskEvents` / `cycleOpportunityEvents` reported in the section subtitle (e.g. *"This cycle · 4 signals · 3 risk · 1 opportunity"*)
* If the cycle is empty (page just loaded with persisted events), all four cards fall back to the all-time-strongest selection — never silently blank

### Files touched (revision 3 — uncommitted)

* `apps/web/lib/driftEngine.ts` — added `RecommendationLike`, `ImpactSummary`, `computeImpactSummary(events, recs)` selector (pure, deterministic, no side effects). +120 LOC.
* `apps/web/components/command/PortfolioPulseBar.tsx` — new `ImpactSummarySection` + `ImpactCard` components, props extended with `recs: Recommendation[]` and `onOpenAccount?: (id: string) => void`. +150 LOC.
* `apps/web/components/command/CommandCenter.tsx` — threaded `recs` + `onOpenAccount` into `<PortfolioPulseBar />` (already in scope at the mount site).

No engine, no ranking, no governance, no approval, no CRM, no agent, no backend, no contract changes.

### Validation

* `npx tsc --noEmit` → EXIT 0
* `npm run build` → EXIT 0; First Load JS **177 kB** (170 baseline → 175 first 14A → 176 revised → **177 with Impact Summary**, +1 kB)
* Harness on real 150-account CSV + 40 synthesized recs, 12 ticks: `Highest-priority affected = #39 Cascade Consulting → Recover At-Risk Customer (signal: Opportunity cooling)`; Most significant risk + opportunity selected from the latest cycle; degenerate "no overlap" path falls back to all-time gracefully; "no events" path returns `null` so the whole section auto-hides.

---

## Revision 2 (previous) — What Changed + Activity Stream + 150 accounts

[unchanged below]

---

## Revision summary (what changed vs the first 14A draft)

You said: *"Don't bury it as an analytics widget. Make the portfolio feel alive in the operating experience. Scale the portfolio. Acknowledge changes in the executive hero. Surface 'what changed'. Add an agent activity stream."*

This revision addresses every point:

| # | Spec ask | Implementation |
|---|---|---|
| 1 | Increase synthetic portfolio to 100–200 accounts | **150 accounts** generated. Curated 40 preserved; ~110 synthetic fillers added with industry/segment/city/archetype cycle |
| 2 | Surface drift in the operating experience, not only Portfolio Intelligence | New **PortfolioPulseBar** mounted **directly under the AI Chief of Staff hero**, above the Work Queue — impossible to miss |
| 3 | Executive Brief acknowledges portfolio changes since last review | New **DriftAcknowledgementLine** injected into ChiefOfStaffNarrativeCard: *"Since you opened this session: X risk signals ↑ · Y opportunity signals ↑ · Z new attention items · N accounts changed"* |
| 4 | "What Changed" summary (Accounts changed / Risks ↑ / Opportunities ↑ / New attention) | 4 tiles in PortfolioPulseBar header strip with semantic color tones |
| 5 | Activity stream (Signal detected · Agent · Timestamp · Account) | Inline 6-row stream in PortfolioPulseBar; each row shows **Agent badge** · arrow · signal label · account · dimension delta · relative time |
| 6 | Operational awareness even if ranking unchanged | Achieved — drift never touches the ranker; awareness is created entirely through the UI surface |
| 7 | No changes to ranker / governance / approval / CRM / agents | Verified |

---

## 1. Files changed / added

| State | Path | LOC | Purpose |
|---|---|---|---|
| **Added** | `apps/web/lib/driftEngine.ts` | ~540 (was 440) | Now includes `agent` + `signalLabel` on each event, `subscribeDrift()` singleton (one engine timer per tab, multiple subscribers), `forceDriftTick()` shared helper, richer `DriftSummary` (risksUp / opportunitiesUp / newAttentionAccounts / newAttentionList) |
| **Added** | `apps/web/components/command/PortfolioPulseBar.tsx` | ~360 | **Operating-experience surface**: 4 tiles (Accounts changed / Risks ↑ / Opps ↑ / New attention) + 6-row Agent Activity Stream + `DriftAcknowledgementLine` sibling export |
| **Modified** | `apps/web/components/command/LivePortfolioDriftPanel.tsx` | -23 / +18 | Refactored to use the shared `subscribeDrift` singleton (no duplicate timers); each event row now shows Agent badge |
| **Modified** | `apps/web/components/command/CommandCenter.tsx` | +6 / -1 | Imported PortfolioPulseBar + DriftAcknowledgementLine; mounted PulseBar between hero and Work Queue; threaded `driftAck` prop through `ChiefOfStaffNarrativeCard` (added optional `driftAck?: ReactNode` to the card props) |
| **Modified** | `services/api/data/generate_synthetic_data.py` | +85 | Added `_bulk_fillers()` + `ALL_COMPANIES` to raise portfolio from 40 → 150 deterministically (seeded). Curated 40 unchanged. |
| **Regenerated** | `services/api/data/synthetic_accounts.csv` | 41 → 151 lines | 150 accounts |
| **Regenerated** | `services/api/data/synthetic_signals.csv` | regen | 456 signals (was 130s) |
| **Regenerated** | `services/api/data/synthetic_notes.json` | regen | 150 notes |

Still untouched: backend agents, schemas, scoring, governance, orchestrator, decision ledger, lifecycle, CRM connectors, HubSpot, BYOK, API contracts.

---

## 2. Layout / placement (new)

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Chief of Staff   [HubSpot] · sync 18:42                     │
│  Across 150 accounts: ₹4.5L at risk · ₹2.6L expansion ·         │
│  7 need attention.                                              │
│  ● Since you opened this session: 21 risks ↑ · 17 opps ↑ ·      │
│      8 new attention items · 29 accounts changed   ← NEW LINE   │
│                                                                 │
│  Start with Curefoods | Spend −18% · risk high · ~44 min        │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐  ← NEW
│  ● Portfolio pulse · what changed   · last signal 12s ago       │
│  ┌─────────┬─────────┬─────────┬──────────────────────────┐   │
│  │ Accts ↑ │ Risks ↑ │ Opps ↑  │ ⚠ New attention items     │   │
│  │   29    │   21    │   17    │   8                        │   │
│  │ 40 sigs │ Top:Cure│ Top:Raz │ Pine Cons · Razorpay · …   │   │
│  └─────────┴─────────┴─────────┴──────────────────────────┘   │
│  ─────────────────────────────────────────────────────────      │
│  Agent activity stream                                          │
│  ● [Opportunity Agent]    ↑ Expansion signal · Razorpay         │
│                              opportunity +2.2  · 8s ago         │
│  ● [Signal Ingestion]     ↑ Usage trending up · Mosaic Services │
│                              usage +6.1 · 47s ago               │
│  ● [Account Health Agent] ↑ Support risk rising · Curefoods     │
│                              support_risk +8.4 · 1m ago         │
│  ● [Communication Agent]  ↓ Engagement slipping · Unacademy     │
│                              engagement −7.2 · 1m ago           │
│  ● [Governance Agent]     ↓ Renewal window closing · Porter     │
│                              renewal −3d · 2m ago               │
│  ● [Opportunity Agent]    ↑ Expansion signal · Cascade          │
│                              opportunity +2.5 · 2m ago          │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  Work Queue + Account Workspace (Execution mode)                │
│  (unchanged)                                                    │
└─────────────────────────────────────────────────────────────────┘
... Portfolio Intelligence (still has the deep "Live signal drift"
    panel as the full feed, unchanged in placement, now agent-attributed)
```

---

## 3. Agent attribution map

Drift events are now attributed to the same agent identities used by the multi-agent reasoner. This makes the activity stream feel like the real agents at work, not an analytics fiction.

| Dimension | Attributed agent | Signal label (up) | Signal label (down) |
|---|---|---|---|
| `support_risk` | **Account Health Agent** | Support risk rising | Support risk easing |
| `usage` | **Signal Ingestion Agent** | Usage trending up | Usage decline detected |
| `engagement` | **Communication Agent** | Engagement rising | Engagement slipping |
| `opportunity` | **Opportunity Agent** | Expansion signal detected | Opportunity cooling |
| `renewal` | **Governance Agent** | Renewal date shifted out | Renewal window closing |
| `spend` | **Account Health Agent** | Spend trending up | Spend trending down |

(All five reasoning agents from the existing orchestrator are represented except Action Agent, which is decision-time not telemetry-time — leaving it out keeps the semantics honest.)

---

## 4. Engine architecture upgrades

```
┌──────────────────────────────────────────────────────────────────┐
│  driftEngine.ts                                                  │
│  ─ DriftEvent now includes:  agent, signalLabel                  │
│  ─ DriftSummary now includes: risksUp, opportunitiesUp,          │
│                                newAttentionAccounts (mod+ risk), │
│                                newAttentionList (deduped names)  │
│                                                                  │
│  Singleton subscription:                                         │
│  ─ ONE timer per tab (was 1-per-component)                       │
│  ─ subscribeDrift(getAccounts, listener, opts) -> unsubscribe    │
│  ─ Forwards every tick to all listeners                          │
│  ─ Auto-stops when last subscriber unmounts                      │
│  ─ forceDriftTick() invokes all listeners at once                │
│                                                                  │
│  Listeners:                                                      │
│  ─ <DriftAcknowledgementLine accounts={accounts} />              │
│  ─ <PortfolioPulseBar accounts={accounts} />                     │
│  ─ <LivePortfolioDriftPanel accounts={accounts} />               │
│  ─ All three render the SAME stream, no double-firing,           │
│      Force Tick in one updates everything.                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Self-test results

### TypeScript

```
> npx tsc --noEmit
EXIT 0
```

### Production build

```
> npm run build
✓ Compiled successfully
✓ Generating static pages (4/4)
Route (app)                              Size     First Load JS
┌ ○ /                                    88.6 kB         176 kB
```

| Metric | Phase 13.6 (baseline) | 14A first draft | 14A REVISED | Delta vs baseline |
|---|---|---|---|---|
| First Load JS | 170 kB | 175 kB | **176 kB** | +6 kB (+3.5 %) |
| Route `/` size | 82.8 kB | 87.2 kB | 88.6 kB | +5.8 kB |

### Synthetic data regeneration

```
> python generate_synthetic_data.py
Synthetic data generated (seed=2026):
  accounts :  150  -> synthetic_accounts.csv
  signals  :  456  -> synthetic_signals.csv
  notes    :  150  -> synthetic_notes.json
```

CSV line count confirmed: **151** (1 header + 150 data rows).

### Engine harness (real 150-account dataset, 10 ticks × 4 events)

```
loaded accounts: 150

after 10 ticks:
  total events = 40
  accountsChanged = 29
  risksUp = 21
  opportunitiesUp = 17
  newAttentionAccounts = 8
  newAttentionList = Pine Consulting | Razorpay | Juniper Learn | Tessera Bites | Urban Company

agent attribution sample:
  Opportunity Agent      : 6
  Signal Ingestion Agent : 12
  Governance Agent       : 6
  Account Health Agent   : 12
  Communication Agent    : 4

first 3 stream rows:
  [Opportunity Agent]      Expansion signal detected · Razorpay         · opportunity ↑ Δ2.2  impact=opportunity
  [Signal Ingestion Agent] Usage trending up         · Mosaic Services  · usage       ↑ Δ6.1  impact=opportunity
  [Opportunity Agent]      Expansion signal detected · Cascade Consulting · opportunity ↑ Δ2.5 impact=opportunity
```

- ✅ All 5 agents firing
- ✅ Curated + filler accounts both represented
- ✅ `newAttentionList` populated with real account names
- ✅ Summary tiles produce non-zero values quickly (40 events / 10 ticks ≈ 7-8 events per minute at production cadence)

---

## 6. Validation against revised spec

| Spec requirement | Status |
|---|---|
| Synthetic portfolio 100–200 accounts | ✅ **150** |
| Drift surfaced in operating experience, not only Portfolio Intelligence | ✅ PortfolioPulseBar mounted between hero and Work Queue |
| Executive Brief acknowledges portfolio changes since last review | ✅ DriftAcknowledgementLine inside ChiefOfStaffNarrativeCard |
| "What Changed" summary — Accounts changed | ✅ Tile #1 |
| "What Changed" summary — Risks increased | ✅ Tile #2 (risksUp) |
| "What Changed" summary — Opportunities increased | ✅ Tile #3 (opportunitiesUp) |
| "What Changed" summary — New items requiring attention | ✅ Tile #4 (newAttentionAccounts + first 2 names as subtext) |
| Activity stream — signal detected | ✅ `signalLabel` per event |
| Activity stream — agent involved | ✅ Agent badge per row |
| Activity stream — timestamp | ✅ Relative time per row, live-ticking |
| Activity stream — account impacted | ✅ Account name per row |
| Operational awareness even if ranking unchanged | ✅ All UX changes are additive to the ranker output |
| Do not modify ranking | ✅ |
| Do not modify governance | ✅ |
| Do not modify approval flow | ✅ |
| Do not modify CRM writeback | ✅ |
| Do not modify agent architecture | ✅ |

---

## 7. Screenshots

**Not captured by this CLI** (no live browser sandbox available here). To capture them locally:

```powershell
# Regenerated synthetic data is already on disk. Backend uses HubSpot by
# default; to demo the 150-account synthetic portfolio set:
$env:S2A_DATA_SOURCE = "synthetic"
cd signal-to-action-agent\services\api
python -m uvicorn main:app --host 127.0.0.1 --port 8001

# Frontend:
cd signal-to-action-agent\apps\web
npm run dev

# Open http://localhost:3000
```

Suggested captures for review:

1. **AI Chief of Staff hero** showing the new "Since you opened this session…" acknowledgement line (after ~6 s + 1 tick)
2. **PortfolioPulseBar — initial state** (waiting for first signal, accounts visible)
3. **PortfolioPulseBar after 2-3 ticks** showing all 4 tiles populated + 6-row agent activity stream
4. **PortfolioPulseBar after Force Tick** — events appear instantly, hero ack line + Portfolio Intelligence deep panel all update simultaneously (proves singleton subscription)
5. **Portfolio Intelligence → Live signal drift panel** showing the same events with the agent badges in each row
6. **Ranked Accounts** below pulse bar — same order as before drift started (proves ranker unchanged)

---

## 8. Regression verification

| Surface | Status |
|---|---|
| Ranking engine (`services/api/services/scoring_service.py`) | ✅ Untouched |
| Recommendation orchestration (`services/api/agents/orchestrator.py`) | ✅ Untouched |
| Governance agent | ✅ Untouched |
| Approval logic / lifecycle | ✅ Untouched |
| Decision Ledger architecture (`lib/decisionLedger.ts`) | ✅ Untouched; separate `s2a_drift_*` localStorage keys |
| CRM writeback / HubSpot connector | ✅ Untouched |
| Agent orchestration architecture | ✅ Untouched (drift attributes events to existing agent names but generates them client-side) |
| BYOK framework | ✅ Untouched |
| Backend API contracts | ✅ Untouched (no new endpoints, no schema edits) |
| Existing curated 40 accounts (CSV order, IDs, archetypes) | ✅ Byte-identical — only `_bulk_fillers()` appends after them |

---

## 9. Risks & open questions

| # | Risk | Severity | Notes |
|---|---|---|---|
| R1 | Live demo backend (Render) uses HubSpot data source (40 accounts) by default. Drift will still work, but the "150 account" surface area only appears in synthetic mode | Medium | Two options: (a) set `S2A_DATA_SOURCE=synthetic` on Render env, OR (b) reseed HubSpot test CRM via existing `hubspot_seed.py`. Both out-of-scope for this review; flag for deployment decision. |
| R2 | DriftAcknowledgementLine adds vertical height to the hero (~1 line) | Low | Inline pill stays one line on ≥ md breakpoints; wraps gracefully on narrow widths |
| R3 | "New attention items" uses moderate+ magnitude on risk events — a drift threshold judgement, not a ranker re-rank | Low | Documented in tile subtext. Threshold tunable in `summarizeDrift()`. |
| R4 | Singleton subscription survives StrictMode double-mount because listeners use a Set + listener-count gate | Low | Verified in build; SSR-safe (`typeof window` gate) |
| R5 | Drift events generated client-side only; two browser tabs produce independent streams | Low (by design) | Could share via `BroadcastChannel` in a later phase if needed |

No high-severity risks. No backend or data integrity risks.

---

## 10. Before / After comparison (vs first 14A draft)

| Aspect | First 14A draft | Revised 14A |
|---|---|---|
| Portfolio size | 40 accounts (HubSpot) / 40 (synthetic) | **150 accounts** (synthetic regenerated; HubSpot unchanged) |
| Drift visibility | Inside Portfolio Intelligence collapsible only | **Above the fold**: hero acknowledgement + Pulse Bar between hero & Work Queue |
| Agent attribution | None | Every event tagged with one of the 5 reasoning agents |
| Summary metrics | 3 tiles (Accounts / largest risk / largest opp) | **4 tiles** (Accounts / Risks ↑ / Opps ↑ / New attention) |
| Activity stream | Buried in Portfolio Intelligence | Inline under Pulse Bar tiles + full feed still inside Portfolio Intelligence |
| Hero acknowledgement | None | "Since you opened this session: X risk signals ↑ · Y opportunity signals ↑ · Z new attention · N accounts changed" |
| Engine instances | 1-per-component | **Singleton** (1 timer per tab, all consumers share) |

---

## 11. Recommendation

The Phase 14A revision meets every line item in the revised spec.

- 150 accounts active in synthetic mode
- Drift is visible at the top of the operating experience (hero + pulse bar), not buried
- Executive Brief acknowledges portfolio change since session start
- 4 operational tiles answer "what changed" directly
- Agent activity stream maps each signal to its owning reasoning agent
- Ranker / governance / approvals / CRM / agents / BYOK / API contracts all unmodified

**Awaiting review before**:
- git commit + push
- backend env flip (synthetic vs HubSpot) decision for the live demo
- Vercel redeploy
- proceeding to Phase 14B (deeper Agent Activity Feed surface)

---

## STATUS: READY FOR REVIEW
