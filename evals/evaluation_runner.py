"""Evaluation harness for the Signal-to-Action Agent.

Loads test queries from test_queries.json, invokes the Orchestrator directly
(no server dependency), and validates the response structure, evidence, governance,
and confidence scores. Returns exit code 0 if all tests pass, 1 otherwise.

Run from project root:
    python evals/evaluation_runner.py
or with explicit venv python:
    <venv>/Scripts/python.exe evals/evaluation_runner.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, List

# Add services/api to sys.path so we can import the orchestrator
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
API_DIR = os.path.join(PROJECT_ROOT, "services", "api")
sys.path.insert(0, os.path.abspath(API_DIR))

# Now we can import from the backend
from agents.orchestrator import Orchestrator
from schemas.ledger import DecisionLedger
from schemas.recommendation import ApprovalStatus, Recommendation


@dataclass
class TestQuery:
    """A single test case loaded from test_queries.json."""
    id: str
    query: str
    limit: int
    expect_min_recommendations: int


@dataclass
class CheckResult:
    """Result of a single validation check."""
    check_name: str
    passed: bool
    message: str = ""


@dataclass
class QueryResult:
    """Result of running a single test query."""
    query_id: str
    query_text: str
    passed: bool
    latency_ms: int
    checks: List[CheckResult]
    error: str = ""


def load_test_queries(path: str) -> List[TestQuery]:
    """Load test queries from JSON file."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return [TestQuery(**item) for item in data]


def run_single_query(orchestrator: Orchestrator, test: TestQuery) -> QueryResult:
    """Execute a single test query and validate the result."""
    checks: List[CheckResult] = []
    
    try:
        # Time the orchestrator call
        t0 = time.perf_counter()
        recommendations, ledger = orchestrator.run(test.query, test.limit)
        latency_ms = int((time.perf_counter() - t0) * 1000)
        
        # Convert pydantic models to dicts for easier inspection
        recs_data = [r.model_dump() for r in recommendations]
        ledger_data = ledger.model_dump()
        
        # Check 1: Response structure validity
        if len(recommendations) >= test.expect_min_recommendations:
            checks.append(CheckResult(
                "structure",
                True,
                f"Got {len(recommendations)} recommendations (expected >= {test.expect_min_recommendations})"
            ))
        else:
            checks.append(CheckResult(
                "structure",
                False,
                f"Got {len(recommendations)} recommendations (expected >= {test.expect_min_recommendations})"
            ))
        
        # Check that ledger is present
        if ledger is not None and isinstance(ledger, DecisionLedger):
            checks.append(CheckResult("ledger_present", True, "Decision ledger present"))
        else:
            checks.append(CheckResult("ledger_present", False, "Decision ledger missing"))
        
        # Check 2: Each recommendation has evidence
        # Note: Some queries (e.g., "weak evidence" or "should not be contacted") may
        # legitimately surface accounts with no/minimal evidence. Be lenient for those.
        evidence_required = "weak evidence" not in test.query.lower() and "not be contacted" not in test.query.lower()
        
        evidence_pass = True
        missing_evidence_count = 0
        for i, rec_data in enumerate(recs_data):
            if not rec_data.get("evidence") or len(rec_data["evidence"]) == 0:
                missing_evidence_count += 1
                if evidence_required:
                    evidence_pass = False
                    checks.append(CheckResult(
                        f"evidence_rec_{i+1}",
                        False,
                        f"Recommendation {i+1} has no evidence"
                    ))
                    break
        
        if evidence_pass and len(recs_data) > 0:
            if missing_evidence_count > 0 and not evidence_required:
                checks.append(CheckResult(
                    "evidence",
                    True,
                    f"{len(recs_data) - missing_evidence_count}/{len(recs_data)} recommendations have evidence (lenient mode for this query)"
                ))
            else:
                checks.append(CheckResult(
                    "evidence",
                    True,
                    f"All {len(recs_data)} recommendations have evidence"
                ))
        elif len(recs_data) == 0:
            checks.append(CheckResult("evidence", False, "No recommendations to check evidence"))
        
        # Check 3: Each recommendation has valid confidence_score
        confidence_pass = True
        for i, rec_data in enumerate(recs_data):
            conf = rec_data.get("confidence_score")
            if conf is None or not isinstance(conf, (float, int)) or not (0.0 <= conf <= 1.0):
                confidence_pass = False
                checks.append(CheckResult(
                    f"confidence_rec_{i+1}",
                    False,
                    f"Recommendation {i+1} has invalid confidence_score: {conf}"
                ))
                break
        if confidence_pass and len(recs_data) > 0:
            checks.append(CheckResult(
                "confidence_score",
                True,
                f"All {len(recs_data)} recommendations have valid confidence_score [0,1]"
            ))
        elif len(recs_data) == 0:
            checks.append(CheckResult("confidence_score", False, "No recommendations to check confidence"))
        
        # Check 4: Governance caveats and status exist
        governance_pass = True
        for i, rec_data in enumerate(recs_data):
            # Check that governance_caveats field exists (list, may be empty)
            if "governance_caveats" not in rec_data or not isinstance(rec_data["governance_caveats"], list):
                governance_pass = False
                checks.append(CheckResult(
                    f"governance_rec_{i+1}",
                    False,
                    f"Recommendation {i+1} missing governance_caveats field"
                ))
                break
            # Check that governance_status field exists
            if "governance_status" not in rec_data:
                governance_pass = False
                checks.append(CheckResult(
                    f"governance_status_rec_{i+1}",
                    False,
                    f"Recommendation {i+1} missing governance_status field"
                ))
                break
        
        # Also check ledger has caveats
        ledger_caveats = ledger_data.get("caveats", [])
        if not isinstance(ledger_caveats, list):
            governance_pass = False
            checks.append(CheckResult("ledger_caveats", False, "Ledger caveats is not a list"))
        
        if governance_pass and len(recs_data) > 0:
            checks.append(CheckResult(
                "governance",
                True,
                f"All recommendations have governance_caveats and governance_status; ledger has caveats"
            ))
        elif len(recs_data) == 0:
            checks.append(CheckResult("governance", False, "No recommendations to check governance"))
        
        # Check 5: Approval status is default pending
        # The default is ApprovalStatus.pending (enum value "pending")
        approval_pass = True
        for i, rec in enumerate(recommendations):
            if rec.approval_status != ApprovalStatus.pending:
                approval_pass = False
                checks.append(CheckResult(
                    f"approval_rec_{i+1}",
                    False,
                    f"Recommendation {i+1} has approval_status={rec.approval_status.value} (expected 'pending')"
                ))
                break
        if approval_pass and len(recommendations) > 0:
            checks.append(CheckResult(
                "approval_status",
                True,
                f"All {len(recommendations)} recommendations have default approval_status='pending'"
            ))
        elif len(recommendations) == 0:
            checks.append(CheckResult("approval_status", False, "No recommendations to check approval_status"))
        
        # Check 6: Latency is positive
        if latency_ms > 0:
            checks.append(CheckResult("latency", True, f"Latency {latency_ms}ms"))
        else:
            checks.append(CheckResult("latency", False, f"Invalid latency {latency_ms}ms"))
        
        # Overall pass/fail
        all_passed = all(c.passed for c in checks)
        
        return QueryResult(
            query_id=test.id,
            query_text=test.query,
            passed=all_passed,
            latency_ms=latency_ms,
            checks=checks,
        )
        
    except Exception as exc:
        # If the query fails entirely, record the error
        return QueryResult(
            query_id=test.id,
            query_text=test.query,
            passed=False,
            latency_ms=0,
            checks=[CheckResult("execution", False, "Query execution failed")],
            error=str(exc),
        )


