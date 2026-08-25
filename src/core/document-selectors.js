/**
 * `document-selectors.js` — the shared interpretation layer over a
 * `{document, analysis}` envelope (implementation-brief §14, "shared
 * semantic selectors" — distinct from conformance-spec §14, the diagnostics
 * reporter that every other bare `§n` in `src/` refers to).
 *
 * A built-in consumer that wants a fact about a page — its canonical, its
 * publication date, whether it is a public destination — asks a selector
 * here rather than re-walking `document.head.meta`/`link` with its own
 * reading of "what counts". The brief's §14.1 rule governs every function
 * below: a selector *computes* an answer from the snapshot/analysis it is
 * given; it never persists that answer back onto the envelope. Two kinds of
 * export live in this one module, on purpose, rather than in two:
 *
 *  - **Value-level cores** (`isoDate`, `parseRobotsValue`, `declaredType`,
 *    `intOrNull`, `classifyCanonicalValue`) — relocated here from their
 *    former homes in `manifest.js`/`sitemap.js`. Those modules no longer
 *    define or export this logic themselves; `sitemap.js` imports
 *    `classifyCanonicalValue` (and the doc-level selectors it needs) from
 *    here directly, and `manifest.js` no longer calls any of these cores at
 *    all — its per-field extraction was deleted along with `PageRecord`.
 *    This module is now the only place the logic is written. Each ports its
 *    cited §20 semantics byte-for-byte from the 0.8 implementation — same
 *    inputs, same outputs, same edge decisions.
 *  - **Doc-level selectors** (`titleOf` through `isPublicDestination`) — the
 *    interpretation layer every built-in consumer now reads a page's facts
 *    through: `manifest.js` (assembling `analysis`/provenance), `audit.js`
 *    (every finding predicate), `canonical.js`, `feed.js`,
 *    `structured-data.js`, `sitemap.js`, `dev-report.js`, `catalog.js`, and
 *    `search-corpus.js`. A selector that needs the page's output path
 *    (`isPublicDestination`) reads it off `envelope.outputPath` — a field
 *    `extractDocument` (`document.js`) does not produce itself but the
 *    `BuildDocument` envelope carries alongside `document`/`analysis`.
 *
 * Snapshot attribute values arrive from `document.js` already
 * character-reference-decoded but untrimmed (its own `attributesOf` never
 * trims). Every doc-level selector below owns its own trimming and
 * emptiness test on top of that — trim, then empty string means "declared
 * nothing" — which is `document.js`'s `nonEmpty`/`orNull` discipline applied
 * to a value that is already decoded. That discipline holds everywhere
 * except `intOrNull` below, ported as a value-level core from a call site
 * that already double-decodes (noted at its own definition) — every other
 * function here decodes a value at most once. Metadata name/property/rel
 * comparisons are per HTML's own rule for a metadata name: the attribute's
 * value, trimmed and lowercased.
 */

import { nonEmpty } from "./document.js";
import { stripBaseUrl, resolveReference } from "./references.js";
import { isSkippedUrl } from "./urls.js";

// ======================================================================
// Value-level cores — relocated verbatim from manifest.js / sitemap.js.
// ======================================================================

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
  // W3C-DTF exactly (§20.10): the literal `T`, and a time-zone designator
  // whenever a time is present. A space separator and a bare local time are
  // the two forms other tools accept and this one must not — each is invalid
  // wherever unify would emit it (a sitemap <lastmod>, a JSON-LD dateModified).
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, tzd] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  if (month < 1 || month > 12 || day < 1) return null;
  // Real calendar day, leap years included: Date.UTC normalizes an overflow
  // (2026-02-30 → March 2), so comparing the parts back is the check.
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  if (hh !== undefined) {
    if (Number(hh) > 23 || Number(mm) > 59) return null;
    if (ss !== undefined && Number(ss) > 59) return null;
    if (tzd !== "Z") {
      const offsetHours = Number(tzd.slice(1, 3));
      const offsetMinutes = Number(tzd.slice(4, 6));
      if (offsetMinutes > 59 || offsetHours * 60 + offsetMinutes > 14 * 60) return null;
    }
  }
  return s; // verbatim, never normalized — reformatting is an edit to content
}

/**
 * §20.6 — the union across every `<meta name="robots">` a page emits, from a
 * single already-joined `raw` string (or `null` for none declared). Splits
 * on comma so `content="noindex, nofollow"` and two separate metas comma-
 * joined by the caller read identically.
 * @param {string|null} raw
 * @returns {{raw: string|null, directives: string[], indexable: boolean, followable: boolean}}
 */
