/**
 * §33 — `--generate <path>`, the one-process generator seam. GEN-01..07, P29.
 *
 * The flag's whole posture is that it names a FILE, never a command, so the
 * tests are written against that: what the generator receives, where its
 * output goes, what happens when it fails, and what it cannot reach.
 *
 * Three of these pin consequences §33.2 calls normative rather than
 * incidental — `process.exit()` ends the build, a throw is P29, and every
 * rebuild re-loads the module fresh. The third is the one a plausible
 * implementation gets wrong, and it is silent when it does: an ES module
 * cache returning the first build's copy makes every rebuild after the first
 * skip the generator WHILE REPORTING SUCCESS.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

const doc = (title, body) =>
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title><meta name="description" content="The ${title} page."></head>
<body>${body}</body>
</html>
`;

/** A generator that writes one page into the overlay it is handed. */
const writesOnePage = `import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [, , sourceRoot, outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "generated.html"),
  \`<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Generated</title><meta name="description" content="Made by a script."></head><body><h1>Generated</h1><p>root=\${sourceRoot.length > 0}</p></body></html>\\n\`);
`;

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectContains(haystack, needle, what) {
  if (!haystack.includes(needle)) throw new Error(`${what}: expected ${JSON.stringify(needle)} in:\n${haystack}`);
}

// ------------------------------------------------------------------- GEN-01

test("GEN-01 — the flag names a file inside the source root, and a path escaping it is a usage error", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": doc("Home", "<h1>Home</h1>") });
  writeTree(tmp, { "outside.mjs": "// never run\n" });

  const escaped = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "../outside.mjs"], tmp);
  // A usage error, not a diagnostic: nothing about the SITE is wrong, the
  // invocation is — §4.3's containment rule, the same one includes and
  // layouts obey.
  expectExit(escaped, 2, "a generator outside the source root");
  expectContains(`${escaped.stdout}${escaped.stderr}`, "outside the source root", "the message says why");
  if (existsSync(join(tmp, "dist"))) throw new Error("a usage error must not have built anything");
  covers("GEN-01");
}, TEST_MS);

// ------------------------------------------------------------- GEN-02 / GEN-06

test("GEN-02 — the contract is argv[2] and argv[3], with the source root as cwd", async () => {
  // The whole interface: no module to import, no object passed in, no return
  // value read. The generator below proves each half by writing what it got.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", '<h1>Home</h1><a href="/report.html">r</a>'),
    "_data/note.txt": "read me relatively\n",
    "_scripts/gen.mjs": `import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
const [, , sourceRoot, outDir] = process.argv;
// cwd is the SOURCE ROOT (§33.2), so a relative read means what an author
// reading the source tree would expect.
const viaCwd = readFileSync("./_data/note.txt", "utf8").trim();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "report.html"),
  \`<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Report</title><meta name="description" content="What the generator received."></head><body><h1>Report</h1><p id="a">\${isAbsolute(sourceRoot)}</p><p id="b">\${isAbsolute(outDir)}</p><p id="c">\${viaCwd}</p><p id="d">\${outDir.startsWith(sourceRoot) ? "inside" : "outside"}</p></body></html>\\n\`);
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "a generator that reads its two arguments");
  const out = readFileSync(join(tmp, "dist", "report.html"), "utf8");
  expectContains(out, '<p id="a">true</p>', "argv[2] is an ABSOLUTE source root");
  expectContains(out, '<p id="b">true</p>', "argv[3] is an ABSOLUTE overlay directory");
  expectContains(out, '<p id="c">read me relatively</p>', "the working directory is the source root");
  // §33.3 — the overlay is OUTSIDE the source tree, which is what keeps src/
  // unmutated and the watcher unable to see it.
  expectContains(out, '<p id="d">outside</p>', "the overlay directory is outside the source root");
  covers("GEN-02", "GEN-06");
}, TEST_MS);

// ------------------------------------------------------------------- GEN-03

test("P29 — a generator that throws stops the build BEFORE the scan, and SAYS SO", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/bad.mjs": 'throw new Error("boom from the generator");\n',
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/bad.mjs"], tmp);
  expectExit(r, 1, "a throwing generator is a build failure");
  if (existsSync(join(tmp, "dist"))) throw new Error("§15: a partial overlay is a site nobody described");

  // The half that was missing on the first run: it exited 1 and printed
  // NOTHING, because the early return skipped the reporting step every other
  // exit passes through. A silent failure is worse than the fault it hides.
  expectContains(r.stderr, "problem:", "P29 is reported, not merely exited on");
  expectContains(r.stderr, "boom from the generator", "the thrown message reaches the author");
  expectContains(r.stderr, "_scripts/bad.mjs", "located at the generator's own path");
  // The runtime wraps a thrown error in a code frame, a caret and stack
  // frames, and the author's message sits in the MIDDLE of that. Taking the
  // tail of stderr put `at loadAndEvaluateModule / Bun v1.3.11` here instead,
  // which is technically the end of the output and useless to the person who
  // has to fix it.
  if (/at loadAndEvaluateModule|^Bun v\d/m.test(r.stderr.split("\n").find((l) => l.includes("problem:")) ?? "")) {
    throw new Error(`P29 must carry the generator's message, not the stack tail:\n${r.stderr}`);
  }
  covers("GEN-03", "P29");
}, TEST_MS);

