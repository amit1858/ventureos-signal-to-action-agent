# Evaluation Plan: Signal-to-Action Agent

## Overview

The Signal-to-Action Agent evaluation harness ensures the system delivers **reliable, structured, and explainable recommendations** across a diverse set of SMB account prioritization queries. The eval suite validates response schema compliance, evidence presence, governance enforcement, and latency budgets—critical metrics for hackathon judging and production readiness.

**Evaluation harness location:**  
- **Test queries:** `services/api/evals/test_queries.json`  
- **Runner script:** `services/api/evals/evaluation_runner.py`

---

## Test Query Suite

The evaluation suite includes **10 representative queries** that stress different aspects of the multi-agent workflow:

| ID | Query | Expected Behavior |
|----|-------|-------------------|
| 1 | Which SMB accounts need attention this week and why? | General prioritization; top 5–10 accounts with mixed risk + opportunity |
| 2 | Which accounts have declining spend but high growth potential? | Filter for negative spend trend + high `growth_potential_score` |
| 3 | Which accounts have support risk and should be escalated? | Filter for high `support_risk_score`; recommend support-led action |
| 4 | Which accounts responded to campaigns but have no recent follow-up? | Filter for high `campaign_response_score` + high `last_contact_days` |
| 5 | Which renewal accounts need proactive engagement? | Filter for `renewal_days` < 90; recommend renewal prep action |
| 6 | Which accounts are most likely to grow next month? | Filter for high `growth_potential_score` + positive usage trends |
| 7 | Which accounts should not be contacted yet and why? | Low-confidence cases; governance caveats explain insufficient evidence |
| 8 | Which accounts need a support-led action instead of sales outreach? | High support risk; action type should be `support_escalation` |
| 9 | Which accounts have weak evidence and should be reviewed manually? | Low confidence score (<0.5); governance flags for human review |
| 10 | What are the top 5 actions for this week? | Concise executive summary; 5 actions with 1-sentence rationales |

**Design rationale:** Queries test filtering logic, action type diversity, governance edge cases, and summarization capabilities.

---

## Validation Metrics

### 1. Response Structure Validity

**Check:** Every response must conform to the `RecommendationsResponse` Pydantic schema:

```python
class RecommendationsResponse(BaseModel):
    query: str
    recommendations: List[Recommendation]
    decision_ledger: DecisionLedger
    latency_ms: int
    model_provider: str
    generated_at: str  # ISO 8601 timestamp
```

**Pass criteria:**
- ✅ Schema validation passes (no Pydantic errors)
- ✅ `recommendations` is a non-empty list (unless query explicitly filters to zero results)
- ✅ `decision_ledger` contains `ledger_id`, `agents_invoked`, and `steps`

**Failure modes:**
- ❌ Missing required fields (e.g., no `confidence_score`)
- ❌ Type mismatches (e.g., `priority_score` is a string instead of float)
- ❌ Empty `recommendations` for queries that should return results

---

### 2. Evidence Presence

**Check:** Every recommendation must include at least one evidence item.

**Pass criteria:**
- ✅ `recommendation.evidence` is a non-empty list
- ✅ Each evidence item has:
  - `source_agent` (string)
  - `label` (string)
  - `detail` (string)
  - `source_system` (enum: CRM, Billing, Support, Telemetry, Marketing)
  - `polarity` (enum: positive, negative, neutral)
  - `strength` (float 0–1)

**Failure modes:**
- ❌ Empty `evidence` array (recommendation has no provenance)
- ❌ Evidence missing required fields (e.g., no `source_agent`)

**Rationale:** Evidence traceability is core to explainability. Judges will verify recommendations aren't "black box" outputs.

---

### 3. Confidence Score & Governance

**Check:** Governance Agent must compute a confidence score and surface caveats for low-confidence cases.

**Pass criteria:**
- ✅ `recommendation.confidence_score` exists and is in range [0.0, 1.0]
- ✅ If `confidence_score` < 0.6, `governance_caveats` is non-empty
- ✅ `governance_status` is one of: `approved`, `pending_review`, `insufficient_evidence`
- ✅ All recommendations have `approval_status = "pending"` by default

