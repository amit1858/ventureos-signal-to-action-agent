# Architecture Diagrams — Text Specification

Render-ready specifications for every diagram in the submission package. Each
diagram includes: (a) an ASCII reference, (b) a node/edge spec for a design
tool, and (c) styling notes for the dark premium theme.

**Theme tokens:** background `#0A0B0F` · surface `#14161C` · headline `#FFFFFF` ·
muted `#8B92A6` · accent/active `#F5B301` (amber) · affirm `#2DD4BF` (teal) ·
risk `#F87171` (red) · edges `#3A3F4B`.

---

## Diagram 1 — The Closed Governed Loop (hero)

**Purpose:** The single most important visual. Used on deck Slides 1, 5, 18 and
the submission cover.

**ASCII reference:**
```
            ┌──────────────────────────────────────────────────┐
            │                                                  │
            ▼                                                  │
       ╭─────────╮     ╭───────────╮     ╭────────────────╮     │
       │ SIGNALS │ ──▶ │ REASONING │ ──▶ │ PRIORITIZATION │     │
       ╰─────────╯     ╰───────────╯     ╰────────┬───────╯     │
                                                  ▼             │
                                         ╭──────────────────╮   │
                                         │ GOVERNED DECISION │   │
                                         ╰────────┬─────────╯   │
                                                  ▼             │
                                         ╭──────────────────╮   │
                                         │  HUMAN APPROVAL   │   │
                                         ╰────────┬─────────╯   │
                                                  ▼             │
                                       ╭────────────────────╮   │
                                       │ REVENUE EXECUTION  │   │
                                       ╰────────┬───────────╯   │
                                                ▼               │
                                       ╭────────────────────╮   │
                                       │ BUSINESS OUTCOMES  │   │
                                       ╰────────┬───────────╯   │
                                                ▼               │
                                       ╭────────────────────╮   │
                                       │  DECISION LEDGER   │   │
                                       ╰────────┬───────────╯   │
                                                ▼               │
                                       ╭────────────────────╮   │
                                       │ CONTINUOUS LEARNING│───┘
                                       ╰────────────────────╯
```

**Node/edge spec:** 9 nodes in a ring (clockwise from top-left). Edges
directional, single-weight, `#3A3F4B`; the "Learning → Signals" return edge
slightly brighter to imply the loop closing. One amber "active" node animates
around the ring in the deck build.

**Styling:** Rounded rectangles, surface fill, white labels. Governance nodes
(Governed Decision, Human Approval, Decision Ledger) get a thin teal left
border to signal "governed." Negative space dominant.

---

## Diagram 2 — Three-Layer Governed Architecture

**Purpose:** Deck Slide 6. Shows the separation that makes the system
governable.

**ASCII reference:**
```
┌──────────────────────────────────────────────────────────────────┐
│ EXPERIENCE LAYER   Executive · Seller · Operations (adaptive UI)   │
└──────────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────────┐
│ GOVERNANCE LAYER   Approval gate · Decision Ledger · Evaluation    │ teal
│                    Confidence + caveats · Human-in-the-loop        │
└──────────────────────────────────────────────────────────────────┘
                              ▲
        ══════════ LLM CANNOT WRITE BELOW THIS LINE ══════════  (firewall)
                              ▲
┌──────────────────────────────────────────────────────────────────┐
│ DECISION LAYER     Deterministic Governed Decision Engine          │ teal
│  (owns priority · score · confidence — reproducible, evidence-led) │
└──────────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────────┐
│ REASONING LAYER    Advisory only · provider-abstracted (BYOK)      │ amber
│  OpenAI · Anthropic · NVIDIA Nemotron/NIM  → summaries, drafts     │
└──────────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────────┐
│ DATA LAYER         HubSpot CRM · External signals · Synthetic data │
└──────────────────────────────────────────────────────────────────┘
```