export function parseRobotsValue(raw) {
  if (raw === null) return { raw: null, directives: [], indexable: true, followable: true };
  const directives = raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  return {
    raw,
    directives,
    indexable: !directives.includes("noindex") && !directives.includes("none"),
    followable: !directives.includes("nofollow") && !directives.includes("none"),
  };
}

/**
 * §20.8 — reads a *single object's string* `@type` and nothing else. An
 * array, a `@graph`, a missing `@type`, or a non-string `@type` declares
 * nothing: bounded reading, because guessing which entity of a graph "is"
 * the page is exactly the invented-fact class product-spec §6.1 forbids.
 * @param {any} data
 * @returns {string|null}
 */
export function declaredType(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const t = data["@type"];
  return typeof t === "string" && t.trim() !== "" ? t.trim() : null;
}

/**
 * An integer-valued dimension, or null — never a coercion (§20.3). Bounded at
 * the safe-integer ceiling: a twenty-digit `content` is not a pixel count, and
 * emitting the float it silently becomes would be a value the page never
 * declared.
 *
 * The one function in this module that decodes a value TWICE, and — unlike
 * every doc-level selector above, which owns its own single decode on an
 * already-decoded snapshot value — this is deliberately retained rather
 * than fixed by this batch. `manifest.js` no longer calls this at all; its
 * only caller now is `preferredImageOf` below, which hands it a value
 * `trimmedOrNull`/`firstMetaMatch` already decoded once, so `nonEmpty`'s own
 * decode inside `intOrNull` is a second pass. On an ordinary `content` this
 * is a no-op (decoding is idempotent once no entities remain); it changes
 * behavior only on a double-encoded value (`content="&amp;#54;00"`), which
 * `intOrNull` still resolves to `600` rather than leaving the literal text
 * `&#54;00` unparsed as digits would. That is the 0.8 behavior this port
 * keeps byte-for-byte rather than a new decision made here.
 * @param {unknown} raw
 * @returns {number|null}
 */
