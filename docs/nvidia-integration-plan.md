# NVIDIA Integration Plan: Signal-to-Action Agent

## Overview

Signal-to-Action Agent is architected from day one for **NVIDIA-accelerated, sovereign AI deployments**. The MVP uses a mock model adapter for demo stability, but the backend is designed to swap in NVIDIA NIM endpoints (Nemotron models) and eventually integrate with the **NeMo Agent Toolkit / NemoClaw** for production-grade multi-agent orchestration.

This document outlines the **phased integration path**, technical touchpoints, and performance targets.

---

## Why NVIDIA?

1. **Sovereign AI:** Enterprise customers (especially in regulated industries) require on-premises or private cloud deployments. NVIDIA NIM enables self-hosted inference with no data exfiltration to third-party API providers.
2. **GPU-Optimized Inference:** NVIDIA Tensor Core GPUs accelerate structured output generation (JSON schema adherence) and batch reasoning—critical for low-latency, high-throughput workflows.
3. **NeMo Agent Toolkit:** Purpose-built orchestration framework with typed tool calls, agent graphs, and observability—natural successor to the current Python orchestrator.
4. **Nemotron Models:** Pre-trained for reasoning, summarization, and instruction-following; ideal for health analysis, opportunity identification, and communication drafting.

---

## Integration Touchpoints

### 1. Model Adapter Interface

**File:** `services/api/model_adapters/base.py`

The `ModelAdapter` abstract base class defines a single contract:

```python
class GenerationRequest(BaseModel):
    prompt: str
    max_tokens: int = 512
    temperature: float = 0.7
    response_schema: Optional[dict] = None  # JSON schema for structured output

class ModelResponse(BaseModel):
    text: str
    latency_ms: int
    model_name: str
    finish_reason: str

class ModelAdapter(ABC):
    @abstractmethod
    def generate(self, request: GenerationRequest) -> ModelResponse:
        """Generate text from prompt. Optionally constrain to JSON schema."""
        pass
    
    @abstractmethod
    def health(self) -> bool:
        """Check adapter/endpoint health."""
        pass
```

**Key principle:** Agents call `adapter.generate()` without knowing which backend (mock, NVIDIA NIM, OpenAI) is active. The factory pattern (`get_model_adapter()`) selects the adapter at runtime based on the `MODEL_PROVIDER` environment variable.

---

### 2. Mock Adapter (Phase 0 – MVP)

**File:** `services/api/model_adapters/mock_adapter.py`  
**Status:** ✅ Active in hackathon demo

**Behavior:**
- Returns deterministic, hand-crafted responses for account health, opportunity, action, and communication drafting prompts
- No external API dependency; zero latency risk
- Ensures demo reliability (no API rate limits, downtime, or quota issues)

**Example:**
```python
def generate(self, request: GenerationRequest) -> ModelResponse:
    if "declining spend" in request.prompt:
        return ModelResponse(
            text="The account shows a 15% MoM spend decline...",
            latency_ms=50,
            model_name="mock-v1",
            finish_reason="stop"
        )
    # ... other prompt patterns
```

---

### 3. NVIDIA NIM Adapter (Phase 1 – Post-Hackathon)

**File:** `services/api/model_adapters/nvidia_nim_adapter.py`  
**Status:** 🚧 Stub implementation (ready for API key)

**Integration Steps:**

1. **Obtain NVIDIA API Key:** Register for NVIDIA AI Enterprise or NGC account; generate API key
2. **Set environment variables:**
   ```bash
   MODEL_PROVIDER=nvidia-nim
   NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   NVIDIA_NIM_ENDPOINT=https://integrate.api.nvidia.com/v1/chat/completions
   NVIDIA_MODEL_NAME=nemotron-4-340b-instruct  # or nemotron-3-8b-chat
   ```
