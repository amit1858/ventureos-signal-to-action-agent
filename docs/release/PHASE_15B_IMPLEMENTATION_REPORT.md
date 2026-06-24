# Phase 15B — Progressive Disclosure & Executive Attention Layer

STATUS: READY FOR REVIEW
Built: 2026-06-22 (post-15A revision)
Scope: UX + IA only. Pure presentation layer over existing intelligence.

## Why 15B is scoped this way

The full Phase 15B spec lists seven workstreams. To deliver a clean, low-risk
batch under the review gate, **this PR ships W1, W2, W3 framing, and W5** —
the components that produce the biggest perceived "AI operating system" feel
without touching account-level workspace internals. W4 (focus-first account
workspace accordion) and W6 (left-control-rail collapse) are larger surface
changes I'm explicitly deferring to **Phase 15C** so 15B can ship clean.

| Workstream | Status in this batch |
|---|---|
| W1 — Executive Attention Brief | ✅ Shipped |
| W2 — Progressive Disclosure (Pulse / Change Brief / Delta strip → accordions) | ✅ Shipped |
| W3 — Seller workflow defaults (mode-driven collapsed state) | ✅ Shipped (defaults; landing-flow restructure deferred to 15C) |
| W4 — Focus-first account workspace (single section expanded at a time) | ⏭ Deferred to 15C |
| W5 — Executive Snapshot rail compression | ✅ Shipped |
| W6 — Left workspace-controls collapse | ⏭ Deferred to 15C |
| W7 — Visual principles (whitespace / hierarchy / fewer expanded cards) | ✅ Naturally satisfied via W1/W2/W5 |

The shipped subset is sufficient to deliver the spec's "first screen answers
What/Why/What's next in 5 seconds, without scrolling" outcome for Executive
mode, and "first action in one click" for Seller mode.

## Files

| File | Status | Lines |
|---|---|---|
| `apps/web/components/command/DisclosurePanel.tsx` | NEW | ~115 |
| `apps/web/components/command/ExecutiveAttentionBrief.tsx` | NEW | ~210 |
| `apps/web/lib/experienceMode.ts` | MOD | +50 (new `attentionBrief` key, `MODE_DEFAULT_OPEN`, `isOpenByDefault` helper) |
| `apps/web/components/command/CommandCenter.tsx` | MOD | +130 / -45 (imports, drift summary, attention-brief render, three accordion wraps, right-rail compact state + toggle, `CompactKpi` helper) |

## W1 — Executive Attention Brief (new flagship)

Position: Immediately below AI Chief of Staff, above Daily Briefing.

Two states:

**Collapsed (single-line summary):**
```
EXECUTIVE ATTENTION REQUIRED                                    [ Review ]
8 accounts require attention · ₹12.5L at risk · 22 min effort
```

**Expanded (full narrative):**
```
EXECUTIVE ATTENTION REQUIRED
8 accounts require attention · ₹12.5L at risk · 22 min effort

┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
│ ACCOUNTS REQUIRING      │ REVENUE EXPOSURE        │ MOST IMPACTED ACCOUNT   │
│ ATTENTION               │ ⚠ ₹12.5L                │ Curefoods               │
│ 8                       │                         │                         │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘

RECOMMENDED NEXT ACTIONS
①  Curefoods         Schedule executive review        Approval     12 min
②  Acme Logistics    Send reactivation campaign       Approval     8 min
③  Northwind Tech    Confirm renewal terms                          5 min

Estimated effort: 22 min · 2 pending approval         [ Review actions → ]
```

**Mode defaults:**
- Executive → expanded, accent-bordered (amber)
- Seller → collapsed (single line)
- Operations → hidden entirely (Ops works the underlying ledger, not the executive narrative)

**Pure composition:** built from existing `Recommendation` + `Account` data
via `reasonForRecommendation`, `revenueAtRisk`, `countAttention`. No new
intelligence, no new scoring, no governance changes.

## W2 — Progressive Disclosure architecture

New reusable `DisclosurePanel` shell wraps an intelligence panel with a
header that shows a summary line in the collapsed state and reveals the
full panel when expanded. Per-id localStorage persistence
(`s2a_disclosure_v1:<id>`).

Three panels converted to accordions in this batch:

| Panel | Eyebrow | Summary line (collapsed) |
|---|---|---|
| Portfolio Pulse | Portfolio intelligence | `15 accounts changed · 11 risks · 5 opportunities` |
| Executive Change Brief | Executive intelligence | `4 recommendations revised since last review` |
| Recommendation Changes (delta strip) | Operations intelligence | `4 actions revised` |

Summary lines are computed once per render from existing drift / delta
state — no new persistence, no new APIs.

Default open/closed state is **mode-driven** via the new `MODE_DEFAULT_OPEN`
map + `isOpenByDefault(mode, key)` helper:

| Section | Executive | Seller | Operations |
|---|:-:|:-:|:-:|
| Attention Brief | open | closed | (hidden) |
| Portfolio Pulse | open | closed | open |
| Executive Change Brief | open | closed | open |
| Delta strip | (hidden) | (hidden) | open |

