/**
 * `generate.js` — conformance-spec §33, the `--generate <path>` seam.
 *
 * One author-owned JavaScript file runs before the scan, and everything it
 * writes into one supplied directory joins the build as an overlay. It
 * replaces nothing in the pipeline and adds no API to learn.
 *
 * IT NAMES A FILE, NEVER A COMMAND. This is not `--run "<shell>"`, and the
 * difference is the whole posture of the flag: a path is a thing the author
 * wrote and can read, a shell string is a place arbitrary programs get
 * spelled. There is no shell, no argument list, no environment plumbing, and
 * no way to express "and then run this other thing" (§33.1).
 *
 * THE CONTRACT IS ENTIRE (§33.2):
 *
 *     process.argv[2] = the absolute path of the source root
 *     process.argv[3] = the absolute path of the generated directory
 *
 * No module to import, no object passed in, no return value read, no
 * callback. The working directory is the source root, so `./_data/x.json` in
 * a generator means what an author reading the source tree would expect.
 *
 * THE RUNTIME IS UNIFY'S OWN, which is the point product-spec §6.4.2 makes
 * about removing the second runtime: an author with `unify` on their PATH and
 * no Node installation can run a generator. That forces in-process loading,
 * and three consequences follow — normative rather than incidental, so they
 * are stated here rather than left to be discovered:
 *
 *   1. A generator that calls `process.exit()` ENDS THE BUILD, at whatever
 *      code it passes. unify does not sandbox arbitrary JavaScript and does
 *      not claim to (§6.7).
 *   2. A generator that throws is P29, located at the generator's path, and
 *      the build stops BEFORE the scan — a partial overlay is a site nobody
 *      described.
 *   3. EVERY REBUILD RE-LOADS IT FRESH. Watch mode is full rebuilds only
 *      (§16), and an ES module cache returning the first build's module would
 *      make every rebuild after the first silently skip the generator while
 *      reporting success — the failure §14 exists to forbid, wearing a
 *      performance optimisation's clothes. The cache-busting query below is
 *      what prevents it, and it is a requirement rather than a detail.
 *
 * THE OVERLAY LIVES OUTSIDE THE SOURCE TREE (§33.3), and both reasons are
 * structural rather than tidy. `src/` is never mutated, so `audit` stays
 * read-only (§24.2) and a failed build leaves nothing behind. And the watcher
 * cannot see it: §16 coalesces saves into rebuilds, so a generator writing
 * into a watched directory would trigger the rebuild that runs the generator
 * that writes into the watched directory. Putting the directory elsewhere
 * makes that loop impossible rather than filtered.
 *
 * THE BOUNDARY IS STATED BECAUSE IT CANNOT BE ENFORCED (§33.6). unify runs
 * the file the author named; it does not sandbox it, restrict what it reads
 * or writes, or audit its output for anything the ordinary build would not.
 * What unify does guarantee is that nothing the generator produces bypasses a
 * check — a generated page is checked, its references are checked, its output
 * path collides like any other (§33.4's P12), and it publishes only inside
 * §15's transaction — and that a generator's failure is a build failure.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contains, toRelative } from "./paths.js";
import { UsageError } from "./diagnostics.js";

/**
 * Distinguishes one build's module load from the next. §33.2's third
 * consequence: without it, ESM's own cache returns the first build's module
 * and every later rebuild silently skips the generator.
 */
let loadCounter = 0;

/**
 * §33.1 — resolve the flag's value to an absolute path inside the source root.
 *
 * Containment is §4.3's rule, the same one includes and layouts obey, and it
 * is a usage error rather than a diagnostic for the reason every other bad
 * flag value is: nothing about the site is wrong, the invocation is.
 * @param {string} spec - the flag's value, as written
 * @param {string} sourceRoot
 * @returns {string} absolute path
 * @throws {UsageError}
 */
export function resolveGeneratorPath(spec, sourceRoot) {
  const root = resolve(sourceRoot);
  const abs = isAbsolute(spec) ? resolve(spec) : resolve(root, spec);
  if (!contains(root, abs)) {
    throw new UsageError(`--generate ${spec} is outside the source root`, [
      "name a file inside the source tree, e.g. --generate _scripts/gen.mjs",
    ]);
  }
  return abs;
}

/**
 * §33.3 — a fresh, empty directory outside the source tree, for one build.
 * @returns {string}
 */
export function makeOverlayDir() {
  return mkdtempSync(join(tmpdir(), "unify-generated-"));
}

/** Remove an overlay directory; best effort, since a leak costs only disk. */
export function removeOverlayDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best effort */ }
}

/**
 * §33.2 — run one author-owned generator.
 *
 * @param {object} args
 * @param {string} args.generatorAbs - absolute path, already contained (`resolveGeneratorPath`)
 * @param {string} args.sourceRoot
 * @param {string} args.overlayDir - absolute path of the generated directory
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {Promise<boolean>} false when the generator failed (P29 reported)
 */
export async function runGenerator({ generatorAbs, sourceRoot, overlayDir, reporter }) {
  const root = resolve(sourceRoot);
  const rel = toRelative(root, generatorAbs);

  const savedArgv = process.argv;
  const savedCwd = process.cwd();
  try {
    // §33.2's contract, entire. argv[0]/[1] keep their conventional meaning
    // (runtime, script) so a generator reading argv.slice(2) — the ordinary
    // idiom — gets exactly the two values the contract names.
    process.argv = [savedArgv[0], generatorAbs, root, overlayDir];
    process.chdir(root);
    // The query string is §33.2's third consequence made mechanical: a fresh
    // specifier per build, so ESM's cache cannot hand back the previous one.
    await import(`${pathToFileURL(generatorAbs).href}?unify-build=${++loadCounter}`);
    return true;
  } catch (err) {
    // P29. Located at the generator's path with no line: the throw may come
    // from anywhere in its own call graph — or from a module it imported —
    // and §14.1 omits a line rather than guessing one the file cannot hold.
    reporter.problem({
      file: rel,
      message: `--generate ${rel} threw: ${err && err.message ? err.message : String(err)}`,
      fixes: [
        "fix the generator, or drop --generate to build without it",
        "re-run with DEBUG=1 for the stack trace",
      ],
    });
    if (process.env.DEBUG && err && err.stack) process.stderr.write(`${err.stack}\n`);
    return false;
  } finally {
    process.argv = savedArgv;
    try {
      process.chdir(savedCwd);
    } catch { /* the original cwd is gone; nothing useful to do about it */ }
  }
}
