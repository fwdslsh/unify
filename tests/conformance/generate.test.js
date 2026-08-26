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

/**
 * A generator that copies its own argv[3] (the overlay directory) and argv[4]
 * (the generator-context.json path) and content out to `probeAbsPath` — a
 * location OUTSIDE both the source tree and the overlay, chosen by the test —
 * before doing anything else. `audit` publishes nothing and a throwing
 * generator's overlay is discarded, so this is the only way these tests can
 * inspect the context after the CLI process has exited and §33's cleanup has
 * already run.
 * @param {string} probeAbsPath
 * @param {"succeed"|"throw"} [then]
 */
function contextProbeGenerator(probeAbsPath, then = "succeed") {
  return `import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
const [, , , overlayDir, contextPath] = process.argv;
writeFileSync(${JSON.stringify(probeAbsPath)}, JSON.stringify({
  overlayDir,
  contextPath,
  isAbsolute: isAbsolute(contextPath ?? ""),
  raw: contextPath ? readFileSync(contextPath, "utf8") : null,
}));
${then === "throw" ? 'throw new Error("boom after capturing the context");\n' : ""}`;
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

test("GEN-12 — argv[2]/argv[3] are unchanged and argv[4] names readable, versioned JSON", async () => {
  // §33.2: the context is additive. argv[2]/argv[3] keep their exact positions
  // and meaning, and argv[4] is a NEW fourth argument, not a replacement.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", '<h1>Home</h1><a href="/report.html">r</a>'),
    "_scripts/gen.mjs": `import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
const [, , sourceRoot, outDir, contextPath] = process.argv;
mkdirSync(outDir, { recursive: true });
const raw = readFileSync(contextPath, "utf8");
const ctx = JSON.parse(raw);
writeFileSync(join(outDir, "report.html"),
  \`<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Report</title><meta name="description" content="What the generator received."></head><body><h1>Report</h1><p id="a">\${isAbsolute(sourceRoot)}</p><p id="b">\${isAbsolute(outDir)}</p><p id="e">\${isAbsolute(contextPath)}</p><p id="f">\${raw.endsWith("\\n")}</p><p id="g">\${ctx.schemaVersion}</p></body></html>\\n\`);
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "a generator that reads all three arguments");
  const out = readFileSync(join(tmp, "dist", "report.html"), "utf8");
  expectContains(out, '<p id="a">true</p>', "argv[2] is still an ABSOLUTE source root");
  expectContains(out, '<p id="b">true</p>', "argv[3] is still an ABSOLUTE overlay directory");
  expectContains(out, '<p id="e">true</p>', "argv[4] is an ABSOLUTE path");
  expectContains(out, '<p id="f">true</p>', "argv[4] names a file (readable, trailing newline)");
  expectContains(out, '<p id="g">1</p>', "the context starts at schemaVersion 1");
  covers("GEN-12");
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

  // The rule says "a file in dist/", not "a page": an ASSET the generator wrote
  // has no source behind it either. Until 2026-08-24 its copy row named an
  // overlay-relative path that does not exist in src/, which is precisely the
  // unexplainable row GEN-04 exists to prevent — and the vendoring recipe in
  // docs/integrations.md makes generated assets the common case.
  const asset = mkTmp();
  writeTree(join(asset, "src"), {
    "index.html": doc("Home", '<h1>Home</h1><script src="/vendor/lib.js"></script>'),
    "_scripts/gen.mjs":
      'import { writeFileSync, mkdirSync } from "node:fs";\n' +
      'import { join } from "node:path";\n' +
      'const out = process.argv[3];\n' +
      'mkdirSync(join(out, "vendor"), { recursive: true });\n' +
      'writeFileSync(join(out, "vendor", "lib.js"), "export const x = 1;\\n");\n',
  });
  const assetDry = await runCli(
    ["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--dry-run"],
    asset,
  );
  expectExit(assetDry, 0, "a dry run whose generator writes an asset");
  expectContains(assetDry.stdout, "← generated", "the report marks a generated ASSET's origin");
  if (/vendor\/lib\.js \(\/vendor\/lib\.js\) ← vendor\/lib\.js/.test(assetDry.stdout)) {
    throw new Error(
      `GEN-04: a generated asset's row must not name a source path that does not exist:\n${assetDry.stdout}`,
    );
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

// ------------------------------------------------------------------- GEN-10

test("GEN-10 — P29 drops the runtime's inspected error object, not the message", async () => {
  // The commonest generator failure of all: it cannot read a file. Both
  // runtimes print the thrown Error's own fields under the message, and
  // neither the code-frame nor the stack-frame shape recognised them, so the
  // diagnostic ended `… open '/x.json' /     path: "/x.json", /  syscall:
  // "open",` — the path restated, then a comma terminating nothing. A reader
  // cannot tell that from unify's own output being broken.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": 'import { readFileSync } from "node:fs";\nreadFileSync("/definitely/not/here.json");\n',
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--dry-run"], tmp);
  const line = r.stderr.split("\n").find((l) => l.includes("problem:")) ?? "";

  // What the author needs is present…
  if (!line.includes("/definitely/not/here.json")) {
    throw new Error(`P29 must carry the generator's message:\n${r.stderr}`);
  }
  // …and the object's machine-printed tail is not. `syscall:`/`errno:`/`code:`
  // are the properties; a bare `}` is node's object close; `node:fs:` is its
  // internal location header, which carries no slash and so escaped the
  // file-location shape.
  for (const noise of [/\bsyscall:/, /\berrno:/, /\bcode:\s*['"]/, /\/\s*\}\s*$/, /node:fs:\d+/]) {
    if (noise.test(line)) {
      throw new Error(`P29 leaked the runtime's inspected error object (${noise}):\n${line}`);
    }
  }
  covers("GEN-10", "P29");
}, TEST_MS);

test("GEN-10 — a generator's own indented lines are not mistaken for properties", async () => {
  // The shape keys on indentation PLUS a JS identifier, so it must not eat a
  // generator reporting its own findings. `first-post.md` is not an
  // identifier; the line survives, and so does the multi-line message.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs":
      'process.stderr.write("2 notes are missing a date:\\n  first-post.md: no date\\n  second-post.md: no date\\n");\n' +
      "process.exit(1);\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--dry-run"], tmp);
  const line = r.stderr.split("\n").find((l) => l.includes("problem:")) ?? "";
  for (const want of ["2 notes are missing a date:", "first-post.md: no date", "second-post.md: no date"]) {
    if (!line.includes(want)) {
      throw new Error(`P29 dropped a generator's own line (${want}):\n${line}`);
    }
  }
  covers("GEN-10");
}, TEST_MS);

// ------------------------------------------------------------------- GEN-11

test("GEN-11 — the generator subprocess never network-installs, and argv is unshifted", async () => {
  // Bun auto-installs an import it cannot resolve. A generator with a missing
  // dependency therefore FETCHED IT FROM npm and the build exited 0, while
  // node failed the same tree inside P29 — a disagreement about whether there
  // was a build at all, which G12 cannot see because it compares emitted bytes
  // and here one side emits none. The compiled binary did it too, on the path
  // whose whole promise is a machine with neither runtime installed.
  //
  // Asserted through `process.execArgv`, which the generator can read, so this
  // is deterministic and needs no network: the alternative — importing a real
  // uninstalled package and expecting failure — passes for the wrong reason on
  // an offline runner.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs":
      'import { writeFileSync } from "node:fs";\n' +
      "writeFileSync(process.argv[3] + '/probe.json', JSON.stringify({\n" +
      "  execArgv: process.execArgv,\n" +
      "  argv2: process.argv[2],\n" +
      "  argv3: process.argv[3],\n" +
      "  argv4: process.argv[4],\n" +
      "}));\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  if (r.exit !== 0) throw new Error(`the healthy generator must still build:\n${r.stderr}`);

  const probe = JSON.parse(readFileSync(join(tmp, "dist", "probe.json"), "utf8"));

  // The flag is present exactly where it is valid. Node has no
  // `process.versions.bun` and would reject `--no-install` outright.
  if (process.versions.bun) {
    if (!probe.execArgv.includes("--no-install")) {
      throw new Error(`the generator spawn must carry --no-install under bun:\n${JSON.stringify(probe.execArgv)}`);
    }
  } else if (probe.execArgv.includes("--no-install")) {
    throw new Error("--no-install must never be passed to node");
  }

  // §33.2's contract survives it: the flag goes before the script path, so the
  // generator's own argv still starts at the source root.
  if (probe.argv2 !== join(tmp, "src")) {
    throw new Error(`argv[2] must still be the source root, got ${probe.argv2}`);
  }
  if (!probe.argv3 || probe.argv3 === probe.argv2) {
    throw new Error(`argv[3] must still be the generated directory, got ${probe.argv3}`);
  }
  // GEN-11's "does not shift argv" claim now covers argv[4] too: the
  // --no-install flag rides in FRONT of the generator path, so the fourth
  // positional argument the generator sees is still the context path, not
  // shifted off the end.
  if (!probe.argv4 || !probe.argv4.startsWith("/") || probe.argv4 === probe.argv3) {
    throw new Error(`argv[4] must still be the context path, got ${JSON.stringify(probe.argv4)}`);
  }
  covers("GEN-11", "GEN-02", "GEN-12");
}, TEST_MS);

// ------------------------------------------------------------------- GEN-12

test("GEN-12 — effective site/outputs values reflect the flags, and command names the build", async () => {
  const tmp = mkTmp();
  const probe = join(tmp, "ctx-probe.json");
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": contextProbeGenerator(probe),
  });
  const r = await runCli(
    ["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs",
      // No trailing slash on the flag, so a normalized site.baseUrl
      // ("…/docs/") is distinguishable from the raw flag string
      // ("…/docs") — an implementation that forwarded the flag unparsed
      // would fail this assertion instead of passing it by coincidence.
      "--base-url", "https://example.com/docs", "--pretty-urls", "--canonical", "auto",
      "--catalog", "--search-corpus"],
    tmp,
  );
  expectExit(r, 0, "a build with every context-bearing flag set");
  const probed = JSON.parse(readFileSync(probe, "utf8"));
  const ctx = JSON.parse(probed.raw);

  if (ctx.command !== "build") throw new Error(`command must be "build", got ${JSON.stringify(ctx.command)}`);
  // The identical origin+pathPrefix construction catalog.json and
  // `audit --format json` use (B4's addendum) — never the raw flag string.
  // parseBaseUrl always appends the trailing slash the raw flag omitted, so
  // this can only pass if the context carries the NORMALIZED value.
  if (ctx.site.baseUrl !== "https://example.com/docs/") {
    throw new Error(`site.baseUrl must be the normalized origin+pathPrefix, got ${JSON.stringify(ctx.site.baseUrl)}`);
  }
  if (ctx.site.prettyUrls !== true) throw new Error(`site.prettyUrls must be true, got ${ctx.site.prettyUrls}`);
  if (ctx.site.canonical !== "auto") throw new Error(`site.canonical must be "auto", got ${JSON.stringify(ctx.site.canonical)}`);
  if (ctx.outputs.catalog !== "assets/unify/catalog.json") {
    throw new Error(`outputs.catalog must reflect --catalog, got ${JSON.stringify(ctx.outputs.catalog)}`);
  }
  if (ctx.outputs.searchCorpus !== "assets/unify/search-corpus.json") {
    throw new Error(`outputs.searchCorpus must reflect --search-corpus, got ${JSON.stringify(ctx.outputs.searchCorpus)}`);
  }

  // unifyVersion/paths.* — promised by GEN-12 and the §33.2 field table, and
  // otherwise never read by any test in the suite.
  const version = await runCli(["--version"], tmp);
  expectExit(version, 0, "--version");
  if (ctx.unifyVersion !== version.stdout.trim()) {
    throw new Error(`unifyVersion must equal what --version prints, got ${JSON.stringify(ctx.unifyVersion)} vs ${JSON.stringify(version.stdout.trim())}`);
  }
  if (ctx.paths.sourceRoot !== join(tmp, "src")) {
    throw new Error(`paths.sourceRoot must equal argv[2], got ${JSON.stringify(ctx.paths.sourceRoot)}`);
  }
  if (ctx.paths.outputRoot !== join(tmp, "dist")) {
    throw new Error(`paths.outputRoot must be the absolute output directory, got ${JSON.stringify(ctx.paths.outputRoot)}`);
  }
  if (ctx.paths.generatedRoot !== probed.overlayDir) {
    throw new Error(`paths.generatedRoot must equal argv[3], got ${JSON.stringify(ctx.paths.generatedRoot)} vs ${JSON.stringify(probed.overlayDir)}`);
  }
  covers("GEN-12");
}, TEST_MS);

