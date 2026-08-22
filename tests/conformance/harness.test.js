/**
 * harness.test.js — the generic, manifest-driven conformance harness (Tier 1).
 *
 * One file drives all three fixture sets:
 *   - tests/conformance/spec-fixtures/manifest.json   (the spec's worked examples)
 *   - tests/fixtures/kitchen-sink/manifest.json       (one realistic site, four profiles)
 *   - tests/fixtures/landmines/manifest.json          (adversarial cases)
 *     + tests/fixtures/landmines/runtime-cases.mjs    (git-unsafe cases, built at runtime)
 *
 * A manifest row IS a test: this file iterates the manifests and registers one
 * test per case/profile, so adding a fixture cannot be forgotten and there is
 * no per-case test code to weaken (testing-strategy §2/§3.2). Every case:
 *
 *   1. materializes into a fresh temp dir (checked-in trees copied; runtime
 *      cases built by their build() function),
 *   2. spawns the real CLI (`bun src/cli.js build ...`) as a subprocess —
 *      never an import of engine internals — under a hard 30 s kill timer
 *      (the previous engine hung forever on a missing include; a hang is a
 *      failure, never a wait),
 *   3. asserts exit code, diagnostics (stable `FILE:LINE: SEVERITY: ` prefix,
 *      exhaustive where declared, severity tokens closed to problem/advisory,
 *      path-then-line ordering), publish state (sentinel trees byte-untouched
 *      on blocked publishes), and the output tree — bidirectionally, through
 *      the single comparator in ./compare.mjs (hygiene rule H5),
 *   4. on a full pass, appends each declared rule ID to the runtime ledger
 *      (.conformance-ledger.jsonl) read by check-traceability.mjs --runtime.
 *
 * Kitchen-sink profiles additionally run the CLI twice and require byte-equal
 * stdout, stderr, and output tree (DIA-05 determinism, per that manifest's
 * harnessContract).
 *
 * The ledger is append-only; CI removes it before `bun test` so each run's
 * ledger reflects exactly that run (a skipped test records nothing and its
 * rules go uncovered — the skip hole is closed mechanically).
 *
 * Phase 0 note (migration plan §3): against the previous engine every case
 * here is EXPECTED to fail — that is the acceptance condition, recorded in
 * tests/conformance/phase-gaps/p0-expected-fail.txt. Do not weaken this file
 * to make it green; only the current engine may do that.
 */
import { test } from "bun:test";
import {
  appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync,
  readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareTrees, diffSnapshots, snapshotTree } from "./compare.mjs";
import { BUILD_CASES } from "../fixtures/landmines/runtime-cases.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
// The one entrypoint path (hygiene H3): behavior tests spawn the CLI, never import it.
const CLI = join(ROOT, "src", "cli.js");
const LEDGER = join(ROOT, ".conformance-ledger.jsonl");

const CLI_TIMEOUT_MS = 30_000;      // hard per-invocation kill (a hang is a failure)
const OUTPUT_CAP_BYTES = 16 * 1024 * 1024; // per stream; a runaway writer is a hang's twin
const SINGLE_RUN_TEST_MS = 45_000;  // one CLI run + assertions
const PROFILE_TEST_MS = 150_000;    // kitchen-sink: two CLI runs + tree snapshots

const KITCHEN_SINK = join(ROOT, "tests", "fixtures", "kitchen-sink");
const LANDMINES = join(ROOT, "tests", "fixtures", "landmines");
const SPEC_FIXTURES = join(HERE, "spec-fixtures");

// ------------------------------------------------------------------ ledger

function appendLedger(ruleIds, testId, status) {
  if (!ruleIds || ruleIds.length === 0) return;
  const lines = ruleIds.map((rule) => JSON.stringify({ rule, test: testId, status }));
  appendFileSync(LEDGER, lines.join("\n") + "\n");
}

/**
 * Runtime rule-coverage declaration for targeted/E2E behavior tests
 * (testing-strategy §3.2). Call it with rule-ID string arguments as the LAST
 * statement of a test body: if any earlier assertion throws, the call is
 * never reached and nothing is recorded — a failing test cannot keep a rule's
 * checkmark, and a skipped test records nothing at all. Each recorded rule is
 * appended to .conformance-ledger.jsonl and credited by
 * check-traceability.mjs --runtime only when status is "pass".
 */
export const covers = (...ruleIds) => {
  const frame = (new Error().stack ?? "").split("\n")[2] ?? "";
  const testId = frame.replace(/^\s*at\s+/, "").replaceAll(ROOT + "/", "").trim() || "unknown-test";
  appendLedger(ruleIds, testId, "pass");
};

