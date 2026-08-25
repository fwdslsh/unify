/**
 * `manifest.js` — conformance-spec §20, the final-output document manifest.
 *
 * One `BuildDocument` per composed page, derived from the bytes §15 is about
 * to publish. This module is the build's single semantic reading of the
 * site: sitemap generation, canonical completion, robots consistency,
 * structured-data checks, feeds, search output, and every audit finding read
 * these documents and none of them re-parses a page. Product-spec §6.2
 * states the architectural law this file exists to enforce — "there is one
 * shared interpretation of a page's URL and metadata, not separate sitemap,
 * feed, and audit implementations that can disagree" — so a consumer that
 * wants a fact about a page reads it off the document through a shared
 * selector (`document-selectors.js`) rather than adding a field here.
 *
 * `BuildDocument` is deliberately a THIN ENVELOPE, not a semantic page
 * schema (release-brief §7): the extraction and interpretation work lives in
 * `document.js` (one document-order pass over the final emitted HTML,
 * producing a bounded `DocumentSnapshot` plus a private `DocumentAnalysis`)
 * and `document-selectors.js` (the one interpretation layer every built-in
 * consumer reads through). This module's own job is narrow: call
 * `extractDocument` once per page, attach the provenance facts that do not
 * exist in HTML at all (source path, generated-source status, layout
 * provenance, output file path), and run the one second pass that needs
 * every document to exist first — the link graph (§20.9) and the resolved
 * redirect target (§20.11), both relations over the WHOLE manifest rather
 * than facts about one document.
 *
 * Two properties are load-bearing and easy to lose in a later edit:
 *
 *  1. **It reads emitted text, never source.** Frontmatter, layouts, and
 *     include targets are all already spent by the time this runs (§20.2).
 *     That is what makes HTML and Markdown equal citizens: a Markdown page's
 *     title is visible here only because §10.2 put it in the emitted
 *     `<head>`, exactly as an HTML author would have written it. Reaching
 *     back to a source file for a value would reintroduce the two-readings
 *     bug this module exists to prevent.
 *
 *  2. **It observes; it never reports.** Deriving the manifest emits no
 *     diagnostic, writes no file, and cannot change an exit code (§20.2).
 *     A page's several differing declarations of one field are not recorded
 *     as stored data here (the 0.9 model removed the `conflicts` array): a
 *     consumer that needs to know asks `document-selectors.js`'s
 *     `metadataConflicts(doc)`, which computes the answer from the snapshot
 *     it is given rather than reading it off a field this module wrote.
 *
 * `path`/`url` deliberately delegate to `publish.js`'s `urlForOutputPath` —
 * the function §17's dry-run report already prints with — so a URL a
 * consumer emits and a URL the report shows cannot drift apart (§20.5).
 */

import { extractDocument } from "./document.js";
import { decodeEntities } from "./entities.js";
import { urlForOutputPath } from "./publish.js";
import { isSkippedUrl, splitUrl } from "./urls.js";
import { stripBaseUrl, resolveReference } from "./references.js";

/**
 * @typedef {object} BuildDocument
 * @property {object} source - provenance facts that do not exist in the
 *   emitted bytes at all
 * @property {string} source.path - source-root-relative path
 * @property {boolean} source.generated - §33.4 — true when the page came
 *   from the `--generate` overlay rather than the source tree
 * @property {string|null} source.layout - §20.3 — the source-root-relative
 *   path of the layout this page composed with, `null` when it composed
 *   with none
 * @property {string} outputPath
 * @property {import('./document.js').DocumentSnapshot} document
 * @property {object} analysis - `extractDocument`'s own `DocumentAnalysis`,
 *   minus `rawHrefs` (consumed below, never surviving on the final envelope
 *   — the same rule that deleted `_hrefs` in the 0.8 model), plus this
 *   module's own second pass: `linksOut`/`linksIn`/`fragmentLinks` (§20.9,
 *   resolved against the whole manifest) and `refresh` resolved to
 *   `{raw, seconds, url, target}` (§20.11).
 */

