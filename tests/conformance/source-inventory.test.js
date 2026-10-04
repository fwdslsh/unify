/**
 * §33.7 — `--source-inventory`, the opt-in `source-pages.json`. GEN-13..GEN-16.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 *
 * The temp files are gone by the time the CLI exits, so a probe generator
 * copies what it was handed out to a path the test owns, as generate.test.js
 * does for the context.
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectEqual(actual, expected, what) {
  const a = JSON.stringify(actual, null, 2);
  const e = JSON.stringify(expected, null, 2);
  if (a !== e) throw new Error(`${what}:\nexpected ${e}\ngot      ${a}`);
}

/** Writes what it was handed to `probe`, then optionally throws. */
const probeGenerator = (probe, then = "succeed") => `import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const [, , , overlayDir, contextPath] = process.argv;
const context = JSON.parse(readFileSync(contextPath, "utf8"));
const sp = context.inputs.sourcePages;
writeFileSync(${JSON.stringify(probe)}, JSON.stringify({
  context,
  raw: sp === null ? null : readFileSync(sp, "utf8"),
  strayFile: existsSync(join(dirname(overlayDir), "source-pages.json")),
}));
${then === "throw" ? 'throw new Error("boom after reading the inventory");\n' : ""}`;

const head = (title, extra = "") =>
  `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8">${title === null ? "" : `<title>${title}</title>`}${extra}</head>\n<body><h1>x</h1></body>\n</html>\n`;

/** One tree with every eligibility and extraction case in it. */
const SITE = {
  "_scripts/gen.mjs": "// replaced per test\n",
  "_layout.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title> · Site</title></head><body><main></main></body></html>\n',
  "_includes/nav.html": "<nav>n</nav>\n",
  "_drafts/secret.md": "---\ntitle: Secret\n---\n# Secret\n",
  "frag.fragment.html": "<p>a fragment</p>\n",
  "index.html": head("Home", '<meta name="description" content="The front page.">'),
  "articles/example.md": '---\ntitle: "Pruning: a short guide"\ndescription: A plain scalar, as written\ndate: 2026-04-02T09:00:00Z\n---\n# Not the title\n',
  "articles/bare.md": "# Only a heading\n\nNo frontmatter at all.\n",
  "articles/amp.md": "---\ntitle: Tea &amp; Co\ndate: '2026-01-02'\ndescription:\n---\nBody.\n",
  "notes/été/a b.html": head("Fish &amp; Chips &#8212; &eacute;", '<meta name="robots" content="noindex"><meta name="description" content=""><meta name="description" content="Say &quot;hi&quot;"><meta name="date" content="2026-05-06T07:08:09Z">'),
  "notes/untitled.html": head(null),
  "skip/me.md": "---\ntitle: Skipped\n---\nBody.\n",
};

const EXPECTED = [
  { source: "articles/amp.md", href: "/articles/amp.html", title: "Tea &amp; Co", description: null, date: "2026-01-02" },
  { source: "articles/bare.md", href: "/articles/bare.html", title: null, description: null, date: null },
  { source: "articles/example.md", href: "/articles/example.html", title: "Pruning: a short guide", description: "A plain scalar, as written", date: "2026-04-02T09:00:00Z" },
  { source: "index.html", href: "/index.html", title: "Home", description: "The front page.", date: null },
  { source: "notes/untitled.html", href: "/notes/untitled.html", title: null, description: null, date: null },
  { source: "notes/été/a b.html", href: "/notes/été/a b.html", title: "Fish & Chips — é", description: 'Say "hi"', date: "2026-05-06T07:08:09Z" },
];

async function probeSite(tmp, extraArgs = [], then = "succeed", command = "build") {
  const probe = join(tmp, "probe.json");
  writeTree(join(tmp, "src"), { ...SITE, "_scripts/gen.mjs": probeGenerator(probe, then) });
  const r = await runCli([command, "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", ...extraArgs], tmp);
  return { r, probe };
}

