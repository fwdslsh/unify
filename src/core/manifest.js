/**
 * `manifest.js` — conformance-spec §20, the final-output page manifest.
 *
 * One record per composed page, derived from the bytes §15 is about to
 * publish. This module is the build's single semantic reading of the site:
 * sitemap generation, canonical completion, robots consistency,
 * structured-data checks, feeds, search output, and every audit finding read
 * these records and none of them re-parses a page. Product-spec §6.2 states
 * the architectural law this file exists to enforce — "there is one shared
 * interpretation of a page's URL and metadata, not separate sitemap, feed,
 * and audit implementations that can disagree" — so a consumer that wants a
 * fact about a page adds a field here rather than a second extractor there.
 *
 * Two properties are load-bearing and easy to lose in a later edit:
 *
 *  1. **It reads emitted text, never source.** Frontmatter, layouts, and
 *     include targets are all already spent by the time this runs (§20.2).
 *     That is what makes HTML and Markdown equal citizens: a Markdown page's
 *     `title` is visible here only because §10.2 put it in the emitted
 *     `<head>`, exactly as an HTML author would have written it. Reaching
 *     back to a source file for a value would reintroduce the two-readings
 *     bug this module exists to prevent.
 *
 *  2. **It observes; it never reports.** Deriving the manifest emits no
 *     diagnostic, writes no file, and cannot change an exit code (§20.2).
 *     Conflicting declarations are recorded as *data* on the record
 *     (§20.4) because §14.2's problem list and §14.3's advisory catalogue
 *     are both closed and ordinary `build` is not where content quality is
 *     judged (product-spec §6.1). The evaluation command renders them.
 *
 * `path`/`url` deliberately delegate to `publish.js`'s `urlForOutputPath` —
 * the function §17's dry-run report already prints with — so a URL a
 * consumer emits and a URL the report shows cannot drift apart (§20.5).
 */

import { decodeEntities } from "./entities.js";
import { nonEmpty, orNull, readText, textContent } from "./document.js";
import { declaredType, intOrNull, isoDate, parseRobotsValue } from "./document-selectors.js";
import { findAll, findFirst, getAttr, innerText, isElement, isInside, isJsonLdScript, parse } from "./html.js";
import { urlForOutputPath } from "./publish.js";
import { isSkippedUrl, parseRefreshMeta, splitUrl } from "./urls.js";
import { stripBaseUrl, resolveReference } from "./references.js";

// `isoDate` now lives in document-selectors.js (batch B2); re-exported here
// so existing importers (tests/unit/core/manifest.test.js among them) keep
// resolving it from this module until the B3 model swap moves them over.
export { isoDate };

