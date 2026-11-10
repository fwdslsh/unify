/**
 * `api-equivalence.test.js` — G15, interface equivalence (issue #50, Decision 3).
 *
 * unify has two interfaces on one pipeline: the command line, and an
 * EXPERIMENTAL API (`build()`, `audit()` from the package entry point). The
 * promise that keeps them one product rather than two is that they cannot
 * disagree, and this is the gate that holds it, the way G7 holds watch to a
 * fresh build and G11/G12 hold the binary and node to bun:
 *
 *   for each fixture tree, API `build()` and `unify build` produce a
 *   byte-identical output tree, the same status, and the same diagnostics
 *   (compared as the CLI's stderr, byte for byte, against the API's
 *   structured diagnostics rendered to §14.1's printed form); `audit()`'s
 *   report deep-equals what `unify audit --format json` prints.
 *
 * The API half runs in a SUBPROCESS (`api-driver.mjs`), once under bun and once
 * under node, importing the package by name. That is what lets the other
 * claims be observed rather than promised: the driver must exit 0 with empty
 * stdout and empty stderr — it never wrote, never exited — even when a
 * generator it ran logged to both.
 *
 * No mocks (H1); no skips (H4); the only thing imported from the product is
 * the public entry point, and only inside the driver (H3's carve-out).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, mkTmp, runCli, writeTree } from "./support.mjs";

const DRIVER = join(ROOT, "tests", "conformance", "api-driver.mjs");
const PROBE = join(ROOT, "tests", "conformance", "api-probe.mjs");
const TIMEOUT_MS = 120_000;

const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

function requireNode() {
  const node = Bun.which("node");
  if (!node) {
    throw new Error(
      "no `node` on PATH, so the interface equivalence gate (G15) cannot run under node.\n" +
      "  This gate is not optional: the API must behave identically on both runtimes.\n" +
      "  In CI, add `- uses: actions/setup-node@v4` with `node-version: '22'`.",
    );
  }
  const m = /v(\d+)\.(\d+)\.(\d+)/.exec(Bun.spawnSync({ cmd: [node, "--version"], stdout: "pipe" }).stdout.toString());
  const floor = /(\d+)\.(\d+)\.(\d+)/.exec(PKG.engines.node).slice(1).map(Number);
  const found = m.slice(1).map(Number);
  for (let i = 0; i < 3; i++) {
    if (found[i] !== floor[i]) {
      if (found[i] < floor[i]) throw new Error(`node ${found.join(".")} is below the ${floor.join(".")} floor package.json declares`);
      break;
    }
  }
  return node;
}

const RUNTIMES = { bun: process.execPath, node: requireNode() };

function cleanEnv() {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.DEBUG;
  delete env.FORCE_COLOR;
  delete env.CLAUDECODE;
  return env;
}

/** Every file under `dir` as `relative path -> Buffer`; an absent directory is empty. */
function snapshot(dir) {
  const files = new Map();
  if (!existsSync(dir)) return files;
  const walk = (abs, rel) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(abs, entry.name), childRel);
      else files.set(childRel, readFileSync(join(abs, entry.name)));
    }
  };
  walk(dir, "");
  return files;
}

/** A tree comparison that names the first difference rather than dumping both. */
function expectSameTree(a, b, what) {
  expect([...a.keys()].sort(), `${what}: the files emitted`).toEqual([...b.keys()].sort());
  for (const [path, bytes] of a) {
    expect(Buffer.from(bytes).equals(Buffer.from(b.get(path))), `${what}: ${path} differs byte for byte`).toBe(true);
  }
}

/** §14.1's printed form of one structured diagnostic. */
function render(d) {
  const fold = (t) => String(t).replace(/[\n\r]/g, (c) => (c === "\n" ? "\\n" : "\\r"));
  const lines = [`${d.line === undefined ? d.file : `${d.file}:${d.line}`}: ${d.severity}: ${fold(d.message)}`];
  if (d.context) lines.push(`  in: ${fold(d.context)}`);
  for (const fix of d.fixes ?? []) lines.push(`  fix: ${fold(fix)}`);
  return lines.join("\n");
}
const renderAll = (ds) => ds.map((d) => `${render(d)}\n`).join("");

// --------------------------------------------------------------- fixtures

