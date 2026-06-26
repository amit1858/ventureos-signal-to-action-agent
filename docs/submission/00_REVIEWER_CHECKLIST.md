# Reviewer Checklist & Pre-Submission Quality Bar

Use this before finalizing the NVIDIA submission. The bar: this package should
read like it came from a senior Product Marketing + Product Management org
(Microsoft Build / NVIDIA GTC / AWS re:Invent quality) — not a hackathon.

---

## Positioning integrity

- [ ] Product is described as an **AI-native Enterprise Revenue Operating
  System** — never as an AI assistant, copilot, CRM, or dashboard.
- [ ] The signal→outcome→learning loop appears in the deck, submission,
  one-pager, and narrative consistently.
- [ ] "Governed," "explainable," "human-approved," "closed-loop," and
  "decision-centric" are used as the core vocabulary.
- [ ] Every claim of intelligence is paired with a governance boundary (AI
  explains; humans decide).
- [ ] The **Voice Chief of Staff (Gnani.ai)** is positioned as a *planned
  hackathon implementation* and as an interaction layer **above** the governed
  core — it never changes ranking, governance, or the human-approval gate.

## Accuracy (no overclaiming)

- [ ] NVIDIA is described honestly: provider-abstracted **today**, NIM/Nemotron
  **near-term**, NeMo/Triton **future**. No implication NVIDIA is in the live
  hot path now.
- [ ] Only features that **exist** are presented as current: Command Center,
  Attention Brief, Portfolio Pulse, Daily/Change Brief, Recommendation Queue,
  Recommendation Evolution, Workspace (Action Hero, Evidence, Timeline),
  Decision Workspace, **Revenue Execution Center**, Decision Ledger, Governance,
  Human Approval, Confidence, Agent Activity, provider abstraction, Developer
  Diagnostics (internal), NVIDIA-ready runtime.
- [ ] Decision Impact Studio (Phase 16B) is labeled **in review / projected
  impact**, not deployed-and-live, until approved.
- [ ] No removed/legacy features are mentioned as current.
- [ ] Voice Chief of Staff (Gnani.ai) is labeled a **planned hackathon
  implementation** — not already built, not distant future. Digital Avatar
  remains **future vision**. Neither is presented as a current/live feature.
- [ ] Business-value numbers are framed as illustrative theses, not measured
  customer results.

## Completeness (all deliverables present)

- [ ] `01_NVIDIA_SUBMISSION_DECK.md` — 16–20 slides, production copy + speaker
  notes.
- [ ] `02_NVIDIA_SUBMISSION.md` — full submission (problem → judging map).
- [ ] `03_EXECUTIVE_ONE_PAGER.md` — under-two-minute overview.
- [ ] `04_DEMO_SCRIPT.md` — 5 / 10 / 15-minute versions.
- [ ] `05_PRODUCT_NARRATIVE.md` — why sellers/dashboards/copilots/rec-engines
  fail; how S2A closes the loop.
- [ ] `06_ARCHITECTURE_DIAGRAMS.md` — text specs for all diagrams.
- [ ] `07_ROADMAP.md` — AI Chief of Staff, Voice-First, Digital Avatar.
- [ ] `08_SCREENSHOT_GUIDE.md` — journey-ordered capture plan + placements.
- [ ] `00_REVIEWER_CHECKLIST.md` — this file.
- [ ] `Signal-to-Action-Agent_NVIDIA-Deck.pptx` / `.pdf` — exported deck
  (20 slides, screenshots embedded, speaker notes preserved).
- [ ] `screenshots/` — 20 real production captures + the voice-layer
  architecture visual (`SHOT-12_architecture_voice.png`).
- [ ] Speaker notes present on every deck slide.

## Deck quality

- [ ] One message per slide; headlines large; minimal body text.
- [ ] Dark premium theme tokens applied consistently (bg `#0A0B0F`, accent
  `#F5B301`, affirm `#2DD4BF`, risk `#F87171`).
- [ ] Suggested structure covered: Title · Problem · Why CRMs fail · Vision ·
  Architecture · Multi-agent · Command Center · Portfolio Intelligence ·
  Decision Workspace · Revenue Execution · Governance · Business Value · NVIDIA
  Alignment · Differentiators · Roadmap · Closing.
- [ ] Every `SHOT-xx` placeholder replaced with a real screenshot before submit.

## Screenshots

- [ ] Captured per `08_SCREENSHOT_GUIDE.md` in journey order (SHOT-01 → 06).
- [ ] Curefoods used as the continuity account throughout.
- [ ] Lifecycle state visibly progresses across Workspace → Execution → Ledger.
- [ ] Developer Diagnostics hidden in all customer-facing shots.
- [ ] No secrets, no real customer data, no employer-internal systems visible.
- [ ] Captured at 2x; browser chrome cropped.

## Architecture & technical credibility

- [ ] The three-layer separation (deterministic decision / advisory reasoning /
  human governance) is clearly shown, including the "LLM cannot write priority"
  firewall.
- [ ] Nine-agent workflow diagram present with typed-contract annotations.
- [ ] Deployment topology shows Vercel + Render + HubSpot + BYOK with the
  no-server-keys security note.
- [ ] Provider-abstraction diagram marks adapter maturity honestly.

## Governance & Responsible AI

- [ ] AI boundary (helps with / does NOT) stated explicitly.
- [ ] Human approval gate described as a hard contract.
- [ ] Decision Ledger described as append-only, single source of truth.
- [ ] BYOK posture: keys in sessionStorage only; never persisted/logged/
  returned/deployed; deterministic fallback always available.
- [ ] Synthetic-by-default / test-portal-only data; no real customer data.

## Narrative & business framing

- [ ] The four failure modes (sellers, dashboards, copilots, rec-engines) are
  each explained structurally, not dismissively.
- [ ] Every feature maps to a measurable business value.
- [ ] CIO/VC/judge framing is present (audit, traceability, cost, scale).
- [ ] One continuous demo story (a seller's morning) — not a feature tour.

## Judging alignment

- [ ] Explicit mapping to: Innovation, Technical depth, AI architecture,
  Business impact, Enterprise readiness, Scalability, Responsible AI, UX, NVIDIA
  alignment, Future extensibility.

## Logistics

- [ ] Live URL works and backend is warmed before any live presentation.
- [ ] Repo link is correct and public-appropriate.
- [ ] Submission deadline (**July 1**) noted; package frozen before then.
- [ ] **No application code modified, no commits, no pushes, no deploys** as part
  of producing this package.

---

## Reviewer sign-off

| Reviewer lens | Question to answer "yes" | ✅ |
|---|---|:--:|
| NVIDIA judge | Is the NVIDIA path credible and honestly scoped? | ☐ |
| YC partner | Is the category/wedge clear and defensible? | ☐ |
| Microsoft CVP | Is this enterprise-grade and governed? | ☐ |
| Enterprise CIO | Would this pass a Responsible-AI / security review? | ☐ |
| Seller / end user | Does the demo tell a story I recognize? | ☐ |

When every box is checked and all five lenses sign off, the package is ready to
finalize for the July 1 submission.
