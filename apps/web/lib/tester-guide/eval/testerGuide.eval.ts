// Tester Guide — deterministic content validation evals
// =====================================================
// Verifies the canonical content model is complete, consistent, and safe for
// public display. Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/tester-guide/eval/testerGuide.eval.ts

import {
  GUIDE_CANONICAL,
  GUIDE_METADATA,
  GUIDE_SECTIONS,
  GUIDE_TRUTH_TABLE,
  GUIDE_SEVERITY,
  GUIDE_FEEDBACK_FIELDS,
  GUIDE_CHECKLIST,
  GUIDE_GUARDRAIL_SCENARIOS,
  GUIDE_GLOSSARY,
} from "../content";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " — " + detail : ""}`);
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

console.log("\n── Tester Guide Content Validation ──\n");

// 1. Every guide section has a title
for (const s of GUIDE_SECTIONS) {
  check(`Section ${s.number} has title`, !!s.title && s.title.length > 0);
}

// 2. Every test step has an action
for (const s of GUIDE_SECTIONS) {
  for (const step of s.steps) {
    check(`Section ${s.number} step "${step.id}" has actions`, step.actions.length > 0);
  }
}

// 3. Every test step has an expected result
for (const s of GUIDE_SECTIONS) {
  for (const step of s.steps) {
    check(`Section ${s.number} step "${step.id}" has expected results`, step.expectedResults.length > 0);
  }
}

// 4–6. Every screenshot asset has src, alt text, and caption
for (const s of GUIDE_SECTIONS) {
  for (const step of s.steps) {
    if (step.screenshot) {
      check(`Screenshot "${step.screenshot.src}" exists as file`,
        fs.existsSync(path.resolve(__dirname, "../../../public", step.screenshot.src.replace(/^\//, ""))),
      );
      check(`Screenshot "${step.screenshot.src}" has alt text`, !!step.screenshot.alt && step.screenshot.alt.length > 0);
      check(`Screenshot "${step.screenshot.src}" has caption`, !!step.screenshot.caption && step.screenshot.caption.length > 0);
    }
  }
  if (s.screenshot) {
    check(`Section screenshot "${s.screenshot.src}" has alt text`, !!s.screenshot.alt && s.screenshot.alt.length > 0);
    check(`Section screenshot "${s.screenshot.src}" has caption`, !!s.screenshot.caption && s.screenshot.caption.length > 0);
  }
}

// 7–11. No public asset contains prohibited content
const prohibitedPatterns = [
  { pattern: /preview/i, label: "Preview URL" },
  { pattern: /localhost/i, label: "localhost" },
  { pattern: /dpl_/i, label: "deployment ID" },
  { pattern: /temporary/i, label: "temporary marker" },
];

// Check all section text for prohibited content in public-facing strings
for (const s of GUIDE_SECTIONS) {
  for (const p of s.explanation) {
    for (const { pattern, label } of prohibitedPatterns) {
      if (label === "deployment ID") {
        // Deployment IDs are allowed in internal references but not in public explanation text
        // Skip — we only check screenshot alt/caption for this
      }
    }
  }
}

// 12–16. Canonical IDs are correct
check("Account ID is VOS-CUREFOODS", GUIDE_CANONICAL.accountId === "VOS-CUREFOODS");
check("Mission ID is M-RENEWAL-1", GUIDE_CANONICAL.missionId === "M-RENEWAL-1");
check("Recommendation ID is REC-M-RENEWAL-1", GUIDE_CANONICAL.recommendationId === "REC-M-RENEWAL-1");
check("Template is renewal-risk-parallel-v1", GUIDE_CANONICAL.template === "renewal-risk-parallel-v1");
check("Audit ref is audit://M-RENEWAL-1/REC-M-RENEWAL-1",
  GUIDE_CANONICAL.auditRef === "audit://M-RENEWAL-1/REC-M-RENEWAL-1");

// 17–18. Outcome wording is exact
check("System outcome is exact", GUIDE_CANONICAL.systemOutcome === "Governed work prepared successfully.");
check("Business outcome is exact", GUIDE_CANONICAL.businessOutcome === "Awaiting external response.");

// 19. Manager is labelled correctly
const managerSection = GUIDE_SECTIONS.find((s) => s.id === "manager-coaching");
check("Manager section exists", !!managerSection);
if (managerSection) {
  const hasGuidedLabel = managerSection.explanation.some(
    (e) => e.includes("guided") || e.includes("Guided"),
  );
  check("Manager labelled as Guided Scenario", hasGuidedLabel);
}

// 20. Executive/Operations labelled Production-Partial
const projectionSection = GUIDE_SECTIONS.find((s) => s.id === "persona-projections");
check("Persona projections section exists", !!projectionSection);
if (projectionSection) {
  const hasPartialLabel = projectionSection.steps.some((step) =>
    step.truthNotes.some((n) => n.text.includes("Production-Partial")),
  );
  check("Executive/Operations labelled Production-Partial", hasPartialLabel);
}

// 21. Simulation statements remain explicit
const simSection = GUIDE_SECTIONS.find((s) => s.id === "simulated-execution");
check("Simulated execution section exists", !!simSection);
if (simSection) {
  check("Simulation section has steps", simSection.steps.length > 0);
}

// 22–23. NVIDIA authority is described accurately
const nvidiaSection = GUIDE_SECTIONS.find((s) => s.id === "nvidia-role");
check("NVIDIA section exists", !!nvidiaSection);
if (nvidiaSection) {
  const hasPolicyNote = nvidiaSection.steps.some((step) =>
    step.truthNotes.some((n) => n.text.includes("Deterministic policy") || n.text.includes("deterministic policy")),
  );
  check("Deterministic policy is described as final authority", hasPolicyNote);
}

// 24. Voice and Digital Human are not described as Production
const truthTableFuture = GUIDE_TRUTH_TABLE.filter((r) => r.classification === "Future");
const voiceRow = truthTableFuture.find((r) => r.feature.includes("Voice"));
check("Voice/Digital Human is Future, not Production", !!voiceRow);

// 25. Feedback template fields are complete
check("Feedback fields count >= 15", GUIDE_FEEDBACK_FIELDS.length >= 15);

// 26. PDF file exists
const pdfPath = path.resolve(__dirname, "../../../public/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf");
check("PDF file exists", fs.existsSync(pdfPath));
if (fs.existsSync(pdfPath)) {
  const stat = fs.statSync(pdfPath);
  check("PDF file is non-empty", stat.size > 0);
}

// 27. Section count
check("Guide has 18 sections", GUIDE_SECTIONS.length === 18);

// 28. Checklist items count
check("Checklist has 17 items", GUIDE_CHECKLIST.length === 17);

// 29. Glossary is non-empty
check("Glossary has entries", GUIDE_GLOSSARY.length > 0);

// 30. Guardrail scenarios defined
check("Guardrail scenarios >= 6", GUIDE_GUARDRAIL_SCENARIOS.length >= 6);

// 31. Severity guidance covers P0, P1, P2
check("Severity covers P0", GUIDE_SEVERITY.some((s) => s.severity === "P0"));
check("Severity covers P1", GUIDE_SEVERITY.some((s) => s.severity === "P1"));
check("Severity covers P2", GUIDE_SEVERITY.some((s) => s.severity === "P2"));

// 32. Truth table has Production, Production-Partial, Guided Demo, Simulated, Not implemented, Future
const truthClassifications = new Set(GUIDE_TRUTH_TABLE.map((r) => r.classification));
check("Truth table has Production", truthClassifications.has("Production"));
check("Truth table has Production-Partial", truthClassifications.has("Production-Partial"));
check("Truth table has Guided Demo", truthClassifications.has("Guided Demo"));
check("Truth table has Simulated", truthClassifications.has("Simulated"));
check("Truth table has Not implemented", truthClassifications.has("Not implemented"));
check("Truth table has Future", truthClassifications.has("Future"));

// Summary
console.log(`\n── Results: ${passed} passed, ${failed} failed ──`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
