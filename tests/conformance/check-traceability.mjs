#!/usr/bin/env bun
/**
 * check-traceability.mjs — the spec-rule traceability gate.
 *
 * The claim it enforces: every normative rule in docs/conformance-spec.md has
 * at least one test that actually ran and passed. It has two halves:
 *
 *  SPEC → INVENTORY (sync check, always on)
 *    The countable structures of the conformance spec — the S1..S12 splice
 *    rules, the closed problem list (16), the closed advisory catalogue (11),
 *    and the head-merge table rows (7) — are parsed out of the spec text and
 *    compared against tests/conformance/rules.tsv. If the spec grows or loses
 *    an enumerable rule and the inventory was not updated in the same commit,
 *    this exits 1. Prose rules cannot be machine-extracted; for those the
 *    check enforces a weaker invariant: every top-level spec section that
 *    contains normative prose must have at least one inventory row.
 *
 *  INVENTORY → TESTS (coverage check)
 *    --static  : collects rule IDs declared by the fixture manifests
 *                (tests/fixtures/kitchen-sink/manifest.json,
 *                tests/fixtures/landmines/manifest.json + runtime-cases.mjs)
 *                and by `covers("ID", …)` / `@covers ID …` markers under
 *                tests/conformance and tests/e2e. Any inventory rule with
 *                testkind != structural that no test declares → exit 1.
 *                Any declared ID that is not in the inventory → exit 1
 *                (catches typos and rules retired from the spec).
 *    --runtime <ledger.jsonl>
 *              : same diff, but against IDs recorded at *test runtime* by the
 *                harness (each passing fixture case / covers() call appends a
 *                line). This closes the skipped-test hole: a test.skip'd case
 *                records nothing, so its rules go uncovered and the gate
 *                fails. CI runs `bun test && bun check-traceability.mjs
 *                --runtime .conformance-ledger.jsonl`.
 *    --baseline <file>
 *              : migration-phase gate (Gate P0..P3). The file lists the gap
 *                IDs a phase is allowed to have (tests/conformance/phase-gaps/
 *                *.txt, one ID per line). The check exits 0 iff the computed
 *                gap set equals the baseline exactly — a new gap fails, and a
 *                gap that closed fails too until the baseline shrinks in the
 *                same commit. Without --baseline, any gap fails (the release
 *                semantics).
 *
 * Exit codes: 0 all green; 1 gap/unknown-id/sync failure; 2 usage error.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SPEC = join(ROOT, "docs", "conformance-spec.md");
const RULES = join(HERE, "rules.tsv");
const MANIFESTS = [
  join(ROOT, "tests", "fixtures", "kitchen-sink", "manifest.json"),
  join(ROOT, "tests", "fixtures", "landmines", "manifest.json"),
  join(ROOT, "tests", "conformance", "spec-fixtures", "manifest.json"),
];
const RUNTIME_CASES = join(ROOT, "tests", "fixtures", "landmines", "runtime-cases.mjs");
const TEST_DIRS = [join(ROOT, "tests", "conformance"), join(ROOT, "tests", "e2e")];

const ID_RE = /^(?:S\d{2}|SHL-\d{2}|PIP-\d{2}|EXC-\d{2}|INC-\d{2}|LAY-\d{2}|MRG-\d{2}|HED-\d{2}|ATT-\d{2}|MD-\d{2}|URL-\d{2}|REF-\d{2}|COL-\d{2}|DIA-\d{2}|P\d{2}|A\d{2}|PUB-\d{2}|WCH-\d{2}|DRY-\d{2}|CFG-\d{2}|SCF-\d{2}|FIX-\d{2}|MAN-\d{2}|SIT-\d{2})$/;

function die(msg) { console.error(`traceability: ${msg}`); process.exit(2); }
let failed = false;
function fail(msg) { console.error(`FAIL ${msg}`); failed = true; }

// ---------- load inventory ----------
const inventory = new Map(); // id -> {spec, kind, testkind, summary}
for (const [i, line] of readFileSync(RULES, "utf8").trimEnd().split("\n").entries()) {
  if (i === 0) continue; // header
  const [id, spec, kind, testkind, summary] = line.split("\t");
  if (!ID_RE.test(id)) die(`rules.tsv line ${i + 1}: malformed id "${id}"`);
  if (inventory.has(id)) die(`rules.tsv: duplicate id ${id}`);
  inventory.set(id, { spec, kind, testkind, summary });
}

// ---------- SPEC → INVENTORY sync ----------
const specText = readFileSync(SPEC, "utf8");
const count = (re) => [...specText.matchAll(re)].length;
const syncChecks = [
  // splice rules: "- **S1 — ..." bullets in §3
  ["splice rules (S01..)", count(/^- \*\*S(\d+) — /gm),
    [...inventory.keys()].filter((k) => /^S\d{2}$/.test(k)).length],
  // closed problem list: numbered items in §14.2
  ["problems (P01..)", (specText.split("### 14.2")[1] ?? "").split("### 14.3")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length,
    [...inventory.keys()].filter((k) => /^P\d{2}$/.test(k)).length],
  // closed advisory catalogue: numbered items in §14.3
  ["advisories (A01..)", (specText.split("### 14.3")[1] ?? "").split("---")[0].split("\n").filter((l) => /^\d+\. /.test(l)).length,
    [...inventory.keys()].filter((k) => /^A\d{2}$/.test(k)).length],
  // head-merge table body rows in §8 (lines starting "| n |")
  ["head-merge rows (HED-01..07)", count(/^\| [1-7] \| /gm),
    [...inventory.keys()].filter((k) => /^HED-0[1-7]$/.test(k)).length],
];
for (const [name, inSpec, inInv] of syncChecks) {
  if (inSpec !== inInv) fail(`spec↔inventory drift: ${name}: spec has ${inSpec}, rules.tsv has ${inInv}`);
}
// Every `### N.M` subsection must sit physically under its own `## N` section.
// Nothing else catches a misplacement: this checker matches rules.tsv's `spec`
// COLUMN, not the heading's position, so a §20.10 appended after §21.6 leaves
// both --static and --runtime clean while a reader of §20 never meets it.
{
  let current = null;
  for (const line of specText.split("\n")) {
    const top = /^## (\d+)\./.exec(line);
    if (top) { current = top[1]; continue; }
    const sub = /^### (\d+)\.(\d+)/.exec(line);
    if (sub && current !== null && sub[1] !== current) {
      fail(`spec layout: "${line.trim()}" is filed under §${current} — move it under §${sub[1]}`);
    }
  }
}

// every top-level spec section must have at least one inventory row
const sections = [...specText.matchAll(/^## (\d+)\./gm)].map((m) => m[1]);
for (const s of sections) {
  if (s === "1") continue; // §1 Definitions carries no testable rules of its own
  const hit = [...inventory.values()].some((r) => r.spec.includes(`§${s}`) || r.spec.includes(`§${s}.`));
  if (!hit) fail(`spec section §${s} has no rule in rules.tsv — enumerate it or mark why not`);
}

// ---------- collect declared/recorded IDs ----------
const declared = new Map(); // id -> [sources]
/**
 * Blank out comments before scanning for `covers(...)` calls, preserving
 * offsets so nothing else shifts.
 *
 * The scanner used to match the literal text anywhere in a file, so a comment
 * *explaining* covers() read as a call to it — a contributor documenting the
 * helper had a stray backtick parsed as a rule ID.
 *
 * Two earlier attempts at this were wrong, which is why it tracks string state
 * rather than pattern-matching. Blanking string CONTENTS as well got clever
 * about telling an argument from an example and silently stopped seeing a real
 * covers("SCF-03"). Stripping `//` without string awareness ate every URL —
 * `http://localhost` starts a "comment" that swallows the rest of the line,
 * including real calls. So: track quotes, treat `//` and comments as comments
 * only outside a string, and copy everything else through untouched. A stray
 * ID inside a string still trips the unknown-ID check, loudly, which is enough.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null; // the delimiter of the string we are inside, or null
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    const two = src.slice(i, i + 2);
    if (two === "//") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (two === "/*") {
      while (i < src.length && src.slice(i, i + 2) !== "*/") { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;
      continue;
    }
    out += c; i++;
  }
  return out;
}

