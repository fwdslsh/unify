/**
 * `api-equivalence.test.js` — G15, interface equivalence (issue #50).
 *
 * The experimental API is the command line called as a function: `build()` is
 * `unify build <flags>` and `audit()` is `unify audit <flags>`, run by the CLI's
 * own code with its two streams captured. The promise that keeps it one product
 * is that the two cannot disagree, and this is the gate that holds it, the way
 * G7 holds watch to a fresh build and G11/G12 hold the binary and node to bun:
 *
 *   for each fixture and flag set, `build()`/`audit()` — called in a SUBPROCESS,
 *   under bun and under node, importing the package by name — return `status`,
 *   `stdout` and `stderr` byte-identical to spawning the CLI with the equivalent
 *   argv in the same runtime and in a copy of the same tree, and the whole
 *   directory afterwards (output, saved config) holds identical bytes.
 *
 * The subprocess (`api-driver.mjs`) must itself write nothing to its own
 * streams and exit 0 having called no `process.exit` and set no
 * `process.exitCode`, even when a generator it ran logged to both — which is
 * how "nothing reaches the real streams" is observed rather than promised.
 *
 * No mocks (H1); no skips (H4); the only thing imported from the product is the
 * public entry point, and only inside the driver and probe (H3's carve-out).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, mkTmp, writeTree } from "./support.mjs";

const DRIVER = join(ROOT, "tests", "conformance", "api-driver.mjs");
const PROBE = join(ROOT, "tests", "conformance", "api-probe.mjs");
const CLI = join(ROOT, "src", "cli.js");
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

/** Same files, same bytes; names the first difference rather than dumping both. */
function expectSameTree(a, b, what) {
  expect([...a.keys()].sort(), `${what}: the files`).toEqual([...b.keys()].sort());
  for (const [path, bytes] of a) {
    expect(Buffer.from(bytes).equals(Buffer.from(b.get(path))), `${what}: ${path} differs byte for byte`).toBe(true);
  }
}

// --------------------------------------------------------------- fixtures

