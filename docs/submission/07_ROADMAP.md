# Roadmap — Signal-to-Action Agent

From a governed Revenue Operating System today, to a **Voice-native Enterprise
AI Chief of Staff** built during the hackathon, to an enterprise multimodal AI
workspace tomorrow. Every milestone preserves one invariant:

> **AI explains and recommends. Humans decide and remain accountable.**
> The deterministic decision core, the human approval gate, and the immutable
> Decision Ledger are never removed — future capabilities orchestrate them,
> they do not bypass them.

We separate honestly into three tiers so reviewers can tell implemented reality
from committed hackathon work from longer-range vision:

1. **Current — shipped and live**
2. **Hackathon Implementation — what we are building now (incl. the Voice Chief of Staff)**
3. **Future — the longer-range vision**

---

## 1 · Current — shipped and live (V2, post Phase 16A)

Live at https://ventureos-signal-to-action-agent.vercel.app

- **Executive Command Center** — Executive Attention Brief, Portfolio Pulse,
  Executive Daily Brief, Executive Change Brief.
- **Portfolio Intelligence** — governed multi-agent core (nine typed agents),
  deterministic ranking, evidence + confidence, risk/opportunity matrix,
  Recommendation Queue, Recommendation Evolution, Portfolio Timeline.
- **Account Workspace** — Action Hero, Evidence, Conversation Prep, Email Draft,
  CRM Update, Timeline.
- **Revenue Execution Center** — event-driven, auto-advancing execution with an
  actor model and business-outcome capture (Phase 16A).
- **Governance & Decision Ledger** — human approval gate, immutable Decision
  Ledger, confidence, caveats, CRM Writeback Readiness, evaluation board.
- **Adaptive experience modes** — Executive / Seller / Operations over one core.
- **Integrations & providers** — HubSpot CRM (approved writeback), external
  signals (pluggable), BYOK provider abstraction (OpenAI / Anthropic / NVIDIA),
  Developer Diagnostics (internal).
- **In review:** Decision Impact Studio (Phase 16B) — projected what-if impact,
  ledger-logged, no CRM writeback.

---

## 2 · Hackathon Implementation — what we are building now

> **This tier is committed hackathon work — not shipped yet, and not distant
> future.** It is what we intend to deliver during the India Agentic AI Open
> Hackathon 2026.

### 2A · The Voice Chief of Staff (powered by Gnani.ai)

**The flagship hackathon build:** make the governed Revenue Operating System
**conversational**. The seller stops navigating dashboards and simply *talks* to
the system — and the system talks back — while every existing guarantee
(governance, evidence, confidence, human approval) is preserved underneath.

- **Natural seller conversations** — ask the book in plain language: *"Which
  accounts need my attention today? What changed since yesterday? Why is this
  account at risk? Prepare me for my meeting. Walk me through this
  recommendation."*
- **Voice-guided account reviews** — talk through an account's risk,
  opportunity, evidence, and recommended action, hands-free.
- **Multilingual & code-switching** — English plus Indian regional languages,
  including natural English ⇄ regional code-switching mid-sentence.
- **Spoken morning briefing** — the Executive Daily Brief, read to you, with the
  ability to ask follow-ups out loud.
- **Governed voice actions** — anything proposed by voice still flows through
  the approval gate and the Decision Ledger. Voice never bypasses governance.

**Gnani.ai is the strategic speech layer**, providing enterprise-grade speech
recognition, low-latency real-time conversations, Indian-language support with
English + regional code-switching, telephony-quality speech, **Speech-Augmented
Language Models (SALM)**, and real-time seller interactions.

```
Seller speaks
   ↓  Gnani.ai  (Speech-to-Text · SALM)
Signal-to-Action Agent   (structured intent)
   ↓  Multi-Agent Reasoning → Governance Engine
Revenue Operating System   (governed decision + execution — UNCHANGED)
   ↓  Gnani.ai  (Text-to-Speech)
Natural voice conversation
```

**Four cleanly separated layers** let speech and inference evolve independently
without touching business logic:

| Layer | Technology | Responsibility |
|---|---|---|
| **Voice** | Gnani.ai (STT · SALM · TTS) | Speech in, speech out, multilingual |
| **Reasoning** | Provider-abstracted, **NVIDIA-ready** | Intent → structured reasoning |
| **Governance** | Deterministic core + approval gate | Authority, evidence, caveats, ledger |
| **Execution** | Revenue Execution Center | Governed action + business outcome |

### 2B · NVIDIA inference in the hot path

Promote the wired `nvidia_nim_adapter` from stub to production reasoning:
self-hosted **Nemotron via NIM endpoints** for data-resident, no-exfiltration
inference, with JSON-schema-enforced structured outputs for agent contracts.
*Preserves:* deterministic ranking owns priority; NVIDIA powers the advisory
(and voice-reasoning) layer only.

### 2C · Multi-agent strategic reasoning

Evolve from sequential agents to a proposer / critic / governance review-board
pattern that debates alternatives, surfaces dissent, and plans multi-step
engagement sequences. *Preserves:* humans own approval; the ledger records every
agent's position.

---

## 3 · Future — the longer-range vision

**Status: vision beyond the hackathon.** The natural evolution once the Voice
Chief of Staff is proven.

- **Digital executive avatar** — the Chief of Staff gains a face: an embodied,
  enterprise-safe digital colleague for portfolio walkthroughs and deal reviews.
- **Live seller companion** — a real-time, in-the-moment assistant that listens
  during calls and surfaces governed guidance.
- **Meeting coaching & rehearsal** — practise the renewal conversation, get
  objection handling and talk-track feedback before the call.
- **Enterprise multimodal AI workspace** — voice, screen, avatar, and document
  intelligence unified over the same governed core.
- **Enterprise production posture** — SSO / RBAC / multi-tenant isolation,
  managed key vault alongside BYOK, server-side ledger with row-level security,
  NeMo Agent Toolkit orchestration, and NVIDIA Triton batch portfolio planning.

**Guardrails carried forward unchanged:** every future interface — voice, avatar,
or multimodal — is still backed by the deterministic decision core, still cites
evidence, still requires human approval for consequential actions, and still
writes to the immutable Decision Ledger. Each new surface is an interface to a
governed system — never an autonomous actor.

---

## The through-line

| Tier | Headline | Interface | Governance invariant |
|---|---|---|---|
| **Current** | Governed Revenue OS + Execution | Web surfaces | Deterministic core · human gate · ledger |
| **Hackathon** | Voice Chief of Staff (Gnani.ai) + NVIDIA inference | Voice + Web | Unchanged + voice governance |
| **Future** | Digital avatar · multimodal AI workspace | Multimodal | Unchanged |

```
   You ⇄ Voice Chief of Staff   (Gnani.ai speech · conversation · memory)
              │  orchestrates (read + propose, never bypass)
              ▼
   Governed Revenue OS   (agents · decision engine · ledger · execution)
```

Every step adds capability. No step removes governance. That is the discipline
that makes this deployable in an enterprise — today, during the hackathon, and
at every horizon.
