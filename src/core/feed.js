/**
 * `feed.js` — conformance-spec §29, feed generation.
 *
 * The manifest's third projection, and — in §29's own words — "the first
 * whose membership an author states in the page rather than in a flag": a
 * page opts itself in by declaring `schema: Article` or `schema:
 * BlogPosting` (§20.8), and `generateFeed` reads that declaration off
 * `documents` (through the shared `declaredTypes` selector) the same way
 * every other consumer reads it. No query, no
 * `posts/` convention, no ordering key, no way to scope a feed to some pages
 * — product-spec §6.6 rejects a collections DSL by name, and this file is
 * what the rejection buys: a membership rule an author can check by reading
 * one page, at the cost of a scoped feed waiting for demonstrated demand.
 *
 * Membership reuses `classifyCanonical`/`isSelfCanonical` from sitemap.js
 * rather than re-deciding "which page does this URL name" a third time —
 * the one-interpretation law product-spec §6.1 states for URLs. What it does
 * NOT reuse is `isPublicDestination`: §21.2's sitemap predicate excludes
 * `404.html` and carries no declared-type condition; §29.4's list is the
 * opposite on both counts (no 404 exclusion — the list is closed at four
 * conditions and does not name one — but a firm declared-type gate). Sharing
 * the whole predicate would have imported an exclusion §29.4 never asked for
 * and dropped one it requires, silently, the moment the two lists diverged.
 *
 * Four refusals are contract here, matching sitemap.js's own list one
 * artifact over:
 *
 *   - No invented instant. RFC 4287 §4.1.2/§3.3 requires `atom:updated` on
 *     every entry as a full date-time WITH AN OFFSET, and a bare `date:
 *     2026-01-02` names a day, not one. Appending `T00:00:00Z` invents
 *     midnight UTC — the WRONG calendar day for every reader west of
 *     Greenwich, a feed telling the world the wrong publication date from a
 *     value the author wrote correctly — and reaching for the build clock
 *     is the same invention product-spec §6.1 forbids by name and §20.10
 *     forbids again. So a page whose only fault is a time-less
 *     `datePublished` is excluded from `entriesFor` AND explained once,
 *     here, as advisory A17 — the one exclusion in this file that draws a
 *     diagnostic, because it is the one an author is likely to read as a bug
 *     rather than a choice (§29.3). The other three membership conditions
 *     (declared type, indexable, self-canonical) are the author's own
 *     deliberate signal and stay silent, exactly as they do in sitemap.js —
 *     there is no "this page is noindex, so it is not in the feed" advisory,
 *     because a noindex page not appearing in a syndication feed is not a
 *     fact anyone needs explained.
 *   - No date ever falls back to the build clock, filesystem, filename, or
 *     Git. Repeated from sitemap.js's own list because it is worth repeating
 *     at the one call site tempted to manufacture a TIME rather than a whole
 *     date: `<updated>`/`<published>` are read from `iso` and nothing else.
 *   - Nothing is ever overwritten. An authored `feed.xml` suppresses
 *     generation outright (§29.7, reusing §21.5's rule verbatim, unchanged)
 *     — the blog template's own generator writes one
 *     (src/templates/blog.js), which makes this the fixture that proves the
 *     suppression rather than a hypothetical.
 *   - `--feed-full` is the one place this module reads more than `records`.
 *     Atom's `<content type="html">` needs the emitted `<main>`'s inner
 *     MARKUP, and the manifest never carries markup — §20.3's fields are
 *     text and metadata, deliberately (§20.2's "not a second interpretation"
 *     rule is about FACTS, not about the bytes a fact was read from). Every
 *     fact used here — which page, whether it is an entry, its title, its
 *     dates, its id — still comes from `records`; `--feed-full` additionally
 *     copies bytes the SAME emitted document already contains, taken from
 *     the identical subtree §20.7 reads `text` from, with no rewriting
 *     applied (§29.6): "URLs left exactly as they were emitted."
 *
 * `<entry><id>` is `canonicalOf(doc)` when the page declares one, else
 * `doc.document.url` (§29.5) — an author's own bytes, preserved exactly as
 * §20.5 preserves them everywhere else, XML-escaped for well-formedness and
 * NOT additionally percent-re-encoded: `doc.document.url` is
 * unify-CONSTRUCTED and already carries §20.5's percent-encoding by the time
 * it reaches this file, and re-encoding `canonicalOf(doc)` would edit bytes
 * that are the author's, not unify's — the same "a URL unify constructs is
 * percent-encoded; a URL the author wrote is preserved" law §20.5 states
 * once for the whole build.
 */

