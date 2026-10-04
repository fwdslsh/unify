/**
 * §19 scaffold contract — SCF-01..11 — plus DIA-10, the advisory-discipline
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
 * byte-identical to a fresh run of `scripts/gen.mjs`, and the private field
 * in `_data/authors.json` must appear nowhere in the built output.
 *
 * SCF-06..SCF-11 follow, in the file's second half: §19.2's discovery set,
 * §19.3's audit guarantee, §19.4's project-root placement, §19.5's bytes, and
 * §19.7's placeholder discipline. Every one of them reads the tree a real
 * `unify build` emitted, never the template source — §19.2's properties are
 * properties of what a crawler receives, and most of them are supplied by the
 * layout or by §8's merge rather than written on the page that ships them.
 */
import { test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { CLI, ROOT, covers, mkTmp, runCli } from "./support.mjs";

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

    const srcDir = join(tmp, "site");
    if (!existsSync(srcDir)) throw new Error(`unify init ${name} did not scaffold into site/`);

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

    // ---- SCF-09: AGENTS.md and DEPLOY.md at the PROJECT ROOT — the working
    // directory `unify init` ran in — and outside the source root, so that
    // neither can publish (§19.4). -----------------------------------------
    for (const rootFile of ["AGENTS.md", "DEPLOY.md"]) {
      if (!existsSync(join(tmp, rootFile))) {
        throw new Error(`unify init ${name} did not write ${rootFile} at the project root (${tmp})`);
      }
      if (existsSync(join(srcDir, rootFile))) {
        throw new Error(`${rootFile} landed inside the source root — a .md file there is a page and would publish`);
      }
    }
    const agentsMd = readFileSync(join(tmp, "AGENTS.md"), "utf8");
    // The high-conflict rules §19.4 enumerates, by the token an author greps
    // for. The rule set is the author-facing documents' — this asserts the
    // guide repeats them, not that it invents a variant.
    for (const rule of ["data-layout", "--base-url", "draft", "permalink", "slug", "<include", "schema", "unify audit", "--dry-run"]) {
      if (!agentsMd.includes(rule)) throw new Error(`AGENTS.md never mentions ${rule} — §19.4 lists it among the rules it repeats`);
    }
    const deployMd = readFileSync(join(tmp, "DEPLOY.md"), "utf8");
    // §19.2 items 4 and 7 both defer here: the two commands that carry the
    // site's address are the last thing the file says.
    const deployTail = deployMd.trimEnd().split("\n").slice(-2).join("\n");
    // The address alone completes canonicals (§22.1: auto is the default under --base-url).
    if (!/unify build .*--base-url \S+/.test(deployTail)) {
      throw new Error(`DEPLOY.md does not end in the build command carrying the site's address:\n${deployTail}`);
    }
    if (deployTail.split("\n")[1].trim() === "") {
      throw new Error(`DEPLOY.md's build command is not followed by a publish step:\n${deployTail}`);
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
    // SCF-09's other half: outside the source root means it cannot publish.
    for (const rootFile of ["AGENTS.md", "DEPLOY.md"]) {
      if (existsSync(join(distDir, rootFile))) throw new Error(`${rootFile} published to dist/ — §19.4 puts it outside the source root exactly so it cannot`);
    }

    covers("SCF-01", "SCF-02", "SCF-04", "SCF-09", "DIA-10");
  }, TEST_MS);
}

test("scaffold: SCF-10 — the share image scaffolds as raw bytes, and its own IHDR is what the layout declares", async () => {
  // §19.5: a template file's content may be a string OR raw bytes, for
  // exactly one reason — §19.2 item 4 requires a real share image with real
  // dimensions, and every raster format is binary. Two things are proved
  // here at once: the bytes survived (a string write would have replaced
  // 0x89 with the UTF-8 replacement character before the signature ever got
  // to disk), and the numbers the layout declares are the ones the file
  // itself states. A declared dimension that does not match the file is the
  // invented claim product-spec §6.1 forbids, in the one place nothing else
  // would ever catch it.
  for (const name of TEMPLATES) {
    const tmp = mkTmp();
    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);

    const imagePath = join(tmp, "site", "assets", "share-placeholder.png");
    if (!existsSync(imagePath)) throw new Error(`${name} ships no share image at site/assets/share-placeholder.png`);
    const png = readFileSync(imagePath);

    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const [i, byte] of signature.entries()) {
      if (png[i] !== byte) {
        throw new Error(`share image byte ${i} is 0x${png[i]?.toString(16)}, not 0x${byte.toString(16)} — the file did not scaffold as raw bytes`);
      }
    }
    if (png.subarray(12, 16).toString("latin1") !== "IHDR") throw new Error("share image's first chunk is not IHDR");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);

    const layoutText = readFileSync(join(tmp, "site", "_layout.html"), "utf8");
    if (!layoutText.includes('content="/assets/share-placeholder.png"')) {
      throw new Error(`${name}'s layout declares no og:image naming the shipped file:\n${layoutText}`);
    }
    for (const [property, value] of [["og:image:width", width], ["og:image:height", height]]) {
      if (!layoutText.includes(`<meta property="${property}" content="${value}">`)) {
        throw new Error(`${name}'s layout does not declare ${property} as ${value} — the value the shipped PNG's IHDR states`);
      }
    }
  }

  covers("SCF-10");
}, TEST_MS);

test("scaffold: SCF-09 — the project-root files participate in init's refusal; nothing is written", async () => {
  // §19.4: "Both participate in the existing refusal: init writes nothing
  // when any file it would create already exists." An AGENTS.md the author
  // wrote themselves is exactly the file that must not be overwritten.
  const tmp = mkTmp();
  writeFileSync(join(tmp, "AGENTS.md"), "# my own guidance\n");

  const r = await runCli(["init", "blog"], tmp);
  if (r.exit !== 2) throw new Error(`unify init with an existing AGENTS.md exited ${r.exit}, expected the usage refusal (2)\nstderr:\n${r.stderr}`);
  if (readFileSync(join(tmp, "AGENTS.md"), "utf8") !== "# my own guidance\n") throw new Error("init overwrote the author's AGENTS.md");
  if (existsSync(join(tmp, "site"))) throw new Error("init refused but still created site/ — the refusal must write nothing at all");
  if (existsSync(join(tmp, "DEPLOY.md"))) throw new Error("init refused but still wrote DEPLOY.md");

  covers("SCF-09");
}, TEST_MS);

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

test("scaffold/blog: SCF-03 — the scaffold's one shown command is `unify build`, and unify.yaml names the generator so it runs it", async () => {
  // §19.6: "a single shown literal is a copied literal", and product-spec §6.7
  // makes examples executable few-shot material. Before 0.10 the scaffold
  // showed `node scripts/gen.mjs && unify build` in five places and the
  // generator wrote blog.html/feed.xml into the source tree; now unify.yaml
  // names it (`generate: scripts/gen.mjs`), unify runs it before every build,
  // and the one command a reader copies anywhere is the bare build. So the
  // rule this pins: no file of the scaffold tells a reader to run the
  // generator by hand, the saved key resolves from the project root, and a
  // bare build from there publishes the derived pages without writing a byte
  // into site/.
  const tmp = mkTmp();
  const initR = await runCli(["init", "blog"], tmp);
  if (initR.exit !== 0) throw new Error(`unify init blog exited ${initR.exit}: ${initR.stderr}`);

  for (const rel of ["AGENTS.md", "DEPLOY.md", "site/index.html", "site/posts/hello-world.md", "scripts/gen.mjs"]) {
    const text = readFileSync(join(tmp, ...rel.split("/")), "utf8");
    if (/node\s+\S*gen\.mjs\s+&(?:amp;)?&/.test(text)) throw new Error(`${rel} still shows the pre-0.10 \`node …/gen.mjs && unify build\` recipe; the generator runs through unify.yaml now`);
  }
  const yaml = readFileSync(join(tmp, "unify.yaml"), "utf8");
  const live = yaml.split("\n").filter((l) => /^[a-z]/.test(l));
  if (live.join("|") !== "generate: scripts/gen.mjs") throw new Error(`unify.yaml's live lines should be exactly generate: scripts/gen.mjs, got: ${live.join(" | ")}`);
  if (!existsSync(join(tmp, "scripts", "gen.mjs"))) throw new Error("generate: scripts/gen.mjs names a file that does not exist from the project root");

  const buildR = await runCli(["build"], tmp);
  if (buildR.exit !== 0) throw new Error(`unify build exited ${buildR.exit}: ${buildR.stderr}`);
  if (existsSync(join(tmp, "site", "dist"))) throw new Error("the build wrote site/dist/ — the recipe was run from the wrong root");
  for (const derived of ["blog.html", "feed.xml"]) {
    if (!existsSync(join(tmp, "dist", derived))) throw new Error(`dist/${derived} is missing after a bare unify build — the generator did not run`);
    if (existsSync(join(tmp, "site", derived))) throw new Error(`site/${derived} exists — the generator wrote into the source tree instead of the overlay`);
  }
  if (existsSync(join(tmp, "dist", "dist"))) throw new Error("dist/dist/ exists — a nested build output was published as content");

  covers("SCF-03");
}, TEST_MS);

