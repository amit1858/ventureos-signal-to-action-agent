# VentureOS Tester Guide — Internal Source

## Source of Truth

| Property | Value |
|---|---|
| Canonical content model | `apps/web/lib/tester-guide/content.ts` |
| Type definitions | `apps/web/lib/tester-guide/types.ts` |
| Web route component | `apps/web/components/tester-guide/TesterGuide.tsx` |
| Route page | `apps/web/app/tester-guide/page.tsx` |
| PDF output | `apps/web/public/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf` |
| Asset manifest | `docs/private-review/tester-guide/tester-guide-assets.json` |
| Feedback template | `apps/web/public/guides/tester-feedback-template.txt` |

## Deployment Reference

| Property | Value |
|---|---|
| Production deployment | `dpl_GtYXxF8yDNuDr2GzDVhtxJKdPUr4` |
| Runtime SHA | `7601844` |
| Canonical URL | `https://ventureos-signal-to-action-agent.vercel.app` |
| Guide branch | `feature/complete-illustrated-tester-guide` |

## Screenshot Inventory

All screenshots sourced from canonical Production deployment.

| # | Asset | Source Route | Section |
|---|---|---|---|
| 1 | stage-02-todays-mission.png | / , /?view=mission | Landing, Today's Mission |
| 2 | stage-03-mission-continuity.png | /mission-control | Mission Continuity |
| 3 | stage-05-nvidia-grounded.png | /mission-control | NVIDIA's Role |
| 4 | stage-06-human-approval.png | /mission-control | Approval |
| 5 | stage-07-simulated-execution.png | /mission-control | Simulated Execution |
| 6 | stage-08-governed-outcome.png | /mission-control | Governed Outcome |
| 7 | stage-09-manager-coaching.png | /manager | Manager Coaching |
| 8 | stage-10-guardrails.png | /guardrails | Guardrails Lab |

## Screenshot-to-Section Mapping

- Section 2 (Understand Product) → stage-02-todays-mission.png
- Section 4 (Today's Mission) → stage-02-todays-mission.png
- Section 5 (Mission Continuity) → stage-03-mission-continuity.png
- Section 7 (NVIDIA's Role) → stage-05-nvidia-grounded.png
- Section 8 (Approval) → stage-06-human-approval.png
- Section 9 (Simulated Execution) → stage-07-simulated-execution.png
- Section 10 (Governed Outcome) → stage-08-governed-outcome.png
- Section 12 (Manager Coaching) → stage-09-manager-coaching.png
- Section 13 (Guardrails Lab) → stage-10-guardrails.png

## Public vs Internal Content

| Content | Visibility | Rationale |
|---|---|---|
| Guide sections 1–18 | Public | Core tester experience |
| Truth table | Public | Transparency requirement |
| Severity guidance | Public | Tester needs this |
| Glossary | Public | Self-guided experience |
| Feedback template | Public | Tester submission |
| Internal source docs | Internal | Build/maintenance reference |
| Asset manifest JSON | Internal | Provenance tracking |
| Screenshot provenance details | Internal | Audit/compliance |

## Known Limitations

1. PDF is a placeholder — a full illustrated PDF requires a PDF generation pipeline (e.g. Puppeteer/Playwright PDF capture or a dedicated PDF builder).
2. Screenshots are shared with the walkthrough route — the same production evidence assets.
3. Feedback is template-based (copy/download) — no backend submission system in this phase.
4. The guide route must be promoted separately to Production after Amit's approval.

## Generation Instructions for PDF

To generate the illustrated PDF:

1. Deploy the branch to a Preview environment.
2. Navigate to `/tester-guide` in the Preview.
3. Use browser Print → Save as PDF, or use Playwright/Puppeteer:
   ```bash
   npx playwright pdf https://preview-url/tester-guide guides/VentureOS-Signal-to-Action-Tester-Guide.pdf
   ```
4. Verify the PDF contains all sections, screenshots, truth table, and checklist.
5. Place the PDF at `apps/web/public/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf`.

## Route References

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/walkthrough` | Product walkthrough |
| `/tester-guide` | Tester guide (this feature) |
| `/manager` | Manager coaching |
| `/guardrails` | Guardrails Lab |
| `/mission-control` | Mission Control |
| `/?view=mission` | Today's Mission |
| `/?view=command` | Command Center |
| `/?view=workspace` | Workspace |
| `/?view=trust` | Trust view |
