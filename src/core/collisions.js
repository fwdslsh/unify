/**
 * collisions.js — conformance-spec §13 (output paths and collisions), plus
 * three more "does this file belong in the output tree at all" checks that
 * naturally share §13's shape (iterate the corpus of files about to be
 * emitted or held back, look at each one's PATH, report by pattern — no
 * content inspection, no composition):
 *
 *   - P14 (§4.2, the underscore guard): an emitted `_`-prefixed page, or a
 *     path with a `_`-prefixed directory segment.
 *   - A09 (§14.3): a working-format asset (`.psd`/`.ai`/`.sketch`/`.fig`/`.xcf`).
 *   - A14 (§4.2, the deployment-file advisory) and its maintained list,
 *     `KNOWN_DEPLOYMENT_FILES`.
 *
 * Placement note (see the accompanying report for the full reasoning): none
 * of P14/A09/A14 is §13 material by section number, and none of urls.js,
 * references.js, or publish.js is a better fit either — all three are
 * properties of the FULL SOURCE-ROOT FILE LISTING that this module already
 * needs in hand to compute output paths and detect collisions, and unlike
 * publish.js (which only ever sees a temp tree's content, not source
 * classification) or references.js (which checks URLs, not file identity),
 * this module already receives exactly the shape (`SourceEntry[]`,
 * page/asset kind, exclusion already applied by the caller) all three
 * checks need. This module does not itself evaluate `--exclude` globs or
 * the never-shipped list (§4.1/§4.3) — that remains file-classification
 * logic outside this module's scope; `underscoreGuardDiagnostics` and
 * `workingFormatDiagnostics` run over whatever the caller has already
 * determined WILL be emitted, and `deploymentFileDiagnostics` runs over
 * whatever the caller has already determined was EXCLUDED at the source
 * root.
 */
import { prettyOutputPath } from "./urls.js";

// -------------------------------------------------------------- constants

/**
 * §4.2/§14.3 A14 — known deployment files: filenames that function only by
 * sitting at the publish root (Netlify, Cloudflare Pages, GitLab Pages).
 * Deliberately NOT normative text (conformance §4.2): hosting providers add
 * conventions faster than a spec revision cycle, so growing this list is a
 * one-line code change, not a conformance break. Recognition is by exact
 * name, at the source root only (a nested `blog/_headers` is ordinary
 * excluded material and draws nothing — see `deploymentFileDiagnostics`).
 * @type {string[]}
 */
export const KNOWN_DEPLOYMENT_FILES = ["_headers", "_redirects", "_routes.json", "_worker.js"];

/**
 * §14.3 A09 — working-format (design-tool) extensions. Closed list per the
 * conformance spec's own enumeration.
 * @type {string[]}
 */
export const WORKING_FORMAT_EXTENSIONS = [".psd", ".ai", ".sketch", ".fig", ".xcf"];

// ------------------------------------------------------------------- types

/**
 * @typedef {object} SourceEntry
 * @property {string} path - source-root-relative, posix-separated
 * @property {'page'|'asset'} kind - a page is exactly `.html`/`.md` (§1);
 *   everything else emitted is an asset
 */

/**
 * @typedef {object} OutputEntry
 * @property {SourceEntry} source
 * @property {string} outputPath - source-root-relative, posix-separated
 */

// ------------------------------------------------------------ output paths

/**
 * One entry's computed output path: a page's `.html`/`.md` extension
 * becomes `.html` (same stem), then `--pretty-urls` (urls.js
 * `prettyOutputPath`) when requested; an asset is unchanged (§4.4 mirror
 * copy is path-preserving).
 * @param {SourceEntry} entry
 * @param {{prettyUrls?: boolean}} [opts]
 * @returns {string}
 */
export function computeOutputPath(entry, { prettyUrls = false } = {}) {
  if (entry.kind === "asset") return entry.path;
  const htmlPath = entry.path.replace(/\.(html|md)$/i, ".html");
  return prettyUrls ? prettyOutputPath(htmlPath) : htmlPath;
}

/**
 * §13 — compute every entry's output path and report collisions.
 * Pages and assets cannot collide with each other by construction (COL-04:
 * `.html`/`.md` are always pages, everything else is always an asset, and
 * mirror copy is path-preserving) — this function still groups by the
 * literal computed path across both kinds for simplicity, which is
 * equivalent by that construction, not an extra rule.
 *
 * @param {object} args
 * @param {SourceEntry[]} args.entries - every file the caller has already
 *   determined will be emitted (exclusion/§4.1 and the never-shipped
 *   list/§4.3 already applied — this function does not re-derive them)
 * @param {boolean} [args.prettyUrls]
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {OutputEntry[]} one row per entry, input order preserved;
 *   `outputPath` stays populated for entries that collided (already
 *   reported to `reporter` by the time this returns)
 */
