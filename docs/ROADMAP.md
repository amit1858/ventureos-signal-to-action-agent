# Roadmap — Signal-to-Action Agent

> Public roadmap aligned to the **currently deployed** product state. Labels are explicit: **Implemented**, **Next / In Review**, **Planned**, and **Future**. Items are only listed as Implemented once confirmed in the deployed production build.

The product direction remains governed:

> **AI helps explain and recommend. AI does not determine ranking, bypass governance, or execute CRM actions without human approval.**

---

## ✅ Implemented (deployed today)

Live at **https://ventureos-signal-to-action-agent.vercel.app** with backend on Render. Latest shipped: **Release 1.4B — Seller Mission Control & the guided work experience.**

- Platform landing
- Morning Brief (persona-specific entry: Executive / Seller / Operations)
- Executive Command Center
- Seller Mission Control
- Workspace
- Revenue Execution Center
- Governance
- HubSpot integration

The product now follows one continuous journey:

> **Platform → Persona-specific Morning Experience → AI Chief of Staff → Guided Mission → Workspace → Command Center → Governance**

### Implemented capability map

| Capability | What it delivers |
|---|---|
| Platform landing | Product front door — what the system is and the governed value loop, before sign-in |
| Morning Brief | Persona-specific morning entry: Executive Brief, Seller Morning Brief, or Operations Overview |
| Seller Morning Brief | AI Chief of Staff work briefing — "this mission" effort, action narrative, and a Now / Next / Later timeline |
| Today's Mission | The seller's single, clear next mission with one recommendation and one CTA |
| Seller Mission Control | First-class guided mission surface — the seven-step Review → Evidence → Outreach → CRM Note → Approval → Execution → Outcome flow with a Mission Complete and next-mission handoff |
| Executive Command Center | AI Chief of Staff narrative framing, Executive Attention Required, Executive Daily Briefing, Executive Change Brief, and Portfolio Pulse — repositioned as the power view |
| Workspace | Explain Mode — the per-account cockpit; reachable from any mission step via "Open Full Workspace" |
| Revenue Execution Center | Approved action lifecycle from prepared to outcome captured; the mission Execute step hands off here |
| Decision Ledger | Auditable decision and outcome trail |
| Governance | Hard human approval gate, evidence visibility, caveat-first trust model |
| Adaptive Experience Modes | Executive / Seller / Operations entry model on the same governed runtime |
| HubSpot integration | Test CRM sync and approval-gated writeback pathway |

---

## 🔜 Next / In Review (not yet confirmed in production)

These are designed or in review and are **not yet confirmed in the deployed production build**.

- Manager execution / adoption view — missions started, completed, drop-off step, pending approvals, outcomes captured, accounts untouched, seller follow-through
- Meeting Intelligence — meeting prep and capture connected to the mission and ledger
- Visual reasoning enhancements — richer evidence, trend, and decision visualizations across the surfaces

### Also in review

- Decision Intelligence Studio — scenario-led decision support with projected impact, assumptions, confidence, and reasoning
- Trend Intelligence — Portfolio Trend Read, Account-Level Trend Intelligence, and trend-aware executive briefing
- AI Chief of Staff Conversation — text-first conversational layer over the existing surfaces

---

## 🟢 Planned

- Voice Chief of Staff with Gnani.ai (STT / SALM / TTS)
- Digital avatar

### Voice status

| Item | Status |
|---|---|
| Voice-ready architecture | Implemented today |
| Voice Chief of Staff experience | Planned |
| Gnani.ai STT/SALM/TTS integration | Planned |
| Digital avatar | Planned |

---

## 🔮 Future

- Meeting Coach
- Enterprise Multimodal Workspace
- Coach + Delegate stages of the AI Chief of Staff (learns from outcomes; prepares low-risk work for human approval)

---

## Related documents

- [Product Overview](PRODUCT_OVERVIEW.md)
- [Architecture](ARCHITECTURE.md)
- [Agent Architecture](AGENT_ARCHITECTURE.md)
- [Governance](GOVERNANCE.md)
- [Revenue Execution](REVENUE_EXECUTION.md)
- [Voice Chief of Staff](VOICE_CHIEF_OF_STAFF.md)
- [NVIDIA Alignment](NVIDIA_ALIGNMENT.md)
