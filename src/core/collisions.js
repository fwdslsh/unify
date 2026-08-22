/**
 * collisions.js — conformance-spec §13 (output paths and collisions,
 * including A11's case-only advisory and A16's normalization-form one), plus
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
      message: `${sorted.map((g) => g.source.label ?? g.source.path).join(" and ")} both produce ${sorted[0].outputPath}`,
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
    // Keyed on the NFC FORM, not on the literal path.
    //
    // "Equal after lowercasing" is not "differs only by case". `toLowerCase`
    // also collapses the canonical singletons — U+212A KELVIN SIGN → `k`,
    // U+2126 OHM SIGN → `ω`, U+212B ANGSTROM SIGN → `å` — so `Kilo.html`
    // spelled with U+212A and `Kilo.html` spelled with ASCII `K` landed in one
    // A11 group. They are canonically equivalent: one name to a normalizing
    // host, which is row 4 of §13's table and A16's to report. A11 said
    // instead, of two strings that render identically and are both capital K,
    // "Kilo.html and Kilo.html differ only by letter case" — a sentence naming
    // no edit the author could make, which is the defect `escapeNonAscii`
    // exists to prevent, arriving in the other advisory.
    //
    // Collapsing by NFC leaves nothing to name for such a group, and an
    // advisory with an empty right-hand side is not printed — which is how the
    // Kelvin pair reaches A16 and only A16.
    //
    // What this buys is NOT a partition of the groups: A16's key is the
    // coarser, so its group contains this one whenever a name appears in both
    // a second case and a second form, and §13 no longer claims otherwise. It
    // buys the weaker property that is actually true and actually load-bearing
    // — no pair ever draws the WRONG advisory. Every pair this sentence names
    // has equal lowercase and distinct NFC, which is a difference of case and
    // nothing else.
    const others = otherRepresentatives(first, rest, (p) => p.normalize("NFC")).map(escapeNonAscii);
    if (others.length > 0) {
      reporter.advisory({
        file: first.source.path,
        message: `${escapeNonAscii(first.outputPath)} and ${others.join(", ")} differ only by letter case — they collide on case-insensitive hosts`,
      });
    }
  }

  // A16 — distinct exact-path groups that are one name on a host that
  // normalizes. §13's closure argument leaves exactly two host-side foldings
  // once §20.5's address function is known to be injective: letter case,
  // which is A11's above, and Unicode normalization form, which is this.
  //
  // The key folds BOTH, deliberately. macOS — by far the most common
  // normalizing host — folds case and form at once, so `CAFÉ.html` in NFC
  // beside `café.html` in NFD is one file there. Keyed on NFC alone that pair
  // matches neither advisory's key and is reported by nothing: a silent hole
  // on the commonest normalizing host, which is the shape of gap this
  // catalogue exists not to have.
  //
  // This key is COARSER than A11's, so A11's group sits inside this one
  // whenever a name appears in both a second case and a second form — and the
  // guarantee §13 makes is correspondingly weaker than "the two advisories
  // partition the pairs", which was claimed for two rounds and was false. What
  // holds is that no pair draws the WRONG advisory, and the skip below is the
  // whole mechanism: a group that is A11's ENTIRELY is dropped here, and every
  // group that survives holds at least one genuine difference of form.
  //
  // A surviving group is then named IN FULL, not filtered down to the
  // spellings A11 did not mention — see the `others` line below for why no
  // filter can do both jobs at once.
  /** @type {Map<string, string[]>} */
  const byNormalizedPath = new Map();
  for (const outputPath of byExactPath.keys()) {
    const key = outputPath.normalize("NFC").toLowerCase();
    if (!byNormalizedPath.has(key)) byNormalizedPath.set(key, []);
    byNormalizedPath.get(key).push(outputPath);
  }
  for (const paths of byNormalizedPath.values()) {
    if (paths.length < 2) continue;
    // Skip only a group that is A11's ENTIRELY: every member the same after
    // case folding (so A11 groups them all) AND every member a distinct NFC
    // form (so none of them differ by form). Both halves are load-bearing.
    //
    // Asking only "are the lowercase forms identical" claimed the canonical
    // singletons for A11: U+212A KELVIN SIGN lowercases to `k`, so `Kilo.html`
    // spelled with it and with ASCII `K` answered "pure case" — while their
    // NFC forms are equal, which makes them one name in two forms, row 4 of
    // §13's table and this advisory's to report.
    //
    // Asking only "are the NFC forms distinct" skipped the pair this group's
    // combined key exists to catch: `CAFÉ.html` in NFC beside `café.html` in
    // NFD differs in BOTH case and form, so its NFC forms are distinct and its
    // lowercase forms are not identical. macOS folds both at once and sees one
    // file. Skipping it left the commonest normalizing host silently unserved.
    const sameFolded = new Set(paths.map((p) => p.toLowerCase())).size === 1;
    const distinctForms = new Set(paths.map((p) => p.normalize("NFC"))).size === paths.length;
    if (sameFolded && distinctForms) continue; // A11's group, not this one's
    const allEntries = pathOrdered(paths.flatMap((p) => byExactPath.get(p)));
    const [first, ...rest] = allEntries;
    // Keyed on the RAW path: every distinct spelling in the group is named.
    //
    // Folding the key by case collapsed the pair that differs ONLY by form
    // when the two spellings also share a case fold — the Kelvin pair above —
    // and left this sentence with an empty right-hand side. There is no key
    // that both names those two and hides the case pair inside a
    // three-spelling group, because the two demands are opposite: one needs
    // the raw bytes kept, the other needs them folded away.
    //
    // So the group is named in full, and §13 claims what is actually true:
    // each advisory explains ONE host behaviour, no pair ever draws the WRONG
    // one, and a spelling that collides in both ways appears in both sentences
    // because both are true of it.
    const others = otherRepresentatives(first, rest, (p) => p).map(escapeNonAscii).join(", ");
    reporter.advisory({
      file: first.source.path,
      // The sentence is about the GROUP, not about each pair in it. Saying
      // "are one name in two normalization forms" was false as soon as the
      // group held a pure-ASCII case pair beside a canonical singleton:
      // `Kilo.html`, `kilo.html` and `Kilo.html` spelled with U+212A are one
      // file on a host that folds case and form together, but the first two
      // have no normalization relationship with anything, and the sentence
      // asserted one about them. What is true of every member is the folding
      // that merges them, so that is what it now says.
      message: `${escapeNonAscii(first.outputPath)} and ${others} are one name on a host that normalizes Unicode — macOS folds form and case together, so these are one file there`,
    });
  }

  return results;
}