const PAGE = (title, body, head = "") =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body><main>${body}</main></body></html>\n`;

const CLEAN = {
  "src/_layout.html": PAGE("Site", "", '<link rel="stylesheet" href="/assets/site.css">').replace("<main></main>", "<include src=\"/_nav.html\"></include><main></main>"),
  "src/_nav.html": '<nav><a href="/">Home</a> <a href="/about.html">About</a></nav>\n',
  "src/index.html": PAGE("Home", '<h1>Home</h1><a href="/about.html">About</a>'),
  "src/about.md": "---\ntitle: About\n---\n\n# About\n\nA page in Markdown. [Home](/).\n",
  "src/assets/site.css": "body { margin: 0 }\n",
};
const BROKEN = {
  ...CLEAN,
  "src/index.html": PAGE("Home", '<h1>Home</h1><a href="/nope.html">gone</a>'),
  // The previous publish this must leave exactly as it found it.
  "dist/index.html": "<!doctype html><title>previous</title>previous publish\n",
  "dist/old.html": "old\n",
};
const ADVISORY = {
  "src/index.html": PAGE("Home", '<h1>Home</h1><include src="/frag.html">'),
  "src/frag.html": "<p>frag</p>\n",
};
const GENERATED = {
  ...CLEAN,
  "src/gen.mjs": [
    'import { writeFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'console.log("generator says hi on stdout");',
    'console.error("generator says hi on stderr");',
    `writeFileSync(join(process.argv[3], "made.html"), ${JSON.stringify(PAGE("Made", "<h1>Made</h1>"))});`,
    "",
  ].join("\n"),
};
const SAVED = "pretty-urls: true\n";

/**
 * kind: what is called. `args`/`options` are the same request in each
 * interface's spelling. `cliTree` differs from `tree` only where the case is
 * about a file the API is told to ignore.
 */
const CASES = [
  { id: "clean", kind: "build", tree: CLEAN, args: ["-s", "src"], options: { source: "src" } },
  { id: "clean-strict-flags", kind: "build", tree: CLEAN, args: ["-s", "src", "-o", "public", "--strict", "--pretty-urls", "--clean", "--exclude", "_*", "--exclude", "assets/skip/**"], options: { source: "src", output: "public", strict: true, prettyUrls: true, clean: true, exclude: ["_*", "assets/skip/**"] }, out: "public" },
  { id: "base-url", kind: "build", tree: CLEAN, args: ["-s", "src", "--base-url", "https://example.com/site/", "--catalog", "--search-corpus"], options: { source: "src", baseUrl: "https://example.com/site/", catalog: true, searchCorpus: true } },
  { id: "problems", kind: "build", tree: BROKEN, args: ["-s", "src"], options: { source: "src" }, status: 1, untouched: ["dist/index.html", "dist/old.html"] },
  { id: "advisory-lenient", kind: "build", tree: ADVISORY, args: ["-s", "src"], options: { source: "src" }, status: 0 },
  { id: "advisory-strict", kind: "build", tree: ADVISORY, args: ["-s", "src", "--strict"], options: { source: "src", strict: true }, status: 1 },
  { id: "usage-error", kind: "build", tree: CLEAN, args: ["-s", "src", "--base-url", "example.com"], options: { source: "src", baseUrl: "example.com" }, status: 2 },
  { id: "dry-run", kind: "build", tree: CLEAN, args: ["-s", "src", "--dry-run"], options: { source: "src", dryRun: true }, status: 0, writes: false },
  { id: "write-false", kind: "build", tree: CLEAN, args: ["-s", "src"], options: { source: "src", write: false }, files: true },
  { id: "write-false-problems", kind: "build", tree: BROKEN, args: ["-s", "src"], options: { source: "src", write: false }, status: 1, files: true, untouched: ["dist/index.html", "dist/old.html"] },
  { id: "config-absent", kind: "build", tree: { ...CLEAN, "unify.yaml": SAVED }, cliTree: CLEAN, args: ["-s", "src"], options: { source: "src" }, savedEffect: false },
  { id: "config-true", kind: "build", tree: { ...CLEAN, "unify.yaml": SAVED }, args: ["-s", "src"], options: { source: "src", config: true }, savedEffect: true },
  { id: "config-false", kind: "build", tree: { ...CLEAN, "unify.yaml": SAVED }, cliTree: CLEAN, args: ["-s", "src"], options: { source: "src", config: false }, savedEffect: false },
  { id: "config-path", kind: "build", tree: { ...CLEAN, "conf/alt.yaml": SAVED }, cliTree: { ...CLEAN, "unify.yaml": SAVED }, args: ["-s", "src"], options: { source: "src", config: "conf/alt.yaml" }, savedEffect: true },
  { id: "build-audit", kind: "build", tree: CLEAN, args: ["-s", "src", "--audit"], options: { source: "src", audit: true }, auditReport: ["-s", "src"] },
  { id: "generator", kind: "build", tree: GENERATED, args: ["-s", "src", "--generate", "gen.mjs"], options: { source: "src", generate: "gen.mjs" }, cliSpeaks: true },
  { id: "audit-clean", kind: "audit", tree: CLEAN, args: ["-s", "src"], options: { source: "src" } },
  { id: "audit-findings", kind: "audit", tree: ADVISORY, args: ["-s", "src"], options: { source: "src" } },
  { id: "audit-base-url", kind: "audit", tree: CLEAN, args: ["-s", "src", "--base-url", "https://example.com/"], options: { source: "src", baseUrl: "https://example.com/" } },
  { id: "audit-strict", kind: "audit", tree: ADVISORY, args: ["-s", "src", "--strict"], options: { source: "src", strict: true } },
  { id: "audit-problems", kind: "audit", tree: BROKEN, args: ["-s", "src"], options: { source: "src" }, status: 1 },
  { id: "audit-usage-error", kind: "audit", tree: CLEAN, args: ["-s", "src", "--clean"], options: { source: "src", clean: true }, status: 2 },
];

// --------------------------------------------------------------- the runs

const work = mkTmp();
let sequence = 0;
const dirFor = (label) => {
  const dir = join(work, `${label}-${sequence++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** One CLI run per case, in a directory of its own. */
const cli = {};
/** API results: runtime -> case id -> result, and the directories they ran in. */
const api = {};

async function runCliCases() {
  for (const c of CASES) {
    const cwd = dirFor(`cli-${c.id}`);
    writeTree(cwd, c.cliTree ?? c.tree);
    const run = await runCli([c.kind, ...c.args], cwd);
    const entry = { cwd, ...run };
    if (c.kind === "audit") {
      entry.json = await runCli(["audit", ...c.args, "--format", "json"], cwd);
    } else if (c.auditReport) {
      entry.json = await runCli(["audit", ...c.auditReport, "--format", "json"], cwd);
    }
    cli[c.id] = entry;
  }
}

function runApiCases(runtimeName) {
  const spec = { cases: [], repeat: true };
  const dirs = {};
  for (const c of CASES) {
    const cwd = dirFor(`api-${runtimeName}-${c.id}`);
    writeTree(cwd, c.tree);
    dirs[c.id] = cwd;
    spec.cases.push({ id: c.id, cwd, fn: c.kind, options: c.options });
  }
  const specPath = join(dirFor(`spec-${runtimeName}`), "spec.json");
  const resultsPath = join(dirFor(`results-${runtimeName}`), "results.json");
  writeTree(join(specPath, ".."), { "spec.json": JSON.stringify(spec) });
  const r = Bun.spawnSync({
    cmd: [RUNTIMES[runtimeName], DRIVER, specPath, resultsPath],
    cwd: ROOT, env: cleanEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS,
  });
  const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : null;
  api[runtimeName] = { dirs, driver: { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() }, results };
}

const ready = (async () => {
  await runCliCases();
  for (const name of Object.keys(RUNTIMES)) runApiCases(name);
})();

const decodeFiles = (files) => new Map(Object.entries(files).map(([p, { base64 }]) => [p, Buffer.from(base64, "base64")]));

// ----------------------------------------------------------------- the gate

for (const runtime of Object.keys(RUNTIMES)) {
  describe(`API under ${runtime} is the CLI`, () => {
    test("the embedder process exits 0 having printed nothing at all", async () => {
      await ready;
      const { driver, results } = api[runtime];
      expect(driver.stderr, "stderr").toBe("");
      expect(driver.stdout, "stdout").toBe("");
      expect(driver.exit).toBe(0);
      expect(results, "results file").not.toBeNull();
      expect(results.exits, "calls to process.exit").toBe(0);
    }, TIMEOUT_MS);

    for (const c of CASES) {
      test(`${c.id}: same status, diagnostics, output tree${c.kind === "audit" ? " and report" : ""}`, async () => {
        await ready;
        const mine = api[runtime].results.first[c.id];
        const theirs = cli[c.id];

        // status — the CLI's own 0/1/2, returned, not exited
        expect(mine.status, "status").toBe(theirs.exit);
        if (c.status !== undefined) expect(mine.status, "the fixture's own expectation").toBe(c.status);

        // diagnostics — the structured list rendered is the printed list, byte for byte
        if (mine.status === 2) {
          expect(mine.diagnostics).toEqual([]);
          const printed = `${mine.error.message}\n${mine.error.fixes.map((f) => `  fix: ${f}\n`).join("")}`;
          expect(printed, "a usage error, as the CLI prints it").toBe(theirs.stderr);
        } else if (!c.cliSpeaks) {
          expect(renderAll(mine.diagnostics), "diagnostics").toBe(theirs.stderr);
        } else {
          // the generator's own words are the CLI's to pass through; unify's are not among them
          expect(theirs.stdout).toContain("generator says hi on stdout");
          expect(theirs.stderr).toContain("generator says hi on stderr");
          expect(renderAll(mine.diagnostics)).toBe("");
        }

        // output tree — the same bytes, or the same absence
        const out = c.out ?? "dist";
        const cliOut = snapshot(join(theirs.cwd, out));
        const apiOut = snapshot(join(api[runtime].dirs[c.id], out));
        if (c.files) {
          // write:false — the output directory is exactly as it was before the call...
          expectSameTree(apiOut, snapshot(join(dirOf(c), out)), "output directory of a write:false call");
          // ...and `files` is what the published tree would have been.
          if (mine.status === 0) expectSameTree(decodeFiles(mine.files), cliOut, "files");
          else expect(Object.keys(mine.files), "files after a problem").toEqual([]);
          expect(mine.files === undefined).toBe(false);
          if (!c.untouched) expect(existsSync(join(api[runtime].dirs[c.id], out)), "output directory created").toBe(false);
        } else if (c.kind === "build") {
          expect(mine.files, "files exist only for write:false").toBeUndefined();
          expectSameTree(apiOut, cliOut, "output tree");
        } else {
          expectSameTree(apiOut, snapshot(join(dirOf(c), out)), "output directory of an audit");
        }
        if (c.untouched) {
          const before = snapshot(join(dirOf(c), out));
          for (const p of c.untouched) expect(apiOut.get(p)?.toString(), `${p} left as it was`).toBe(before.get(p)?.toString());
        }
        if (c.writes === false) expect(apiOut.size, "dry run wrote").toBe(0);
        if (c.savedEffect !== undefined) {
          const keys = [...(c.files ? decodeFiles(mine.files) : apiOut).keys()];
          expect(keys.includes("about/index.html"), "unify.yaml's pretty-urls applied").toBe(c.savedEffect);
        }

        // report — the object `audit --format json` serializes
        if (c.kind === "audit" && mine.status !== 2) {
          expect(mine.report).toEqual(JSON.parse(theirs.json.stdout));
          expect(theirs.json.exit).toBe(theirs.exit);
        }
        if (c.auditReport) {
          expect(mine.report).toEqual(JSON.parse(theirs.json.stdout));
        } else if (c.kind === "build") {
          expect(mine.report, "a build reports only when asked").toBeUndefined();
        }
      }, TIMEOUT_MS);
    }

    test("the same calls twice in one process give the same results", async () => {
      await ready;
      const { first, second } = api[runtime].results;
      for (const c of CASES) expect(second[c.id], c.id).toEqual(first[c.id]);
    }, TIMEOUT_MS);
  });
}

/** A pristine copy of the case's tree, for comparing a directory against what it started as. */
function dirOf(c) {
  const pristine = join(work, `pristine-${c.id}`);
  if (!existsSync(pristine)) {
    mkdirSync(pristine, { recursive: true });
    writeTree(pristine, c.tree);
  }
  return pristine;
}

describe("the same results under both runtimes", () => {
  test("bun and node return identical results for every case", async () => {
    await ready;
    expect(api.node.results.first).toEqual(api.bun.results.first);
  }, TIMEOUT_MS);
});

describe("the entry point", () => {
  const probe = (runtimeName, ...args) =>
    Bun.spawnSync({ cmd: [RUNTIMES[runtimeName], PROBE, ...args], cwd: ROOT, env: cleanEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 60_000 });

  for (const runtime of Object.keys(RUNTIMES)) {
    test(`importing it starts nothing, prints nothing, writes nothing (${runtime})`, () => {
      const before = statSync(ROOT).mtimeMs;
      const hadDist = existsSync(join(ROOT, "dist"));
      const r = probe(runtime, "import-only");
      expect(r.stderr.toString()).toBe("");
      expect(r.stdout.toString()).toBe("");
      expect(r.exitCode).toBe(0);
      // the CLI, started with no arguments, would have built src/ into dist/
      expect(existsSync(join(ROOT, "dist"))).toBe(hadDist);
      expect(statSync(ROOT).mtimeMs).toBe(before);
    });

    test(`only the package root is importable; src/ files are not (${runtime})`, () => {
      const deep = (spec) => probe(runtime, "deep", spec).stdout.toString().trim();
      expect(deep("@fwdslsh/unify/src/core/compose.js")).toBe("blocked");
      expect(deep("@fwdslsh/unify/src/cli.js")).toBe("blocked");
      // bun resolves `package.json` of its own package whatever the map says; node honours the map
      if (runtime === "node") expect(deep("@fwdslsh/unify/package.json")).toBe("blocked");
    });
  }

  test("package.json: main names the entry, and exports exposes it and nothing else", () => {
    expect(PKG.exports).toEqual({ ".": "./src/index.js" });
    expect(PKG.main).toBe("src/index.js");
    expect(PKG.bin.unify).toBe("src/cli.js");
  });
});