test("GEN-12 — site/outputs fields are the closed default (false/null) without their flags", async () => {
  const tmp = mkTmp();
  const probe = join(tmp, "ctx-probe.json");
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": contextProbeGenerator(probe),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "a plain build with no site/output flags");
  const ctx = JSON.parse(JSON.parse(readFileSync(probe, "utf8")).raw);

  if (ctx.site.baseUrl !== null) throw new Error(`site.baseUrl must be null without --base-url, got ${JSON.stringify(ctx.site.baseUrl)}`);
  if (ctx.site.prettyUrls !== false) throw new Error(`site.prettyUrls must be false without --pretty-urls, got ${ctx.site.prettyUrls}`);
  if (ctx.site.canonical !== null) throw new Error(`site.canonical must be null without --canonical, got ${JSON.stringify(ctx.site.canonical)}`);
  if (ctx.outputs.catalog !== null) throw new Error(`outputs.catalog must be null without --catalog, got ${JSON.stringify(ctx.outputs.catalog)}`);
  if (ctx.outputs.searchCorpus !== null) {
    throw new Error(`outputs.searchCorpus must be null without --search-corpus, got ${JSON.stringify(ctx.outputs.searchCorpus)}`);
  }
  covers("GEN-12");
}, TEST_MS);

test("GEN-12 — command names \"audit\", which runs the generator and still writes nothing", async () => {
  const tmp = mkTmp();
  const probe = join(tmp, "ctx-probe.json");
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": contextProbeGenerator(probe),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "audit with a generator");
  if (existsSync(join(tmp, "dist"))) throw new Error("§24.2: audit writes nothing, generator or no generator");
  const ctx = JSON.parse(JSON.parse(readFileSync(probe, "utf8")).raw);
  if (ctx.command !== "audit") throw new Error(`command must be "audit", got ${JSON.stringify(ctx.command)}`);
  covers("GEN-12");
}, TEST_MS);

