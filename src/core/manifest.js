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

import { getAttr, isElement, findAll, findFirst, innerText, parse } from "./html.js";
import { urlForOutputPath } from "./publish.js";
import { isSkippedUrl, splitUrl } from "./urls.js";
import { stripBaseUrl, resolveReference } from "./references.js";

/**
 * @typedef {object} DateValue
 * @property {string} raw - the declared value, exactly as emitted
 * @property {string|null} iso - the same value when it is a W3C date/date-time, else null
 *
 * @typedef {object} ImageValue
 * @property {string} url
 * @property {number|null} width
 * @property {number|null} height
 *
 * @typedef {object} RobotsValue
 * @property {string|null} raw
 * @property {string[]} directives
 * @property {boolean} indexable
 * @property {boolean} followable
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
 * @property {string} outputPath
 * @property {string} path
 * @property {string|null} url
 * @property {string|null} title
 * @property {string|null} description
 * @property {string|null} lang
 * @property {string|null} canonical
 * @property {RobotsValue} robots
 * @property {string|null} h1
 * @property {{level:number, text:string, id:string|null}[]} headings
 * @property {string} text
 * @property {ImageValue|null} image
 * @property {string|null} author
 * @property {DateValue|null} datePublished
 * @property {DateValue|null} dateModified
 * @property {string|null} schemaType
 * @property {JsonLdEntry[]} jsonLd
 * @property {string[]} linksOut
 * @property {string[]} linksIn
 * @property {Conflict[]} conflicts
 */

/** Subtrees whose characters are not visible page text (§20.3). */
const INVISIBLE = new Set(["script", "style", "template", "noscript"]);

/**
 * §20.3's closed inline set: leaving one of these contributes no separator;
 * leaving any other element contributes one space. Without the separator
 * `<p>a</p><p>b</p>` reads as `ab`; with an unconditional one `a <em>b</em>!`
 * reads as `a b !`. `<br>` is absent on purpose — it separates lines, so it
 * separates words.
 */
const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "i", "img",
  "kbd", "mark", "q", "rp", "rt", "ruby", "s", "samp", "small", "span", "strong",
  "sub", "sup", "time", "u", "var", "wbr",
]);

/**
 * §20.3's text-content rule: the character data of `el` and its descendants
 * with `INVISIBLE` subtrees omitted, whitespace runs collapsed to one space,
 * and the result trimmed. Comments contribute nothing.
 *
 * Implemented over the parser's node tree rather than by stripping tags from
 * a raw slice, because the raw slice would keep the contents of a `<script>`
 * — which is exactly the "visible text" mistake that makes duplicate-content
 * detection report two pages as identical when only their inline analytics
 * snippet is.
 * @param {string} text - the whole emitted document
 * @param {import('./html.js').Node} el
 * @returns {string}
 */
function textContent(text, el) {
  let out = "";
  const visit = (node) => {
    if (node.type === "text") { out += node.data; return; }
    if (node.type !== "element" && node.type !== "root") return;
    const tag = node.type === "element" ? node.tag.toLowerCase() : "";
    if (INVISIBLE.has(tag)) return;
    for (const child of node.children ?? []) visit(child);
    if (node.type === "element" && !INLINE.has(tag)) out += " ";
  };
  for (const child of el.children ?? []) visit(child);
  return collapse(out);
}

/** Collapse every run of ASCII whitespace to one space and trim (§20.3). */
function collapse(s) {
  return s.replace(/[ \t\n\r\f]+/g, " ").trim();
}