def print_results(results: List[QueryResult]) -> None:
    """Print a formatted report of all test results."""
    print("\n" + "=" * 80)
    print("SIGNAL-TO-ACTION AGENT EVALUATION RESULTS")
    print("=" * 80 + "\n")
    
    for result in results:
        status = "✓ PASS" if result.passed else "✗ FAIL"
        print(f"[{result.query_id}] {status} | {result.latency_ms}ms")
        print(f"  Query: {result.query_text}")
        
        if result.error:
            print(f"  ERROR: {result.error}")
        else:
            for check in result.checks:
                check_status = "  ✓" if check.passed else "  ✗"
                msg = f" - {check.message}" if check.message else ""
                print(f"{check_status} {check.check_name}{msg}")
        print()
    
    # Summary
    print("=" * 80)
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed
    
    print(f"SUMMARY: {passed}/{total} queries passed")
    if failed > 0:
        print(f"         {failed} queries FAILED")
        failed_ids = [r.query_id for r in results if not r.passed]
        print(f"         Failed: {', '.join(failed_ids)}")
    
    total_latency = sum(r.latency_ms for r in results)
    avg_latency = total_latency / total if total > 0 else 0
    print(f"         Average latency: {avg_latency:.1f}ms")
    print("=" * 80 + "\n")


def main() -> int:
    """Run the evaluation harness. Returns 0 if all pass, 1 otherwise."""
    # Load test queries
    test_queries_path = os.path.join(SCRIPT_DIR, "test_queries.json")
    try:
        tests = load_test_queries(test_queries_path)
        print(f"Loaded {len(tests)} test queries from {test_queries_path}")
    except Exception as exc:
        print(f"ERROR: Failed to load test queries: {exc}", file=sys.stderr)
        return 1
    
    # Initialize the orchestrator
    try:
        orchestrator = Orchestrator()
        print(f"Initialized Orchestrator with model provider: {orchestrator.adapter.provider}")
        print()
    except Exception as exc:
        print(f"ERROR: Failed to initialize Orchestrator: {exc}", file=sys.stderr)
        return 1
    
    # Run all tests
    results: List[QueryResult] = []
    for test in tests:
        print(f"Running {test.id}: {test.query[:60]}...", end=" ")
        result = run_single_query(orchestrator, test)
        results.append(result)
        status = "PASS" if result.passed else "FAIL"
        print(f"[{status}]")
    
    # Print detailed results
    print_results(results)
    
    # Return exit code
    all_passed = all(r.passed for r in results)
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
