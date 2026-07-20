// Tester Guide artifact generator (runner).
// ==========================================
// Regenerates the three derived artifacts from the canonical content model:
//   1. public/guides/VentureOS-Tester-Feedback-Template.md
//   2. docs/private-review/tester-guide/tester-guide-assets.json
//   3. public/guides/VentureOS-Signal-to-Action-Tester-Guide.pdf  (illustrated)
//
// Run from apps/web with the repo's TS loader so it can import content.ts:
//   node --disable-warning=ExperimentalWarning \
//     --import ./lib/memory/eval/register.mjs \
//     ./lib/tester-guide/pdf/generate.mjs
//
// The PDF render step needs a Chromium binary. It uses playwright-core when
// resolvable; provide the browser via env when it is not a repo dependency:
//   PW_DIR         directory whose node_modules contains playwright-core
//   PW_CHROMIUM    absolute path to a Chromium/Chrome executable
// If neither the module nor a browser is available, the .md and .json are still
// written and a printable .html is emitted next to the PDF for manual export.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

import {
  buildFeedbackTemplateMarkdown,
  buildAssetManifest,
  buildPdfHtml,
} from "../generate";
import { GUIDE_META } from "../content";

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/web/lib/tester-guide/pdf
const WEB = resolve(HERE, "..", "..", ".."); // apps/web
const REPO = resolve(WEB, "..", ".."); // repo root
const PUBLIC_DIR = resolve(WEB, "public");
const GUIDES_DIR = resolve(PUBLIC_DIR, "guides");
const MANIFEST_DIR = resolve(REPO, "docs", "private-review", "tester-guide");

mkdirSync(GUIDES_DIR, { recursive: true });
mkdirSync(MANIFEST_DIR, { recursive: true });

// 1. Feedback template ------------------------------------------------------
const feedbackPath = resolve(WEB, "public" + GUIDE_META.feedbackTemplatePath);
writeFileSync(feedbackPath, buildFeedbackTemplateMarkdown(), "utf8");
console.log("[ok] feedback template ->", feedbackPath);

// 2. Asset manifest ---------------------------------------------------------
const manifestPath = resolve(MANIFEST_DIR, "tester-guide-assets.json");
writeFileSync(manifestPath, JSON.stringify(buildAssetManifest(), null, 2) + "\n", "utf8");
console.log("[ok] asset manifest ->", manifestPath);

// 3. Illustrated PDF --------------------------------------------------------
const baseHref = pathToFileURL(PUBLIC_DIR + "/").href;
const html = buildPdfHtml(baseHref);
const htmlPath = resolve(tmpdir(), "VentureOS-Signal-to-Action-Tester-Guide.html");
writeFileSync(htmlPath, html, "utf8");
const pdfPath = resolve(WEB, "public" + GUIDE_META.pdfPath);

async function resolveChromium() {
  const pwDir = process.env.PW_DIR;
  const exe = process.env.PW_CHROMIUM;
  let chromium = null;
  const candidates = [];
  if (pwDir) candidates.push(pwDir);
  candidates.push(WEB, REPO);
  for (const dir of candidates) {
    try {
      const req = createRequire(pathToFileURL(resolve(dir, "package.json")).href);
      chromium = req("playwright-core").chromium;
      if (chromium) break;
    } catch {
      /* try next */
    }
  }
  return { chromium, exe };
}

async function renderPdf() {
  const { chromium, exe } = await resolveChromium();
  if (!chromium) {
    console.warn("[warn] playwright-core not resolvable; wrote HTML only:", htmlPath);
    return false;
  }
  const launchOpts = { args: ["--no-sandbox"] };
  if (exe && existsSync(exe)) launchOpts.executablePath = exe;
  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    console.log("[ok] illustrated PDF ->", pdfPath);
    return true;
  } finally {
    await browser.close();
  }
}

const ok = await renderPdf();
process.exit(ok ? 0 : 2);