function declare(id, source) {
  if (!inventory.has(id)) { fail(`unknown rule id "${id}" declared by ${source} (typo, or rule retired from rules.tsv)`); return; }
  if (!declared.has(id)) declared.set(id, []);
  declared.get(id).push(source);
}

const mode = process.argv.includes("--runtime") ? "runtime" : "static";

if (mode === "static") {
  for (const mf of MANIFESTS) {
    const m = JSON.parse(readFileSync(mf, "utf8"));
    const label = mf.split("/").slice(-2).join("/");
    for (const id of m.harnessRules ?? []) declare(id, `${label}#harness`);
    for (const [name, entry] of Object.entries(m.profiles ?? {}))
      for (const id of entry.rules ?? []) declare(id, `${label}#${name}`);
    for (const [name, entry] of Object.entries(m.cases ?? {}))
      for (const id of entry.rules ?? []) declare(id, `${label}#${name}`);
  }
  if (existsSync(RUNTIME_CASES)) {
    const src = readFileSync(RUNTIME_CASES, "utf8");
    for (const m of src.matchAll(/rules:\s*\[([^\]]*)\]/g))
      for (const id of m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean))
        declare(id, "runtime-cases.mjs");
  }
  // covers("ID", ...) calls and @covers markers in behavior-test sources
  for (const dir of TEST_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir, { recursive: true })) {
      const p = join(dir, String(f));
      if (/check-[a-z-]+\.mjs$/.test(p)) continue; // the gate scripts are not tests; their docs contain ID examples
      if (!/\.(test\.)?(js|mjs|ts)$/.test(p) || !statSync(p).isFile()) continue;
      const src = stripComments(readFileSync(p, "utf8"));
      for (const m of src.matchAll(/covers\(([^)]*)\)/g))
        for (const id of m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean))
          declare(id, String(f));
      for (const m of src.matchAll(/@covers\s+([A-Z0-9, -]+)/g))
        for (const id of m[1].split(/[,\s]+/).filter(Boolean))
          declare(id, String(f));
    }
  }
} else {
  const idx = process.argv.indexOf("--runtime");
  const ledger = process.argv[idx + 1];
  if (!ledger || !existsSync(ledger)) die(`--runtime requires a ledger file (produced by the harness during bun test)`);
  for (const line of readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean)) {
    const rec = JSON.parse(line); // {rule, test, status}
    if (rec.status === "pass") declare(rec.rule, rec.test);
  }
}

