// Tester Guide — deterministic generators (pure; no fs, no React)
// ================================================================
// Turns the canonical content model into the three derived artifacts so they
// never drift from the route:
//   - buildFeedbackTemplateMarkdown() -> the downloadable feedback template
//   - buildAssetManifest()            -> the machine-readable screenshot manifest
//   - buildPdfHtml()                  -> printable HTML the PDF is rendered from
// The PDF/template/manifest FILES are written by the runner (pdf/generate.mjs),
// which is the only place that touches the filesystem or a headless browser.

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
  type GuideScreenshot,
} from "./content";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Downloadable feedback template (Markdown).
// ---------------------------------------------------------------------------
export function buildFeedbackTemplateMarkdown(): string {
  const lines: string[] = [];
  lines.push(`# ${GUIDE_META.product} ${GUIDE_META.flagship} — Tester Feedback`);
  lines.push("");
  lines.push(`> ${GUIDE_META.tagline}`);
  lines.push("");
  lines.push(
    "Copy this template, fill it in, and share it with the VentureOS team. " +
      "No backend submission is required — this is a copyable / downloadable form.",
  );
  lines.push("");
  lines.push("## Tester details & ratings");
  lines.push("");
  for (const f of FEEDBACK_FIELDS) {
    if (f.kind === "rating") {
      lines.push(`- **${f.label}** (1–5): `);
    } else if (f.kind === "choice") {
      lines.push(`- **${f.label}**: [ ] P0  [ ] P1  [ ] P2`);
    } else if (f.kind === "longtext") {
      lines.push(`- **${f.label}**:`);
      lines.push("  ");
    } else {
      lines.push(`- **${f.label}**: `);
    }
  }
  lines.push("");
  lines.push("## Per-defect record (repeat for each defect)");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");
  lines.push("| Severity (P0/P1/P2) | |");
  lines.push("| Route | |");
  lines.push("| Date & time | |");
  lines.push("| Browser / device | |");
  lines.push("| Action taken | |");
  lines.push("| Expected result | |");
  lines.push("| Actual result | |");
  lines.push("| Screenshot filename | |");
  lines.push("| Refresh reproduces it? | |");
  lines.push("| Blocks the canonical Curefoods journey? | |");
  lines.push("| Approval bypassed? | |");
  lines.push("| A real action occurred? | |");
  lines.push("| Audit identity changed? | |");
  lines.push("| A secret was visible? | |");
  lines.push("");
  lines.push("## Severity guidance");
  lines.push("");
  for (const s of SEVERITY_GUIDANCE) {
    lines.push(`- **${s.level} — ${s.label}**`);
    for (const i of s.items) lines.push(`  - ${i}`);
  }
  lines.push("");
  lines.push("## Final checklist");
  lines.push("");
  for (const c of FINAL_CHECKLIST) lines.push(`- [ ] ${c}`);
  lines.push("");
  lines.push(
    `_Source: ${GUIDE_META.title}. Screenshots captured from the canonical production application (SHA ${GUIDE_META.sourceSha})._`,
  );
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Machine-readable asset manifest.
// ---------------------------------------------------------------------------
export interface AssetManifestEntry {
  readonly id: string;
  readonly publicFilename: string;
  readonly publicSrc: string;
  readonly originalSourceFilename: string;
  readonly sourceRoute: string;
  readonly deploymentId: string;
  readonly sourceSha: string;
  readonly captureTimestamp: string;
  readonly missionState: string | null;
  readonly nvidiaState: string | null;
  readonly guardrailScenario: string | null;
  readonly caption: string;
  readonly altText: string;
  readonly width: number;
  readonly height: number;
  readonly sectionUsage: readonly number[];
  readonly cropped: boolean;
  readonly redacted: boolean;
  readonly checksumSha256Short: string;
}

export function buildAssetManifest(): {
  generatedFrom: string;
  canonicalUrl: string;
  sourceSha: string;
  sourceDeploymentId: string;
  assetCount: number;
  assets: AssetManifestEntry[];
} {
  const sectionsFor = (id: string): number[] =>
    GUIDE_SECTIONS.filter((s) => s.screenshotIds.includes(id)).map((s) => s.number);

  const assets: AssetManifestEntry[] = GUIDE_SCREENSHOTS.map((s: GuideScreenshot) => ({
    id: s.id,
    publicFilename: s.src.split("/").pop() as string,
    publicSrc: s.src,
    originalSourceFilename: s.sourceFile,
    sourceRoute: s.route,
    deploymentId: s.deploymentId,
    sourceSha: s.sha,
    captureTimestamp: s.capturedAt,
    missionState: s.missionState,
    nvidiaState: s.nvidiaState,
    guardrailScenario: s.guardrailScenario,
    caption: s.caption,
    altText: s.alt,
    width: s.width,
    height: s.height,
    sectionUsage: sectionsFor(s.id),
    cropped: s.cropped,
    redacted: s.redacted,
    checksumSha256Short: s.checksumSha256Short,
  }));

  return {
    generatedFrom: "apps/web/lib/tester-guide/content.ts",
    canonicalUrl: GUIDE_META.canonicalUrl,
    sourceSha: GUIDE_META.sourceSha,
    sourceDeploymentId: GUIDE_META.sourceDeploymentId,
    assetCount: assets.length,
    assets,
  };
}

// ---------------------------------------------------------------------------
// Printable HTML (source of the illustrated PDF).
// `assetBaseHref` should be a URL (e.g. file:///.../apps/web/public/) so the
// relative image paths in each screenshot resolve during headless rendering.
// ---------------------------------------------------------------------------
export function buildPdfHtml(assetBaseHref: string): string {
  const C = GUIDE_CANONICAL;
  const imgSrc = (s: GuideScreenshot) => s.src.replace(/^\//, ""); // relative to base href

  const sectionHtml = GUIDE_SECTIONS.map((s) => {
    const shots = s.screenshotIds
      .map((id) => GUIDE_SCREENSHOTS.find((x) => x.id === id))
      .filter((x): x is GuideScreenshot => Boolean(x));
    const shotsHtml = shots
      .map(
        (sc) => `
        <figure class="shot">
          <img src="${esc(imgSrc(sc))}" alt="${esc(sc.alt)}" />
          <figcaption>${esc(sc.caption)}</figcaption>
        </figure>`,
      )
      .join("");

    return `
      <section class="sec">
        <h2><span class="num">${s.number}</span>${esc(s.title)}</h2>
        <p class="purpose"><strong>Purpose.</strong> ${esc(s.purpose)}</p>
        ${s.route ? `<p class="route"><strong>Route:</strong> <code>${esc(s.route)}</code></p>` : ""}
        <ul class="explain">${s.explain.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
        <div class="steps">
          <h3>What to do &amp; expect</h3>
          <ol>${s.steps
            .map((st) => `<li><span class="do">${esc(st.action)}</span><span class="exp">${esc(st.expected)}</span></li>`)
            .join("")}</ol>
        </div>
        ${
          s.expectedResults.length
            ? `<div class="expected"><h4>Expected result</h4><ul>${s.expectedResults
                .map((e) => `<li>${esc(e)}</li>`)
                .join("")}</ul></div>`
            : ""
        }
        ${
          s.failureIndicators.length
            ? `<div class="failure"><h4>Failure indicators</h4><ul>${s.failureIndicators
                .map((e) => `<li>${esc(e)}</li>`)
                .join("")}</ul></div>`
            : ""
        }
        ${s.truthNote ? `<p class="truth"><strong>Truth note.</strong> ${esc(s.truthNote)}</p>` : ""}
        ${shotsHtml}
      </section>`;
  }).join("");

  const truthHtml = TRUTH_TABLE.map(
    (r) => `<tr><th>${esc(r.tier)}</th><td>${r.items.map((i) => esc(i)).join("<br/>")}</td></tr>`,
  ).join("");

  const severityHtml = SEVERITY_GUIDANCE.map(
    (s) =>
      `<div class="sev"><h4>${esc(s.level)} — ${esc(s.label)}</h4><ul>${s.items
        .map((i) => `<li>${esc(i)}</li>`)
        .join("")}</ul></div>`,
  ).join("");

  const glossaryHtml = GLOSSARY.map(
    (g) => `<tr><th>${esc(g.term)}</th><td>${esc(g.definition)}</td></tr>`,
  ).join("");

  const checklistHtml = FINAL_CHECKLIST.map((c) => `<li>☐ ${esc(c)}</li>`).join("");

  const feedbackHtml = FEEDBACK_FIELDS.map((f) => `<li><strong>${esc(f.label)}</strong></li>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<base href="${esc(assetBaseHref)}" />
<title>${esc(GUIDE_META.title)}</title>
<style>
  :root { --gold:#D89A3D; --ink:#1a1a1a; --muted:#555; --line:#e2ddd2; --bg:#fbf9f4; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); margin:0; background:#fff; }
  .cover { height: 1050px; background: linear-gradient(160deg,#0a0b0d 0%, #14161b 60%, #1f242b 100%); color:#f5f1e8; padding:96px 72px; display:flex; flex-direction:column; }
  .cover .brand { font-size:14px; letter-spacing:.28em; text-transform:uppercase; color:var(--gold); }
  .cover h1 { font-size:52px; line-height:1.05; margin:24px 0 12px; max-width:760px; }
  .cover .tag { font-size:20px; color:#d8d2c4; margin-top:8px; }
  .cover .meta { margin-top:auto; font-size:13px; color:#b5b0a5; line-height:1.8; border-top:1px solid rgba(255,255,255,.14); padding-top:20px; }
  .cover .pill { display:inline-block; border:1px solid var(--gold); color:var(--gold); border-radius:999px; padding:4px 12px; font-size:12px; letter-spacing:.12em; text-transform:uppercase; }
  main { padding: 56px 64px; }
  h2 { font-size:22px; border-bottom:2px solid var(--gold); padding-bottom:8px; margin-top:40px; page-break-after:avoid; }
  h2 .num { display:inline-flex; width:28px; height:28px; margin-right:12px; background:var(--gold); color:#1a1206; border-radius:8px; align-items:center; justify-content:center; font-size:15px; }
  h3 { font-size:15px; margin:18px 0 6px; }
  h4 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:14px 0 4px; }
  .sec { page-break-inside:auto; }
  .purpose, .route { font-size:13.5px; color:#333; margin:8px 0; }
  code { background:#f1ede3; padding:1px 5px; border-radius:4px; font-size:12px; }
  ul.explain { font-size:13.5px; color:#333; }
  .steps ol { font-size:13.5px; padding-left:18px; }
  .steps li { margin-bottom:8px; }
  .steps .do { display:block; font-weight:600; }
  .steps .exp { display:block; color:var(--muted); }
  .steps .exp::before { content:"Expect: "; color:var(--gold); font-weight:600; }
  .expected, .failure { font-size:13px; }
  .failure h4 { color:#b23b30; }
  .truth { font-size:13px; background:#fbf4e6; border-left:3px solid var(--gold); padding:10px 12px; margin:14px 0; }
  figure.shot { margin:16px 0; page-break-inside:avoid; }
  figure.shot img { width:100%; border:1px solid var(--line); border-radius:8px; }
  figure.shot figcaption { font-size:11.5px; color:var(--muted); margin-top:6px; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; margin:12px 0; }
  th, td { border:1px solid var(--line); padding:8px 10px; vertical-align:top; text-align:left; }
  th { background:#f6f1e6; width:210px; }
  .sev { margin:10px 0; font-size:13px; }
  .cols { columns:2; column-gap:28px; font-size:13px; }
  ul.check { list-style:none; padding-left:0; font-size:13.5px; }
  .foot { margin-top:40px; border-top:1px solid var(--line); padding-top:14px; font-size:11px; color:#999; }
</style>
</head>
<body>
  <div class="cover">
    <div class="brand">${esc(GUIDE_META.product)} · ${esc(GUIDE_META.flagship)}</div>
    <h1>${esc(GUIDE_META.title)}</h1>
    <div class="tag">${esc(GUIDE_META.tagline)}</div>
    <div style="margin-top:28px"><span class="pill">${esc(GUIDE_META.statusLabel)}</span></div>
    <div class="meta">
      Purpose — ${esc(GUIDE_META.purpose)}<br/>
      Canonical URL — ${esc(GUIDE_META.canonicalUrl)}<br/>
      Estimated completion — about ${GUIDE_META.estimatedMinutes} minutes<br/>
      Suggested browser — ${esc(GUIDE_META.suggestedBrowser)}<br/>
      Screenshots — captured from the canonical production application (validated runtime baseline)
    </div>
  </div>
  <main>
    <section class="sec">
      <h2><span class="num">•</span>Product overview</h2>
      <p class="purpose">${esc(GUIDE_META.purpose)}</p>
      <ul class="explain">
        <li>Account <strong>${esc(C.account)}</strong> (<code>${esc(C.accountId)}</code>) · Mission <code>${esc(C.missionId)}</code> · Recommendation <code>${esc(C.recommendationId)}</code></li>
        <li>Template <code>${esc(C.template)}</code> · Audit reference <code>${esc(C.auditRef)}</code></li>
        <li>System outcome — “${esc(C.systemOutcome)}” · Business outcome — “${esc(C.businessOutcome)}”</li>
        <li>Deterministic policy is the final authority; NVIDIA Nemotron is grounded narrative only and never selects, approves, or executes.</li>
      </ul>
    </section>
    ${sectionHtml}

    <section class="sec">
      <h2><span class="num">T</span>Production versus demonstration — truth table</h2>
      <table>${truthHtml}</table>
    </section>

    <section class="sec">
      <h2><span class="num">S</span>Severity guidance</h2>
      ${severityHtml}
    </section>

    <section class="sec">
      <h2><span class="num">F</span>Tester feedback fields</h2>
      <div class="cols"><ul>${feedbackHtml}</ul></div>
      <p class="purpose">A complete, copyable feedback + per-defect template ships alongside this guide.</p>
    </section>

    <section class="sec">
      <h2><span class="num">✓</span>Final tester checklist</h2>
      <ul class="check cols">${checklistHtml}</ul>
    </section>

    <section class="sec">
      <h2><span class="num">G</span>Glossary</h2>
      <table>${glossaryHtml}</table>
    </section>

    <div class="foot">
      ${esc(GUIDE_META.product)} ${esc(GUIDE_META.title)} · Generated from the canonical content model
      (apps/web/lib/tester-guide/content.ts) · Screenshots from the validated production baseline.
      Deterministic governed demo — simulated actions only; no real email, CRM, or risk record is created.
    </div>
  </main>
</body>
</html>`;
}
