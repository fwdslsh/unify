#!/usr/bin/env bun
/**
 * check-module-graph.mjs — release gate G8, "no dead modules".
 *
 * The claim: every file under `src/**` is reachable from `src/cli.js` by
 * following static `import` specifiers. A module nothing imports is either a
 * feature that was cut and left behind or a feature that was written and never
 * wired — both are bugs, and both are invisible to a green test suite, because
 * a unit test importing a module directly makes it *covered* without making it
 * *reachable*. That combination is exactly how the v0.6 suite reached 93%
 * coverage on a product that did not work (testing-strategy §1).
 *
 * Static analysis only, deliberately: `import` specifiers are read out of the
 * source text rather than by loading modules, so the gate never executes CLI
 * code and cannot be satisfied by a dynamic import written to fool it. Only
 * relative specifiers are followed — a bare specifier is a dependency, not a
 * `src/**` file.
 *
 * Exit 0 clean; 1 unreachable modules.
 */
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { reachableFrom, sourceFiles } from "../module-graph.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");
const ENTRY = join(SRC, "cli.js");

// The walk and the file sweep both come from tests/module-graph.mjs, which is
// also what the test preflight uses. Two gates that answer "what does this file
// import" from two copies of the same regexes can disagree about a specifier
// form, and the disagreement is silent in both (testing-strategy §5).
const reachable = reachableFrom([ENTRY], [SRC]);
const dead = sourceFiles(SRC).filter((f) => !reachable.has(f));
console.log(`module graph: ${reachable.size} reachable from src/cli.js`);
if (dead.length) {
  console.error(`FAIL ${dead.length} unreachable module(s) under src/:`);
  for (const f of dead.sort()) console.error(`  ${relative(ROOT, f)}`);
  console.error("wire it into the build, or delete it — an unimported module is dead code");
  process.exit(1);
}
console.log("module graph: OK");
