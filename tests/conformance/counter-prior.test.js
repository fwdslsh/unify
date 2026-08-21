/**
 * §28 — counter-prior frontmatter: P24, MAN-13, AUD-15, CPR-01.
 *
 * §28 states its own purpose in one clause, and every test below is shaped by
 * both halves of it: these diagnostics "exist to prevent confident
 * cross-generator assumptions from publishing or addressing the wrong page,
 * not to reserve ordinary metadata names without cause". So each firing case
 * is written beside the neighbouring input that must NOT be reported:
 *
 *   - `draft`/`permalink`/`slug` in a `.md` page's frontmatter are P24 — while
 *     `<meta name="draft">` in an HTML page's head is one author's ordinary
 *     metadata about their own content (§28.1's deliberate opposite of §26.4's
 *     P23), a `.md` fragment's frontmatter is never read at all (§5.1 step 4),
 *     and `drafts`/`permalink_style`/`sluggify` are not those keys.
 *   - `tags`/`categories` in the emitted HEAD are `taxonomy-inert`; the same
 *     meta in the BODY declares nothing (§20.3's head scope), and no third key
 *     name joins the closed set.
 *   - `date`/`lastmod` are the counterexample §28.3 keeps the section honest
 *     with: they ARE read, so the key draws nothing and only a malformed VALUE
 *     is reported, by `audit`, as `date-unusable`.
 *
 * Written from docs/conformance-spec.md §28 (with §14.1's contract for a
 * diagnostic's located prefix, §15's for what a blocked build leaves behind,
 * and §24.5's for a finding's two lines), not from src/**: §14.1 makes the
 * message wording prose rather than contract, so what is pinned here is the
 * located prefix, the severity token, the key named, and the unify mechanism
 * each message must point the author at.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no opt-outs (H4).
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

// --------------------------------------------------------------- fixtures

/** A complete, finding-free HTML page. */
const page = (name, head = "", body = `<p>Words about ${name}.</p>`) =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name}</title>
<meta name="description" content="The ${name} page of the example site.">
${head}</head>
<body>
<h1>${name}</h1>
${body}
</body>
</html>
`;

/** A home page linking every named page, so nothing below is an orphan. */
const home = (...links) =>
  page("Home", "", `<p>Welcome.</p>\n${links.map((l) => `<a href="/${l}.html">${l}</a>`).join(" ")}`);

/** A Markdown page whose frontmatter is exactly the given lines, `title` first. */
const md = (title, keys, body = "Words.") =>
  `---\ntitle: ${title}\n${keys.map((k) => `${k}\n`).join("")}---\n\n# ${title}\n\n${body}\n`;

// --------------------------------------------------------------- helpers

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function read(...parts) {
  return readFileSync(join(...parts), "utf8");
}

/**
 * Every file under `dir` as a sorted `relPath -> text` map, or `null` when the
 * directory does not exist. §15's "byte-for-byte untouched" is a claim about
 * the whole output tree, so this reads the whole tree rather than one file.
 */
