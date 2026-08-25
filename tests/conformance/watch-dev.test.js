/**
 * Tier 2 — the watch contract and dev server (conformance-spec §16,
 * WCH-01..06), driven through the real CLI as a subprocess.
 *
 * These exist because the implementation's own tests live in `tests/unit/`,
 * which is Tier 3 and carries no conformance authority (testing-strategy §2)
 * — `covers()` is rejected outside this directory by the hygiene gate. So the
 * behaviour was thoroughly tested and the release gate still could not credit
 * a single WCH rule. This file closes that, spawning `unify watch`/`unify dev`
 * the way a person runs them and asserting against real files on disk.
 *
 * No mocks, no `src/**` imports, no fake timers: a watcher that only works
 * against a simulated clock is not evidence about a watcher.
 *
 * Every wait in this file is a CONDITION with an upper bound, never a
 * constant. A fixed sleep is wrong in both directions at once: too long on the
 * machine that rebuilds in 40 ms, and too short on the loaded CI box that
 * needs a second — which is the flake this shape removes. `SETTLE_TIMEOUT_MS`
 * is a bound reached only when the thing under test genuinely never happened,
 * and it is deliberately far more generous than the sleep it replaced.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, covers, mkTmp, writeTree } from "./support.mjs";

/** The bound on any single wait. Reached only on a real failure, never on a pass. */
const SETTLE_TIMEOUT_MS = 15_000;
/** How often a condition is re-checked. Small: the cost of a poll is a stat. */
const POLL_MS = 20;
/**
 * How long the output tree must hold still before it counts as settled.
 * `publish()` renames file by file (src/core/publish.js), so a tree read
 * mid-publish can be a mixture of two builds — this is what makes the
 * whole-tree comparisons below read one build and not two.
 */
const QUIET_MS = 100;

/** @type {{proc: import('node:child_process').ChildProcess}[]} */
const running = [];

afterEach(() => {
  for (const { proc } of running.splice(0)) proc.kill("SIGTERM");
});

/**
 * Start a long-running CLI command and resolve once it has produced its first
 * output (the startup summary), so tests never race the initial build. The
 * resolution is the output itself — there is no padding after it, because
 * every caller follows this with a wait for the specific artefact it needs.
 * @param {string[]} args
 * @param {string} cwd
 */