test("GEN-13 — with source-inventory: false, inputs.sourcePages is null, no file is written, and the output is the same bytes as the default (on)", async () => {
  const off = mkTmp();
  // The inventory is on whenever a generator is named; the saved `false` is
  // the opt-out, and the flag on the command line is the same as the default.
  writeTree(off, { "unify.yaml": "source-inventory: false\n" });
  const { r: rOff, probe: probeOff } = await probeSite(off, ["--exclude", "_*", "--exclude", "skip"]);
  expectExit(rOff, 0, "a build with source-inventory: false");
  const seen = JSON.parse(readFileSync(probeOff, "utf8"));
  expectEqual(seen.context.inputs, { sourcePages: null }, "inputs with source-inventory: false");
  expectEqual(Object.keys(seen.context), ["schemaVersion", "unifyVersion", "command", "paths", "site", "outputs", "inputs"], "context key order");
  if (seen.context.schemaVersion !== 1) throw new Error("schemaVersion stays 1: the field is additive");
  if (seen.strayFile) throw new Error("source-pages.json must not exist when the inventory is off");

  const on = mkTmp();
  const { r: rOn, probe: probeOn } = await probeSite(on, ["--exclude", "_*", "--exclude", "skip"]);
  expectExit(rOn, 0, "a build with a generator and no flag — the inventory is on by default");
  if (typeof JSON.parse(readFileSync(probeOn, "utf8")).context.inputs.sourcePages !== "string") {
    throw new Error("§33.7: a generator gets source-pages.json by default");
  }
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)).map((p) => join(e.name, p)) : [e.name]).sort();
  const filesOff = walk(join(off, "dist"));
  expectEqual(walk(join(on, "dist")), filesOff, "the flag adds and removes no output file");
  for (const f of filesOff) {
    if (readFileSync(join(off, "dist", f), "utf8") !== readFileSync(join(on, "dist", f), "utf8")) {
      throw new Error(`dist/${f} differs with the flag on`);
    }
  }
  if (filesOff.some((f) => f.includes("source-pages"))) throw new Error("source-pages.json must never publish");
  covers("GEN-13");
}, TEST_MS);

test("GEN-14 — the inventory lists every source page with its authored fields, sorted, and nothing else", async () => {
  const tmp = mkTmp();
  const { r, probe } = await probeSite(tmp, ["--exclude", "_*", "--exclude", "skip", "--source-inventory"]);
  expectExit(r, 0, "a build with --source-inventory");
  const seen = JSON.parse(readFileSync(probe, "utf8"));
  if (typeof seen.context.inputs.sourcePages !== "string" || !seen.context.inputs.sourcePages.startsWith("/")) {
    throw new Error(`inputs.sourcePages must be an absolute path: ${JSON.stringify(seen.context.inputs)}`);
  }
  if (!seen.raw.endsWith("}\n") || !seen.raw.includes('\n  "pages": [\n')) throw new Error(`two-space JSON, trailing newline:\n${seen.raw}`);
  const inventory = JSON.parse(seen.raw);
  expectEqual(Object.keys(inventory), ["schemaVersion", "pages"], "top-level keys");
  expectEqual(inventory.schemaVersion, 1, "schemaVersion");
  for (const p of inventory.pages) {
    expectEqual(Object.keys(p), ["source", "href", "title", "description", "date", "meta", "links"], `keys of ${p.source}`);
  }
  // meta/links are GEN-17's subject; here, the five 0.9.3 fields are unchanged.
  const fields = inventory.pages.map(({ meta, links, ...rest }) => rest);
  expectEqual(fields, EXPECTED, "the records (_-prefixed, excluded and fragment files absent; noindex present)");
  covers("GEN-14");
}, TEST_MS);