// --------------------------------------------------------------- CLI spawn

/**
 * Read a stream with a hard byte cap. The earlier missing-include loop does not
 * merely hang — it writes output forever; buffering it whole (Response.text)
 * ran the harness process out of memory before the kill timer fired, which
 * failed every later case for a reason that was never observed product
 * behavior. Exceeding the cap invokes onExceed (which kills the CLI) and
 * keeps draining so the child can die; captured text is truncated at the cap.
 */
async function readCapped(stream, capBytes, onExceed) {
  if (!stream) return { text: "", truncated: false };
  const chunks = [];
  let total = 0;
  let truncated = false;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (truncated) continue; // drain and discard
    total += value.byteLength;
    if (total > capBytes) {
      truncated = true;
      chunks.push(value.subarray(0, value.byteLength - (total - capBytes)));
      onExceed();
    } else chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

async function runCli(args, cwd) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.DEBUG;       // DEBUG=1 adds stack traces (§14.1) — not under test here
  delete env.FORCE_COLOR;
  delete env.CLAUDECODE;  // the product must behave the same everywhere
  const proc = Bun.spawn({
    cmd: [process.execPath, CLI, ...args],
    cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  let timedOut = false;
  let runawayOutput = false;
  const kill = () => { try { proc.kill(9); } catch { /* already gone */ } };
  const timer = setTimeout(() => { timedOut = true; kill(); }, CLI_TIMEOUT_MS);
  const onExceed = () => { runawayOutput = true; kill(); };
  const [out, err] = await Promise.all([
    readCapped(proc.stdout, OUTPUT_CAP_BYTES, onExceed),
    readCapped(proc.stderr, OUTPUT_CAP_BYTES, onExceed),
  ]);
  const exit = await proc.exited;
  clearTimeout(timer);
  return { exit, stdout: out.text, stderr: err.text, timedOut, runawayOutput };
}

// -------------------------------------------------------------- diagnostics

// Stable prefix contract (conformance spec §14.1): `FILE:LINE: SEVERITY: `,
// line omitted when unknown. Continuation lines are indented two spaces.
const DIAG_LINE = /^(\S.*?):(?:(\d+):)? (problem|advisory): (.*)$/;
// Banned third words (DIA-01): the spec names exactly two severities.
const BANNED_LINE = /^(\S.*?):(?:(\d+):)? (warning|error): /;

function parseDiagnostics(stderrText) {
  const records = [];
  const unrecognized = [];
  const banned = [];
  for (const line of stderrText.split("\n")) {
    if (line.trim() === "") continue;
    if (/^ {2}/.test(line)) {
      const last = records[records.length - 1];
      if (last) { last.text += "\n" + line.trim(); last.raw += "\n" + line; }
      else unrecognized.push(line);
      continue;
    }
    const m = DIAG_LINE.exec(line);
    if (m) {
      records.push({
        file: m[1],
        line: m[2] === undefined ? null : Number(m[2]),
        severity: m[3],
        text: m[4],
        raw: line,
      });
      continue;
    }
    if (BANNED_LINE.test(line)) { banned.push(line); continue; }
    unrecognized.push(line);
  }
  return { records, unrecognized, banned };
}

function checkDiagnostics(stderrText, spec, issues) {
  const { records, unrecognized, banned } = parseDiagnostics(stderrText);

  for (const line of banned) {
    issues.push(`banned severity token — only "problem" and "advisory" exist (DIA-01): ${line}`);
  }

  // Path-then-line ordering (DIA-06); only pairs the contract fully orders.
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1];
    const cur = records[i];
    if (cur.file < prev.file) {
      issues.push(`diagnostics not ordered by path (DIA-06): "${cur.file}" printed after "${prev.file}"`);
      break;
    }
    if (cur.file === prev.file && prev.line !== null && cur.line !== null && cur.line < prev.line) {
      issues.push(`diagnostics not ordered by line within ${cur.file} (DIA-06): ${cur.line} printed after ${prev.line}`);
      break;
    }
  }

  const used = new Array(records.length).fill(false);
  for (const d of spec.diagnostics) {
    const subs = d.containsAll ?? (d.contains != null ? [d.contains] : []);
    let hit = -1;
    for (let i = 0; i < records.length; i++) {
      if (used[i]) continue;
      const rec = records[i];
      if (rec.file !== d.file || rec.severity !== d.severity) continue;
      if (d.line !== undefined && rec.line !== d.line) continue; // declared null ⇒ line must be absent
      if (!subs.every((s) => rec.text.includes(s))) continue;
      hit = i;
      break;
    }
    if (hit === -1) {
      const at = d.line != null ? `${d.file}:${d.line}` : d.file;
      issues.push(`declared diagnostic missing: ${d.severity} at ${at}${subs.length ? ` containing ${JSON.stringify(subs)}` : ""}`);
    } else used[hit] = true;
  }

  if (spec.diagnosticsExhaustive) {
    for (let i = 0; i < records.length; i++) {
      if (!used[i]) issues.push(`undeclared diagnostic — the problem/advisory catalogue is closed: ${records[i].raw.split("\n")[0]}`);
    }
    for (const line of unrecognized) {
      issues.push(`stderr outside the FILE:LINE: SEVERITY: contract (§14.1): ${line}`);
    }
  }
}

