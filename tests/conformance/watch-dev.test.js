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
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, covers, mkTmp, writeTree } from "./support.mjs";

const SETTLE_MS = 700; // generous: a slow rebuild must not read as a lost event

/** @type {{proc: import('node:child_process').ChildProcess}[]} */
const running = [];

afterEach(() => {
  for (const { proc } of running.splice(0)) proc.kill("SIGTERM");
});

/**
 * Start a long-running CLI command and resolve once it has produced its first
 * output (the startup summary), so tests never race the initial build.
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
      proc.stdout.once("data", () => { clearTimeout(t); setTimeout(res, 400); });
    }),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const first = readFileSync(join(tmp, "dist/from-data.html"), "utf8");
    if (!first.includes('<p id="v">first</p>')) {
      throw new Error(`the first build must run the generator:\n${first}\n${w.stderr}`);
    }

    // Edit only the DATA the generator reads. Nothing about the generator
    // module itself changes, which is precisely the case a module cache gets
    // wrong: re-running the build without re-running the generator leaves
    // `first` on disk and reports success.
    writeFileSync(join(tmp, "src/_data/value.txt"), "second\n");
    await sleep(SETTLE_MS);
    const second = readFileSync(join(tmp, "dist/from-data.html"), "utf8");
    w.proc.kill("SIGTERM");
    await sleep(200);

    if (!second.includes('<p id="v">second</p>')) {
      throw new Error(
        `§33.2: every rebuild re-loads the generator FRESH. The output is stale, which means the module was cached and the generator silently skipped:\n${second}`,
      );
    }
    covers("GEN-03");
  }, 30_000);

  test("WCH-02 — watch output after an edit sequence is identical to a fresh build", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    const w = start(["watch"], tmp);
    await w.ready;

    // An edit sequence a person would actually perform: change a page, add a
    // page, change the shared layout, delete a page.
    writeFileSync(join(tmp, "src/index.html"), SITE["src/index.html"].replace("one", "two"));
    await sleep(SETTLE_MS);
    writeFileSync(join(tmp, "src/extra.html"), "<!doctype html>\n<html>\n<head><title>Extra</title></head>\n<body>\n  <p>extra</p>\n</body>\n</html>\n");
    await sleep(SETTLE_MS);
    writeFileSync(join(tmp, "src/_layout.html"), SITE["src/_layout.html"].replace("— Site", "— Renamed"));
    await sleep(SETTLE_MS);
    const { unlinkSync } = await import("node:fs");
    unlinkSync(join(tmp, "src/about.html"));
    await sleep(SETTLE_MS);

    const watched = snapshot(join(tmp, "dist"));
    w.proc.kill("SIGTERM");
    await sleep(200);

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
    const w = start(["watch"], tmp);
    await w.ready;

    const untouched = join(tmp, "dist", "about.html");
    const before = statSync(untouched);

    // Edit a different page; about.html's content is unaffected.
    writeFileSync(join(tmp, "src/index.html"), SITE["src/index.html"].replace("one", "changed"));
    await sleep(SETTLE_MS);

    expect(readFileSync(join(tmp, "dist", "index.html"), "utf8")).toContain("changed");
    const after = statSync(untouched);
    // Same inode and mtime: not rewritten, not recreated.
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    covers("WCH-03");
  }, 30_000);

  test("WCH-04 — a failing rebuild emits an error page, and the next good one replaces it", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    const w = start(["watch"], tmp);
    await w.ready;
    expect(readFileSync(join(tmp, "dist", "index.html"), "utf8")).toContain("one");

    // Break it: a reference that resolves to nothing is a problem (§12).
    writeFileSync(join(tmp, "src/index.html"),
      '<!doctype html>\n<html>\n<head><title>Home</title></head>\n<body>\n  <a href="/missing.html">x</a>\n</body>\n</html>\n');
    await sleep(SETTLE_MS);
    const broken = readFileSync(join(tmp, "dist", "index.html"), "utf8");
    expect(broken).toContain("unify-watch-error-page");
    expect(broken).toContain("missing.html");

    // Fix it: the error page is gone and real output is back.
    writeFileSync(join(tmp, "src/index.html"), SITE["src/index.html"].replace("one", "fixed"));
    await sleep(SETTLE_MS);
    const healed = readFileSync(join(tmp, "dist", "index.html"), "utf8");
    expect(healed).not.toContain("unify-watch-error-page");
    expect(healed).toContain("fixed");
    covers("WCH-04");
  }, 30_000);
});

describe("§16 dev server", () => {
  test("WCH-05 — dev serves the output directory, and a taken port is a fatal environment fault", async () => {
    const tmp = mkTmp();
    writeTree(tmp, SITE);
    const port = await freePort();
    const d = start(["dev", "-p", String(port)], tmp);
    await d.ready;
    await sleep(400);

    const res = await fetch(`http://localhost:${port}/index.html`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("one");

    const missing = await fetch(`http://localhost:${port}/nope.html`);
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
    await sleep(400);

    const served = await (await fetch(`http://localhost:${port}/index.html`)).text();
    expect(served).toContain("EventSource");

    d.proc.kill("SIGTERM");
    await sleep(300);

    // §5's "unify ships no JavaScript, ever" — check the whole tree, not one file.
    for (const [rel, body] of Object.entries(snapshot(join(tmp, "dist")))) {
      expect(body, `${rel} must not carry the reload script`).not.toContain("EventSource");
      expect(body, `${rel} must not carry the reload endpoint`).not.toContain("__unify_reload__");
    }
    covers("WCH-06");
  }, 30_000);
});
