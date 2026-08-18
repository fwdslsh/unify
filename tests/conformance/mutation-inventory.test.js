/**
 * Every committed mutation row's anchor is present, exactly once, in the tree
 * as it stands — checked on every run of the suite, not only inside a sweep.
 *
 * This is the check that would have caught round 4's staleness the moment it
 * happened. `run-mutations.mjs` validates anchors too, but only when someone
 * runs it: a full sweep takes about half an hour, so in practice it is run on
 * a prefix, and for two review rounds three rows sat stale — their anchors
 * removed by ordinary refactors — while every sweep that did run reported
 * "all killed". A row whose anchor is absent is scored on a mutation that
 * never happened, because `String.replace` with a needle that is not there
 * rewrites the file unchanged and returns silently.
 *
 * So the gate that certifies the other gates gets the cheapest possible
 * enforcement: an ordinary test, one second, every CI run.
 *
 * This file reads `src/**` on purpose and is exempt from hygiene H3 for the
 * same reason `check-traceability.mjs` reads the spec — it is not testing
 * unify's behaviour, it is testing that a committed inventory still describes
 * the tree it names.
 */
import { expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMutations, validateAnchors } from "./run-mutations.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Under a mutation sweep the tree is deliberately not the committed one, so
// this check has no subject there — and left running it would fail on every
// mutation and be counted as the killer of every one, which is precisely the
// "reported a kill while testing nothing" failure the inventory exists to stop.
const MUTATING = process.env.UNIFY_MUTATION_RUN === "1";

test.skipIf(MUTATING)("every mutation row anchors uniquely in the current tree", () => {
  const rows = parseMutations(readFileSync(join(ROOT, "tests", "conformance", "mutations.tsv"), "utf8"));
  expect(rows.length).toBeGreaterThan(0);
  const problems = validateAnchors(rows, (file) => {
    const abs = join(ROOT, file);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  });
  if (problems.length) {
    throw new Error(
      `${problems.length} mutation row(s) no longer describe the tree — each is scored on a mutation that never happens:\n  ${problems.join("\n  ")}`,
    );
  }
});