// ------------------------------------------------------------ publish state

// Seeded into the output dir of every publish-blocked case BEFORE the run;
// afterwards the whole tree must be byte-identical (PUB-01: a failed build
// leaves the previous output untouched — the exact thing the earlier
// implementation violated).
const SENTINEL_FILES = {
  "index.html":
    "<!doctype html>\n<html><head><title>SENTINEL previous publish</title></head>" +
    "<body><p>A failed build must leave this file byte-identical (PUB-01).</p></body></html>\n",
  "sentinel-keep/prior.txt":
    "sentinel: previous output tree; must survive a failed build untouched\n",
};

function seedSentinel(outDir) {
  for (const [rel, content] of Object.entries(SENTINEL_FILES)) {
    mkdirSync(dirname(join(outDir, rel)), { recursive: true });
    writeFileSync(join(outDir, rel), content);
  }
}

function safeSnapshot(dir) {
  return existsSync(dir) ? snapshotTree(dir) : new Map();
}

// ------------------------------------------------------------- case runner

function assessRun(r, spec, issues, outDir, preSnap, inPlace, tmp) {
  if (r.timedOut) {
    issues.push(`CLI hung; killed after ${CLI_TIMEOUT_MS} ms — a hang is a failure, never a wait`);
    return;
  }
  if (r.runawayOutput) {
    issues.push(`CLI runaway output; killed after ${OUTPUT_CAP_BYTES} bytes on one stream — the hang's twin, a failure, never a wait`);
    return;
  }
  if (r.exit !== spec.exit) issues.push(`exit code: declared ${spec.exit}, got ${r.exit}`);

  checkDiagnostics(r.stderr, spec, issues);

  // stdout is a separate channel from diagnostics: the build summary (and the
  // §4.4 defaulted-source notice) live there and are never parsed as
  // diagnostics nor counted against diagnosticsExhaustive.
  for (const s of spec.stdoutContains ?? []) {
    if (!r.stdout.includes(s)) issues.push(`stdout missing declared summary text: ${JSON.stringify(s)}`);
  }
  for (const s of spec.stdoutNotContains ?? []) {
    if (r.stdout.includes(s)) issues.push(`stdout contains summary text declared absent: ${JSON.stringify(s)}`);
  }

  if (inPlace) {
    // --clean containment refusal: the whole working tree, source included,
    // must be byte-untouched (PUB-03 / the runtime case's own note).
    for (const d of diffSnapshots(preSnap, snapshotTree(tmp), "pre-run", "post-run")) {
      issues.push(`containment refusal must write and delete nothing: ${d}`);
    }
    return;
  }

  if (spec.published === false) {
    for (const d of diffSnapshots(preSnap, safeSnapshot(outDir), "sentinel", "post-run output")) {
      issues.push(`publish block (PUB-01) — previous output must be byte-untouched: ${d}`);
    }
    return;
  }

  if (spec.expectedTreeDir) {
    if (!existsSync(outDir)) issues.push("output directory was never created");
    else for (const d of compareTrees(spec.expectedTreeDir, outDir)) issues.push(`tree: ${d}`);
  }
  for (const rel of spec.expectFiles ?? []) {
    if (!existsSync(join(outDir, rel))) issues.push(`declared output file missing: ${rel}`);
  }
  for (const rel of spec.expectAbsent ?? []) {
    if (existsSync(join(outDir, rel))) issues.push(`file declared absent was emitted: ${rel}`);
  }
  for (const [rel, subs] of Object.entries(spec.expectContains ?? {})) {
    const p = join(outDir, rel);
    if (!existsSync(p)) { issues.push(`declared output file missing: ${rel}`); continue; }
    const textContent = readFileSync(p, "utf8");
    for (const s of subs) if (!textContent.includes(s)) issues.push(`${rel}: declared substring not found: ${JSON.stringify(s)}`);
  }
  for (const [rel, subs] of Object.entries(spec.expectNotContains ?? {})) {
    const p = join(outDir, rel);
    if (!existsSync(p)) continue; // absence already reported if it was also declared present
    const textContent = readFileSync(p, "utf8");
    for (const s of subs) if (textContent.includes(s)) issues.push(`${rel}: forbidden substring present: ${JSON.stringify(s)}`);
  }
}

