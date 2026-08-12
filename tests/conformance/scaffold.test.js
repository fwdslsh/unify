/**
 * §19 scaffold contract — SCF-01..04 — plus DIA-10, the advisory-discipline
 * invariant §19 pins per-template as SCF-04. All "e2e" per rules.tsv: this
 * file drives the installed entrypoint exactly as Tier 0 describes (`unify
 * init <t>`, then `unify build --dry-run --strict`, then a real `unify
 * build`), no `src/**` imports (hygiene H3).
 *
 * SCF-04 and DIA-10 are the SAME assertion (testing-strategy.md §2 Tier 0
 * calls it out explicitly as "SCF-04/DIA-10"): `unify init && unify build
 * --dry-run --strict` exits 0. Proved once per template, in the same test
 * that checks SCF-01/02, so a template that fails structurally and a
 * template that fails the advisory-discipline invariant are both caught by
 * the same run over that template.
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli } from "./support.mjs";

const TEST_MS = 45_000;
const TEMPLATES = ["default", "basic", "blog", "docs", "portfolio"];

/** Every `.html` file under `dir`, recursively, as absolute paths. */
function findHtmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findHtmlFiles(abs));
    else if (entry.name.endsWith(".html")) out.push(abs);
  }
  return out;
}

for (const name of TEMPLATES) {
  test(`scaffold/${name}: SCF-01 primitives, SCF-02 layout/stylesheet/no-<slot>-in-output, SCF-04/DIA-10 advisory discipline`, async () => {
    const tmp = mkTmp();

    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);

    const srcDir = join(tmp, "src");
    if (!existsSync(srcDir)) throw new Error(`unify init ${name} did not scaffold into src/`);

    // ---- SCF-01: each primitive exactly once. ------------------------------
    const layoutPath = join(srcDir, "_layout.html");
    if (!existsSync(layoutPath)) throw new Error("missing the automatic _layout.html");
    const layoutText = readFileSync(layoutPath, "utf8");

    if (!layoutText.includes('<include src="/_includes/nav.html">')) {
      throw new Error(`_layout.html does not include the nav via <include>:\n${layoutText}`);
    }
    if (!existsSync(join(srcDir, "_includes", "nav.html"))) throw new Error("missing _includes/nav.html — the underscore convention primitive");

    if (!layoutText.includes('<slot name="footer">')) throw new Error(`_layout.html is missing the named "footer" slot with a fallback:\n${layoutText}`);
    if (!existsSync(join(srcDir, "contact.html")) || !readFileSync(join(srcDir, "contact.html"), "utf8").includes('slot="footer"')) {
      throw new Error("missing a page filling the footer slot (contact.html with slot=\"footer\")");
    }

    const notFoundPath = join(srcDir, "404.html");
    if (!existsSync(notFoundPath) || !readFileSync(notFoundPath, "utf8").includes('data-layout="none"')) {
      throw new Error("missing 404.html with data-layout=\"none\"");
    }

    // ---- SCF-02: charset, a plain comment above each <slot>, the preview
    // CSS rule, and (checked further down, after a real build) no <slot> in
    // built output. ------------------------------------------------------
    if (!layoutText.includes('<meta charset="utf-8">')) throw new Error(`_layout.html is missing <meta charset="utf-8">:\n${layoutText}`);
    if (!/<!--[^>]*-->\s*\n\s*<slot name="footer">/.test(layoutText)) {
      throw new Error(`_layout.html's footer slot has no plain HTML comment directly above it:\n${layoutText}`);
    }
    const styleCss = readFileSync(join(srcDir, "assets", "style.css"), "utf8");
    if (!styleCss.includes("slot {") || !styleCss.includes("display: contents;")) {
      throw new Error(`assets/style.css is missing the design-time preview rule "slot { display: contents }":\n${styleCss}`);
    }

    // ---- SCF-04 / DIA-10: unify init && unify build --dry-run --strict
    // exits 0, with no intervening step. -----------------------------------
    const dryRunR = await runCli(["build", "--dry-run", "--strict"], tmp);
    if (dryRunR.exit !== 0) {
      throw new Error(
        `unify build --dry-run --strict exited ${dryRunR.exit} for template "${name}" — either a problem, or an advisory ` +
        `firing on a correct scaffold (a bug in the advisory, per §14.3's discipline). stderr:\n${dryRunR.stderr}`,
      );
    }

    // ---- SCF-02's remaining half: a REAL build's output pages carry no
    // <slot> element anywhere (the CSS rule above is preview-only). --------
    const buildR = await runCli(["build"], tmp);
    if (buildR.exit !== 0) throw new Error(`unify build (real) exited ${buildR.exit} for template "${name}": ${buildR.stderr}`);
    const distDir = join(tmp, "dist");
    if (!existsSync(distDir)) throw new Error(`unify build did not produce dist/ for template "${name}"`);
    for (const htmlFile of findHtmlFiles(distDir)) {
      const text = readFileSync(htmlFile, "utf8");
      if (text.includes("<slot")) throw new Error(`built page still contains a <slot> element: ${htmlFile}`);
    }

    covers("SCF-01", "SCF-02", "SCF-04", "DIA-10");
  }, TEST_MS);
}

