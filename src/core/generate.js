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
 * no Node installation can run a generator. It is run as a SUBPROCESS of
 * unify's own executable — `BUN_BE_BUN=1` makes a compiled single-file
 * binary execute a script path, which is what keeps that promise without a
 * Node installation anywhere.
 *
 * THE SUBPROCESS IS NOT AN IMPLEMENTATION DETAIL; it is what makes §33.2's
 * three consequences true rather than aspirational, and the first design
 * loaded the module in-process and got the third one WRONG:
 *
 *   1. A generator that calls `process.exit()` ends its own process, and a
 *      non-zero exit is P29. In-process it ended the BUILD at whatever code
 *      it passed, which unify could neither report nor recover from.
 *   2. A generator that throws exits non-zero with its message on stderr, and
 *      that is P29 — located at the generator's path, stopping the build
 *      BEFORE the scan, because a partial overlay is a site nobody described.
 *   3. EVERY REBUILD RE-RUNS IT, structurally: a new process has no module
 *      cache to consult. In-process this was a cache-busting query string,
 *      and it did not work — Bun ignores the query when caching a file URL,
 *      so `?v=1` and `?v=2` are one module. The generator then ran on the
 *      FIRST build of a watch session and never again: every later rebuild
 *      scanned an empty overlay, dropped every generated page, and reported
 *      the site's own links as broken. Watch mode is full rebuilds only
 *      (§16), and a cache that survives one is the failure §14 exists to
 *      forbid wearing a performance optimisation's clothes.
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
import { contains, toRelative } from "./paths.js";
import { UsageError } from "./diagnostics.js";

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
 * The generator's own words, pulled out of a runtime's stderr.
 *
 * A thrown error reaches stderr wrapped in the runtime's presentation — a
 * code frame, a caret, stack frames, a version footer — and the author's
 * message is in the MIDDLE of it, not at either end. Taking the last lines
 * put `at loadAndEvaluateModule (2:1) / Bun v1.3.11 (Linux x64)` in a P29
 * where `boom from the generator` belonged: technically the tail of stderr,
 * useless to the person who has to fix it.
 *
 * So the frames are dropped by shape and what remains is the message. A
 * generator that just writes to stderr and exits non-zero has no frames at
 * all, and its line survives untouched — which is the same rule, not a
 * second one.
 *
 * @param {string} stderr
 * @returns {string} at most a few lines, joined; "" when there is nothing to say
 */
function failureDetail(stderr) {
  const noise = [
    /^\s*\d+\s*\|/, //        code frame:  `1 | throw new Error(...)`
    /^\s*[\^~]+\s*$/, //       the caret under it
    /^\s*at\s/, //             stack frame
    /^Bun v\d/, //              the runtime's version footer
    /^Node\.js v\d/,
  ];
  const lines = stderr
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !noise.some((re) => re.test(line)));
  const detail = lines.slice(0, 3).join(" / ");
  // Bounded, because a generator's stderr is arbitrary and a §14 report is
  // read by a person. The cap is generous enough that every ordinary message
  // arrives whole.
  return detail.length > 300 ? `${detail.slice(0, 299)}…` : detail;
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

  // `BUN_BE_BUN=1` is what lets a COMPILED single-file executable run a script
  // path instead of re-entering its own CLI: without it, `unify gen.mjs` is an
  // unknown-argument usage error. It is harmless when `process.execPath` is an
  // ordinary `bun`, so one spawn covers both the checkout and the binary.
  const proc = Bun.spawn({
    cmd: [process.execPath, generatorAbs, root, overlayDir],
    cwd: root, // §33.2 — `./_data/x.json` means what an author expects
    env: { ...process.env, BUN_BE_BUN: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  // A generator's own stdout is its business and is passed through, so a
  // script that logs its progress still does (§33.6: unify runs the file the
  // author named and does not police it).
  if (out) process.stdout.write(out);

  if (code === 0) return true;

  // P29. Located at the generator's path with no line: the failure may come
  // from anywhere in its own call graph — or from a module it imported — and
  // §14.1 omits a line rather than guessing one the file cannot hold.
  const detail = failureDetail(err);
  reporter.problem({
    file: rel,
    message: `--generate ${rel} failed (exit ${code})${detail ? `: ${detail}` : ""}`,
    fixes: [
      "fix the generator, or drop --generate to build without it",
      "run it directly to see its full output: bun " + rel,
    ],
  });
  if (process.env.DEBUG && err) process.stderr.write(err);
  return false;
}