/**
 * @typedef {object} DateValue
 * @property {string} raw - the declared value, exactly as emitted
 * @property {string|null} iso - the same value when it is a W3C date/date-time, else null
 *
 * @typedef {object} ImageValue
 * @property {string} url
 * @property {number|null} width
 * @property {number|null} height
 * @property {boolean} fromOg - true when og:image supplied the url, false when
 *   twitter:image did; §20.3 reads the dimensions only in the first case, so a
 *   consumer reporting their absence needs to know which page it is looking at
 *
 * @typedef {object} RobotsValue
 * @property {string|null} raw
 * @property {string[]} directives
 * @property {boolean} indexable
 * @property {boolean} followable
 *
 * @typedef {object} RefreshValue
 * @property {string} raw - the `content` value exactly as emitted
 * @property {number} seconds - the declared delay; 0 is no delay at all (§24.4)
 * @property {string|null} url - §12's grammar's URL part, null when it reads none
 * @property {string|null} target - the output path this redirect names, when it
 *   names a page in this manifest; null for external, unresolvable, and for a
 *   second part §12's grammar does not read (§20.11 — never folded into "self")
 *
 * @typedef {object} JsonLdEntry
 * @property {string} raw - the script's text content, verbatim
 * @property {any} data - the parsed value, or null when parsing failed
 * @property {string|null} error - the parser's message when parsing failed
 *
 * @typedef {object} Conflict
 * @property {string} field
 * @property {string} kept
 * @property {string[]} discarded
 *
 * @typedef {object} PageRecord
 * @property {string} sourcePath
 * @property {boolean} generated - §33.4 — true when the page came from the
 *   `--generate` overlay rather than the source tree
 * @property {string|null} layout - §20.3 — the source-root-relative path of
 *   the layout this page composed with, `null` when it composed with none
 * @property {string} outputPath
 * @property {string} path
 * @property {string|null} url
 * @property {string|null} title
 * @property {string|null} description
 * @property {string|null} lang
 * @property {string|null} canonical
 * @property {RobotsValue} robots
 * @property {RefreshValue|null} refresh
 * @property {string|null} h1
 * @property {{level:number, text:string, id:string|null}[]} headings
 * @property {string} text
 * @property {ImageValue|null} image
 * @property {string|null} author
 * @property {DateValue|null} datePublished
 * @property {DateValue|null} dateModified
 * @property {string|null} schemaType
 * @property {string[]} taxonomyKeys - §20.3/§28.2 — the sorted subset of the
 *   closed set {tags, categories} the emitted head declares as `<meta name>`;
 *   `[]` for a page declaring neither
 * @property {JsonLdEntry[]} jsonLd
 * @property {string[]} linksOut
 * @property {string[]} linksIn
 * @property {{tag: string, key: string|null}[]} strayMetadata - one entry per
 *   document-metadata element emitted outside <head> on a page that has one (§20.3)
 * @property {string[]} ids - every id the page declares, document order, repeats kept
 * @property {{target:string, id:string}[]} fragmentLinks - one entry per distinct
 *   internal link carrying a fragment: the output path it names and the id it asks for
 * @property {Conflict[]} conflicts
 */

/** A fragment is percent-encoded like any URL part; an undecodable one stays verbatim. */
function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** A `{raw, iso}` date value, or null when nothing was declared (§20.3). */
function dateValue(raw) {
  const value = nonEmpty(raw);
  return value === null ? null : { raw: value, iso: isoDate(value) };
}

/**
 * §20.4's single-valued-field collector. Push every accepted declaration in
 * document order; `resolve()` keeps the first and reports the differing
 * discards. Identical repeats lose nothing, so they are not conflicts.
 */
class Field {
  constructor() { /** @type {string[]} */ this.values = []; }
  /** @param {string|null} v */
  add(v) { if (v !== null && v !== undefined) this.values.push(v); }
  get kept() { return this.values.length ? this.values[0] : null; }
  /** @returns {Conflict|null} */
  conflict(field) {
    if (this.values.length < 2) return null;
    const kept = this.values[0];
    const discarded = this.values.slice(1).filter((v) => v !== kept);
    return discarded.length ? { field, kept, discarded } : null;
  }
}

/**
 * §20.6 — parse `<meta name="robots">` and nothing else. `robots.txt` is
 * never read here: a disallowed path is not a `noindex` page, and product-spec
 * §6.7 names conflating the two as the SEO folklore this specification most
 * deliberately refuses. A crawler-specific meta (`googlebot`) is likewise not
 * page policy.
 * @param {string|null} raw
 * @returns {RobotsValue}
 */
function parseRobots(values) {
  // §20.6 — the union across every `<meta name="robots">` the page emits.
  // `raw` keeps all of them, comma-joined in document order, because the
  // report has to quote what the page actually says; the directives and the
  // two booleans are computed from the whole set.
  const raw = values.length === 0 ? null : values.join(", ");
  return parseRobotsValue(raw);
}

/**
 * Extract one record's own fields — everything except `linksIn`, which is a
 * relation over the whole manifest and so is filled by `buildManifest` once
 * every record exists (§20.9).
 * @param {{sourcePath: string, outputPath: string, html: string, generated?: boolean, layout?: string|null}} page
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {PageRecord & {_hrefs: string[]}}
 */