function snapshot(dir) {
  if (!existsSync(dir)) return null;
  const out = {};
  const walk = (rel) => {
    const here = rel ? join(dir, rel) : dir;
    for (const entry of readdirSync(here, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(next);
      else out[next] = read(dir, ...next.split("/"));
    }
  };
  walk("");
  return out;
}

function expectUntouched(before, after, what) {
  const a = JSON.stringify(before, null, 1);
  const b = JSON.stringify(after, null, 1);
  if (a !== b) throw new Error(`${what}: §15 — a build that raised a problem changed dist/\n--- before ---\n${a}\n--- after ---\n${b}`);
}

/**
 * The `FILE:LINE: SEVERITY: ` line whose message names `key`, plus its
 * indented continuation lines — §14.1's shape, which is contract even though
 * the prose after the prefix is not.
 */
function diagnosticFor(stderr, key) {
  const lines = stderr.split("\n");
  const i = lines.findIndex((l) => /^\S+:\d+: problem: /.test(l) && l.slice(l.indexOf("problem: ")).includes(key));
  if (i === -1) return null;
  const rest = [];
  for (let j = i + 1; j < lines.length && lines[j].startsWith("  "); j++) rest.push(lines[j].trim());
  return { line: lines[i], message: lines[i].slice(lines[i].indexOf("problem: ") + "problem: ".length), fixes: rest };
}

function expectDiagnostic(stderr, key, at, what) {
  const d = diagnosticFor(stderr, key);
  if (d === null) throw new Error(`${what}: no located problem naming ${key}\nstderr:\n${stderr}`);
  if (!d.line.startsWith(`${at}: problem: `)) {
    throw new Error(`${what}: expected ${key} located at ${at}, got:\n${d.line}`);
  }
  return d;
}

/** Every located diagnostic line, whatever it says — for the pages nothing may be said about. */
const problems = (stderr) => stderr.split("\n").filter((l) => / problem: /.test(l));

function expectSilent(r, what) {
  const said = problems(r.stderr);
  if (said.length !== 0) throw new Error(`${what}: a correct page was diagnosed\n${said.join("\n")}`);
}

/** The finding ids the audit report declares, in the order printed (§24.5). */
const ids = (stdout) => [...stdout.matchAll(/\[([a-z0-9-]+)\]$/gm)].map((m) => m[1]);

function expectFinding(r, id, what, file = "") {
  const lines = r.stdout.split("\n");
  const i = lines.findIndex((l) => l.endsWith(`[${id}]`) && l.startsWith(file));
  if (i === -1) {
    throw new Error(`${what}: expected a ${id} finding${file ? ` on ${file}` : ""}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
  return { line: lines[i], fix: lines[i + 1] };
}

function expectNoFinding(r, id, what) {
  if (ids(r.stdout).includes(id)) throw new Error(`${what}: expected NO ${id} finding\nstdout:\n${r.stdout}`);
}

/** A vacuity guard: silence about a page unify never emitted proves nothing. */
function expectEmitted(tmp, ...names) {
  for (const name of names) {
    if (!existsSync(join(tmp, "dist", name))) {
      throw new Error(`the fixture is vacuous: dist/${name} was never emitted (dist holds ${
        existsSync(join(tmp, "dist")) ? readdirSync(join(tmp, "dist")).join(", ") : "nothing"})`);
    }
  }
}

/**
 * The shared shape of §28.1's three problems, run once per key so each is its
 * own claim. The tree is built CLEAN first and the published bytes snapshotted;
 * then the counter-prior key is added *and the page's visible text changed*, so
 * that an implementation which published anyway is caught by the snapshot
 * rather than by an absence. Returns the blocked run and the diagnostic.
 */
async function firesAtItsKey(key, value, what) {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("post"),
    "post.md": md("Post", []),
  });
  expectExit(await runCli(["build", "-s", "src", "-o", "dist"], tmp), 0, `${what}: the clean build the fixture starts from`);
  expectEmitted(tmp, "post.html");
  const before = snapshot(join(tmp, "dist"));

  // `title` is line 2, so the added key is line 3 — the key's OWN line, which
  // §28.1 locates the problem at.
  writeTree(join(tmp, "src"), { "post.md": md("Post", [`${key}: ${value}`], "Rewritten.") });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);

  expectExit(r, 1, `${what}: §28.1 is a problem, not an advisory`);
  const d = expectDiagnostic(r.stderr, key, "src/post.md:3", what);
  expectUntouched(before, snapshot(join(tmp, "dist")), what);
  return { r, d, text: [d.message, ...d.fixes].join("\n") };
}

// ============================================================ §28.1 — P24
// The three that are problems. One test per key: each message names a
// DIFFERENT unify mechanism, and one shared "unsupported key" sentence would
// leave the author with none of them.

test("P24 — draft is a problem at its own frontmatter line, and names the underscore that holds a page back", async () => {
  // §28.1 calls draft the sharpest of the three: the author's intent is that
  // this page NOT be published, and unify publishes it — the content-loss
  // law's mirror image, and worse in one respect, since a dropped page is
  // visible in the output listing and an unintended one is not.
  const { text } = await firesAtItsKey("draft", "true", "§28.1: draft");
  if (!/underscore/i.test(text) || !text.includes("_post.md")) {
    throw new Error(`§28.1: the draft message must name the underscore, spelled for THIS file (_post.md):\n${text}`);
  }
  covers("P24");
}, TEST_MS);

test("P24 — permalink is a problem at its own frontmatter line, and names the source path and --pretty-urls", async () => {
  const { text } = await firesAtItsKey("permalink", "/custom/", "§28.1: permalink");
  if (!/source (file|path)/i.test(text)) {
    throw new Error(`§28.1: the permalink message must name the source path as this page's address:\n${text}`);
  }
  if (!text.includes("--pretty-urls")) {
    throw new Error(`§28.1: the permalink message must name the one site-wide address rewrite unify has:\n${text}`);
  }
  covers("P24");
}, TEST_MS);

test("P24 — slug is a problem at its own frontmatter line, and names renaming the source file", async () => {
  const { text } = await firesAtItsKey("slug", "junky", "§28.1: slug");
  if (!/rename/i.test(text) || !/source (file|path)/i.test(text)) {
    throw new Error(`§28.1: the slug message must name renaming the source file to change the last segment:\n${text}`);
  }
  covers("P24");
}, TEST_MS);

test("P24 — the key is the problem whatever its value: draft: false is P24 too", async () => {
  // This is the claim a plausible-wrong implementation gets wrong, and §28.1
  // argues it explicitly rather than leaving it to be inferred. `draft: false`
  // produces no wrong outcome TODAY — nothing is withheld, so nothing is
  // published against the author's intent — and reporting it still earns its
  // place, because the belief it expresses is that unify HAS a draft
  // mechanism. A diagnostic that waits for the value to become dangerous is a
  // diagnostic that fires after the mistake has shipped. One rule, one
  // message, no value parsing: an implementation that reads the value at all
  // has already built the machine §28.1 refuses.
  const { d } = await firesAtItsKey("draft", "false", "§28.1: draft: false");
  if (/\bfalse\b/.test(d.message) && !/\bdraft\b/.test(d.message)) {
    throw new Error(`§28.1: the message is about the key, not the value:\n${d.line}`);
  }
  covers("P24");
}, TEST_MS);

test("P24 — nothing is published at all: a first build carrying draft leaves no output directory", async () => {
  // §15 stated at its starting point: with no previous output to preserve, the
  // untouched state IS the absent directory. The page the author meant to
  // withhold is the one that would otherwise ship, so this is §28.1's whole
  // subject read from the filesystem.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("post"),
    "post.md": md("Post", ["draft: true"]),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "§28.1 on a first build");
  expectDiagnostic(r.stderr, "draft", "src/post.md:3", "§28.1");
  if (existsSync(join(tmp, "dist"))) {
    throw new Error(`§15: a build that raised a problem created dist/ (holding ${readdirSync(join(tmp, "dist")).join(", ")})`);
  }
  covers("P24");
}, TEST_MS);