test("GEN-12 — the context file is deleted with the build's generator state, success or failure", async () => {
  const tmp = mkTmp();
  const okProbe = join(tmp, "ok-probe.json");
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": contextProbeGenerator(okProbe),
  });
  const ok = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(ok, 0, "a successful build");
  const okCtx = JSON.parse(readFileSync(okProbe, "utf8"));
  if (existsSync(okCtx.contextPath)) {
    throw new Error(`generator-context.json must not survive a successful build: ${okCtx.contextPath}`);
  }

  const failTmp = mkTmp();
  const failProbe = join(failTmp, "fail-probe.json");
  writeTree(join(failTmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": contextProbeGenerator(failProbe, "throw"),
  });
  const failed = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], failTmp);
  expectExit(failed, 1, "a throwing generator");
  const failCtx = JSON.parse(readFileSync(failProbe, "utf8"));
  if (existsSync(failCtx.contextPath)) {
    throw new Error(`generator-context.json must not survive a P29 failure either: ${failCtx.contextPath}`);
  }
  covers("GEN-12");
}, TEST_MS);

test("GEN-12 — the context path sits outside the source root, and never appears in dist/ or a --dry-run row", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    // Ignores argv[4] entirely — the "unchanged for a generator that doesn't
    // read it" half of the contract, exercised here rather than asserted
    // separately, since every other test in this file already makes the
    // same point for argv[2]/argv[3].
    "_scripts/gen.mjs": writesOnePage,
  });

  const dry = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--dry-run"], tmp);
  expectExit(dry, 0, "a dry run with a generator");
  if (/generator-context\.json/.test(dry.stdout)) {
    throw new Error(`--dry-run must not list the context file as a row:\n${dry.stdout}`);
  }

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(r, 0, "the real build");
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  const shipped = walk(join(tmp, "dist"));
  if (shipped.some((p) => p.endsWith("generator-context.json"))) {
    throw new Error(`dist/ must never contain generator-context.json:\n${shipped.join("\n")}`);
  }

  // The title's first clause — the containment claim itself — needs a
  // generator that actually reads argv[4], since `writesOnePage` above
  // ignores it and never learns the path.
  const probe = join(tmp, "ctx-probe.json");
  const containment = mkTmp();
  writeTree(join(containment, "src"), {
    "index.html": doc("Home", "<h1>Home</h1>"),
    "_scripts/gen.mjs": contextProbeGenerator(probe),
  });
  const c = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], containment);
  expectExit(c, 0, "a build whose generator captures the context path");
  const { contextPath } = JSON.parse(readFileSync(probe, "utf8"));
  if (contextPath.startsWith(join(containment, "src"))) {
    throw new Error(`the context path must sit outside the source root, got ${contextPath}`);
  }
  covers("GEN-12");
}, TEST_MS);