const PAGE = (title, body, head = "") =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body><main>${body}</main></body></html>\n`;

const CLEAN = {
  "src/_layout.html": PAGE("Site", "", '<link rel="stylesheet" href="/assets/site.css">').replace("<main></main>", '<include src="/_nav.html"></include><main></main>'),
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
const GENERATOR = (extra) => ({
  ...CLEAN,
  "src/gen.mjs": [
    'import { writeFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'console.log("generator says hi on stdout");',
    'console.error("generator says hi on stderr");',
    `writeFileSync(join(process.argv[3], "made.html"), ${JSON.stringify(PAGE("Made", "<h1>Made</h1>"))});`,
    extra,
    "",
  ].join("\n"),
});
const FAILING = { ...CLEAN, "src/gen.mjs": "process.exit(3);\n" };
const SAVED = "pretty-urls: true\n";

/** `argv` is the CLI's spelling of `options`; `fn` is both the command and the function. */
const CASES = [
  { id: "clean", fn: "build", tree: CLEAN, argv: ["-s", "src"], options: { source: "src" }, status: 0 },
  { id: "flags", fn: "build", tree: CLEAN, argv: ["--source=src", "--output=public", "--strict", "--pretty-urls", "--clean", "--exclude=_*", "--exclude=assets/skip/**"], options: { source: "src", output: "public", strict: true, prettyUrls: true, clean: true, exclude: ["_*", "assets/skip/**"] }, status: 0 },
  { id: "base-url-projections", fn: "build", tree: CLEAN, argv: ["-s", "src", "--base-url=https://example.com/site/", "--catalog", "--search-corpus"], options: { source: "src", baseUrl: "https://example.com/site/", catalog: true, searchCorpus: true }, status: 0 },
  { id: "problems", fn: "build", tree: BROKEN, argv: ["-s", "src"], options: { source: "src" }, status: 1 },
  { id: "advisory-lenient", fn: "build", tree: ADVISORY, argv: ["-s", "src"], options: { source: "src" }, status: 0 },
  { id: "advisory-strict", fn: "build", tree: ADVISORY, argv: ["-s", "src", "--strict"], options: { source: "src", strict: true }, status: 1 },
  { id: "usage-bad-base-url", fn: "build", tree: CLEAN, argv: ["-s", "src", "--base-url=example.com"], options: { source: "src", baseUrl: "example.com" }, status: 2 },
  { id: "usage-unknown-option", fn: "build", tree: CLEAN, argv: ["-s", "src", "--bogus"], options: { source: "src", bogus: true }, status: 2 },
  { id: "usage-misused-option", fn: "build", tree: CLEAN, argv: ["-s", "src", "--base-url"], options: { source: "src", baseUrl: true }, status: 2 },
  { id: "usage-flag-with-value", fn: "build", tree: CLEAN, argv: ["-s", "src", "--strict=yes"], options: { source: "src", strict: "yes" }, status: 2 },
  { id: "usage-audit-clean", fn: "audit", tree: CLEAN, argv: ["-s", "src", "--clean"], options: { source: "src", clean: true }, status: 2 },
  { id: "dry-run", fn: "build", tree: CLEAN, argv: ["-s", "src", "--dry-run"], options: { source: "src", dryRun: true }, status: 0 },
  { id: "dry-run-problems", fn: "build", tree: BROKEN, argv: ["-s", "src", "--dry-run"], options: { source: "src", dryRun: true }, status: 1 },
  { id: "audit-human", fn: "audit", tree: CLEAN, argv: ["-s", "src"], options: { source: "src" }, status: 0 },
  { id: "audit-json", fn: "audit", tree: CLEAN, argv: ["-s", "src", "--base-url=https://example.com/", "--format=json"], options: { source: "src", baseUrl: "https://example.com/", format: "json" }, status: 0 },
  { id: "audit-sarif", fn: "audit", tree: ADVISORY, argv: ["-s", "src", "--format=sarif"], options: { source: "src", format: "sarif" } },
  { id: "audit-strict", fn: "audit", tree: ADVISORY, argv: ["-s", "src", "--strict", "--format=json"], options: { source: "src", strict: true, format: "json" }, status: 1 },
  { id: "audit-problems", fn: "audit", tree: BROKEN, argv: ["-s", "src", "--format=json"], options: { source: "src", format: "json" }, status: 1 },
  { id: "audit-bad-format", fn: "audit", tree: CLEAN, argv: ["-s", "src", "--format=xml"], options: { source: "src", format: "xml" }, status: 2 },
  { id: "build-audit-gate", fn: "build", tree: CLEAN, argv: ["-s", "src", "--audit"], options: { source: "src", audit: true }, status: 0 },
  { id: "save-config", fn: "build", tree: CLEAN, argv: ["-s", "src", "--pretty-urls", "--save-config"], options: { source: "src", prettyUrls: true, saveConfig: true }, status: 0, saves: true },
  { id: "yaml-in-tree", fn: "build", tree: { ...CLEAN, "unify.yaml": SAVED }, argv: ["-s", "src"], options: { source: "src" }, status: 0 },
  { id: "yaml-names-the-source", fn: "build", tree: { ...CLEAN, "unify.yaml": "source: src\n" }, argv: [], options: {}, status: 0 },
  { id: "generator-logs", fn: "build", tree: GENERATOR(""), argv: ["-s", "src", "--generate=gen.mjs"], options: { source: "src", generate: "gen.mjs" }, status: 0, speaks: true },
  { id: "generator-logs-under-audit", fn: "audit", tree: GENERATOR(""), argv: ["-s", "src", "--generate=gen.mjs", "--format=json"], options: { source: "src", generate: "gen.mjs", format: "json" }, status: 0, speaks: true },
  { id: "generator-fails-build", fn: "build", tree: FAILING, argv: ["-s", "src", "--generate=gen.mjs"], options: { source: "src", generate: "gen.mjs" }, status: 1 },
  { id: "generator-fails-audit", fn: "audit", tree: FAILING, argv: ["-s", "src", "--generate=gen.mjs"], options: { source: "src", generate: "gen.mjs" }, status: 1 },
  { id: "generator-fails-audit-json", fn: "audit", tree: FAILING, argv: ["-s", "src", "--generate=gen.mjs", "--format=json"], options: { source: "src", generate: "gen.mjs", format: "json" }, status: 1 },
  { id: "io-failure", fn: "build", tree: { ...CLEAN, blocker: "a file, not a directory\n" }, argv: ["-s", "src", "-o", "blocker/dist"], options: { source: "src", output: "blocker/dist" }, status: 1 },
];

/** Values that are not a boolean, a string or an array of strings: a programmer error, thrown. */
const BAD = [
  { id: "number", fn: "build", options: { source: 5 } },
  { id: "object", fn: "audit", options: { exclude: { a: 1 } } },
  { id: "mixed-array", fn: "build", options: { exclude: ["a", 2] } },
  { id: "null", fn: "build", options: { source: null } },
  { id: "not-an-object", fn: "audit", options: "src" },
];

// --------------------------------------------------------------- the runs

const work = mkTmp();
let sequence = 0;
const dirFor = (label) => {
  const dir = join(work, `${label}-${sequence++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** The case's tree, in a fresh directory. */
function fresh(label, tree) {
  const dir = dirFor(label);
  writeTree(dir, tree);
  return dir;
}

/** Spawn the CLI itself in the given runtime. */
function spawnCli(runtime, argv, cwd) {
  const r = Bun.spawnSync({ cmd: [runtime, CLI, ...argv], cwd, env: cleanEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  return { status: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

/** The directory is the one thing allowed to differ between the two runs, and only in its own name. */
const where = (text, dir) => text.split(dir).join("<cwd>");

const OVERLAP_TREE = CLEAN;
const OVERLAP = [
  { fn: "build", options: { source: "src", output: "first" }, argv: ["build", "-s", "src", "-o", "first"] },
  { fn: "audit", options: { source: "src", format: "json" }, argv: ["audit", "-s", "src", "--format=json"] },
  { fn: "build", options: { source: "src", output: "second", prettyUrls: true }, argv: ["build", "-s", "src", "-o", "second", "--pretty-urls"] },
  { fn: "build", options: { source: "src", dryRun: true }, argv: ["build", "-s", "src", "--dry-run"] },
];

/** runtime name -> everything its two sides produced */
const runs = {};

function runAll(name) {
  const runtime = RUNTIMES[name];
  const spec = { cases: [], bad: BAD };
  const apiDirs = {};
  const cliDirs = {};
  const cli = {};
  // each case twice, in separate directories: the second, later in the same process, must be as the first
  for (const again of [false, true]) {
    for (const c of CASES) {
      const id = again ? `${c.id}:again` : c.id;
      apiDirs[id] = fresh(`api-${name}-${id}`, c.tree);
      spec.cases.push({ id, cwd: apiDirs[id], fn: c.fn, options: c.options });
      if (!again) {
        cliDirs[id] = fresh(`cli-${name}-${id}`, c.tree);
        cli[id] = spawnCli(runtime, [c.fn, ...c.argv], cliDirs[id]);
      }
    }
  }
  const overlapApi = fresh(`api-${name}-overlap`, OVERLAP_TREE);
  spec.overlap = { cwd: overlapApi, calls: OVERLAP.map(({ fn, options }) => ({ fn, options })) };
  const overlapCli = fresh(`cli-${name}-overlap`, OVERLAP_TREE);
  const overlapExpected = OVERLAP.map(({ argv }) => spawnCli(runtime, argv, overlapCli));

  const specPath = join(dirFor(`spec-${name}`), "spec.json");
  writeTree(join(specPath, ".."), { "spec.json": JSON.stringify(spec) });
  const resultsPath = join(dirFor(`results-${name}`), "results.json");
  const proc = Bun.spawnSync({ cmd: [runtime, DRIVER, specPath, resultsPath], cwd: ROOT, env: cleanEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS });
  runs[name] = {
    cli, cliDirs, apiDirs, overlapApi, overlapCli, overlapExpected,
    driver: { exit: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() },
    results: existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : null,
  };
}

for (const name of Object.keys(RUNTIMES)) runAll(name);

// ----------------------------------------------------------------- the gate

for (const name of Object.keys(RUNTIMES)) {
  describe(`API under ${name} is the CLI under ${name}`, () => {
    const run = runs[name];

    test("the embedder process printed nothing, exited 0, called no process.exit and set no exit code", () => {
      expect(run.driver.stderr, "stderr").toBe("");
      expect(run.driver.stdout, "stdout").toBe("");
      expect(run.driver.exit).toBe(0);
      expect(run.results, "results file").not.toBeNull();
      expect(run.results.exits, "calls to process.exit").toBe(0);
      expect(run.results.exitCode, "process.exitCode").toBeNull();
    });

    for (const c of CASES) {
      test(`${c.id}: byte-identical status, stdout, stderr and files`, () => {
        const mine = run.results.cases[c.id];
        const theirs = run.cli[c.id];
        expect(mine.status, "status").toBe(theirs.status);
        if (c.status !== undefined) expect(mine.status, "the fixture's own expectation").toBe(c.status);
        expect(where(mine.stdout, run.apiDirs[c.id]), "stdout").toBe(where(theirs.stdout, run.cliDirs[c.id]));
        expect(where(mine.stderr, run.apiDirs[c.id]), "stderr").toBe(where(theirs.stderr, run.cliDirs[c.id]));
        expectSameTree(snapshot(run.apiDirs[c.id]), snapshot(run.cliDirs[c.id]), "the directory afterwards");
        if (c.speaks) {
          // the generator's own words travel in the result, not to the embedder's streams
          const all = mine.stdout + mine.stderr;
          expect(all).toContain("generator says hi on stdout");
          expect(all).toContain("generator says hi on stderr");
        }
        if (c.saves) {
          expect(existsSync(join(run.apiDirs[c.id], "unify.yaml")), "the saved config").toBe(true);
          expect(mine.stdout).toMatch(/^saved pretty-urls, source to /);
        }
        if (c.id === "problems") {
          expect(snapshot(run.apiDirs[c.id]).get("dist/old.html")?.toString(), "previous output untouched").toBe("old\n");
        }
        if (c.id === "dry-run") {
          expect(mine.stdout).toContain("would publish");
          expect(existsSync(join(run.apiDirs[c.id], "dist")), "a dry run wrote").toBe(false);
        }
        if (c.id === "audit-json") expect(JSON.parse(mine.stdout).schemaVersion).toBe(1);
        if (c.id.startsWith("generator-fails-audit")) {
          expect(mine.stdout, "no report when the pipeline stopped before the scan").toBe("");
          expect(mine.stderr).not.toMatch(/^unify:/m);
        }
        if (c.id === "io-failure") expect(mine.stderr).toMatch(/^unify: /);
      });

      test(`${c.id}: the same call later in the same process gives the same result`, () => {
        const first = run.results.cases[c.id];
        const again = run.results.cases[`${c.id}:again`];
        expect(again.status).toBe(first.status);
        expect(where(again.stdout, run.apiDirs[`${c.id}:again`])).toBe(where(first.stdout, run.apiDirs[c.id]));
        expect(where(again.stderr, run.apiDirs[`${c.id}:again`])).toBe(where(first.stderr, run.apiDirs[c.id]));
      });
    }

    test("calls started together run one at a time, each as the CLI would have run it", () => {
      expect(run.results.overlap).toHaveLength(OVERLAP.length);
      run.results.overlap.forEach((mine, i) => {
        const theirs = run.overlapExpected[i];
        expect(mine.status, `call ${i}`).toBe(theirs.status);
        expect(where(mine.stdout, run.overlapApi), `call ${i} stdout`).toBe(where(theirs.stdout, run.overlapCli));
        expect(where(mine.stderr, run.overlapApi), `call ${i} stderr`).toBe(where(theirs.stderr, run.overlapCli));
      });
      expectSameTree(snapshot(run.overlapApi), snapshot(run.overlapCli), "the directory after overlapping calls");
    });

    test("a value that is not a boolean, a string or an array of strings is a TypeError", () => {
      expect(run.results.bad).toEqual(Object.fromEntries(BAD.map((b) => [b.id, "TypeError"])));
    });
  });
}

describe("the entry point", () => {
  const probe = (runtimeName, ...args) =>
    Bun.spawnSync({ cmd: [RUNTIMES[runtimeName], PROBE, ...args], cwd: ROOT, env: cleanEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 60_000 });

  for (const runtime of Object.keys(RUNTIMES)) {
    test(`the namespace is exactly audit and build (${runtime})`, () => {
      const r = probe(runtime, "keys");
      expect(r.stderr.toString()).toBe("");
      expect(JSON.parse(r.stdout.toString())).toEqual(["audit", "build"]);
    });

    test(`importing it starts nothing, prints nothing, writes nothing (${runtime})`, () => {
      const hadDist = existsSync(join(ROOT, "dist"));
      const r = probe(runtime, "import-only");
      expect(r.stderr.toString()).toBe("");
      expect(r.stdout.toString()).toBe("");
      expect(r.exitCode).toBe(0);
      // the CLI, started with no arguments, would have built src/ into dist/
      expect(existsSync(join(ROOT, "dist"))).toBe(hadDist);
    });

    test(`src/ files are not importable by name (${runtime})`, () => {
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