// ------------------------------------------------- §28.1 — the neighbours

test("P24 — scope is frontmatter: an HTML page's <meta name=draft> is ordinary metadata and ships", async () => {
  // §28.1's deliberate opposite of §26.4's P23. The prior is a FRONTMATTER
  // prior: no generator reads `<meta name="draft">`, so an HTML author who
  // writes one is writing an ordinary meta about their own content. `schema`
  // is unify's own key and must mean one thing in both spellings; `draft` is
  // another tool's key, and only one of the two spellings carries the
  // mistaken belief. A P24 here would be a diagnostic on a correct page.
  const tmp = mkTmp();
  const metas = [
    '<meta name="draft" content="true">',
    '<meta name="permalink" content="/custom/">',
    '<meta name="slug" content="junky">',
  ];
  writeTree(join(tmp, "src"), {
    "index.html": home("post"),
    "post.html": page("Post", `${metas.join("\n")}\n`),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "§28.1: an HTML page's own metas");
  expectSilent(r, "§28.1: an HTML page declaring draft/permalink/slug");
  expectEmitted(tmp, "post.html");

  const out = read(tmp, "dist", "post.html");
  for (const meta of metas) {
    if (!out.includes(meta)) throw new Error(`§28.1: unify edited the author's markup — ${meta} is missing:\n${out}`);
  }
  covers("P24");
}, TEST_MS);

test("P24 — a .md file included as a fragment has its frontmatter stripped and never validated", async () => {
  // §5.1 step 4, restated by §28.1 "here as everywhere": the data is provably
  // unused, and a shared fragment must not make an unrelated page's build
  // depend on metadata nobody reads.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("post"),
    "post.md": md("Post", [], '<include src="/_includes/note.md"></include>'),
    "_includes/note.md": "---\ndraft: true\npermalink: /nope/\nslug: nope\n---\n\nA shared note.\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "§5.1 step 4: a fragment's stripped frontmatter");
  expectSilent(r, "§28.1: a fragment carrying all three keys");
  expectEmitted(tmp, "post.html");

  const out = read(tmp, "dist", "post.html");
  if (!out.includes("A shared note.")) throw new Error(`the fixture is vacuous — the fragment never spliced:\n${out}`);
  if (out.includes("draft")) throw new Error(`§5.1 step 4: the fragment's frontmatter leaked into the page:\n${out}`);
  covers("P24");
}, TEST_MS);

test("P24 — a key that merely contains one of the names is not that key, and a page with none of them is silent", async () => {
  // "Not to reserve ordinary metadata names without cause" (§28's own
  // opening). `drafts`, `permalink_style` and `sluggify` are three keys no
  // generator's prior attaches to, and they take §10.2's ordinary path: one
  // `<meta name=…>` each, and no diagnostic. A substring test instead of an
  // exact key match is the plausible-wrong implementation here, and it would
  // block the publish of every page below.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("near", "plain"),
    "near.md": md("Near", ["drafts: true", "permalink_style: pretty", "sluggify: yes"]),
    "plain.md": md("Plain", ["description: A page carrying no counter-prior key at all."]),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "§28.1: three near-miss keys and a page with none");
  expectSilent(r, "§28.1: near-miss keys and an ordinary page");
  expectEmitted(tmp, "near.html", "plain.html");

  const out = read(tmp, "dist", "near.html");
  for (const meta of [
    '<meta name="drafts" content="true">',
    '<meta name="permalink_style" content="pretty">',
    '<meta name="sluggify" content="yes">',
  ]) {
    if (!out.includes(meta)) throw new Error(`§10.2: a key unify does not claim becomes a plain meta — ${meta} is missing:\n${out}`);
  }
  covers("P24");
}, TEST_MS);

