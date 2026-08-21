#!/usr/bin/env bun
/**
 * run-mutations.mjs — "does this rule have a test that can fail?"
 *
 * Every defect found across five rounds of independent review on the v0.8
 * manifest work had the same shape: a rule written correctly in
 * `docs/conformance-spec.md`, implemented differently, and a suite that stayed
 * green either way. Coverage cannot see that class — the line executed, it just
 * did the wrong thing and nothing asserted otherwise. Mutation is the only
 * check that distinguishes "the line ran" from "a test would notice if the line
 * were wrong".
 *
 * `mutations.tsv` names one anchor→replacement pair per rule, with the rule it
 * defends. Each is applied, the suite runs, the mutation is reverted, and a
 * mutation that leaves the suite GREEN is a failure: the rule it names is
 * unpinned, and the spec claims something the tests cannot distinguish from its
 * opposite.
 *
 * WHICH PAIRS EARN THEIR PLACE. A replacement that is a no-op only asks "was
 * this line load-bearing", which the suite usually answers anyway. The pairs
 * that have caught real defects all encode a **plausible alternative
 * implementation** — the thing a reasonable person would have written instead,
 * or did write and had to correct. A reviewer proved the difference: two
 * substitutions survived the whole suite while the deletion-shaped pair for the
 * same function was killed, because the deletion changed behaviour everywhere
 * and the substitution changed it only in the one case no test covered.
 *
 * SCOPE, so a green run is not over-read: this file defends the rules its rows
 * name and no others. A survivor-free sweep means those anchors are pinned — it
 * is not a statement about the rest of the inventory.
 *
 * NEVER MUTATES THE WORKING TREE. Every run happens in a throwaway copy, freshly
 * restored before each row — the suite runs inside that copy and can delete its
 * sources, which truncated a full run after seven rows. The runner therefore
 * needs the copy to be restorable, not to survive. The isolation exists for a
 * reason this repository has already paid for three times: a mutation was swept
 * into a commit by an unrelated `git add -A`; an in-place loop timed out and its
 * restore never ran, silently reverting a real fix; and a reviewer's baseline
 * was overwritten mid-comparison. All three were a restore step that could be
 * skipped. The copy makes that impossible rather than discouraged.
 *
 * THE BASELINE GATE exists because the first version of this file was worse
 * than useless: it treated any non-zero exit as a kill, so on a red tree every
 * mutation was reported KILLED and the sweep exited 0 — a check whose answer
 * inverts exactly when you most need it. The suite now runs unmutated first and
 * the sweep refuses to start unless it is green; a kill must name a test that
 * was passing before; and a non-zero exit with no failing test is CRASHED
 * rather than KILLED, so a malformed replacement cannot pass as evidence.
 *
 * Usage:
 *   bun tests/conformance/run-mutations.mjs              # every mutation
 *   bun tests/conformance/run-mutations.mjs man- url-    # only ids with a prefix
 *   bun tests/conformance/run-mutations.mjs --rev HEAD~1 # audit a past commit
 *
 * To stop a run, kill it by PID: `pkill -f run-mutations` matches the shell
 * that launched it and kills its own caller.
 *
 * Defaults to the WORKING TREE, because the moment this check matters most is
 * before a commit — when a rule has just been written and the question is
 * whether anything would notice it being wrong.
 *
 * Exit 0 when every mutation is killed; 1 when any survives, crashes, or times
 * out; 2 on a stale or ambiguous anchor, a red baseline, or a usage error.
 *
 * Not a release gate today, deliberately: it costs one suite run per mutation.
 * It is a review-protocol step — a reviewer reports which tests each mutation
 * KILLED, which turns "I mutated it" from an anecdote into a record.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSV = join(ROOT, "tests", "conformance", "mutations.tsv");

/** A mutation gets this long before it counts as TIMEOUT rather than a kill. */
export const SUITE_TIMEOUT_MS = 240_000;