import { findAll, findFirst, getAttr, innerText, isElement, parse } from "./html.js";
import { isSkippedUrl, splitUrl } from "./urls.js";
import { stripBaseUrl, resolveReference } from "./references.js";
import { CHECK_SPELLING } from "./diagnostics.js";
import { decodeXmlEntities } from "./entities.js";
import { isSelfCanonical } from "./sitemap.js";
import { authorOf, canonicalOf, declaredTypes, descriptionOf, publicationDatesOf, robotsPolicyOf, titleOf } from "./document-selectors.js";

/** The output path of the site's feed (§29.2). Atom, never RSS — see the module comment. */
export const FEED_PATH = "feed.xml";

const ATOM_XMLNS = "http://www.w3.org/2005/Atom";
const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** §20.8/§29.1/§29.4 condition 1 — the two schema.org types a feed entry may declare. */
const FEED_TYPES = new Set(["Article", "BlogPosting"]);

/** §20.10's bare-date form — the ONE accepted W3C-DTF grammar line with no `T`. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** XML text escaping — every one of the five, because a URL or a title may carry any of them. */
function xmlEscape(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * The inverse, for reading `<id>`/`href` values back out of an emitted feed.
 * XML's own five predefined entities plus numeric references — NOT the HTML
 * 4.01 table the manifest reads pages with (see sitemap.js's identical
 * `xmlUnescape`, and its own comment on why the two tables must not merge).
 */
const xmlUnescape = decodeXmlEntities;

/**
 * `<![CDATA[value]]>` carries `value`; anything else returns `null`.
 * Duplicated from sitemap.js's own `unwrapCdata` rather than imported/shared
 * — five lines, not worth a third module depending on it for a helper this
 * small (see sitemap.js's own local `xmlEscape` for the identical call).
 */
function unwrapCdata(inner) {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(inner);
  return m ? m[1] : null;
}

/**
 * §29.3 — does this W3C-DTF value carry a time? The grammar has exactly one
 * form that does not (`YYYY-MM-DD`), so "not that form" is "has a time" for
 * any value that has already passed `isoDate` (manifest.js) — which every
 * `.iso` this module reads has, by construction.
 * @param {string} iso
 * @returns {boolean}
 */
function hasTime(iso) {
  return !DATE_ONLY_RE.test(iso);
}

/**
 * §29.1's second activation clause / §29.4 condition 1 — a page that DECLARES
 * the right type, independent of every other question (indexable,
 * self-canonical, dated). Exported because it is also the whole test §29.1
 * asks of the SITE ("at least one page declares Article or BlogPosting") —
 * `documents.some(isFeedCandidate)` — so the activation question and the
 * per-page question are answered by one function, never two.
 *
 * **0.9 widening (release-brief §21.3/§13):** the retired `schemaType` was a
 * single scalar — the FIRST accepted declaration a page made, meta-before-
 * JSON-LD (§20.8's old rule) — so a page whose JSON-LD declared `WebPage`
 * first and `Article` second was never a candidate. `declaredTypes(doc)`
 * returns every accepted declaration, and membership is now *any* of them
 * matching: a page carrying `Organization` alongside `Article` JSON-LD, or
 * `WebPage` before `Article`, is an article. §29's own spec section states
 * this widening and why.
 * @param {import('./manifest.js').BuildDocument} doc
 * @returns {boolean}
 */
export function isFeedCandidate(doc) {
  return declaredTypes(doc).some((t) => FEED_TYPES.has(t));
}

/**
 * §29.4 conditions 1-3 — everything but the date. Factored out so
 * `isFeedEntry` (needs 1-3 AND 4) and the A17 test below (needs 1-3 AND
 * "4 fails in exactly this way") share one reading rather than drifting: a
 * `noindex` or off-canonical page must never draw the date advisory, because
 * indexability and canonicalization are the author's own deliberate signal
 * and only the date condition gets a diagnostic (see the module comment).
 * @param {import('./manifest.js').BuildDocument} doc
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {boolean}
 */
function passesNonDateConditions(doc, base) {
  return isFeedCandidate(doc) && robotsPolicyOf(doc).indexable && isSelfCanonical(doc, base);
}

/**
 * §29.4 in full — every page that belongs in the feed.
 * @param {import('./manifest.js').BuildDocument} doc
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {boolean}
 */
export function isFeedEntry(doc, base) {
  if (!passesNonDateConditions(doc, base)) return false;
  const dp = publicationDatesOf(doc).published;
  return dp !== null && dp.iso !== null && hasTime(dp.iso);
}

/**
 * §29.3/A17 — a record that clears conditions 1-3 and fails condition 4 for
 * the ONE explainable reason: a well-formed ISO date with no time. A record
 * with no `datePublished` at all, or one whose raw value is not even valid
 * W3C-DTF (`iso` null), is excluded SILENTLY here — the first is
 * `schema-incomplete`'s question (§24.4) and the second is `date-unusable`'s
 * (§26.3), and "one question keeps one owner" (§29.3's own words) means this
 * module says nothing about either.
 * @param {import('./manifest.js').BuildDocument} doc
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {boolean}
 */
function isDateOnlyCandidate(doc, base) {
  if (!passesNonDateConditions(doc, base)) return false;
  const dp = publicationDatesOf(doc).published;
  return dp !== null && dp.iso !== null && !hasTime(dp.iso);
}

/**
 * §29.4 — the feed entries for a manifest, ordered. Pure: no reporter, no
 * side effect, mirroring sitemap.js's own `entriesFor` exactly. The A17
 * advisory is a SEPARATE function (`reportDateOnlyEntries`, below) for the
 * same reason sitemap.js keeps its P22 reporting out of its own `entriesFor`
 * — membership is one question, and "does the build need to say something
 * about this" is another.
 * @param {import('./manifest.js').BuildDocument[]} documents
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {import('./manifest.js').BuildDocument[]}
 */
export function entriesFor(documents, base) {
  const out = documents.filter((d) => isFeedEntry(d, base));
  // §29.4 — datePublished DESCENDING. Every entry's `iso` carries a time by
  // construction (the membership test above), so it names one real instant;
  // comparing the STRINGS would be wrong the moment two entries disagree on
  // offset (`...T23:00:00-05:00` sorts before `...T01:00:00Z` as text even
  // though it names a LATER instant, 04:00 UTC against 01:00 UTC) — so this
  // parses each into a timestamp and compares those. Ties (the same instant,
  // not merely the same string) break on output path ascending, so two
  // builds of the same tree produce byte-identical feeds.
  out.sort((a, b) => {
    const ta = Date.parse(publicationDatesOf(a).published.iso);
    const tb = Date.parse(publicationDatesOf(b).published.iso);
    if (ta !== tb) return tb - ta;
    return a.outputPath < b.outputPath ? -1 : 1;
  });
  return out;
}

/**
 * §29.3 — advisory A17 for every date-only candidate. Called only once
 * `generateFeed` has already confirmed a feed is actually being written
 * (see its own comment): the message says "this page is not in feed.xml",
 * which is a claim about a file this build is producing, not a hypothetical
 * about one it might have.
 * @param {import('./manifest.js').BuildDocument[]} documents
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @param {import('./diagnostics.js').Reporter} reporter
 */
export function reportDateOnlyEntries(documents, base, reporter) {
  for (const doc of documents) {
    if (!isDateOnlyCandidate(doc, base)) continue;
    const published = publicationDatesOf(doc).published;
    reporter.advisory({
      file: doc.source.path,
      message: `date is "${published.raw}", which names a day rather than an instant — this page is not in ${FEED_PATH}`,
      fixes: [dateOnlyFix(published)],
    });
  }
}

/**
 * The fix line for A17, spelled for the source kind the same way P23 spells
 * its own two-forms fix (§26.4): a Markdown page's date lives in
 * frontmatter, an HTML page's in a `<meta>`. The sample value reuses the
 * page's own date rather than inventing an unrelated one, so the diagnostic
 * reads as "add a time to what you wrote" and not "here is a new date".
 * @param {{raw: string, iso: string}} published - `publicationDatesOf(doc).published`
 * @returns {string}
 */
function dateOnlyFix(published) {
  // Names the VALUE to change rather than an element to add, because adding
  // one does not work. §20.3 reads `datePublished` from EITHER
  // `article:published_time` or `<meta name="date">`, and §20.4 keeps the
  // FIRST declaration in document order — so a page that declared the second
  // and was told to write the first gained a tag, kept the old value, and
  // watched the advisory fire again. The author's own string is the one thing
  // guaranteed to be present and greppable, whichever spelling carries it and
  // whether it came from frontmatter or from markup.
  const sample = `${published.iso}T09:00:00Z`;
  return `give the date a time and a time zone — "${published.raw}" becomes "${sample}"`;
}

/**
 * §29.5 — `<entry><updated>`: `dateModified.iso` when it carries a time,
 * else `datePublished.iso`. Safe to read unconditionally for any document
 * `entriesFor` returned: membership guarantees `datePublished.iso` is
 * non-null and carries a time, so the fallback always has somewhere to land.
 * @param {import('./manifest.js').BuildDocument} doc
 * @returns {string}
 */
function entryUpdated(doc) {
  const { published, modified } = publicationDatesOf(doc);
  if (modified !== null && modified.iso !== null && hasTime(modified.iso)) return modified.iso;
  return published.iso;
}

/**
 * §29.6/§20.7 — the SAME subtree `text` is read from: the first `<main>`,
 * else `<body>`, else the whole document. Returns raw MARKUP (the source
 * slice between the host element's tags), not text content — `--feed-full`
 * wants the page's own HTML, verbatim, with no interpretation applied.
 * @param {string} html - a page's full emitted text; "" reads as no markup
 * @returns {string}
 */
function mainMarkup(html) {
  if (!html) return "";
  const { root } = parse(html);
  const main = findFirst(root, (n) => isElement(n, "main"));
  if (main) return innerText(html, main);
  const body = findFirst(root, (n) => isElement(n, "body"));
  if (body) return innerText(html, body);
  // Neither element exists: the root node carries no tags of its own to
  // strip away, so the "inner markup" of the whole document IS the document
  // (§20.7's third branch, one document type over).
  return html;
}

/**
 * §29.5 — one `<entry>`, every line indented for readability (no
 * serialization format is spec-mandated here the way §21.4 mandates
 * sitemap.js's; this file picks one and holds it, so two builds of one tree
 * still produce byte-identical bytes).
 * @param {import('./manifest.js').BuildDocument} doc
 * @param {{feedFull: boolean, pageHtml: Map<string,string>|null}} opts
 * @returns {string[]} lines, unindented at the caller's level
 */
/**
 * §29.6 — every `href` and `src` in an entry's content, resolved absolute
 * against that entry's own address.
 *
 * The section this implements used to say the markup could be emitted with
 * URLs exactly as the page carried them, on the premise that `--base-url` had
 * already made them absolute. It had not, in two different ways, and both
 * shipped links a reader cannot follow:
 *
 *   - §11.3 prepends the base's PATH PREFIX to a root-relative `href`/`src`;
 *     the ORIGIN goes only to `og:`/`twitter:` and `canonical`. So a subpath
 *     deploy emitted `/repo/pic.png`, not `https://example.com/repo/pic.png`.
 *   - §11.1 leaves a page's OWN relative URL untouched when the page did not
 *     move. So `blog/post.html` carrying `href="sibling.html"` kept it — and
 *     a reader resolves that against the FEED's address, `/feed.xml` at the
 *     root, fetching `/sibling.html` one directory above the real file.
 *
 * Resolving against `entryAddress` is §11's own rule applied once more with
 * the entry's address as the base, so no new reading of a URL enters here.
 * A value that is already absolute is returned unchanged by `new URL`, and
 * one no parser accepts is left exactly as written rather than dropped —
 * this function must never be the reason a byte the author wrote disappears.
 *
 * Only `href` and `src` are touched. A `srcset` is a comma-separated
 * descriptor list rather than a URL, a `style` attribute's `url()` is CSS,
 * and rewriting either would be this file inventing a second URL grammar —
 * §12 reads them, and reading is not rewriting (§11.1's own distinction).
 * The cost is stated rather than hidden: an entry whose content carries a
 * relative `srcset` ships it unresolved.
 * @param {string} markup
 * @param {string} entryUrl - the entry's absolute address
 * @returns {string}
 */
function absolutizeMarkupUrls(markup, entryUrl) {
  return markup.replace(
    /\s(href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (whole, attr, quoted, dq, sq) => {
      const raw = dq !== undefined ? dq : sq;
      const decoded = xmlUnescape(raw);
      if (isSkippedUrl(decoded) || decoded === "") return whole;
      let abs;
      try {
        abs = new URL(decoded, entryUrl).href;
      } catch {
        return whole; // unparseable even against an absolute base — leave it
      }
      const q = quoted[0];
      return ` ${attr}=${q}${xmlEscapeAttr(abs, q)}${q}`;
    },
  );
}

/** Re-escape a resolved URL for the quote style it is going back into. */
function xmlEscapeAttr(value, quote) {
  const escaped = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return quote === '"' ? escaped.replaceAll('"', "&quot;") : escaped.replaceAll("'", "&apos;");
}

/**
 * §29.5 — an entry's own absolute address: the canonical when the page
 * declares one, else `doc.document.url`, resolved so the result is always absolute.
 *
 * The resolution is required rather than tidy. RFC 4287 §4.2.6 makes
 * `atom:id` a permanent, universally unique IRI, and a RELATIVE canonical is
 * neither: a reader resolves it against the feed's own location, so
 * `<link rel="canonical" href="post.html">` on `blog/post.html` — a value
 * §12 accepts, because it resolves correctly *in the page* — became the id
 * `post.html`, which names a different file the moment anything but
 * `feed.xml` reads it. It also made `checkFeedLocs` resolve one string two
 * ways (against the page for membership, against the feed for the check) and
 * block the publish of a valid site.
 *
 * An already-absolute canonical is passed through UNTOUCHED, which is the
 * other half of the rule: §20.3 stores the value with character references
 * resolved and nothing else changed, and re-encoding an author's absolute URL
 * would edit bytes that are theirs. Only a value that is not yet an absolute
 * URL is resolved, and it is resolved against the page's own absolute address
 * — which is §11's rule applied once more, not a new reading of a URL.
 * @param {import('./manifest.js').BuildDocument} doc
 * @returns {string}
 */
function entryAddress(doc) {
  // `doc.document.url` is never null here: generateFeed only reaches
  // serializeEntry once `base` is confirmed non-null (§20.5 makes `url` null
  // ONLY without --base-url), so there is always an absolute base to resolve
  // against.
  const canonical = canonicalOf(doc);
  if (canonical === null) return doc.document.url;
  try {
    return new URL(canonical, doc.document.url).href;
  } catch {
    // Unparseable even against an absolute base — a `mailto:` with no path, a
    // value no URL parser accepts. §29.5 names the canonical, so the author's
    // string is emitted as written rather than replaced by a guess.
    return canonical;
  }
}

function serializeEntry(doc, { feedFull, pageHtml }) {
  // §29.5 — doc.document.url is never null here: generateFeed only reaches
  // this function once `base` is confirmed non-null (§20.5 makes `url` null
  // ONLY without --base-url), so the fallback always has a real string to use.
  const id = entryAddress(doc);
  const lines = ["  <entry>"];
  lines.push(`    <id>${xmlEscape(id)}</id>`);
  // §29.5's table gives `<summary>`/`<author>` an explicit "omitted when
  // null" and gives `<title>` none — and Atom requires exactly one
  // atom:title per entry (RFC 4287 §4.1.2), unlike the two optional
  // constructs beside it. An entry with no title (possible: nothing about
  // §29.4's four conditions requires one) therefore emits an EMPTY element
  // rather than none at all, the same choice a required-but-unauthored
  // element gets nowhere else in this table.
  lines.push(`    <title>${xmlEscape(titleOf(doc) ?? "")}</title>`);
  lines.push(`    <link rel="alternate" href="${xmlEscape(id)}"/>`);
  lines.push(`    <updated>${xmlEscape(entryUpdated(doc))}</updated>`);
  lines.push(`    <published>${xmlEscape(publicationDatesOf(doc).published.iso)}</published>`);
  const description = descriptionOf(doc);
  const author = authorOf(doc);
  if (description !== null) lines.push(`    <summary type="text">${xmlEscape(description)}</summary>`);
  if (author !== null) lines.push(`    <author><name>${xmlEscape(author)}</name></author>`);
  if (feedFull) {
    // RFC 4287 §4.1.3.3: an html-type Content construct is TEXT — child
    // markup must be entity-escaped, never embedded as live XML elements —
    // so the extracted markup is XML-escaped like any other string here,
    // never wrapped in CDATA (see the module comment's percent/XML-escaping
    // discussion for why this file escapes rather than shields throughout).
    const markup = absolutizeMarkupUrls(mainMarkup(pageHtml?.get(doc.outputPath) ?? ""), id);
    lines.push(`    <content type="html">${xmlEscape(markup)}</content>`);
  }
  lines.push("  </entry>");
  return lines;
}

/**
 * §29.5 — the whole document.
 * @param {object} args
 * @param {import('./manifest.js').BuildDocument[]} args.documents
 * @param {import('./urls.js').BaseUrlConfig} args.base
 * @param {import('./manifest.js').BuildDocument[]} args.entries - `entriesFor`'s result
 * @param {boolean} args.feedFull
 * @param {Map<string,string>|null} args.pageHtml
 * @returns {string}
 */
function serializeFeed({ documents, base, entries, feedFull, pageHtml }) {
  const address = base.origin + base.pathPrefix; // "the site's own address" (§29.5), reused for <id> and rel=alternate
  const selfUrl = address + FEED_PATH;
  const root = documents.find((d) => d.outputPath === "index.html");
  const rootTitle = root ? titleOf(root) : null;
  const title = rootTitle ?? new URL(base.origin).host;

  const lines = [`<feed xmlns="${ATOM_XMLNS}">`];
  // CONFIRMED BY A REAL BUILD, FLAGGED IN THE IMPLEMENTATION REPORT: `address`
  // and the rel=alternate link below both name the SITE's root — and
  // `checkFeedLocs` (§29.7, unqualified: "every URL the feed emits") checks
  // them exactly as it checks an entry's. §12/§21.6's own directory-URL rule
  // resolves a root address to `index.html`, so a site with no root page —
  // reachable, since §29.1 activates on any ONE Article/BlogPosting page
  // anywhere, with no requirement that a home page exist — gets a
  // PUBLISH-BLOCKING P13 on this line and the rel=alternate line below, for
  // a fact that has nothing to do with what the author got wrong. §29.7's own
  // "for a generated feed this can only pass" argument is built entirely on
  // §29.4's THIRD condition (an entry's own self-canonical test) and never
  // extends to this site-level address, which may be why the gap was not
  // caught: nothing in §29 says these two elements are exempt, and nothing
  // says they are not. Implemented literally (checked, like everything
  // else) rather than silently exempted — this is a spec decision, not an
  // implementation one.
  lines.push(`  <id>${xmlEscape(address)}</id>`);
  lines.push(`  <title>${xmlEscape(title)}</title>`);
  // Unconditional, and safely so: §29.1 writes no feed at all when there are
  // no entries, precisely so this element always has a newest one to read
  // (RFC 4287 §4.1.1 requires it, and nothing here may invent an instant).
  lines.push(`  <updated>${xmlEscape(entryUpdated(entries[0]))}</updated>`);
  lines.push(`  <link rel="self" href="${xmlEscape(selfUrl)}"/>`);
  lines.push(`  <link rel="alternate" href="${xmlEscape(address)}"/>`);
  for (const doc of entries) lines.push(...serializeEntry(doc, { feedFull, pageHtml }));
  lines.push("</feed>");
  return `${DECLARATION}${lines.join("\n")}\n`;
}

/**
 * §29 — generate the site's feed, or explain why it did not.
 *
 * `--feed-full` requiring `--base-url` (§29.6) is a USAGE error (exit 2),
 * checked once before the pipeline runs — the same mechanism and the same
 * reason `--canonical auto` is (§22.1) — and is deliberately NOT this
 * function's job: see the implementation report for the exact check the
 * wiring must add, mirroring cli.js's existing `--canonical auto` check.
 *
 * @param {object} args
 * @param {import('./manifest.js').BuildDocument[]} args.documents - the §20 manifest
 * @param {import('./urls.js').BaseUrlConfig|null} args.base - null suppresses generation (§29.1)
 * @param {boolean} [args.feedFull] - §29.6 — include each entry's rendered body
 * @param {Map<string,string>|null} [args.pageHtml] - output path -> the page's
 *   FINAL emitted HTML (after §22/§26 insertion, exactly what §20 built the
 *   manifest from). Consulted only when `feedFull` is true; may be omitted
 *   otherwise.
 * @param {Map<string,string>} args.emittedFromSource - output path -> the
 *   source path it came from, for every file the site emits from its own
 *   tree (§29.7/§21.5's suppression test — the SAME map sitemap.js's
 *   `generateSitemap` already takes, so the wiring builds it once).
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {Map<string,string>} generated output path -> text; empty when
 *   generation did not activate or was suppressed
 */
export function generateFeed({ documents, base, feedFull = false, pageHtml = null, emittedFromSource, reporter }) {
  const generated = new Map();
  if (!base) return generated; // §29.1 — no public address, no feed, no report
  if (!documents.some(isFeedCandidate)) return generated; // §29.1 — nothing on the site opted in anywhere
  // §29.7, reusing §21.5's rule verbatim: the author's file IS the feed.
  if (emittedFromSource.has(FEED_PATH)) return generated;

  // Only now that a feed is actually being written — see this function's own
  // "this page is not in feed.xml" wording, which is false the moment
  // nothing is generated.
  reportDateOnlyEntries(documents, base, reporter);
  const entries = entriesFor(documents, base);
  // §29.1 — activation is MEMBERSHIP, not declaration. A page can declare
  // Article and still not be an entry (§29.4), and the commonest way is
  // §29.3's date rule, which is A17's own worked example. A feed with zero
  // entries cannot be valid — RFC 4287 §4.1.1 requires atom:updated and
  // §29.5 defines it as the newest entry's — so the only alternatives were an
  // invalid document or an invented instant, and §6.1 forbids the second.
  // Writing no file is the third: A17 already told the author why.
  if (entries.length === 0) return generated;
  generated.set(FEED_PATH, serializeFeed({ documents, base, entries, feedFull, pageHtml }));
  return generated;
}

/**
 * §29.7 — every `<id>` and `<link href>` in an emitted feed — generated or
 * authored — whose value names a location inside this site must resolve to
 * a file the site emits, exactly as §21.6 checks a sitemap's `<loc>`.
 *
 * For a GENERATED feed this can only pass: every entry's `<id>` is
 * `canonicalOf(doc)` or `doc.document.url`, and §29.4's third condition
 * (self-canonical) already guarantees whichever one was used resolves to
 * the entry's own output path. It runs anyway, for §21.6's reason — the
 * executable form of the claim that the feed and the published tree agree,
 * so a future change that lets the two drift fails here rather than at a
 * reader's feed app.
 *
 * Scope is Atom's own vocabulary — `<id>` and `<link href>`, namespace-prefix
 * tolerant like sitemap.js's `<sm:loc>` handling — the same boundary §21.6
 * draws at the Sitemaps protocol's `<loc>`: a file named `feed.xml` that an
 * author wrote in a DIFFERENT wire format (RSS's `<link>` is text content,
 * not an `href`) is checked exactly as far as Atom's vocabulary reaches into
 * it, which may be nowhere. See the implementation report — the blog
 * template's own generator ships exactly such a file.
 *
 * `--feed-full`'s `<content type="html">` is never scanned here: its
 * markup is XML-escaped text (`<` becomes `&lt;`), so a real `<a href>`
 * inside it is not a `link` element to this parser at all, and its
 * references were already checked once, on the source page, by §12 (§29.7's
 * own "nothing is checked twice" clause).
 *
 * @param {object} args
 * @param {string} args.text - the emitted feed.xml to scan
 * @param {string} args.file - the source path to attribute a problem to
 * @param {Set<string>} args.emittedPaths
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {import('./diagnostics.js').Reporter} args.reporter
 */
export function checkFeedLocs({ text, file, emittedPaths, base, reporter }) {
  for (const { raw, resolved } of internalFeedUrls(text, base)) {
    if (resolved !== null && emittedPaths.has(resolved)) continue;
    // The authored spelling, for §23.3's reason one document type over: a
    // GENERATED feed is never rewritten after this point either, so `raw` is
    // always the string actually sitting in the file.
    reporter.problem({
      file,
      message: `${raw} does not resolve to any emitted file`,
      context: raw,
      fixes: [CHECK_SPELLING],
    });
  }
}

/**
 * Every `<id>` and `<link href>` value in a feed document, resolved once,
 * in document order (a single tree walk, so a diagnostic set is deterministic
 * even though the two element shapes are read differently).
 *
 * Parsed, never pattern-matched — the same three reasons sitemap.js's
 * `locValues` gives for `<loc>`: a value inside a comment declares nothing,
 * CDATA (legal for `<id>`'s element content, never for an attribute) carries
 * its payload without entity resolution, and a namespace-prefixed element
 * (`<atom:id>`, `<atom:link>`) still counts — missing it is the direction
 * that ships a broken URL silently, which is the one this check exists to
 * prevent.
 * @param {string} text
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {{raw: string, resolved: string|null}[]}
 */
function internalFeedUrls(text, base) {
  const out = [];
  const consider = (raw) => {
    const stripped = base ? stripBaseUrl(raw, base) : raw;
    if (isSkippedUrl(stripped)) return; // another origin, or nothing to check
    if (splitUrl(stripped).path === "") return;
    // Resolved against FEED_PATH: feed.xml always lives at the output root
    // (§29.2), so a relative value in it resolves relative to the root, the
    // same way a sitemap's own relative <loc> resolves against sitemap.xml.
    out.push({ raw, resolved: resolveReference(stripped, FEED_PATH) });
  };

  // §29.7 checks LOCATORS, and RFC 4287 gives the two element shapes different
  // jobs: `atom:id` is an IRI that IDENTIFIES (§4.2.6, "permanent, universally
  // unique") and need never dereference, while `atom:link/@href` names a
  // resource. So `<id>` is not read here at all.
  //
  // Nor are the FEED-level links. A feed's `<link rel="alternate">` names the
  // site's own address — `--base-url` itself — and `rel="self"` names the feed
  // being written; neither is a claim about a file this build emits. Reading
  // them cost a real regression: a site with an Article page and no root
  // `index.html` had its site address resolved to `index.html`, found missing,
  // and reported as P13 against `src/feed.xml` — a file the author does not
  // have, under `fix: check the path spelling and casing`, for a spelling that
  // was right. Adding `--base-url` to such a site stopped it publishing.
  //
  // What is left is exactly the set that does name emitted pages: the `href`
  // of a `<link>` inside an `<entry>`.
  const { root } = parse(text);
  const entries = findAll(root, (n) => n.type === "element" && /(^|:)entry$/i.test(n.tag));
  const elements = entries.flatMap((entry) =>
    findAll(entry, (n) => n.type === "element" && /(^|:)link$/i.test(n.tag)));
  for (const el of elements) {
    // <link href="...">. Atom's link is empty (no CDATA question — CDATA is
    // only legal in element content, never in an attribute value), so the
    // one decoding step is XML entity resolution, exactly as an HTML
    // attribute value is decoded before §12 treats it as a URL.
    const href = getAttr(el, "href");
    if (href === null) continue;
    const raw = xmlUnescape(href).trim();
    if (raw) consider(raw);
  }
  return out;
}