test("P24 — a mapping under the key RENAMES it (§10.2), and both spellings of that agree", async () => {
  // §28.1: "which key a spelling names is §10.2's question, not this section's".
  // §10.2 makes `draft:nested: yes` and `draft:` over an indented `nested: yes`
  // identical IN EVERY RESPECT, so the two must agree here too — and until
  // 2026-08-19 they did not: the flat spelling built clean and the block
  // spelling was P24, on a page declaring no `draft` key at all. The mirror
  // direction (`og:` over an indented `draft:`) is the same rule read from its
  // other end, so it is asserted beside it rather than in a test of its own.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("block", "flat", "prefixed"),
    "block.md": md("Block", ["draft:\n  nested: yes"]),
    "flat.md": md("Flat", ["draft:nested: yes"]),
    "prefixed.md": md("Prefixed", ["og:\n  draft: true\n  slug: x"]),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "§10.2: a mapping under draft names draft:<child>");
  expectSilent(r, "§28.1: three pages that declare no counter-prior key");
  expectEmitted(tmp, "block.html", "flat.html", "prefixed.html");

  // The equivalence itself, from the emitted bytes: the same meta either way.
  const declared = '<meta name="draft:nested" content="yes">';
  for (const name of ["block.html", "flat.html"]) {
    const out = read(tmp, "dist", name);
    if (!out.includes(declared)) {
      throw new Error(`§10.2: ${name} must emit ${declared} — the key a mapping under draft: names:\n${out}`);
    }
    if (/name="draft"/.test(out)) {
      throw new Error(`§10.2: ${name} emitted a bare draft meta, so the key was never renamed:\n${out}`);
    }
  }
  const prefixed = read(tmp, "dist", "prefixed.html");
  for (const meta of ['<meta property="og:draft" content="true">', '<meta property="og:slug" content="x">']) {
    if (!prefixed.includes(meta)) throw new Error(`§10.2: the og: block must name og:draft/og:slug — ${meta} is missing:\n${prefixed}`);
  }
  covers("P24");
}, TEST_MS);