/**
 * Flakiness is MEASURED, not listed.
 *
 * An earlier version matched test names against `/^§16 dev server|^§16 watch/`,
 * which excluded every test in `watch-dev.test.js` from kill attribution —
 * including WCH-02 (watch output equals a fresh build) and WCH-03 (an unchanged
 * file is not rewritten), which are deterministic filesystem assertions, not
 * the ports-and-timers class the list was for. A reviewer showed the cost: a
 * dev-server mutation was credited to a Tier-3 unit test while WCH-06, the
 * authoritative behaviour test that also caught it, was filtered out — the tier
 * with zero authority believed over the one with all of it, inverting
 * testing-strategy §2. Any future row whose only coverage is the behaviour tier
 * would have read SURVIVED forever, and the only available "fix" would be to
 * weaken the regex further.
 *
 * So the baseline runs twice and the two failure sets are compared: a test that
 * differs between two runs of identical source is flaky by observation. A test
 * failing in BOTH is genuinely red and aborts the sweep. Nothing is
 * hand-maintained, and the set shrinks to empty on a stable machine.
 * @param {string[]} first
 * @param {string[]} second
 * @returns {{flaky: string[], hard: string[]}}
 */
export function compareBaselines(first, second) {
  const a = new Set(first);
  const b = new Set(second);
  return {
    flaky: [...new Set([...first, ...second])].filter((t) => !(a.has(t) && b.has(t))).sort(),
    hard: [...a].filter((t) => b.has(t)).sort(),
  };
}

/**
 * Decode one TSV cell. Single pass, because a chained `.replace` that handles
 * a doubled backslash last mis-decodes an escaped one: a cell meaning
 * backslash-n-b would come back as backslash + newline + b.
 * @param {string} cell
 * @returns {string}
 */
export function unescapeCell(cell) {
  return cell.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

/**
 * Parse `mutations.tsv` into rows.
 * @param {string} text
 * @returns {{file:string, id:string, old:string, next:string, why:string}[]}
 */
export function parseMutations(text) {
  return text.trimEnd().split("\n").slice(1).filter(Boolean).map((line) => {
    const [file, id, old, next, why] = line.split("\t");
    return { file, id, old: unescapeCell(old), next: unescapeCell(next ?? ""), why: why ?? "" };
  });
}

/**
 * COVERAGE-DIRECTED TARGETING — why a sweep no longer costs a suite per row.
 *
 * A mutation in `src/core/feed.js` can only be killed by a test that exercises
 * feed.js. The first design ran all 1,289 tests to discover that, which is the
 * most expensive possible way to answer a yes/no question: measured on one row,
 * 117,974ms for the full suite against 3,142ms for the one file that kills it.
 * Across 165 rows that is the difference between a nine-hour job nobody runs
 * and a half-hour one that fits in a review.
 *
 * The index is built from evidence the suite already produces. Every run writes
 * `.conformance-ledger.jsonl`, one `{rule, test, status}` per `covers()` call,
 * so it already knows which test file demonstrated which rule. `rules.tsv` maps
 * each rule to its spec section, which lets a row citing `§20.5` resolve to the
 * same files as one citing `MAN-05`.
 *
 * TARGETING IS AN OPTIMISATION, NEVER A VERDICT. A row whose targeted files all
 * pass is NOT reported as survived — it escalates to the full suite, and only a
 * green full run produces SURVIVED. So an index that is wrong, stale, or empty
 * costs time and never costs correctness. That property is the whole reason
 * this is safe to do at all: the failure mode of a bad index is a slow sweep,
 * not a false "this rule is pinned".
 *
 * @param {string} rootDir - the repository root to read the ledger and rules from
 * @returns {{byRule: Map<string,Set<string>>, bySection: Map<string,Set<string>>}}
 */
export function buildTargetIndex(rootDir) {
  const byRule = new Map();
  const bySection = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };

  const ledger = join(rootDir, ".conformance-ledger.jsonl");
  if (existsSync(ledger)) {
    for (const line of readFileSync(ledger, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      // The ledger records a test's display name, which carries its file:
      // "<anonymous> (tests/conformance/feed.test.js:143:5)".
      const file = /(tests\/[^\s:)]+)/.exec(row.test ?? "")?.[1];
      if (row.rule && file) add(byRule, row.rule, file);
    }
  }

  const rules = join(rootDir, "tests", "conformance", "rules.tsv");
  if (existsSync(rules)) {
    for (const line of readFileSync(rules, "utf8").split("\n").slice(1)) {
      if (!line.trim()) continue;
      const [id, section] = line.split("\t");
      if (!id || !section) continue;
      add(bySection, section, id);
      // A row citing `§20` should reach every rule under §20.x, not only §20
      // itself — the section a `why` line quotes is usually the coarse one.
      const coarse = section.split(".")[0];
      if (coarse !== section) add(bySection, coarse, id);
    }
  }
  return { byRule, bySection };
}