test("GEN-14 — --exclude removes a page and the default underscore rule is the build's own", async () => {
  // With the default exclude (`_*`) only, `skip/me.md` is a page and is listed.
  const tmp = mkTmp();
  const { r, probe } = await probeSite(tmp, ["--source-inventory"]);
  expectExit(r, 0, "default exclude");
  const sources = JSON.parse(JSON.parse(readFileSync(probe, "utf8")).raw).pages.map((p) => p.source);
  if (!sources.includes("skip/me.md")) throw new Error(`skip/me.md is a page without --exclude: ${sources}`);
  for (const gone of ["_layout.html", "_includes/nav.html", "_drafts/secret.md", "frag.fragment.html", "_scripts/gen.mjs"]) {
    if (sources.includes(gone)) throw new Error(`${gone} must not be in the inventory: ${sources}`);
  }
  covers("GEN-14");
}, TEST_MS);

test("GEN-14 — the flag and the same bytes apply under audit, and saved as source-inventory: true", async () => {
  const tmp = mkTmp();
  const probe = join(tmp, "probe.json");
  writeTree(join(tmp, "src"), {
    "index.html": head("Home", '<meta name="description" content="d">'),
    "_scripts/gen.mjs": probeGenerator(probe),
    "unify.yaml": "generate: _scripts/gen.mjs\nsource-inventory: true\n",
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit with the saved flag");
  const seen = JSON.parse(readFileSync(probe, "utf8"));
  expectEqual(seen.context.command, "audit", "command");
  expectEqual(JSON.parse(seen.raw).pages.map((p) => p.source), ["index.html"], "the saved flag applies");
  covers("GEN-14");
}, TEST_MS);

test("GEN-15 — two runs give the same bytes, and the file is gone after a success and after a generator failure", async () => {
  const a = mkTmp();
  const b = mkTmp();
  const { r: ra, probe: pa } = await probeSite(a, ["--source-inventory"]);
  const { r: rb, probe: pb } = await probeSite(b, ["--source-inventory"]);
  expectExit(ra, 0, "first run");
  expectExit(rb, 0, "second run");
  const rawA = JSON.parse(readFileSync(pa, "utf8")).raw;
  if (rawA !== JSON.parse(readFileSync(pb, "utf8")).raw) throw new Error("two runs must produce identical bytes");
  const okPath = JSON.parse(readFileSync(pa, "utf8")).context.inputs.sourcePages;
  if (existsSync(okPath)) throw new Error(`source-pages.json must not survive a successful build: ${okPath}`);

  const f = mkTmp();
  const { r: rf, probe: pf } = await probeSite(f, ["--source-inventory"], "throw");
  expectExit(rf, 1, "a failing generator");
  const failPath = JSON.parse(readFileSync(pf, "utf8")).context.inputs.sourcePages;
  if (existsSync(failPath)) throw new Error(`source-pages.json must not survive a generator failure: ${failPath}`);
  covers("GEN-15");
}, TEST_MS);

test("GEN-16 — the flag without a generator is inert: same output, nothing written, no message", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": head("Home", '<meta name="description" content="d">') });
  const plain = await runCli(["build", "-s", "src", "-o", "plain"], tmp);
  expectExit(plain, 0, "the build without the flag");
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--source-inventory"], tmp);
  expectExit(r, 0, "--source-inventory with no --generate is inert, not an error");
  if (readFileSync(join(tmp, "dist", "index.html"), "utf8") !== readFileSync(join(tmp, "plain", "index.html"), "utf8")) {
    throw new Error("the output must be byte-identical with and without the inert flag");
  }
  if (readdirSync(join(tmp, "dist")).length !== 1) throw new Error(`nothing extra is written: ${readdirSync(join(tmp, "dist")).join(", ")}`);
  // A saved source-inventory: true, with the generator supplied per command, is the point.
  writeTree(join(tmp, "src"), { "unify.yaml": "source-inventory: true\n" });
  const saved = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(saved, 0, "a saved source-inventory: true with no generator");
  covers("GEN-16");
}, TEST_MS);

test("GEN-16 — frontmatter the build would refuse is reported located, and the generator never runs", async () => {
  const tmp = mkTmp();
  const probe = join(tmp, "probe.json");
  writeTree(join(tmp, "src"), {
    "index.html": head("Home", '<meta name="description" content="d">'),
    "bad.md": "---\ntitle: Something: with a colon\n---\nBody.\n",
    "worse.md": "---\ntitle: ok\nog:image:\n  nested: x\n  deeper:\n    y: z\n---\nBody.\n",
    "_scripts/gen.mjs": probeGenerator(probe),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--source-inventory"], tmp);
  expectExit(r, 1, "bad frontmatter");
  if (!/bad\.md:\d+: problem: frontmatter is not valid YAML/.test(r.stderr + r.stdout)) {
    throw new Error(`the build's own located message:\n${r.stdout}\n${r.stderr}`);
  }
  if (!/worse\.md:\d+: problem: frontmatter og:image is a nested block/.test(r.stderr + r.stdout)) {
    throw new Error(`a P17 shape is reported the build's way too:\n${r.stdout}\n${r.stderr}`);
  }
  if (existsSync(probe)) throw new Error("the generator must not run after an inventory problem");
  if (existsSync(join(tmp, "dist"))) throw new Error("nothing publishes");
  covers("GEN-16");
}, TEST_MS);

test("GEN-17 — meta and links: the page's own head records, in order, equivalent for Markdown and HTML, with no meaning added", async () => {
  const tmp = mkTmp();
  const probe = join(tmp, "probe.json");
  writeTree(join(tmp, "src"), {
    "_layout.html": '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="layout-only" content="x"><title>- S</title></head><body><main></main></body></html>\n',
    "_includes/extra.html": '<meta name="included" content="no">',
    "_scripts/gen.mjs": probeGenerator(probe),
    "dns.png": "png",
    "fr/b.html": head("FR"),
    "a.md": "---\ntitle: DNS\ndescription: Moving\ntags:\n  - homelab\n  - networking\nseries: \"Lab: simplification\"\npart: 2\nlayout: /_layout.html\nclass: wide\nog:\n  image: /dns.png\n---\n# DNS\n",
    "b.html": head("DNS", '<meta name="description" content="Moving"><meta name="tags" content="homelab"><meta name="tags" content="networking">' +
      '<meta name="series" content="Lab: simplification"><meta name="part" content="2"><meta property="og:image" content="/dns.png">' +
      '<include src="/_includes/extra.html"></include><link rel="canonical" href="https://example.test/b.html"><link rel="alternate" hreflang="fr" href="/fr/b.html">')
      .replace("</body>", '<script>var s = \'<meta name="leak" content="1">\';</script></body>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--source-inventory"], tmp);
  expectExit(r, 0, "a build with meta/links");
  const pages = Object.fromEntries(JSON.parse(JSON.parse(readFileSync(probe, "utf8")).raw).pages.map((p) => [p.source, p]));
  const authored = [
    { name: "description", content: "Moving" },
    { name: "tags", content: "homelab" },
    { name: "tags", content: "networking" },
    { name: "series", content: "Lab: simplification" },
    { name: "part", content: "2" },
    { property: "og:image", content: "/dns.png" },
  ];
  // Markdown: what its frontmatter emits; title/layout/class are not metas; no <link> syntax.
  expectEqual(pages["a.md"].meta, authored, "a.md meta");
  expectEqual(pages["a.md"].links, [], "a.md links");
  // HTML: the page's own head as written. No layout meta, no included meta, nothing from a script body.
  expectEqual(pages["b.html"].meta.filter((m) => !("charset" in m)), authored, "b.html meta");
  expectEqual(pages["b.html"].links, [
    { rel: "canonical", href: "https://example.test/b.html" },
    { rel: "alternate", hreflang: "fr", href: "/fr/b.html" },
  ], "b.html links: kept as written, not resolved");
  covers("GEN-17");
}, TEST_MS);
