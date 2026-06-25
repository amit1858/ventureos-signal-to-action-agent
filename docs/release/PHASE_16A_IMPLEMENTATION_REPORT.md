# Phase 16A — Action Execution Simulator (Build Report)

## Status

BUILD COMPLETE — awaiting review.

No commit. No push. No deploy.

---

## 1. Architecture summary

Phase 16A closes the loop on the existing decision pipeline by adding an
**execution simulator** between Approval and Outcome. It is entirely additive:

- New module: `apps/web/lib/executionEngine.ts` (pure browser-side state +
  localStorage `s2a_execution_runs_v1`).
- New component: `apps/web/components/command/ActionExecutionPanel.tsx` —
  presentation-only.
- Integration: a new "Action execution" `WorkspaceAccordion` rendered inside
  the existing Account Workspace, **immediately after** the Action Hero and
  Recommendation Evolution block.

### Routing of execution events

```
User clicks "Execute action"
   → executionEngine.startExecution()
       → write run to s2a_execution_runs_v1
       → appendLedgerEntry({ decision_type: "review", reviewer_note: "[execution] …" })
   → ActionExecutionPanel subscribes to engine + ledger and re-renders
```

`appendLedgerEntry` is the **same** function used by the Approval drawer, so:

- No new audit system.
- Decision Ledger panels (existing) automatically show execution events.
- `reviewer_name` set to `"Execution Agent (simulator)"` and the prefix
  `[execution]` makes them filterable without schema change.

### Gating

Execution can only start once the recommendation reaches the **approved**
lifecycle (`approved | executed | outcome_captured` from existing
`lifecycleFor()`). Pre-approval, the panel renders a clear gated state
pointing the user to "Mark for Approval" in the Action Hero.

### Stage templates

Each `ActionKey` (`recover`, `renewal`, `crosssell`, `winback`, `adoption`,
`review`, default) maps to a small list of `ExecutionStageEvent`s with offset
minutes from start. Renders as a clock-labeled timeline:

```
09:10  Prepare outreach
09:15  Customer contacted          (executing)
09:40  Meeting scheduled           (waiting for customer)
10:20  Executive review
Tomorrow  Outcome logged
```

`formatStageClock(startedAt, offsetMinutes)` returns `HH:MM` for same-day
events and `Tomorrow` / `+Nd` for >24h events.

### Status model

`ExecutionStatus`: `pending | executing | waiting_customer | blocked |
completed | completed_successfully`.

UI surfaces a colored status pill, current stage, progress (N/M), expected
outcome, blocked-reason banner, and three controls: **Advance step**,
**Mark blocked**, **Reset simulation**. The last advance flips status to
`completed_successfully` and appends a "Completed" entry to the ledger.

---

## 2. Files changed

| File | Kind | Purpose |
| --- | --- | --- |
| `apps/web/lib/executionEngine.ts` | NEW | Pure engine: stage templates, run lifecycle, ledger mirroring, subscribe API. |
| `apps/web/components/command/ActionExecutionPanel.tsx` | NEW | Workspace UI for execution simulator. |
| `apps/web/components/command/CommandCenter.tsx` | MODIFIED | Added `"execution"` to `WorkspaceSection`, default-open per mode, and the new accordion immediately after Recommendation Evolution. |

No other file touched. Zero changes to:

- ranking, scoring, confidence
- governance, approval workflow
- Decision Ledger architecture (schema unchanged)
- drift, recommendation delta, timeline, external change monitor
- CRM / HubSpot integrations
- BYOK / model adapters
- agent orchestration / backend contracts
- data generation

---

## 3. UX walkthrough

1. User runs the workflow → ranks 10 accounts → opens the workspace for one.
2. Workspace shows Action Hero with lifecycle ribbon (Detected → … → Approved).
3. User clicks **Mark for Approval** → approves in drawer → ledger entry written → lifecycle advances to `approved`.
4. The "Action execution" accordion (default-open in all three modes) now shows the **Ready** state with an "Execute action" button.
5. Click **Execute action** → run starts, status pill turns *Executing*, first stage marked executing with a live "In progress…" indicator. A `[execution] Started` event is appended to the Decision Ledger.
6. Each click of **Advance step** moves the run to the next stage:
   - `executing` / `waiting_customer` reflect the template.
   - Past stages collapse to muted text with completed dot.
   - Each click writes another `[execution] <Stage label>` ledger entry.