export function intOrNull(raw) {
  const v = nonEmpty(raw);
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * §21.2/§24.4 — what does a canonical value name? Four answers, and the
 * fourth is why this is not a boolean.
 *
 *   `none`      — no canonical was declared (`canonical === null`).
 *   `self`      — it resolves to `outputPath`, this page's own output path.
 *   `elsewhere` — it names a different page, demonstrably. Either it resolved
 *                 to another emitted path, or — with `base` supplied — it is
 *                 an `http(s):`/protocol-relative URL that `stripBaseUrl` did
 *                 not strip, which places it on another origin.
 *   `unknown`   — this build cannot say: a `mailto:`, an empty value, or an
 *                 absolute URL with no `base` to compare it against.
 *
 * The core of `sitemap.js`'s `BuildDocument`-shaped `classifyCanonical`,
 * extracted so a caller holding just a value and an output path — a
 * doc-level selector, for instance — does not need a `BuildDocument` to ask
 * the question.
 * @param {string|null} canonical
 * @param {string} outputPath
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {'none'|'self'|'elsewhere'|'unknown'}
 */
export function classifyCanonicalValue(canonical, outputPath, base) {
  if (canonical === null) return "none";

  // ONE owner for "is this URL on this site?" — `stripBaseUrl`, which parses.
  // It returns a path for this site, in every spelling of the address
  // (`HTTPS://EXAMPLE.COM/x`, `https://EXAMPLE.com/x`, `//example.com/x`,
  // `http://example.com/x`, `https://example.com:443/x` are all this page by
  // RFC 3986 §6.2.2.1 and §6.2.3), and the URL untouched for any other host.
  // So a value still carrying an authority HERE is, by that function's own
  // answer, another site.
  //
  // This block used to parse the URL a second time and compare hosts itself.
  // That was written before §12's own comparison was fixed, and mutation
  // testing then showed the two agreeing on every input — a second
  // interpretation of a question §12 already answers, which is the defect
  // product-spec §6.1 exists to forbid rather than a safety net. What is
  // load-bearing is the *classification*: without this line an off-origin
  // canonical reads as `unknown`, and neither finding fires.
  const stripped = base ? stripBaseUrl(canonical, base) : canonical;
  if (base && /^([a-z][a-z0-9+.-]*:)?\/\//i.test(stripped)) return "elsewhere";

  if (isSkippedUrl(stripped)) return "unknown";
  const target = resolveReference(stripped, outputPath);
  if (target === null) return "unknown";
  return target === outputPath ? "self" : "elsewhere";
}

// ======================================================================
// Doc-level selectors — over a `{document, analysis, outputPath?}` envelope.
// ======================================================================

/** Trim a value that is already decoded; empty means "declared nothing". */
function trimmedOrNull(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t === "" ? null : t;
}

/** `""` for a missing/non-string value, else the value untouched (untrimmed). */
function rawOr(s) {
  return typeof s === "string" ? s : "";
}

export function titleOf(doc) {
  return doc.document.head.title;
}

/**
 * The document's `lang`, read from `analysis.langTexts[0]` — every `<html>`
 * element's non-empty `lang`, document-wide, in document order — rather than
 * the snapshot's own `document.html.attributes.lang` (0.9 decision, B3
 * addendum 2). The two usually agree, because `document.html.attributes`
 * already comes from the FIRST `<html>` element (`document.js`'s
 * `findFirst`). They diverge only on a degenerate multi-`<html>` document —
 * reachable through a textual `<include>` of a full document — where the
 * first `<html>` element declares no `lang` but a later one does: the old
 * `record.lang` reading (manifest.js's own `Field` over every `<html>`
 * element it visited) kept the first NON-EMPTY declaration across all of
 * them, not merely the first element's. Reading `langTexts[0]` here
 * reproduces that exact behavior rather than a lookalike that answers "what
 * lang does the first <html> declare" instead of "what lang did this page
 * declare first".
 */
export function langOf(doc) {
  const first = doc.analysis.langTexts[0];
  return typeof first === "string" ? first : null;
}

/**
 * The `content` of every head `<meta>` whose `name` matches (trimmed and
 * lowercased on both sides), in document order. An entry with no `content`
 * attribute contributes `""`. No filtering of empty values happens here —
 * the caller decides what an empty declaration means.
 * @param {{document: import('./document.js').DocumentSnapshot}} doc
 * @param {string} name
 * @returns {string[]}
 */
export function metaValues(doc, name) {
  const target = name.trim().toLowerCase();
  const out = [];
  for (const m of doc.document.head.meta) {
    if ((m.name ?? "").trim().toLowerCase() === target) out.push(rawOr(m.content));
  }
  return out;
}

/** Same as `metaValues`, matched on `property=` instead of `name=`. */
export function propertyValues(doc, property) {
  const target = property.trim().toLowerCase();
  const out = [];
  for (const m of doc.document.head.meta) {
    if ((m.property ?? "").trim().toLowerCase() === target) out.push(rawOr(m.content));
  }
  return out;
}

/**
 * Head `<link>` entries whose `rel` token list (whitespace-split, trimmed,
 * lowercased) contains `rel`, in document order.
 */
export function linksWithRel(doc, rel) {
  const target = rel.trim().toLowerCase();
  return doc.document.head.link.filter((l) =>
    rawOr(l.rel).trim().toLowerCase().split(/\s+/).includes(target));
}

/** First non-empty (trimmed) `<meta name="description">` content, else null. */
export function descriptionOf(doc) {
  for (const v of metaValues(doc, "description")) {
    const t = trimmedOrNull(v);
    if (t !== null) return t;
  }
  return null;
}

/** First non-empty (trimmed) `<meta name="author">` content, else null. */
export function authorOf(doc) {
  for (const v of metaValues(doc, "author")) {
    const t = trimmedOrNull(v);
    if (t !== null) return t;
  }
  return null;
}

/** First `rel~=canonical` link with a non-empty trimmed `href`, else null. */
export function canonicalOf(doc) {
  for (const link of linksWithRel(doc, "canonical")) {
    const t = trimmedOrNull(link.href);
    if (t !== null) return t;
  }
  return null;
}

/**
 * §20.6's union across every `<meta name="robots">` a page declares: the
 * non-empty trimmed contents, in document order, comma-joined and read
 * through `parseRobotsValue` — the same shape and the same result as
 * today's `record.robots`.
 */
export function robotsPolicyOf(doc) {
  const values = metaValues(doc, "robots").map(trimmedOrNull).filter((v) => v !== null);
  return parseRobotsValue(values.length === 0 ? null : values.join(", "));
}

/** The unresolved refresh reading — target resolution stays a manifest second pass. */
export function refreshOf(doc) {
  return doc.analysis.refresh;
}

/**
 * The first non-empty declaration, in head order, whose meta matches one of
 * `predicate`'s two spellings — the shared engine `publicationDatesOf`
 * builds its `published`/`modified` halves from.
 */
function firstMetaMatch(doc, predicate) {
  for (const m of doc.document.head.meta) {
    if (!predicate(m)) continue;
    const t = trimmedOrNull(m.content);
    if (t !== null) return t;
  }
  return null;
}

// `manifest.js`'s own extraction was one exclusive `if`/`else if` chain over
// `name`/`property`: a single `<meta>` fills exactly one role, the first
// branch it matches, in this order. Every `name` branch is checked before
// every `property` branch — `description`/`author`/`robots`/`schema`/
// `date`/`lastmod`/`twitter:image` come first, in that order, then
// `article:published_time`/`article:modified_time`/`og:image`/
// `og:image:width`/`og:image:height`. A tag that carries BOTH a matched
// `name` and a matched `property` — real, dual-spelled markup
// (`<meta name="description" property="og:image" content="…">`) — therefore
// plays only its `name` role, never its `property` role too (B3 addendum 1:
// the earlier version of this function covered only the eight image/date
// roles, so a contrived dual-axis meta like that one still drifted from the
// old chain — it read as `og:image` here while the old chain had already
// claimed it for `description` and never added it to `ogImage` at all).
// `publicationDatesOf`/`preferredImageOf` read `name` and `property` as
// independent axes per meta; without this full ordering a dual-spelled tag
// could count toward a role the old chain never gave it. `descriptionOf`/
// `authorOf`/`robotsPolicyOf`/`declaredTypes`'s `metaValues(doc, "schema")`
// reading do not need to route through `metaRole` themselves: each reads a
// `name`-only role that is checked before every `property` branch, so
// filtering by `name` alone already agrees with what `metaRole` would say —
// nothing with a matching property could ever preempt a `name` match this
// early in the chain. (`tags`/`categories` branches do not exist in 0.9 —
// arbitrary metadata is inert by design, per §12 of the release brief.)
const META_ROLE_ORDER = [
  "description", "author", "robots", "schema", "date", "lastmod", "twitter:image",
  "article:published_time", "article:modified_time",
  "og:image", "og:image:width", "og:image:height",
];

/** This meta's one role among `META_ROLE_ORDER`, by manifest.js's own precedence, or null. */
function metaRole(m) {
  const name = (m.name ?? "").trim().toLowerCase();
  const property = (m.property ?? "").trim().toLowerCase();
  if (name === "description") return "description";
  if (name === "author") return "author";
  if (name === "robots") return "robots";
  if (name === "schema") return "schema";
  if (name === "date") return "date";
  if (name === "lastmod") return "lastmod";
  if (name === "twitter:image") return "twitter:image";
  if (property === "article:published_time") return "article:published_time";
  if (property === "article:modified_time") return "article:modified_time";
  if (property === "og:image") return "og:image";
  if (property === "og:image:width") return "og:image:width";
  if (property === "og:image:height") return "og:image:height";
  return null;
}

/**
 * `{published, modified}`, each `{raw, iso}` or `null`. `published` reads
 * `<meta name="date">` and `<meta property="article:published_time">`;
 * `modified` reads `name="lastmod"` and `property="article:modified_time"`.
 * The first non-empty declaration wins across BOTH spellings in head order —
 * the snapshot's `head.meta` array already preserves document order, so a
 * single pass over it reproduces today's single-pass first-wins. A meta that
 * matches one spelling by `name` and another by `property` plays only its
 * `name` role (`metaRole`), matching `manifest.js`'s exclusive chain.
 */
export function publicationDatesOf(doc) {
  const publishedRaw = firstMetaMatch(doc, (m) => {
    const role = metaRole(m);
    return role === "date" || role === "article:published_time";
  });
  const modifiedRaw = firstMetaMatch(doc, (m) => {
    const role = metaRole(m);
    return role === "lastmod" || role === "article:modified_time";
  });
  return {
    published: publishedRaw === null ? null : { raw: publishedRaw, iso: isoDate(publishedRaw) },
    modified: modifiedRaw === null ? null : { raw: modifiedRaw, iso: isoDate(modifiedRaw) },
  };
}

/**
 * `{url, width, height, fromOg}`, or null when neither spelling declares an
 * image. `og:image` wins over `twitter:image` AS SPELLINGS — not a
 * document-order race between them — with first-wins within each spelling. A
 * meta that matches `og:image` by `property` and ALSO matches `twitter:image`
 * by `name` plays only its `name` role (`metaRole`), matching
 * `manifest.js`'s exclusive chain. Dimensions come from
 * `og:image:width`/`og:image:height` only when the url came from `og:image`:
 * they describe THAT image, and attaching them to a `twitter:image` would
 * report a size the page never claimed for that file.
 */
export function preferredImageOf(doc) {
  const ogImage = firstMetaMatch(doc, (m) => metaRole(m) === "og:image");
  const twitterImage = firstMetaMatch(doc, (m) => metaRole(m) === "twitter:image");
  const fromOg = ogImage !== null;
  const url = fromOg ? ogImage : twitterImage;
  if (url === null) return null;
  const width = fromOg ? intOrNull(firstMetaMatch(doc, (m) => metaRole(m) === "og:image:width")) : null;
  const height = fromOg ? intOrNull(firstMetaMatch(doc, (m) => metaRole(m) === "og:image:height")) : null;
  return { url, width, height, fromOg };
}

/**
 * Every accepted structured-data declaration, in this order: non-empty
 * `<meta name="schema">` contents in head order, THEN `declaredType` of
 * every `analysis.jsonLd` entry (document order) that yields one.
 *
 * **Ordering note (0.9 decision):** the retired `schemaType` interleaved the
 * two sources by document position and kept only the first; `declaredTypes`
 * lists every meta declaration before every JSON-LD one. No 0.9 consumer
 * depends on a single winner — membership and findings use set-inclusion —
 * and the spec rewrite states this order as the new rule.
 */
export function declaredTypes(doc) {
  const metaTypes = metaValues(doc, "schema").map(trimmedOrNull).filter((v) => v !== null);
  const jsonLdTypes = doc.analysis.jsonLd.map((entry) => declaredType(entry.data)).filter((t) => t !== null);
  return [...metaTypes, ...jsonLdTypes];
}

/** §20.4's first-wins/conflict rule over a list of accepted declarations, in order. */
function conflictFor(field, values) {
  if (values.length < 2) return null;
  const kept = values[0];
  const discarded = values.slice(1).filter((v) => v !== kept);
  return discarded.length ? { field, kept, discarded } : null;
}

/**
 * `[{field, kept, discarded}]` for exactly the fields §24.4's
 * `metadata-conflict` renders: `canonical` (every accepted canonical href),
 * `description` (every non-empty description content), `title` (every
 * accepted `analysis.titleTexts` entry), `lang` (every non-empty `lang` from
 * every `<html>` element, document-wide — `analysis.langTexts`). A single
 * `<html>` element carries one `lang` attribute, but the snapshot's
 * `document.html.attributes` — what `langOf` reads — keeps only the FIRST
 * `<html>` element (`document.js`'s `findFirst`); a second `<html>` element
 * (reachable through a textual `<include>` of a full document) is invisible
 * to `langOf` but not to `analysis.langTexts`, which is why `lang` is read
 * from there rather than from `langOf`. Ordered by field name.
 */
export function metadataConflicts(doc) {
  const canonicalValues = linksWithRel(doc, "canonical").map((l) => trimmedOrNull(l.href)).filter((v) => v !== null);
  const descriptionValues = metaValues(doc, "description").map(trimmedOrNull).filter((v) => v !== null);
  const titleValues = doc.analysis.titleTexts;
  const langValues = doc.analysis.langTexts;
  return [
    conflictFor("title", titleValues),
    conflictFor("lang", langValues),
    conflictFor("canonical", canonicalValues),
    conflictFor("description", descriptionValues),
  ]
    .filter((c) => c !== null)
    .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
}

/**
 * Today's `isCompletablePage` predicate, moved onto the new model: is this
 * page one the site presents as a destination in its own right? Indexable,
 * not the site's root 404 document, and its canonical either declares
 * nothing or demonstrably names this page.
 * @param {{document: import('./document.js').DocumentSnapshot, analysis: import('./document.js').DocumentAnalysis, outputPath: string}} doc
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {boolean}
 */
export function isPublicDestination(doc, base) {
  if (!robotsPolicyOf(doc).indexable) return false;
  if (doc.outputPath === "404.html") return false;
  const kind = classifyCanonicalValue(canonicalOf(doc), doc.outputPath, base);
  return kind === "none" || kind === "self";
}
