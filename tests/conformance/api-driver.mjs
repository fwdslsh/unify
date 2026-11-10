/**
 * api-driver.mjs — the embedder half of gate G15 (interface equivalence).
 *
 * Runs as its OWN process, under bun or node, so that "the API writes nothing
 * to the process's streams and does not exit" is observed from outside rather
 * than promised from inside: the test spawns this file and requires that it
 * exits 0 with empty stdout and empty stderr, and that the only thing it left
 * behind is the results file named on its command line.
 *
 * It imports the package by NAME — `@fwdslsh/unify`, self-referencing through
 * the `exports` map — the public entry point and nothing else (H3's carve-out).
 *
 * usage: <runtime> api-driver.mjs <spec.json> <results.json>
 *   spec    = {cases: [{id, cwd, fn, options}],      run one after another, each in its cwd
 *              overlap: {cwd, calls: [{fn, options}]}, started together, in one cwd
 *              bad: [{id, fn, options}]}               must reject with a TypeError
 *   results = {cases: {id -> {status, stdout, stderr}}, overlap: [...], bad: {id -> error name},
 *              exits, exitCode}
 */
import { readFileSync, writeFileSync } from "node:fs";
import { audit, build } from "@fwdslsh/unify";

const [specPath, resultsPath] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const fns = { build, audit };

// Any exit during the calls is a failure of the API: record it and refuse it.
let exits = 0;
const realExit = process.exit;
process.exit = (code) => { exits++; throw new Error(`process.exit(${code}) called by the API`); };

const cases = {};
for (const c of spec.cases) {
  process.chdir(c.cwd);
  cases[c.id] = await fns[c.fn](c.options);
}

let overlap = null;
if (spec.overlap) {
  process.chdir(spec.overlap.cwd);
  overlap = await Promise.all(spec.overlap.calls.map((c) => fns[c.fn](c.options)));
}

const bad = {};
for (const c of spec.bad ?? []) {
  try {
    await fns[c.fn](c.options);
    bad[c.id] = null;
  } catch (error) {
    bad[c.id] = error?.name ?? String(error);
  }
}

process.exit = realExit;
writeFileSync(resultsPath, JSON.stringify({ cases, overlap, bad, exits, exitCode: process.exitCode ?? null }));