**Key callout:** The bold "firewall" line between the advisory reasoning layer
and the decision layer is the most important annotation in the whole package.
Label it: *"The language model has no write path to priority, score,
confidence, approval, or CRM writeback."*

**Styling:** Stacked full-width bands. Decision + Governance bands carry the
teal accent (trusted/deterministic). Reasoning band carries amber (advisory).
The firewall line is a bright dashed rule with a lock glyph.

---

## Diagram 3 — Multi-Agent Workflow (the kernel)

**Purpose:** Deck Slide 7 and the submission Architecture section.

**ASCII reference:**
```
  DATA ─▶ ┌────────────────────────┐
          │ Signal Ingestion Agent │  normalize + group → AccountContext
          └───────────┬────────────┘
                      ▼
          ┌────────────────────────┐        ┌────────────────────────┐
          │  Account Health Agent  │        │    Opportunity Agent   │
          │  risk signals          │        │    growth signals      │
          └───────────┬────────────┘        └───────────┬────────────┘
                      └──────────────┬───────────────────┘
                                     ▼
                        ┌────────────────────────┐
                        │   Governance Agent     │ evidence sufficiency,
                        │                        │ caveats, approval enforce
                        └───────────┬────────────┘
                                    ▼
                        ┌────────────────────────┐
                        │  Recommendation Agent  │ ranked, scored action
                        └───────────┬────────────┘  + evidence + confidence
                                    ▼
                        ┌────────────────────────┐
                        │  Communication Agent   │ script · email · note
                        └───────────┬────────────┘
                                    ▼
                        ═══ HUMAN APPROVAL GATE ═══
                                    ▼
                        ┌────────────────────────┐
                        │    Execution Agent     │ orchestrate lifecycle
                        └───────────┬────────────┘
                                    ▼
                        ┌────────────────────────┐
                        │     Outcome Agent      │ capture business result
                        └───────────┬────────────┘
                                    ▼
                        ┌────────────────────────┐
                        │     DECISION LEDGER     │ immutable trace
                        └────────────────────────┘
```

**Note:** Health and Opportunity agents are shown in parallel (they are
independent per-account analyses; this is also the natural first parallelization
target for NeMo Agent Toolkit). Every edge is a **typed Pydantic contract** —
annotate two or three edges with their schema names (`AccountContext`,
`HealthAssessment`, `Recommendation`).

**Styling:** Vertical spine, surface nodes, amber for the agent currently
"active" in a build animation. The HUMAN APPROVAL GATE is a bright teal full-
width bar — visually heavier than any agent, signaling "nothing crosses without
a human."

---

## Diagram 4 — Deployment & Runtime Topology

**Purpose:** Submission Implementation section; proves "shipped, not slideware."

**ASCII reference:**
```
        ┌─────────────────────────┐         ┌──────────────────────────┐
        │  Browser (user)         │         │  BYOK provider (optional) │
        │  • Next.js UI           │  HTTPS  │  OpenAI / Anthropic /     │
        │  • sessionStorage key ──┼────────▶│  NVIDIA  (key from browser│
        │  • Decision Ledger (UI) │         │   in request body only)   │
        └────────────┬────────────┘         └──────────────────────────┘
                     │ HTTPS (NEXT_PUBLIC_API_BASE_URL)
                     ▼
        ┌─────────────────────────┐
        │  Vercel — Frontend      │   Next.js 14 · TS · Tailwind (static/SSR)
        └────────────┬────────────┘
                     │ REST /api/*
                     ▼
        ┌─────────────────────────┐         ┌──────────────────────────┐
        │  Render — Backend       │  REST   │  HubSpot test portal      │
        │  • FastAPI · Pydantic   │────────▶│  companies/contacts/deals │
        │  • Orchestrator + agents│         │  + approved task/note     │
        │  • Scoring service      │         │  writeback                │
        │  • SQLite               │         └──────────────────────────┘
        │  • ModelAdapter factory │         ┌──────────────────────────┐
        │     mock|openai|claude| │  REST   │  External signals         │
        │     nvidia_nim          │────────▶│  Serper / SearchAPI (opt) │
        └─────────────────────────┘         └──────────────────────────┘
```