test("P24 — the key's own line survives a quoted key and whitespace before the colon (§14.1)", async () => {
  // §28.1 locates P24 AT THE KEY, and §14.1 permits the line-less
  // `FILE: SEVERITY:` form only "where a position cannot be mapped back to a
  // line of the named file". Frontmatter is never converted (§10.1), so every
  // one of these keys has a real file line: `"draft": true`, `draft : true`
  // and `'permalink': /x/` are the same declarations YAML reads as the plain
  // spelling, on line 3 of their own files. Until 2026-08-19 all three printed
  // no line at all — checkable-looking wording with the checkable part missing.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("quoted", "spaced", "single", "nested"),
    "quoted.md": md("Quoted", ['"draft": true']),
    "spaced.md": md("Spaced", ["draft : true"]),
    "single.md": md("Single", ["'permalink': /custom/"]),
    // The same index answers P17, so the same gap lost ITS line too.
    "nested.md": md("Nested", ['"og:image":\n  a:\n    b: 1']),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "§28.1: quoted and spaced keys are the same declarations");

  // One page per spelling, so each claim is read off that page's own line —
  // the shared helper above finds the first diagnostic naming a key, which
  // four pages naming two keys would let stand in for one another.
  const located = (file, key, what) => {
    const line = r.stderr.split("\n").find((l) => l.startsWith(`src/${file}:`) && / problem: /.test(l));
    if (line === undefined) {
      throw new Error(`${what}: no problem reported for src/${file}\nstderr:\n${r.stderr}`);
    }
    if (!line.startsWith(`src/${file}:3: problem: `)) {
      throw new Error(`${what}: §28.1 locates this AT THE KEY, which is line 3 of src/${file}:\n${line}`);
    }
    if (!line.slice(line.indexOf("problem: ")).includes(key)) {
      throw new Error(`${what}: the message must name ${key}:\n${line}`);
    }
  };
  located("quoted.md", "draft", "§28.1: a double-quoted key");
  located("spaced.md", "draft", "§28.1: whitespace before the colon");
  located("single.md", "permalink", "§28.1: a single-quoted key");
  located("nested.md", "og:image", "§10.2/P17: a quoted key naming a nested block");
  covers("P24", "P17");
}, TEST_MS);

// =============================================== §28.2 — MAN-13 and AUD-15
// The two that are findings: they describe content, and a site may legitimately
// emit them. What they must not do is IMPLY a collection.