/**
 * The paths a collision advisory names BESIDES the one it is located at: the
 * group's remaining entries in path order, reduced to one representative per
 * `key`, with the key `first` itself answers for already spoken for.
 *
 * Both exclusions repair a sentence that quoted something the author could
 * not act on.
 *
 * Seeding the seen set with `first`'s own key is what stops an output path
 * appearing on both sides of "X and Y". A P12 pair — two sources, one output
 * path — puts two entries in the group carrying that one path, and when the
 * path-ordered first source is one of the pair, deduplicating only the REST
 * left it quoting itself: `About.html and About.html, about.html`, which
 * reads as a rename of a file to its own name.
 *
 * Reducing by `key` rather than by the literal path is A11's other need. Its
 * group is one case-folded form BY CONSTRUCTION, so a literal-path key names
 * every sibling — including one that differs from `first` by normalization
 * form alone, which is not a difference of case and is A16's to report.
 * `Kilo.html` spelled with U+212A KELVIN SIGN and with ASCII `K` lowercase
 * onto the same string, and under a literal key A11 announced "Kilo.html and
 * \u{212a}ilo.html differ only by letter case" — a claim about a pair that
 * differs by no case at all. Under A11's NFC key that sibling collapses onto
 * `first` and the advisory is not printed, which is exactly the outcome
 * wanted: A16 has it.
 *
 * A16 passes the identity key deliberately — it names every distinct spelling
 * (§13). The two advisories' GROUPS nest; only their claims stay apart.
 *
 * @param {OutputEntry} first - the group's path-ordered first entry
 * @param {OutputEntry[]} rest - the remainder, already in path order
 * @param {(outputPath: string) => string} key - the folding this advisory
 *   asks its question under
 * @returns {string[]} representative output paths, path-ordered, unescaped
 */
function otherRepresentatives(first, rest, key) {
  const seen = new Set([key(first.outputPath)]);
  const others = [];
  for (const entry of rest) {
    const folded = key(entry.outputPath);
    if (seen.has(folded)) continue;
    seen.add(folded);
    others.push(entry.outputPath);
  }
  return others;
}

/**
 * Render an output path with every non-ASCII code point as a `\u{XXXX}`
 * escape.
 *
 * A16's two paths print IDENTICALLY in a terminal — that is the entire hazard
 * — so an unescaped message reads `café.html and café.html`, names no edit the
 * author can make, and leaves a reader unable to tell which of the two files
 * to rename. BOTH advisories use it, not just A16: A11's own pair is normally
 * `About.html`/`about.html` and distinguishable on sight, but A11 ranges over
 * arbitrary paths, and a case pair carrying an unrelated non-ASCII segment
 * (`caf\u{00e9}/About.html` beside `caf\u{00e9}/about.html`) has the same
 * hazard in the part of the name the author is NOT being asked to change.
 * The braced form is used rather than the padded
 * four-digit one because it is the only spelling that stays correct above
 * U+FFFF, where iterating by code point would otherwise print a surrogate
 * half as an escape that means something else.
 * @param {string} path
 * @returns {string}
 */
function escapeNonAscii(path) {
  return [...path]
    .map((c) => (c >= " " && c <= "~" ? c : `\\u{${c.codePointAt(0).toString(16).padStart(4, "0")}}`))
    .join("");
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