const RULE_ID = /\b([A-Z]{1,4}-\d{2}|[PA]\d{2})\b/g;
const SECTION = /§(\d+(?:\.\d+)?)/g;

/**
 * The test files most likely to kill this row, from the rules its `why` cites.
 * Empty is a legitimate answer — the row simply escalates.
 * @param {{why: string}} row
 * @param {ReturnType<typeof buildTargetIndex>} index
 * @returns {string[]} repo-relative test file paths
 */
export function targetsFor(row, index) {
  const files = new Set();
  for (const [, id] of (row.why ?? "").matchAll(RULE_ID)) {
    for (const f of index.byRule.get(id) ?? []) files.add(f);
  }
  for (const [, num] of (row.why ?? "").matchAll(SECTION)) {
    for (const id of index.bySection.get(`§${num}`) ?? []) {
      for (const f of index.byRule.get(id) ?? []) files.add(f);
    }
  }
  return [...files].sort();
}

/**
 * Which tests failed, by name, in one suite run's output.
 * @param {string} output
 * @returns {string[]}
 */
export function failingTests(output) {
  return [...output.matchAll(/^\(fail\) (.+?)(?: \[[\d.]+ms\])?$/gm)].map((m) => m[1]);
}

/**
 * The whole decision, extracted and exported because this is the logic that
 * inverted: the first version returned KILLED for any non-zero exit, so a red
 * baseline turned the sweep into a rubber stamp.
 *
 * A mutation is KILLED only when the suite names at least one test that fails
 * now, is not environment-flaky, and was passing before. Anything else is
 * reported as what it actually is.
 *
 * @param {object} run
 * @param {number|null} run.exitCode - null when the run was killed by timeout
 * @param {string} run.output - stdout + stderr
 * @param {boolean} run.timedOut
 * @param {string[]} [run.baselineFailures] - tests already failing unmutated
 * @param {string[]} [run.flakyTests] - tests observed to differ between two
 *   identical baseline runs; their failure proves nothing about a mutation
 * @returns {{outcome: 'KILLED'|'SURVIVED'|'CRASHED'|'TIMEOUT', killedBy: string[], note: string}}
 */
export function classify({ exitCode, output, timedOut, baselineFailures = [], flakyTests = [] }) {
  if (timedOut) {
    return { outcome: "TIMEOUT", killedBy: [], note: "the suite did not finish — a hang is not a kill" };
  }
  const failed = failingTests(output);
  const attributable = failed.filter((t) => !flakyTests.includes(t) && !baselineFailures.includes(t));
  // A mutant that dies of a runtime error proves only that an identifier is
  // referenced. This check exists because two rows passed as kills while
  // testing nothing: both mutated a `message:` interpolation whose variable
  // the replacement left unbound, so the CLI died with "raw is not defined"
  // and the tests "failed" at a corpse. The original guard below missed them
  // because a crashing CLI makes tests fail, which looked exactly like
  // detection — the failure mode this file's own preamble says must never
  // pass as evidence, arriving by the one route it did not check.
  const crash = runtimeErrorIn(output);
  if (crash) {
    return {
      outcome: "CRASHED",
      killedBy: [],
      note: `the mutated build raised ${JSON.stringify(crash)} — a malformed replacement, not a detected behaviour change`,
    };
  }
  if (attributable.length) {
    return { outcome: "KILLED", killedBy: attributable, note: "" };
  }
  if (exitCode !== 0) {
    const why = failed.length
      ? `only pre-existing or observed-flaky failures (${failed.slice(0, 2).join("; ")})`
      : "the suite exited non-zero with no failing test — the replacement probably does not parse";
    return { outcome: "CRASHED", killedBy: [], note: why };
  }
  return { outcome: "SURVIVED", killedBy: [], note: "nothing distinguishes this from its opposite" };
}

/**
 * The signature of a JavaScript runtime error in a suite's captured output.
 *
 * A heuristic, deliberately: the alternative — smoke the mutated CLI on a
 * fixture and require a located diagnostic rather than an internal error — is
 * more machinery than this class of mistake warrants, and a false CRASHED
 * costs one second look at a row while a false KILLED costs a rule that
 * nothing tests. Anchored on `unify:` where possible, because §14.1 routes
 * every *located* diagnostic through `FILE:LINE: SEVERITY:` and only an
 * unhandled throw reaches the `unify: ` prefix in cli.js.
 *
 * @param {string} output
 * @returns {string|null} the matched error text, or null
 */