/** A fragment is percent-encoded like any URL part; an undecodable one stays verbatim. */
function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Extract one page's own envelope — everything except `analysis.linksIn`,
 * which is a relation over the whole manifest and so is filled by
 * `buildManifest` once every document exists (§20.9), and
 * `analysis.refresh.target`, resolved in that same second pass (§20.11).
 *
 * `analysis.rawHrefs` and the unresolved `refresh` reading ride along as
 * underscore-prefixed fields on the draft — exactly as `_hrefs`/`_refresh`
 * did on the 0.8 `PageRecord` — and are deleted once `buildManifest`'s
 * second pass consumes them, so neither survives onto the final envelope.
 * @param {{sourcePath: string, outputPath: string, html: string, generated?: boolean, layout?: string|null}} page
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {BuildDocument & {_rawHrefs: string[], _refreshRaw: import('./document.js').RefreshReading|null}}
 */
function extract(page, base) {
  // §20.5's percent-encoding happens inside `urlForOutputPath` — the one
  // function the dry-run report shares — so this cannot drift from what the
  // report prints or from what a projection emits.
  const prefix = base ? base.pathPrefix : "/";
  const path = urlForOutputPath(page.outputPath, prefix);
  const url = base ? base.origin + path : null;

  const { document, analysis } = extractDocument(page.html, { path, url });
  const { rawHrefs, refresh: refreshRaw, ...analysisRest } = analysis;

  return {
    // §33.4 — true when this page came from the --generate overlay rather
    // than the source tree. §20.3: present on every document, boolean always.
    source: {
      path: page.sourcePath,
      generated: page.generated === true,
      // §20.3 — the layout this page composed with, or `null` when it
      // composed with none. The one other field, with `generated`, that is
      // PROVENANCE rather than a reading of the emitted text: composition
      // consumed `data-layout` (§6.4), so the emitted bytes carry no trace
      // of which layout produced them, or of whether one did.
      layout: page.layout ?? null,
    },
    outputPath: page.outputPath,
    document,
    analysis: {
      ...analysisRest,
      // §20.11's `target` is a lookup in a manifest that does not exist yet,
      // so the raw reading rides on the draft (`_refreshRaw`) and is
      // resolved in `buildManifest`'s second pass, exactly as `linksOut`/
      // `linksIn`/`fragmentLinks` are.
      linksOut: [],
      linksIn: [],
      fragmentLinks: [],
      refresh: null,
    },
    _rawHrefs: rawHrefs,
    _refreshRaw: refreshRaw,
  };
}

/**
 * §20.11 — turn one draft's raw refresh reading into the envelope's field.
 * @param {BuildDocument & {_refreshRaw: import('./document.js').RefreshReading|null}} doc
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @param {Map<string, BuildDocument>} byOutputPath
 * @returns {{raw:string, seconds:number, url:string|null, target:string|null}|null}
 */
function resolveRefresh(doc, base, byOutputPath) {
  const raw = doc._refreshRaw;
  if (!raw) return null;
  let target = null;
  if (!raw.hasSecondPart) {
    // `content="5"` names THIS page — the same loop written shorter (§24.4).
    target = doc.outputPath;
  } else if (raw.url !== null) {
    const url = decodeEntities(raw.url);
    const stripped = base ? stripBaseUrl(url, base) : url;
    const resolved = resolveReference(stripped, doc.outputPath);
    if (resolved !== null && byOutputPath.has(resolved)) target = resolved;
  }
  // Everything else stays null, including a second part §12 declined to read:
  // `content="0; /gone.html"` declares a redirect SOMEWHERE, and calling it a
  // self-redirect would make §24.4 report a loop the page does not contain.
  return { raw: raw.raw, seconds: raw.seconds, url: raw.url, target };
}

/**
 * §20 — derive the final-output document manifest.
 *
 * @param {object} args
 * @param {{sourcePath: string, outputPath: string, html: string}[]} args.pages
 *   every composed page and its emitted text — exactly the set §12 checks and
 *   §15 publishes as HTML (§20.1). Assets, fragments, excluded sources, and
 *   pages that failed to compose are not passed and get no document.
 * @param {import('./urls.js').BaseUrlConfig|null} [args.base]
 * @returns {{documents: BuildDocument[], byOutputPath: Map<string, BuildDocument>, byPublicPath: Map<string, BuildDocument>}}
 */
