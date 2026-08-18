/**
 * §19 scaffold contract — SCF-01..05 — plus DIA-10, the advisory-discipline
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
 *
 * SCF-03/SCF-05 (the blog generator + its field-privacy demonstration) get
 * their own test below: the scaffold's checked-in generated files must be
 * byte-identical to a fresh run of `_scripts/gen.mjs`, and the private field
 * in `_data/authors.json` must appear nowhere in the built output.
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
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

/** Every file under `dir`, recursively, as a Map of source-relative path -> Buffer. */
function readTree(dir, base = dir) {
  const out = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) for (const [rel, bytes] of readTree(abs, base)) out.set(rel, bytes);
    else out.set(relative(base, abs), readFileSync(abs));
  }
  return out;
}

for (const name of TEMPLATES) {
  test(`scaffold/${name}: SCF-04 — the golden path holds with --base-url, the flag every published site sets`, async () => {
    // §21 makes --base-url the flag a site sets to get a sitemap, so a
    // template that only builds clean WITHOUT it does not have a golden path
    // any more. This caught a real scaffold defect: blog's author link was
    // https://example.com/sam, and --base-url https://example.com/ — the most
    // obvious value a reader types — made REF-02 strip the matching origin,
    // turning an intended external link into a broken internal one. A
    // placeholder that collides with the reader's own address is a scaffold
    // bug, not a CLI bug.
    const tmp = mkTmp();
    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);

    const dry = await runCli(["build", "--dry-run", "--strict", "--base-url", "https://example.com/"], tmp);
    if (dry.exit !== 0) {
      throw new Error(`unify build --dry-run --strict --base-url https://example.com/ exited ${dry.exit}\nstdout:\n${dry.stdout}\nstderr:\n${dry.stderr}`);
    }
    const real = await runCli(["build", "--base-url", "https://example.com/"], tmp);
    if (real.exit !== 0) {
      throw new Error(`unify build --base-url exited ${real.exit}\nstderr:\n${real.stderr}`);
    }
    if (!existsSync(join(tmp, "dist", "sitemap.xml"))) {
      throw new Error(`${name} built with --base-url but emitted no sitemap.xml`);
    }
    covers("SCF-04", "SIT-01");
  }, TEST_MS);
}

