# Phase 14D — Executive Change Brief & Portfolio Timeline

## STATUS: READY FOR REVIEW

Not deployed. Not committed. Awaiting approval before commit + deploy.

---

## Goal (per program spec)

> Focus Phase 14D on:
> * Executive Change Brief
> * Portfolio Timeline
> * What changed since yesterday
> * Accounts entering priority queue
> * Accounts leaving priority queue
> * Risk movement
> * Opportunity movement
> * Expected business impact

---

## Implementation

Strictly additive. One new pure selector aggregates the existing drift engine + recommendation delta log into a windowed brief; two new UI surfaces render it. Zero changes to backend, ranker, governance, ledger, agents.

### Architecture

```
driftEngine.events       ─┐                      ┌──► ExecutiveChangeBriefPanel
                          ├─►  buildExecutiveChangeBrief(accounts)  ──┤      (under AI Chief of Staff,
recommendationDelta log  ─┘     (window-filtered: session-start or  ──┘       above Portfolio Pulse)
                                 last 24h, whichever is shorter)

driftEngine.events       ─┐
                          ├─►  buildPortfolioTimeline(limit)  ──────► PortfolioTimeline
recommendationDelta log  ─┘     (full chronological cross-account     (inside Portfolio Intelligence)
                                 feed, day-grouped, severity-tagged)
```

### New files

| File | LOC | Role |
|---|---:|---|
| `apps/web/lib/executiveChangeBrief.ts` | 300 | Pure selector. Two public functions: `buildExecutiveChangeBrief(accounts, topN=5)` returns a windowed `ExecutiveChangeBrief`; `buildPortfolioTimeline(maxEntries=40)` returns a cross-account chronological feed. Window auto-picks: session-start if < 24h old, else trailing 24h ("Since yesterday"). |
| `apps/web/components/command/ExecutiveChangeBrief.tsx` | 380 | Two exported surfaces: `ExecutiveChangeBriefPanel` (flagship card) and `PortfolioTimeline` (day-grouped vertical feed). |

### Modified files

* `apps/web/components/command/CommandCenter.tsx`
  * Two new `next/dynamic` imports (`ssr: false`) for both surfaces.
  * `ExecutiveChangeBriefPanel` rendered directly between PortfolioPulseBar and the inline RecommendationDeltaCompact, with `onOpenTimeline` → smooth-scroll to the new Portfolio Intelligence section.
  * `PortfolioTimeline` rendered as a new `CompactSection` inside the Portfolio Intelligence collapsible zone, with `id="portfolio-timeline-anchor"` for the scroll target.
  * Both surfaces wired with `refreshKey={`${deltas.length}-${result?.generated_at ?? ""}`}` so they re-read whenever the delta log or rec response changes.

---

## ExecutiveChangeBriefPanel structure

```
┌─ ▎ Executive Change Brief · SINCE SESSION START (2h)              just now ─┐
│                                                                              │
│  2 risk increases · 1 opportunity move · 1 new in queue · 1 left queue.     │
│                                                                              │
│  ┌─ EXPECTED BUSINESS IMPACT  ₹1.52Cr  [HIGH] ─────────────────────────┐    │
│  │  annualised revenue exposed by risk increases in this window       │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─ ↓ RISK INCREASES ─┐ ┌─ ↑ OPPORTUNITY ─┐ ┌─ ⇲ ENTERED ─┐ ┌─ ⇱ LEFT ─┐   │
│  │  Swiggy    ↑18    │ │  Alpine Retail  │ │  Porter #2  │ │  Zerodha  │   │
│  │  Support risk·maj │ │  Engagement·mod │ │  Schedule…  │ │  was #8   │   │
│  │  ─────────────── │ │  ────────────── │ │  ────────── │ │  ──────── │   │
│  │  Unacademy ↓22   │ │                 │ │             │ │           │   │
│  │  Spend·moderate  │ │                 │ │             │ │           │   │
│  └──────────────────┘ └─────────────────┘ └─────────────┘ └───────────┘   │
│                                                                              │
│  ┌─ ◑ RECOMMENDED ACTION REVISIONS (1) ─────────────────────────────────┐   │
│  │  Swiggy: Recover At-Risk Customer ↗ Executive Escalation     2m ago │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  4 drift events · 3 recommendation deltas         ✦ Open Portfolio Timeline →│
└──────────────────────────────────────────────────────────────────────────────┘
```

