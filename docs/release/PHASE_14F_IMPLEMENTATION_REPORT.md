# Phase 14F — Executive Daily Briefing

**STATUS: READY FOR REVIEW**

## Goal (verbatim from spec)

Executive Daily Briefing — the experience should answer:

* **What changed?**
* **Why does it matter?**
* **What should leadership do next?**

## Implementation

A leadership-voice morning briefing rendered as a hero card at the **very top** of the Command Center (above Portfolio Pulse). Pure client-side composer; ZERO backend, ranking, governance, approval, ledger, lifecycle, CRM, HubSpot, agent, or contract changes.

### Composer (lib/executiveDailyBriefing.ts)

`buildExecutiveDailyBriefing({ accounts, recommendations, sessionStartIso })` reads from five live client-side stores (read-only):

| Source | Role |
|---|---|
| `loadDriftSnapshot()` (Phase 14A) | drift events feed What Changed + exposure math |
| `loadDeltas()` (Phase 14B) | recommendation deltas drive escalation/new-entry action items |
| `loadExternalEvents()` (Phase 14E) | external system changes feed the "connected systems" line |
| `listLedger()` (Phase 13) | excludes already-approved recs from pending approvals |
| `accounts` + `recommendations` | scope set + at-risk spend math + fallback review actions |

Produces a typed `ExecutiveDailyBriefing` with:
- `greeting` time-of-day prefix (`Good morning` / `Good afternoon` / `Good evening` / `Late tonight`)
- `window_label` (`Since session start (Xh)` or `Since yesterday`)
- `urgency` (`calm` / `watch` / `act`) — derived from major-risk count, spend exposure (₹1Cr / ₹0 thresholds), pending-approval count, external-major count
- `headline` — one sentence opening line
- 3 pillars (`what_changed`, `why_it_matters`, `what_to_do_next`) each with `{ headline, detail, evidence_count }`
- `recommended_actions[]` — up to 5 ranked items in priority order: approvals first, then escalations from `action_changed` deltas, then outreach for `first_seen` accounts, then top-rec fallback reviews. Each item has category (`approval` / `escalation` / `outreach` / `review`), rationale, est_minutes, and an account_id for deep-link.
- `source_counts` for footer transparency

### Panel (components/command/ExecutiveDailyBriefing.tsx)

Hero-style card with:
- Header strip: amber `Executive Daily Briefing` eyebrow + urgency badge + window + generated-at timestamp
- 14-pt headline sentence
- 3-pillar grid (warn / risk / brand colored) — `What changed` / `Why it matters` / `What to do next`
- Recommended actions list with rank, category chip, title, rationale, est minutes, and `Open <Account> →` deep link
- Footer: drift / deltas / external / approvals counts

### Placement

`<ExecutiveDailyBriefingPanel />` renders **above** `<PortfolioPulseBar />` — the very first thing leadership sees on the Command Center.

## Files

| Status | Path | LOC |
|---|---|---|
| NEW | `apps/web/lib/executiveDailyBriefing.ts` | ~310 |
| NEW | `apps/web/components/command/ExecutiveDailyBriefing.tsx` | ~210 |
| MOD | `apps/web/components/command/CommandCenter.tsx` | +18 |

## Validation

### Build
- `npx tsc --noEmit` → **EXIT 0**
- `npm run build` → **EXIT 0**; First Load JS **184 → 186 kB** (+2 kB)

### Harness (4 scenarios)

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | All approved · no drift · no deltas · no external | urgency=calm; headline mentions steady; top-rec fallback actions surface | ✓ |
| 2 | 3 major drift risks · 1 action_changed delta · external major · 4 pending approvals | urgency=act; headline cites exposure (₹12L) + approval count; 4 action items mixing approval + escalation | ✓ |
| 3 | 1 major drift + 1 first_seen delta + 4 pending approvals | urgency=watch; headline mentions "1 account has entered the priority queue"; new-entry account surfaces in action list | ✓ |
| 4 | All ledger-approved · no drift | urgency=calm; pending_approvals=0 | ✓ |

Representative scenario 2 output:

```
urgency: act
headline: Good afternoon. The portfolio shifted overnight — ₹12.0L in active
          spend is exposed and 4 decisions need leadership attention now.
what_changed:    3 major risk increases detected across 1 account.
why_it_matters:  ₹12.0L in monthly spend is exposed to active risk signals.
what_to_do_next: 4 priority moves — about 22 minutes of focused work.

#1 [approval]   Approve "Schedule executive check-in" for Acme    (5m)
#2 [approval]   Approve "Schedule executive check-in" for Beta    (5m)
#3 [approval]   Approve "Schedule executive check-in" for Gamma   (5m)
#4 [escalation] Reconfirm escalation path for Delta               (7m)
```

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

## Differentiation vs Phase 14D Executive Change Brief

| Aspect | 14D Executive Change Brief | 14F Executive Daily Briefing |
|---|---|---|
| Format | 4-column dashboard widget | Hero card with prose pillars + action list |
| Voice | Structured metric labels ("Entered queue", "Risk increases") | Leadership narrative ("The portfolio shifted overnight…") |
| Output | Lists of movements | One headline + 3 pillars + ranked action list |
| Placement | Below Portfolio Pulse | **Above** Portfolio Pulse (first thing seen) |
| Question answered | "What moved in the numbers?" | "What changed / why it matters / what to do next" |

Both remain — 14F frames the day, 14D itemises the movements underneath.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | +2 kB First Load JS over budget (184→186) | Within tolerance for the hero capability; phase 15 should rationalise hero stack. |
| R2 | Urgency thresholds are heuristic (₹1Cr / 3-major / 3-pending) | Tunable constants in composer; conservative defaults. |
| R3 | Action dedup by account_id can hide a 2nd category for same account | Intentional — prevents duplicate items; account already represented surfaces in workspace on click. |
| R4 | "Good morning/afternoon/evening" uses local browser time | Acceptable — leadership sees the right greeting for their actual demo time. |
| R5 | Briefing is null until first analysis completes | Empty state copy: "Run an analysis to generate today's leadership briefing." |

---

**STATUS: READY FOR REVIEW**

Per delivery model: do NOT commit, deploy, or advance until explicit approval.