function extract(page, base) {
  const { html } = page;
  const { root } = parse(html);

  const title = new Field();
  const description = new Field();
  const lang = new Field();
  const canonical = new Field();
  /** @type {(string|null)[]} every `<meta name="robots">` value, in document order (§20.6). */
  const robotsAll = [];
  const author = new Field();
  const published = new Field();
  const modified = new Field();
  const schemaType = new Field();
  /**
   * §20.3/§28.2 — the closed set {tags, categories}, as a SET of key names
   * rather than a `Field` of values: what this records is which of the two the
   * page declares, never what they say. The set is closed because a growable
   * list of "names other generators use" is the unbounded reservation
   * product-spec §6.3.9 refuses.
   *
   * A declaration with empty `content` counts, and that is the same rule §28.1
   * states for its own half of the section: the key is the declaration, and no
   * value is parsed. `tags:` with nothing after it emits `<meta name="tags"
   * content="">`, and the author who wrote it believed just as firmly in a
   * collection as the one who listed three terms.
   */
  const taxonomyKeys = new Set();
  const ogImage = new Field();
  const twitterImage = new Field();
  const ogWidth = new Field();
  const ogHeight = new Field();
  const refreshRaw = new Field();
  /** @type {ReturnType<typeof parseRefreshMeta>} the first declaration (§20.4). */
  let refreshFirst = null;

  /** @type {JsonLdEntry[]} */
  const jsonLd = [];
  /** @type {{level:number, text:string, id:string|null}[]} */
  const headings = [];
  /** @type {string[]} */
  const hrefs = [];
  /** @type {string[]} */
  const ids = [];

  // §20.3 — document metadata is read from `<head>`, because that is where a
  // consumer reads it. A page with NO head element is read whole: a browser
  // synthesises one and moves leading metadata into it, and this parser does
  // not implement HTML tree construction, so it cannot place that boundary —
  // reporting every field missing on a document a browser reads fine would be
  // the worse error of the two.
  const hasHead = findFirst(root, (n) => isElement(n, "head")) !== null;
  /** @type {{tag: string, key: string|null}[]} */
  const strayMetadata = [];

  // One document-order pass. `findAll` already refuses to descend into
  // `<template>` (§20.2), which is why every collector below can trust that
  // what it sees is markup the shipped page actually declares.
  for (const node of findAll(root, (n) => n.type === "element")) {
    const tag = node.tag.toLowerCase();
    const inHead = !hasHead || isInside(node, "head");
    // Every id, in document order, repeats kept — §20.3. Repeats are the point:
    // "this page declares one id twice" is only answerable if they survive.
    const idAttr = nonEmpty(getAttr(node, "id"));
    if (idAttr !== null) ids.push(idAttr);
    if (tag === "html") {
      lang.add(nonEmpty(getAttr(node, "lang")));
    } else if (tag === "title") {
      if (inHead) title.add(orNull(readText(innerText(html, node))));
      else strayMetadata.push({ tag: "title", key: null });
    } else if (tag === "base") {
      if (!inHead) strayMetadata.push({ tag: "base", key: null });
    } else if (tag === "meta") {
      const name = (getAttr(node, "name") ?? "").trim().toLowerCase();
      const property = (getAttr(node, "property") ?? "").trim().toLowerCase();
      const content = getAttr(node, "content");
      // §20.11 — read document-wide, and this placement is the whole decision:
      // head-scoped, a redirect written outside the head is invisible to §24,
      // and a redirect nobody checks is the silent failure §12 and §24 exist to
      // remove. It therefore has to be read BEFORE the head early-return below.
      const refresh = parseRefreshMeta(node);
      if (refresh !== null) {
        refreshRaw.add(nonEmpty(getAttr(node, "content")));
        if (refreshFirst === null) refreshFirst = refresh;
      }
      if (!inHead) {
        // §24.4's closed set: the metas whose only valid position is the head.
        // `itemprop` and every other spelling does its job in the body and is
        // not reported — this is a list of what is *inert* there, not of what
        // unify happens to read.
        //
        // `schema` is unify's own key (§26.4) and belongs here for the same
        // reason spelled one register in: it is read with the head (§20.3), so
        // in the body it reaches neither a consumer nor §26.6's generator. Left
        // out, the one key whose whole purpose is to switch generation on was
        // also the only head-only meta whose misplacement nothing reported —
        // no block, no problem, no finding — which is exactly the silence
        // §26.4 argues its own closed value list from.
        const key = getAttr(node, "charset") !== null ? "charset"
          : name === "description" || name === "robots" || name === "schema" || name.startsWith("twitter:") ? name
          : property.startsWith("og:") ? property
          : null;
        if (key !== null) strayMetadata.push({ tag: "meta", key });
        continue;
      }
      if (name === "description") description.add(nonEmpty(content));
      else if (name === "author") author.add(nonEmpty(content));
      // Every robots meta, not the first: a crawler reads the union of the
      // directives across all of them, and splitting `noindex, nofollow`
      // across two tags is a documented spelling of one policy.
      else if (name === "robots") robotsAll.push(nonEmpty(content));
      else if (name === "schema") schemaType.add(nonEmpty(content));
      // Head-scoped by sitting below the `!inHead` return above, like every
      // other document-metadata reading here (§20.3): a `<meta name="tags">` in
      // the body declares nothing to anybody, so it implies no collection
      // either. `name` is already trimmed and lowercased, which is how HTML
      // defines metadata names and how every other row of this chain reads one.
      else if (name === "tags" || name === "categories") taxonomyKeys.add(name);
      else if (name === "date") published.add(nonEmpty(content));
      else if (name === "lastmod") modified.add(nonEmpty(content));
      else if (name === "twitter:image") twitterImage.add(nonEmpty(content));
      else if (property === "article:published_time") published.add(nonEmpty(content));
      else if (property === "article:modified_time") modified.add(nonEmpty(content));
      else if (property === "og:image") ogImage.add(nonEmpty(content));
      else if (property === "og:image:width") ogWidth.add(nonEmpty(content));
      else if (property === "og:image:height") ogHeight.add(nonEmpty(content));
    } else if (tag === "link") {
      const rel = (getAttr(node, "rel") ?? "").trim().toLowerCase().split(/\s+/);
      if (!rel.includes("canonical")) {
        // Every other rel — stylesheet, preload, icon — is legal in the body
        // and does its job there. Only canonical is inert outside the head.
      } else if (inHead) {
        canonical.add(nonEmpty(getAttr(node, "href")));
      } else {
        strayMetadata.push({ tag: "link", key: "canonical" });
      }
    } else if (tag === "script" && isJsonLdScript(node)) {
      const raw = innerText(html, node);
      let data = null;
      let error = null;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        error = err.message;
      }
      jsonLd.push({ raw, data, error });
      const declared = declaredType(data);
      if (declared !== null) schemaType.add(declared);
    } else if (/^h[1-6]$/.test(tag)) {
      headings.push({
        level: Number(tag.slice(1)),
        text: textContent(node),
        id: nonEmpty(getAttr(node, "id")),
      });
    } else if (tag === "a") {
      const href = getAttr(node, "href");
      if (typeof href === "string") hrefs.push(href);
    }
  }

  // §20.7 — the first <main>, else <body>, else the whole document.
  const main = findFirst(root, (n) => isElement(n, "main"));
  const body = main ?? findFirst(root, (n) => isElement(n, "body"));
  const textHost = body ?? root;

  // §20.3/§20.4 — og:image wins over twitter:image whichever came first in the
  // document; the fallback is between *spellings*, not a document-order race.
  // Dimensions are read only when og:image supplied the url: og:image:width
  // describes the og image, and attaching it to a twitter:image would report a
  // size the page never claimed for that file.
  const fromOg = ogImage.kept !== null;
  const imageUrl = ogImage.kept ?? twitterImage.kept;

  const conflicts = [
    author.conflict("author"),
    canonical.conflict("canonical"),
    modified.conflict("dateModified"),
    published.conflict("datePublished"),
    description.conflict("description"),
    (ogImage.values.length ? ogImage : twitterImage).conflict("image"),
    lang.conflict("lang"),
    // §20.4 calls itself total, so a new single-valued field is listed here as
    // DATA. §24.4's metadata-conflict deliberately does not render it: that
    // subset's criterion is a spec-stated at-most-one rule, and unify asserts
    // only that the manifest reads the first.
    refreshRaw.conflict("refresh"),
    schemaType.conflict("schemaType"),
    title.conflict("title"),
  ].filter(Boolean).sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));

  const prefix = base ? base.pathPrefix : "/";
  // §20.5's percent-encoding happens inside `urlForOutputPath` — the one
  // function the dry-run report shares — so this cannot drift from what the
  // report prints or from what a projection emits.
  const path = urlForOutputPath(page.outputPath, prefix);

  return {
    sourcePath: page.sourcePath,
    // §33.4 — true when this page came from the --generate overlay rather
    // than the source tree. §20.3: present on every record, boolean always.
    generated: page.generated === true,
    // §20.3 — the layout this page composed with, or `null` when it composed
    // with none. The one other field, with `generated`, that is PROVENANCE
    // rather than a reading of the emitted text: composition consumed
    // `data-layout` (§6.4), so the emitted bytes carry no trace of which
    // layout produced them, or of whether one did. §20.3 states the carve-out
    // and why a consumer needs the fact — the short version is that advice
    // naming "the layout" is unactionable on a page that has none.
    layout: page.layout ?? null,
    outputPath: page.outputPath,
    path,
    url: base ? base.origin + path : null,
    title: title.kept,
    description: description.kept,
    lang: lang.kept,
    canonical: canonical.kept,
    robots: parseRobots(robotsAll.filter((v) => v !== null)),
    // `orNull`, never `nonEmpty`: this text came from `textContent`, which
    // already resolved references. Decoding it again reports a string the page
    // does not contain and makes `h1` disagree with `headings[0].text`.
    h1: orNull(headings.find((h) => h.level === 1)?.text ?? null),
    headings,
    text: textContent(textHost),
    image: imageUrl === null
      ? null
      : {
          url: imageUrl,
          fromOg,
          width: fromOg ? intOrNull(ogWidth.kept) : null,
          height: fromOg ? intOrNull(ogHeight.kept) : null,
        },
    author: author.kept,
    datePublished: dateValue(published.kept),
    dateModified: dateValue(modified.kept),
    schemaType: schemaType.kept,
    // Sorted here, once, so §28.2's "in sorted order" is a property of the
    // record every consumer reads rather than something each one re-derives.
    taxonomyKeys: [...taxonomyKeys].sort(),
    jsonLd,
    ids,
    strayMetadata,
    linksOut: [],
    linksIn: [],
    fragmentLinks: [],
    conflicts,
    // §20.11's `target` is a lookup in a manifest that does not exist yet, so
    // the raw reading rides on the draft the way `_hrefs` does and is resolved
    // in `buildManifest`'s second pass.
    refresh: null,
    _refresh: refreshFirst,
    _hrefs: hrefs,
  };
}