**Failure modes:**
- ❌ Missing `confidence_score`
- ❌ Low confidence (<0.5) but no caveats (governance check didn't run)
- ❌ Auto-approved action (should never happen; violates human-in-the-loop principle)

**Example caveat:**
```
"Limited engagement data; last contact was 45+ days ago"
"Only one support signal; insufficient to confirm escalation urgency"
```

---

### 4. Action Type Diversity

**Check:** Different queries should produce different action types based on account context.

**Expected action types:**
- `follow_up_call`: General check-in for moderate-priority accounts
- `reactivation_email`: For dormant accounts with low engagement
- `support_escalation`: For accounts with unresolved support issues
- `renewal_prep`: For accounts with upcoming renewals
- `expansion_offer`: For high-growth accounts with positive signals

**Pass criteria:**
- ✅ Query 3 (support risk) produces `support_escalation` actions
- ✅ Query 5 (renewal accounts) produces `renewal_prep` actions
- ✅ No single action type appears in >80% of recommendations (indicates lack of differentiation)

**Failure modes:**
- ❌ All actions are `follow_up_call` (no context-aware reasoning)

---

### 5. Communication Drafts

**Check:** Communication Agent must generate seller-ready email and call script.

**Pass criteria:**
- ✅ `draft_email` is non-empty and includes:
  - Personalized greeting (account name)
  - Specific reference to at least one evidence item (e.g., "I noticed your team clicked the Q2 webinar link")
  - Clear call-to-action
- ✅ `call_script` includes 3–5 talking points
- ✅ `voice_summary` is a 1-sentence brief (e.g., "High-growth account with strong campaign engagement; schedule optimization review")

**Failure modes:**
- ❌ Generic email template with no account-specific details
- ❌ Call script is just a bullet list with no context

**Sample email (good):**
```
Subject: Quick follow-up on Q2 product updates

Hi [Account Name] team,

I noticed you clicked our recent webinar link on advanced analytics—great to see 
your interest! Given your strong product usage (72/100) and recent growth, I'd 
love to schedule 15 minutes to discuss how our API tier could support your expansion.

Are you available Thursday or Friday this week?

Best,
[Seller Name]
```

---

### 6. Latency Budget

**Check:** System must respond within acceptable time limits.

**Pass criteria:**
- ✅ **Mock adapter:** <2 seconds per query (p95)
- ✅ **NVIDIA NIM adapter:** <5 seconds per query (p95, Phase 1 target)
- ✅ **NeMo Toolkit:** <3 seconds per query (p95, Phase 2 target with parallelism)

**Measurement:**
- `response.latency_ms` field in API response
- Aggregate p50, p95, p99 across all 10 queries

**Failure modes:**
- ❌ Latency >10 seconds (unacceptable for interactive demo)
- ❌ Timeout errors (agent orchestrator didn't complete)

---

## Evaluation Runner

**File:** `services/api/evals/evaluation_runner.py`

**Usage:**
```bash
cd services/api
python evals/evaluation_runner.py
```

**Process:**
1. Load 10 test queries from `test_queries.json`
2. For each query:
   - Send POST request to `http://localhost:8000/api/recommendations`
   - Validate response schema (Pydantic)
   - Check evidence presence
   - Verify confidence scores
   - Validate governance caveats (for low-confidence cases)
   - Check action type diversity
   - Inspect communication drafts
   - Record latency
3. Aggregate results:
   - Pass/fail count
   - Average latency (p50, p95)
   - Schema error count
   - Evidence completeness rate
4. Output summary report (stdout + JSON log)

**Sample Output:**
```
=== Signal-to-Action Agent Evaluation ===
Model Provider: mock

Query 1: Which SMB accounts need attention this week and why?
  ✅ Schema valid
  ✅ 5 recommendations returned
  ✅ Evidence present (avg 3.2 items/rec)
  ✅ Confidence scores: [0.72, 0.68, 0.65, 0.59, 0.55]
  ✅ Governance caveats for low-confidence recs: 2/5
  ✅ Latency: 124ms

Query 2: Which accounts have declining spend but high growth potential?
  ✅ Schema valid
  ✅ 3 recommendations returned
  ✅ All have spend_decline evidence + high growth_potential_score
  ✅ Action types: [expansion_offer, follow_up_call, reactivation_email]
  ✅ Latency: 98ms

...

Query 10: What are the top 5 actions for this week?
  ✅ Schema valid
  ✅ 5 recommendations (executive summary format)
  ✅ Voice summaries present
  ✅ Latency: 135ms

=== RESULTS ===
Queries Passed: 10/10
Avg Latency (p50): 118ms
Avg Latency (p95): 142ms
Schema Errors: 0
Evidence Completeness: 100%
Governance Caveats (low-conf cases): 12/15 (80%)

✅ ALL TESTS PASSED
```

---

## Mapping to Hackathon Judging Criteria

### Track A: Agentic Workflows

| Criterion | Evaluation Coverage |
|-----------|---------------------|
| **Explainability** | ✅ Evidence presence check; every recommendation traces to source signals |
| **Governance** | ✅ Confidence scores + caveats; approval status always `pending` |
| **Reliability** | ✅ Schema validation; 10/10 queries must pass |
| **Multi-agent coordination** | ✅ Decision ledger shows all six agents invoked; typed contracts validated |
| **Structured outputs** | ✅ Pydantic schema compliance; JSON validity rate tracked |
| **Latency** | ✅ Sub-2s response time on mock; benchmarked on NIM |

### Explainability Deep Dive (Judges' Focus)

**Demo scenario for judges:**

1. Show Query 1 response: "Which SMB accounts need attention this week?"
2. Expand Account #1 recommendation:
   - **Priority score:** 0.78 (breakdown: support_risk 0.25, spend_decline 0.30, growth_potential 0.80, ...)
   - **Evidence items:**
     - `AccountHealthAgent` → "Spend declined 15% MoM" (source: Billing, polarity: negative, strength: 0.85)
     - `OpportunityAgent` → "Clicked Q2 webinar link" (source: Marketing, polarity: positive, strength: 0.75)
     - `AccountHealthAgent` → "Support ticket #4523 unresolved" (source: Support, polarity: negative, strength: 0.60)
   - **Governance check:** Confidence 0.67; caveat: "Limited recent engagement data (last contact 42 days ago)"
   - **Recommended action:** "Schedule 15-min support + product check-in"
   - **Approval status:** `pending` (requires human click to approve)
3. Click "Approve" → Ledger updates with `approved_by`, `approved_at`, action enabled for execution

**Judge takeaway:** Every recommendation is **traceable, evidence-backed, and approval-gated**—not a black-box chatbot output.

---

## Continuous Evaluation (CI/CD)

**Post-hackathon goal:** Run eval suite on every commit.

**GitHub Actions workflow (future):**
```yaml
name: Eval Suite
on: [push, pull_request]
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: |
          cd services/api
          pip install -r requirements.txt
      - name: Generate synthetic data
        run: python services/api/data/generate_synthetic_data.py
      - name: Start API server
        run: uvicorn services.api.main:app &
      - name: Run evals
        run: python services/api/evals/evaluation_runner.py
      - name: Check pass rate
        run: |
          if grep -q "ALL TESTS PASSED" eval_log.txt; then
            echo "✅ Evaluation passed"
          else
            exit 1
          fi
```

**Failure alerts:** Slack notification if <10/10 queries pass or p95 latency exceeds budget.

---

## Future Enhancements

1. **Human eval:** Collect seller feedback on draft quality (5-point Likert scale)
2. **A/B testing:** Compare mock vs NVIDIA NIM output quality
3. **Regression tests:** Lock eval suite version; detect output drift on model upgrades
4. **Synthetic signal injection:** Generate adversarial cases (e.g., conflicting signals, missing data) to test robustness

---

**Next:** See [Demo Script](./DEMO_SCRIPT.md) for the 5-minute hackathon walkthrough and [NVIDIA Integration Plan](./nvidia-integration-plan.md) for production deployment.