function start(args, cwd) {
  const proc = spawn("bun", [CLI, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  running.push({ proc });
  let out = "";
  let err = "";
  proc.stdout.on("data", (d) => { out += d; });
  proc.stderr.on("data", (d) => { err += d; });
  return {
    proc,
    get stdout() { return out; },
    get stderr() { return err; },
    ready: new Promise((res) => {
      const t = setTimeout(res, 3000);
      proc.stdout.once("data", () => { clearTimeout(t); res(); });
    }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll `check` until it returns something truthy, and return that. A throw
 * from `check` (a file that does not exist yet, a connection refused) counts
 * as "not yet", never as a failure — the bound is what reports a failure, and
 * it names what was being waited for.
 * @template T
 * @param {() => T | Promise<T>} check
 * @param {string} what - named in the timeout message
 * @param {number} [timeoutMs]
 * @returns {Promise<T>}
 */
async function waitUntil(check, what, timeoutMs = SETTLE_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
    } catch { /* not yet */ }
    if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(POLL_MS);
  }
}

/**
 * Read `file` until its contents satisfy `predicate`; a missing file is "not
 * yet". Returns the contents that satisfied it.
 * @param {string} file
 * @param {(text: string) => boolean} predicate
 * @param {string} what
 */
function waitForContent(file, predicate, what, timeoutMs = SETTLE_TIMEOUT_MS) {
  return waitUntil(() => {
    if (!existsSync(file)) return null;
    const text = readFileSync(file, "utf8");
    return predicate(text) ? text : null;
  }, what, timeoutMs);
}

/**
 * Wait for a killed child to actually be gone, escalating to SIGKILL at the
 * bound. Replaces "sleep long enough that it has probably exited": what the
 * caller needs is that nothing is writing to `dist/` any more, and process
 * exit is that fact rather than a proxy for it.
 * @param {import('node:child_process').ChildProcess} proc
 */
function waitForExit(proc, timeoutMs = 5000) {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(() => { try { proc.kill("SIGKILL"); } catch { /* gone */ } res(); }, timeoutMs);
    proc.once("close", () => { clearTimeout(t); res(); });
  });
}

/**
 * Fetch `url` until the response satisfies `predicate`, which sees the status
 * and the body together — a dev server answers as soon as it is listening,
 * which is before its first build lands, so a status alone is not proof the
 * page under test is the one being served.
 * @param {string} url
 * @param {(r: {status: number, body: string}) => boolean} predicate
 * @param {string} what
 */
function waitForResponse(url, predicate, what, timeoutMs = SETTLE_TIMEOUT_MS) {
  return waitUntil(async () => {
    const res = await fetch(url, { redirect: "manual" });
    const answer = { status: res.status, body: await res.text() };
    return predicate(answer) ? answer : null;
  }, what, timeoutMs);
}

/**
 * A port the OS says is free right now.
 *
 * Picking from a fixed range is not good enough: the first draft of this file
 * used `3700 + something` and collided with an unrelated service already
 * running on the development machine, so `fetch` happily returned that
 * server's page and the assertion failed against markup unify never produced.
 * A test that can silently talk to the wrong process is worse than no test.
 * @returns {Promise<number>}
 */
async function freePort() {
  const net = await import("node:net");
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

/** Every file under `dir`, as path → contents. */
function snapshot(dir) {
  /** @type {Record<string,string>} */
  const out = {};
  const walk = (d, prefix) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, rel);
      else out[rel] = readFileSync(p, "utf8");
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

/**
 * `snapshot(dir)` once two readings `QUIET_MS` apart agree and the tree is not
 * empty — i.e. no publish is in flight. This is the one wait that is not a
 * single observable event, because "no further rebuild is coming" is not an
 * event a watcher emits; a quiet period is the honest approximation, and it is
 * applied once at the end rather than after every edit.
 * @param {string} dir
 */
async function settledSnapshot(dir, timeoutMs = SETTLE_TIMEOUT_MS) {
  let prev = null;
  return waitUntil(async () => {
    const next = snapshot(dir);
    const key = JSON.stringify(next);
    const agreed = key === prev && Object.keys(next).length > 0;
    prev = key;
    if (agreed) return next;
    await sleep(QUIET_MS);
    return null;
  }, `the output tree under ${dir} to stop changing`, timeoutMs);
}

const SITE = {
  "src/_layout.html":
    '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>— Site</title>\n</head>\n<body>\n  <main><slot></slot></main>\n</body>\n</html>\n',
  "src/index.html": "<!doctype html>\n<html>\n<head><title>Home</title></head>\n<body>\n  <p>one</p>\n</body>\n</html>\n",
  "src/about.html": "<!doctype html>\n<html>\n<head><title>About</title></head>\n<body>\n  <p>about</p>\n</body>\n</html>\n",
};

describe("§16 watch contract", () => {
  test("GEN-03 — every rebuild re-loads the generator, so watch output never goes stale", async () => {
    // §33.2's third consequence, and the ONLY one a subprocess test cannot
    // reach: each `runCli` is a fresh process, so ESM's module cache is empty
    // every time and a cached-module bug is invisible. It only bites inside
    // ONE long-lived process — which is exactly watch mode — and it bites
    // SILENTLY: the generator is skipped, the site goes stale, and the build
    // reports success. That is the failure §14 exists to forbid wearing a
    // performance optimisation's clothes.
    const tmp = mkTmp();
    writeTree(tmp, {
      "src/index.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home."></head><body><h1>Home</h1><a href="/from-data.html">d</a></body></html>\n',
      "src/_data/value.txt": "first\n",
      "src/_scripts/gen.mjs": `import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const [, , sourceRoot, outDir] = process.argv;
const value = readFileSync(join(sourceRoot, "_data/value.txt"), "utf8").trim();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "from-data.html"),
  \`<!doctype html>\\n<html lang="en"><head><meta charset="utf-8"><title>Data</title><meta name="description" content="From the data file."></head><body><h1>Data</h1><p id="v">\${value}</p></body></html>\\n\`);
`,
    });
    const w = start(["watch", "--generate", "_scripts/gen.mjs"], tmp);
    await w.ready;
    const generated = join(tmp, "dist/from-data.html");
    try {
      await waitForContent(generated, (t) => t.includes('<p id="v">first</p>'), "the generator's first output");
    } catch {
      const seen = existsSync(generated) ? readFileSync(generated, "utf8") : "<the generator wrote nothing>";
      throw new Error(`the first build must run the generator:\n${seen}\n${w.stderr}`);
    }

    // Edit only the DATA the generator reads. Nothing about the generator
    // module itself changes, which is precisely the case a module cache gets
    // wrong: re-running the build without re-running the generator leaves
    // `first` on disk and reports success.
    writeFileSync(join(tmp, "src/_data/value.txt"), "second\n");
    try {
      await waitForContent(generated, (t) => t.includes('<p id="v">second</p>'), "the rebuild to re-run the generator");
    } catch {
      throw new Error(
        `§33.2: every rebuild re-loads the generator FRESH. The output is stale, which means the module was cached and the generator silently skipped:\n${readFileSync(generated, "utf8")}`,
      );
    }
    w.proc.kill("SIGTERM");
    await waitForExit(w.proc);
    covers("GEN-03");
  }, 30_000);

  test("GEN-12 — under watch, command names \"watch\" and each rebuild gets a fresh generatedRoot", async () => {
    // The command name reaches the context through watch.js's own default
    // (`command = "watch"`) rather than through build.js's own default —
    // a code path GEN-12's other tests (spawned once via `build`/`audit`)
    // never exercise. Two rebuilds' contexts also have to differ in
    // paths.generatedRoot, which is §33.2's "fresh per rebuild" lifecycle
    // promise: the fresh-overlay-per-build structure gives it for free, but
    // nothing outside this file has ever read two contexts from one long-lived
    // watch process to check.
    const tmp = mkTmp();
    const log = join(tmp, "ctx-log.jsonl");
    writeTree(tmp, {
      "src/index.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home."></head><body><h1>Home</h1></body></html>\n',
      // JSON.stringify with no indentation, so each context is exactly ONE
      // line in the log — writeGeneratorContext's own file is two-space
      // pretty-printed and would otherwise split across several "lines" of
      // this JSONL log.
      "src/_scripts/gen.mjs": `import { appendFileSync, readFileSync } from "node:fs";
const [, , , , contextPath] = process.argv;
appendFileSync(${JSON.stringify(log)}, JSON.stringify(JSON.parse(readFileSync(contextPath, "utf8"))) + "\\n");
`,
    });
    const readLines = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];

    const w = start(["watch", "--generate", "_scripts/gen.mjs"], tmp);
    await w.ready;
    try {
      await waitUntil(() => readLines().length >= 1, "the first watch build's generator-context");
    } catch {
      throw new Error(`the first watch build must run the generator:\n${w.stderr}`);
    }
    const first = JSON.parse(readLines()[0]);
    if (first.command !== "watch") {
      throw new Error(`command must be "watch" under \`unify watch\`, got ${JSON.stringify(first.command)}`);
    }

    // Any change triggers a rebuild; the generator itself is untouched, so a
    // second line in the log can only come from a second, fresh context.
    writeFileSync(join(tmp, "src/index.html"),
      '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home, edited."></head><body><h1>Home</h1></body></html>\n');
    try {
      await waitUntil(() => readLines().length >= 2, "the rebuild's generator-context");
    } catch {
      throw new Error(`a rebuild under watch must re-run the generator with a fresh context:\n${w.stderr}`);
    }
    const second = JSON.parse(readLines()[1]);
    if (second.command !== "watch") {
      throw new Error(`command must stay "watch" on a rebuild, got ${JSON.stringify(second.command)}`);
    }
    if (second.paths.generatedRoot === first.paths.generatedRoot) {
      throw new Error(
        `§33.2: each rebuild must get a fresh paths.generatedRoot, not reuse the previous build's: ${second.paths.generatedRoot}`,
      );
    }

    w.proc.kill("SIGTERM");
    await waitForExit(w.proc);
    covers("GEN-12");
  }, 30_000);

  test("WCH-02 — watch output after an edit sequence is identical to a fresh build", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    const dist = join(tmp, "dist");
    const w = start(["watch"], tmp);
    await w.ready;

    // An edit sequence a person would actually perform: change a page, add a
    // page, change the shared layout, delete a page. Each step waits for its
    // OWN effect to reach the output, so the next edit lands against a
    // finished rebuild exactly as the fixed sleep intended — but observed
    // rather than assumed.
    writeFileSync(join(tmp, "src/index.html"), SITE["src/index.html"].replace("one", "two"));
    await waitForContent(join(dist, "index.html"), (t) => t.includes("two"), "the edit to reach dist/index.html");

    writeFileSync(join(tmp, "src/extra.html"), "<!doctype html>\n<html>\n<head><title>Extra</title></head>\n<body>\n  <p>extra</p>\n</body>\n</html>\n");
    await waitForContent(join(dist, "extra.html"), (t) => t.includes("extra"), "the added page to reach dist/extra.html");

    writeFileSync(join(tmp, "src/_layout.html"), SITE["src/_layout.html"].replace("— Site", "— Renamed"));
    await waitForContent(join(dist, "index.html"), (t) => t.includes("Renamed"), "the layout change to reach every page");

    const { unlinkSync } = await import("node:fs");
    unlinkSync(join(tmp, "src/about.html"));
    await waitUntil(() => !existsSync(join(dist, "about.html")), "the deleted page to leave the output");

    const watched = await settledSnapshot(dist);
    w.proc.kill("SIGTERM");
    await waitForExit(w.proc);

    // A completely independent build of the same final source.
    const fresh = mkTmp();
    mkdirSync(join(fresh, "src"), { recursive: true });
    for (const [rel, body] of Object.entries(snapshot(join(tmp, "src")))) {
      const dest = join(fresh, "src", rel);
      mkdirSync(join(dest, ".."), { recursive: true });
      writeFileSync(dest, body);
    }
    await new Promise((res) => spawn("bun", [CLI, "build"], { cwd: fresh, stdio: "ignore" }).on("close", res));

    expect(watched).toEqual(snapshot(join(fresh, "dist")));
    expect(Object.keys(watched).length).toBeGreaterThan(0);
    covers("WCH-01", "WCH-02");
  }, 30_000);

  test("WCH-03 — an unchanged file is not rewritten across rebuilds", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    const dist = join(tmp, "dist");
    const w = start(["watch"], tmp);
    await w.ready;

    const untouched = join(dist, "about.html");
    // The baseline must be taken from a FINISHED initial build: an inode read
    // while the first publish is still renaming files in is a baseline the
    // startup build itself would go on to change, and the rebuild would be
    // blamed for it.
    await settledSnapshot(dist);
    const before = statSync(untouched);

    // Edit a different page; about.html's content is unaffected.
    writeFileSync(join(tmp, "src/index.html"), SITE["src/index.html"].replace("one", "changed"));
    await waitForContent(join(dist, "index.html"), (t) => t.includes("changed"), "the edit to reach dist/index.html");

    expect(readFileSync(join(dist, "index.html"), "utf8")).toContain("changed");
    const after = statSync(untouched);
    // Same inode and mtime: not rewritten, not recreated.
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    covers("WCH-03");
  }, 30_000);

  test("WCH-04 — a failing rebuild emits an error page, and the next good one replaces it", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    const dist = join(tmp, "dist");
    const w = start(["watch"], tmp);
    await w.ready;
    await waitForContent(join(dist, "index.html"), (t) => t.includes("one"), "the startup build to publish index.html");

    // Break it: a reference that resolves to nothing is a problem (§12).
    writeFileSync(join(tmp, "src/index.html"),
      '<!doctype html>\n<html>\n<head><title>Home</title></head>\n<body>\n  <a href="/missing.html">x</a>\n</body>\n</html>\n');
    const broken = await waitForContent(
      join(dist, "index.html"), (t) => t.includes("unify-watch-error-page"), "the failing rebuild's error page");
    expect(broken).toContain("unify-watch-error-page");
    expect(broken).toContain("missing.html");

    // Fix it: the error page is gone and real output is back.
    writeFileSync(join(tmp, "src/index.html"), SITE["src/index.html"].replace("one", "fixed"));
    const healed = await waitForContent(
      join(dist, "index.html"), (t) => t.includes("fixed"), "the good rebuild to replace the error page");
    expect(healed).not.toContain("unify-watch-error-page");
    expect(healed).toContain("fixed");
    covers("WCH-04");
  }, 30_000);

  test("WCH-08 — a failing rebuild never error-pages a fragment", async () => {
    // A `*.fragment.html` is shipped byte-for-byte and never composed (§5),
    // so it has no error presentation to offer. It used to be caught by the
    // error-page filter anyway — `.endsWith(".html")` is true of it — which
    // made watch the one place that guarantee lapsed, and it failed
    // invisibly: a page announces "Build error" on reload, while a fragment
    // is fetched by hx-get and swapped into a page that still looks fine, so
    // a whole document lands inside an element.
    //
    // The failure has to be UNATTRIBUTABLE for the fallback to engage. A bad
    // reference is attributable to the page that carries it, so only that
    // page is error-paged and a fragment is never in scope; a generator
    // failure is P29 located at a `_`-prefixed `.mjs` that maps to no output
    // path, which is what unions the placeholder across every known good
    // page. That is the case this rule is about.
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    writeFileSync(join(tmp, "src/bits.fragment.html"), "<ul><li>a real fragment</li></ul>\n");
    mkdirSync(join(tmp, "src/_scripts"), { recursive: true });
    writeFileSync(join(tmp, "src/_scripts/gen.mjs"), "// healthy: writes nothing\n");
    const dist = join(tmp, "dist");
    const w = start(["watch", "--generate", "_scripts/gen.mjs"], tmp);
    await w.ready;
    const good = await waitForContent(
      join(dist, "bits.fragment.html"), (t) => t.includes("a real fragment"), "the fragment to publish");

    // Break the generator: P29, unattributable, so every known good page is
    // replaced by the error page.
    writeFileSync(join(tmp, "src/_scripts/gen.mjs"), 'throw new Error("generator down");\n');
    await waitForContent(
      join(dist, "index.html"), (t) => t.includes("unify-watch-error-page"), "the failing rebuild's error page");

    // The PAGE is error-paged — WCH-04 is untouched — and the fragment is not.
    const frag = readFileSync(join(dist, "bits.fragment.html"), "utf8");
    expect(frag).toBe(good);
    expect(frag).not.toContain("unify-watch-error-page");
    expect(frag).not.toContain("<!doctype");
    covers("WCH-08");
  }, 30_000);
});