/** `""` and whitespace-only both mean "declared nothing" (§20.3). */
function nonEmpty(s) {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * §6.3.6's date rule, isolated so no consumer re-implements it: a value is a
 * date only when it is written as a W3C/ISO 8601 date or date-time AND names
 * a real calendar day. Everything else is `null` — the build clock, the
 * filesystem, the filename, and Git history are not fallbacks and are never
 * consulted anywhere in this module.
 * @param {unknown} raw
 * @returns {string|null} the trimmed value when valid, else null
 */
export function isoDate(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  if (month < 1 || month > 12 || day < 1) return null;
  // Real calendar day, leap years included: Date.UTC normalizes an overflow
  // (2026-02-30 → March 2), so comparing the parts back is the check.
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  if (hh !== undefined && (Number(hh) > 23 || Number(mm) > 59 || (ss !== undefined && Number(ss) > 60))) return null;
  return s;
}

/** A `{raw, iso}` date value, or null when nothing was declared (§20.3). */
function dateValue(raw) {
  const value = nonEmpty(raw);
  return value === null ? null : { raw: value, iso: isoDate(value) };
}

/** An integer-valued dimension, or null — never a coercion (§20.3). */
function intOrNull(raw) {
  const v = nonEmpty(raw);
  return v !== null && /^\d+$/.test(v) ? Number(v) : null;
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
function parseRobots(raw) {
  if (raw === null) return { raw: null, directives: [], indexable: true, followable: true };
  const directives = raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  return {
    raw,
    directives,
    indexable: !directives.includes("noindex") && !directives.includes("none"),
    followable: !directives.includes("nofollow") && !directives.includes("none"),
  };
}

/** True for `<script type="application/ld+json">`, case- and parameter-tolerant. */
function isJsonLdScript(el) {
  if (!isElement(el, "script")) return false;
  const type = getAttr(el, "type");
  return typeof type === "string" && type.trim().toLowerCase().split(";")[0] === "application/ld+json";
}

/**
 * §20.8 — `schemaType` reads a *single object's string* `@type` and nothing
 * else. An array, a `@graph`, a missing `@type`, or a non-string `@type`
 * declares nothing: bounded reading, because guessing which entity of a graph
 * "is" the page is exactly the invented-fact class product-spec §6.1 forbids.
 * @param {any} data
 * @returns {string|null}
 */
function declaredType(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const t = data["@type"];
  return typeof t === "string" && t.trim() !== "" ? t.trim() : null;
}

/**
 * Extract one record's own fields — everything except `linksIn`, which is a
 * relation over the whole manifest and so is filled by `buildManifest` once
 * every record exists (§20.9).
 * @param {{sourcePath: string, outputPath: string, html: string}} page
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
  const robotsRaw = new Field();
  const author = new Field();
  const published = new Field();
  const modified = new Field();
  const schemaType = new Field();
  const ogImage = new Field();
  const twitterImage = new Field();
  const ogWidth = new Field();
  const ogHeight = new Field();

  /** @type {JsonLdEntry[]} */
  const jsonLd = [];
  /** @type {{level:number, text:string, id:string|null}[]} */
  const headings = [];
  /** @type {string[]} */
  const hrefs = [];

  // One document-order pass. `findAll` already refuses to descend into
  // `<template>` (§20.2), which is why every collector below can trust that
  // what it sees is markup the shipped page actually declares.
  for (const node of findAll(root, (n) => n.type === "element")) {
    const tag = node.tag.toLowerCase();
    if (tag === "html") {
      lang.add(nonEmpty(getAttr(node, "lang")));
    } else if (tag === "title") {
      title.add(nonEmpty(collapse(innerText(html, node))));
    } else if (tag === "meta") {
      const name = (getAttr(node, "name") ?? "").trim().toLowerCase();
      const property = (getAttr(node, "property") ?? "").trim().toLowerCase();
      const content = getAttr(node, "content");
      if (name === "description") description.add(nonEmpty(content));
      else if (name === "author") author.add(nonEmpty(content));
      else if (name === "robots") robotsRaw.add(nonEmpty(content));
      else if (name === "schema") schemaType.add(nonEmpty(content));
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
      if (rel.includes("canonical")) canonical.add(nonEmpty(getAttr(node, "href")));
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
        text: textContent(html, node),
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

  // §20.3 — og:image wins over twitter:image whichever came first in the
  // document; the fallback is between *spellings*, not a document-order race.
  const imageUrl = ogImage.kept ?? twitterImage.kept;

  const conflicts = [
    author.conflict("author"),
    canonical.conflict("canonical"),
    modified.conflict("dateModified"),
    published.conflict("datePublished"),
    description.conflict("description"),
    (ogImage.values.length ? ogImage : twitterImage).conflict("image"),
    lang.conflict("lang"),
    robotsRaw.conflict("robots"),
    schemaType.conflict("schemaType"),
    title.conflict("title"),
  ].filter(Boolean).sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));

  const prefix = base ? base.pathPrefix : "/";
  const path = urlForOutputPath(page.outputPath, prefix);

  return {
    sourcePath: page.sourcePath,
    outputPath: page.outputPath,
    path,
    url: base ? base.origin + path : null,
    title: title.kept,
    description: description.kept,
    lang: lang.kept,
    canonical: canonical.kept,
    robots: parseRobots(robotsRaw.kept),
    h1: headings.find((h) => h.level === 1)?.text ?? null,
    headings,
    text: textContent(html, textHost),
    image: imageUrl === null ? null : { url: imageUrl, width: intOrNull(ogWidth.kept), height: intOrNull(ogHeight.kept) },
    author: author.kept,
    datePublished: dateValue(published.kept),
    dateModified: dateValue(modified.kept),
    schemaType: schemaType.kept,
    jsonLd,
    linksOut: [],
    linksIn: [],
    conflicts,
    _hrefs: hrefs,
  };
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
  const byOutputPath = new Map(drafts.map((r) => [r.outputPath, r]));

  // §20.9 — the link graph, second pass: a link participates only when it
  // names a page that HAS a record, which is knowable only now.
  for (const rec of drafts) {
    const out = new Set();
    for (const href of rec._hrefs) {
      const stripped = base ? stripBaseUrl(href, base) : href;
      if (isSkippedUrl(stripped)) continue;
      const { path } = splitUrl(stripped);
      if (path === "") continue; // query/fragment-only: not a navigation
      const resolved = resolveReference(stripped, rec.outputPath);
      if (resolved !== null && byOutputPath.has(resolved)) out.add(resolved);
    }
    rec.linksOut = [...out].sort();
    delete rec._hrefs;
  }
  for (const rec of drafts) {
    for (const target of rec.linksOut) byOutputPath.get(target).linksIn.push(rec.outputPath);
  }
  for (const rec of drafts) rec.linksIn = [...new Set(rec.linksIn)].sort();

  return { records: drafts, byOutputPath };
}