**Security annotations:**
- No LLM keys server-side (BYOK only; key travels in one request body, used
  once).
- HubSpot token is a private-app **test** portal credential, server-held, never
  exposed to the browser.
- `NEXT_PUBLIC_API_BASE_URL` is the only public frontend config.

**Styling:** Two host "cards" (Vercel, Render) as the visual anchors; external
systems as lighter satellite cards. Dashed edges for optional integrations
(BYOK, external signals).

---

## Diagram 5 — Provider Abstraction (NVIDIA path)

**Purpose:** Deck Slide 14 and the NVIDIA Alignment section.

**ASCII reference:**
```
        Agents / Reasoning calls
                  │
                  ▼
        ┌───────────────────────┐
        │   ModelAdapter (ABC)  │  generate(request) -> ModelResponse
        │   base.py contract    │  health() -> bool
        └──────────┬────────────┘
                   │  get_model_adapter()  ← MODEL_PROVIDER / BYOK
   ┌───────────┬───┴───────┬───────────────┬─────────────────┐
   ▼           ▼           ▼               ▼                 ▼
┌────────┐ ┌────────┐ ┌──────────┐  ┌───────────────┐  ┌──────────────┐
│ mock   │ │ openai │ │ claude   │  │ nvidia_nim    │  │ (future)     │
│ deterministic│      │          │  │  Nemotron      │  │ NeMo Toolkit │
│ baseline │ │ BYOK   │ │ BYOK     │  │  NIM endpoint  │  │ Triton batch │
└────────┘ └────────┘ └──────────┘  └───────────────┘  └──────────────┘
   CURRENT     CURRENT    CURRENT       WIRED / NEAR        FUTURE
```

**Honesty annotation (important for judges):** label the maturity under each
adapter — `mock` = live default, `openai`/`claude` = live BYOK, `nvidia_nim` =
wired stub / near-term NIM, NeMo+Triton = future. Do not imply NVIDIA is in the
live hot path today.

