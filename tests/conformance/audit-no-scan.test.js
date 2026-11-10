/**
 * `audit-no-scan.test.js` — AUD-19: `unify audit` when the pipeline stops
 * before the scan.
 *
 * A generator that fails (P29) or a source-inventory frontmatter fault stops the
 * build before anything is scanned, so there is no site for `audit` to
 * evaluate. It used to end in `unify: null is not an object (evaluating
 * 'run.findings')` under bun and `unify: Cannot read properties of null
 * (reading 'findings')` under node: an internal error, worded by the runtime,
 * shown to an author. Now: the problem the build reported, nothing on stdout in
 * any format, exit 1 — the same bytes under both runtimes (run the way G12
 * runs them: once under bun, once under node, and compared).
 *
 * Real spawns only (H3); no mocks (H1); no skips (H4).
 */
import { expect, test } from "bun:test";
import { CLI, covers, mkTmp, writeTree } from "./support.mjs";

const PAGE = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Home</title></head><body><main><h1>Home</h1></main></body></html>\n';
const TREES = {
  "a failing generator": { "src/index.html": PAGE, "src/gen.mjs": "process.exit(3);\n" },
  "a frontmatter fault the source inventory stops on": { "src/index.html": PAGE, "src/broken.md": "---\ntitle: [unclosed\n---\n\nBody\n", "src/gen.mjs": "// never reached\n" },
};

const node = Bun.which("node");

function run(runtime, args, cwd) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.DEBUG;
  delete env.CLAUDECODE;
  const r = Bun.spawnSync({ cmd: [runtime, CLI, ...args], cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 30_000 });
  return { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

for (const [what, tree] of Object.entries(TREES)) {
  test(`AUD-19 — audit with ${what}: the problem, no report, exit 1, no internal error, same under bun and node`, () => {
    expect(node, "node on PATH").toBeTruthy();
    const dir = mkTmp();
    writeTree(dir, tree);
    const outcomes = [];
    for (const runtime of [process.execPath, node]) {
      for (const format of [[], ["--format", "json"], ["--format", "sarif"]]) {
        const r = run(runtime, ["audit", "-s", "src", "--generate", "gen.mjs", ...format], dir);
        expect(r.exit, `exit (${runtime} ${format.join(" ")})`).toBe(1);
        expect(r.stdout, "stdout: no report in any format").toBe("");
        expect(r.stderr, "the problem the build reported").toMatch(/: problem: /);
        expect(r.stderr, "no internal error").not.toMatch(/^unify:/m);
        expect(r.stderr).not.toContain("null");
        outcomes.push(r.stderr.replace(/(run it directly to see its full output: )(?:bun|node) /, "$1<runtime> "));
      }
    }
    expect(new Set(outcomes).size, "the same diagnostics from every format and both runtimes").toBe(1);
    // build says the same thing about the same tree
    const b = run(process.execPath, ["build", "-s", "src", "--generate", "gen.mjs"], dir);
    expect(b.exit).toBe(1);
    expect(b.stderr.replace(/(run it directly to see its full output: )(?:bun|node) /, "$1<runtime> ")).toBe(outcomes[0]);
    covers("AUD-19");
  }, 120_000);
}