test("GEN-03 — a generator that calls process.exit() ends the build", async () => {
  // §33.2's first consequence, stated rather than discovered: unify does not
  // sandbox arbitrary JavaScript and does not claim to (§6.7). What matters
  // is that the build does not carry on as though nothing happened.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/exit.mjs": "process.exit(3);\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/exit.mjs"], tmp);
  if (r.exit === 0) throw new Error(`a generator calling process.exit() must not leave a successful build:\n${r.stdout}`);
  if (existsSync(join(tmp, "dist"))) throw new Error("nothing may publish after the generator ended the process");
  covers("GEN-03");
}, TEST_MS);

// ------------------------------------------------------------------- GEN-04

test("GEN-04 — generated files are scanned exactly as source files are", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", '<h1>Home</h1><a href="/page.html">p</a>'),
    "_scripts/gen.mjs": `import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [, , , outDir] = process.argv;
mkdirSync(join(outDir, "_hidden"), { recursive: true });
// A page, an asset, an underscore-excluded file, and a fragment — the four
// classifications §4 makes, all produced by the generator.
writeFileSync(join(outDir, "page.html"),
  '<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Page</title><meta name="description" content="A generated page."></head><body><h1>Page</h1></body></html>\\n');
writeFileSync(join(outDir, "data.json"), '{"generated":true}\\n');
writeFileSync(join(outDir, "_hidden/secret.html"), "<p>never shipped</p>\\n");
writeFileSync(join(outDir, "bit.fragment.html"), "<p>a bare snippet</p>\\n");
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "a generator producing all four file classifications");

  const dist = readdirSync(join(tmp, "dist"));
  if (!dist.includes("page.html")) throw new Error(`a generated .html is a PAGE: ${dist.join(", ")}`);
  if (!dist.includes("data.json")) throw new Error(`a generated non-page MIRROR COPIES: ${dist.join(", ")}`);
  if (!dist.includes("bit.fragment.html")) throw new Error(`a generated fragment ships as written: ${dist.join(", ")}`);
  if (dist.includes("_hidden")) throw new Error(`the underscore excludes generated files too: ${dist.join(", ")}`);
  // The asset is byte-for-byte, like any other mirror copy.
  if (readFileSync(join(tmp, "dist", "data.json"), "utf8") !== '{"generated":true}\n') {
    throw new Error("a generated asset mirror-copies byte-for-byte");
  }
  covers("GEN-04");
}, TEST_MS);

test("GEN-04 — src/ is never mutated, and --dry-run names a generated row as generated", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", '<h1>Home</h1><a href="/generated.html">g</a>'),
    "_scripts/gen.mjs": writesOnePage,
  });
  const before = readdirSync(join(tmp, "src")).sort().join(",");

  const dry = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--dry-run"], tmp);
  expectExit(dry, 0, "a dry run with a generator");
  // §33.3's one visible difference: a file in dist/ with no source behind it
  // is otherwise unexplainable to a reader of this report.
  expectContains(dry.stdout, "← generated", "the report marks the generated row's origin");
  if (existsSync(join(tmp, "dist"))) throw new Error("§17: --dry-run writes nothing");

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "the real build");
  if (readdirSync(join(tmp, "src")).sort().join(",") !== before) {
    throw new Error("§33.3: src/ is never mutated — the overlay is why audit stays read-only");
  }
  covers("GEN-04");
}, TEST_MS);

// ------------------------------------------------------------------- GEN-05

test("GEN-05 — a path in both trees is P12, naming which is which", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/dup.mjs": `import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [, , , outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), '<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Dup</title></head><body><h1>Dup</h1></body></html>\\n');
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/dup.mjs"], tmp);
  expectExit(r, 1, "neither tree wins — last-write-wins is what §13 forbids");
  if (existsSync(join(tmp, "dist"))) throw new Error("§15: a collision blocks the publish");
  // "index.html and index.html both produce index.html" tells an author
  // nothing; §33.4 requires the generated one be named as generated.
  expectContains(r.stderr, "(generated)", "the message distinguishes the two sources");
  covers("GEN-05");
}, TEST_MS);

// ------------------------------------------------------------------- GEN-07

test("GEN-07 — nothing the generator produces bypasses a check", async () => {
  // The guarantee that makes the seam safe to USE rather than safe to TRUST.
  // unify does not sandbox the generator; what it promises is that a
  // generated page is checked exactly as an authored one is.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": `import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [, , , outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "broken.html"),
  '<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Broken</title></head><body><h1>Broken</h1><a href="/nowhere.html">gone</a></body></html>\\n');
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 1, "a generated page's broken reference blocks the publish like any other");
  expectContains(r.stderr, "/nowhere.html", "§12 checked the generated page's references");
  if (existsSync(join(tmp, "dist"))) throw new Error("§15: the transaction covers generated files too");
  covers("GEN-07");
}, TEST_MS);

test("GEN-07 — audit runs the generator and still writes nothing", async () => {
  // §33.1 applies the flag to all four commands that scan the source tree,
  // and §24.2 says audit writes nothing anywhere. Both at once: the generator
  // runs (so audit evaluates the same site build would publish) and no output
  // directory appears.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", '<h1>Home</h1><a href="/generated.html">g</a>'),
    "_scripts/gen.mjs": writesOnePage,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "audit with a generator");
  if (existsSync(join(tmp, "dist"))) throw new Error("§24.2: audit writes nothing, generator or no generator");
  // The generated page was evaluated: without it, index.html's link would be
  // a broken reference and the pipeline would have raised a problem.
  if (/problem:/.test(r.stderr)) {
    throw new Error(`audit must have SEEN the generated page:\n${r.stderr}`);
  }
  covers("GEN-07");
}, TEST_MS);