// ---------- the gate ----------
const bIdx = process.argv.indexOf("--baseline");
let baseline = null;
if (bIdx !== -1) {
  const f = process.argv[bIdx + 1];
  if (!f || !existsSync(f)) die("--baseline requires a file of expected gap IDs (one per line)");
  baseline = readFileSync(f, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
}

const gaps = [];
for (const [id, meta] of inventory) {
  if (meta.testkind === "structural") continue; // asserted by construction; documented in rules.tsv
  if (!declared.has(id)) gaps.push(id);
}
const covered = [...inventory.keys()].filter((k) => declared.has(k)).length;
const gatable = [...inventory.values()].filter((r) => r.testkind !== "structural").length;
console.log(`inventory: ${inventory.size} rules (${gatable} gated, ${inventory.size - gatable} structural)`);
console.log(`covered (${mode}): ${covered}`);
if (baseline) {
  const gapSet = new Set(gaps);
  const baseSet = new Set(baseline);
  const unexpected = gaps.filter((g) => !baseSet.has(g));
  const closed = baseline.filter((b) => !gapSet.has(b));
  if (unexpected.length) {
    fail(`${unexpected.length} gap(s) not in the committed baseline:`);
    for (const id of unexpected) console.error(`  ${id}\t${inventory.get(id).spec}\t${inventory.get(id).summary.slice(0, 80)}`);
  }
  if (closed.length) fail(`baseline gap(s) now covered — shrink the baseline file in the same commit: ${closed.join(", ")}`);
  if (!unexpected.length && !closed.length) console.log(`gaps match the committed baseline (${gaps.length}) — migration phase gate green`);
} else if (gaps.length) {
  fail(`${gaps.length} rule(s) with no covering test:`);
  for (const id of gaps) console.error(`  ${id}\t${inventory.get(id).spec}\t${inventory.get(id).summary.slice(0, 80)}`);
}
if (failed) process.exit(1);
console.log("traceability: OK");