The user's explicit toggle (per accordion) overrides the default and
persists across reloads. Mode change re-applies the default only for
panels that the user hasn't explicitly toggled.

## W3 — Seller workflow framing

Seller mode now lands with all three intelligence accordions collapsed,
showing only:
- Mode switch
- AI Chief of Staff (always visible)
- Executive Attention Brief (collapsed summary line)
- Daily Briefing
- Portfolio Pulse (collapsed header with summary line)
- Executive Change Brief (collapsed header)
- Workbench (Top Actions + Account Workspace) — fully open

Result: a seller sees **the queue and the workspace as the dominant surface**
on first paint, with strategic context one click away. The full
single-account-at-a-time workspace focus mode is W4 / Phase 15C.

## W5 — Executive Snapshot rail compression

The right-hand `<aside>` now has an expand/collapse toggle in its header
with two visual states:

**Expanded (default for Executive / Operations):** the existing 8-row rail —
active account card + Revenue at risk / Expansion / Action / Renewals /
Approvals / Effort / Confidence / Top account.

**Collapsed (default for Seller):** a 2×2 compact KPI grid showing only the
four signals a seller-in-execution needs:
```
At risk    Expansion
Approvals  Confidence
```

Per-mode persistence (`s2a_snapshot_expanded_v1:<mode>`) so the user's
choice survives reloads and is remembered separately per mode.

## Validation

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | EXIT 0 |
| `npm run build` | EXIT 0 |
| First Load JS | 187 → **189 kB** (+2 kB) |
| Harness — `attentionBrief` SectionKey present | ✅ |
| Harness — visibility (exec=show, seller=show, ops=hide) | ✅ |
| Harness — visible counts | ✅ exec=6 / seller=6 / ops=8 |
| Harness — `isOpenByDefault` per mode | ✅ 7/7 |
| Dev server smoke (localhost:3000) | ✅ 200 |
| Backend smoke (127.0.0.1:8001) | ✅ 200 |

## Regression — what is unchanged

| Area | State |
|---|---|
| Ranking engine | unchanged |
| Recommendation engine | unchanged |
| Deterministic scoring | unchanged |
| Governance engine | unchanged |
| Approval logic | unchanged |
| Decision Ledger | unchanged |
| Drift engine | unchanged |
| Delta tracking | unchanged |
| Timeline engine | unchanged |
| External Change Detection | unchanged |
| CRM writeback | unchanged |
| HubSpot connector | unchanged |
| Agent orchestration | unchanged |
| BYOK framework | unchanged |
| Backend contracts / `/api/*` endpoints | unchanged |
| Account Workspace (W4 deferred) | unchanged |
| Left workspace controls (W6 deferred) | unchanged |

Every wrapped intelligence panel renders identically inside its accordion —
no logic, props, or state changes.

## Bundle budget

| Phase | First Load JS |
|---|---:|
| 14F (pre-15A) | 186 kB |
| 15A revised | 187 kB (+1) |
| **15B** | **189 kB (+2)** |

## Risks

1. **W4 / W6 not in this batch** — Account Workspace and left-control-rail
   compression are deferred to 15C. Seller mode is meaningfully simpler than
   before but doesn't yet have the "single section expanded at a time"
   workspace behavior the spec describes. Calling this out explicitly so the
   reviewer can decide whether to ship 15B standalone or hold for combined
   15B+15C.
2. **Mode-default vs user-toggle precedence** — current implementation:
   per-id persisted choice wins across mode switches. If a seller expands
   Pulse, then flips to Executive, then back to Seller, Pulse stays open.
   Most users will read this as expected (their choice sticks); alternative
   is "always re-apply mode default" which loses user intent.
3. **Right-rail compact mode is xl+ only** — the aside is `hidden xl:block`
   already; the compact KPI grid inherits that breakpoint. No mobile
   regression because there was no mobile presence to begin with.

## Manual test plan for reviewer

1. Open Command Center in **Executive** mode.
   - Expect: Attention Brief expanded with stats + top 3 actions, Pulse
     expanded, Change Brief expanded, right-rail full.
2. Switch to **Seller**.
   - Expect: Attention Brief collapsed (single line), Pulse collapsed
     (header shows `N accounts changed · N risks · N opportunities`),
     Change Brief collapsed, right-rail in 2×2 compact KPI grid.
3. Switch to **Operations**.
   - Expect: Attention Brief hidden; Pulse/Change Brief/Delta strip all
     open with full content; right-rail full.
4. In Seller, expand Pulse manually → switch to Executive → switch back to
   Seller. Pulse should remain expanded (user choice persists).
5. Reload the page in any mode. Last-toggled state restored.

## Next steps after approval

1. Commit (`Add Phase 15B Executive Attention Brief + progressive disclosure`)
2. Push to GitHub
3. Vercel deploy
4. Live smoke
5. Update `docs/release/PHASE_15B_DEPLOYMENT_REPORT.md`
6. Begin Phase 15C — W4 (focus-first Account Workspace) + W6 (left-control collapse)

---

STATUS: **READY FOR REVIEW** — awaiting approval before commit / push / Vercel.