export function runtimeErrorIn(output) {
  // Searched anywhere rather than anchored: a throw reaches stderr behind
  // `unify: `, a `TypeError:` prefix, or nothing at all, depending on where it
  // came from, and anchoring on one of those missed the others. A false
  // CRASHED costs a second look at one row; a false KILLED costs a rule that
  // nothing tests, which is what this whole check exists to stop.
  const m = /((?:\w[\w.$]*) is not (?:defined|a function|an object|iterable)|Cannot read propert(?:y|ies)[^\n]{0,60}|undefined is not[^\n]{0,40})/.exec(output);
  return m ? m[1].trim() : null;
}

/**
 * Every anchor must resolve, and resolve UNIQUELY.
 *
 * `String.replace` edits the first occurrence, so an ambiguous anchor mutates
 * something other than the row it names — a silent mis-measurement rather than
 * a loud one. An **absent** anchor is worse: `replace` with a needle that is
 * not there returns the string unchanged, the file is rewritten identical, and
 * the row is scored KILLED or SURVIVED on a mutation that never happened.
 *
 * EVERY row, never the selected ones. This ran over the prefix-filtered subset
 * once, so a sweep validated only what it ran — and three rows sat stale across
 * two review rounds while sweep after sweep reported "all killed", one of them
 * the row certifying the rule the round existed to protect. A stale row
 * anywhere means the inventory claims a rule is pinned when nothing tests it,
 * which is the exact class this file exists to detect: the detector had
 * inherited the blind spot it was written to find.
 *
 * Extracted and pure so it can be tested, which is the same lesson one level
 * in — the guard added for the above was itself unpinned, and reverting it to
 * the subset left the whole suite green. `read` returns the file's text, or
 * null when it does not exist: a row naming a deleted module is a BAD-ANCHOR,
 * not an unhandled ENOENT that takes the runner down before it can say so.
 *
 * Module-private on purpose. It was exported so unit tests could reach it,
 * and that put the `rows` parameter — the one the shipped bug lived in — back
 * on the public surface for a future caller to narrow. It is reached through
 * `anchorProblems` instead, which has no such parameter.
 *
 * @param {{id: string, file: string, old: string, next: string}[]} rows
 * @param {(file: string) => string|null} read
 * @returns {string[]} one message per problem, empty when every row is usable
 */
function validateAnchors(rows, read) {
  const problems = [];
  for (const row of rows) {
    const text = read(row.file);
    if (text === null) {
      problems.push(`BAD-ANCHOR ${row.id} — ${row.file} does not exist; update mutations.tsv`);
    } else {
      const hits = text.split(row.old).length - 1;
      if (hits === 0) problems.push(`BAD-ANCHOR ${row.id} — ${row.file} no longer contains it; update mutations.tsv`);
      else if (hits > 1) problems.push(`AMBIGUOUS ${row.id} — the anchor appears ${hits}x in ${row.file}; make it unique`);
    }
    if (row.old === row.next) problems.push(`NO-OP ${row.id} — the replacement equals the anchor`);
  }
  return problems;
}

/**
 * Every committed row, checked against a tree — the whole operation, wiring
 * included, behind one name.
 *
 * The wiring is the point. `validateAnchors` was extracted so it could be
 * tested, and the two bugs that had shipped were both in the code around it:
 * the caller passed the prefix-filtered subset instead of every row, and the
 * caller's file read threw on a deleted module instead of reporting it. Unit
 * tests of the extracted function pinned neither — the function had always
 * iterated what it was handed, and had always honoured a `read` returning
 * null. Reverting either call site left the whole suite green.
 *
 * That is the same mistake three rounds running, each time one level
 * shallower than the defect: the guard for a rule, then the test for the
 * guard, then the wiring of the test. Collapsing both callers here ends it —
 * the sweep passes its work copy, the always-on inventory test passes the
 * repository root, and there is no longer a `rows` parameter for a caller to
 * narrow or a `read` for a caller to get wrong.
 *
 * It takes NO row set. That parameter is where the first of the two bugs
 * lived — the caller narrowed it to the prefix-filtered subset — and a
 * parameter a caller can get wrong is a parameter a test of the callee cannot
 * pin. The question is "does this tree's inventory describe this tree?", so
 * the entry point reads both from the same root and there is nothing left to
 * pass it incorrectly.
 *
 * Returns `checked` alongside `problems` so a caller can assert HOW MANY rows
 * were looked at. Without it a narrowing inside this function is invisible:
 * every row is currently clean, so a subset and the whole set both return an
 * empty list, and slicing the parse passed the suite. The count is the only
 * property that distinguishes them.
 *
 * `rootDir` supplies BOTH the tree and the inventory, so the question is
 * always "does this tree's inventory describe this tree?". The sweep passes
 * its work copy; passing the repository root there instead would silently
 * validate the current checkout rather than the revision being swept.
 *
 * @param {string} rootDir - the tree, and the inventory that claims to describe it
 * @returns {{checked: number, problems: string[]}}
 */