Every numeric tile is keyboard-accessible and clickable; clicking jumps to the workspace for that account. Empty columns render an italic "No material risk movement" / "No accounts dropped" placeholder so the four-column layout never collapses.

## PortfolioTimeline structure

```
Portfolio timeline · 8 events
  Today
   ●  ⇲ ENTERED QUEUE         Porter        Entered queue at #2          2m
   ●  ◑ ACTION REVISED        Swiggy        Recover At-Risk... → Exec.. 3m
   ●  ↓ RISK SIGNAL           Swiggy        Support cases ↑              4m
   ○  ⇱ LEFT QUEUE            Zerodha       Dropped off queue (was #8)  6m
   ○  ↓ RISK SIGNAL           Unacademy     Spend ↓                     10m
   ○  ↑ OPPORTUNITY SIGNAL    Alpine Retail Engagement ↑                15m
  Yesterday
   ...
```

Severity dot color: ● HIGH (risk) · ● MEDIUM (yellow) · ○ LOW (muted). Each row click jumps to the account workspace.

---

## Validation

### Build

```
npx tsc --noEmit       → EXIT 0
npm run build          → EXIT 0
First Load JS          → 183 kB  (Phase 14C baseline 182 → 183, +1 kB rounded)
Page chunk             → 95.2 kB (was 95 kB; +200 B)
Shared chunks          → 87.4 kB (was 87.4 kB; +40 B in "other")
```

Effectively net-zero growth — both new component bodies live in the dynamic `ExecutiveChangeBrief` chunk; only the dynamic-loader wrappers and a small amount of selector code touch the initial bundle. The "+1 kB" is rounding noise (actual delta ~240 bytes).

### Selector harness

```
=== executiveChangeBrief ===

window           : Since session start (2h)
headline         : 2 risk increases · 1 opportunity move · 1 new in queue ·
                   1 left queue · 1 action revision.
drift events     : 4   ✓ (minor included in count, ancient out-of-window excluded)
delta events     : 3   ✓ (ancient delta excluded)
risk moves       : 2   ✓ → Swiggy(major), Unacademy(moderate)     [sorted major-first]
opportunity moves: 1   ✓ → Alpine Retail
entered queue    : Porter #2   ✓
left queue       : Zerodha (was #8)   ✓
action changes   : Swiggy: Recover At-Risk Customer → Executive Escalation   ✓
expected impact  : 15,240,000 INR   ✓   level: high
                   (Swiggy 8.5L·12 + Unacademy 4.2L·12 = ₹1.52Cr annualised)

=== portfolioTimeline ===

entries: 8 (3 meaningful drift in window + 3 deltas in window + 2 ancient)
[HIGH  ] Entered queue   Porter
[HIGH  ] Action revised  Swiggy
[HIGH  ] Risk signal     Swiggy
[MEDIUM] Left queue      Zerodha
[MEDIUM] Risk signal     Unacademy
[MEDIUM] Opportunity sig Alpine Retail
[MEDIUM] Entered queue   OldCo          ← deliberately retained (timeline ≠ brief)
[HIGH  ] Risk signal     OldCo

All entries chronologically sorted newest-first.   ✓

[harness] all assertions passed.
```

Key design decision: **the Brief is window-filtered, the Timeline is not.** The Brief answers "what changed since the last executive review?"; the Timeline answers "what's the full chronological record?". Both selectors share the same drift+delta sources but apply different filters.

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

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | First Load JS 182 → 183 kB (+1 kB rounded; actual +240 B) | Both new components and the selector are in the dynamic chunk. The increment is webpack-runtime + dynamic-loader boilerplate, not feature code. Phase 14E should aim to keep this flat. |
| 2 | "Expected business impact" is a heuristic (12 × current_month_spend per at-risk account); it is not the ranker's own number | UI labels it explicitly: *"annualised revenue exposed by risk increases in this window"*. Never claimed as authoritative revenue forecast. |
| 3 | When no drift has occurred yet in a fresh session, the Brief renders an empty "Portfolio is steady" headline | This is the intended baseline state — keeps the surface predictable for cold-start demos. |
| 4 | Timeline can grow long over many days of activity | `buildPortfolioTimeline` caps at `maxEntries=40` by default; minor drift is filtered out to keep the executive view focused. |

---

## STATUS

**READY FOR REVIEW.** Awaiting approval before commit + deploy.
