# Phase 14C (Revised) — Recommendation Evolution Surfaced in Workspace

## STATUS: READY FOR REVIEW

Not deployed. Not committed. Awaiting approval.

Revision addresses the review feedback: *"Recommendation Evolution is too important to live only inside a Timeline tab."*

---

## What changed in this revision

| # | Feedback | Resolution |
|---|---|---|
| 1 | Surface Recommendation Evolution in the main workspace | New `RecommendationEvolutionPanel` rendered directly below the "Recommended action" line in the cockpit header — visible on every workspace load, no tab click required. |
| 2 | Add a visible "Why Recommendation Changed" callout near the current recommended action | The new panel **is** that callout, expanded into a structured card. The original one-liner `WhyRecommendationChanged` remains as a supporting micro-summary directly under it (kept for fast-scan readers). |
| 3 | Surface Previous · Current · Reason · Severity · Timestamp | All five rendered as first-class fields in the panel (see structure below). |
| 4 | Keep Timeline tab as detailed audit history | Timeline tab unchanged — still shows the full chronological feed and historical reasoning trail. |
| 5 | No changes to ranking / governance / approval / ledger / CRM / agents / backend | Confirmed — only the workspace cockpit header markup changed, plus one new helper in the pure selector. |

---

## RecommendationEvolutionPanel structure

```
┌─ Recommendation evolution · Action revised · [HIGH]      14m ago ─┐
│                                                                    │
│  ┌─ PREVIOUS                #1 ─┐  ┌─ CURRENT               #1 ─┐ │
│  │  Recover At-Risk Customer    │  │  Executive Escalation       │ │
│  └──────────────────────────────┘  └─────────────────────────────┘ │
│                                                                    │
│  ✦ REASON  Support risk crossed critical threshold; standard      │
│            recovery no longer sufficient.                          │
│                                                                    │
│  Inferred from Risk Agent · Support cases spiking · Rank 1 → 1    │
└────────────────────────────────────────────────────────────────────┘
```

* **Always visible** — when an account has no prior evolution in the session, the panel renders a "Baseline · this session" state showing the current recommendation with "no history" in the Previous column, so the panel is never missing.
* **Severity-tagged** — same low/medium/high/critical heuristic as the rest of Phase 14C.
* **Timestamped** — relative time top-right; ISO timestamp available via `title`.
* **Attribution** — when the evolution can be inferred from a drift event, shows `Inferred from {Agent} · {Signal}`. Never claims agent causality.

---

## Files

| Change | File | LOC delta |
|---|---|---:|
| MOD | `apps/web/lib/accountTimeline.ts` — added `RecommendationEvolution` type + `latestEvolutionFor(account_id)` helper that picks the most informative recent delta (action_changed > priority_jump > left_queue > first_seen > refined) | +60 |
| MOD | `apps/web/components/command/AccountTimeline.tsx` — new exported `RecommendationEvolutionPanel` component (baseline + populated states) | +95 |
| MOD | `apps/web/components/command/CommandCenter.tsx` — added `next/dynamic` import for the new panel; rendered above the existing `WhyRecommendationChanged` callout in the cockpit header | +9 |

No new files. No regenerated assets. No backend, schema, or data changes.

---

## Validation

### Build

```
npx tsc --noEmit       → EXIT 0
npm run build          → EXIT 0
First Load JS          → 182 kB  (unchanged from prior 14C — new panel sits in the dynamic chunk)
Page chunk             → 95 kB   (unchanged)
Shared chunks          → 87.4 kB (unchanged)
```

The new component was added to the same dynamic `AccountTimeline` chunk, so initial bundle size is unaffected by this revision.

### Behaviour harness (`latestEvolutionFor`)

```
ACC-0001 (Swiggy) — seeded with first_seen → priority_jump → action_changed
  kind        : action_changed         ✓ (highest-priority kind picked)
  kindLabel   : Action revised
  has_history : true
  previous    : #1 Recover At-Risk Customer
  current     : #1 Executive Escalation
  reason      : Support risk crossed critical threshold...
  severity    : high                   ✓
  attribution : Inferred from Risk Agent · Support cases spiking
  timestamp   : 2026-06-22T07:11:17Z

ACC-0007 (Porter) — refined-only delta
  kind        : refined · Rank refined  ✓ (falls back when no higher-priority kind exists)
  severity    : low                     ✓

ACC-9999 (no history)
  result      : null                    ✓ (component renders baseline empty state)

[harness] all assertions passed.
```

### Manual walkthrough (intended UX)