**Styling:** Single contract node fanning out to adapter chips. The
`nvidia_nim` chip uses NVIDIA green only as a small badge (don't overclaim);
amber underline marks "configuration-level swap."

---

## Diagram 6 — Decision Ledger & Lifecycle (governance proof)

**Purpose:** Deck Slide 12; Governance section.

**ASCII reference:**
```
  Recommendation lifecycle (per account):

  Detected ─▶ Recommended ─▶ Prepared ─▶ Submitted ─▶ Approved ─┐
                                                                │
                            ┌───────────────────────────────────┘
                            ▼
                        Executed ─▶ Outcome Captured

  Every transition appends an immutable Decision Ledger entry:
  ┌───────────────────────────────────────────────────────────────┐
  │ ledger_id · timestamp · account · decision_type · reviewer     │
  │ evidence_used · reasoning_summary · confidence · caveats        │
  │ business_impact · source(deterministic|ai_assisted|multi_agent) │
  └───────────────────────────────────────────────────────────────┘
        │              │                │                 │
        ▼              ▼                ▼                 ▼
   Timeline      Lifecycle Ribbon   Agent Activity   Executive Brief
   (reads ledger — no duplicate state stores)
```

**Key message:** One append-only source of truth; every surface is a *read* of
the ledger. No parallel state. This is what makes the audit trail credible.

**Styling:** Horizontal lifecycle pipeline on top (teal nodes); ledger record
card in the middle; four downstream surfaces fed by arrows from the ledger.
Annotate "append-only" and "single source of truth."

---

## Diagram 7 — Experience Modes over one core

**Purpose:** Submission UX/innovation; explains role-adaptive design.

**ASCII reference:**
```
                ┌───────────────────────────────────────────┐
                │      ONE GOVERNED CORE (decision +         │
                │      governance + ledger + execution)      │
                └───────────────┬───────────────────────────┘
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   ┌─────────────┐       ┌─────────────┐       ┌──────────────┐
   │ EXECUTIVE   │       │   SELLER    │       │ OPERATIONS   │
   │ Command Ctr │       │ Workspace + │       │ Trust &      │
   │ Attention   │       │ Revenue     │       │ Governance,  │
   │ Brief,Pulse │       │ Execution   │       │ Ledger, eval │
   └─────────────┘       └─────────────┘       └──────────────┘
   "what changed,        "my account,          "prove every
    why, what to do"      approve, execute"      decision"
```

**Styling:** Hub-and-spoke; the core is the heavy central node. Each mode card
carries its one-line job-to-be-done.

---

## Diagram 8 — Voice Layer (Gnani.ai, planned hackathon implementation)

**Purpose:** Show how the **Voice Chief of Staff** wraps the governed core as a
spoken interaction channel. Used on deck Slide 6 (4-layer) and Slide 16 (Voice
Chief of Staff). A rendered version of the full four-layer stack is available at
`screenshots/SHOT-12_architecture_voice.png`.

> **Status — planned hackathon implementation** (not yet built; not distant
> future). Voice is an interaction layer *above* the decision core — it never
> changes ranking, scoring, governance, or approval.

**ASCII reference (the voice loop):**
```
   ╭───────────╮
   │  SELLER   │  speaks a question
   ╰─────┬─────╯
         ▼
 ┌───────────────────────────────────────────────┐
 │  VOICE LAYER — Gnani.ai                        │
 │  Speech-to-Text · SALM · (multilingual,       │
 │  English + regional code-switching)           │
 └───────────────────┬───────────────────────────┘
                     ▼  structured intent
 ┌───────────────────────────────────────────────┐
 │  REASONING — provider-abstracted, NVIDIA-ready │
 │            ▼                                   │
 │  GOVERNANCE — deterministic core · approval    │
 │            ▼            (UNCHANGED)            │
 │  EXECUTION — Revenue Execution Center          │
 └───────────────────┬───────────────────────────┘
                     ▼  governed answer
 ┌───────────────────────────────────────────────┐
 │  VOICE LAYER — Gnani.ai · Text-to-Speech       │
 └───────────────────┬───────────────────────────┘
                     ▼
   ╭───────────────────────────╮
   │ NATURAL VOICE CONVERSATION │
   ╰───────────────────────────╯
```

**Node/edge spec:**
- Four stacked layers: **Voice** (Gnani.ai) → **Reasoning** (NVIDIA-ready) →
  **Governance** (deterministic core, source of truth) → **Execution** (Revenue
  Execution Center). The loop returns up through Voice (TTS) to the seller.
- A firewall line between **Voice/Reasoning** (advisory) and
  **Governance/Execution** (authoritative) — speech and the LLM have no write
  path across it.
- Agent chips inside Reasoning: Signal Ingestion · Account Health · Opportunity ·
  Governance · Action · Communication.

**Styling:** Voice layer in teal `#2DD4BF` (planned), Reasoning in amber
`#F5B301` (NVIDIA-ready), Governance in white/neutral (authority), Execution in
teal. Keep the firewall line prominent — it is the governance story.

---

## Production guidance

- Build Diagram 1 first — it is the cover, three slides, and the conceptual
  anchor.
- Keep all diagrams on the same dark theme tokens for cohesion.
- Prefer **one** visual idea per diagram; if a diagram needs a paragraph to
  explain, split it.
- Recommended tooling: Excalidraw (dark mode), Figma, or draw.io. The
  Excalidraw skill in this environment can generate Diagrams 1, 2, 3, and 6
  directly from these specs if desired.
- Export at 2x for slide clarity; keep source files in `docs/submission/assets/`.
- Diagram 8 (Voice Layer) is already rendered as a submission-grade visual at
  `screenshots/SHOT-12_architecture_voice.png` — embed it directly on the deck
  where the four-layer architecture is shown.
