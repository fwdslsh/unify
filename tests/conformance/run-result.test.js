/**
 * `run-result.test.js` — gate G15: what `run(options)` returns is what the
 * build did, as data.
 *
 * `run` is the package's one export. It runs the `build` command through the
 * same code the `unify` program runs, so there is no second implementation to
 * compare; what needs holding is that the object it returns agrees with what
 * the same build printed, wrote and exited with.
 *
 * Each case runs twice in one directory, under bun and under node: the real
 * CLI (`unify build <flags>`), then a script that imports `run` from the
 * package by name (through `node_modules/@fwdslsh/unify`, as a user's script
 * does), calls it with the same options as an object, and writes the result to
 * a file. Then:
 *   - the script printed NOTHING, the directory it leaves is byte-identical to
 *     the CLI's, and `status` is the CLI's exit code;
 *   - `diagnostics`, printed in §14.1's form, are the CLI's stderr;
 *   - `files` is the published tree, byte for byte, written or not, and empty
 *     when nothing could be published;
 *   - `report` is the document `unify audit --format json` prints, when the
 *     build was audited, and null otherwise;
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
const NOISY_GENERATOR = { ...SITE, "scripts/gen.mjs": 'console.log("generated nothing"); console.error("one source was skipped");\n' };
const FAILING_GENERATOR = { ...SITE, "scripts/gen.mjs": 'console.error("no data"); process.exit(3);\n' };

const DRIVER = `
import { run } from "@fwdslsh/unify";
import { writeFileSync } from "node:fs";
const out = { runs: [] };
for (const options of JSON.parse(process.env.UNIFY_OPTIONS)) {
  try {
    const r = await run(options);
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

/** `unify build <argv>`, then `run(options)` in a script, in the same directory. */
function both(runtime, dir, argv, options, { again = [] } = {}) {
  rmSync(join(dir, "dist"), { recursive: true, force: true });
  const cli = spawn([runtime, CLI, "build", ...argv], dir);
  const cliTree = published(dir);
  rmSync(join(dir, "dist"), { recursive: true, force: true });
  const resultFile = join(dir, "result.json");
  const script = spawn([runtime, "driver.mjs"], dir, { UNIFY_OPTIONS: JSON.stringify([options, ...again]), UNIFY_RESULT: resultFile });
  expect(script, "run() prints nothing, whatever the build printed").toEqual({ exit: 0, stdout: "", stderr: "" });
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
    expect(example).toEqual({ exit: 0, stderr: "", stdout: "status 0, 4 files\n0 broken findings\n" }); // two pages, the asset, sitemap.xml
    expect(existsSync(join(dir, "dist")), "the example is a dry run").toBe(false);
    writeFileSync(join(dir, "usage.mjs"), docBlock(1));
    expect(spawn([runtime, "usage.mjs"], dir)).toEqual({
      exit: 0, stderr: "", stdout: "UsageError --base-url needs the site's whole address, got: example.com\n",
    });
  }, TEST_MS);

  test(`a build: the CLI's output, and the site it wrote as \`files\` (${name})`, () => {
    expect(runtime, "node on PATH").toBeTruthy();
    const dir = project(SITE);
    const { cli, cliTree, script, tree, out, result } = both(runtime, dir, ["--source", "site"], { source: "site" }, { again: [{ source: "site" }] });
    expect(cli.exit).toBe(0);
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

  test(`options are the flags: camelCase names, booleans, strings and lists (${name})`, () => {
    const dir = project({ ...SITE, "site/drafts/wip.html": page("WIP", ""), "unify.yaml": "exclude:\n  - _*\n" });
    const argv = ["--pretty-urls", "--base-url", "https://example.com/docs/", "--exclude", "_*", "--exclude", "drafts/**"];
    const options = { prettyUrls: true, baseUrl: "https://example.com/docs/", exclude: ["_*", "drafts/**"], clean: false, strict: undefined };
    const { cli, cliTree, script, tree, result } = both(runtime, dir, argv, options);
    expect(cli.exit).toBe(0);
    expect(tree).toEqual(cliTree);
    expect(filesOf(result)).toEqual(cliTree);
    expect(Object.keys(cliTree)).toEqual(["about/index.html", "assets/mark.bin", "index.html", "sitemap.xml"]);
  }, TEST_MS);

  test(`dryRun returns the same \`files\` and writes nothing (${name})`, () => {
    const dir = project(SITE);
    const real = both(runtime, dir, [], {});
    const { cli, script, tree, result } = both(runtime, dir, ["--dry-run"], { dryRun: true });
    expect(cli.stdout).toContain("would publish 3 files");
    expect(tree, "nothing written").toBeNull();
    expect(result.status).toBe(0);
    expect(filesOf(result)).toEqual(real.cliTree);
  }, TEST_MS);

  test(`a problem: status 1, the diagnostics as data, no \`files\`, nothing published (${name})`, () => {
    const dir = project(BROKEN);
    const { cli, script, tree, result } = both(runtime, dir, [], {});
    expect(cli.exit).toBe(1);
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

  test(`audit: \`report\` is the document unify audit --format json prints (${name})`, () => {
    const dir = project(SITE);
    const flags = ["--base-url", "https://example.com/docs/"];
    const document = JSON.parse(spawn([runtime, CLI, "audit", ...flags, "--format", "json"], dir).stdout);
    expect(document.schemaVersion).toBe(1);
    const { cli, cliTree, script, tree, result } = both(runtime, dir, [...flags, "--audit"], { baseUrl: "https://example.com/docs/", audit: true });
    expect(tree).toEqual(cliTree);
    expect(result.status).toBe(cli.exit);
    expect(result.report).toEqual(document);
    expect(filesOf(result)).toEqual(cliTree);

    const dry = both(runtime, dir, [...flags, "--audit", "--dry-run"], { baseUrl: "https://example.com/docs/", audit: true, dryRun: true });
    expect(dry.tree, "audited and written nowhere").toBeNull();
    expect(dry.result.report).toEqual(document);
    expect(filesOf(dry.result)).toEqual(cliTree);
  }, TEST_MS);

  test(`a generator's own output is not printed either (${name})`, () => {
    const dir = project(NOISY_GENERATOR);
    const generate = join(dir, "scripts", "gen.mjs");
    const { cli, cliTree, result } = both(runtime, dir, ["--generate", generate], { generate });
    expect(cli.stdout).toContain("generated nothing\n");
    expect(cli.stderr).toBe("one source was skipped\n");
    expect(result.status).toBe(0);
    expect(filesOf(result)).toEqual(cliTree);
  }, TEST_MS);

  test(`a generator that fails: the problem, no report, no \`files\` (${name})`, () => {
    const dir = project(FAILING_GENERATOR);
    const generate = join(dir, "scripts", "gen.mjs");
    const { cli, script, result } = both(runtime, dir, ["--generate", generate, "--audit"], { generate, audit: true });
    expect(cli.exit).toBe(1);
    expect(result.status).toBe(1);
    expect(result.diagnostics.map((d) => d.severity)).toEqual(["problem"]);
    expect(printed(result.diagnostics)).toBe(cli.stderr);
    expect(result.report).toBeNull();
    expect(result.files).toEqual([]);
  }, TEST_MS);

  test(`what the command line exits 2 for rejects with the UsageError (${name})`, () => {
    const dir = project(SITE);
    const { cli, script, tree, result } = both(runtime, dir, ["--base-url", "example.com"], { baseUrl: "example.com" });
    expect(cli.exit).toBe(2);
    expect(tree).toBeNull();
    expect(result.rejected.name).toBe("UsageError");
    expect(`${result.rejected.message}\n${result.rejected.fixes.map((fix) => `  fix: ${fix}\n`).join("")}`).toBe(cli.stderr);

    const unknown = both(runtime, dir, ["--no-such-flag"], { noSuchFlag: true });
    expect(unknown.cli.exit).toBe(2);
    expect(unknown.result.rejected).toEqual({ name: "UsageError", message: "unknown option: noSuchFlag", fixes: ["run `unify --help` for the full surface"] });

    // An option of another command would be silently ignored by the build
    // (`unify build --external` is); through run() it is refused instead.
    for (const [key, value] of [["external", true], ["format", "json"], ["port", "3000"], ["watchPath", ["x"]], ["template", "blog"], ["help", true], ["version", true]]) {
      const other = both(runtime, dir, ["--version"], { [key]: value });
      expect(other.result.rejected, key).toEqual({
        name: "UsageError", message: `${key} is not an option of the build`,
        fixes: ["run() is `unify build`: it takes that command's options (docs/api.md)"],
      });
      expect(other.tree, "nothing was built").toBeNull();
    }
  }, TEST_MS);

  test(`a value that cannot be an option's value is a TypeError (${name})`, () => {
    const dir = project(SITE);
    for (const options of [{ source: 5 }, { prettyUrls: "yes" }, { exclude: [1] }, ["build"], null]) {
      const { tree, result } = both(runtime, dir, ["--version"], options);
      expect(result.rejected.name, JSON.stringify(options)).toBe("TypeError");
      expect(tree, "nothing was built").toBeNull();
    }
  }, TEST_MS);
}
