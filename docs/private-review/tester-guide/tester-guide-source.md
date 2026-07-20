# VentureOS Signal-to-Action — Tester Guide (internal editable source)

> Private review artifact. Not shipped to end users. The public deliverables are
> the `/tester-guide` route, `public/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf`,
> and `public/guides/VentureOS-Tester-Feedback-Template.md`. This document is the
> human-editable narrative + capture provenance behind them.

## 1. Single source of truth

All public tester-guide content is generated from ONE typed model:

- `apps/web/lib/tester-guide/content.ts` — the canonical content model
  (metadata, canonical identity, 18 sections, 15 screenshots, truth table,
  severity guidance, feedback fields, final checklist, glossary).

Derived artifacts (never hand-edited; regenerate from the model):

- Route: `apps/web/app/tester-guide/page.tsx` + `apps/web/components/tester-guide/*`
- PDF: `apps/web/public/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf`
- Feedback template: `apps/web/public/guides/VentureOS-Tester-Feedback-Template.md`
- Asset manifest: `docs/private-review/tester-guide/tester-guide-assets.json`

Regenerate the PDF, feedback template, and manifest with:

```
cd apps/web
PW_DIR=<dir with node_modules/playwright-core> \
PW_CHROMIUM=<path to chromium/chrome> \
node --disable-warning=ExperimentalWarning \
  --import ./lib/memory/eval/register.mjs \
  ./lib/tester-guide/pdf/generate.mjs
```

Validate the model with:

```
cd apps/web
npm run test:tester-guide
```

## 2. Canonical journey (identity — do not drift)

| Field | Value |
| --- | --- |
| Account | Curefoods (`VOS-CUREFOODS`) |
| Mission | `M-RENEWAL-1` |
| Recommendation | `REC-M-RENEWAL-1` |
| Template | `renewal-risk-parallel-v1` |
| Audit reference | `audit://M-RENEWAL-1/REC-M-RENEWAL-1` |
| System outcome | `Governed work prepared successfully.` |
| Business outcome | `Awaiting external response.` |
| NVIDIA provider / model | `nim` / `nvidia/nvidia-nemotron-nano-9b-v2` |

These are re-exported from `lib/walkthrough/stages.ts` (`WALKTHROUGH_CANONICAL`)
so the guide can never contradict the walkthrough.

## 3. Screenshot provenance

- Source deployment: `dpl_GtYXxF8yDNuDr2GzDVhtxJKdPUr4`
- Source SHA: `7601844`
- Canonical URL: `https://ventureos-signal-to-action-agent.vercel.app`
- Capture viewport: 1440px desktop
- Capture timestamp: 2026-07-19T23:09:00+05:30

Original capture archive (out-of-repo, not tracked):
`session-state/.../files/production-evidence-20260719/shots/` with
`capture-manifest.json`. The 15 vetted PNGs were copied into
`apps/web/public/guides/screenshots/` with clean, public-safe filenames. The
per-asset mapping, section usage, dimensions, mission/NVIDIA state, and short
checksums live in the machine-readable `tester-guide-assets.json`.

Every embedded asset was screened to contain no Preview URL, no internal branch
label, no local backend address text, no filesystem path, no deployment debug
text, and no secret.

## 4. Section map (18)

1. Before you begin — expectations, safe/deterministic framing (no screenshot)
2. Understand the product in two minutes — landing (`/`)
3. Review the full product walkthrough — `/walkthrough`
4. Find Today's Mission — canonical mission entry
5. Open the governed mission — Mission Control awaiting approval
6. Read why the account is at risk — evidence-before-confidence
7. Approve the recommendation — human approval required before any action
8. Watch simulated execution — three simulated actions + receipts
9. Understand NVIDIA's role — grounded narrative, never selects/approves/executes
10. Validate the governed outcome — system vs business outcome
11. Review shared persona projections — Seller / Executive / Operations
12. Review Manager Coaching — post-mission Guided Scenario, browser-local
13. Review Guardrails Lab — deterministic authority + NVIDIA telemetry
14. Validate the audit chain and idempotency
15. Explore every route — route inventory + expected states
16. Production versus demonstration — truth table
17. How to rate what you find — P0/P1/P2 severity
18. Final tester checklist

(Truth table, severity, feedback, checklist, and glossary also render as
dedicated blocks below the numbered sections.)

## 5. Expected states per key route

- `/` — landing renders, human-approval assurance visible, honest data-source label.
- `/walkthrough` — all stages render, embedded evidence expands via lightbox.
- Mission Control (canonical CTA) — awaiting approval → approved → simulated
  execution → completed; system outcome "Governed work prepared successfully.",
  business outcome "Awaiting external response."
- `/manager` — post-mission Guided Scenario; state NOT REVIEWED → REVIEWED →
  SIMULATED INTERVENTION ASSIGNED; browser-local; no governed state changes.
- `/guardrails` — safe Allowed (no findings), unsafe Blocked/Redacted with named
  deterministic findings; Live NVIDIA (available true, fallbackUsed false, raw
  score shown honestly) and Forced fallback (deterministic decision preserved).

## 6. Public vs internal decisions

- Public copy avoids the literal tokens `localhost` and `Feature Branch`; it uses
  neutral phrasing ("local backend address", "pre-release branch") so the
  public-safety eval passes and no internal wording leaks.
- Deployment IDs, SHAs, and capture timestamps live ONLY in this internal source
  and the asset manifest — never in public captions, alt text, or on the route.
- NVIDIA raw score is described as telemetry, never as a calibrated probability
  or confidence; deterministic policy is stated as the final authority.
- Voice and Digital Human are listed only under the Future tier — never Production.

## 7. Known limitations

- Screenshots are static production captures, not live embeds; if the product UI
  changes, recapture and update `content.ts` + the manifest, then regenerate.
- The PDF is rendered headless from the same model; it is illustrative and must
  be regenerated whenever `content.ts` changes.
- Feedback is copy/download only — there is no backend submission endpoint.

## 8. Change log

- Initial build: illustrated `/tester-guide` route, illustrated PDF, downloadable
  feedback template, machine-readable asset manifest, and 30-check deterministic
  eval — all generated from a single canonical content model. No protected engine
  touched; additive namespaces only.
