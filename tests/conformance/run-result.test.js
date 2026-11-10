/**
 * `run-result.test.js` — gate G15: what `run(argv)` returns is what the command
 * line did, as data.
 *
 * `run` is the package's one export and the function the `unify` program itself
 * calls, so there is no second implementation to compare. What needs holding is
 * that the object it returns agrees with what the same command printed, wrote
 * and exited with — and that a script calling it gets the command line's own
 * behaviour in its own process.
 *
 * Each case runs twice in one directory, under bun and under node: the real
 * CLI, then a script that imports `run` from the package by name (through
 * `node_modules/@fwdslsh/unify`, as a user's script does) and writes the result
 * to a file. Then:
 *   - the script's stdout, stderr and the directory it leaves are byte-identical
 *     to the CLI's, and `status` is the CLI's exit code;
 *   - `diagnostics`, printed in §14.1's form, are the CLI's stderr;
 *   - `files` is the published tree, byte for byte, written or not, and empty
 *     when nothing could be published;
 *   - `report` is the document `unify audit --format json` prints, when the run
 *     was audited, and null otherwise;
 *   - what the command line exits 2 for rejects with the `UsageError`.
 *
 * Real subprocesses only (H3: nothing here imports from the product); no
 * mocks (H1); no skips (H4).
 */
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, ROOT, mkTmp, writeTree } from "./support.mjs";

const TEST_MS = 120_000;
const runtimes = { bun: process.execPath, node: Bun.which("node") };

const page = (title, body) => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="description" content="About ${title}."></head><body><main><h1>${title}</h1>${body}</main></body></html>\n`;
const SITE = {
  "site/index.html": page("Home", '<a href="about.html">About</a>'),
  "site/about.html": page("About", '<a href="index.html">Home</a><img src="assets/mark.bin" alt="">'),
  "site/assets/mark.bin": Buffer.from([0, 255, 1, 254, 128, 10]),
};
const BROKEN = { ...SITE, "site/about.html": page("About", '<a href="gone.html">Gone</a>') };
const FAILING_GENERATOR = { ...SITE, "scripts/gen.mjs": 'console.error("no data"); process.exit(3);\n' };

const DRIVER = `
import { run } from "@fwdslsh/unify";
import { writeFileSync } from "node:fs";
const out = { runs: [] };
for (const argv of JSON.parse(process.env.UNIFY_ARGVS)) {
  try {
    const r = await run(argv);
    out.runs.push({
      keys: Object.keys(r), status: r.status, diagnostics: r.diagnostics, report: r.report,
      files: [...r.files].map(([path, bytes]) => [path, bytes instanceof Uint8Array, Buffer.from(bytes).toString("base64")]),
    });
  } catch (e) {
    out.runs.push({ rejected: { name: e.name, message: e.message, fixes: e.fixes ?? null } });
  }
}
out.exitCode = process.exitCode ?? null;
writeFileSync(process.env.UNIFY_RESULT, JSON.stringify(out));
`;

/** A project directory holding `tree`, the driver, and this checkout as its `@fwdslsh/unify`. */
function project(tree) {
  const dir = mkTmp();
  writeTree(dir, tree);
  mkdirSync(join(dir, "node_modules", "@fwdslsh"), { recursive: true });
  symlinkSync(ROOT, join(dir, "node_modules", "@fwdslsh", "unify"), "dir");
  writeFileSync(join(dir, "driver.mjs"), DRIVER);
  return dir;
}

function spawn(cmd, cwd, extraEnv = {}) {
  const env = { ...process.env, NO_COLOR: "1", ...extraEnv };
  delete env.DEBUG;
  delete env.FORCE_COLOR;
  delete env.CLAUDECODE;
  const r = Bun.spawnSync({ cmd, cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  return { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

/** Every file under `dir/dist`, as path -> base64, or null when there is no `dist`. */
function published(dir) {
  const root = join(dir, "dist");
  if (!existsSync(root)) return null;
  const out = {};
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      const path = rel ? `${rel}/${name}` : name;
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else out[path] = readFileSync(join(root, path)).toString("base64");
    }
  };
  walk("");
  return out;
}

/** The CLI, then `run()` in a script, for the same argv in the same directory. */
function both(runtime, dir, argv, { again = [] } = {}) {
  rmSync(join(dir, "dist"), { recursive: true, force: true });
  const cli = spawn([runtime, CLI, ...argv], dir);
  const cliTree = published(dir);
  rmSync(join(dir, "dist"), { recursive: true, force: true });
  const resultFile = join(dir, "result.json");
  const script = spawn([runtime, "driver.mjs"], dir, { UNIFY_ARGVS: JSON.stringify([argv, ...again]), UNIFY_RESULT: resultFile });
  const out = JSON.parse(readFileSync(resultFile, "utf8"));
  rmSync(resultFile);
  return { cli, cliTree, script, tree: published(dir), out, result: out.runs[0] };
}

/** §14.1's printed form of the structured diagnostics: what the CLI writes to stderr. */
const printed = (diagnostics) => diagnostics.map((d) => [
  `${d.line === undefined ? d.file : `${d.file}:${d.line}`}: ${d.severity}: ${d.message}`,
  ...(d.context ? [`  in: ${d.context}`] : []),
  ...(d.fixes ?? []).map((fix) => `  fix: ${fix}`),
].join("\n") + "\n").join("");

const filesOf = (result) => Object.fromEntries(result.files.map(([path, , b64]) => [path, b64]));

/** The nth ```js fence of docs/api.md, verbatim. */
const docBlock = (nth) => [...readFileSync(join(ROOT, "docs", "api.md"), "utf8").matchAll(/^```js\n([\s\S]*?)^```$/gm)][nth][1];

