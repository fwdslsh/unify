/**
 * `page-map.js` — conformance-spec §27.6, the page map `unify dev` serves at
 * `/_unify/pages.json` and nothing else.
 *
 * It exists for editors. An editor previewing a source file needs to know
 * which served address shows that file composed, and that is a fact only the
 * build knows: the output path §13 chose, §11's address for it, and the layout
 * §6 resolved. The report at `/_unify/` (§27.3) already has every one of those
 * from the §20 manifest, so this is one more projection of the same payload —
 * the one `build.js` hands over at the end of the build that produced it — and
 * never a second reading of the site (§27.3, product-spec §6.2). This module
 * imports no filesystem API, opens no file and parses no markup.
 *
 * It is the one machine-readable answer the development server gives, so it
 * carries a `schemaVersion` like the other machine-readable artifacts (§31.1,
 * §33.2) and the same promise: a field keeps its meaning or the version moves.
 */

export const PAGE_MAP_SCHEMA_VERSION = 1;

/**
 * @param {object} args
 * @param {string} args.sourceRoot - absolute path of the source root
 * @param {object[]} args.documents - the §20 manifest's documents (empty before the first build)
 * @param {boolean} args.built - whether any build has completed
 * @returns {string} two-space-indented JSON with a trailing newline
 */
export function renderPageMap({ sourceRoot, documents, built }) {
  const pages = documents.map((doc) => ({
    // Source-root-relative for an authored page; relative to the generator's
    // overlay (§33) for a generated one, which `generated` marks.
    source: doc.source.path,
    generated: doc.source.generated,
    // The layout the page composed with, source-root-relative, or null (§20.3).
    layout: doc.source.layout,
    // Where the page landed under the output directory, and the path the
    // server (and the site) answers for it — `/about/` under --pretty-urls.
    outputPath: doc.outputPath,
    path: doc.document.path,
    // Absolute only under --base-url, exactly as the manifest has it.
    url: doc.document.url,
  }));
  return `${JSON.stringify({ schemaVersion: PAGE_MAP_SCHEMA_VERSION, built, sourceRoot, pages }, null, 2)}\n`;
}
