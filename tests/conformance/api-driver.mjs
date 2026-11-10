/**
 * api-driver.mjs — the embedder half of gate G15 (interface equivalence).
 *
 * Runs as its OWN process, under bun or node, so that "the API writes nothing
 * to stdout/stderr and does not exit" is observed from outside rather than
 * promised from inside: the test spawns this file and requires that it exits 0
 * with empty stdout and empty stderr, and that the only thing it left behind is
 * the results file named on its command line.
 *
 * It imports the package by NAME — `@fwdslsh/unify`, self-referencing through
 * the `exports` map — which is the public entry point and nothing else (H3's
 * carve-out). It also proves the map resolves under both runtimes.
 *
 * usage: <runtime> api-driver.mjs <spec.json> <results.json>
 *   spec    = {cases: [{id, cwd, fn: "build"|"audit", options}], repeat: boolean}
 *   results = {id -> {status, diagnostics, files?, report?, error?, threw?}}
 * `files` is encoded {path -> base64} so JSON can carry it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { audit, build } from "@fwdslsh/unify";

const [specPath, resultsPath] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, "utf8"));

// Any exit during the calls is a failure of the API, not of the driver: record
// it and refuse it, so the results file says what happened.
let exits = 0;
const realExit = process.exit;
process.exit = (code) => { exits++; throw new Error(`process.exit(${code}) called by the API`); };

async function runAll() {
  const results = {};
  for (const c of spec.cases) {
    process.chdir(c.cwd);
    const fn = c.fn === "build" ? build : audit;
    const r = await fn(c.options);
    const encoded = { ...r };
    if (r.files instanceof Map) {
      encoded.files = Object.fromEntries([...r.files].map(([p, b]) => [p, { isBytes: b instanceof Uint8Array, base64: Buffer.from(b).toString("base64") }]));
    }
    results[c.id] = encoded;
  }
  return results;
}

const first = await runAll();
// The same calls again in the same process: nothing the first pass did may show.
const second = spec.repeat ? await runAll() : null;
process.exit = realExit;
writeFileSync(resultsPath, JSON.stringify({ first, second, exits }));
