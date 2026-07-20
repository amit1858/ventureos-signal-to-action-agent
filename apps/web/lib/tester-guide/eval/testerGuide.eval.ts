// Tester Guide — deterministic content & provenance evals
// ========================================================
// Proves the canonical tester-guide content model is structurally complete,
// truthful, correctly provenanced, and free of leaked internal references — so
// the `/tester-guide` route, the generated PDF, and the internal source stay
// consistent and public-safe.
//
// Run:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/tester-guide/eval/testerGuide.eval.ts

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GUIDE_META,
  GUIDE_CANONICAL,
  GUIDE_SECTIONS,
  GUIDE_SCREENSHOTS,
  TRUTH_TABLE,
  SEVERITY_GUIDANCE,
  FEEDBACK_FIELDS,
  FINAL_CHECKLIST,
  GLOSSARY,
} from "../content";
import { buildFeedbackTemplateMarkdown } from "../generate";

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

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "../../.."); // apps/web
const PUBLIC_DIR = resolve(WEB_ROOT, "public");
const REPO_ROOT = resolve(WEB_ROOT, "../.."); // repo root

// Terms that must never appear in public guide copy / captions / alt text.
const FORBIDDEN_PUBLIC = [
  "localhost",
  "127.0.0.1",
  "vercel.app/", // preview-style hostnames w/ path (canonical is allowed as bare host in meta only)
  "feature/",
  "Feature Branch",
  "dpl_",
  "nvapi-",
  "Bearer ",
  "C:\\\\",
  "/Users/",
  ".onrender.com",
];

// A single blob of all public-facing strings from the content model.
function publicCopyBlob(): string {
  const parts: string[] = [];
  for (const s of GUIDE_SECTIONS) {
    parts.push(s.title, s.purpose, ...(s.route ? [] : []), ...s.explain, ...s.expectedResults, ...s.failureIndicators);
    if (s.truthNote) parts.push(s.truthNote);
    for (const st of s.steps) parts.push(st.action, st.expected);
  }
  for (const sc of GUIDE_SCREENSHOTS) parts.push(sc.alt, sc.caption);
  for (const t of TRUTH_TABLE) parts.push(t.tier, ...t.items);
  for (const g of GLOSSARY) parts.push(g.term, g.definition);
  return parts.join("\n");
}

console.log("\n[1] Structure — sections, steps, expected results");
check("1. every guide section has a non-empty title", GUIDE_SECTIONS.every((s) => s.title.trim().length > 0));
check("2. every test step has a non-empty action", GUIDE_SECTIONS.every((s) => s.steps.every((st) => st.action.trim().length > 0)));
check("3. every test step has a non-empty expected result", GUIDE_SECTIONS.every((s) => s.steps.every((st) => st.expected.trim().length > 0)));
check("   sections are numbered 1..18 contiguously", JSON.stringify(GUIDE_SECTIONS.map((s) => s.number)) === JSON.stringify(Array.from({ length: 18 }, (_, i) => i + 1)));
check("   every section has at least one step", GUIDE_SECTIONS.every((s) => s.steps.length >= 1));
check("   every section has at least one expected result", GUIDE_SECTIONS.every((s) => s.expectedResults.length >= 1));

console.log("\n[2] Screenshots — existence, alt, caption, provenance");
check("4. every screenshot asset exists on disk", GUIDE_SCREENSHOTS.every((s) => existsSync(resolve(PUBLIC_DIR, "." + s.src))),
  GUIDE_SCREENSHOTS.filter((s) => !existsSync(resolve(PUBLIC_DIR, "." + s.src))).map((s) => s.src).join(", "));
check("5. every screenshot has non-empty alt text", GUIDE_SCREENSHOTS.every((s) => s.alt.trim().length > 0));
check("6. every screenshot has a non-empty caption", GUIDE_SCREENSHOTS.every((s) => s.caption.trim().length > 0));
check("7. every public screenshot has approved production provenance", GUIDE_SCREENSHOTS.every((s) => s.provenance === "production-canonical" && s.sha === GUIDE_META.sourceSha && s.deploymentId === GUIDE_META.sourceDeploymentId));
check("   every screenshot src is a public app-relative /guides asset", GUIDE_SCREENSHOTS.every((s) => s.src.startsWith("/guides/")));
check("   every section screenshotId resolves to a known screenshot", GUIDE_SECTIONS.every((s) => s.screenshotIds.every((id) => GUIDE_SCREENSHOTS.some((sc) => sc.id === id))));
check("   every screenshot has intrinsic width/height for layout stability", GUIDE_SCREENSHOTS.every((s) => s.width > 0 && s.height > 0));

