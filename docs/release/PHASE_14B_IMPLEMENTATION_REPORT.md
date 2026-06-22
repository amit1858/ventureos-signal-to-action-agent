# Phase 14B — Recommendation Delta Tracking

## STATUS: READY FOR REVIEW

Not deployed. Not committed. Awaiting approval before commit + deploy.

---

## Goal (per program spec)

> When recommendations change: capture Previous, New, Reason, Timestamp, Impact.
> Example: Previous: Follow-up call → Current: Executive escalation (Reason: Support risk crossed threshold).
> Display: Recommendation Change Log + Portfolio Change Log.

---

## Implementation

Pure client-side, strictly additive overlay. The ranker remains the only authority; this engine only **observes** what the ranker produces and remembers what it produced last time.

### New files

| File | LOC | Role |
|---|---:|---|
| `apps/web/lib/recommendationDelta.ts` | 295 | Pure store + diff + heuristic reason builder. Persists snapshot + log to localStorage. |
| `apps/web/components/command/RecommendationDeltaLog.tsx` | 220 | Two UI surfaces: `RecommendationDeltaCompact` (strip) + `RecommendationDeltaLog` (full log). |

### Modified files

* `apps/web/components/command/CommandCenter.tsx` — `useEffect` ingests recs into the delta engine on every new `result.generated_at`; renders compact strip under PortfolioPulseBar and full log as a new CompactSection inside Portfolio Intelligence.

### Delta kinds

| Kind | Trigger |
|---|---|
| `first_seen` | Account appears in the recommendation list for the first time this session |
| `left_queue` | Account was in the previous list but isn't in the current one |
| `action_changed` | `recommended_action` differs between runs (also surfaces rank shift in the reason if present) |
| `priority_jump` | `priority_rank` shifted by ≥ 2 (and action did not change) |
| `refined` | `priority_rank` shifted by exactly 1 (and action did not change) |

### Reason heuristic

Each delta carries a `reason` string. If a recent drift event exists for the same `account_id`, the reason mentions the **drift signal label + originating agent**, mimicking the spec example (*"Support risk crossed threshold"*). Otherwise it falls back to a neutral phrasing ("Recommended action revised by agents on re-evaluation"). The drift event id, agent, and signal label are also attached to the delta record (`inferred_drift_*`) so the UI can show the attribution explicitly.

Important: this is **inferred attribution**, never causal — the ranker is still the only authority and there is no callback into it.

### UI

* **Compact strip** under PortfolioPulseBar — semantic counts (new to queue · left queue · priority jumps · action revised) + a CTA into the full log.
* **Full log** in Portfolio Intelligence → new `CompactSection "Recommendation change log"` — 12 most recent rows: account, Kind chip, rank shift (`#prev ↑ #curr`), action shift (strikethrough → new), reason + inferred attribution, relative time. Each row is keyboard-activatable and opens the account workspace via the existing `onOpenAccount` flow.

### Storage

* `s2a_rec_snapshot_v1` — last seen rec list (compact: `{rank, action, name}` per id)
* `s2a_rec_deltas_v1` — append-only log, capped at **200 entries** (newest-first)
* `s2a_rec_last_run_v1` — timestamp of the most recent run, used to compute "in latest run"

LocalStorage failures are silent (Safari private mode etc.). Nothing leaves the browser.

### Idempotency

Re-ingesting the same recommendation list emits 0 new deltas (verified in harness). Snapshot timestamp updates, but the cap on the log preserves history.

---

## Validation

### Type + build

```
npx tsc --noEmit       → EXIT 0
npm run build          → EXIT 0
First Load JS          → 180 kB   (Phase 14A baseline 177 kB · +3 kB for delta engine + UI)
Static pages           → 4/4 generated
```

180 kB is **at** the budget ceiling for this program. Phase 14C onward should consume from the next budget tier (≤ 195 kB) or split into a dynamic import — flagged for later.

### Harness (5-account scenario, 3 runs)

```
Run 1 (seed): 5 first_seen deltas

Run 2 (recs change):
  [action_changed] Curefoods   #1→#1 · Recover At-Risk Customer → Executive Escalation
  [action_changed] Alpine      #3→#5 · Schedule Follow-up → Pricing Review · rank ↓ #3→#5
  [refined]        GreenLeaf   #4→#3 · (no action change)
  [first_seen]     Lenskart    →#4   · Reactivation Campaign
  [left_queue]     Porter      #5→·  · Dropped off priority queue (was #5)

Summary: total=10  in-latest-run=5  actionChanged=2  priorityJumps=0  newToQueue=6  leftQueue=1

Run 3 (idempotent re-ingest of Run 2): 0 new deltas ✓
```

All 5 delta kinds fire correctly. Combination case (action change + rank shift simultaneously) is surfaced in the reason text. Idempotency holds.

---

## Regression verification (per Phase 14 global rules)

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

Phase 14B is strictly additive UI overlay. Nothing in this commit touches a backend, an agent, or any persisted server state. The delta engine **observes** the rec list and remembers it; it never participates in producing it.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | First Load JS budget ceiling (180 kB) | Phase 14C+ should dynamic-import the delta log surface, or split per-surface bundles |
| 2 | localStorage caps at ~5 MB; 200 deltas is well under that, but a long-lived session could accumulate noise | Already capped at 200; user-facing "reset" not exposed yet (can be added if reviewers want) |
| 3 | Reason attribution is inferred from drift, not causal | Explicitly labelled "Inferred from {agent} · {signal}" in the UI so reviewers can't mistake it for the ranker's reasoning |

---

## STATUS

**READY FOR REVIEW.** Per the Phase 14 delivery model, no commit, no deploy, no advance to Phase 14C until explicit approval.