// -------------------------------------------------------------------- B9

test("GEN-04/URL-08: a generator's own og:url stamping builds clean under --pretty-urls + --base-url", async () => {
  // The B9 defect end to end, through the seam it was actually found on: a
  // generated page — scanned exactly like an authored one per GEN-04 — stamps
  // og:url the way a generator naturally computes a page's own output
  // address: root-relative, in the plain .html spelling it just wrote,
  // knowing nothing about --pretty-urls or --base-url. It relies entirely on
  // unify's own §11.2/§11.3 pipeline to make that address right, which is
  // exactly the reliance the B9 fix restores.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_scripts/gen.mjs": `import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [, , , outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "about.html"),
  '<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>About</title><meta name="description" content="About page."></head><body><h1>About</h1></body></html>\\n');
writeFileSync(join(outDir, "index.html"),
  '<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home page."><meta property="og:url" content="/about.html"></head><body><h1>Home</h1><a href="/about.html">About</a></body></html>\\n');
`,
  });
  const r = await runCli(
    ["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--pretty-urls", "--base-url", "https://example.com/"],
    tmp,
  );
  expectExit(r, 0, "a generator's own og:url must survive --pretty-urls + --base-url");
  const home = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  expectContains(home, 'property="og:url" content="https://example.com/about/"', "the generated og:url must be pretty-rewritten then absolutized");
  expectContains(home, 'href="/about/"', "the generated href beside it stays root-relative, pretty-rewritten");
  covers("GEN-04", "URL-08");
}, TEST_MS);