export function resolveOutputPaths({ entries, prettyUrls = false, reporter }) {
  const results = entries.map((source) => ({ source, outputPath: computeOutputPath(source, { prettyUrls }) }));

  /** @type {Map<string, OutputEntry[]>} */
  const byExactPath = new Map();
  for (const r of results) {
    if (!byExactPath.has(r.outputPath)) byExactPath.set(r.outputPath, []);
    byExactPath.get(r.outputPath).push(r);
  }

  // P12 — two (or more) sources producing the identical output path.
  for (const group of byExactPath.values()) {
    if (group.length < 2) continue;
    const sorted = pathOrdered(group);
    reporter.problem({
      file: sorted[0].source.path,
      message: `${sorted.map((g) => g.source.path).join(" and ")} both produce ${sorted[0].outputPath}`,
      // Not "remove one": a round-8 repair sample deleted the losing source
      // outright, taking the page's address and phone number with it. Naming
      // the two non-destructive edits first is the whole fix.
      fixes: ["rename one of the sources, or merge them into one, so only one produces this output path"],
    });
  }

  // A11 — distinct exact-path groups whose paths differ only by letter case.
  /** @type {Map<string, string[]>} */
  const byLowerPath = new Map();
  for (const outputPath of byExactPath.keys()) {
    const lower = outputPath.toLowerCase();
    if (!byLowerPath.has(lower)) byLowerPath.set(lower, []);
    byLowerPath.get(lower).push(outputPath);
  }
  for (const paths of byLowerPath.values()) {
    if (paths.length < 2) continue;
    const allEntries = pathOrdered(paths.flatMap((p) => byExactPath.get(p)));
    const [first, ...rest] = allEntries;
    const others = [...new Set(rest.map((r) => r.outputPath))].join(", ");
    reporter.advisory({
      file: first.source.path,
      message: `${first.outputPath} and ${others} differ only by letter case — they collide on case-insensitive hosts`,
    });
  }

  return results;
}

/** Sort output entries by their SOURCE path (§14.1 R3: collision attribution is the path-ordered first source). */
function pathOrdered(group) {
  return [...group].sort((a, b) => (a.source.path < b.source.path ? -1 : a.source.path > b.source.path ? 1 : 0));
}

// --------------------------------------------------------------- P14 guard

/**
 * §4.2 P14 — the underscore guard: an emitted file that is a `_`-prefixed
 * page, or whose path contains a `_`-prefixed directory segment, is a
 * problem. Deliberately does not cover a root-level (or any-level)
 * `_`-prefixed non-page file on its own (§4.2: "the guard deliberately does
 * not cover ... non-page files") — only the directory-segment clause
 * reaches assets, and only when the underscore is on a DIRECTORY, not the
 * asset's own filename.
 * @param {SourceEntry[]} entries - the would-be-emitted set (post-exclusion)
 * @param {import('./diagnostics.js').Reporter} reporter
 * @returns {void}
 */
export function underscoreGuardDiagnostics(entries, reporter) {
  for (const entry of entries) {
    const segments = entry.path.split("/");
    const basename = segments[segments.length - 1];
    const dirSegments = segments.slice(0, -1);
    const inUnderscoreDir = dirSegments.some((s) => s.startsWith("_"));
    const isUnderscorePage = entry.kind === "page" && basename.startsWith("_");
    if (!inUnderscoreDir && !isUnderscorePage) continue;

    reporter.problem({
      file: entry.path,
      line: 1,
      message: isUnderscorePage
        ? `${entry.path} would be published as a page`
        : `${entry.path} would be published from a _-prefixed directory`,
      fixes: ["keep the underscore convention in your exclude set, e.g.: --exclude '_*'"],
    });
  }
}

// ------------------------------------------------------------ A09 advisory

/**
 * §14.3 A09 — a working-format (design-tool) asset is being emitted.
 * Advisory only: the file still ships (advisories never change what is
 * published).
 * @param {SourceEntry[]} entries
 * @param {import('./diagnostics.js').Reporter} reporter
 * @returns {void}
 */
export function workingFormatDiagnostics(entries, reporter) {
  for (const entry of entries) {
    if (entry.kind !== "asset") continue;
    const dot = entry.path.lastIndexOf(".");
    const ext = dot === -1 ? "" : entry.path.slice(dot).toLowerCase();
    if (!WORKING_FORMAT_EXTENSIONS.includes(ext)) continue;
    reporter.advisory({
      file: entry.path,
      message: `${entry.path} is a design working-format file (${ext}) and will not render in a browser`,
    });
  }
}

// ------------------------------------------------------------ A14 advisory

/**
 * §4.2/§14.3 A14 — a known deployment file at the source root that the
 * effective `--exclude` set is holding out of the output. The advisory is
 * the entire mechanism: nothing is exempted from exclusion, the file stays
 * held back, the build still publishes.
 * @param {string[]} excludedRootFiles - basenames of files AT THE SOURCE
 *   ROOT that the caller's exclusion pass held back (the file-classification
 *   step this module does not own — see the module docs)
 * @param {import('./diagnostics.js').Reporter} reporter
 * @returns {void}
 */
export function deploymentFileDiagnostics(excludedRootFiles, reporter) {
  for (const name of excludedRootFiles) {
    if (!KNOWN_DEPLOYMENT_FILES.includes(name)) continue;
    reporter.advisory({
      file: name,
      message: `${name} is a deployment file (Netlify, Cloudflare Pages) and the exclude set keeps it out of the output`,
      fixes: ["replace the default: --exclude '_*.html' --exclude '_*.md' --exclude '_includes' --exclude '_scripts'"],
    });
  }
}