export function buildManifest({ pages, base = null }) {
  const ordered = [...pages].sort((a, b) =>
    a.outputPath < b.outputPath ? -1 : a.outputPath > b.outputPath ? 1 : 0);
  const drafts = ordered.map((p) => extract(p, base));
  // First document wins a duplicated output path. Two sources resolving to
  // one path is P12 and blocks publish, so this branch only ever feeds a
  // build that is already failing — but "which document" must still be a
  // function of the input rather than of iteration order, or a diagnostic
  // could differ between runs of the same tree.
  const byOutputPath = new Map();
  for (const doc of drafts) if (!byOutputPath.has(doc.outputPath)) byOutputPath.set(doc.outputPath, doc);

  // §20.9 — the link graph, second pass: a link participates only when it
  // names a page that HAS a document, which is knowable only now.
  for (const doc of drafts) {
    const out = new Set();
    /** @type {Map<string, {target: string, id: string}>} deduplicated by target#id */
    const fragments = new Map();
    for (const raw of doc._rawHrefs) {
      // REF-08: a reference is the attribute's VALUE, so character references
      // resolve before anything reads it. `#caf&eacute;` is the correct HTML
      // spelling of `#café` and must match an element whose `id` is `café` —
      // and `document.js`'s `ids` reading already decodes, via `nonEmpty`.
      // Reading the bytes here while decoding there made the two halves of
      // one comparison disagree, and `fragment-missing` reported a link that
      // works in every browser.
      const href = decodeEntities(raw);
      const stripped = base ? stripBaseUrl(href, base) : href;
      const { path, fragment } = splitUrl(stripped);
      // A fragment-only link names an id on THIS page. It has to be read before
      // `isSkippedUrl`, which classifies `#a` as skipped — correctly for §12,
      // whose question is "does this reach a file", and wrongly for this one,
      // whose question is "does this reach an id".
      if (path === "" && fragment.length > 1 && !/^[a-z][a-z0-9+.-]*:/i.test(stripped)) {
        const id = decodeURIComponentSafe(fragment.slice(1));
        fragments.set(`${doc.outputPath}#${id}`, { target: doc.outputPath, id });
        continue;
      }
      if (isSkippedUrl(stripped)) continue;
      if (path === "") continue; // query-only: not a navigation
      // `resolveReference` percent-decodes (REF-08), so a link written in the
      // spelling §20.5 publishes — `/two%20words.html` — joins the graph like
      // the raw form. Both name the same page; the graph must not depend on
      // which one the author typed.
      const resolved = resolveReference(stripped, doc.outputPath);
      if (resolved !== null && byOutputPath.has(resolved)) {
        out.add(resolved);
        if (fragment.length > 1) {
          const id = decodeURIComponentSafe(fragment.slice(1));
          fragments.set(`${resolved}#${id}`, { target: resolved, id });
        }
      }
    }
    // §20.11 — the redirect's target, resolved exactly the way `linksOut`
    // resolves a link: the same `stripBaseUrl` + `resolveReference` pair, so a
    // redirect and an <a href> to one page can never name two different documents.
    doc.analysis.refresh = resolveRefresh(doc, base, byOutputPath);
    delete doc._refreshRaw;
    doc.analysis.linksOut = [...out].sort();
    doc.analysis.fragmentLinks = [...fragments.values()].sort((a, b) =>
      a.target === b.target ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.target < b.target ? -1 : 1);
    delete doc._rawHrefs;
  }
  for (const doc of drafts) {
    for (const target of doc.analysis.linksOut) byOutputPath.get(target).analysis.linksIn.push(doc.outputPath);
  }
  for (const doc of drafts) doc.analysis.linksIn = [...new Set(doc.analysis.linksIn)].sort();

  // `byPublicPath` keys on `document.path` — the final public root-relative
  // path (§20.5), unlike `byOutputPath`'s filesystem-shaped key. First
  // document wins a collision here too, for the same reason as above.
  const byPublicPath = new Map();
  for (const doc of drafts) if (!byPublicPath.has(doc.document.path)) byPublicPath.set(doc.document.path, doc);

  return { documents: drafts, byOutputPath, byPublicPath };
}
