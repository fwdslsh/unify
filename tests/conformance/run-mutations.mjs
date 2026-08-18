#!/usr/bin/env bun
/**
 * run-mutations.mjs — "does this rule have a test that can fail?"
 *
 * Every defect found in four rounds of independent review on the v0.8 manifest
 * work was the same shape: a rule written correctly in `docs/conformance-spec.md`,
 * implemented differently, and a suite that stayed green either way. Coverage
 * could not see it — the code ran, it just did the wrong thing and nobody
 * asserted otherwise. Mutation is the only check that distinguishes "the line
 * executed" from "a test would notice if the line were wrong".
 *
 * `mutations.tsv` names one anchor→replacement pair per rule, with the rule it
 * defends. Each is applied, the suite runs, the mutation is reverted, and a
 * mutation that leaves the suite GREEN is a failure: the rule it names is
 * unpinned, and the spec claims something the tests cannot distinguish from its
 * opposite.
 *
 * NEVER MUTATES THE WORKING TREE. Every run happens in a throwaway copy, for a
 * reason this repository has already paid for twice: an in-place mutation was
 * swept into a commit by an unrelated `git add -A`, and a second in-place run
 * silently reverted a real fix when its restore step did not execute after a
 * timeout. The copy makes both impossible rather than discouraged.
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
 * Exit 0 when every mutation is killed; 1 when any survives; 2 on a bad anchor
 * (the source moved and the mutation no longer describes it — fix the row).
 *
 * Not a release gate today, deliberately: it takes one suite run per mutation.
 * It is a review-protocol step — a reviewer reports which tests each mutation
 * KILLED, which turns "I mutated it" from an anecdote into a record.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSV = join(ROOT, "tests", "conformance", "mutations.tsv");

const args = process.argv.slice(2);
const revIdx = args.indexOf("--rev");
const rev = revIdx === -1 ? null : args[revIdx + 1]; // null = the working tree
const prefixes = args.filter((a, i) => !a.startsWith("--") && !(revIdx !== -1 && i === revIdx + 1));

/** A TSV cell escapes a literal tab as `\t`, a newline as `\n`, and a pipe as `\|`. */
const unescape = (cell) => cell.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\|/g, "|").replace(/\\\\/g, "\\");

const rows = readFileSync(TSV, "utf8").trimEnd().split("\n").slice(1).map((line) => {
  const [file, id, old, next, why] = line.split("\t");
  return { file, id, old: unescape(old), next: unescape(next ?? ""), why };
});

const selected = prefixes.length ? rows.filter((r) => prefixes.some((p) => r.id.startsWith(p))) : rows;
if (!selected.length) {
  console.error(`no mutations match ${prefixes.join(" ")}`);
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "unify-mutate-"));
try {
  // The WORKING TREE by default, not HEAD. The moment this check matters most
  // is before a commit, when a rule has just been written and the question is
  // whether anything would notice it being wrong. `--rev` is for auditing a
  // past commit.
  if (rev === null) {
    execFileSync("sh", ["-c",
      `tar -c -C ${JSON.stringify(ROOT)} --exclude=.git --exclude=node_modules --exclude=dist --exclude=.coverage . ` +
      `| tar -x -C ${JSON.stringify(work)}`]);
  } else {
    execFileSync("sh", ["-c", `git -C ${JSON.stringify(ROOT)} archive ${JSON.stringify(rev)} | tar -x -C ${JSON.stringify(work)}`]);
  }
  execFileSync("cp", ["-r", join(ROOT, "node_modules"), join(work, "node_modules")]);

  let survived = 0;
  let bad = 0;
  console.log(`mutation: ${selected.length} mutation(s) against ${rev ?? "the working tree"}, in ${work}`);

  for (const row of selected) {
    const target = join(work, row.file);
    const pristine = readFileSync(target, "utf8");
    if (!pristine.includes(row.old)) {
      console.error(`BAD-ANCHOR ${row.id} — ${row.file} no longer contains the anchor; update mutations.tsv`);
      bad++;
      continue;
    }
    writeFileSync(target, pristine.replace(row.old, row.next));
    let killed = false;
    let summary = "";
    try {
      execFileSync("bun", ["test"], { cwd: work, stdio: "pipe", env: { ...process.env, CLAUDECODE: "1" } });
    } catch (err) {
      killed = true;
      const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      const fails = [...out.matchAll(/^\(fail\) (.+?)(?: \[[\d.]+ms\])?$/gm)].map((m) => m[1]);
      summary = fails.length ? ` — killed by ${fails.length}: ${fails.slice(0, 3).join("; ")}` : "";
    } finally {
      writeFileSync(target, pristine);
    }
    if (killed) {
      console.log(`  KILLED   ${row.id}${summary}`);
    } else {
      console.error(`  SURVIVED ${row.id} — nothing distinguishes this from its opposite`);
      console.error(`           rule: ${row.why}`);
      survived++;
    }
  }

  if (bad) { console.error(`mutation: ${bad} stale anchor(s)`); process.exit(2); }
  if (survived) { console.error(`mutation: ${survived} survivor(s) — each names an unpinned rule`); process.exit(1); }
  console.log("mutation: OK — every mutation killed");
} finally {
  rmSync(work, { recursive: true, force: true });
}
