/**
 * publish.js — conformance-spec §15 (transactional publish) and the
 * `--clean` containment refusal, plus §17's `--dry-run` report formatting
 * (the report is what a plan LOOKS like, so it lives with the plan).
 *
 * Two layers, deliberately separated:
 *   - `planPublish` is a pure diff over in-memory content (`Map<path,
 *     Buffer|string>`) — no filesystem, fully unit-testable without a temp
 *     directory. This is also exactly what `--dry-run` needs (§2 step 10:
 *     "`--dry-run` is the entire pipeline through step 9 with no writes at
 *     all" — the plan IS step 9's answer; a real build additionally applies it).
 *   - `applyPublishPlan`/`emptyDirectory`/`snapshotDirectory` perform the
 *     actual I/O: temp-then-rename writes, precise deletions, and reading a
 *     real directory into the content map `planPublish` consumes.
 *
 * `publish()` composes both layers behind the one transactional guarantee
 * PUB-01 names: *zero problems → publish; any problem → the previous output
 * is byte-for-byte untouched.* That gate is enforced inside this module
 * (checked against `reporter.canPublish`) rather than left to the wiring
 * layer's discipline, so a wiring mistake cannot leak a partial publish.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { UsageError } from "./diagnostics.js";
import { cleanRefusalReason } from "./paths.js";
import { encodePathSegments } from "./urls.js";

// ------------------------------------------------------------------ types

/**
 * @typedef {object} PublishPlan
 * @property {string[]} write - relative paths new or changed vs the current output (sorted)
 * @property {string[]} unchanged - relative paths identical in both (PUB-02: not rewritten; sorted)
 * @property {string[]} delete - relative paths present in the output but no longer produced (sorted)
 */

// -------------------------------------------------------------- pure plan

/**
 * Diff a completed set of files (a temp tree, in memory) against the
 * current output directory's content. Content is compared byte-for-byte —
 * never mtime, which unify does not trust for correctness anywhere.
 * @param {object} args
 * @param {Map<string, Buffer|string>} args.tempFiles - relative path -> content;
 *   the complete set of files the build produced
 * @param {Map<string, Buffer|string>} args.outputFiles - relative path ->
 *   content; a snapshot of the CURRENT output directory (empty map for a
 *   fresh/missing directory)
 * @returns {PublishPlan}
 */
export function planPublish({ tempFiles, outputFiles }) {
  const write = [];
  const unchanged = [];
  for (const [rel, content] of tempFiles) {
    const prior = outputFiles.get(rel);
    if (prior !== undefined && contentEqual(prior, content)) unchanged.push(rel);
    else write.push(rel);
  }
  const del = [];
  for (const rel of outputFiles.keys()) {
    if (!tempFiles.has(rel)) del.push(rel);
  }
  write.sort();
  unchanged.sort();
  del.sort();
  return { write, unchanged, delete: del };
}

function contentEqual(a, b) {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a, "utf8");
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b, "utf8");
  return bufA.equals(bufB);
}

// ---------------------------------------------------------------------- io

/**
 * Read a real directory tree into the `Map<relativePath, Buffer>` shape
 * `planPublish`/`publish` consume. Returns an empty map for a directory that
 * does not exist (a fresh output directory is a legal starting state).
 * @param {string} dir
 * @returns {Promise<Map<string, Buffer>>}
 */
export async function snapshotDirectory(dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  async function walk(relDir) {
    const abs = relDir ? join(dir, relDir) : dir;
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(childRel);
      else out.set(childRel, await readFile(join(dir, childRel)));
    }
  }
  await walk("");
  return out;
}

/**
 * Execute a plan against a real output directory. Writes land via
 * temp-then-rename (never a direct overwrite in place); deletions remove
 * precisely the stale files; `unchanged` entries are untouched (PUB-02).
 * Content for `plan.write` comes from `tempFiles` directly — this function
 * never reads a temp directory off disk, so a caller that built `tempFiles`
 * purely in memory (never materializing an actual temp tree) can still use it.
 * @param {object} args
 * @param {string} args.outputDir
 * @param {Map<string, Buffer|string>} args.tempFiles
 * @param {PublishPlan} args.plan
 * @returns {Promise<void>}
 */
export async function applyPublishPlan({ outputDir, tempFiles, plan }) {
  for (const rel of plan.write) {
    const dest = join(outputDir, rel);
    await mkdir(dirname(dest), { recursive: true });
    const tmp = `${dest}.unify-tmp-${randomUUID()}`;
    await writeFile(tmp, tempFiles.get(rel));
    await rename(tmp, dest);
  }
  for (const rel of plan.delete) {
    await rm(join(outputDir, rel), { force: true });
  }
}

/**
 * The one §15 entry point for a real (non-dry-run) build: gate on
 * publishability, diff, and sync. Returns `null` and writes nothing when
 * `reporter.canPublish` is false (PUB-01) — the transactional guarantee
 * lives here, not in the caller's discipline.
 * @param {object} args
 * @param {Map<string, Buffer|string>} args.tempFiles
 * @param {string} args.outputDir
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {Promise<PublishPlan|null>} the applied plan, or null when publish was skipped
 */