3. **Implement `nvidia_nim_adapter.py`:**
   ```python
   import os
   import requests
   from .base import ModelAdapter, GenerationRequest, ModelResponse

   class NvidiaNimAdapter(ModelAdapter):
       def __init__(self, api_key: str = None):
           self.api_key = api_key or os.getenv("NVIDIA_API_KEY")
           self.endpoint = os.getenv("NVIDIA_NIM_ENDPOINT")
           self.model_name = os.getenv("NVIDIA_MODEL_NAME", "nemotron-4-340b-instruct")
       
       def generate(self, request: GenerationRequest) -> ModelResponse:
           headers = {
               "Authorization": f"Bearer {self.api_key}",
               "Content-Type": "application/json"
           }
           payload = {
               "model": self.model_name,
               "messages": [{"role": "user", "content": request.prompt}],
               "max_tokens": request.max_tokens,
               "temperature": request.temperature
           }
           if request.response_schema:
               payload["response_format"] = {"type": "json_schema", "schema": request.response_schema}
           
           response = requests.post(self.endpoint, json=payload, headers=headers)
           response.raise_for_status()
           data = response.json()
           
           return ModelResponse(
               text=data["choices"][0]["message"]["content"],
               latency_ms=int(data.get("usage", {}).get("total_time_ms", 0)),
               model_name=self.model_name,
               finish_reason=data["choices"][0]["finish_reason"]
           )
       
       def health(self) -> bool:
           # Ping health endpoint or verify API key
           return True
   ```

4. **Test structured output compliance:**
   - Use `response_schema` to enforce JSON output for `ActionProposal`, `CommunicationDraft`, etc.
   - Measure schema validity rate (target: >95%)

**Benefits:**
- **Low latency:** NVIDIA GPU-accelerated inference (target: <500ms per generation)
- **Structured outputs:** Native JSON schema support reduces parsing errors
- **No vendor lock-in:** Self-hosted NIM endpoints eliminate third-party API dependency

---

### 4. NeMo Agent Toolkit / NemoClaw (Phase 2 – Production)

**Current orchestrator:** `services/api/agents/orchestrator.py` (Python script)  
**Limitation:** Simple sequential execution; no parallel agents, no graph-based coordination, no built-in observability

**NeMo Agent Toolkit** provides:
- **Agent graphs:** Define workflows as DAGs (directed acyclic graphs); e.g., run `AccountHealthAgent` and `OpportunityAgent` in parallel
- **Typed tool calls:** Pydantic-enforced input/output schemas between agents (already present in our system)
- **Observability:** Built-in tracing, latency profiling, and error handling
- **NemoClaw framework:** Agent orchestration with retries, fallbacks, and human-in-the-loop approvals

**Migration Path:**

1. **Map current agents to NeMo tools:**
   ```python
   # Current: orchestrator.py calls agents sequentially
   health = account_health_agent.assess(account_context)
   opportunity = opportunity_agent.assess(account_context)
   
   # NeMo: define agents as graph nodes
   from nemo.toolkit import Agent, Graph
   
   health_agent = Agent(
       name="AccountHealthAgent",
       input_schema=AccountContext,
       output_schema=HealthAssessment,
       model_adapter=nvidia_nim_adapter
   )
   
   graph = Graph()
   graph.add_parallel([health_agent, opportunity_agent])  # Run concurrently
   graph.add_sequential([governance_agent, action_agent, communication_agent])
   ```

2. **Enable parallelism:** Run `AccountHealthAgent` and `OpportunityAgent` concurrently (2x speedup)

3. **Add retries:** NeMo's built-in retry logic handles transient API failures

4. **Human-in-the-loop gates:** Integrate approval workflow into graph (`GovernanceAgent` blocks execution until user approves)

**Performance Impact:**
- **Latency:** 30–40% reduction via parallel agent execution
- **Reliability:** Retry logic eliminates single-point failures
- **Observability:** Tracing shows per-agent latency and token usage

---

## Phased Rollout

### Phase 0: Mock Adapter (Hackathon MVP)
**Status:** ✅ Complete  
**Timeline:** Current  
**Goal:** Stable demo; no external dependencies  
**Metrics:**
- ✅ All 10 eval queries pass
- ✅ Sub-2-second response latency
- ✅ 100% uptime during demo

---

### Phase 1: NVIDIA NIM Endpoint Integration
**Status:** 🚧 Ready to implement  
**Timeline:** Week 1–2 post-hackathon  
**Tasks:**
1. Obtain NVIDIA API key (NGC or AI Enterprise)
2. Implement `nvidia_nim_adapter.py` with Nemotron model
3. Test structured output compliance (JSON schema validity)
4. Benchmark latency (target: <1 second per agent call)
5. Update `.env.example` with NVIDIA_API_KEY placeholder

**Success Criteria:**
- ✅ All 10 eval queries pass with NIM backend
- ✅ >95% JSON schema validity rate
- ✅ p50 latency <1s, p95 <2s (per recommendation)
- ✅ Zero data exfiltration (on-prem NIM deployment)