1. **Fresh session, click top account (e.g. Curefoods)**
   * Workspace renders cockpit header → Priority badge → Severity badge → Recommendation Evolution panel showing *Baseline · this session*, Previous = "no history", Current = the agent's current recommended action.
2. **Drift engine fires → recommendations re-ingested → action changes**
   * Panel flips to populated state: Previous = old action, Current = new action, Reason = inferred drift cause, Severity = HIGH, timestamp = "just now".
3. **Open Timeline tab**
   * Full chronological feed and historical reasoning trail still present, unchanged from prior 14C.

---

## Regression verification

| Subsystem | Touched? | Status |
|---|---|---|
| Ranking engine | ❌ No | ✅ Unchanged |
| Recommendation engine | ❌ No | ✅ Unchanged |
| Governance engine | ❌ No | ✅ Unchanged |
| Approval logic | ❌ No | ✅ Unchanged |
| Decision Ledger architecture | ❌ No | ✅ Unchanged |
| Lifecycle states | ❌ No | ✅ Unchanged |
| CRM writeback | ❌ No | ✅ Unchanged |
| HubSpot connector | ❌ No | ✅ Unchanged |
| Agent orchestration | ❌ No | ✅ Unchanged |
| Backend contracts | ❌ No | ✅ Unchanged |
| BYOK framework | ❌ No | ✅ Unchanged |

Strict observation-only overlay. The panel reads from `loadDeltas()` (which is itself populated by the existing 14B ingestion pipeline) — it never writes, never reorders, never calls the backend.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | First Load JS still 182 kB (+2 over Phase 14B's 180 kB ceiling) | Carried over from initial 14C; this revision did not regress further. Phase 14D should still target net-zero growth. |
| 2 | Panel could feel noisy on accounts with frequent refinements | `latestEvolutionFor` deliberately deprioritises `refined` events — they only surface when nothing more informative exists for the account. |
| 3 | Baseline state always renders even with no history | This is intentional per the revision spec — keeps the surface predictable for executive demos. The "no history" affordance is unambiguous. |

---

## STATUS

**READY FOR REVIEW.** Awaiting approval before commit + deploy.


---

# ─── Appendix: Original Phase 14C Implementation Notes (pre-revision) ───

## Goal (per program spec)

> Focus on timeline and recommendation evolution storytelling rather than additional analytics.
> Scope: Account Timeline · Recommendation Timeline · Recommendation Severity · Why recommendation changed · Historical reasoning trail.

---

## Implementation

Strictly additive. All five surfaces derive from a single pure selector that joins three existing client-side streams. The ranker, governance, approval, agents, and backend are not touched.

### Architecture

```
driftEngine.events      ─┐
recommendationDelta log ─┼─►  buildAccountTimeline(accountId)  ─►  TimelineEntry[]
decisionLedger entries  ─┘                                          (newest-first, severity-tagged)
                                  │
                                  ├─►  AccountTimeline             (Timeline tab in workspace)
                                  ├─►  ReasoningTrail              (chronological reason list)
                                  ├─►  WhyRecommendationChanged    (header callout)
                                  └─►  RecommendationSeverityBadge (header badge)
```

### New files

| File | LOC | Role |
|---|---:|---|
| `apps/web/lib/accountTimeline.ts` | 235 | Pure selector + severity heuristic. Joins drift events, rec deltas, and ledger entries (approvals + outcomes) for a given account_id into one chronological feed. Exposes `buildAccountTimeline`, `reasoningTrail`, `currentSeverityFor`. |
| `apps/web/components/command/AccountTimeline.tsx` | 235 | Four UI surfaces: `AccountTimeline`, `ReasoningTrail`, `WhyRecommendationChanged`, `RecommendationSeverityBadge`. Shared `SeverityChip` + kind icon palette. |

### Modified files

* `apps/web/components/command/CommandCenter.tsx`
  * `next/dynamic` imports for all four storytelling surfaces (`ssr: false`) — keeps initial bundle lean.
  * `WORKSPACE_TABS` extended with **Timeline** tab (Clock icon).
  * Workspace header now renders `RecommendationSeverityBadge` next to `Priority #N`.
  * `WhyRecommendationChanged` callout rendered under the "Recommended action" line.
  * `timelineRefreshKey` prop threaded from CommandCenter → AccountWorkspacePanel → WorkspaceCockpit so the timeline re-reads whenever the delta log or rec response changes.

### Severity heuristic

Pure, deterministic, derived from delta kind + drift magnitude:

| Trigger | Severity |
|---|---|
| `major` drift on support_risk / spend / renewal | **CRITICAL** |
| `priority_jump` that crosses the top-3 boundary (in or out) | **CRITICAL** |
| `priority_jump` elsewhere · `action_changed` · `major` drift on other dimensions · `first_seen/left_queue` involving top-3 · `approved/rejected` decisions · positive outcomes | **HIGH** |
| `action_changed` (default) · `first_seen/left_queue` outside top-3 · `moderate` drift · "review requested" · neutral outcomes | **MEDIUM** |
| `refined` · `minor` drift · steady state | **LOW** |

The header badge picks the highest severity across the latest delta + latest drift event for the active account, and exposes the basis via `title` for hover-inspection.

### Timeline kinds

8 kinds, each with a colored icon and a kind chip:

`drift` · `rec_first_seen` · `rec_left_queue` · `rec_action_changed` · `rec_priority_jump` · `rec_refined` · `approval` · `outcome`

---

## Validation

### Type + build

```
npx tsc --noEmit       → EXIT 0
npm run build          → EXIT 0
First Load JS          → 182 kB  (Phase 14B baseline 180 → 182, +2 kB)
Page chunk             → 95 kB
Shared chunks          → 87.4 kB (essentially flat — proves dynamic-split worked)
Static pages           → 4/4 generated
```

The 2 kB bump comes from the inline `RecommendationSeverityBadge` + `WhyRecommendationChanged` headers (which render on first paint) and the dynamic loader wrappers. The actual `AccountTimeline` body and `ReasoningTrail` are split out and downloaded only when the Timeline tab opens.

> 182 kB exceeds the prior soft ceiling of 180 kB. **Recommendation**: Phase 14D's executive change brief should target zero net First Load JS growth (it's daily-summary content that can live entirely behind a dynamic chunk or in a side route).