export async function publish({ tempFiles, outputDir, reporter }) {
  if (!reporter.canPublish) return null;
  const outputFiles = await snapshotDirectory(outputDir);
  const plan = planPublish({ tempFiles, outputFiles });
  await mkdir(outputDir, { recursive: true });
  await applyPublishPlan({ outputDir, tempFiles, plan });
  return plan;
}

// ------------------------------------------------------------- --clean gate

/**
 * §15 `--clean`: refuse (exit 2, §14.1) rather than delete when the output
 * directory is, contains, or is contained by the source root or the working
 * directory. The containment predicate itself is paths.js's
 * `cleanRefusalReason` (already the single source of truth for that check,
 * shared with whatever else needs it); this function's job is turning a
 * non-null reason into the exit-2 `UsageError` contract.
 * @param {object} args
 * @param {string} args.output
 * @param {string} args.source
 * @param {string} [args.cwd]
 * @throws {UsageError} when the output directory fails containment
 */
export function assertCleanIsSafe({ output, source, cwd = process.cwd() }) {
  const reason = cleanRefusalReason(output, source, cwd);
  if (reason) {
    throw new UsageError(`refusing --clean: ${reason} — nothing was deleted`, [
      "choose an --output directory that is not, and does not contain or sit inside, the source root or the working directory",
    ]);
  }
}

/**
 * Empty `dir`'s CONTENTS (the directory itself is left in place). Does not
 * check containment — callers MUST call `assertCleanIsSafe` (or
 * `performClean`, which does both) first; kept separate so the emptying
 * behavior is unit-testable in isolation from the safety check.
 * @param {string} dir
 * @returns {Promise<void>}
 */
export async function emptyDirectory(dir) {
  if (!existsSync(dir)) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    await rm(join(dir, entry.name), { recursive: true, force: true });
  }
}

/**
 * `--clean`'s full behavior in one call: refuse unsafely-contained output
 * directories (throws `UsageError`, deletes nothing), otherwise empty it.
 * @param {object} args
 * @param {string} args.output
 * @param {string} args.source
 * @param {string} [args.cwd]
 * @returns {Promise<void>}
 */
export async function performClean({ output, source, cwd = process.cwd() }) {
  assertCleanIsSafe({ output, source, cwd });
  await emptyDirectory(resolve(output));
}

// --------------------------------------------------------- §17 dry-run report

/**
 * @typedef {object} DryRunRow
 * @property {'write'|'copy'|'delete'} action
 * @property {string} outputPath - as displayed, e.g. "dist/about/index.html"
 *   (includes whatever the configured --output directory name is — this
 *   module does not know or assume "dist")
 * @property {string} [url] - the address this file answers to once published
 *   (DRY-04), e.g. "/about/" — omitted for `delete`, which is a disk
 *   operation on a file the site no longer has
 * @property {string} [from] - the §17 " ← inputs" text; required for
 *   write/copy, unused for delete (e.g. "about.md + _layout.html" for a
 *   composed page, "assets/style.css" for a copied asset)
 */

/**
 * The URL path an output file answers to, given the site's path prefix
 * (`/` unless `--base-url` moved it). `index.html` is the directory itself —
 * the one inference `--pretty-urls` forces on a reader of output paths, and
 * the reason DRY-04 prints this rather than leaving it to be derived.
 * @param {string} outputPath - source-root-relative, no leading "/"
 * @param {string} pathPrefix - starts and ends with "/"
 * @returns {string}
 */
export function urlForOutputPath(outputPath, pathPrefix = "/") {
  const rel = outputPath.replace(/(^|\/)index\.html$/, "$1");
  // §20.5's percent-encoding lives HERE, not in any caller, because this is
  // the single function §17's report, §20's manifest, and every projection of
  // it already share. It was briefly applied in the manifest alone, and the
  // result was three components holding three positions on one page's address:
  // the report printed `/two words.html`, the sitemap published
  // `/two%20words.html`, and §12 rejected the second spelling — so the build
  // advertised a URL it refused to let the author link to. One function, one
  // answer. The `--base-url` prefix is deliberately not re-encoded: the author
  // wrote it as a URL, and a legitimate escape in it would be corrupted.
  return pathPrefix + encodePathSegments(rel);
}

/**
 * §17 — format the `--dry-run` report: one line per row, ordered by output
 * path regardless of verb. Write/copy rows carry the published address in
 * parentheses (DRY-04) and their inputs after " ← "; delete rows carry
 * neither. Not newline-terminated.
 * @param {DryRunRow[]} rows
 * @returns {string}
 */
export function formatDryRunReport(rows) {
  const sorted = [...rows].sort((a, b) => (a.outputPath < b.outputPath ? -1 : a.outputPath > b.outputPath ? 1 : 0));
  return sorted
    .map((row) =>
      row.action === "delete"
        ? `delete ${row.outputPath}`
        : `${row.action} ${row.outputPath}${row.url ? ` (${row.url})` : ""} ← ${row.from}`,
    )
    .join("\n");
}
