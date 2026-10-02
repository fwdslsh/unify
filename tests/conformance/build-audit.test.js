/**
 * §24.8 `unify build --audit` — AUD-17.
 *
 * One pipeline run, audited, published only if `unify audit` would exit 0.
 * Real CLI spawns only (hygiene H3); no mocks (H1).
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;

const page = (name, extra = "") =>
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${name}</title><meta name="description" content="The ${name} page of the example site."></head>
<body><h1>${name}</h1><p>Words about ${name}.</p>${extra}</body>
</html>
`;

const clean = () => ({ "index.html": page("Home") });
// Two pages share a title: a `duplicate` finding, but no problem and no advisory.
const withFinding = () => ({
  "index.html": page("Home", '<a href="/other.html">Other</a>'),
  "other.html": page("Home", '<a href="/">Home</a>'),
});

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

test("AUD-17: a generator runs exactly once under build --audit", async () => {
  const tmp = mkTmp();
  const counter = join(tmp, "counter.txt");
  writeTree(join(tmp, "src"), {
    ...clean(),
    "_scripts/gen.mjs": `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(counter)}, "x");
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--audit", "--strict"], tmp);
  expectExit(r, 0, "a clean generated site");
  const runs = readFileSync(counter, "utf8").length;
  if (runs !== 1) throw new Error(`§24.8: the generator ran ${runs} times, expected 1`);
  if (!existsSync(join(tmp, "dist", "index.html"))) throw new Error("§24.8: a passing gate publishes");
  covers("AUD-17");
}, TEST_MS);

test("AUD-17: a finding under --audit --strict exits 1 and leaves the previous dist untouched", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), withFinding());
  writeTree(join(tmp, "dist"), { "old.html": "previous output\n" });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--audit", "--strict"], tmp);
  expectExit(r, 1, "a finding under --strict");
  if (!/\[title-duplicate\]/.test(r.stdout)) throw new Error(`§24.8: findings print in audit's format\nstdout:\n${r.stdout}`);
  const files = readdirSync(join(tmp, "dist"));
  if (files.join() !== "old.html" || readFileSync(join(tmp, "dist", "old.html"), "utf8") !== "previous output\n") {
    throw new Error(`§24.8: dist/ must be untouched, found: ${files.join(", ")}`);
  }
  covers("AUD-17");
}, TEST_MS);

test("AUD-17: without --strict the findings print and block nothing, as `unify audit` exits 0", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), withFinding());
  const a = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(a, 0, "audit without --strict");
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--audit"], tmp);
  expectExit(r, 0, "build --audit without --strict");
  if (!existsSync(join(tmp, "dist", "index.html"))) throw new Error("§24.8: published");
  if (!r.stdout.includes(a.stdout.trimEnd())) {
    throw new Error(`§24.8: findings equal audit's\naudit:\n${a.stdout}\nbuild:\n${r.stdout}`);
  }
  covers("AUD-17");
}, TEST_MS);

test("AUD-17: a clean site publishes and its findings equal `unify audit` on the same input", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), clean());
  const a = await runCli(["audit", "-s", "src", "-o", "dist", "--strict"], tmp);
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--audit", "--strict"], tmp);
  expectExit(a, 0, "audit --strict");
  expectExit(r, 0, "build --audit --strict");
  if (!r.stdout.includes(a.stdout.trimEnd())) throw new Error(`findings differ\n${a.stdout}\n---\n${r.stdout}`);
  if (!existsSync(join(tmp, "dist", "index.html"))) throw new Error("§24.8: published");
  covers("AUD-17");
}, TEST_MS);

test("AUD-17: a build problem blocks, and --dry-run evaluates and writes nothing", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), withFinding());
  const dry = await runCli(["build", "-s", "src", "-o", "dist", "--audit", "--strict", "--dry-run"], tmp);
  expectExit(dry, 1, "dry-run gate blocks on a finding");
  const ok = await runCli(["build", "-s", "src", "-o", "dist", "--audit", "--dry-run"], tmp);
  expectExit(ok, 0, "dry-run gate passes without --strict");
  if (existsSync(join(tmp, "dist"))) throw new Error("§24.8: --dry-run wrote dist/");
  writeTree(join(tmp, "src"), { "broken.html": page("Broken", '<a href="/missing.html">x</a>') });
  const bad = await runCli(["build", "-s", "src", "-o", "dist", "--audit"], tmp);
  expectExit(bad, 1, "a pipeline problem");
  if (existsSync(join(tmp, "dist"))) throw new Error("§24.8: a problem publishes nothing");
  covers("AUD-17");
}, TEST_MS);

test("AUD-17: default build is unchanged — findings neither print nor block", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), withFinding());
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--strict"], tmp);
  expectExit(r, 0, "build --strict, findings only");
  if (/\[title-duplicate\]/.test(r.stdout)) throw new Error("§24.7: build prints no findings");
  if (!existsSync(join(tmp, "dist", "index.html"))) throw new Error("published");
  covers("AUD-17");
}, TEST_MS);