export function anchorProblems(rootDir) {
  const rows = parseMutations(readFileSync(join(rootDir, "tests", "conformance", "mutations.tsv"), "utf8"));
  const problems = validateAnchors(rows, (file) => {
    const abs = join(rootDir, file);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  });
  return { checked: rows.length, problems };
}

// ------------------------------------------------------------------- orphans

/** The PID file each run drops in its own work directory. */
export const OWNER = ".owner-pid";

/**
 * Delete the work directories of runs that are no longer alive.
 *
 * The `process.on("exit")` handler above is the ordinary cleanup and it is
 * enough for every ending this program controls — a survivor, a crash, an
 * explicit `process.exit`. It is not enough for the endings it does not:
 * SIGKILL, an OOM kill, a `timeout` that escalates, a container restart. Each
 * of those leaves ~1 GB behind, and this repository has now paid for it twice
 * — once as the comment above records, and once when five orphans (~5 GB) on
 * a fixed disk allowance slowed a live sweep to a crawl before anyone looked
 * at `df`. A cleanup that only runs on the paths that were already fine is not
 * a cleanup; the one that matters runs at STARTUP, when the evidence of the
 * previous failure is still on disk.
 *
 * Liveness is asked of the operating system rather than guessed from an
 * mtime: `process.kill(pid, 0)` sends no signal and throws `ESRCH` when
 * nothing owns that pid. A long-running sweep therefore keeps its directory
 * however many hours it takes, which an age threshold could not promise.
 *
 * Two entries are spared regardless. Our own — `self` — because we are alive
 * and about to use it. And a directory with no marker that is younger than a
 * minute, which is the one shape a concurrent run can briefly have: it called
 * `mkdtempSync` and has not yet written its pid. An older marker-less
 * directory predates this function and is deleted, which is the case that
 * motivated writing it.
 *
 * Every step is best-effort. A permission error on somebody else's temp
 * directory must never fail a mutation sweep — the disk is a resource this
 * function tidies, not a precondition it enforces.
 *
 * `dir` exists so a test can point this at a fixture. That is not a
 * convenience: run against the real temp directory, a test of this function
 * would be deleting whatever work directories happen to be on the machine,
 * including a colleague's live fifteen-minute sweep. A destructive function
 * that cannot be aimed somewhere harmless is a function nobody can test
 * safely, and an untested reaper is worse than none.
 *
 * @param {string} self - this run's own work directory, never removed
 * @param {string} [dir] - the directory to sweep; the real temp dir in production
 */
export function reapOrphans(self, dir = tmpdir()) {
  let entries = [];
  try {
    entries = readdirSync(dir).filter((n) => n.startsWith("unify-mutate-"));
  } catch { return; }
  for (const name of entries) {
    const path = join(dir, name);
    if (path === self) continue;
    let pid = null;
    try {
      pid = Number.parseInt(readFileSync(join(path, OWNER), "utf8").trim(), 10);
    } catch { /* no marker: either pre-dates this function, or a run mid-mkdtemp */ }
    if (pid === null) {
      let age = 0;
      try { age = Date.now() - statSync(path).mtimeMs; } catch { continue; }
      if (age < 60_000) continue; // a concurrent run between mkdtemp and its marker
    } else if (Number.isFinite(pid) && alive(pid)) {
      continue;
    }
    try {
      rmSync(path, { recursive: true, force: true });
      console.log(`mutation: removed an orphaned work directory (${name})`);
    } catch { /* best effort — a tidy-up must never fail the sweep */ }
  }
}

/** Whether a pid names a live process. Signal 0 checks without delivering. */
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the process exists and belongs to another user — alive.
    return e?.code === "EPERM";
  }
}

// --------------------------------------------------------------------- main

