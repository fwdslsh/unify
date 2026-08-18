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
 * SCOPE, so a green run is not over-read: this file defends the rules its rows
 * name and no others. A survivor-free sweep means those anchors are pinned — it
 * is not a statement about the rest of the inventory.
 *
 * NEVER MUTATES THE WORKING TREE. Every run happens in a throwaway copy, for a
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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSV = join(ROOT, "tests", "conformance", "mutations.tsv");

/** A mutation gets this long before it counts as TIMEOUT rather than a kill. */
export const SUITE_TIMEOUT_MS = 240_000;

/**
 * Tests whose failure never proves a mutation was noticed: they bind ports and
 * touch timers, so they fail for environmental reasons no source mutation can
 * cause. Excluded from kill attribution so a coincidental flake cannot mask a
 * real survivor.
 */
export const FLAKY = /^§16 dev server|^§16 watch|dev-server|reload script/i;

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
 * @returns {{outcome: 'KILLED'|'SURVIVED'|'CRASHED'|'TIMEOUT', killedBy: string[], note: string}}
 */
export function classify({ exitCode, output, timedOut, baselineFailures = [] }) {
  if (timedOut) {
    return { outcome: "TIMEOUT", killedBy: [], note: "the suite did not finish — a hang is not a kill" };
  }
  const failed = failingTests(output);
  const attributable = failed.filter((t) => !FLAKY.test(t) && !baselineFailures.includes(t));
  if (attributable.length) {
    return { outcome: "KILLED", killedBy: attributable, note: "" };
  }
  if (exitCode !== 0) {
    const why = failed.length
      ? `only pre-existing or environment-flaky failures (${failed.slice(0, 2).join("; ")})`
      : "the suite exited non-zero with no failing test — the replacement probably does not parse";
    return { outcome: "CRASHED", killedBy: [], note: why };
  }
  return { outcome: "SURVIVED", killedBy: [], note: "nothing distinguishes this from its opposite" };
}

// --------------------------------------------------------------------- main

if (import.meta.main) {
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

  const work = mkdtempSync(join(tmpdir(), "unify-mutate-"));
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

  try {
    if (rev === null) {
      execFileSync("sh", ["-c",
        `tar -c -C ${JSON.stringify(ROOT)} --exclude=.git --exclude=node_modules --exclude=dist --exclude=.coverage . ` +
        `| tar -x -C ${JSON.stringify(work)}`]);
    } else {
      execFileSync("sh", ["-c", `git -C ${JSON.stringify(ROOT)} archive ${JSON.stringify(rev)} | tar -x -C ${JSON.stringify(work)}`]);
    }
    execFileSync("cp", ["-r", join(ROOT, "node_modules"), join(work, "node_modules")]);

    // Every anchor must resolve, and resolve UNIQUELY: `String.replace` edits
    // the first occurrence, so an ambiguous anchor mutates something other than
    // the row it names — a silent mis-measurement rather than a loud one.
    let bad = 0;
    for (const row of selected) {
      const text = readFileSync(join(work, row.file), "utf8");
      const hits = text.split(row.old).length - 1;
      if (hits === 0) { console.error(`BAD-ANCHOR ${row.id} — ${row.file} no longer contains it; update mutations.tsv`); bad++; }
      else if (hits > 1) { console.error(`AMBIGUOUS ${row.id} — the anchor appears ${hits}x in ${row.file}; make it unique`); bad++; }
      if (row.old === row.next) { console.error(`NO-OP ${row.id} — the replacement equals the anchor`); bad++; }
    }
    if (bad) { console.error(`mutation: ${bad} unusable row(s)`); process.exit(2); }

    // THE BASELINE GATE. Without it a red tree reports every mutation KILLED.
    console.log("mutation: checking the baseline is green...");
    const baseline = runSuite();
    const baselineFailures = failingTests(baseline.output);
    if (baseline.timedOut || baseline.exitCode !== 0) {
      console.error("\nmutation: the suite is not green unmutated — fix that first, or every mutation reads as killed");
      for (const t of baselineFailures.slice(0, 10)) console.error(`  failing: ${t}`);
      process.exit(2);
    }
    console.log("mutation: baseline green");
    console.log(`mutation: ${selected.length} mutation(s) against ${rev ?? "the working tree"}, in ${work}`);

    let unkilled = 0;
    for (const row of selected) {
      // A transient "now running" line so a stuck row is identifiable — but
      // only on a terminal. Piped to a file, \r does not erase, and the line
      // would be interleaved into the record the review protocol quotes.
      if (process.stdout.isTTY) process.stdout.write(`  ... ${row.id}\r`);
      const target = join(work, row.file);
      const pristine = readFileSync(target, "utf8");
      writeFileSync(target, pristine.replace(row.old, row.next));
      let verdict;
      try {
        verdict = classify({ ...runSuite(), baselineFailures });
      } finally {
        writeFileSync(target, pristine);
      }
      if (verdict.outcome === "KILLED") {
        console.log(`  KILLED   ${row.id} — killed by ${verdict.killedBy.length}: ${verdict.killedBy.slice(0, 3).join("; ")}`);
      } else {
        console.error(`  ${verdict.outcome.padEnd(8)} ${row.id} — ${verdict.note}`);
        console.error(`           rule: ${row.why}`);
        unkilled++;
      }
    }

    if (unkilled) { console.error(`mutation: ${unkilled} mutation(s) not killed — each names an unpinned rule`); process.exit(1); }
    console.log(`mutation: OK — all ${selected.length} killed (these rows only; not a statement about the rest of the inventory)`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
