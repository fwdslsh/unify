/**
 * `api-docs.test.js` — every literal in `docs/api.md`.
 *
 * Like `docs/integrations.md` and the guides, `docs/api.md` claims that what it
 * prints works. The code block is EXTRACTED FROM THE DOCUMENT (the nth ```js
 * fence, verbatim), not retyped, written to a file in a scratch project and run
 * — under bun and under node — as an embedder would run it: the scratch project
 * reaches the package through `node_modules/@fwdslsh/unify`, so
 * `import ... from "@fwdslsh/unify"` is resolved by the package's own `exports`
 * map, exactly as for a user. What it prints is checked against what the page
 * says it does, and the page's option-to-flag table is checked row by row
 * against the real CLI's behaviour through the package.
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
  test(`the example audits as JSON, then builds (${name})`, () => {
    expect(runtime, "node on PATH").toBeTruthy();
    const dir = project("example.mjs", jsBlock(0));
    const r = run(runtime, dir, "example.mjs");
    expect(r.stderr).toBe("");
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe("0 broken findings\nbuild status 0\n");
    expect(existsSync(join(dir, "dist", "index.html"))).toBe(true);
  }, TEST_MS);

  test(`the option-to-argv table holds, and a bad value is a TypeError (${name})`, () => {
    expect(runtime, "node on PATH").toBeTruthy();
    const dir = project("table.mjs", `
      import { build } from "@fwdslsh/unify";
      const out = {};
      out.pretty = (await build({ source: "site", prettyUrls: true, dryRun: true })).stdout.includes("dist/index.html");
      out.omitted = (await build({ source: "site", prettyUrls: false, dryRun: undefined })).status;
      out.value = (await build({ source: "site", baseUrl: "example.com" })).status;
      out.misused = (await build({ source: "site", baseUrl: true })).stderr;
      out.repeated = (await build({ source: "site", exclude: ["_*", "drafts/**"], dryRun: true })).status;
      try { await build({ source: 5 }); } catch (e) { out.bad = e.name; }
      console.log(JSON.stringify(out));
    `);
    const r = run(runtime, dir, "table.mjs");
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout)).toEqual({
      pretty: true,
      omitted: 0,
      value: 2,
      misused: "--base-url needs a value\n  fix: write it as: --base-url https://your-domain.example/\n",
      repeated: 0,
      bad: "TypeError",
    });
  }, TEST_MS);
}

test("the page opens with the experimental label and says what the API is", () => {
  const lines = DOC.split("\n");
  expect(lines[0]).toBe("# The JavaScript API");
  expect(lines.slice(1, 6).join(" ")).toContain("Experimental: this API may change or be removed in any release before v1.");
  expect(DOC).toContain("The API is the command line, called as a function.");
});