**Risks & Mitigations:**
- **Risk:** Structured output inconsistency  
  **Mitigation:** Use `response_format` JSON schema enforcement; add validation layer
- **Risk:** NIM endpoint quota limits  
  **Mitigation:** Implement request queuing; batch low-priority accounts

---

### Phase 2: NeMo Agent Toolkit Orchestration
**Status:** 📋 Planned  
**Timeline:** Month 2 post-hackathon  
**Tasks:**
1. Install NeMo Agent Toolkit SDK
2. Refactor `orchestrator.py` to NeMo `Graph` API
3. Enable parallel execution for `AccountHealthAgent` + `OpportunityAgent`
4. Add observability (OpenTelemetry tracing)
5. Implement retry logic for transient failures

**Success Criteria:**
- ✅ 30% latency reduction via parallelism
- ✅ Agent execution trace visible in dashboard
- ✅ Human-in-the-loop approval integrated into graph

---

### Phase 3: GPU-Optimized Batch Inference
**Status:** 🔮 Future  
**Timeline:** Month 3+ (production scale)  
**Tasks:**
1. Deploy NVIDIA Triton Inference Server for NIM endpoints
2. Implement batch inference for weekly account planning (process 500+ accounts overnight)
3. GPU-accelerated similarity search for signal clustering (e.g., FAISS + NVIDIA RAPIDS)
4. Optimize prompt engineering for structured output (reduce token usage)

**Success Criteria:**
- ✅ Process 500 accounts in <10 minutes (batch mode)
- ✅ 50% token reduction via prompt optimization
- ✅ Sub-500ms p50 latency per agent call

---

## Performance Measurement

### Metrics Tracked

| Metric | Phase 0 (Mock) | Phase 1 (NIM) | Phase 2 (NeMo) | Phase 3 (GPU) |
|--------|----------------|---------------|----------------|---------------|
| **Latency (p50)** | <100ms | <1s | <700ms | <500ms |
| **Latency (p95)** | <200ms | <2s | <1.5s | <1s |
| **Throughput** | 1 req/s | 5 req/s | 10 req/s | 50 req/s (batch) |
| **JSON Schema Validity** | 100% (hardcoded) | >95% | >98% | >99% |
| **Eval Pass Rate** | 10/10 | 10/10 | 10/10 | 10/10 |
| **Cost per Rec** | $0 | ~$0.05 | ~$0.03 | ~$0.01 |

### Evaluation Harness

**File:** `services/api/evals/evaluation_runner.py`

Runs 10 test queries against the backend and validates:
- Response structure (Pydantic schema compliance)
- Evidence presence (every recommendation has ≥1 evidence item)
- Confidence score exists (0–1 range)
- Governance caveats exist (non-empty for low-confidence cases)
- Approval status is `pending` by default
- Latency within budget

**Command:**
```bash
MODEL_PROVIDER=nvidia-nim python evals/evaluation_runner.py
```

**Output:**
```
✅ Query 1: Which SMB accounts need attention this week? (1.2s, 5 recommendations, 100% valid)
✅ Query 2: Which accounts have declining spend but high growth potential? (1.1s, 3 recs, 100% valid)
...
PASS: 10/10 queries (avg latency 1.15s, 0 schema errors)
```

---

## Long-Term Vision: Sovereign AI Stack

**Goal:** Fully on-premises, GPU-accelerated, compliance-ready deployment

**Components:**
1. **NVIDIA NIM:** Self-hosted Nemotron inference endpoints (no cloud API dependency)
2. **NeMo Agent Toolkit:** Orchestration with typed tool calls and observability
3. **Triton Inference Server:** High-throughput batch processing for weekly planning
4. **RAPIDS cuDF:** GPU-accelerated signal preprocessing and feature engineering
5. **SQLite → PostgreSQL:** Production-grade ledger with row-level security
6. **RBAC + Audit Logs:** Role-based approval workflows; immutable decision ledger

**Deployment:**
- **Hardware:** NVIDIA A100/H100 GPU cluster (on-prem or VPC)
- **Software:** NVIDIA AI Enterprise, NeMo, Triton, TAO Toolkit
- **Latency:** Sub-500ms p50 for real-time queries; <10 min for 500-account batch planning
- **Compliance:** GDPR, SOC 2, HIPAA-ready (no data leaves customer infrastructure)

---

**Next:** See [Evaluation Plan](./evaluation-plan.md) for test harness details and [Demo Script](./DEMO_SCRIPT.md) for hackathon presentation flow.