test("scaffold/blog: SCF-03 — _scripts/gen.mjs reproduces the checked-in tree byte-for-byte; SCF-05 — the private field never leaves _data/", async () => {
  const tmp = mkTmp();
  const initR = await runCli(["init", "blog"], tmp);
  if (initR.exit !== 0) throw new Error(`unify init blog exited ${initR.exit}: ${initR.stderr}`);

  const srcDir = join(tmp, "src");
  const scriptPath = join(srcDir, "_scripts", "gen.mjs");
  if (!existsSync(scriptPath)) throw new Error("blog template is missing _scripts/gen.mjs");

  // Zero dependencies: the only import is a node: builtin.
  const scriptText = readFileSync(scriptPath, "utf8");
  const importLines = scriptText.split("\n").filter((l) => /^\s*import\b/.test(l));
  if (importLines.length !== 1 || !/from\s+["']node:/.test(importLines[0])) {
    throw new Error(`_scripts/gen.mjs should have exactly one import, from a node: builtin, got:\n${importLines.join("\n")}`);
  }

  // The run-it-yourself contract, spelled exactly as docs/authoring-rules.md
  // line 5 spells it — the scaffold and the doc must agree, because a rule
  // that shows exactly one literal will have that literal copied
  // (docs/ratification.md §6).
  if (!scriptText.includes("node _scripts/gen.mjs && unify build")) {
    throw new Error(`_scripts/gen.mjs's opening comment must carry the authoring rules' literal "node _scripts/gen.mjs && unify build":\n${scriptText.split("\n").slice(0, 5).join("\n")}`);
  }

  // The data file the generator reads: public fields beside a private one.
  // SCF-05 exists because file-level exclusion cannot protect a field — the
  // private value must be present HERE for the never-ships assertion below
  // to prove anything.
  const authorsPath = join(srcDir, "_data", "authors.json");
  if (!existsSync(authorsPath)) throw new Error("blog template is missing _data/authors.json");
  const authorRecords = Object.values(JSON.parse(readFileSync(authorsPath, "utf8")));
  if (authorRecords.length === 0) throw new Error("_data/authors.json holds no author records");
  const publicName = authorRecords[0].name;
  const privateEmail = authorRecords[0].email;
  if (!publicName) throw new Error("_data/authors.json's first record has no public `name` field");
  if (!privateEmail || !privateEmail.includes("@")) {
    throw new Error(`_data/authors.json's first record has no private \`email\` field — the field the scaffold exists to keep out of pages (got: ${JSON.stringify(authorRecords[0])})`);
  }

  // Snapshot every byte of the scaffold, delete the two generated artifacts
  // (so "unchanged" cannot mean "never touched"), rerun the generator, and
  // require the whole tree back byte-for-byte: freshness (the checked-in
  // copies are exactly what the script produces) and idempotence (the script
  // wrote nothing else) in one check.
  const before = readTree(srcDir);
  const blogHtmlPath = join(srcDir, "blog.html");
  const feedXmlPath = join(srcDir, "feed.xml");
  if (!existsSync(blogHtmlPath) || !existsSync(feedXmlPath)) {
    throw new Error("blog template did not ship pre-generated blog.html/feed.xml");
  }
  rmSync(blogHtmlPath);
  rmSync(feedXmlPath);

  const genProc = Bun.spawn({
    cmd: [process.execPath, scriptPath],
    cwd: srcDir,
    stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const [genOut, genErr] = await Promise.all([new Response(genProc.stdout).text(), new Response(genProc.stderr).text()]);
  const genExit = await genProc.exited;
  if (genExit !== 0) throw new Error(`_scripts/gen.mjs exited ${genExit}: ${genErr}`);
  if (!genOut.includes("wrote blog.html and feed.xml")) throw new Error(`gen.mjs did not report success: ${genOut}`);

  const after = readTree(srcDir);
  for (const rel of before.keys()) {
    if (!after.has(rel)) throw new Error(`running _scripts/gen.mjs lost a scaffold file: ${rel}`);
  }
  for (const rel of after.keys()) {
    if (!before.has(rel)) throw new Error(`running _scripts/gen.mjs wrote a file the scaffold does not ship: ${rel}`);
  }
  for (const [rel, bytes] of before) {
    if (!bytes.equals(after.get(rel))) {
      throw new Error(`running _scripts/gen.mjs changed ${rel} — the checked-in copy is stale or the script is not deterministic:\n--- checked-in ---\n${bytes}\n--- regenerated ---\n${after.get(rel)}`);
    }
  }

  // Both generated files carry the hand-edit guard, naming the data as the
  // thing to edit.
  const marker = "generated by _scripts/gen.mjs — edit the data, not this file";
  for (const generatedPath of [blogHtmlPath, feedXmlPath]) {
    if (!readFileSync(generatedPath, "utf8").includes(marker)) {
      throw new Error(`${generatedPath} is missing the "${marker}" marker`);
    }
  }

  // The scaffold must build clean with the regenerated files too — no
  // intervening step was needed (they matched exactly), so this doubles as
  // reassurance that SCF-04's guarantee didn't depend on the pre-generated
  // copies being special-cased somehow.
  const dryRunR = await runCli(["build", "--dry-run", "--strict"], tmp);
  if (dryRunR.exit !== 0) throw new Error(`unify build --dry-run --strict exited ${dryRunR.exit} after regenerating blog.html/feed.xml: ${dryRunR.stderr}`);

  // SCF-05's outcome, on a real build: the public field flowed into the
  // built index (the data was used, not ignored) and the private field's
  // exact value appears in NO published file. Exact value, not its domain —
  // the contact page legitimately ships a different @example.com address,
  // and a domain-level grep once turned a 0/6 leak into a phantom 5/6
  // (_notes/ratification-rounds-7-20.md, round 19's judging traps).
  const buildR = await runCli(["build"], tmp);
  if (buildR.exit !== 0) throw new Error(`unify build (real) exited ${buildR.exit}: ${buildR.stderr}`);
  const distDir = join(tmp, "dist");
  if (existsSync(join(distDir, "_data"))) throw new Error("dist/_data shipped — the underscore exclusion failed");
  if (!readFileSync(join(distDir, "blog.html"), "utf8").includes(publicName)) {
    throw new Error(`built blog.html does not carry the author's public name "${publicName}" — the generator did not use the data file`);
  }
  for (const [rel, bytes] of readTree(distDir)) {
    if (bytes.includes(privateEmail)) {
      throw new Error(`the private field "${privateEmail}" from _data/authors.json shipped in dist/${rel} — the generator leaked a field the exclusion rules cannot protect`);
    }
  }

  covers("SCF-03", "SCF-05");
}, TEST_MS);