/**
 * §20.11 — turn one draft's raw refresh reading into the record's field.
 * @param {PageRecord & {_refresh: any}} rec
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @param {Map<string, PageRecord>} byOutputPath
 * @returns {RefreshValue|null}
 */
function resolveRefresh(rec, base, byOutputPath) {
  const raw = rec._refresh;
  if (!raw) return null;
  let target = null;
  if (!raw.hasSecondPart) {
    // `content="5"` names THIS page — the same loop written shorter (§24.4).
    target = rec.outputPath;
  } else if (raw.url !== null) {
    const url = decodeEntities(raw.url);
    const stripped = base ? stripBaseUrl(url, base) : url;
    const resolved = resolveReference(stripped, rec.outputPath);
    if (resolved !== null && byOutputPath.has(resolved)) target = resolved;
  }
  // Everything else stays null, including a second part §12 declined to read:
  // `content="0; /gone.html"` declares a redirect SOMEWHERE, and calling it a
  // self-redirect would make §24.4 report a loop the page does not contain.
  return { raw: raw.raw, seconds: raw.seconds, url: raw.url, target };
}

/**
 * §20 — derive the final-output page manifest.
 *
 * @param {object} args
 * @param {{sourcePath: string, outputPath: string, html: string}[]} args.pages
 *   every composed page and its emitted text — exactly the set §12 checks and
 *   §15 publishes as HTML (§20.1). Assets, fragments, excluded sources, and
 *   pages that failed to compose are not passed and get no record.
 * @param {import('./urls.js').BaseUrlConfig|null} [args.base]
 * @returns {{records: PageRecord[], byOutputPath: Map<string, PageRecord>}}
 */