async function executeCase(testId, spec) {
  const tmp = mkdtempSync(join(tmpdir(), "unify-conformance-"));
  const issues = [];
  try {
    if (spec.build) spec.build(tmp);
    else cpSync(spec.srcDir, join(tmp, "src"), { recursive: true });

    const inPlace = spec.inPlaceOutput === true;
    const outDir = spec.outputDir ? join(tmp, spec.outputDir) : inPlace ? tmp : join(tmp, "dist");
    if (!inPlace && spec.published === false) {
      mkdirSync(outDir, { recursive: true });
      seedSentinel(outDir);
    }
    const preSnap = inPlace || spec.published === false
      ? snapshotTree(inPlace ? tmp : outDir)
      : null;

    const args = ["build"];
    if (spec.omitSourceFlag !== true) {
      // Standing contract: -s src -o dist relative to the case root. The
      // EXC-11 cases opt out (omitSourceFlag): their flags are the complete
      // option list, because the rule under test is the CLI's own source
      // defaulting — injecting any -s would silently invert the test.
      args.push("-s", "src");
      if (!inPlace) args.push("-o", "dist"); // in-place cases carry their own -o in flags
    }
    args.push(...spec.flags);

    const r1 = await runCli(args, tmp);
    assessRun(r1, spec, issues, outDir, preSnap, inPlace, tmp);

    if (spec.doubleRun && issues.length === 0) {
      // Kitchen-sink harnessContract: every profile runs twice; the second run
      // must produce a byte-identical tree and byte-identical stdout/stderr
      // (DIA-05). Determinism is a byte-level claim, so no comparator here.
      const afterFirst = safeSnapshot(outDir);
      const r2 = await runCli(args, tmp);
      if (r2.timedOut || r2.runawayOutput) {
        issues.push(`determinism rerun: CLI ${r2.timedOut ? "hung" : "produced runaway output"}; killed`);
      } else {
        if (r2.exit !== r1.exit) issues.push(`determinism (DIA-05): exit codes differ across consecutive runs (${r1.exit} then ${r2.exit})`);
        if (r2.stdout !== r1.stdout) issues.push("determinism (DIA-05): stdout bytes differ across two consecutive runs");
        if (r2.stderr !== r1.stderr) issues.push("determinism (DIA-05): stderr bytes differ across two consecutive runs");
        for (const d of diffSnapshots(afterFirst, safeSnapshot(outDir), "first build", "second build")) {
          issues.push(`determinism (DIA-05): ${d}`);
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (issues.length) {
    appendLedger(spec.rules, testId, "fail");
    const shown = issues.slice(0, 30);
    const more = issues.length > shown.length ? `\n  - … ${issues.length - shown.length} more` : "";
    throw new Error(`${issues.length} conformance failure(s)\n  - ${shown.join("\n  - ")}${more}`);
  }
  appendLedger(spec.rules, testId, "pass");
}

// ------------------------------------------------- manifest → generated tests

function loadManifest(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeCase(entry, caseRoot) {
  return {
    srcDir: join(caseRoot, "src"),
    flags: entry.flags ?? [],
    exit: entry.exit,
    published: entry.published,
    diagnostics: entry.diagnostics ?? [],
    diagnosticsExhaustive: entry.diagnosticsExhaustive === true,
    expectedTreeDir: entry.expectedTree ? join(caseRoot, entry.expectedTree) : null,
    expectFiles: entry.expectFiles,
    expectAbsent: entry.expectAbsent,
    expectContains: entry.expectContains,
    expectNotContains: entry.expectNotContains,
    stdoutContains: entry.stdoutContains,
    stdoutNotContains: entry.stdoutNotContains,
    rules: entry.rules ?? [],
  };
}

const landmineOutcomes = new Map();
let landmineTestCount = 0;

function register(testId, spec, timeoutMs, trackAsLandmine = false) {
  if (trackAsLandmine) landmineTestCount++;
  test(testId, async () => {
    try {
      await executeCase(testId, spec);
      if (trackAsLandmine) landmineOutcomes.set(testId, true);
    } catch (err) {
      if (trackAsLandmine) landmineOutcomes.set(testId, false);
      throw err;
    }
  }, timeoutMs);
}

// --- 1. spec-fixtures: the conformance spec's worked examples, verbatim ---
const specManifest = loadManifest(join(SPEC_FIXTURES, "manifest.json"));
for (const [name, entry] of Object.entries(specManifest.cases)) {
  const caseRoot = join(SPEC_FIXTURES, entry.caseDir ?? name);
  register(`spec-fixtures/${name}`, normalizeCase(entry, caseRoot), SINGLE_RUN_TEST_MS);
}

// --- 2. kitchen-sink: one realistic site under four profiles -------------
const ksManifest = loadManifest(join(KITCHEN_SINK, "manifest.json"));
for (const [name, entry] of Object.entries(ksManifest.profiles)) {
  const spec = normalizeCase(entry, KITCHEN_SINK);
  spec.srcDir = join(KITCHEN_SINK, "src"); // one shared source tree per profile
  spec.doubleRun = true;                   // DIA-05 per the manifest harnessContract
  register(`kitchen-sink/${name}`, spec, PROFILE_TEST_MS);
}

// --- 3. landmines: checked-in adversarial cases ---------------------------
const lmManifest = loadManifest(join(LANDMINES, "manifest.json"));
for (const [name, entry] of Object.entries(lmManifest.cases)) {
  const caseRoot = join(LANDMINES, entry.caseDir ?? name);
  register(`landmines/${name}`, normalizeCase(entry, caseRoot), SINGLE_RUN_TEST_MS, true);
}

// --- 4. landmines built at runtime (git-unsafe trees) ---------------------
for (const [name, rc] of Object.entries(BUILD_CASES)) {
  const x = rc.expect;
  const base = {
    build: rc.build,
    flags: rc.flags ?? [],
    // In-place output = the containment case (-o . at the case root). The
    // EXC-11 cases also set cwd but publish into their own outputDir.
    inPlaceOutput: rc.cwd === "." && !rc.outputDir,
    omitSourceFlag: rc.omitSourceFlag === true,
    outputDir: rc.outputDir,
    exit: x.exit,
    published: x.published,
    diagnostics: x.diagnostics ?? [],
    diagnosticsExhaustive: x.diagnosticsExhaustive === true,
    expectedTreeDir: null,
    expectFiles: x.expectFiles,
    expectAbsent: x.expectAbsent,
    expectContains: x.expectContains,
    expectNotContains: x.expectNotContains,
    stdoutContains: x.stdoutContains,
    stdoutNotContains: x.stdoutNotContains,
    rules: rc.rules ?? [],
  };
  register(`landmines-runtime/${name}`, base, SINGLE_RUN_TEST_MS, true);
  if (x.strictVariant) {
    // Same tree and same declared diagnostics; --strict flips exit and publish.
    register(`landmines-runtime/${name}--strict`, {
      ...base,
      flags: x.strictVariant.flags ?? [],
      exit: x.strictVariant.exit,
      published: x.strictVariant.published,
      expectFiles: undefined,
      expectAbsent: undefined,
      expectContains: undefined,
      expectNotContains: undefined,
    }, SINGLE_RUN_TEST_MS, true);
  }
}

// --- 5. the landmines manifest's harnessRules ------------------------------
// DIA-01 (closed severity tokens), DIA-05 (determinism), DIA-06 (ordering)
// and MRG-18 (the content-loss law, structural) are enforced by the harness
// machinery across every case above, so they are recorded only when the
// whole adversarial set passed — a machinery claim on a failing set would be
// a claim about machinery that just proved the product broken.
test("landmines/harness-contract", () => {
  if (landmineOutcomes.size !== landmineTestCount) {
    throw new Error(`only ${landmineOutcomes.size} of ${landmineTestCount} landmine cases ran — machinery rules (${(lmManifest.harnessRules ?? []).join(", ")}) stay unrecorded`);
  }
  const failed = [...landmineOutcomes].filter(([, ok]) => !ok).map(([n]) => n);
  if (failed.length) {
    throw new Error(`machinery rules (${(lmManifest.harnessRules ?? []).join(", ")}) are recorded only when every landmine case passes; failing: ${failed.join(", ")}`);
  }
  appendLedger(lmManifest.harnessRules ?? [], "landmines/harness-contract", "pass");
});