test("scaffold/blog: SCF-03 — two builds are byte-identical and the generator writes nothing into site/; SCF-05 — the private field never leaves _data/", async () => {
  const tmp = mkTmp();
  const initR = await runCli(["init", "blog"], tmp);
  if (initR.exit !== 0) throw new Error(`unify init blog exited ${initR.exit}: ${initR.stderr}`);

  const srcDir = join(tmp, "site");
  const scriptPath = join(tmp, "scripts", "gen.mjs");
  if (!existsSync(scriptPath)) throw new Error("blog template is missing scripts/gen.mjs");

  // Zero dependencies: every import is a node: builtin.
  const scriptText = readFileSync(scriptPath, "utf8");
  const importLines = scriptText.split("\n").filter((l) => /^\s*import\b/.test(l));
  if (importLines.length === 0 || importLines.some((l) => !/from\s+["']node:/.test(l))) {
    throw new Error(`scripts/gen.mjs should import only node: builtins, got:\n${importLines.join("\n")}`);
  }

  // The seam, spelled exactly as docs/authoring-rules.md spells it — the
  // scaffold and the doc must agree, because a rule that shows exactly one
  // literal will have that literal copied (docs/ratification.md §6).
  if (!scriptText.includes("generate: scripts/gen.mjs")) {
    throw new Error(`scripts/gen.mjs's opening comment must name the authoring rules' literal "generate: scripts/gen.mjs":\n${scriptText.split("\n").slice(0, 6).join("\n")}`);
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

  // Nothing pre-generated ships: the derived files exist only in the overlay.
  for (const derived of ["blog.html", "feed.xml"]) {
    if (existsSync(join(srcDir, derived))) throw new Error(`the scaffold ships site/${derived}; since 0.10 the generator writes it into the overlay on every build`);
  }

  // Determinism and a clean source tree: snapshot site/, build twice, and
  // require site/ untouched and the two dist/ trees byte-identical.
  const before = readTree(srcDir);
  const first = await runCli(["build", "-o", "dist"], tmp);
  if (first.exit !== 0) throw new Error(`unify build exited ${first.exit}: ${first.stderr}`);
  if (!first.stdout.includes("wrote blog.html and feed.xml")) throw new Error(`gen.mjs did not report success in the build output:\n${first.stdout}`);
  const second = await runCli(["build", "-o", "dist2"], tmp);
  if (second.exit !== 0) throw new Error(`second unify build exited ${second.exit}: ${second.stderr}`);
  const after = readTree(srcDir);
  if (after.size !== before.size || [...before].some(([rel, bytes]) => !after.has(rel) || !bytes.equals(after.get(rel)))) {
    throw new Error("building the blog scaffold changed site/ — the generator must write only into the overlay");
  }
  const distA = readTree(join(tmp, "dist"));
  const distB = readTree(join(tmp, "dist2"));
  if (distA.size !== distB.size || [...distA].some(([rel, bytes]) => !distB.has(rel) || !bytes.equals(distB.get(rel)))) {
    throw new Error("two builds of the blog scaffold differ — the generator is not deterministic");
  }

  // Both generated files carry the hand-edit guard, naming the data as the
  // thing to edit.
  const marker = "generated by scripts/gen.mjs — edit the data, not this file";
  for (const derived of ["blog.html", "feed.xml"]) {
    if (!readFileSync(join(tmp, "dist", derived), "utf8").includes(marker)) {
      throw new Error(`dist/${derived} is missing the "${marker}" marker`);
    }
  }

  // The dry run exits 0 as well — the generator runs there too (§33.1).
  const dryRunR = await runCli(["build", "--dry-run", "--strict"], tmp);
  if (dryRunR.exit !== 0) throw new Error(`unify build --dry-run --strict exited ${dryRunR.exit}: ${dryRunR.stderr}`);

  // SCF-05's outcome, on a real build: the public field flowed into the
  // built index (the data was used, not ignored) and the private field's
  // exact value appears in NO published file. Exact value, not its domain —
  // the contact page legitimately ships a different @example.com address,
  // and a domain-level grep once turned a 0/6 leak into a phantom 5/6
  // (_notes/ratification-rounds-7-20.md, round 19's judging traps).
  const distDir = join(tmp, "dist");
  if (existsSync(join(distDir, "_data"))) throw new Error("dist/_data shipped — the underscore exclusion failed");
  if (!readFileSync(join(distDir, "blog.html"), "utf8").includes(publicName)) {
    throw new Error(`built blog.html does not carry the author's public name "${publicName}" — the generator did not use the data file`);
  }
  for (const [rel, bytes] of distA) {
    if (bytes.includes(privateEmail)) {
      throw new Error(`the private field "${privateEmail}" from _data/authors.json shipped in dist/${rel} — the generator leaked a field the exclusion rules cannot protect`);
    }
  }

  covers("SCF-03", "SCF-05");
}, TEST_MS);

// ---------------------------------------------------------------------------
// SCF-06 .. SCF-11 — §19.2's discovery set, §19.4's placement, §19.5's bytes,
// and §19.7's discipline.
//
// Everything below reads the EMITTED tree, for §20.2's reason: every property
// §19.2 states is a property of what a crawler receives, and most of them are
// supplied by a layout or by §8's merge rather than written on the page that
// ships them. A check that read `src/` would be a second interpretation of the
// site — the thing product-spec §6.2 exists to prevent — and would pass on a
// template whose layout stopped composing.
//
// The readers below are small and local because a behavior test may not import
// the parser under test (hygiene H3). Their two simplifying assumptions are
// CHECKED rather than assumed, in assertRegexReadable(): no emitted page
// carries a `<template>` (whose contents §20.2 does not scan) and none nests a
// comment opener inside a script, so stripping comments and matching tags with
// a regex reads the same document §20.3 would.
// ---------------------------------------------------------------------------

/** HTML comments declare nothing (§20.3: "Comments contribute nothing"), and
 *  the scaffolded layout's own explanatory comment quotes both `<slot>` and
 *  `<script type="application/ld+json">` — so a reader that kept comments
 *  would count two JSON-LD blocks on every composed page and find a slot in
 *  output that has none. */
function stripComments(html) {
  return html.split(/<!--[\s\S]*?-->/).join("");
}

const NAMED_REFS = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** §20.3: "Character data" means the text a reader sees. §10.1's converter
 *  escapes `&`, `<`, `>` and `"` on every Markdown page, so a reader that
 *  skipped this would compare markup instead of text. */
function decodeRefs(text) {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_REFS[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** One field's value, whitespace-collapsed (§20.3) and case-folded (§24.4).
 *  Narrow and stated, per hygiene H5: this normalizes ONE string field before
 *  comparing it to another string field, exactly as §24.4's duplicate and
 *  containment rules define. It is not tree comparison — this file compares no
 *  trees, and compare.mjs remains the only comparator that does. */
function fold(value) {
  return decodeRefs(value).split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

/** Text content of a fragment: tags removed, references resolved, whitespace
 *  collapsed (§20.3's "Text content" paragraph). */
function textOf(fragment) {
  return decodeRefs(fragment.split(/<[^>]*>/).join(" ")).split(/\s+/).filter(Boolean).join(" ");
}

/** Every attribute of one start tag, as a plain object. */
function attrsOf(tagBody) {
  const out = {};
  for (const m of tagBody.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = m[2];
  return out;
}

/** Every `<meta>` in a comment-stripped document, in document order. */
function metasOf(html) {
  return [...html.matchAll(/<meta\b([^>]*)>/gi)].map((m) => attrsOf(m[1]));
}

/** Every `<link>` in a comment-stripped document, in document order. */
function linksOf(html) {
  return [...html.matchAll(/<link\b([^>]*)>/gi)].map((m) => attrsOf(m[1]));
}

function metaByName(html, name) {
  return metasOf(html).filter((a) => a.name?.toLowerCase() === name.toLowerCase()).map((a) => a.content ?? "");
}

function metaByProperty(html, property) {
  return metasOf(html).filter((a) => a.property?.toLowerCase() === property.toLowerCase()).map((a) => a.content ?? "");
}

/** Every `<script type="application/ld+json">` payload, in document order. */
function jsonLdOf(html) {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}

/** The emitted HTML pages of a built tree: `{rel, raw, html}`, sorted by path. */
function emittedPages(distDir) {
  return findHtmlFiles(distDir)
    .map((abs) => {
      const raw = readFileSync(abs, "utf8");
      return { rel: relative(distDir, abs).split(sep).join("/"), raw, html: stripComments(raw) };
    })
    .sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

/** The two constructs that would make the regex reading above wrong, refused
 *  rather than assumed away. `<template>` contents are inert (§20.2 does not
 *  scan them, §7 never fills a slot inside one), so a template ANYWHERE in a
 *  scaffold would mean these readers count declarations §20.3 does not; and a
 *  comment opener inside a script would make stripComments() eat live markup. */
function assertRegexReadable(page, label) {
  if (/<template[\s>]/i.test(page.raw)) {
    throw new Error(`${label}: ${page.rel} emits a <template> — §20.2 does not scan its contents, so this test's reader would over-count. Read it with a parser or drop the template.`);
  }
  for (const script of [...page.raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]) {
    if (script[1].includes("<!--")) throw new Error(`${label}: ${page.rel} nests a comment opener inside a <script> — this test's comment stripper would eat live markup`);
  }
}

/** PNG signature + IHDR, read from the bytes rather than trusted. */
function pngHeader(bytes, label) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const [i, byte] of signature.entries()) {
    if (bytes[i] !== byte) throw new Error(`${label}: byte ${i} is 0x${bytes[i]?.toString(16)}, not 0x${byte.toString(16)} — this is not PNG`);
  }
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") throw new Error(`${label}: first chunk is not IHDR`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colourType: bytes[25] };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** What a JavaScript value that was never supplied looks like once a template
 *  literal has interpolated it. None of these is prose, and none of them is
 *  distinguishable from prose to §24.4, which only asks whether a field is
 *  present, non-empty and unlike its neighbours'. */
const ABSENT_ARGUMENT_SPELLINGS = ["undefined", "null", "nan", "[object object]"];

// ---- SCF-06 -----------------------------------------------------------------

for (const name of TEMPLATES) {
  test(`scaffold/${name}: SCF-06 — the discovery set, read back out of the built tree`, async () => {
    const tmp = mkTmp();
    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);
    const buildR = await runCli(["build"], tmp);
    if (buildR.exit !== 0) throw new Error(`unify build exited ${buildR.exit} for template "${name}": ${buildR.stderr}`);

    const distDir = join(tmp, "dist");
    const pages = emittedPages(distDir);
    if (pages.length < 2) throw new Error(`${name} emitted ${pages.length} page(s) — too few for "unique across the template" to mean anything`);
    for (const page of pages) assertRegexReadable(page, `SCF-06/${name}`);

    // §19.2 item 4's share image, read from the file the build shipped rather
    // than from the template source: this is the ONE property nothing else in
    // the pipeline can catch, because a wrong number resolves, publishes, and
    // is only ever read by a crawler.
    const imagePath = join(distDir, "assets", "share-placeholder.png");
    if (!existsSync(imagePath)) throw new Error(`${name} published no share image at dist/assets/share-placeholder.png`);
    const realImage = pngHeader(readFileSync(imagePath), `SCF-06/${name} dist/assets/share-placeholder.png`);

    const titles = new Map();
    const descriptions = new Map();

    for (const { rel, html } of pages) {
      const where = `${name}: dist/${rel}`;

      // 1. <html lang> on EVERY emitted page.
      const lang = html.match(/<html\b([^>]*)>/i);
      if (!lang || !attrsOf(lang[1]).lang?.trim()) throw new Error(`${where}: <html> carries no non-empty lang attribute (§19.2 item 1)`);

      // 2. A title and a description, both present and both unique.
      const titleText = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      if (!titleText || !fold(titleText)) throw new Error(`${where}: no non-empty <title> (§19.2 item 2)`);
      if (titles.has(fold(titleText))) throw new Error(`${where}: its title repeats dist/${titles.get(fold(titleText))}'s — §24.4's title-duplicate, which §19.3's audit gate forbids in a scaffold: ${textOf(titleText)}`);
      titles.set(fold(titleText), rel);

      const descriptions_ = metaByName(html, "description").filter((v) => v.trim());
      if (descriptions_.length === 0) throw new Error(`${where}: the emitted <head> declares no non-empty <meta name="description"> (§19.2 item 2)`);
      const description = descriptions_[0];
      if (descriptions.has(fold(description))) throw new Error(`${where}: its description repeats dist/${descriptions.get(fold(description))}'s — a layout-wide description would do this on every page: ${description}`);
      descriptions.set(fold(description), rel);

      // 3. Exactly one <h1>.
      const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => textOf(m[1]));
      if (h1s.length !== 1) throw new Error(`${where}: ${h1s.length} <h1> elements, expected exactly one (§19.2 item 3): ${JSON.stringify(h1s)}`);

      // 4. The og: set, and the two dimensions against the shipped file.
      for (const property of ["og:title", "og:description", "og:type", "og:image", "og:image:width", "og:image:height"]) {
        if (metaByProperty(html, property).filter((v) => v.trim()).length === 0) {
          throw new Error(`${where}: no <meta property="${property}"> with a value (§19.2 item 4)`);
        }
      }
      const imageUrl = metaByProperty(html, "og:image")[0];
      if (!imageUrl.startsWith("/")) throw new Error(`${where}: og:image is ${JSON.stringify(imageUrl)} — the scaffold's share image is its own file, so the value must be root-relative and checkable`);
      const declaredTarget = join(distDir, ...imageUrl.slice(1).split("/"));
      if (!existsSync(declaredTarget)) throw new Error(`${where}: og:image names ${imageUrl}, which this build did not emit`);
      const declaredWidth = metaByProperty(html, "og:image:width")[0];
      const declaredHeight = metaByProperty(html, "og:image:height")[0];
      const shipped = pngHeader(readFileSync(declaredTarget), `${where} ${imageUrl}`);
      if (Number(declaredWidth) !== shipped.width || Number(declaredHeight) !== shipped.height) {
        throw new Error(
          `${where}: declares og:image:width=${declaredWidth} og:image:height=${declaredHeight} for ${imageUrl}, whose own IHDR says ` +
          `${shipped.width}x${shipped.height}. §19.2 item 4: a declared dimension that does not match the file is the invented claim ` +
          `product-spec §6.1 forbids, in the one place nothing else would ever catch it.`,
        );
      }
      if (shipped.width !== realImage.width || shipped.height !== realImage.height) {
        throw new Error(`${where}: og:image names a second image (${shipped.width}x${shipped.height}) — this test reads dimensions per page, but the template ships one card`);
      }

      // A template-construction slip has one signature in the emitted bytes,
      // and §24.4 cannot see it: a field built from an argument its caller
      // omitted ships the string "undefined", which is present, non-empty and
      // unique — so `description-missing` stays silent and the page ships a
      // description nobody wrote. Not hypothetical: dropping `description:`
      // from one `pageHtml()` call emits `content="undefined"` on the page, in
      // its `og:description`, and inside its generated JSON-LD, and every
      // other check in this file stays green.
      const declared = [
        ["<title>", textOf(titleText)],
        ["description", description],
        ...["og:title", "og:description", "og:type", "og:image"].map((property) => [property, metaByProperty(html, property)[0]]),
        ...["author", "date"].map((metaName) => [metaName, metaByName(html, metaName)[0]]),
      ];
      for (const [field, value] of declared) {
        if (value !== undefined && ABSENT_ARGUMENT_SPELLINGS.includes(fold(value))) {
          throw new Error(`${where}: ${field} is ${JSON.stringify(value)} — the spelling a field built from an absent argument takes, which every other check in the pipeline reads as a present, unique value`);
        }
      }

      // 6. Structured data: every declaration §26.4 accepts, and nothing else.
      //    §19.2 item 6 is conditional ("by whichever of §26's two routes
      //    fits"), so this does NOT require a block on every page — 404.html
      //    declares `noindex` and deliberately declares no type, and
      //    generating an entity describing a page nobody should index is not
      //    a route that fits. What is required of every declaration that DOES
      //    exist is checked here, and that the template ships some, below.
      for (const declared of metaByName(html, "schema")) {
        if (!["WebPage", "Article", "BlogPosting"].includes(declared)) {
          throw new Error(`${where}: declares schema ${JSON.stringify(declared)} — §26.4's accepted values are exactly WebPage, Article, BlogPosting, case-sensitively (anything else is P23)`);
        }
        if (declared === "Article" || declared === "BlogPosting") {
          const authored = [...metaByName(html, "date"), ...metaByProperty(html, "article:published_time")].filter((v) => v.trim());
          if (authored.length === 0) {
            throw new Error(`${where}: declares ${declared} and authors no date — §24.4's schema-incomplete fires, and §20.10 will not invent one`);
          }
          if (!/^\d{4}(-\d{2}(-\d{2}([T ].+)?)?)?$/.test(authored[0])) {
            throw new Error(`${where}: declares ${declared} with the date ${JSON.stringify(authored[0])}, which is not W3C-DTF — §24.4's date-unusable`);
          }
        }
      }
      for (const [i, payload] of jsonLdOf(html).entries()) {
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch (e) {
          throw new Error(`${where}: JSON-LD block ${i} does not parse (§24.4's jsonld-invalid): ${e.message}\n${payload}`);
        }
        if (parsed["@context"] !== "https://schema.org") throw new Error(`${where}: JSON-LD block ${i} declares @context ${JSON.stringify(parsed["@context"])}, not https://schema.org (§26.6)`);
        if (!parsed["@type"]) throw new Error(`${where}: JSON-LD block ${i} declares no @type`);
      }
    }

    // §19.2 item 6 requires the template to ship structured data at all —
    // "appropriate authored or bounded JSON-LD" in product-spec §6.3.7's list.
    const pagesWithJsonLd = pages.filter((p) => jsonLdOf(p.html).length > 0);
    if (pagesWithJsonLd.length === 0) throw new Error(`${name} ships no structured data on any emitted page (§19.2 item 6)`);

    // 5. robots.txt at the output root, minimal and blocking nothing. unify
    //    never decides what a site should block (§23), and a scaffold knows
    //    even less, so a Disallow with a value would be the scaffold deciding.
    const robotsPath = join(distDir, "robots.txt");
    if (!existsSync(robotsPath)) throw new Error(`${name} published no robots.txt (§19.2 item 5)`);
    if (!existsSync(join(tmp, "site", "robots.txt"))) throw new Error(`${name}'s robots.txt is not at the SOURCE root — §19.2 item 5 puts it there, to be edited`);
    const robotsLines = readFileSync(robotsPath, "utf8").split("\n").filter((l) => l.trim() && !l.trimStart().startsWith("#"));
    if (!robotsLines.some((l) => /^\s*user-agent\s*:/i.test(l))) throw new Error(`${name}'s robots.txt declares no User-agent record:\n${robotsLines.join("\n")}`);
    for (const line of robotsLines) {
      const disallow = line.match(/^\s*disallow\s*:\s*(.*)$/i);
      if (disallow && disallow[1].trim() !== "") {
        throw new Error(`${name}'s robots.txt blocks ${JSON.stringify(disallow[1].trim())} — §19.2 item 5: a scaffolded file blocks nothing and exists to be edited`);
      }
    }

    covers("SCF-06");
  }, TEST_MS);
}

// ---- SCF-07 -----------------------------------------------------------------

for (const name of TEMPLATES) {
  test(`scaffold/${name}: SCF-07 — no canonical anywhere, and no Sitemap: line the build does not honour`, async () => {
    const tmp = mkTmp();
    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);
    const buildR = await runCli(["build"], tmp);
    if (buildR.exit !== 0) throw new Error(`unify build exited ${buildR.exit} for template "${name}": ${buildR.stderr}`);
    const distDir = join(tmp, "dist");

    // A canonical is one page's own absolute address (§22.1), which a scaffold
    // cannot know: a placeholder domain written into one would be a false
    // claim on every page that shipped it.
    for (const { rel, html } of emittedPages(distDir)) {
      const canonicals = linksOf(html).filter((a) => a.rel?.toLowerCase() === "canonical");
      if (canonicals.length > 0) {
        throw new Error(`${name}: dist/${rel} ships rel="canonical" href=${JSON.stringify(canonicals[0].href)} — §19.2 item 7 forbids it; the address lives in DEPLOY.md's --base-url instead, which completes them`);
      }
    }

    // §19.2 item 5's second half. §23.2 makes a `#` line a comment, so a
    // commented example teaches the line without declaring it; what must not
    // exist is a LIVE Sitemap: record, because §23.3 exempts the two generated
    // names without --base-url and §24.4 then reports the exemption as
    // robots-sitemap-missing — a finding in a fresh scaffold.
    const robotsText = readFileSync(join(distDir, "robots.txt"), "utf8");
    for (const [i, line] of robotsText.split("\n").entries()) {
      if (/^\s*sitemap\s*:/i.test(line)) {
        throw new Error(`${name}'s robots.txt line ${i + 1} declares a live Sitemap: record — ${JSON.stringify(line)}. Without --base-url no sitemap is written, so §23.3 exempts it and §24.4's robots-sitemap-missing lands in the fresh scaffold.`);
      }
    }

    // The absence above is a template decision, not a pipeline that cannot
    // emit one: the same tree under DEPLOY.md's own recipe DOES get canonicals
    // (§22), which is what makes "no canonical" a claim rather than a vacuum.
    const canonR = await runCli(["build", "-o", "dist-canonical", "--base-url", "https://you.example/"], tmp);
    if (canonR.exit !== 0) throw new Error(`unify build --base-url exited ${canonR.exit} for "${name}": ${canonR.stderr}`);
    const completed = emittedPages(join(tmp, "dist-canonical")).filter(({ html }) => linksOf(html).some((a) => a.rel?.toLowerCase() === "canonical"));
    if (completed.length === 0) {
      throw new Error(`${name}: --base-url completed no canonical at all, so the "no canonical" assertion above proves nothing about the template`);
    }

    covers("SCF-07");
  }, TEST_MS);
}

// ---- SCF-08 -----------------------------------------------------------------

for (const name of TEMPLATES) {
  test(`scaffold/${name}: SCF-08 — unify init && unify audit --strict exits 0, with no --base-url`, async () => {
    // §19.3's second guarantee, and the stronger of the two: --strict gates on
    // ANY finding of either severity (§24.6), so this passes only with a
    // title, a description, a heading, a language, a share image with
    // dimensions, no orphan page, no duplicate id and no contradiction
    // anywhere in the template. No --base-url — the state a scaffold is in one
    // second after it is created.
    const tmp = mkTmp();
    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);

    const audit = await runCli(["audit", "--strict"], tmp);

    // The exit code alone is not the claim: a template that emitted findings
    // and exited 0 would pass an exit-code-only test, and so would a command
    // that had silently stopped evaluating. §24.5 fixes both the finding lines
    // and the count line, so both are read.
    const findingLines = audit.stdout.split("\n").filter((l) => /:\s(?:broken|incomplete):\s/.test(l));
    if (findingLines.length > 0) {
      throw new Error(`unify audit --strict reported ${findingLines.length} finding(s) on a fresh "${name}" scaffold:\n${findingLines.join("\n")}`);
    }
    if (!audit.stdout.includes("audit: nothing to report")) {
      throw new Error(`unify audit --strict did not print §24.5's "audit: nothing to report" for "${name}":\nstdout:\n${audit.stdout}\nstderr:\n${audit.stderr}`);
    }
    if (audit.exit !== 0) {
      throw new Error(`unify audit --strict exited ${audit.exit} for "${name}" (§19.3 requires 0)\nstdout:\n${audit.stdout}\nstderr:\n${audit.stderr}`);
    }

    covers("SCF-08");
  }, TEST_MS);
}

test("scaffold: SCF-08 — the audit that clears a scaffold is the one that fails an incomplete page", async () => {
  // The guarantee above is only worth having if the command behind it still
  // fires. One added page — no description, no heading, nothing linking to it
  // — must turn the clean scaffold into findings and exit 1, on the same
  // command line that reported nothing a moment earlier. Note what the layout
  // still supplies: the page inherits `lang` and a title, so the findings this
  // produces are exactly the ones the PAGE is missing.
  const tmp = mkTmp();
  const initR = await runCli(["init", "default"], tmp);
  if (initR.exit !== 0) throw new Error(`unify init default exited ${initR.exit}: ${initR.stderr}`);

  const clean = await runCli(["audit", "--strict"], tmp);
  if (clean.exit !== 0) throw new Error(`the unmodified scaffold did not audit clean: exit ${clean.exit}\n${clean.stdout}`);

  writeFileSync(join(tmp, "site", "stray.html"), "<!doctype html>\n<html>\n  <body>\n    <p>Nothing links here and this page names nothing.</p>\n  </body>\n</html>\n");

  const dirty = await runCli(["audit", "--strict"], tmp);
  if (dirty.exit !== 1) throw new Error(`unify audit --strict exited ${dirty.exit} on a scaffold carrying an incomplete page, expected 1 (§24.6)\nstdout:\n${dirty.stdout}`);
  for (const id of ["description-missing", "h1-missing", "page-orphan"]) {
    if (!dirty.stdout.includes(`[${id}]`)) throw new Error(`unify audit --strict did not report ${id} for site/stray.html — the guarantee above rests on this command evaluating\nstdout:\n${dirty.stdout}`);
  }
  if (!/^audit: \d+ broken, \d+ incomplete$/m.test(dirty.stdout)) {
    throw new Error(`unify audit printed no §24.5 count line:\n${dirty.stdout}`);
  }

  covers("SCF-08");
}, TEST_MS);

// ---- SCF-09 -----------------------------------------------------------------

test("scaffold: SCF-09 — the project root is the working directory, in the fresh-project case and under an explicit --source", async () => {
  // §19.4 has one answer and it is not a guess. The fresh-project case is the
  // easy half; the explicit --source half is where an implementation is
  // tempted to infer a project root by walking up from the named tree, which
  // is the one thing a scaffolding command must never do.
  const fresh = mkTmp();
  const freshInit = await runCli(["init", "portfolio"], fresh);
  if (freshInit.exit !== 0) throw new Error(`unify init portfolio exited ${freshInit.exit}: ${freshInit.stderr}`);
  for (const rootFile of ["AGENTS.md", "DEPLOY.md"]) {
    if (!existsSync(join(fresh, rootFile))) throw new Error(`${rootFile} is not at the working directory unify init ran in`);
    if (existsSync(join(fresh, "site", rootFile))) throw new Error(`${rootFile} landed inside the source root — a .md file there is a page and would publish`);
  }
  const freshBuild = await runCli(["build"], fresh);
  if (freshBuild.exit !== 0) throw new Error(`unify build exited ${freshBuild.exit}: ${freshBuild.stderr}`);
  for (const rootFile of ["AGENTS.md", "DEPLOY.md"]) {
    if (existsSync(join(fresh, "dist", rootFile))) throw new Error(`${rootFile} published to dist/ — §19.4 puts it outside the source root exactly so it cannot`);
    if (existsSync(join(fresh, "dist", rootFile.replace(/\.md$/, ".html")))) throw new Error(`${rootFile} composed and published as a page — it is inside the source root`);
  }

  // --source names a directory two levels down, so "the parent of the source
  // root" and "the working directory" are different places and the rule is
  // falsifiable: the files land where the author was standing.
  const named = mkTmp();
  mkdirSync(join(named, "a", "b"), { recursive: true });
  const namedInit = await runCli(["init", "docs", "--source", "a/b"], named);
  if (namedInit.exit !== 0) throw new Error(`unify init docs --source a/b exited ${namedInit.exit}: ${namedInit.stderr}`);
  if (!existsSync(join(named, "a", "b", "_layout.html"))) throw new Error("unify init --source a/b did not scaffold into the directory it was given");
  if (existsSync(join(named, "a", "b", "site"))) throw new Error("an explicit --source must be the scaffold target itself, not a parent of a new src/");
  for (const rootFile of ["AGENTS.md", "DEPLOY.md"]) {
    if (!existsSync(join(named, rootFile))) throw new Error(`${rootFile} is not at the working directory — §19.4: they land where the author was standing`);
    if (existsSync(join(named, "a", "b", rootFile))) throw new Error(`${rootFile} landed inside the named source root, where it would publish`);
    if (existsSync(join(named, "a", rootFile))) throw new Error(`${rootFile} landed in the PARENT of the named source root — §19.4: unify does not infer a project root from --source, because walking to a parent would write outside the tree the author named`);
  }
  const namedBuild = await runCli(["build", "--source", "a/b"], named);
  if (namedBuild.exit !== 0) throw new Error(`unify build --source a/b exited ${namedBuild.exit}: ${namedBuild.stderr}`);
  for (const rootFile of ["AGENTS.md", "DEPLOY.md", "AGENTS.html", "DEPLOY.html"]) {
    if (existsSync(join(named, "dist", rootFile))) throw new Error(`${rootFile} reached dist/ from an explicit --source build`);
  }

  covers("SCF-09");
}, TEST_MS);

test("scaffold: SCF-09 — either project-root file already existing refuses the whole scaffold, under an explicit --source too", async () => {
  // §19.4: "Both participate in the existing refusal." The AGENTS.md case is
  // proved above with a defaulted source; this is the other file and the other
  // source mode, where the colliding path is not under the target directory at
  // all — the case an implementation that only checked its write target would
  // clobber.
  const tmp = mkTmp();
  mkdirSync(join(tmp, "site"), { recursive: true });
  writeFileSync(join(tmp, "DEPLOY.md"), "# how WE deploy\n");

  const r = await runCli(["init", "blog", "--source", "site"], tmp);
  if (r.exit !== 2) throw new Error(`unify init with an existing DEPLOY.md exited ${r.exit}, expected the usage refusal (2)\nstderr:\n${r.stderr}`);
  if (!r.stderr.includes("DEPLOY.md")) throw new Error(`the refusal does not name the file that collided:\n${r.stderr}`);
  if (readFileSync(join(tmp, "DEPLOY.md"), "utf8") !== "# how WE deploy\n") throw new Error("init overwrote the author's DEPLOY.md");
  if (existsSync(join(tmp, "AGENTS.md"))) throw new Error("init refused but still wrote AGENTS.md");
  if (readdirSync(join(tmp, "site")).length !== 0) throw new Error(`init refused but still wrote into the source root: ${readdirSync(join(tmp, "site")).join(", ")}`);

  covers("SCF-09");
}, TEST_MS);

test("scaffold: SCF-09 — init refuses, writing nothing, when the working directory is or is inside the source root", async () => {
  // §19.4's two halves — "outside the source root so that neither can publish"
  // and "written to the working directory the command ran in" — are jointly
  // unsatisfiable for exactly this shape of invocation, and the section now
  // says which way it resolves. Before the refusal existed, `init --source .`
  // scaffolded happily and the pair composed as pages: `dist/AGENTS.html` and
  // `dist/DEPLOY.html` shipped, and `unify audit --strict` exited 1 with
  // description-missing and page-orphan on each of them — §19.3's second
  // guarantee broken on a scaffold the author had not touched.
  //
  // `--source .` puts the two directories on top of each other; `--source ..`
  // is the sharper form, where the pair would land in a SUBDIRECTORY of the
  // source root and publish at `inner/AGENTS.html`.
  for (const [label, args, dir] of [
    ["--source .", ["init", "--source", "."], ""],
    ["--source ..", ["init", "basic", "--source", ".."], "inner"],
  ]) {
    const tmp = mkTmp();
    const cwd = dir ? join(tmp, dir) : tmp;
    if (dir) mkdirSync(cwd, { recursive: true });

    const r = await runCli(args, cwd);
    if (r.exit !== 2) throw new Error(`unify init ${label} exited ${r.exit}, expected the usage refusal (2)\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    if (!/source root/.test(r.stderr)) throw new Error(`the refusal does not name the collision it refused over:\n${r.stderr}`);
    for (const rootFile of ["AGENTS.md", "DEPLOY.md"]) {
      if (!r.stderr.includes(rootFile)) throw new Error(`the refusal does not name ${rootFile}, the file that would have published:\n${r.stderr}`);
    }
    if (!/fix:/.test(r.stderr)) throw new Error(`the refusal names no fix (§14.1):\n${r.stderr}`);

    // "Writes nothing" is the whole claim: not one scaffold file, and not the
    // project-root pair either.
    const left = readdirSync(tmp);
    const expected = dir ? [dir] : [];
    if (JSON.stringify(left.sort()) !== JSON.stringify(expected)) {
      throw new Error(`unify init ${label} refused but still wrote: ${left.join(", ")}`);
    }
    if (dir && readdirSync(cwd).length !== 0) throw new Error(`unify init ${label} refused but still wrote into ${dir}/: ${readdirSync(cwd).join(", ")}`);
  }

  covers("SCF-09");
}, TEST_MS);

test("scaffold: SCF-09 — a path the template needs as a directory, already a file, refuses before the first write", async () => {
  // "init writes nothing when any file it would create already exists" held
  // only for LEAF paths. A plain file where a template needs a directory —
  // `src/posts`, in the blog template — passed the leaf check, and the write
  // loop then died at mkdirSync with Node's own `EEXIST: file already exists`
  // AFTER nine template files had landed. The leaf check then saw those nine
  // and refused every later run, so the half-written scaffold was permanent.
  const tmp = mkTmp();
  mkdirSync(join(tmp, "src"), { recursive: true });
  writeFileSync(join(tmp, "src", "posts"), "not a directory\n");

  const r = await runCli(["init", "blog"], tmp);
  if (r.exit !== 2) throw new Error(`unify init blog exited ${r.exit} with src/posts a plain file, expected the usage refusal (2)\nstderr:\n${r.stderr}`);
  if (!r.stderr.includes("src/posts")) throw new Error(`the refusal does not name the path that blocked it:\n${r.stderr}`);
  if (/EEXIST|ENOTDIR/.test(r.stderr)) throw new Error(`the refusal is Node's raw error rather than a located unify diagnostic:\n${r.stderr}`);
  if (!/fix:/.test(r.stderr)) throw new Error(`the refusal names no fix (§14.1):\n${r.stderr}`);

  // Nothing written: the source root still holds only the file the test made,
  // and the project-root pair was never created either.
  if (JSON.stringify(readdirSync(join(tmp, "src")).sort()) !== JSON.stringify(["posts"])) {
    throw new Error(`init refused but still wrote into src/: ${readdirSync(join(tmp, "src")).join(", ")}`);
  }
  if (JSON.stringify(readdirSync(tmp).sort()) !== JSON.stringify(["src"])) {
    throw new Error(`init refused but still wrote at the project root: ${readdirSync(tmp).join(", ")}`);
  }

  // ...and the tree is still scaffoldable once the blocker is gone, which is
  // what "permanent" meant before.
  rmSync(join(tmp, "src", "posts"));
  const again = await runCli(["init", "blog"], tmp);
  if (again.exit !== 0) throw new Error(`unify init blog exited ${again.exit} after the blocking file was removed: ${again.stderr}`);

  covers("SCF-09");
}, TEST_MS);

// ---- SCF-10 -----------------------------------------------------------------

test("scaffold: SCF-10 — the base64 literal reaches dist/ as a valid PNG, every chunk CRC verified", async () => {
  // §19.5's whole point is that a template file's content may be raw BYTES.
  // The failure this pins is not "the file is missing" but "the file is the
  // wrong thing": a template that shipped the base64 TEXT, or a writer that
  // decoded to a string before writing, produces a file of plausible size at
  // the right path that no crawler can read. Nothing else in the pipeline
  // looks inside it — §12 checks that the reference resolves, and a resolved
  // reference to a corrupt file is still resolved.
  for (const name of TEMPLATES) {
    const tmp = mkTmp();
    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);
    const buildR = await runCli(["build"], tmp);
    if (buildR.exit !== 0) throw new Error(`unify build exited ${buildR.exit} for "${name}": ${buildR.stderr}`);

    const scaffolded = readFileSync(join(tmp, "site", "assets", "share-placeholder.png"));
    const published = readFileSync(join(tmp, "dist", "assets", "share-placeholder.png"));
    if (!scaffolded.equals(published)) throw new Error(`${name}: dist/assets/share-placeholder.png is not byte-identical to the scaffolded file — §4.4 is a mirror copy`);

    // Not base64 text, stated as the property that separates the two: base64
    // is a 7-bit alphabet, and a PNG's signature alone carries 0x89.
    if (!published.some((b) => b > 0x7f)) throw new Error(`${name}: the published share image is all 7-bit bytes — this is the base64 literal written as text, not the image it encodes`);

    const header = pngHeader(published, `SCF-10/${name}`);
    if (![1, 2, 4, 8, 16].includes(header.bitDepth)) throw new Error(`${name}: IHDR bit depth ${header.bitDepth} is not one PNG defines`);
    if (![0, 2, 3, 4, 6].includes(header.colourType)) throw new Error(`${name}: IHDR colour type ${header.colourType} is not one PNG defines`);
    if (header.width <= 0 || header.height <= 0) throw new Error(`${name}: IHDR declares ${header.width}x${header.height}`);

    // The chunk walk is what makes "a real PNG" a checked claim rather than a
    // guess from the first eight bytes: every chunk's declared CRC-32 is
    // recomputed over its own type and data, and the walk must consume the
    // file exactly and end at IEND.
    const seen = [];
    let offset = 8;
    while (offset < published.length) {
      if (offset + 12 > published.length) throw new Error(`${name}: truncated chunk header at byte ${offset}`);
      const length = published.readUInt32BE(offset);
      const type = published.subarray(offset + 4, offset + 8).toString("latin1");
      if (offset + 12 + length > published.length) throw new Error(`${name}: chunk ${type} at byte ${offset} declares ${length} bytes, past the end of the file`);
      const declaredCrc = published.readUInt32BE(offset + 8 + length);
      const actualCrc = crc32(published.subarray(offset + 4, offset + 8 + length));
      if (declaredCrc !== actualCrc) {
        throw new Error(`${name}: chunk ${type} at byte ${offset} declares CRC 0x${declaredCrc.toString(16)}, the bytes compute 0x${actualCrc.toString(16)} — the image was corrupted between the literal and the file`);
      }
      seen.push(type);
      offset += 12 + length;
    }
    if (offset !== published.length) throw new Error(`${name}: ${published.length - offset} trailing byte(s) after the last PNG chunk`);
    if (seen[0] !== "IHDR" || seen[seen.length - 1] !== "IEND") throw new Error(`${name}: chunk order is ${seen.join("/")}, which does not open at IHDR and close at IEND`);
    if (!seen.includes("IDAT")) throw new Error(`${name}: the PNG carries no IDAT chunk — there is no image in it`);
  }

  covers("SCF-10");
}, TEST_MS);

test("scaffold: SCF-10 — a single-file executable scaffolds the identical tree, because nothing in src/templates/** reads the filesystem", async () => {
  // §19.5's constraint, proved by the thing it exists to protect rather than
  // by grepping for `readFileSync`. `bun build --compile` bundles by tracing
  // `import`; the binary it produces has no sibling directory, no repository
  // and no `src/templates/` to read. A template that reached its share image
  // with `readFileSync(new URL("./assets/x.png", import.meta.url))` passes
  // every other test in this file — it works perfectly under `bun run` — and
  // produces an executable that cannot scaffold at all. That is the previous
  // implementation's failure (an `init` that needed something outside itself)
  // in another costume, and compiling is the only thing that tells the two apart.
  const workshop = mkTmp();
  const binary = join(workshop, "unify-compiled");
  const compile = Bun.spawn({
    cmd: [process.execPath, "build", "--compile", CLI, "--outfile", binary],
    cwd: ROOT, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const compileErr = await new Response(compile.stderr).text();
  if ((await compile.exited) !== 0) throw new Error(`bun build --compile failed:\n${compileErr}`);

  const env = { ...process.env, NO_COLOR: "1" };
  delete env.DEBUG;
  delete env.FORCE_COLOR;
  delete env.CLAUDECODE;

  try {
    for (const name of TEMPLATES) {
      const compiled = mkTmp();
      const proc = Bun.spawn({ cmd: [binary, "init", name], cwd: compiled, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      if ((await proc.exited) !== 0) throw new Error(`the compiled binary's "init ${name}" exited nonzero:\nstdout:\n${out}\nstderr:\n${err}`);

      const interpreted = mkTmp();
      const initR = await runCli(["init", name], interpreted);
      if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);

      const fromBinary = readTree(compiled);
      const fromSource = readTree(interpreted);
      for (const rel of [...new Set([...fromBinary.keys(), ...fromSource.keys()])].sort()) {
        if (!fromBinary.has(rel)) throw new Error(`${name}: the compiled binary did not scaffold ${rel}`);
        if (!fromSource.has(rel)) throw new Error(`${name}: the compiled binary scaffolded ${rel}, which \`bun src/cli.js\` does not`);
        if (!fromBinary.get(rel).equals(fromSource.get(rel))) {
          throw new Error(`${name}: ${rel} differs between the compiled binary and \`bun src/cli.js\` (${fromBinary.get(rel).length} vs ${fromSource.get(rel).length} bytes)`);
        }
      }

      // And the scaffold the binary wrote is a working site, not just matching
      // bytes: §19.3's first guarantee, run through the artifact an installer
      // actually hands somebody.
      const build = Bun.spawn({ cmd: [binary, "build", "--dry-run", "--strict"], cwd: compiled, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      const [buildOut, buildErr] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text()]);
      if ((await build.exited) !== 0) throw new Error(`the compiled binary's "build --dry-run --strict" failed on its own ${name} scaffold:\nstdout:\n${buildOut}\nstderr:\n${buildErr}`);
    }
  } finally {
    rmSync(workshop, { recursive: true, force: true });
  }

  covers("SCF-10");
}, TEST_MS);

// ---- SCF-11 -----------------------------------------------------------------

// §19.7's list, as the shapes a reader would mistake for a fact. Each pattern
// is deliberately specific: the rule is "never make an invented placeholder
// look PUBLISHABLE", so what is banned is the plausible spelling, not the
// subject. `<span class="placeholder">year — replace</span>` is a date and
// stays; `14 March 2024` beside a byline would not.
const INVENTED_FACT_SHAPES = [
  ["a street address", /\b\d{1,5}\s+(?:[A-Z][A-Za-z.]*\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr|Court|Ct|Place|Pl|Way|Terrace|Parkway|Pkwy|Highway|Hwy)\b/],
  ["a phone number", /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s*|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b|\btel:\+?\d/i],
  ["a price", /[$£€¥]\s?\d|\b\d+(?:\.\d{2})?\s?(?:USD|EUR|GBP|dollars|euros)\b/i],
  ["a rating", /★|\b[0-5](?:\.\d)?\s*(?:out of|\/)\s*5\b|\b\d(?:\.\d)?\s*stars?\b/i],
];

// RFC 2606 §3 reserves example.com/.net/.org and the `.example` TLD for
// documentation. A placeholder on any other host is a claim about somebody's
// real domain, and a reader who published the scaffold unedited would be
// making it on their behalf.
function isReservedHost(host) {
  const h = host.toLowerCase();
  return h === "example.com" || h === "example.net" || h === "example.org" || h === "example" || h.endsWith(".example") || h.endsWith(".example.com") || h.endsWith(".example.net") || h.endsWith(".example.org");
}

// §19.7 permits a template exactly one unify-specific token in the output —
// `schema:`, spelled `<meta name="schema">` (§26.4) — and the SCF-11 test below
// pins that. What that permission does NOT do is repair the shipped documents
// that assert the opposite: README.md and docs/product-spec.md both said "no
// tool vocabulary of any kind survives into the output" while every
// layout-composed page of all five templates shipped the meta. §19.4 makes the
// scaffold answerable to the README as one of "one rule set, three audiences",
// so this cross-checks the artifact against the sentence rather than trusting
// either alone.
test("scaffold: the shipped documents' claim about output vocabulary matches the bytes a scaffold emits", async () => {
  const tmp = mkTmp();
  const initR = await runCli(["init", "default"], tmp);
  if (initR.exit !== 0) throw new Error(`unify init default exited ${initR.exit}: ${initR.stderr}`);
  const buildR = await runCli(["build"], tmp);
  if (buildR.exit !== 0) throw new Error(`unify build exited ${buildR.exit}: ${buildR.stderr}`);

  const emitsSchemaMeta = emittedPages(join(tmp, "dist")).some(({ html }) => metaByName(html, "schema").length > 0);
  if (!emitsSchemaMeta) throw new Error("no scaffolded page emits <meta name=\"schema\"> — this test's premise is stale, not the documents");

  // Matched without its leading "No"/"and no", because the sentence is
  // capitalised in one document and mid-clause in the other.
  const ABSOLUTE = "tool vocabulary of any kind survives into the output";
  for (const doc of ["README.md", join("docs", "product-spec.md")]) {
    const text = readFileSync(join(ROOT, doc), "utf8");
    if (text.includes(ABSOLUTE)) {
      throw new Error(
        `${doc} states "no ${ABSOLUTE}" while every layout-composed page of the scaffold ships <meta name="schema"> — ` +
        "§26.4 calls that key unify's own, defined by no standard, so the sentence is false as written. " +
        "Keep the enumeration (no <slot>, no data-layout, no injected script) and name the one exception.",
      );
    }
  }
}, TEST_MS);

// Metadata names the HTML/OG/Twitter standards define, as against unify's own.
// §26.4 calls `schema` "unify's own key, defined by no standard", and that is
// exactly the distinction §19.4's "one rule set, three audiences" turns on: a
// standard key needs no unify documentation, an invented one is documentation
// or it is nothing.
const STANDARD_META_NAMES = ["description", "viewport", "robots", "author", "date", "lastmod", "keywords", "generator", "theme-color", "color-scheme", "referrer"];

test("scaffold: AGENTS.md states no behavior the author-facing documents do not state", async () => {
  // §19.4: "It states no behavior the author-facing documents do not state:
  // one rule set, three audiences, never a tool-specific variant", grounded
  // in product-spec §6.7: "no behavior may be documented only in the agent
  // guide." ONLY is the operative word — the corpus is every document a site
  // author is pointed at, not the README alone. An earlier reading checked
  // README.md + docs/authoring-rules.md and nothing else, which quietly
  // promoted the README's own prose to sole carrier of any fact the rules
  // file happens not to spell (the audit-finding list, say): trimming one
  // README paragraph then failed a *scaffold* test, far from the edit — a
  // tripwire, not the rule. The implementer specs stay out of the corpus on
  // purpose: a behavior spelled only in conformance-spec.md is documented
  // for implementers, which for an author is not documented at all.
  //
  // Two instances broke it at once, and the first is the worse: AGENTS.md
  // taught `<meta name="schema">` — the HTML spelling — while both human
  // documents mentioned `schema` only under "## Markdown", as a frontmatter
  // key. Every scaffolded `_layout.html` is an HTML file carrying that meta,
  // and it is the sole declaration producing the JSON-LD on every
  // layout-composed page, so a human reading README + authoring-rules
  // concluded structured-data generation was Markdown-only while the
  // scaffold's most-read file relied on the spelling only the agent guide
  // documented.
  const tmp = mkTmp();
  const initR = await runCli(["init", "default"], tmp);
  if (initR.exit !== 0) throw new Error(`unify init default exited ${initR.exit}: ${initR.stderr}`);
  const agents = readFileSync(join(tmp, "AGENTS.md"), "utf8");
  const HUMAN_DOCS = ["README.md", join("docs", "authoring-rules.md"), join("docs", "getting-started.md"), join("docs", "cli-reference.md")];
  const human = HUMAN_DOCS.map((rel) => readFileSync(join(ROOT, rel), "utf8")).join("\n");

  // Mechanical half: every metadata key AGENTS.md spells that is NOT one the
  // standards define is a key unify invented, and must be spelled the same way
  // for humans. Standard keys are exempt because the author-facing documents
  // legitimately name them in prose.
  const keys = [...new Set([...agents.matchAll(/<meta\s+name="([A-Za-z:-]+)"/g)].map((m) => m[1]))];
  if (!keys.includes("schema")) throw new Error("AGENTS.md shows no <meta name=\"schema\"> — this test's premise is stale, not the documents");
  for (const key of keys) {
    if (STANDARD_META_NAMES.includes(key.toLowerCase()) || key.toLowerCase().startsWith("twitter:")) continue;
    if (!human.includes(`name="${key}"`)) {
      throw new Error(
        `AGENTS.md teaches <meta name="${key}">, a key no standard defines, and no author-facing document spells it (checked: ${HUMAN_DOCS.join(", ")}) — ` +
        "§19.4: one rule set, three audiences, and product-spec §6.7: no behavior may be documented only in the agent guide",
      );
    }
  }

  // Targeted half, and stated as targeted: whether two prose paragraphs list
  // the same findings is a reading, not a regex. This pins the one that
  // diverged — AGENTS.md's audit sentence named duplicate ids and README's
  // list of what audit reports did not.
  if (/duplicate ids/i.test(agents) && !/\bid\b[^.]*\btwice\b|duplicate ids?\b/i.test(human)) {
    throw new Error("AGENTS.md says `unify audit` reports duplicate ids and no author-facing document does — §19.4's one rule set");
  }
}, TEST_MS);

// The other half of "never make an invented placeholder look publishable":
// the scaffold ships a recipe for removing the placeholders, and a recipe that
// names fewer files than carry them leaves the invented ones in published
// bytes. DEPLOY.md's step 1 named two files; the site's name lived in six, and
// on the blog template the generator's own `SITE_URL` — a placeholder domain —
// went on into `feed.xml`, which every page advertises with
// `<link rel="alternate">` and which no check in unify can see: §11 does not
// rewrite a mirror-copied asset, §12 does not follow an off-origin URL, and
// `audit` reads no page record out of it.
for (const name of TEMPLATES) {
  test(`scaffold/${name}: SCF-11 — DEPLOY.md's placeholder list names every file that carries the invented identity`, async () => {
    const tmp = mkTmp();
    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);

    // The scaffolded site name is whatever the layout's <title> suffix says,
    // read out of the artifact rather than hard-coded per template.
    const layout = readFileSync(join(tmp, "site", "_layout.html"), "utf8");
    const siteName = (layout.match(/<title>\s*—\s*([^<]+?)\s*<\/title>/) ?? [])[1];
    if (!siteName) throw new Error(`${name}: could not read the scaffolded site name out of site/_layout.html's <title>`);

    // Step 1 of DEPLOY.md, mechanically: every `site/...` path it names gets
    // the site name replaced, and the generator constants it names get the
    // placeholder domain replaced. Nothing outside the list is touched — that
    // is the whole point of the check.
    const deploy = readFileSync(join(tmp, "DEPLOY.md"), "utf8");
    const step1 = deploy.slice(deploy.indexOf("## 1."), deploy.indexOf("## 2."));
    if (!step1.includes("site/_layout.html")) throw new Error("DEPLOY.md step 1 does not name site/_layout.html — this test's reading of the recipe is stale");
    const listed = [...new Set([...step1.matchAll(/`((?:site|scripts)\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]))];

    let edited = 0;
    for (const rel of listed) {
      const abs = join(tmp, ...rel.split("/"));
      if (!existsSync(abs) || !/\.(html|md|mjs|txt|css|json|xml)$/i.test(rel)) continue;
      const before = readFileSync(abs, "utf8");
      const after = before.split(siteName).join("Acme Replacement").split("https://you.example").join("https://acme-replacement.example");
      if (after !== before) edited += 1;
      writeFileSync(abs, after);
    }
    if (edited === 0) throw new Error(`${name}: DEPLOY.md step 1 named ${listed.length} source paths and editing all of them changed nothing`);

    // A tree with a generator (the blog) needs no extra step: unify runs it
    // inside the build below, and its feed takes the --base-url from the
    // build's own settings, so the placeholder domain goes without an edit.

    const buildR = await runCli(["build", "--base-url", "https://acme-replacement.example/", "--canonical", "auto"], tmp);
    if (buildR.exit !== 0) throw new Error(`${name}: unify build after DEPLOY.md's recipe exited ${buildR.exit}: ${buildR.stderr}`);

    // Nothing invented survives. robots.txt is exempt and stated rather than
    // waved past: its only `you.example` is inside a commented-out `Sitemap:`
    // line whose own comment says "put your own address in it" — a directive
    // no crawler acts on, which is the opposite of a claim that publishes.
    for (const [rel, bytes] of readTree(join(tmp, "dist"))) {
      const asUrl = rel.split(sep).join("/");
      if (asUrl === "robots.txt") continue;
      if (!/\.(html|xml|txt|css|json|md|mjs|js)$/i.test(asUrl)) continue;
      const text = bytes.toString("utf8");
      if (text.includes(siteName)) {
        throw new Error(`${name}: dist/${asUrl} still carries the scaffolded site name ${JSON.stringify(siteName)} after DEPLOY.md's step 1 was followed exactly — the recipe names fewer files than carry the invented identity (§19.7)`);
      }
      if (text.includes("you.example")) {
        throw new Error(`${name}: dist/${asUrl} still carries the placeholder domain you.example after DEPLOY.md's step 1 was followed exactly — an address is on §19.7's list, and this one publishes where nothing in the build can see it`);
      }
    }

    covers("SCF-11");
  }, TEST_MS);
}

for (const name of TEMPLATES) {
  test(`scaffold/${name}: SCF-11 — nothing invented looks publishable, and nothing ships that the site does not use`, async () => {
    const tmp = mkTmp();
    const initR = await runCli(["init", name], tmp);
    if (initR.exit !== 0) throw new Error(`unify init ${name} exited ${initR.exit}: ${initR.stderr}`);
    const buildR = await runCli(["build"], tmp);
    if (buildR.exit !== 0) throw new Error(`unify build exited ${buildR.exit} for "${name}": ${buildR.stderr}`);
    const distDir = join(tmp, "dist");
    const published = readTree(distDir);
    const pages = emittedPages(distDir);

    // ---- Never make an invented placeholder look publishable. -------------
    // Honest about its limit: whether a NAME is invented cannot be decided by
    // a regex — "Your Name Here" and "Sam Rivera" are both strings. What can
    // be decided is whether the template wrote something in a FORMAT whose
    // only reading is a fact, and whether the categories §19.7 names carry a
    // visible disclosure. Both are below; the third property — that the
    // disclosure's wording actually names the right thing — is a review
    // judgement and is deliberately not faked with a check here.
    for (const { rel, html } of pages) {
      const visible = textOf(html);
      for (const [what, pattern] of INVENTED_FACT_SHAPES) {
        const hit = visible.match(pattern);
        if (hit) throw new Error(`${name}: dist/${rel} contains ${what}: ${JSON.stringify(hit[0])} — §19.7: a template that shipped a plausible-looking one would be teaching authors to publish it`);
      }
    }

    // Every host and every mailbox the scaffold names is on a reserved
    // documentation domain — with one exception, stated rather than widened:
    // https://schema.org is the JSON-LD vocabulary namespace §26.6 requires
    // as `@context`, which is a name, not somebody's site.
    for (const [rel, bytes] of published) {
      if (!/\.(html|xml|txt|css|json|md|mjs|js)$/i.test(rel)) continue;
      const text = bytes.toString("utf8");
      for (const m of text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
        if (isReservedHost(m[1])) continue;
        if (m[0] === "https://schema.org" && /"@context"\s*:\s*"https:\/\/schema\.org"/.test(text)) continue;
        throw new Error(`${name}: dist/${rel} names the host ${m[1]} — §19.7 keeps invented identity on RFC 2606 documentation domains, so nobody publishes a claim about a real site`);
      }
      for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
        if (!isReservedHost(m[1])) throw new Error(`${name}: dist/${rel} names the mailbox ${m[0]} — §19.7's placeholders stay on reserved documentation domains`);
      }
    }

    // The categories §19.7 names that a page CAN carry — an author and a date
    // — must arrive beside a visible disclosure, because neither can be
    // conspicuous in its own bytes: `2026-01-15` is indistinguishable from a
    // fact, and so is a name. The scaffold's mechanism is a `class="placeholder"`
    // element, so the check is that the page carries one, and that the class
    // is styled by a stylesheet the page links — a marker no reader can see
    // is not a disclosure.
    for (const { rel, html } of pages) {
      const declaresIdentity = metaByName(html, "author").length > 0 || metaByName(html, "date").length > 0 || metaByProperty(html, "article:published_time").length > 0;
      const marked = /class="[^"]*\bplaceholder\b[^"]*"/.test(html);
      if (declaresIdentity && !marked) {
        throw new Error(`${name}: dist/${rel} declares an author or a date and carries no visible placeholder disclosure — §19.7 makes those conspicuous, and a W3C-DTF date cannot be conspicuous in its own bytes`);
      }
      // ...and the same rule read the other way round. A DECLARED date is not
      // the only way a template ships one: the blog listing rendered both
      // sample dates and both bylines as plain visible text, declared nothing
      // in its head, and was the one content page of that template carrying no
      // marking at all — so the check above passed it while the reader saw two
      // invented dates presented as facts. A visible date is the case that
      // needs a disclosure most, because it is the one a reader reads.
      const visibleDate = textOf(html).match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (visibleDate && !marked) {
        throw new Error(`${name}: dist/${rel} shows the date ${JSON.stringify(visibleDate[0])} in its visible text and carries no placeholder disclosure — §19.7 names dates, and this is the reading of them a reader actually gets`);
      }
      if (!marked) continue;
      const styled = linksOf(html)
        .filter((a) => a.rel?.toLowerCase() === "stylesheet" && a.href?.startsWith("/"))
        .some((a) => {
          const css = published.get(a.href.slice(1).split("/").join(sep));
          return css !== undefined && /\.placeholder\b[^{}]*\{[^}]*\S[^}]*\}/.test(css.toString("utf8"));
        });
      if (!styled) throw new Error(`${name}: dist/${rel} marks placeholders with class="placeholder" and links no stylesheet that declares a non-empty .placeholder rule — the marker is invisible to the reader it exists for`);
    }
    if (!pages.some(({ html }) => /class="[^"]*\bplaceholder\b[^"]*"/.test(html))) {
      throw new Error(`${name} ships no conspicuous placeholder at all, so the discipline above is not demonstrated anywhere in the template`);
    }

    // Structured data is where an invented fact is invisible: nothing renders
    // it, so nobody proofreads it. §19.7's categories are refused there by
    // property name, which leaves §26.4's hand-written route open for every
    // vocabulary that does not carry one.
    for (const { rel, html } of pages) {
      for (const payload of jsonLdOf(html)) {
        for (const property of ["address", "telephone", "faxNumber", "price", "priceCurrency", "aggregateRating", "ratingValue", "streetAddress", "postalCode"]) {
          if (new RegExp(`"${property}"\\s*:`).test(payload)) {
            throw new Error(`${name}: dist/${rel}'s JSON-LD declares "${property}" — §19.7's categories, in the one place a reader never sees them`);
          }
        }
      }
    }

    // ---- Never introduce a unify-only content schema. ---------------------
    // Built output carries the platform's own vocabulary. The single
    // unify-specific token §19.7 permits is `schema:`, which ships as
    // <meta name="schema"> (§26.4 argues it); everything else unify reads is
    // consumed by the build (§6.4) and must not survive into the output.
    for (const { rel, html } of pages) {
      for (const meta of metasOf(html)) {
        if (!meta.name) continue;
        const key = meta.name.toLowerCase();
        if (key === "schema" || STANDARD_META_NAMES.includes(key) || key.startsWith("twitter:")) continue;
        throw new Error(`${name}: dist/${rel} emits <meta name="${meta.name}"> — §19.7: a template teaches the platform's artifacts in the platform's vocabulary, and \`schema\` is the one unify-specific key it may carry`);
      }
      for (const pattern of [/data-unify\b/, /class="[^"]*\bunify-/, /\sdata-layout\s*=/, /<include\b/i, /<slot[\s>]/i]) {
        const hit = html.match(pattern);
        if (hit) throw new Error(`${name}: dist/${rel} carries the tool vocabulary ${JSON.stringify(hit[0])} — built output contains none of it`);
      }
    }

    // ---- Never ship a file the site does not use. -------------------------
    // Reachability from the emitted pages, which is the direction §19.7 says
    // a template is written in. The exemptions are the locations a client
    // fetches by ADDRESS rather than by link, so "unreferenced" says nothing
    // about them: /robots.txt (RFC 9309 §2.3), a sitemap (named from
    // robots.txt or submitted directly), 404.html (served by the host on a
    // miss, never linked), and /favicon.ico.
    const WELL_KNOWN = new Set(["robots.txt", "sitemap.xml", "404.html", "favicon.ico"]);
    const referenced = new Set();
    for (const { html } of pages) {
      const values = [
        ...[...html.matchAll(/\s(?:href|src|poster)="([^"]*)"/gi)].map((m) => m[1]),
        ...metasOf(html).filter((a) => ["og:image", "twitter:image"].includes(a.property?.toLowerCase() ?? a.name?.toLowerCase() ?? "")).map((a) => a.content ?? ""),
      ];
      for (const value of values) {
        if (!value.startsWith("/")) continue;
        const clean = value.split("#")[0].split("?")[0].slice(1);
        referenced.add(clean === "" || clean.endsWith("/") ? `${clean}index.html` : clean);
      }
    }
    for (const rel of [...published.keys()].sort()) {
      const asUrl = rel.split(sep).join("/");
      if (referenced.has(asUrl) || WELL_KNOWN.has(asUrl)) continue;
      throw new Error(`${name}: dist/${asUrl} ships and no emitted page references it — §19.7: never ship a file the site does not use`);
    }

    covers("SCF-11");
  }, TEST_MS);
}

// ------------------------------------------------------------------ SCF-12

test("scaffold/docs: SCF-12 the All-pages starter degrades without a catalog and builds clean with --catalog at a root and under a path prefix", async () => {
  const tmp = mkTmp();
  const initR = await runCli(["init", "docs"], tmp);
  if (initR.exit !== 0) throw new Error(`unify init docs exited ${initR.exit}: ${initR.stderr}`);
  const script = readFileSync(join(tmp, "site", "assets", "all-pages.js"), "utf8");
  // Fetched relative to the module, never as a root-relative string (the
  // authoring rules' note on addresses fetched by JavaScript).
  if (!script.includes('new URL("unify/catalog.json", import.meta.url)') || /fetch\(\s*["'`]\//.test(script)) {
    throw new Error("assets/all-pages.js must fetch the catalog relative to the module");
  }
  const noFlags = await runCli(["audit", "--strict"], tmp);
  if (noFlags.exit !== 0) throw new Error(`docs scaffold with no --catalog: audit --strict exited ${noFlags.exit}\n${noFlags.stdout}${noFlags.stderr}`);
  for (const [base, prefix] of [["https://example.com/", "/"], ["https://example.com/sub/dir/", "/sub/dir/"]]) {
    const args = ["--catalog", "--search-corpus", "--pretty-urls", "--base-url", base];
    const b = await runCli(["build", "--strict", "--clean", ...args], tmp);
    if (b.exit !== 0) throw new Error(`docs scaffold, ${base}: build --strict exited ${b.exit}\n${b.stdout}${b.stderr}`);
    const a = await runCli(["audit", "--strict", ...args], tmp);
    if (a.exit !== 0) throw new Error(`docs scaffold, ${base}: audit --strict exited ${a.exit}\n${a.stdout}${a.stderr}`);
    const html = readFileSync(join(tmp, "dist", "all-pages", "index.html"), "utf8");
    if (!html.includes(`src="${prefix}assets/all-pages.js"`)) throw new Error(`${base}: the starter's script address was not rewritten:\n${html}`);
    const catalog = JSON.parse(readFileSync(join(tmp, "dist", "assets", "unify", "catalog.json"), "utf8"));
    if (!catalog.pages.some((p) => p.path === `${prefix}all-pages/`)) throw new Error(`${base}: the catalog does not list the starter page`);
  }
  covers("SCF-12");
}, TEST_MS * 2);

// ------------------------------------------------------------------ SCF-13

/** The author's own tool, run the way §19.9 says init runs it — a real subprocess, nothing stubbed (H1). */
function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

test("scaffold: SCF-13 a template is a directory, a git repository or an npm package, read as a project; a typo is a usage error, not a lookup", async () => {
  // The reference template is what init itself produces: a project with
  // site/ beside AGENTS.md, DEPLOY.md and unify.yaml (§19.4) — so a scaffold
  // from it must reproduce the built-in byte for byte.
  const origin = mkTmp();
  const seed = await runCli(["init", "blog"], origin);
  if (seed.exit !== 0) throw new Error(`unify init blog exited ${seed.exit}: ${seed.stderr}`);
  // What a template's packaging needs and the scaffold must never carry.
  writeFileSync(join(origin, "package.json"), JSON.stringify({ name: "unify-template-probe", version: "1.0.0" }));
  writeFileSync(join(origin, "package-lock.json"), "{}\n");
  mkdirSync(join(origin, "node_modules", "left-behind"), { recursive: true });
  writeFileSync(join(origin, "node_modules", "left-behind", "index.js"), "");
  const expected = readTree(origin);
  for (const rel of [...expected.keys()]) {
    if (rel === "package.json" || rel === "package-lock.json" || rel.startsWith("node_modules")) expected.delete(rel);
  }

  // ---- a directory, by relative and by absolute path ---------------------
  for (const [label, arg, cwdOf] of [
    ["absolute", origin, (tmp) => tmp],
    ["relative", "../origin-link", (tmp) => tmp],
  ]) {
    const tmp = mkTmp();
    const argv = arg === origin ? [arg] : (() => {
      // A relative path resolves against the working directory: give the
      // project a sibling named origin-link that is the reference template.
      mkdirSync(join(tmp, "..", "origin-link"), { recursive: true });
      for (const [rel, bytes] of readTree(origin)) {
        mkdirSync(join(tmp, "..", "origin-link", rel, ".."), { recursive: true });
        writeFileSync(join(tmp, "..", "origin-link", rel), bytes);
      }
      return [arg];
    })();
    const r = await runCli(["init", ...argv], cwdOf(tmp));
    if (r.exit !== 0) throw new Error(`unify init <${label} directory> exited ${r.exit}:\n${r.stderr}`);
    const got = readTree(tmp);
    for (const [rel, bytes] of expected) {
      if (!got.has(rel)) throw new Error(`${label}: ${rel} was not scaffolded`);
      if (!got.get(rel).equals(bytes)) throw new Error(`${label}: ${rel} differs from the template`);
    }
    for (const rel of got.keys()) if (!expected.has(rel)) throw new Error(`${label}: ${rel} was scaffolded but the template's packaging must never be copied`);
    if (!r.stdout.includes(`scaffolded ${arg} `)) throw new Error(`the summary must name the source as written:\n${r.stdout}`);
    // §19.3 holds for a faithful copy of a built-in, generator and all.
    const dry = await runCli(["build", "--dry-run", "--strict"], tmp);
    if (dry.exit !== 0) throw new Error(`${label}: build --dry-run --strict on the scaffold exited ${dry.exit}\n${dry.stdout}${dry.stderr}`);
    if (label === "relative") rmSync(join(tmp, "..", "origin-link"), { recursive: true, force: true });
  }

  // ---- a git repository hosting several templates: file:// URL to a bare
  // repository, the template's subdirectory inside it, and a #ref. ---------
  const host = mkTmp();
  mkdirSync(join(host, "templates", "blog"), { recursive: true });
  for (const [rel, bytes] of expected) {
    mkdirSync(join(host, "templates", "blog", rel, ".."), { recursive: true });
    writeFileSync(join(host, "templates", "blog", rel), bytes);
  }
  writeFileSync(join(host, "README.md"), "# templates live under templates/\n");
  git(host, "init", "-q", "-b", "main");
  git(host, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "add", "-A");
  git(host, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "templates");
  git(host, "branch", "release");
  const bare = `${host}.git`;
  git(host, "clone", "-q", "--bare", host, bare);
  {
    const tmp = mkTmp();
    const r = await runCli(["init", `file://${bare}/templates/blog#release`], tmp);
    if (r.exit !== 0) throw new Error(`unify init <git url>/<subdirectory>#ref exited ${r.exit}:\n${r.stderr}`);
    const got = readTree(tmp);
    if ([...got.keys()].some((k) => k === ".git" || k.startsWith(".git/") || k === "README.md")) throw new Error("the checkout outside the subdirectory leaked into the scaffold");
    for (const [rel, bytes] of expected) {
      if (!got.has(rel) || !got.get(rel).equals(bytes)) throw new Error(`git: ${rel} missing or differs from the template`);
    }
    for (const rel of got.keys()) if (!expected.has(rel)) throw new Error(`git: ${rel} was scaffolded but is not template content`);
    // The whole repository, no subdirectory: a bare source tree would be wrong here, and it is not what is read —
    // the checkout has neither site/ nor src/ at its root, so README.md and templates/** all land in site/.
    const whole = await runCli(["init", `file://${bare}#release`], mkTmp());
    if (whole.exit !== 0 || !whole.stdout.includes("into site")) throw new Error(`the repository root is a template too: exit ${whole.exit}\n${whole.stderr}`);
    // A ref that does not exist is the tool's own failure, surfaced as a usage error, with nothing written;
    // a subdirectory that does not exist is init's, after a clone that succeeded.
    const badRef = await runCli(["init", `file://${bare}/templates/blog#no-such-branch`], mkTmp());
    if (badRef.exit !== 2 || !/git clone failed/.test(badRef.stderr)) throw new Error(`a missing ref must exit 2 naming git clone: exit ${badRef.exit}\n${badRef.stderr}`);
    const badDir = await runCli(["init", `file://${bare}/templates/shop`], mkTmp());
    if (badDir.exit !== 2 || !/has no directory templates\/shop/.test(badDir.stderr)) throw new Error(`a missing subdirectory must exit 2 naming it: exit ${badDir.exit}\n${badDir.stderr}`);
  }

  // ---- an npm package is named by its convention and fetched with the
  // author's own npm; the unpacking is proved on a real tarball in
  // tests/unit/template-source.test.js. Here: the name pattern reaches npm
  // (and only the pattern does), and npm's failure is a usage error. ---------
  {
    const r = await runCli(["init", "@unify-conformance-probe/unify-no-such-template-template"], mkTmp());
    if (r.exit !== 2 || !/npm pack failed/.test(r.stderr)) throw new Error(`a template package npm cannot fetch must exit 2 naming npm pack: exit ${r.exit}\n${r.stderr}`);
    const notIt = await runCli(["init", "no-such-template"], mkTmp());
    if (notIt.exit !== 2 || /npm/.test(notIt.stderr.split("\n")[0])) throw new Error(`a name outside the convention must not reach npm:\n${notIt.stderr}`);
  }

  // ---- a bare source tree: no site/, no src/ — every file is content and
  // nothing lands at the project root, so `--source .` has nothing to refuse. -
  {
    const bare = mkTmp();
    for (const [rel, bytes] of readTree(join(origin, "site"))) {
      mkdirSync(join(bare, rel, ".."), { recursive: true });
      writeFileSync(join(bare, rel), bytes);
    }
    // The blog's pages depend on the generator the project root carried; a
    // bare tree stands alone, so the fixture is a page that does.
    rmSync(join(bare, "posts"), { recursive: true, force: true });
    rmSync(join(bare, "_data"), { recursive: true, force: true });
    const tmp = mkTmp();
    const r = await runCli(["init", bare], tmp);
    if (r.exit !== 0) throw new Error(`unify init <bare tree> exited ${r.exit}:\n${r.stderr}`);
    if (!existsSync(join(tmp, "site", "_layout.html"))) throw new Error("a bare tree must land in site/");
    if (existsSync(join(tmp, "AGENTS.md")) || existsSync(join(tmp, "unify.yaml"))) throw new Error("a bare tree has no project-root files to place");
    if (!/scaffolded .* into site$/m.test(r.stdout)) throw new Error(`the summary must not mention a project root it wrote nothing to:\n${r.stdout}`);
    const inPlace = await runCli(["init", bare, "--source", "."], mkTmp());
    if (inPlace.exit !== 0) throw new Error(`a bare tree into --source . has nothing to refuse over, got exit ${inPlace.exit}:\n${inPlace.stderr}`);
  }

  // ---- the forms are told apart by shape -----------------------------------
  {
    const tmp = mkTmp();
    // A built-in name wins over a same-named directory in the working directory.
    mkdirSync(join(tmp, "basic"));
    writeFileSync(join(tmp, "basic", "index.html"), "<!doctype html><title>not the registry</title>\n");
    const r = await runCli(["init", "basic"], tmp);
    if (r.exit !== 0) throw new Error(`unify init basic beside a basic/ directory exited ${r.exit}:\n${r.stderr}`);
    if (!existsSync(join(tmp, "site", "contact.html"))) throw new Error("the registry's basic must win over the directory of the same name");
    // A bare word that is neither is refused before any tool runs — and the
    // refusal says what the four forms are.
    const typo = await runCli(["init", "blgo"], mkTmp());
    if (typo.exit !== 2) throw new Error(`unify init blgo exited ${typo.exit}, expected 2`);
    for (const form of ["default, basic, blog, docs, portfolio", "directory must exist", "unify-<name>-template", "URL"]) {
      if (!typo.stderr.includes(form)) throw new Error(`the refusal must name the four forms; missing "${form}":\n${typo.stderr}`);
    }
    // An empty directory is a template with no source file: a usage error, never an empty scaffold.
    const empty = await runCli(["init", mkTmp()], mkTmp());
    if (empty.exit !== 2 || !/no source files/.test(empty.stderr)) throw new Error(`an empty template must exit 2: ${empty.exit}\n${empty.stderr}`);
  }

  covers("SCF-13");
}, TEST_MS * 3);

// ------------------------------------------------------------------ SCF-14

test("scaffold: SCF-14 --audit keeps a scaffold only if it audits clean; a finding removes every file init wrote", async () => {
  // Every built-in passes §19.3's gate, so under --audit it scaffolds, the
  // audit's own report prints, and the files stay — the blog exercises the
  // generator named by the scaffolded unify.yaml, the docs template its
  // catalog: true, both read from the project just written.
  for (const name of ["blog", "docs"]) {
    const tmp = mkTmp();
    const r = await runCli(["init", name, "--audit"], tmp);
    if (r.exit !== 0) throw new Error(`unify init ${name} --audit exited ${r.exit}:\n${r.stdout}${r.stderr}`);
    if (!r.stdout.includes("audit: nothing to report")) throw new Error(`${name}: the audit's report must print:\n${r.stdout}`);
    if (!existsSync(join(tmp, "site", "_layout.html")) || !existsSync(join(tmp, "unify.yaml"))) throw new Error(`${name}: a clean audit must leave the scaffold`);
    if (existsSync(join(tmp, "dist"))) throw new Error(`${name}: the audit gate must publish nothing`);
  }

  // A template that is not a proper unify site: a page with no description
  // and no lang, which audit --strict reports as two incomplete findings.
  const bad = mkTmp();
  mkdirSync(join(bad, "site", "deep"), { recursive: true });
  writeFileSync(join(bad, "site", "deep", "index.html"), "<!doctype html>\n<html><head><title>Bad</title></head><body><main><h1>Bad</h1></main></body></html>\n");
  writeFileSync(join(bad, "NOTES.md"), "# a project-root file\n");
  {
    const tmp = mkTmp();
    // A directory that existed before init ran is the author's and stays,
    // whatever init created beneath it.
    mkdirSync(join(tmp, "site"));
    const r = await runCli(["init", bad, "--audit"], tmp);
    if (r.exit !== 1) throw new Error(`unify init <bad template> --audit exited ${r.exit}, expected the audit's 1:\n${r.stdout}${r.stderr}`);
    // The findings report is the audit's own (stdout), exactly as `unify audit` prints it.
    if (!/description-missing/.test(r.stdout) || !/lang-missing/.test(r.stdout)) throw new Error(`the audit's findings must print:\n${r.stdout}${r.stderr}`);
    if (!/nothing was scaffolded/.test(r.stdout)) throw new Error(`init must say the scaffold was removed:\n${r.stdout}`);
    const left = readdirSync(tmp);
    if (left.length !== 1 || left[0] !== "site" || readdirSync(join(tmp, "site")).length !== 0) {
      throw new Error(`after a failed audit only the author's empty site/ may remain, found: ${JSON.stringify(readTree(tmp).size ? [...readTree(tmp).keys()] : left)}`);
    }
  }
  // Without --audit the same template scaffolds: the gate is opt-in, and the
  // saved form of the flag (audit: true in a unify.yaml the working directory
  // already holds) means the same thing — a bare tree brings no unify.yaml of
  // its own, so the author's is not a collision.
  {
    const tmp = mkTmp();
    const r = await runCli(["init", bad], tmp);
    if (r.exit !== 0 || !existsSync(join(tmp, "site", "deep", "index.html"))) throw new Error(`without --audit the template must scaffold: exit ${r.exit}\n${r.stderr}`);
  }
  {
    const tmp = mkTmp();
    writeFileSync(join(tmp, "unify.yaml"), "audit: true\n");
    const r = await runCli(["init", join(bad, "site")], tmp);
    if (r.exit !== 1) throw new Error(`a saved audit: true must gate init too: exit ${r.exit}\n${r.stdout}${r.stderr}`);
    if (readdirSync(tmp).join(",") !== "unify.yaml") throw new Error(`only the author's unify.yaml may remain: ${readdirSync(tmp).join(", ")}`);
  }

  covers("SCF-14");
}, TEST_MS * 3);