function main() {
  const args = process.argv.slice(2);
  const revIdx = args.indexOf("--rev");
  if (revIdx !== -1 && (args[revIdx + 1] === undefined || args[revIdx + 1].startsWith("--"))) {
    console.error("usage: --rev needs a revision (e.g. --rev HEAD~1)");
    process.exit(2);
  }
  const rev = revIdx === -1 ? null : args[revIdx + 1];
  const prefixes = args.filter((a, i) => !a.startsWith("--") && !(revIdx !== -1 && i === revIdx + 1));

  const rows = parseMutations(readFileSync(TSV, "utf8"));
  const selected = prefixes.length ? rows.filter((r) => prefixes.some((p) => r.id.startsWith(p))) : rows;
  if (!selected.length) {
    console.error(`no mutations match ${prefixes.join(" ")}`);
    process.exit(2);
  }

  // `--rev` needs a real repository. Running from a `git archive` extraction
  // fails deep inside the copy step; saying so here costs nothing.
  if (rev !== null && !existsSync(join(ROOT, ".git"))) {
    console.error(`usage: --rev needs a git repository at ${ROOT} (this looks like an extracted copy)`);
    process.exit(2);
  }

  const work = mkdtempSync(join(tmpdir(), "unify-mutate-"));
  // Registered here, not left to the `finally`: `process.exit()` inside the
  // try skips it, and those are exactly the paths a survivor makes you re-run.
  // A leaked copy is ~1 GB each, and several accumulated in one session.
  let finalExit = 0;
  process.on("exit", () => { try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ } });
  // The marker, written before the sweep below reads any sibling, so a run
  // starting concurrently sees an owner rather than an orphan.
  writeFileSync(join(work, OWNER), `${process.pid}\n`);
  reapOrphans(work);
  const runSuite = (files = [], bail = false) => {
    // Removed here, immediately before the suite runs, rather than inside the
    // extraction — so no future reordering of `extract` can put it back before
    // a suite sees it. That is not hypothetical: the first version deleted it
    // once after the first extraction, and `extract` re-running per row
    // restored it, which the sweep reported back as the inventory test
    // "killing" every row.
    //
    // The inventory test asserts that every committed anchor is present in the
    // tree — true of the COMMITTED tree and false by construction of a mutated
    // one, since applying a mutation always invalidates the mutated row's own
    // anchor. Its failure under a sweep is never evidence about the mutant, so
    // counting it as a killer was this file's own "gate that lies" failure
    // arriving through the fix for it.
    //
    // Deleted from the copy, never switched off through the environment or a
    // name list: an ambient variable disables an always-on gate for anyone who
    // has it exported, and a name list is the door H4 now closes. Nothing is
    // lost — `anchorProblems` checks the pristine copy before any suite runs,
    // and the test runs on every ordinary run.
    rmSync(join(work, "tests", "conformance", "mutation-inventory.test.js"), { force: true });

    // `--bail=1` on the full-suite pass only. A kill needs ONE failing test,
    // not a census, and the full pass exists to answer yes/no. The targeted
    // pass runs without it, because that set is small and its complete killer
    // list is what the review protocol reports.
    const r = spawnSync("bun", ["test", ...files, ...(bail ? ["--bail=1"] : [])], {
      cwd: work, encoding: "utf8", timeout: SUITE_TIMEOUT_MS,
      env: { ...process.env, CLAUDECODE: "1" },
    });
    return {
      exitCode: r.status,
      output: `${r.stdout ?? ""}${r.stderr ?? ""}`,
      timedOut: r.signal === "SIGTERM" || r.error?.code === "ETIMEDOUT",
    };
  };

  // Re-run before EVERY mutation, not once. The suite runs inside this copy and
  // can destroy it: the landmine cases that exercise `-o . --clean` delete
  // source files under a mutation that breaks path containment, and a full run
  // was observed truncating after seven rows with `ENOENT ... src/core/urls.js`
  // from its own revert step. Restoring per row costs milliseconds against a
  // 30-second suite run and removes the assumption entirely — the runner no
  // longer needs the copy to survive, only to be restorable.
  const extract = () => {
    // The DIRECTORY, not just its contents: a suite running inside the copy
    // removed the copy's own root, and the next extraction then failed with
    // "tar: Cannot open". Recreating it is the difference between a run that
    // survives that and one that reports a tar error as its result.
    mkdirSync(work, { recursive: true });
    if (rev === null) {
      execFileSync("sh", ["-c",
        `tar -c -C ${JSON.stringify(ROOT)} --exclude=.git --exclude=node_modules --exclude=dist --exclude=.coverage . ` +
        `| tar -x -C ${JSON.stringify(work)}`]);
    } else {
      execFileSync("sh", ["-c", `git -C ${JSON.stringify(ROOT)} archive ${JSON.stringify(rev)} | tar -x -C ${JSON.stringify(work)}`]);
    }
  };

  try {
    extract();
    execFileSync("cp", ["-r", join(ROOT, "node_modules"), join(work, "node_modules")]);

    // EVERY row, not the selected ones — see `anchorProblems`, which owns the
    // reading precisely so this call site cannot get either half wrong.
    const { problems } = anchorProblems(work);
    for (const p of problems) console.error(p);
    if (problems.length) { console.error(`mutation: ${problems.length} unusable row(s)`); finalExit = 2; return; }

    // THE BASELINE GATE. Without it a red tree reports every mutation KILLED.
    // Run TWICE: the second run costs one suite and buys the flake set by
    // observation instead of by a hand-maintained name list. It also stops one
    // environmental port flake from discarding a fifteen-minute sweep — which
    // is the habit that trains people to re-run a check until it passes.
    let needsExtract = true;

    // THE BASELINE IS SCOPED TO WHAT WILL ACTUALLY RUN.
    //
    // Its two jobs are to refuse a red tree and to measure flakiness, and both
    // only concern tests this sweep will execute. Baselining the whole suite to
    // sweep one targeted row cost 240 seconds of setup for 8 seconds of work —
    // which is how a check becomes something people stop running.
    //
    // So it starts on the union of every selected row's targeted files, and
    // upgrades to the full suite the first time a row escalates (below). The
    // upgrade is unconditional at that point: a full-suite verdict must be
    // attributed against a full-suite baseline, or a pre-existing failure
    // somewhere unrelated would be credited as the kill.
    let baselineScope = null; // null = not yet full
    let baselineFailures = [];
    let flaky = [];

    const takeBaseline = (files, label) => {
      console.log(`mutation: checking the baseline is green (twice, to measure flakiness) — ${label}...`);
      const first = failingTests(runSuite(files).output);
      const second = failingTests(runSuite(files).output);
      const cmp = compareBaselines(first, second);
      if (cmp.hard.length) {
        console.error("mutation: the suite is not green unmutated — fix that first, or every mutation reads as killed");
        for (const t of cmp.hard.slice(0, 10)) console.error(`  failing in both runs: ${t}`);
        return false;
      }
      baselineFailures = cmp.hard;
      // Union rather than replace: a test seen flaky in the targeted baseline
      // stays excluded from attribution after the scope widens.
      flaky = [...new Set([...flaky, ...cmp.flaky])];
      if (cmp.flaky.length) {
        console.log(`mutation: baseline green; ${cmp.flaky.length} test(s) observed flaky and excluded from kill attribution:`);
        for (const t of cmp.flaky) console.log(`  flaky: ${t}`);
      } else {
        console.log("mutation: baseline green, no flakiness observed");
      }
      return true;
    };

    /** Widen the baseline to the whole suite, once, before the first escalation. */
    const ensureFullBaseline = () => {
      if (baselineScope === "full") return true;
      needsExtract = true; // the baseline runs the landmine tests too
      extract();
      needsExtract = false;
      const ok = takeBaseline([], "whole suite, for a row the index could not target");
      baselineScope = "full";
      return ok;
    };
    // Built from the ROOT tree, not the copy: the ledger is written by ordinary
    // runs there, and a freshly extracted copy may not carry one.
    const index = buildTargetIndex(ROOT);
    const targeted = selected.filter((r) => targetsFor(r, index).length).length;
    console.log(`mutation: ${selected.length} mutation(s) against ${rev ?? "the working tree"}, in ${work}`);
    console.log(`mutation: ${targeted}/${selected.length} rows have targeted tests; the rest go straight to the full suite`);
    if (!index.byRule.size) {
      console.log("mutation: no .conformance-ledger.jsonl at the root — every row will run the full suite (slow but correct)");
    }

    const scopeFiles = [...new Set(selected.flatMap((r) => targetsFor(r, index)))].sort();
    const startFull = scopeFiles.length === 0 || targeted !== selected.length;
    if (startFull) {
      baselineScope = "full";
      if (!takeBaseline([], "whole suite")) { finalExit = 2; return; }
    } else if (!takeBaseline(scopeFiles, `${scopeFiles.length} targeted file(s)`)) {
      finalExit = 2;
      return;
    }

    let unkilled = 0;
    for (const row of selected) {
      // A transient "now running" line so a stuck row is identifiable — but
      // only on a terminal. Piped to a file, \r does not erase, and the line
      // would be interleaved into the record the review protocol quotes.
      if (process.stdout.isTTY) process.stdout.write(`  ... ${row.id}\r`);
      // The copy only needs re-extracting when the previous row ran the FULL
      // suite: the landmine cases that exercise `-o . --clean` delete source
      // files, and a full run is the only thing that reaches them. After a
      // targeted run, restoring the single mutated file (below) is enough.
      // `needsExtract` starts true so the first row always gets a clean tree.
      if (needsExtract) { extract(); needsExtract = false; }
      const target = join(work, row.file);
      if (!existsSync(target)) {
        console.error(`  ERROR    ${row.id} — ${row.file} is missing from a freshly extracted copy`);
        unkilled++;
        continue;
      }
      const pristine = readFileSync(target, "utf8");
      writeFileSync(target, pristine.replace(row.old, row.next));
      let verdict;
      let escalated = false;
      try {
        // TIER 1 — the files the ledger says demonstrate this row's rules.
        // Small, so no bail: the complete killer list from the relevant tests
        // is what a review report quotes.
        const targets = targetsFor(row, index);
        verdict = targets.length
          ? classify({ ...runSuite(targets), baselineFailures, flakyTests: flaky })
          : { outcome: "SURVIVED", killedBy: [], note: "no targeted tests" };

        // TIER 2 — the full suite. Reached when targeting found nothing, which
        // is either a row with no mapped tests or a rule genuinely killed
        // somewhere the index did not predict. EVERY SURVIVOR PASSES THROUGH
        // HERE: a row is never reported survived on the strength of a subset,
        // so a wrong index costs time and cannot cost correctness.
        if (verdict.outcome !== "KILLED") {
          escalated = true;
          if (!ensureFullBaseline()) { finalExit = 2; return; }
          // The widened baseline re-extracted, so re-apply the mutation.
          writeFileSync(target, pristine.replace(row.old, row.next));
          verdict = classify({ ...runSuite([], true), baselineFailures, flakyTests: flaky });
        }

        // A kill resting on ONE test is confirmed by repeating it — on the same
        // tier that produced it, so the confirmation costs what the kill cost.
        // A test that is genuinely flaky but happened to pass both baseline
        // runs would otherwise be credited as the kill, reporting "this rule is
        // pinned" when nothing pinned it: the inversion this file exists to
        // prevent, one level down.
        if (verdict.outcome === "KILLED" && verdict.killedBy.length === 1) {
          const again = escalated
            ? classify({ ...runSuite([], true), baselineFailures, flakyTests: flaky })
            : classify({ ...runSuite(targetsFor(row, index)), baselineFailures, flakyTests: flaky });
          if (!again.killedBy.includes(verdict.killedBy[0])) {
            verdict = { outcome: "SURVIVED", killedBy: [],
              note: `the only failing test (${verdict.killedBy[0]}) did not fail again — flaky, not a kill` };
          }
        }
        if (verdict.outcome === "KILLED" && escalated && targets.length) {
          // Worth saying out loud: the row's rules pointed at files that did
          // not kill it. The sweep is still correct, and the index has a gap.
          verdict.note = `killed only by the full suite — ${row.id}'s targets (${targets.join(", ")}) missed it`;
        }
      } finally {
        if (escalated) needsExtract = true;
        // Best-effort: the next row re-extracts anyway, so a failure here is
        // not fatal the way it was when the copy had to survive the whole run.
        try { writeFileSync(target, pristine); } catch { /* re-extracted next row */ }
      }
      if (verdict.outcome === "KILLED") {
        console.log(`  KILLED   ${row.id} — killed by ${verdict.killedBy.length}: ${verdict.killedBy.slice(0, 3).join("; ")}`);
      } else {
        console.error(`  ${verdict.outcome.padEnd(8)} ${row.id} — ${verdict.note}`);
        console.error(`           rule: ${row.why}`);
        unkilled++;
      }
    }

    if (unkilled) { console.error(`mutation: ${unkilled} mutation(s) not killed — each names an unpinned rule`); finalExit = 1; return; }
    console.log(`mutation: OK — all ${selected.length} killed (these rows only; not a statement about the rest of the inventory)`);
  } finally {
    rmSync(work, { recursive: true, force: true });
    process.exitCode = finalExit;
  }
}

if (import.meta.main) main();