describe("§16 dev server", () => {
  test("WCH-05 — dev serves the output directory, and a taken port is a fatal environment fault", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;

    // Status AND body together: the server is listening before its first build
    // has landed, so a bare 200 is not evidence the built page is being served.
    const res = await waitForResponse(
      `http://localhost:${port}/index.html`,
      (r) => r.status === 200 && r.body.includes("one"),
      "the dev server to serve the built index.html");
    expect(res.status).toBe(200);
    expect(res.body).toContain("one");

    const missing = await fetch(`http://localhost:${port}/nope.html`);
    await missing.text();
    expect(missing.status).toBe(404);

    // A second dev on the same port must exit 2, not silently bind elsewhere.
    const second = await new Promise((res2) => {
      const p = spawn("bun", [CLI, "dev", "-p", String(port)], { cwd: tmp, stdio: "ignore" });
      const t = setTimeout(() => { p.kill("SIGKILL"); res2(null); }, 8000);
      p.on("close", (code) => { clearTimeout(t); res2(code); });
    });
    expect(second).toBe(2);
    covers("WCH-05");
  }, 30_000);

  test("WCH-06 — the reload script is served but never written to the output directory", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;

    const served = await waitForResponse(
      `http://localhost:${port}/index.html`,
      (r) => r.status === 200 && r.body.includes("one"),
      "the dev server to serve the built index.html");
    expect(served.body).toContain("EventSource");

    d.proc.kill("SIGTERM");
    await waitForExit(d.proc);

    // §5's "unify ships no JavaScript, ever" — check the whole tree, not one file.
    for (const [rel, body] of Object.entries(snapshot(join(tmp, "dist")))) {
      expect(body, `${rel} must not carry the reload script`).not.toContain("EventSource");
      expect(body, `${rel} must not carry the reload endpoint`).not.toContain("__unify_reload__");
    }
    covers("WCH-06");
  }, 30_000);
});