test("AUD-15 — tags and categories build fine and draw one taxonomy-inert per page, keys in sorted order", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("post", "hand", "bare"),
    // A list value emits one meta per item (§10.2) — still ONE finding, because
    // "this page's taxonomy built nothing" is one fact however many tags spell it.
    "post.md": md("Post", ["description: A post about tagging.", "lang: en", "tags:\n  - a\n  - b", "categories: notes"]),
    // §28.2's "the key declares it whatever its value", which is §28.1's rule
    // read for the finding: a bare `tags:` emits `<meta name="tags" content="">`
    // (§10.2's empty value) and expresses the same belief in a collection. This
    // is the one place a taxonomyKeys entry parts company with its neighbours in
    // §20.3's table, which read a value and record null when it is empty.
    "bare.md": md("Bare", ["description: A page whose tags key carries no value.", "lang: en", "tags:"]),
    // §28.2 reads the EMITTED document, so an HTML page writing the meta by
    // hand collects the same finding — that is what keeps the sentence true of
    // it, and it is the closed-set rule's own consequence.
    "hand.html": page("Hand", '<meta name="tags" content="a">\n'),
  });

  // The keys are ordinary metadata: the build is clean and both pages publish.
  const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(built, 0, "§28.2: tags and categories are not addressed to the build");
  expectSilent(built, "§28.2: a page declaring tags and categories");
  expectEmitted(tmp, "post.html", "hand.html", "bare.html");
  if (!read(tmp, "dist", "bare.html").includes('<meta name="tags" content="">')) {
    throw new Error(`§10.2: a bare 'tags:' emits an empty-valued meta, which is what §28.2 reads as a declaration:\n${read(tmp, "dist", "bare.html")}`);
  }
  const out = read(tmp, "dist", "post.html");
  for (const meta of [
    '<meta name="tags" content="a">',
    '<meta name="tags" content="b">',
    '<meta name="categories" content="notes">',
  ]) {
    if (!out.includes(meta)) throw new Error(`§10.2: ${meta} must ship as an ordinary meta:\n${out}`);
  }

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "§24.6: findings without --strict never change the exit code");

  const post = expectFinding(r, "taxonomy-inert", "§28.2: a Markdown page declaring both keys", "post.md:");
  if (!post.line.startsWith("post.md: incomplete: ")) {
    throw new Error(`§28.2: incomplete rather than broken — nothing about the page is wrong:\n${post.line}`);
  }
  // Both keys, in ONE finding, in sorted order.
  const at = ["categories", "tags"].map((k) => post.line.indexOf(k));
  if (at[0] === -1 || at[1] === -1 || at[0] > at[1]) {
    throw new Error(`§28.2: the finding names the keys it declares in sorted order:\n${post.line}`);
  }
  // The evidence says what did NOT happen. What is absent is a mechanism the
  // author may have been expecting, which is §24.3's own line.
  for (const absent of [/index/i, /archive/i, /feed/i, /route/i]) {
    if (!absent.test(post.line)) {
      throw new Error(`§28.2: the evidence must say what did not happen (no index page, no archive, no feed of that term, no route):\n${post.line}`);
    }
  }

  const hand = expectFinding(r, "taxonomy-inert", "§28.2: a hand-written meta collects the same finding", "hand.html:");
  if (!hand.line.startsWith("hand.html: incomplete: ")) {
    throw new Error(`§28.2: the HTML page's finding is the same finding, at the same severity:\n${hand.line}`);
  }
  const bare = expectFinding(r, "taxonomy-inert", "§28.2: the key declares it whatever its value", "bare.md:");
  if (!bare.line.startsWith("bare.md: incomplete: ")) {
    throw new Error(`§28.2: an empty-valued key is the same finding at the same severity:\n${bare.line}`);
  }
  const fired = ids(r.stdout).filter((id) => id === "taxonomy-inert");
  if (fired.length !== 3) {
    throw new Error(`§28.2: one finding PER PAGE — expected 3 (post.md, hand.html, bare.md), got ${fired.length}\n${r.stdout}`);
  }
  covers("AUD-15");
}, TEST_MS);

test("MAN-13 — taxonomyKeys is head-scoped and closed: a body meta and a fourth key name declare nothing", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("body", "other", "none"),
    // §20.3's head scope, which §28.2 inherits by reading `the emitted head`.
    // A `<meta name="tags">` in the BODY is inert — no consumer reads it there,
    // so it implies no collection either, and taxonomy-inert must not fire.
    "body.html": page("Body", "", '<p>Words.</p>\n<meta name="tags" content="a">'),
    // Nor does anything ELSE happen to it: §24.4's metadata-in-body names a
    // CLOSED set — <title>, <base>, <meta charset>, <link rel="canonical">,
    // and <meta> carrying description, robots, schema, og:* or twitter:* — and
    // `tags` is in none of them, so the body meta draws no finding at all.
    "other.html": page("Other", '<meta name="keywords" content="a, b">\n<meta name="taxonomy" content="notes">\n'),
    "none.html": page("None"),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a site whose heads declare no taxonomy key");
  expectNoFinding(r, "taxonomy-inert", "§20.3/§28.2: head scope, and a closed set of exactly {tags, categories}");
  expectNoFinding(r, "metadata-in-body", "§24.4: `tags` is not in metadata-in-body's closed set");

  // Vacuity guard: the pages have to have been read for the silence to mean
  // anything, so build the same tree and check they emitted.
  expectExit(await runCli(["build", "-s", "src", "-o", "dist"], tmp), 0, "the same tree, published");
  expectEmitted(tmp, "body.html", "other.html", "none.html");
  if (!read(tmp, "dist", "body.html").includes('<meta name="tags" content="a">')) {
    throw new Error("the fixture is vacuous: the body meta never reached the emitted page");
  }
  covers("MAN-13");
}, TEST_MS);

