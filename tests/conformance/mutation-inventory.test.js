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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anchorProblems, parseMutations } from "./run-mutations.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// A mutation sweep deletes this file from its work copy rather than switching
// it off through the environment — see `run-mutations.mjs`. The check has no
// subject against a deliberately altered tree, and an ambient variable would
// disable it for anyone who happened to have one exported.
//
// `anchorProblems` is the sweep's OWN entry point, not a second copy of the
// same wiring. That is the point of calling it: the reading and the row set
// are where both shipped defects lived, and pinning them here pins them for
// the sweep too.
test("every mutation row anchors uniquely in the current tree", () => {
  // Sanity: the inventory is non-empty, so a truncated file cannot pass by
  // having nothing to check.
  expect(parseMutations(readFileSync(join(ROOT, "tests", "conformance", "mutations.tsv"), "utf8")).length)
    .toBeGreaterThan(0);
  const problems = anchorProblems(ROOT);
  if (problems.length) {
    throw new Error(
      `${problems.length} mutation row(s) no longer describe the tree — each is scored on a mutation that never happens:\n  ${problems.join("\n  ")}`,
    );
  }
});