console.log("\n[3] Public safety — no leaked internal references");
const blob = publicCopyBlob();
for (const term of FORBIDDEN_PUBLIC) {
  check(`   public copy contains no forbidden token: ${term}`, !blob.includes(term), "leak detected");
}
check("8. no public asset src contains a Preview URL", GUIDE_SCREENSHOTS.every((s) => !/https?:\/\//.test(s.src)));
check("9. no public copy contains localhost", !blob.toLowerCase().includes("localhost"));
check("10. no public copy exposes a deployment ID or raw SHA token", !blob.includes("dpl_") && !blob.includes(GUIDE_META.sourceDeploymentId));
check("11. no screenshot is marked temporary", GUIDE_SCREENSHOTS.every((s) => !/temporary/i.test(s.caption) && !/temporary/i.test(s.alt)));

console.log("\n[4] Canonical identity");
check("12. canonical account ID is correct", GUIDE_CANONICAL.accountId === "VOS-CUREFOODS");
check("13. mission ID is correct", GUIDE_CANONICAL.missionId === "M-RENEWAL-1");
check("14. recommendation ID is correct", GUIDE_CANONICAL.recommendationId === "REC-M-RENEWAL-1");
check("15. template ID is correct", GUIDE_CANONICAL.template === "renewal-risk-parallel-v1");
check("16. audit reference is correct", GUIDE_CANONICAL.auditRef === "audit://M-RENEWAL-1/REC-M-RENEWAL-1");
check("17. system outcome is exact", GUIDE_CANONICAL.systemOutcome === "Governed work prepared successfully.");
check("18. business outcome is exact", GUIDE_CANONICAL.businessOutcome === "Awaiting external response.");
check("   receipts are canonical", GUIDE_CANONICAL.receipts.email === "receipt://M-RENEWAL-1/email" && GUIDE_CANONICAL.receipts.crmTask === "receipt://M-RENEWAL-1/crm_task" && GUIDE_CANONICAL.receipts.riskUpdate === "receipt://M-RENEWAL-1/risk_update");

console.log("\n[5] Truthful labels");
const managerSection = GUIDE_SECTIONS.find((s) => s.id === "manager-coaching")!;
check("19. Manager is labelled Guided Scenario / Post-mission Guided Scenario", /Guided Scenario/.test(managerSection.truthNote ?? "") && /Guided Scenario/.test(managerSection.explain.join(" ")));
const personaSection = GUIDE_SECTIONS.find((s) => s.id === "persona-projections")!;
check("20. Executive and Operations are labelled Production-Partial", /Production-Partial/.test(personaSection.truthNote ?? "") && /Production-Partial/.test(personaSection.explain.join(" ")));
const simSection = GUIDE_SECTIONS.find((s) => s.id === "simulated-execution")!;
check("21. simulation statements remain explicit", /Simulated/.test(simSection.truthNote ?? "") && /not sent/.test(simSection.explain.join(" ")) && /not created/.test(simSection.explain.join(" ")) && /not written/.test(simSection.explain.join(" ")));
const nvidiaSection = GUIDE_SECTIONS.find((s) => s.id === "nvidia-role")!;
const guardrailsSection = GUIDE_SECTIONS.find((s) => s.id === "guardrails-lab")!;
const nvidiaBlob = (nvidiaSection.explain.join(" ") + " " + guardrailsSection.explain.join(" ") + " " + (guardrailsSection.truthNote ?? ""));
check("22. NVIDIA authority is described accurately (does not select/approve/execute/override)", /does not select/.test(nvidiaBlob) && /does not approve/.test(nvidiaBlob) && /does not execute/.test(nvidiaBlob) && /(override|replace deterministic policy)/.test(nvidiaBlob));
check("23. deterministic policy is described as final authority", /deterministic policy is (the )?(final )?authorit/i.test(nvidiaBlob) || /final authority/i.test(guardrailsSection.truthNote ?? ""));
check("24. Voice and Digital Human are not described as Production", !TRUTH_TABLE.some((r) => r.tier === "Production" && r.items.some((i) => /voice|digital human/i.test(i))) && TRUTH_TABLE.some((r) => r.tier === "Future" && r.items.some((i) => /Voice and Digital Human/i.test(i))));

console.log("\n[6] Feedback, severity, glossary, checklist");
const requiredFeedbackKeys = ["testerName", "date", "browserDevice", "severity", "route", "reproductionSteps", "expectedResult", "actualResult", "screenshotFilename"];
check("25. feedback template fields are complete", requiredFeedbackKeys.every((k) => FEEDBACK_FIELDS.some((f) => f.key === k)) && FEEDBACK_FIELDS.length >= 20);
check("   severity guidance covers P0/P1/P2", ["P0", "P1", "P2"].every((lv) => SEVERITY_GUIDANCE.some((s) => s.level === lv && s.items.length > 0)));
check("   final checklist has the required 17 items", FINAL_CHECKLIST.length === 17 && FINAL_CHECKLIST.every((c) => c.trim().length > 0));
check("   glossary defines core terms", ["Simulated", "System outcome", "Business outcome", "Deterministic policy", "Production-Partial"].every((t) => GLOSSARY.some((g) => g.term === t)));

console.log("\n[7] Public artifacts on disk");
const pdfPath = resolve(PUBLIC_DIR, "." + GUIDE_META.pdfPath);
check("26. PDF file exists and is non-empty", existsSync(pdfPath) && statSync(pdfPath).size > 20_000, existsSync(pdfPath) ? `${statSync(pdfPath).size} bytes` : "missing");
check("   PDF is a real PDF (starts with %PDF-)", existsSync(pdfPath) && readFileSync(pdfPath).subarray(0, 5).toString("latin1") === "%PDF-");
const feedbackTemplatePath = resolve(PUBLIC_DIR, "." + GUIDE_META.feedbackTemplatePath);
check("   downloadable feedback template exists", existsSync(feedbackTemplatePath) && statSync(feedbackTemplatePath).size > 200);

console.log("\n[8] Route + internal source presence");
const routePath = resolve(WEB_ROOT, "app/tester-guide/page.tsx");
check("27. /tester-guide route source exists", existsSync(routePath));
const internalSource = resolve(REPO_ROOT, "docs/private-review/tester-guide/tester-guide-source.md");
const assetManifest = resolve(REPO_ROOT, "docs/private-review/tester-guide/tester-guide-assets.json");
check("   internal editable source exists", existsSync(internalSource));
check("28. asset manifest exists and lists every screenshot", (() => {
  if (!existsSync(assetManifest)) return false;
  try {
    const m = JSON.parse(readFileSync(assetManifest, "utf8"));
    const files: string[] = (m.assets ?? []).map((a: { publicFilename: string }) => a.publicFilename);
    return GUIDE_SCREENSHOTS.every((s) => files.includes(s.src.split("/").pop()!));
  } catch {
    return false;
  }
})());

console.log("\n[9] Protected-path + secret guards (content model only)");
check("29. content model imports no protected engine internals", (() => {
  const src = readFileSync(resolve(HERE, "../content.ts"), "utf8");
  // It may reuse the walkthrough canonical constants (read-only), but must not
  // import memory/conversation/harness/ledger engine internals.
  return !/from ["']@\/lib\/(memory|conversation|harness|missions\/engine|guardrails\/engine)/.test(src);
})());
check("30. no secret literal in content model", (() => {
  const src = readFileSync(resolve(HERE, "../content.ts"), "utf8");
  return !/nvapi-[A-Za-z0-9]{6,}/.test(src) && !/Bearer\s+[A-Za-z0-9]/.test(src);
})());

console.log("\n[10] Lightbox accessibility + public provenance polish");
const guideImageSrc = readFileSync(resolve(WEB_ROOT, "components/tester-guide/GuideImage.tsx"), "utf8");
check("31. lightbox moves focus into the dialog on open", /ref=\{closeRef\}/.test(guideImageSrc) && /closeRef\.current\?\.focus\(\)/.test(guideImageSrc));
check("32. lightbox restores focus to the triggering button on close/unmount", /ref=\{triggerRef\}/.test(guideImageSrc) && /trigger\?\.focus\(\)/.test(guideImageSrc));
check("33. lightbox closes on Escape", /e\.key === "Escape"/.test(guideImageSrc));
check("34. lightbox exposes a close control", /aria-label="Close expanded image"/.test(guideImageSrc));
check("35. lightbox locks background scroll while open", /body\.style\.overflow = "hidden"/.test(guideImageSrc));
check("   lightbox restores background scroll on close/unmount", /body\.style\.overflow = prevOverflow/.test(guideImageSrc) && /body\.style\.paddingRight = prevPaddingRight/.test(guideImageSrc));

const feedbackMd = buildFeedbackTemplateMarkdown();
check("36. public feedback template contains no commit SHA", !feedbackMd.includes(GUIDE_META.sourceSha));
check("37. public feedback template contains no deployment ID", !feedbackMd.includes("dpl_") && !feedbackMd.includes(GUIDE_META.sourceDeploymentId));
check("   public feedback template contains no Preview URL or filesystem path", !/[a-z0-9-]+-[a-z0-9]{9,}-[a-z0-9-]+\.vercel\.app/i.test(feedbackMd) && !/localhost/.test(feedbackMd) && !/[A-Za-z]:\\/.test(feedbackMd) && !/\/Users\//.test(feedbackMd));
check("38. internal asset manifest still retains full provenance (SHA + deployment ID)", (() => {
  if (!existsSync(assetManifest)) return false;
  try {
    const s = JSON.stringify(JSON.parse(readFileSync(assetManifest, "utf8")));
    return s.includes(GUIDE_META.sourceSha) && s.includes(GUIDE_META.sourceDeploymentId);
  } catch {
    return false;
  }
})());

console.log("\n" + "=".repeat(70));
console.log(`Tester Guide evaluation: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  - " + f);
  console.log("=".repeat(70));
  process.exit(1);
}
console.log("All tester-guide checks passed. One canonical source; truthful, provenanced, public-safe.");
console.log("=".repeat(70));
