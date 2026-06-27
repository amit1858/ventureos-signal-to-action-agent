# FAQ 📖 — Signal-to-Action Agent

> For evaluators, users, and contributors who want quick, accurate answers about what the Signal-to-Action Agent is and how it works.

### What is Signal-to-Action Agent?

Signal-to-Action Agent is a governed multi-agent AI workflow, an "AI Chief of Staff for revenue teams," built by Team VentureOS as an NVIDIA Open Hackathon submission. It turns fragmented customer signals into explainable, human-approved next-best actions. It runs end-to-end on synthetic data with zero LLM keys.

### How is this different from a CRM?

A CRM stores records; it does not reason across signals or recommend prioritized next actions with explanations. Signal-to-Action Agent sits on top of CRM data (via a HubSpot connector) and produces ranked, evidence-backed recommendations while keeping humans accountable for every decision.

### How is this different from a chatbot or generic LLM assistant?

A generic assistant answers prompts; it does not enforce governance, ranking, or an audit trail. Here, a deterministic engine owns priority and confidence, a human approval gate guards CRM write-back, and the Decision Ledger records every outcome. The LLM only helps explain and recommend.

### Why multiple agents instead of one big model?

Splitting the workflow into focused agents keeps each step explainable, testable, and bounded. It also lets the deterministic engine own scoring while agents handle ingestion, analysis, governance, action, and communication independently.

### What are the six agents?

Signal Ingestion, Account Health, Opportunity, Governance, Action, and Communication. They are orchestrated deterministically and produce 10 recommendations per run.

### Why human approval?

Because humans remain accountable for all decisions. AI helps explain and recommend, but it does not execute CRM actions. A mandatory approval gate ensures a person reviews each recommendation before anything is written back.

### What is the Decision Ledger and why does it matter?

The Decision Ledger records every decision (approve/reject/review) and its outcome, creating an auditable trail of accountability. It is persisted browser-side (`localStorage` key `s2a_decision_ledger_v1`) and is backend-swappable.

### Why governance, and what does "governed" mean here?

Governed means the AI is bounded by design: it does not determine priority, change governance, or execute CRM actions. The trust model is summarized as: AI helps explain and recommend; humans remain accountable for all decisions.

### Does the AI decide priority?

No. The deterministic engine owns ranking, priority, and confidence, computed in code rather than prompts. The LLM never touches `priority_rank`, `priority_score`, `confidence`, or `approval_status`.

### Why provider abstraction / the model-adapter pattern?

The model layer uses an adapter pattern so there is no hardwired vendor. The deterministic baseline always works without keys, and a provider can be swapped in without changing the governance model.

### What is BYOK and is it safe?

BYOK (Bring Your Own Key) lets a user optionally connect their own OpenAI, Anthropic Claude, or NVIDIA Nemotron key from the browser. Keys live only in browser sessionStorage, are masked in the UI, travel in a single request, are cleared when the tab closes, and are never persisted, logged, returned by any API, or set in the server environment.

### What is the Revenue Execution Center?

It is the governed lifecycle surface where recommendations move toward execution. CRM write-back within it is gated by human approval and disabled in demo mode.

### What is Decision Intelligence Studio?

Decision Intelligence Studio is the scenario-planning layer that helps a seller or manager inspect likely business impact before action. It compares alternatives (for example, act now vs delay) and shows projected outcomes, assumptions, confidence, and agent reasoning. It is additive and does not change deterministic ranking. **Status: Next / In Review — not yet confirmed in the deployed build.**

### What is Trend Intelligence?

Trend Intelligence is the narrative + visual change layer over existing portfolio signals. It includes portfolio trend read, account-level trend intelligence, and executive change views that explain what changed, whether it is one-time or recurring, and why the recommendation moved. **Status: Next / In Review — not yet confirmed in the deployed build.**

### Is trend/decision intelligence changing the core recommendation engine?

No. Ranking, scoring, governance, approval flow, backend contracts, and Decision Ledger schema remain unchanged. Decision/Trend Intelligence is an explanatory layer over existing evidence, drift, delta, timeline, and ledger data.

### Is CRM write-back automatic?

No. CRM write-back (HubSpot tasks/notes) happens only after a human clicks Approve, and it is gated/disabled in demo mode.

### What is the Voice Chief of Staff?

A planned (NVIDIA hackathon) implementation, not yet built. The plan adds voice conversations and spoken portfolio reviews on top of the existing governed workflow.

### How does Gnani.ai fit?

Gnani.ai is the planned (NVIDIA hackathon) speech layer: STT, SALM, TTS, multilingual support with code-switching, and telephony. It is planned, not built.

### Why NVIDIA?

The roadmap targets sovereign AI with NVIDIA NIM (Nemotron) endpoints, NeMo Agent Toolkit orchestration, Triton, and GPU-optimized structured outputs. Because of the provider abstraction, an NVIDIA model layer is a drop-in for the deterministic baseline.

### Is my data real?

No. All data is synthetic, produced by a seeded generator (SEED=2026, 6 archetypes). The HubSpot integration uses a disposable test portal only.

### How do I run the project?

See [QUICK_START.md](QUICK_START.md) for backend and frontend setup. The app runs fully on synthetic data with `MODEL_PROVIDER=mock`.

### How do I demo it?

See [DEMO_GUIDE.md](DEMO_GUIDE.md) for a guided walkthrough.

### What's on the roadmap?

Work is organized into four public states:

- **Implemented**: Executive Command Center, Executive Daily Briefing, Executive Change Brief, Portfolio Pulse, Revenue Execution Center, Decision Ledger, Governance, Adaptive Experience Modes, HubSpot integration.
- **Next / In Review**: Decision Intelligence Studio, Trend Intelligence, AI Chief of Staff Conversation, Portfolio Memory, Natural-Language Timeline, Meeting Prep.
- **Planned Hackathon Implementation**: Voice Chief of Staff with planned Gnani.ai STT/SALM/TTS integration.
- **Future**: Digital Executive Avatar, Meeting Coach, Enterprise Multimodal Workspace.

See [ROADMAP.md](ROADMAP.md).

## Related documentation

- [Product Overview](PRODUCT_OVERVIEW.md)
- [Architecture](ARCHITECTURE.md)
- [Agent Architecture](AGENT_ARCHITECTURE.md)
- [Governance](GOVERNANCE.md)
- [Revenue Execution](REVENUE_EXECUTION.md)
- [Voice Chief of Staff](VOICE_CHIEF_OF_STAFF.md)
- [NVIDIA Alignment](NVIDIA_ALIGNMENT.md)
- [Quick Start](QUICK_START.md)
- [Demo Guide](DEMO_GUIDE.md)
- [Roadmap](ROADMAP.md)
- [Repository README](../README.md)
