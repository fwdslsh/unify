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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
 * `read` returns the file's text, or null when it does not exist. Prefer
 * `anchorProblems` below — it owns the reading, and the reading is where the
 * defects were.
 *
 * @param {{id: string, file: string, old: string, next: string}[]} rows
 * @param {(file: string) => string|null} read
 * @returns {string[]} one message per problem, empty when every row is usable
 */
export function validateAnchors(rows, read) {
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
 * @param {string} rootDir - the tree, and the inventory that claims to describe it
 * @returns {string[]} one message per problem, empty when every row is usable
 */
export function anchorProblems(rootDir) {
  const rows = parseMutations(readFileSync(join(rootDir, "tests", "conformance", "mutations.tsv"), "utf8"));
  return validateAnchors(rows, (file) => {
    const abs = join(rootDir, file);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  });
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
  const runSuite = () => {
    const r = spawnSync("bun", ["test"], {
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
    // Inside `extract`, because `extract` runs again before every row. The
    // inventory test asserts that every committed anchor is present in the
    // tree — true of the COMMITTED tree and false by construction of a mutated
    // one, since applying a mutation always invalidates the mutated row's own
    // anchor. Left in place it failed on every single mutation and was
    // credited as the killer of every one: this file's own "gate that lies"
    // failure, arriving through the fix for it.
    //
    // Deleted from the copy rather than switched off through the environment.
    // An ambient variable disables an always-on gate for anyone who has it
    // exported, and nothing would stop a future test opting into the same
    // exemption to quiet a real killer — the door the rejected exclusion list
    // came through, with a different key. Nothing is lost: `anchorProblems`
    // checks the pristine copy before any suite runs, and the test itself runs
    // on every ordinary run.
    //
    // A one-shot deletion after the first extraction was the first attempt,
    // and the sweep reported it back — the row it swept was still "killed by"
    // the inventory test, because the next `extract()` had put the file back.
    rmSync(join(work, "tests", "conformance", "mutation-inventory.test.js"), { force: true });
  };

  try {
    extract();
    execFileSync("cp", ["-r", join(ROOT, "node_modules"), join(work, "node_modules")]);


    // EVERY row, not the selected ones — see `anchorProblems`, which owns the
    // reading precisely so this call site cannot get either half wrong.
    const problems = anchorProblems(work);
    for (const p of problems) console.error(p);
    if (problems.length) { console.error(`mutation: ${problems.length} unusable row(s)`); finalExit = 2; return; }

    // THE BASELINE GATE. Without it a red tree reports every mutation KILLED.
    // Run TWICE: the second run costs one suite and buys the flake set by
    // observation instead of by a hand-maintained name list. It also stops one
    // environmental port flake from discarding a fifteen-minute sweep — which
    // is the habit that trains people to re-run a check until it passes.
    console.log("mutation: checking the baseline is green (twice, to measure flakiness)...");
    const first = failingTests(runSuite().output);
    const second = failingTests(runSuite().output);
    const { flaky, hard } = compareBaselines(first, second);
    if (hard.length) {
      console.error("mutation: the suite is not green unmutated — fix that first, or every mutation reads as killed");
      for (const t of hard.slice(0, 10)) console.error(`  failing in both runs: ${t}`);
      finalExit = 2;
      return;
    }
    const baselineFailures = hard;
    if (flaky.length) {
      console.log(`mutation: baseline green; ${flaky.length} test(s) observed flaky and excluded from kill attribution:`);
      for (const t of flaky) console.log(`  flaky: ${t}`);
    } else {
      console.log("mutation: baseline green, no flakiness observed");
    }
    console.log(`mutation: ${selected.length} mutation(s) against ${rev ?? "the working tree"}, in ${work}`);

    let unkilled = 0;
    for (const row of selected) {
      // A transient "now running" line so a stuck row is identifiable — but
      // only on a terminal. Piped to a file, \r does not erase, and the line
      // would be interleaved into the record the review protocol quotes.
      if (process.stdout.isTTY) process.stdout.write(`  ... ${row.id}\r`);
      extract(); // whatever the previous row's suite did to the copy, undo it
      const target = join(work, row.file);
      if (!existsSync(target)) {
        console.error(`  ERROR    ${row.id} — ${row.file} is missing from a freshly extracted copy`);
        unkilled++;
        continue;
      }
      const pristine = readFileSync(target, "utf8");
      writeFileSync(target, pristine.replace(row.old, row.next));
      let verdict;
      try {
        verdict = classify({ ...runSuite(), baselineFailures, flakyTests: flaky });
        // A kill resting on ONE test is confirmed by repeating it. A test that
        // is genuinely flaky but happened to pass both baseline runs would
        // otherwise be credited as the kill — reporting "this rule is pinned"
        // when nothing pinned it, which is the inversion this file exists to
        // prevent, one level down.
        if (verdict.outcome === "KILLED" && verdict.killedBy.length === 1) {
          const again = classify({ ...runSuite(), baselineFailures, flakyTests: flaky });
          if (!again.killedBy.includes(verdict.killedBy[0])) {
            verdict = { outcome: "SURVIVED", killedBy: [],
              note: `the only failing test (${verdict.killedBy[0]}) did not fail again — flaky, not a kill` };
          }
        }
      } finally {
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