test("AUD-15 — --strict gates the finding, and build never consults it", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("post"),
    "post.md": md("Post", ["description: A post about tagging.", "lang: en", "tags: a"]),
  });
  const strict = await runCli(["audit", "-s", "src", "-o", "dist", "--strict"], tmp);
  expectExit(strict, 1, "§24.6: any finding, of either severity, under --strict");
  expectFinding(strict, "taxonomy-inert", "§28.2 under --strict");

  // §24.7: `build` derives the manifest and never calls the evaluator, so the
  // same tree publishes — under --strict — with no mention of the finding on
  // either stream.
  const built = await runCli(["build", "-s", "src", "-o", "dist", "--strict"], tmp);
  expectExit(built, 0, "§24.7: build never audits");
  if (`${built.stdout}${built.stderr}`.includes("taxonomy-inert")) {
    throw new Error(`§24.7: build reported an audit finding:\n${built.stdout}\n${built.stderr}`);
  }
  expectEmitted(tmp, "post.html");
  covers("AUD-15");
}, TEST_MS);

// ========================================================= §28.3 — CPR-01
// The four diagnostics product-spec §6.3.9 requires to remain mandatory, and
// the counterexample that keeps the section honest.

test("CPR-01 — a bare layout name is still P04 and a non-empty <include> is still P03", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // The include sits on line 10 of `page()`: doctype, <html>, <head>,
    // charset, title, description, </head>, <body>, <h1>, then the body.
    "index.html": page("Home", "", '<include src="/_includes/nav.html">fill</include>\n<a href="/post.html">Post</a>'),
    "_includes/nav.html": '<nav><a href="/index.html">Home</a></nav>\n',
    "post.md": md("Post", ["layout: default"]),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "§28.3: a bare layout name beside a non-empty include");

  // P04 (§6.1): a layout reference that is not a `.html` path, diagnosed
  // before any existence check.
  const layout = expectDiagnostic(r.stderr, "layout", "src/post.md:3", "CPR-01: P04");
  const layoutText = [layout.message, ...layout.fixes].join("\n");
  if (!layout.message.includes("default")) {
    throw new Error(`CPR-01: P04 must quote the bare value it refused:\n${layout.line}`);
  }
  if (!layoutText.includes(".html")) {
    throw new Error(`CPR-01: P04 must name the path form a layout takes:\n${layoutText}`);
  }

  // §6.3.9 requires a non-empty <include> to keep blocking, and §32 changed
  // WHICH problem does it: the construct now has a meaning, so a target that
  // cannot take content is P25 (not a .fragment.html) or P26 (a fragment with
  // no slot) rather than P03. What the rule actually demands is that this
  // never become a silent no-op — so this asserts the outcome, and that the
  // message names the target, which is the half an author acts on.
  const include = expectDiagnostic(r.stderr, "include", "src/index.html:10", "CPR-01: a non-empty include still blocks");
  const includeText = [include.message, ...include.fixes].join("\n");
  if (!/fragment/i.test(includeText)) {
    throw new Error(`CPR-01: the refusal must name what a non-empty include needs — a fragment with slots:\n${includeText}`);
  }

  if (existsSync(join(tmp, "dist"))) throw new Error("§15: a build with two problems published");
  covers("CPR-01");
}, TEST_MS);

test("CPR-01 — a path-only --base-url is still a usage error, exit 2, before any build", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home") });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "/repo/"], tmp);
  // §11.3: one form, the site's whole address. The bare path was accepted
  // until 2026-08-13, prefixing links correctly while leaving og:/twitter:/
  // canonical root-relative — unusable, since a crawler fetches those with no
  // page address to resolve them against. Deleting the weaker form is the
  // repair; a usage error is exit 2, not a diagnostic.
  expectExit(r, 2, "§11.3: a path-only --base-url");
  if (!r.stderr.includes("--base-url")) throw new Error(`CPR-01: the usage error must name the flag:\n${r.stderr}`);
  if (existsSync(join(tmp, "dist"))) throw new Error("§14.1: exit 2 is invalid usage — nothing is built");
  covers("CPR-01");
}, TEST_MS);

