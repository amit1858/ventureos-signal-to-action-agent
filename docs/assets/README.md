# Documentation Assets

Visual assets for the Signal-to-Action Agent documentation portal. All
screenshots are captured from the live production application
(https://ventureos-signal-to-action-agent.vercel.app) and optimized for
web (downscaled to ≤ 1500 px wide; full-page captures stored as JPEG).

```
assets/
├── hero/            Landing / cover imagery
├── architecture/    Architecture & voice-layer diagrams
└── screenshots/     Product UI captures (Command Center, Workspace, Evidence,
                     Revenue Execution Center, Adaptive Experience Modes, …)
```

| Folder | File | Used by |
|---|---|---|
| `hero/` | `landing_cover.png` | README, Product Overview |
| `hero/` | `landing_full.png` | Product Overview |
| `architecture/` | `architecture_voice.png` | Architecture, Voice Chief of Staff |
| `screenshots/` | `command_center_executive.png` | Product Overview, Demo Guide |
| `screenshots/` | `command_center_full.jpg` | Product Overview |
| `screenshots/` | `mode_seller.png`, `mode_operations.png` | Product Overview (Adaptive Modes) |
| `screenshots/` | `workspace_overview.png`, `workspace_full.jpg` | Architecture, Demo Guide |
| `screenshots/` | `workspace_evidence.png` | Governance, Agent Architecture |
| `screenshots/` | `workspace_email.png`, `workspace_conversation.png` | Agent Architecture |
| `screenshots/` | `workspace_crm.png` | Revenue Execution |
| `screenshots/` | `workspace_timeline.png` | Revenue Execution (Recommendation Evolution) |
| `screenshots/` | `revenue_execution_center.png`, `revenue_execution_full.jpg`, `revenue_execution_progress.png` | Revenue Execution |
| `screenshots/` | `approval_drawer.png` | Governance, Revenue Execution |

> Higher-resolution originals live in `docs/submission/screenshots/` alongside
> the NVIDIA submission deck. The optimized copies here keep the documentation
> portal lightweight.

**Diagrams** in the documentation are authored inline as
[Mermaid](https://mermaid.js.org/) (rendered natively by GitHub) so they stay
versionable and editable in pull requests, rather than as binary image files.

All imagery shows **synthetic demo data only** — no real customer information.
