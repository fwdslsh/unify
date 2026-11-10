/**
 * `api-docs.test.js` — every literal in `docs/api.md`.
 *
 * Like `docs/integrations.md` and the guides, `docs/api.md` claims that what it
 * prints works. The three code blocks are EXTRACTED FROM THE DOCUMENT (the nth
 * ```js fence, verbatim), not retyped, written to a file in a scratch project
 * and run — under bun and under node — as an embedder would run them: the
 * scratch project reaches the package through `node_modules/@fwdslsh/unify`,
 * so `import ... from "@fwdslsh/unify"` is resolved by the package's own
 * `exports` map, exactly as for a user. What each block prints is then checked
 * against what the page says it does.
 *
 * Real subprocesses only (H3: nothing here imports from the product); no
 * mocks (H1); no skips (H4).
 */
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, mkTmp, writeTree } from "./support.mjs";

const DOC = readFileSync(join(ROOT, "docs", "api.md"), "utf8");
const TEST_MS = 60_000;

/** The nth ```js fence in the document, verbatim. */
function jsBlock(nth) {
  const blocks = [...DOC.matchAll(/^```js\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
  if (!blocks[nth]) throw new Error(`docs/api.md has no js block #${nth} (found ${blocks.length})`);
  return blocks[nth];
}

const SITE = {
  "site/index.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Home</title></head><body><main><h1>Home</h1></main></body></html>\n',
};

/** A scratch project whose `node_modules/@fwdslsh/unify` is this checkout. */
function project(file, source) {
  const dir = mkTmp();
  writeTree(dir, SITE);
  mkdirSync(join(dir, "node_modules", "@fwdslsh"), { recursive: true });
  symlinkSync(ROOT, join(dir, "node_modules", "@fwdslsh", "unify"), "dir");
  writeFileSync(join(dir, file), source);
  return dir;
}

function run(runtime, dir, file) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.DEBUG;
  delete env.CLAUDECODE;
  const r = Bun.spawnSync({ cmd: [runtime, file], cwd: dir, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 30_000 });
  return { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

const runtimes = { bun: process.execPath, node: Bun.which("node") };

for (const [name, runtime] of Object.entries(runtimes)) {
  test(`the first example audits, then builds and reports diagnostics (${name})`, () => {
    expect(runtime, "node on PATH").toBeTruthy();
    const dir = project("example.mjs", jsBlock(0));
    const r = run(runtime, dir, "example.mjs");
    expect(r.stderr).toBe("");
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe("0 broken findings\nbuild status 0\n");
    expect(existsSync(join(dir, "dist", "index.html"))).toBe(true);
  }, TEST_MS);

  test(`the in-memory example returns the site and writes nothing (${name})`, () => {
    expect(runtime, "node on PATH").toBeTruthy();
    const dir = project("example.mjs", jsBlock(1));
    const r = run(runtime, dir, "example.mjs");
    expect(r.stderr).toBe("");
    expect(r.exit).toBe(0);
    expect(r.stdout).toMatch(/^index\.html [1-9]\d*\n$/);
    expect(existsSync(join(dir, "dist"))).toBe(false);
  }, TEST_MS);

  test(`the usage-error example gets status 2 returned, not thrown (${name})`, () => {
    expect(runtime, "node on PATH").toBeTruthy();
    const dir = project("example.mjs", jsBlock(2));
    const r = run(runtime, dir, "example.mjs");
    expect(r.stderr).toBe("");
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe("2 --base-url needs the site's whole address, got: example.com\n");
  }, TEST_MS);
}

test("the page opens with the experimental label", () => {
  const lines = DOC.split("\n");
  expect(lines[0]).toBe("# The JavaScript API");
  expect(lines.slice(1, 6).join(" ")).toContain("Experimental: this API may change or be removed in any release before v1.");
});