test("scaffold/blog: SCF-03 — _scripts/gen-blog.mjs is zero-dependency and regenerates blog.html + feed.xml from posts/*.md", async () => {
  const tmp = mkTmp();
  const initR = await runCli(["init", "blog"], tmp);
  if (initR.exit !== 0) throw new Error(`unify init blog exited ${initR.exit}: ${initR.stderr}`);

  const srcDir = join(tmp, "src");
  const scriptPath = join(srcDir, "_scripts", "gen-blog.mjs");
  if (!existsSync(scriptPath)) throw new Error("blog template is missing _scripts/gen-blog.mjs");

  // Zero dependencies: the only import is a node: builtin.
  const scriptText = readFileSync(scriptPath, "utf8");
  const importLines = scriptText.split("\n").filter((l) => /^\s*import\b/.test(l));
  if (importLines.length !== 1 || !/from\s+["']node:/.test(importLines[0])) {
    throw new Error(`_scripts/gen-blog.mjs should have exactly one import, from a node: builtin, got:\n${importLines.join("\n")}`);
  }

  const blogHtmlPath = join(srcDir, "blog.html");
  const feedXmlPath = join(srcDir, "feed.xml");
  if (!existsSync(blogHtmlPath) || !existsSync(feedXmlPath)) {
    throw new Error("blog template did not ship pre-generated blog.html/feed.xml");
  }
  const originalBlogHtml = readFileSync(blogHtmlPath, "utf8");
  const originalFeedXml = readFileSync(feedXmlPath, "utf8");

  // Delete both, then regenerate from posts/*.md, so a coincidental match
  // (files simply never touched) cannot pass this check.
  rmSync(blogHtmlPath);
  rmSync(feedXmlPath);

  const genProc = Bun.spawn({
    cmd: [process.execPath, join(srcDir, "_scripts", "gen-blog.mjs")],
    cwd: srcDir,
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [genOut, genErr] = await Promise.all([new Response(genProc.stdout).text(), new Response(genProc.stderr).text()]);
  const genExit = await genProc.exited;
  if (genExit !== 0) throw new Error(`_scripts/gen-blog.mjs exited ${genExit}: ${genErr}`);
  if (!genOut.includes("wrote blog.html and feed.xml")) throw new Error(`gen-blog.mjs did not report success: ${genOut}`);

  if (!existsSync(blogHtmlPath) || !existsSync(feedXmlPath)) throw new Error("gen-blog.mjs did not (re)write blog.html/feed.xml");
  const regeneratedBlogHtml = readFileSync(blogHtmlPath, "utf8");
  const regeneratedFeedXml = readFileSync(feedXmlPath, "utf8");
  if (regeneratedBlogHtml !== originalBlogHtml) {
    throw new Error(`regenerated blog.html differs from the scaffold's checked-in copy:\n--- original ---\n${originalBlogHtml}\n--- regenerated ---\n${regeneratedBlogHtml}`);
  }
  if (regeneratedFeedXml !== originalFeedXml) {
    throw new Error(`regenerated feed.xml differs from the scaffold's checked-in copy:\n--- original ---\n${originalFeedXml}\n--- regenerated ---\n${regeneratedFeedXml}`);
  }

  // The scaffold must build clean with the regenerated files too — no
  // intervening step was needed (they matched exactly), so this doubles as
  // reassurance that SCF-04's guarantee didn't depend on the pre-generated
  // copies being special-cased somehow.
  const dryRunR = await runCli(["build", "--dry-run", "--strict"], tmp);
  if (dryRunR.exit !== 0) throw new Error(`unify build --dry-run --strict exited ${dryRunR.exit} after regenerating blog.html/feed.xml: ${dryRunR.stderr}`);

  covers("SCF-03");
}, TEST_MS);