### Harness (real 150-account CSV + 2 rec runs + 1 approval)

```
[harness] target account: Swiggy (ACC-0001)
8 drift ticks, 2 rec ingestions, 1 approval

Timeline entries: 3
  [HIGH] Approved              | Executive Escalation | Demo Reviewer · demo
  [HIGH] Action revised        | Recover At-Risk Customer → Executive Escalation
  [HIGH] Entered priority queue| Entered queue at #1 · Recover At-Risk Customer

Current severity: HIGH — Latest delta: action changed

Reasoning trail (2 entries, oldest → newest):
  [first_seen]     Entered priority queue at rank #1
  [action_changed] Recommended action revised by agents on re-evaluation
```

All five surfaces fire correctly:
* Timeline sorted newest-first, severity-tagged
* Reasoning trail oldest → newest
* Severity badge surfaces highest among latest delta + drift
* Approval lifecycle merged in via existing `listLedgerForAccount`

---

## Regression verification (per Phase 14 global rules)

| Subsystem | Touched? | Status |
|---|---|---|
| Ranking engine | ❌ No | ✅ Unchanged |
| Recommendation engine | ❌ No | ✅ Unchanged |
| Governance engine | ❌ No | ✅ Unchanged |
| Approval logic | ❌ No | ✅ Unchanged |
| Decision Ledger architecture | ❌ No | ✅ Unchanged (read-only via `listLedgerForAccount`) |
| Lifecycle states | ❌ No | ✅ Unchanged |
| CRM writeback | ❌ No | ✅ Unchanged |
| HubSpot connector | ❌ No | ✅ Unchanged |
| Agent orchestration | ❌ No | ✅ Unchanged |
| Backend contracts | ❌ No | ✅ Unchanged |
| BYOK framework | ❌ No | ✅ Unchanged |

Phase 14C only observes existing state. All three source streams are read-only access via their existing public APIs (`loadDriftSnapshot`, `loadDeltas`, `listLedgerForAccount`).

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | First Load JS now 182 kB (above prior 180 kB ceiling) | Dynamic-split limited the damage; Phase 14D should aim for net-zero First Load JS growth. |
| 2 | Reasoning trail attribution is **inferred** from drift, never causal | UI labels each row "Inferred from {agent} · {signal}" so reviewers can't mistake it for the ranker's own reasoning. |
| 3 | Timeline only spans the current browser's localStorage history | Acceptable for a live demo. A future "server-side history" mode could be added behind the same `buildAccountTimeline` API without touching the UI. |

---

## STATUS

**READY FOR REVIEW.** Per the Phase 14 delivery model, no commit, no deploy, no advance to Phase 14D until explicit approval.