export function buildManifest({ pages, base = null }) {
  const ordered = [...pages].sort((a, b) =>
    a.outputPath < b.outputPath ? -1 : a.outputPath > b.outputPath ? 1 : 0);
  const drafts = ordered.map((p) => extract(p, base));
  // First record wins a duplicated output path. Two sources resolving to one
  // path is P12 and blocks publish, so this branch only ever feeds a build
  // that is already failing — but "which record" must still be a function of
  // the input rather than of iteration order, or a diagnostic could differ
  // between runs of the same tree.
  const byOutputPath = new Map();
  for (const rec of drafts) if (!byOutputPath.has(rec.outputPath)) byOutputPath.set(rec.outputPath, rec);

  // §20.9 — the link graph, second pass: a link participates only when it
  // names a page that HAS a record, which is knowable only now.
  for (const rec of drafts) {
    const out = new Set();
    /** @type {Map<string, {target: string, id: string}>} deduplicated by target#id */
    const fragments = new Map();
    for (const raw of rec._hrefs) {
      // REF-08: a reference is the attribute's VALUE, so character references
      // resolve before anything reads it. `#caf&eacute;` is the correct HTML
      // spelling of `#café` and must match an element whose `id` is `café` —
      // and `ids` above already decodes, via `nonEmpty`. Reading the bytes here
      // while decoding there made the two halves of one comparison disagree,
      // and `fragment-missing` reported a link that works in every browser.
      const href = decodeEntities(raw);
      const stripped = base ? stripBaseUrl(href, base) : href;
      const { path, fragment } = splitUrl(stripped);
      // A fragment-only link names an id on THIS page. It has to be read before
      // `isSkippedUrl`, which classifies `#a` as skipped — correctly for §12,
      // whose question is "does this reach a file", and wrongly for this one,
      // whose question is "does this reach an id".
      if (path === "" && fragment.length > 1 && !/^[a-z][a-z0-9+.-]*:/i.test(stripped)) {
        const id = decodeURIComponentSafe(fragment.slice(1));
        fragments.set(`${rec.outputPath}#${id}`, { target: rec.outputPath, id });
        continue;
      }
      if (isSkippedUrl(stripped)) continue;
      if (path === "") continue; // query-only: not a navigation
      // `resolveReference` percent-decodes (REF-08), so a link written in the
      // spelling §20.5 publishes — `/two%20words.html` — joins the graph like
      // the raw form. Both name the same page; the graph must not depend on
      // which one the author typed.
      const resolved = resolveReference(stripped, rec.outputPath);
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
    // redirect and an <a href> to one page can never name two different records.
    rec.refresh = resolveRefresh(rec, base, byOutputPath);
    delete rec._refresh;
    rec.linksOut = [...out].sort();
    rec.fragmentLinks = [...fragments.values()].sort((a, b) =>
      a.target === b.target ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.target < b.target ? -1 : 1);
    delete rec._hrefs;
  }
  for (const rec of drafts) {
    for (const target of rec.linksOut) byOutputPath.get(target).linksIn.push(rec.outputPath);
  }
  for (const rec of drafts) rec.linksIn = [...new Set(rec.linksIn)].sort();

  return { records: drafts, byOutputPath };
}