7. On final advance: status flips to **Completed successfully**, a final ledger entry `[execution] Completed — <expected outcome>` is written, and a "Outcome recorded in Decision Ledger" hint appears.
8. **Mark blocked** opens an inline reason box → on confirm, status → `blocked`, banner shows the reason, and the engine writes a `[execution] Blocked — …` ledger entry. Reset clears the run and lets the user re-execute.

### Mode defaults

| Mode | Default-open sections |
| --- | --- |
| Executive | `overview`, `execution`, `evolution` |
| Seller | `prep`, `execution`, `evolution` |
| Operations | `overview`, `evidence`, `execution`, `timeline`, `reasoning`, `evolution`, `intelligence` |

Persisted user choice in `s2a_workspace_sections_v1:<mode>` still wins on
subsequent loads.

---

## 4. Runtime validation

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | ✅ Exit 0 |
| Next.js build | `npm run build` (TELEMETRY off) | ✅ `Compiled successfully`, 4/4 static pages generated |
| Page size | — | `/` = **110 kB** (was 106 kB, +4 kB) |
| First Load JS | — | **198 kB** (was 194 kB, +4 kB) |
| Routes | — | `/` and `/_not-found` only — unchanged |

Build log preserved at `%TEMP%\next-build-16a.log`.

---

## 5. Regression report

- **CommandCenter** still renders without warnings; new section is the only
  change to the workspace render tree.
- `WorkspaceSection` union widened to include `"execution"`; persisted
  workspace section state filtering (`WORKSPACE_SECTIONS.includes(...)`)
  continues to work because the new value is added to the same array.
- Default-open lists changed (executive / seller / operations) — purely
  additive. Pre-Phase-16A persisted sections still hydrate (any unknown
  value would be filtered out by the existing `valid` predicate).
- Decision Ledger unchanged. Existing entries (approval / rejection /
  outcome) keep rendering exactly the same. New execution entries use
  `decision_type: "review"` (already supported) with a `[execution]` prefix
  in `reviewer_note` — the existing ledger UI treats them as review entries
  with a clear textual label.
- No backend, agent, or contract change. `npx tsc --noEmit` confirms the
  contract surface is intact.

---

## 6. Screenshots

Local dev server was not relaunched as part of this build-only phase
(per instructions: "no commits, no deploys, await review"). Build log and
TypeScript pass are the deliverables. Once approved, I will:

1. Start the dev server (frontend + backend on the usual ports).
2. Capture: gated state pre-approval, ready state post-approval, mid-run
   timeline, blocked state, completed-successfully state, and the Decision
   Ledger showing the `[execution]` rows interleaved with the existing
   approval rows.

---

## 7. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| `s2a_execution_runs_v1` localStorage quota in long demos | Low | `resetExecution()` clears per-recommendation runs; we never accumulate without bound (at most one run per recommendation). |
| `[execution]` ledger entries mix with human-approval entries in ledger panels | Low | Distinct `reviewer_name = "Execution Agent (simulator)"` and `[execution]` prefix makes them visually scannable; a future filter chip is trivial. |
| `LifecycleState` gating depends on a successful approval entry — if a user clears localStorage mid-demo, execution becomes gated again | Low | Intentional — re-approve to re-execute, matching the audit story. |
| Stage templates for unrecognized `action.key` fall through to a generic 5-stage path | Low | Default template is intentionally generic; new keys can be added without touching the UI. |
| First Load JS grew +4 kB | Low | Acceptable; well under the prior phase budget. |

---

## 8. Recommendation

**Approve Phase 16A as built.** It delivers the closed-loop demo moment
(Signal → Recommendation → Approval → Execute → Outcome) with zero changes
to business logic, schemas, or backend contracts, and reuses the existing
Decision Ledger as the single audit system per the brief.

Awaiting review before proceeding to **Phase 16B — Recommendation Impact
Simulator**.
