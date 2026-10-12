/**
 * §24.8 `unify build --audit` — AUD-17.
 *
 * One pipeline run, audited, published only if `unify audit` would exit 0:
 * no problem, no `broken` finding, and under --strict no advisory and no
 * `incomplete` finding either (§24.6, §24.8).
 * Real CLI spawns only (hygiene H3); no mocks (H1).
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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

// One page repeats an id: a `broken` finding (id-duplicate), no problem, no advisory, and nothing incomplete.
const withBroken = () => ({
  "index.html": page("Home", '<a href="/other.html">Other</a>'),
  "other.html": page("Other", '<a href="/">Home</a><p id="dup">a</p><p id="dup">b</p>'),
});

/** Every file under `dir`, relative path to bytes, so "byte-for-byte untouched" compares the whole tree. */
function snapshot(dir) {
  const out = {};
  for (const rel of readdirSync(dir, { recursive: true }).sort()) {
    const abs = join(dir, rel);
    if (statSync(abs).isFile()) out[rel] = readFileSync(abs, "utf8");
  }
  return out;
}

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

test("AUD-17: incomplete findings alone print and block nothing without --strict, as `unify audit` exits 0", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), withFinding());
  const a = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(a, 0, "audit on incomplete findings without --strict");
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--audit"], tmp);
  expectExit(r, 0, "build --audit on incomplete findings without --strict");
  if (!/\[title-duplicate\]/.test(r.stdout)) throw new Error(`§24.8: a passing gate still prints the findings\nstdout:\n${r.stdout}`);
  if (!existsSync(join(tmp, "dist", "index.html"))) throw new Error("§24.8: published");
  if (!r.stdout.includes(a.stdout.trimEnd())) {
    throw new Error(`§24.8: findings equal audit's\naudit:\n${a.stdout}\nbuild:\n${r.stdout}`);
  }
  covers("AUD-17");
}, TEST_MS);

test("AUD-17: a broken finding blocks without --strict — exit 1, the previous dist byte-for-byte untouched, the generator run once", async () => {
  const tmp = mkTmp();
  const counter = join(tmp, "counter.txt");
  writeTree(join(tmp, "src"), {
    ...withBroken(),
    "_scripts/gen.mjs": `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(counter)}, "x");
`,
  });
  writeTree(join(tmp, "dist"), { "old.html": "previous output\n", "assets/old.css": "body{}\n" });
  const before = snapshot(join(tmp, "dist"));

  const a = await runCli(["audit", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs"], tmp);
  expectExit(a, 1, "audit on a broken finding without --strict");
  rmSync(counter, { force: true }); // count only the build below

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--generate", "_scripts/gen.mjs", "--audit"], tmp);
  expectExit(r, 1, "build --audit on a broken finding without --strict");
  if (!/: broken: .*\[id-duplicate\]/.test(r.stdout) || !r.stdout.includes(a.stdout.trimEnd())) {
    throw new Error(`§24.8: the blocked gate still prints audit's report\naudit:\n${a.stdout}\nbuild:\n${r.stdout}`);
  }
  const runs = readFileSync(counter, "utf8").length;
  if (runs !== 1) throw new Error(`§24.8: the generator ran ${runs} times, expected 1 — a blocked gate is still one run`);
  const after = snapshot(join(tmp, "dist"));
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(`§15/§24.8: dist/ must be untouched, found: ${JSON.stringify(after)}`);
  }
  covers("AUD-17");
}, TEST_MS);

test("AUD-17: the gate is audit's exit rule read once — build --audit publishes iff `unify audit` with the same flags exits 0", async () => {
  // [exit without --strict, exit with --strict], the same for `audit` and `build --audit`.
  const sites = [
    ["a clean site", clean(), 0, 0],
    ["an incomplete finding", withFinding(), 0, 1],
    ["a broken finding", withBroken(), 1, 1],
    ["a pipeline problem", { "index.html": page("Home", '<a href="/missing.html">x</a>') }, 1, 1],
  ];
  for (const [label, files, loose, strictExit] of sites) {
    for (const strict of [false, true]) {
      const flags = strict ? ["--strict"] : [];
      const want = strict ? strictExit : loose;
      const tmp = mkTmp();
      writeTree(join(tmp, "src"), files);
      const a = await runCli(["audit", "-s", "src", "-o", "dist", ...flags], tmp);
      expectExit(a, want, `audit on ${label}, strict=${strict}`);
      const b = await runCli(["build", "-s", "src", "-o", "dist", "--audit", ...flags], tmp);
      expectExit(b, want, `build --audit on ${label}, strict=${strict}`);
      if (existsSync(join(tmp, "dist", "index.html")) !== (want === 0)) {
        throw new Error(`§24.8: ${label}, strict=${strict}: it publishes iff audit exits 0\nstdout:\n${b.stdout}`);
      }
      const dry = await runCli(["build", "-s", "src", "-o", "dist-dry", "--audit", "--dry-run", ...flags], tmp);
      expectExit(dry, want, `build --audit --dry-run on ${label}, strict=${strict}: exits as the gate would`);
      if (existsSync(join(tmp, "dist-dry"))) throw new Error("§24.8: --dry-run wrote its output directory");
    }
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

test("AUD-17: a build problem blocks, and --dry-run evaluates, writes nothing and exits as the gate would", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), withFinding());
  const dry = await runCli(["build", "-s", "src", "-o", "dist", "--audit", "--strict", "--dry-run"], tmp);
  expectExit(dry, 1, "dry-run gate blocks on a finding");
  const ok = await runCli(["build", "-s", "src", "-o", "dist", "--audit", "--dry-run"], tmp);
  expectExit(ok, 0, "dry-run gate passes on incomplete findings without --strict");
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
