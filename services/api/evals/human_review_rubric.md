# VentureOS Vertical Slice — Human Review Rubric (L4)

Internal reviewer checklist for the Real HubSpot Signal Vertical Slice demo. This is a
human judgement layer only — it is **not** public documentation and is **not** executed
by the eval pack. Use it after the deterministic (L1) and scenario (L2) evaluations pass.

Score each item Pass / Needs work. The slice is demo-ready only when every item passes.

| # | Criterion | Pass condition |
|---|-----------|----------------|
| 1 | **AI speaks first** | The experience opens with the AI's narrative, not a form or a metric grid. |
| 2 | **Narrative before metrics** | The story of the signal comes before any numbers or scorecards. |
| 3 | **One recommendation** | Exactly one recommended next step is surfaced, not a menu of options. |
| 4 | **Recommendation is advisory** | The next step is clearly guidance — it never implies the system will act on its own. |
| 5 | **Evidence is visible** | The source signal (renewal date change), event id, and fingerprint are traceable. |
| 6 | **Governed stop is explained clearly** | An identity or approval stop reads as a *governed outcome*, not an error or a bug. |
| 7 | **No unsupported factual claim** | Every number and date in the narrative traces to governed evidence. |
| 8 | **No execution-authority claim** | The narrative never claims it approved, executed, or wrote back when it did not. |
| 9 | **No credential or sensitive payload exposure** | No API keys, tokens, database paths, or raw customer payloads appear in any surface. |
| 10 | **Trusted-colleague tone** | The narration feels like a knowledgeable teammate, not a raw system log. |
| 11 | **Understandable in under 60 seconds** | A first-time reviewer grasps the signal, the mission, and the required decision quickly. |

## Governed-stop language guidance

When the slice stops at identity corroboration, describe it plainly, for example:

> "This account currently has one corroborating source. Governance requires a second
> corroborating system before an action can be approved, so the mission is holding at
> identity verification. Nothing has been executed."

Do **not** describe a governed stop as a failure, and do **not** present the offline
corroborated path as a fully live multi-source execution.