test("CPR-01 — a hand-written pretty URL is still P13, and --pretty-urls does not switch the check off", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "", '<p>Welcome.</p>\n<a href="/about/">About</a>\n<a href="/gone/">Gone</a>'),
    "about.html": page("About"),
  });

  // Without --pretty-urls the site emits `about.html`, so `/about/` names a
  // directory with no `index.html` in it — §12's own "hand-written pretty URL
  // in a non-pretty build", publish-blocking. `/gone/` names nothing either.
  const plain = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(plain, 1, "§28.3: /about/ where the site emits about.html");
  for (const ref of ["/about/", "/gone/"]) {
    if (!plain.stderr.includes(`${ref} does not resolve`)) {
      throw new Error(`CPR-01: P13 must quote the reference it could not resolve (${ref}):\n${plain.stderr}`);
    }
  }
  if (existsSync(join(tmp, "dist"))) throw new Error("§15: a build with a broken reference published");

  // "…and stays P13 whether or not --pretty-urls is set" (§28.3). Under the
  // flag §11.2 moves about.html to about/index.html, so `/about/` is now the
  // address the site serves and reporting it would accuse a correct page —
  // while `/gone/` still names nothing, and is still publish-blocking. The
  // flag changes which URLs resolve; it never switches the check off.
  const pretty = await runCli(["build", "-s", "src", "-o", "dist", "--pretty-urls"], tmp);
  expectExit(pretty, 1, "§28.3: /gone/ under --pretty-urls");
  if (!pretty.stderr.includes("/gone/ does not resolve")) {
    throw new Error(`CPR-01: P13 must still fire under --pretty-urls:\n${pretty.stderr}`);
  }
  if (pretty.stderr.includes("/about/ does not resolve")) {
    throw new Error(`§11.2: under --pretty-urls the site emits about/index.html, so /about/ resolves:\n${pretty.stderr}`);
  }
  covers("CPR-01");
}, TEST_MS);

test("CPR-01 — date and lastmod draw no diagnostic; only a malformed VALUE is reported, by audit", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": home("post"),
    "post.md": md("Post", ["description: A dated post.", "lang: en", "date: 2026-01-01", "lastmod: not-a-date"]),
  });
  // §28.3's counterexample, and the pair that keeps §28 honest about the
  // difference between a key and a value: these two ARE read — §20.3 maps them
  // onto datePublished/dateModified and §26.6 emits them — so they belong to a
  // mechanism unify HAS rather than one it lacks, and the key draws nothing.
  const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(built, 0, "§28.3: date and lastmod carry no diagnostic of their own");
  expectSilent(built, "§28.3: a page declaring date and lastmod");
  expectEmitted(tmp, "post.html");
  const out = read(tmp, "dist", "post.html");
  for (const meta of ['<meta name="date" content="2026-01-01">', '<meta name="lastmod" content="not-a-date">']) {
    if (!out.includes(meta)) throw new Error(`§10.2: both keys are ordinary metas, shipped as the author wrote them — ${meta} is missing:\n${out}`);
  }

  // A malformed one is `date-unusable` (§26.3): a statement about the VALUE,
  // in the command that evaluates output, never a problem about the key. The
  // evidence quotes `raw` — the author's own bytes, the only string they can
  // grep for.
  const audited = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  const finding = expectFinding(audited, "date-unusable", "§28.3: a malformed lastmod", "post.md:");
  if (!finding.line.startsWith("post.md: broken: ")) {
    throw new Error(`§26.3: date-unusable is broken — a value that does not conform to its field's format is wrong regardless of intent:\n${finding.line}`);
  }
  if (!finding.line.includes("not-a-date")) {
    throw new Error(`§26.3: the evidence quotes the value it could not read:\n${finding.line}`);
  }
  // The well-formed one is not reported: one finding per field, and `date` had
  // an `iso`.
  const fired = ids(audited.stdout).filter((id) => id === "date-unusable");
  if (fired.length !== 1) {
    throw new Error(`§26.3: one finding per unusable FIELD — expected 1 (lastmod), got ${fired.length}\n${audited.stdout}`);
  }
  covers("CPR-01");
}, TEST_MS);