for (const [name, runtime] of Object.entries(runtimes)) {
  test(`docs/api.md's examples run as written (${name})`, () => {
    const dir = project(SITE);
    writeFileSync(join(dir, "example.mjs"), docBlock(0));
    const example = spawn([runtime, "example.mjs"], dir);
    expect(example.stderr).toBe("");
    expect(example.exit).toBe(0);
    expect(example.stdout).toContain("status 0, 4 files\n"); // two pages, the asset, sitemap.xml
    expect(example.stdout.endsWith("0 broken findings\n")).toBe(true);
    writeFileSync(join(dir, "usage.mjs"), docBlock(1));
    expect(spawn([runtime, "usage.mjs"], dir)).toEqual({
      exit: 0, stderr: "", stdout: "UsageError --base-url needs the site's whole address, got: example.com\n",
    });
  }, TEST_MS);

  test(`a build: the CLI's output, and the site it wrote as \`files\` (${name})`, () => {
    expect(runtime, "node on PATH").toBeTruthy();
    const dir = project(SITE);
    const { cli, cliTree, script, tree, out, result } = both(runtime, dir, ["build"], { again: [["build"]] });
    expect(cli.exit).toBe(0);
    expect(script).toEqual({ exit: 0, stdout: cli.stdout + cli.stdout, stderr: "" }); // it ran twice
    expect(tree).toEqual(cliTree);
    expect(out.exitCode, "run() leaves the process's exit code alone").toBeNull();
    expect(result.keys).toEqual(["status", "diagnostics", "files", "report"]);
    expect(result.status).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.report).toBeNull();
    expect(result.files.every(([, isBytes]) => isBytes)).toBe(true);
    expect(filesOf(result)).toEqual(cliTree);
    expect(Object.keys(cliTree)).toEqual(["about.html", "assets/mark.bin", "index.html"]);
    expect(out.runs[1], "a second run in the same process is independent of the first").toEqual(result);
  }, TEST_MS);

  test(`a dry run returns the same \`files\` and writes nothing (${name})`, () => {
    const dir = project(SITE);
    const real = both(runtime, dir, ["build"]);
    const { cli, script, tree, result } = both(runtime, dir, ["build", "--dry-run"]);
    expect(script).toEqual({ exit: 0, stdout: cli.stdout, stderr: cli.stderr });
    expect(cli.stdout).toContain("would publish 3 files");
    expect(tree, "nothing written").toBeNull();
    expect(result.status).toBe(0);
    expect(filesOf(result)).toEqual(real.cliTree);
  }, TEST_MS);

  test(`a problem: status 1, the diagnostics as data, no \`files\`, nothing published (${name})`, () => {
    const dir = project(BROKEN);
    const { cli, script, tree, result } = both(runtime, dir, ["build"]);
    expect(cli.exit).toBe(1);
    expect(script).toEqual({ exit: 0, stdout: cli.stdout, stderr: cli.stderr });
    expect(tree).toBeNull();
    expect(result.status).toBe(1);
    expect(result.diagnostics).toEqual([{
      severity: "problem", file: "site/about.html", line: 2,
      message: "gone.html does not resolve to any emitted file",
      context: "gone.html", fixes: ["check the path spelling and casing"],
    }]);
    expect(printed(result.diagnostics)).toBe(cli.stderr);
    expect(result.files).toEqual([]);
    expect(result.report).toBeNull();
  }, TEST_MS);

  test(`audit: \`report\` is the --format json document, whatever was printed (${name})`, () => {
    const dir = project(SITE);
    const flags = ["--base-url", "https://example.com/docs/"];
    const real = both(runtime, dir, ["build", ...flags]);
    const json = both(runtime, dir, ["audit", ...flags, "--format", "json"]);
    expect(json.script).toEqual({ exit: 0, stdout: json.cli.stdout, stderr: json.cli.stderr });
    expect(json.tree, "audit writes nothing").toBeNull();
    const document = JSON.parse(json.cli.stdout);
    expect(document.schemaVersion).toBe(1);
    expect(json.result.status).toBe(json.cli.exit);
    expect(json.result.report).toEqual(document);
    expect(filesOf(json.result), "the site the build would publish").toEqual(real.cliTree);

    for (const format of ["human", "sarif"]) {
      const other = both(runtime, dir, ["audit", ...flags, "--format", format]);
      expect(other.script).toEqual({ exit: 0, stdout: other.cli.stdout, stderr: other.cli.stderr });
      expect(other.result.report).toEqual(document);
    }

    const gated = both(runtime, dir, ["build", ...flags, "--audit"]);
    expect(gated.script).toEqual({ exit: 0, stdout: gated.cli.stdout, stderr: gated.cli.stderr });
    expect(gated.result.status).toBe(gated.cli.exit);
    expect(gated.result.report, "build --audit carries the same report").toEqual(document);
    expect(filesOf(gated.result)).toEqual(gated.cliTree);
  }, TEST_MS);

  test(`a generator that fails under audit: the problem, no report, no \`files\` (${name})`, () => {
    const dir = project(FAILING_GENERATOR);
    const argv = ["audit", "--generate", join(dir, "scripts", "gen.mjs")];
    const { cli, script, result } = both(runtime, dir, argv);
    expect(cli.exit).toBe(1);
    expect(cli.stdout).toBe("");
    expect(script).toEqual({ exit: 0, stdout: "", stderr: cli.stderr });
    expect(result.status).toBe(1);
    expect(result.diagnostics.map((d) => d.severity)).toEqual(["problem"]);
    expect(printed(result.diagnostics)).toBe(cli.stderr);
    expect(result.report).toBeNull();
    expect(result.files).toEqual([]);
  }, TEST_MS);

  test(`what the command line exits 2 for rejects with the UsageError (${name})`, () => {
    const dir = project(SITE);
    for (const argv of [["build", "--base-url", "example.com"], ["build", "--no-such-flag"], ["audit", "--clean"]]) {
      const { cli, script, tree, result } = both(runtime, dir, argv);
      expect(cli.exit).toBe(2);
      expect(script, "a rejection prints nothing by itself").toEqual({ exit: 0, stdout: "", stderr: "" });
      expect(tree).toBeNull();
      expect(result.rejected.name).toBe("UsageError");
      expect(`${result.rejected.message}\n${result.rejected.fixes.map((fix) => `  fix: ${fix}\n`).join("")}`).toBe(cli.stderr);
    }
  }, TEST_MS);

  test(`a command that builds no site returns the same four keys (${name})`, () => {
    const dir = project(SITE);
    const { cli, script, result } = both(runtime, dir, ["--version"]);
    expect(script).toEqual({ exit: 0, stdout: cli.stdout, stderr: "" });
    expect(result).toEqual({ keys: ["status", "diagnostics", "files", "report"], status: 0, diagnostics: [], files: [], report: null });
  }, TEST_MS);
}
