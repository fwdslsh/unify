/**
 * `audit.js` — conformance-spec §24, the evaluation engine.
 *
 * Every finding here is a **predicate over the §20 manifest**, and the design
 * constraint that shaped all of them is product-spec §6.1: unify does not
 * assign an SEO score, measure keyword density, rewrite prose, promise
 * rankings, or fail content on arbitrary character counts. §6.7 goes further
 * and names the specific myths — fixed title lengths, robots.txt read as
 * `noindex`, build-time dates — as things that must never become product rules
 * merely because models and blog posts repeat them.
 *
 * So each predicate below is a **fact about the emitted output**, decidable by
 * reading it, with no threshold anybody would have to defend:
 *
 *   - Duplicate title/description/text means IDENTICAL, not "similar". Any
 *     similarity threshold is a number nobody can justify, so there is none.
 *   - Title/heading mismatch means neither string contains the other, not a
 *     distance score.
 *   - Nothing anywhere counts characters. A short description is not a finding;
 *     an absent one is.
 *
 * Two severities, and the line between them is objective rather than a
 * judgement of importance:
 *
 *   - `broken`   — the output contradicts itself or the standard it claims to
 *                  follow. A fragment naming no id, a duplicated id, JSON-LD
 *                  that does not parse. Wrong regardless of intent.
 *   - `incomplete` — something is absent or inconsistent that an author may
 *                  have chosen. A missing description, an orphan page.
 *
 * Findings never block a build. §6.1 keeps subjective judgement out of the
 * publish path; `unify audit --strict` is the opt-in gate.
 */

import { jsonLdReferences, resolveReference, stripBaseUrl } from "./references.js";
import { canonicalSchemeMismatch, classifyCanonical } from "./sitemap.js";
import { stringProperty, subjectObject } from "./structured-data.js";
import {
  canonicalOf, declaredTypes, descriptionOf, langOf, metadataConflicts,
  preferredImageOf, publicationDatesOf, refreshOf, robotsPolicyOf, titleOf,
} from "./document-selectors.js";

/**
 * @typedef {object} Finding
 * @property {string} id - stable machine identifier; never renamed
 * @property {'broken'|'incomplete'} severity
 * @property {string} file - the source path a reader should open
 * @property {string|null} outputPath - §31.1 — the output-root-relative path
 *   §13 resolved; `null` only for `robots-sitemap-missing`, which is about
 *   the source `robots.txt` rather than a page
 * @property {string|null} url - the page's public address, when known
 * @property {string} distinguisher - §31.2 — the ONE datum (besides `id` and
 *   `file`) that distinguishes this finding from a sibling of the same id on
 *   the same page; `""` for an id that occurs at most once per page. Read
 *   only by `report.js`'s `fingerprint()` — never printed by
 *   `formatFindings` and never a key in the `--format json`/`sarif`
 *   documents. Named `distinguisher` rather than `subject` so it cannot be
 *   misread as the unrelated "JSON-LD subject object" this file already
 *   means by that word (see `subjectObject`, below). See report.js's own
 *   doc comment above `fingerprint()` for the full id→datum mapping and why
 *   each choice is stable across an unrelated edit elsewhere on the page.
 * @property {string} evidence - what was observed, quoting the output
 * @property {string} fix - one concrete action
 */

/**
 * §31.1's only channel into a *structured* audit result.
 *
 * `unify audit --format json|sarif` needs `documents`, `base`, and `findings`
 * together: the JSON document's `pages` field is `documents` serialized,
 * `baseUrl` comes from `base`, and `findings` is this function's own return
 * value (§31 does not touch `src/cli/commands/build.js`; see that file's own
 * header for why one pipeline has one caller). But `build.js` calls
 * `auditManifest` exactly once per `settings.audit` run and immediately
 * flattens the result through `formatFindings` into one prose string before
 * handing THAT string to `reporter.summary()` — the only value that leaves
 * build.js's audit branch outward, and a string is not the structured value
 * §31.1 needs to build a JSON/SARIF document.
 *
 * So this module stashes its own last call, and `cli/commands/audit.js`
 * reads it back with `consumeLastAuditRun()` immediately after its one
 * `build()` call resolves. Safe because one CLI invocation runs one command
 * once: `unify audit` never calls `build()` twice in a process, unlike
 * `watch`/`dev`'s rebuild loop — which never sets `settings.audit` in the
 * first place and so never reaches the branch that stashes (§24.7: `build`
 * and `watch` never evaluate at all).
 * @type {{documents: import('./manifest.js').BuildDocument[], base: import('./urls.js').BaseUrlConfig|null, findings: Finding[], htmlFiles: Map<string,string>}|null}
 */
let lastAuditRun = null;

/**
 * §31.1 — retrieve and clear the run `auditManifest` most recently stashed;
 * `null` if `auditManifest` has not run in this process. See `lastAuditRun`.
 * @returns {{documents: import('./manifest.js').BuildDocument[], base: import('./urls.js').BaseUrlConfig|null, findings: Finding[], htmlFiles: Map<string,string>}|null}
 */
export function consumeLastAuditRun() {
  const run = lastAuditRun;
  lastAuditRun = null;
  return run;
}

/**
 * §24.5's order: source path, then finding id. Exported so a caller that
 * merges in findings from OUTSIDE `auditManifest` — `--external`'s
 * `external-unreachable`, computed after the pipeline has already returned —
 * re-sorts with the identical comparator rather than a second one that could
 * disagree about ties.
 * @param {Finding[]} findings
 * @returns {Finding[]} a new, sorted array
 */
export function sortFindings(findings) {
  // Two keys, and STABLE — `Array.prototype.sort` has been stable since ES2019
  // and this relies on it. A third key was tried and reverted: sorting ties on
  // `evidence` made the order total, and in doing so it overrode two orderings
  // the specification states outright. §26.3 requires `date-unusable` to report
  // `datePublished` before `dateModified`; §24.4 requires
  // `robots-sitemap-missing` in the FILE'S OWN LINE ORDER. Alphabetical
  // evidence reverses both ("dateModified" < "datePublished", "/sitemap-2.xml"
  // < "/sitemap.xml"), and the suite said so immediately.
  //
  // So the rule is the one that was already here: this sort groups, and each
  // PRODUCER owns the order of its own ties. Where a producer had no order of
  // its own the fix belongs there — `externalUnreachableFindings` now sorts by
  // URL before building anything, because what it used to inherit was the
  // order the network answered in.
  return [...findings].sort((a, b) =>
    a.file === b.file ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.file < b.file ? -1 : 1);
}

/**
 * §24.4 — the immediate-refresh chain starting at `doc`, when it returns to
 * `doc`; null when it does not.
 *
 * A page declares at most one `refresh` (§20.11), so out-degree is one and a
 * visited-set walk decides the question — an SCC pass would be machinery for a
 * graph that cannot branch.
 *
 * `seconds === 0` is the whole condition, and it is not one of the thresholds
 * §24.4 forbids: zero is the ABSENCE of a delay, not a small quantity of one. A
 * chain of immediate refreshes never presents a readable page to anybody, while
 * a delayed chain is an ordinary pattern — a kiosk rotating three pages, a page
 * that re-reads itself every thirty seconds — and reporting those would call a
 * feature a fault.
 * @param {import('./manifest.js').BuildDocument} doc
 * @param {Map<string, import('./manifest.js').BuildDocument>} byOutputPath
 * @returns {import('./manifest.js').BuildDocument[]|null} the chain, starting
 *   and ending at `doc`
 */
function redirectChain(doc, byOutputPath) {
  const immediate = (d) => {
    const refresh = refreshOf(d);
    return refresh !== null && refresh.seconds === 0 && refresh.target !== null ? refresh.target : null;
  };
  const chain = [doc];
  const seen = new Set([doc.outputPath]);
  let current = doc;
  for (;;) {
    const next = immediate(current);
    if (next === null) return null;
    const target = byOutputPath.get(next);
    if (target === undefined) return null; // §20.11 already refuses to resolve this
    chain.push(target);
    if (next === doc.outputPath) return chain;
    // A cycle THIS page merely feeds into is not this page's loop: the pages on
    // it report it themselves, and every one of them prints the chain its own
    // author will follow.
    if (seen.has(next)) return null;
    seen.add(next);
    current = target;
  }
}

/** Normalize a heading or title for comparison — case and whitespace only. */
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * §26.3 — which page of this manifest does one URL name?
 *
 * `jsonld-url-mismatch` compares a block's `url` against the page's canonical,
 * and both sides are read **here**, through §12's own three steps in §12's own
 * order: strip the `--base-url` prefix, resolve against the containing output
 * file, and let a directory URL become the `index.html` within it. That is
 * literally `classifyCanonical`'s body minus its four-state answer — this
 * comparison needs the resolved *path* of two different values, which a
 * self/elsewhere verdict cannot carry — so the two readings are the same
 * functions applied in the same order and cannot disagree about which page a
 * URL names. Writing a second resolver here is the defect product-spec §6.1
 * forbids for URLs; calling §12's is the whole point.
 *
 * `null` means "not a page this manifest holds", which is the finding's own
 * entry condition: a `url` on another origin is that site's business, and one
 * naming a location this site does not emit is already **P13** through §12's
 * closed property list — the stronger answer, and the one mechanism.
 * @param {string} value
 * @param {import('./manifest.js').BuildDocument} doc
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @param {Map<string, import('./manifest.js').BuildDocument>} byOutputPath
 * @returns {string|null}
 */
function outputPathNamedBy(value, doc, base, byOutputPath) {
  const stripped = base ? stripBaseUrl(value, base) : value;
  const target = resolveReference(stripped, doc.outputPath);
  return target !== null && byOutputPath.has(target) ? target : null;
}

/**
 * §26.3 — a language tag's **primary subtag**, case-folded.
 *
 * Both halves are load-bearing. BCP 47 §2.1.1 makes tags case-insensitive, so
 * `EN-us` and `en-US` are one tag and a byte comparison would accuse a correct
 * page. And `en` beside `en-GB` is a *refinement* rather than a contradiction
 * — one says English, the other says which English — so comparing whole tags
 * would accuse the commonest correct pairing there is. What is left, `en`
 * against `fr`, is one document answering one question twice.
 */
const primarySubtag = (tag) => tag.trim().split("-")[0].toLowerCase();

/**
 * §20.3's requirement on any consumer that compares `text`: fold U+00A0 and
 * the other Unicode space separators **at index time**. §20.3 collapses ASCII
 * whitespace only and says why — a `&nbsp;` is a character the author chose,
 * and rewriting it in the shared record would push one consumer's
 * normalization onto every other. The cost lands here, where the comparison
 * happens, exactly as that clause says it must. JS `\s` is the fold: it covers
 * U+00A0, U+2000..U+200A, U+202F, U+205F, U+3000 and the rest.
 *
 * This is normalization, not similarity. Two pages whose text differs only by
 * a non-breaking space are the same text; two pages whose text differs by a
 * word are not, at any threshold (§24.4).
 */
const foldSpaces = (s) => s.replace(/\s+/g, " ").trim();

/**
 * §24 — evaluate a manifest.
 *
 * @param {object} args
 * @param {import('./manifest.js').BuildDocument[]} args.documents
 * @param {Map<string, import('./manifest.js').BuildDocument>} args.byOutputPath
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {Map<string, string>} [args.sitemapLocs] - output path -> the sitemap
 *   file that lists it, for the discovery-artifact comparisons
 * @param {{file: string, value: string}[]} [args.exemptedSitemaps] - the
 *   `Sitemap:` declarations §23.3's exemption skipped, handed over by the branch
 *   that skipped them — never a second read of `robots.txt`
 * @param {Map<string, string>} [args.htmlFiles] - output path -> each page's
 *   final emitted HTML text. Not read by any predicate below — this function
 *   evaluates the manifest, not the markup — but carried through into
 *   `lastAuditRun` unchanged, because §31.3's `--external` needs the SAME
 *   text `checkReferences` already scanned (`external.js`'s
 *   `collectExternalReferences`) and `cli/commands/audit.js` has no other
 *   route to it: `build()`'s only other return is a bare exit code (see this
 *   module's own `lastAuditRun` doc comment for why that channel exists at
 *   all).
 * @returns {Finding[]} ordered by source path, then by finding id
 */
export function auditManifest({
  documents, byOutputPath, base = null, sitemapLocs = new Map(), exemptedSitemaps = [], htmlFiles = new Map(),
}) {
  /** @type {Finding[]} */
  const out = [];
  const add = (doc, id, severity, evidence, fix, distinguisher = "") =>
    out.push({
      id, severity, file: doc.source.path, generated: doc.source.generated === true,
      outputPath: doc.outputPath, url: doc.document.url, distinguisher, evidence, fix,
    });

  // ---- cross-page groupings, computed once ---------------------------------
  const group = (pick) => {
    const m = new Map();
    for (const d of documents) {
      const key = pick(d);
      if (key === null || key === "") continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(d);
    }
    return m;
  };
  const byTitle = group((d) => { const t = titleOf(d); return t === null ? null : norm(t); });
  const byDescription = group((d) => { const desc = descriptionOf(d); return desc === null ? null : norm(desc); });
  const byText = group((d) => (d.analysis.visibleText === "" ? null : foldSpaces(d.analysis.visibleText)));

  for (const doc of documents) {
    const others = (m, key) => (key === null ? [] : (m.get(norm(key)) ?? []).filter((d) => d !== doc));
    const title = titleOf(doc);
    const description = descriptionOf(doc);
    const lang = langOf(doc);
    const canonical = canonicalOf(doc);
    const robots = robotsPolicyOf(doc);
    const image = preferredImageOf(doc);
    const headings = doc.document.body.headings;

    // ---- titles ------------------------------------------------------------
    if (title === null) {
      add(doc, "title-missing", "incomplete",
        "the emitted <head> declares no <title>",
        "add a <title> to the page, or to its layout for a site-wide suffix");
    } else {
      const dupes = others(byTitle, title);
      if (dupes.length) {
        add(doc, "title-duplicate", "incomplete",
          `the title ${JSON.stringify(title)} is also used by ${listPaths(dupes)}`,
          "give each page a title naming what is on it — the layout's suffix stays shared");
      }
    }

    // ---- descriptions ------------------------------------------------------
    if (description === null) {
      add(doc, "description-missing", "incomplete",
        "the emitted <head> declares no <meta name=\"description\">",
        "add a description describing this page; a layout-wide one repeats on every page");
    } else {
      const dupes = others(byDescription, description);
      if (dupes.length) {
        add(doc, "description-duplicate", "incomplete",
          `the description ${JSON.stringify(truncate(description))} is also used by ${listPaths(dupes)}`,
          "describe each page separately, or drop the shared one from the layout");
      }
    }

    // ---- headings ------------------------------------------------------------
    // §20.3's 0.9 scope change: `headings` is `doc.document.body.headings`,
    // scoped to the first `<main>`, else `<body>`, else the document root
    // (`document.js`'s own §20.7 scope, reused here rather than a second
    // walk) — a chrome `<h1>` outside `<main>` no longer counts as the
    // page's h1. §20's own rewrite states this as a deliberate 0.9 decision.
    const h1s = headings.filter((h) => h.level === 1);
    if (h1s.length === 0) {
      add(doc, "h1-missing", "incomplete",
        "the page emits no <h1>",
        "add one <h1> naming the page's subject");
    } else if (h1s.length > 1) {
      add(doc, "h1-multiple", "incomplete",
        `the page emits ${h1s.length} <h1> elements: ${h1s.map((h) => JSON.stringify(truncate(h.text))).join(", ")}`,
        "keep one <h1> and demote the rest to <h2>");
    }
    // Containment, not similarity: §8 row 2 PREPENDS a page title to the
    // layout's, so "About — Site" legitimately contains the h1 "About". A
    // distance score would be a number nobody could defend.
    if (title !== null && h1s.length === 1) {
      const t = norm(title);
      const h = norm(h1s[0].text);
      if (h !== "" && !t.includes(h) && !h.includes(t)) {
        add(doc, "title-h1-mismatch", "incomplete",
          `the title is ${JSON.stringify(title)} but the <h1> reads ${JSON.stringify(h1s[0].text)}`,
          "make one of them contain the other, so a search result and the page agree");
      }
    }

    // ---- language ----------------------------------------------------------
    if (lang === null) {
      // §20.3's `layout` — the same shape as `generated` below. A page that
      // composed with NO layout (`data-layout="none"`, `layout: none`, no
      // `_layout.html` above it) has no layout to set anything on, and the
      // standing advice sent such an author to a file that was either already
      // correct or did not exist. A fix line that names somewhere the reader
      // has already been is worse than no fix line, so this one names the
      // page — in the spelling that page can actually take: frontmatter for
      // Markdown (§10.2's `lang` key), the `<html>` element for HTML.
      // The layout case is unchanged, byte for byte.
      add(doc, "lang-missing", "incomplete",
        "the emitted <html> has no lang attribute",
        doc.source.layout != null
          ? 'set it on the layout: <html lang="en">'
          : doc.source.path.endsWith(".md")
            ? "add lang: en to this page's frontmatter — it composed with no layout"
            : 'set it on the page: <html lang="en"> — this page composed with no layout');
    }

    // ---- orphans -----------------------------------------------------------
    // The site root is reachable by definition and 404.html is never linked, so
    // neither is an orphan; every other page nothing links to is unreachable by
    // a reader who did not already have its URL.
    // A self-link is not an incoming link. §20.9 records one (a permalink, a
    // "back to top" href to the page's own URL), and counting it made a page
    // nothing else links to unreportable — contradicting this finding's own
    // evidence line, which has always said "no OTHER page links to this one".
    const linksInFromElsewhere = doc.analysis.linksIn.filter((p) => p !== doc.outputPath);
    if (linksInFromElsewhere.length === 0 && doc.outputPath !== "index.html" && doc.outputPath !== "404.html") {
      add(doc, "page-orphan", "incomplete",
        "no other page links to this one",
        // §33.4 — the source-tree advice is wrong for a generated page: there
        // is no file to rename and no underscore to add. The generator is
        // where it comes from and where it stops coming from.
        doc.source.generated === true
          ? "link to it from a page that is reachable, or stop writing it in your --generate script"
          : "link to it from a page that is reachable, or exclude it with a leading underscore");
    }

    // ---- ids and fragments -------------------------------------------------
    const seen = new Set();
    const repeated = new Set();
    for (const id of doc.analysis.ids) (seen.has(id) ? repeated : seen).add(id);
    for (const id of [...repeated].sort()) {
      add(doc, "id-duplicate", "broken",
        `the id ${JSON.stringify(id)} is declared more than once`,
        "make each id unique — a duplicate makes every link to it ambiguous",
        id); // §31.2 names this one: "the repeated id for id-duplicate"
    }
    for (const link of doc.analysis.fragmentLinks) {
      const target = byOutputPath.get(link.target);
      if (!target || target.analysis.ids.includes(link.id)) continue;
      add(doc, "fragment-missing", "broken",
        `${JSON.stringify(`#${link.id}`)} in ${link.target === doc.outputPath ? "this page" : link.target} names no element`,
        `add the id ${JSON.stringify(link.id)} to the element it should reach, or correct the link`,
        `${link.target}#${link.id}`); // two distinct missing fragments on one page are two distinct faults
    }

    // ---- contradictory declarations ----------------------------------------
    // §20.4 keeps the first of two differing values and reports the loser;
    // §22.5 assigns the reporting of that to this command by name.
    // `metadataConflicts(doc)` is the 0.9 replacement for a stored
    // `conflicts` array: it computes conflicts, on demand, for exactly the
    // four fields whose defining standard says a page may declare once
    // (`canonical`, `title`, `description`, `lang`). Five more fields were
    // on this list in the 0.8 model and came off before the selector was
    // written — the reasoning stays here because it is why the set is
    // exactly these four and not a larger one:
    //
    //   - `image`. The Open Graph protocol defines arrays by repeating the
    //     tag — "if a tag can have multiple values, just put multiple
    //     versions of the same meta tag on your page; the first is given
    //     preference during conflicts" — and ogp.me's own `og:image`
    //     example ships two. A page with several share images is correct,
    //     common, and was being told to delete valid tags.
    //   - the declared structured-data type. §20.8 reads a bounded set of
    //     declarations deliberately. An `Organization` block beside a
    //     `BreadcrumbList` is routine and recommended, and every consumer
    //     parses every block, so a second declaration is not "ignored".
    //   - `author`. The HTML spec defines the `author` metadata name as
    //     "the name of *one of* the page's authors" — plural by
    //     construction.
    //   - `robots`. Crawlers read the union of the directives across every
    //     `robots` meta, so splitting `noindex, nofollow` across two tags
    //     is a documented spelling of one policy. §20.6 unions them, which
    //     removes the conflict entirely rather than reclassifying it.
    //   - `datePublished`/`dateModified`. `article:published_time` beside
    //     `<meta name="date">` is ordinary belt-and-braces markup naming
    //     one instant at two granularities, and §20.3 maps both spellings
    //     to one field. Telling that author to "keep one" pushes them to
    //     drop the property crawlers read. Two genuinely different dates
    //     *are* a contradiction, but distinguishing them from two
    //     spellings of one date needs a comparison §20.10 does not
    //     expose — so the conservative answer is silence, which is the
    //     right default for a `broken` severity.
    //
    // So every conflict `metadataConflicts` returns is already one
    // `metadata-conflict` renders; there is no second filter here.
    for (const conflict of metadataConflicts(doc)) {
      add(doc, "metadata-conflict", "broken",
        `the page declares ${conflict.discarded.length + 1} different values for ${conflict.field}: ` +
        `${JSON.stringify(truncate(conflict.kept))} is used, ` +
        `${conflict.discarded.map((d) => JSON.stringify(truncate(d))).join(", ")} ignored`,
        `keep one — a page that declares two answers to one question has given consumers no answer`,
        conflict.field); // §31.2 names this one: "the field name for metadata-conflict"
    }

    // ---- metadata placement ------------------------------------------------
    // §20.3 already declined to READ these; this says so out loud, because a
    // silently-dropped <title> is indistinguishable from one never written.
    for (const el of doc.analysis.strayMetadata) {
      const shown = el.key === null ? `<${el.tag}>`
        : el.tag === "link" ? `<link rel="${el.key}">`
        : el.key === "charset" ? "<meta charset>"
        : `<meta ${el.key.startsWith("og:") ? "property" : "name"}="${el.key}">`;
      // `schema` is the one member of the set no browser or crawler reads
      // ANYWHERE: it is unify's own key (§26.4), read with the head (§20.3),
      // and what a body-placed one loses is unify's own generator. Quoting the
      // consumer sentence at it would be evidence that is not true.
      add(doc, "metadata-in-body", "broken",
        el.key === "schema"
          ? `${shown} is emitted outside <head>, where unify does not read it — the page generates no structured data`
          : `${shown} is emitted outside <head>, where no browser or crawler reads it`,
        `move it into <head> — in the page's own <head>, or the layout's if every page needs it`,
        `${el.tag}:${el.key ?? ""}`); // which stray element, when a page has more than one
    }

    // §28.2 (0.9) — `tags`/`categories` are ordinary metadata, inert BY
    // DESIGN: unify never claimed to build an index, archive, or feed from
    // them, so there is no finding here at all — the retired
    // `taxonomy-inert` finding (and the `taxonomyKeys` field it read) is
    // deleted, not renamed. The metas emit normally and `audit` reports
    // nothing about them; §28.2's own rewrite states why the earlier
    // reservation reasoning now cuts the other way (CPR-02).

    // ---- structured data ---------------------------------------------------
    for (const entry of doc.analysis.jsonLd) {
      if (entry.error === null) continue;
      add(doc, "jsonld-invalid", "broken",
        `a <script type="application/ld+json"> does not parse: ${entry.error}`,
        "correct the JSON — a block that does not parse is ignored entirely",
        entry.raw); // the block's own bytes — stable across an edit elsewhere; an array index is not
    }
    const feedType = declaredTypes(doc).find((t) => t === "Article" || t === "BlogPosting");
    if (feedType !== undefined) {
      // Objective because product-spec §6.3.6 names exactly the fields bounded
      // generation may use: a declared Article with no title or no authored
      // date cannot produce valid structured data from them.
      const published = publicationDatesOf(doc).published;
      const missing = [];
      if (title === null) missing.push("a title");
      if (published === null || published.iso === null) missing.push("an authored ISO 8601 date");
      if (missing.length) {
        add(doc, "schema-incomplete", "incomplete",
          `the page declares ${feedType} but supplies ${missing.join(" and ")} — the fields structured data is built from`,
          "supply them, or drop the declared type rather than publish a partial claim");
      }
    }

    // ---- §26.3 — a block against the page it is on -------------------------
    // §20.8 asked whether a block parses and what it declares; §12 asked
    // whether its URLs name files this site emits. These four ask the question
    // neither does: does the block agree with the page carrying it?
    //
    // Every one of them reads the SUBJECT OBJECT (§26.2) — `data` when it is a
    // single object, never an array and never a `@graph` wrapper, and only its
    // own string-valued properties. That is §20.8's bounded reading applied to
    // one more question, and the cost is stated rather than hidden: on the
    // `@graph` shape several widely-deployed CMS plugins emit, all four are
    // silent. A claim about the wrong node of a graph is worse than no claim.
    const subjects = doc.analysis.jsonLd.map(subjectObject).filter((s) => s !== null);
    for (const subject of subjects) {
      const type = stringProperty(subject, "@type");

      // Containment, not similarity — `title-h1-mismatch`'s test, on the one
      // other string that is DEFINITIONALLY the same fact as the visible
      // heading. Exactly one h1 for that finding's reason too: with none there
      // is nothing visible to compare, with several no answer to which.
      const headline = type === "Article" || type === "BlogPosting" ? stringProperty(subject, "headline") : null;
      if (headline !== null && h1s.length === 1) {
        const a = norm(headline);
        const b = norm(h1s[0].text);
        if (b !== "" && !a.includes(b) && !b.includes(a)) {
          add(doc, "jsonld-headline-mismatch", "incomplete",
            `the structured data headline is ${JSON.stringify(headline)} but the <h1> reads ${JSON.stringify(h1s[0].text)}`,
            "make one of them contain the other, so a rich result and the page agree",
            headline); // which block, when a page carries more than one
        }
      }

      // The page telling a consumer two different things about its own
      // address. Both values resolve through ONE reader (see
      // `outputPathNamedBy`), and the finding fires only when BOTH resolve to
      // a page this manifest holds: anything else is another site's business
      // or P13's, never a second opinion here.
      const declared = stringProperty(subject, "url");
      if (declared !== null && canonical !== null) {
        const named = outputPathNamedBy(declared, doc, base, byOutputPath);
        const canonicalTarget = outputPathNamedBy(canonical, doc, base, byOutputPath);
        if (named !== null && canonicalTarget !== null && named !== canonicalTarget) {
          add(doc, "jsonld-url-mismatch", "broken",
            `the structured data url is ${JSON.stringify(declared)}, which names ${named}, but the canonical names ${canonicalTarget}`,
            "give both the same address — a page that names two of its own URLs has told consumers neither",
            declared); // which block's url, when a page carries more than one
        }
      }

      const inLanguage = stringProperty(subject, "inLanguage");
      if (inLanguage !== null && lang !== null && primarySubtag(inLanguage) !== primarySubtag(lang)) {
        add(doc, "jsonld-lang-mismatch", "broken",
          `the structured data says inLanguage ${JSON.stringify(inLanguage)} and the document declares lang ${JSON.stringify(lang)}`,
          "name one language in both — a document that answers that question twice has answered it for nobody",
          inLanguage); // which block, when a page carries more than one
      }
    }

    // Two blocks naming ONE entity by `@id` and classing it two ways. The
    // `@id` is exactly what separates this from the shape §24.4 already
    // blesses: a second `ld+json` with a different `@type` and no shared id is
    // two entities — a `WebPage` beside an `Organization` — which is
    // recommended practice, not a contradiction.
    const typesById = new Map();
    for (const subject of subjects) {
      const id = stringProperty(subject, "@id");
      const type = stringProperty(subject, "@type");
      if (id === null || type === null) continue;
      if (!typesById.has(id)) typesById.set(id, []);
      const types = typesById.get(id);
      if (!types.includes(type)) types.push(type);
    }
    for (const id of [...typesById.keys()].sort()) {
      const types = typesById.get(id);
      if (types.length < 2) continue;
      add(doc, "jsonld-entity-conflict", "broken",
        `the structured data gives @id ${JSON.stringify(id)} more than one type: ${types.map((t) => JSON.stringify(t)).join(", ")}`,
        "give one @id one @type, or give the other entity an @id of its own",
        id); // §31.2's own precedent, "one finding per @id"
    }

    // ---- a date no consumer can use ---------------------------------------
    // The one §26.3 finding that reads no JSON-LD. §20.10 splits a date into
    // {raw, iso} so that "what did the author write" and "what can anything
    // emit" never collapse; `raw` present with `iso` null is a page that
    // declared a date NO consumer can use — not §21.3's <lastmod>, not §26.6's
    // datePublished, not a crawler. Before this finding existed every one of
    // them dropped that value in silence, which is the failure class §14 exists
    // to forbid, moved one register over.
    //
    // The evidence quotes `raw`: the author's own bytes, and the only string
    // they can grep for, since §20.10 emits `raw` nowhere else.
    const dates = publicationDatesOf(doc);
    for (const [field, value] of [["datePublished", dates.published], ["dateModified", dates.modified]]) {
      if (value === null || value.iso !== null) continue;
      add(doc, "date-unusable", "broken",
        `${field} is ${JSON.stringify(value.raw)}, which is not a W3C date — nothing this build emits can use it`,
        `write it as YYYY-MM-DD, or YYYY-MM-DDThh:mm:ssTZD with a time zone — the format ${field} is defined in`,
        field); // one finding per field, datePublished first (§26.3)
    }

    // ---- redirect chains ---------------------------------------------------
    const chain = redirectChain(doc, byOutputPath);
    if (chain !== null) {
      add(doc, "redirect-loop", "broken",
        `the page declares content=${JSON.stringify(refreshOf(doc).raw)} and the chain returns to it: ` +
        `${chain.map((d) => d.source.path).join(" → ")}`,
        "point one redirect on that chain at a page that stays, or remove it — a reader who follows it never arrives");
    }

    // ---- structured data at a subpath deploy address -----------------------
    // §11 never rewrites a URL inside JSON-LD (§11.1), so a root-relative value
    // resolves in the output tree and passes §12 while naming the ORIGIN's root
    // at the deploy address. The values are §12's own — `jsonLdReferences` is
    // the single reader, so a value reported here is one the reference check
    // accepted as a locator (a URL-valued property's), never a string that
    // merely looked like a path: telling an author to prefix an `@id` or a URI
    // template would be advice about a value that is not an address.
    //
    // The site's own path prefix is the WHOLE test, and it is one question with
    // one owner. A second gate asking "did --base-url supply a path?" would be
    // a different reading of the same fact that could only ever agree with this
    // one: with no address, and at a root deploy, the prefix unify knows is "/"
    // — §20.5's own convention — and every root-relative value already begins
    // with it, so the loop says nothing without being told to.
    const prefix = base === null ? "/" : base.pathPrefix;
    const unprefixed = new Set();
    for (const entry of doc.analysis.jsonLd) {
      if (entry.error !== null) continue; // §24.4's jsonld-invalid owns that page
      for (const v of jsonLdReferences(entry.data)) {
        // An author who wrote /repo/img/logo.png did by hand what §11.3 does
        // for an href, and it is right at the address they named.
        if (!v.startsWith(prefix)) unprefixed.add(v);
      }
    }
    for (const v of [...unprefixed].sort()) {
      // `base` is non-null here by construction: a value can only fail the test
      // above under a prefix other than "/", which only --base-url produces.
      const published = prefix + v.slice(1);
      add(doc, "jsonld-url-unprefixed", "broken",
        `the structured data names ${JSON.stringify(v)}, which this site publishes at ${JSON.stringify(published)}`,
        `write the full URL ${base.origin}${published}, or a value relative to the page` +
        ` — a root-relative one resolves at the origin, above this site's own root`,
        v); // §31.2 names this one: "the unprefixed value for jsonld-url-unprefixed"
    }

    // ---- social image ------------------------------------------------------
    // Only the dimensions. A share image naming no emitted file is already
    // P13 — §12 has always checked `content` on every og:/twitter: meta
    // — so a finding here would answer one question with two mechanisms, and
    // answer it worse: P13 blocks the publish, a finding only reports. §24.4
    // records the reasoning; this is where it would otherwise have been added.
    if (image !== null) {
      if (image.width === null || image.height === null) {
        // §20.3 reads the dimensions only when og:image supplied the url, so a
        // twitter:image-only page reaches here with og:image:width and
        // og:image:height BOTH declared. Saying "declares no og:image:width"
        // there is a false statement about the page, under a fix that changes
        // nothing (§24.5). The action that clears it is the one named.
        const [evidence, fix] = image.fromOg
          ? ["the share image declares no og:image:width and og:image:height",
             "declare both — some crawlers skip an image whose size they cannot know in advance"]
          : ["the share image comes from twitter:image, which carries no dimensions",
             "add an og:image with og:image:width and og:image:height — og:image is what dimensions attach to"];
        add(doc, "image-missing-dimensions", "incomplete", evidence, fix);
      }
    }

    // ---- discovery-artifact agreement --------------------------------------
    // Both cross-artifact findings turn on ONE question — WHICH page does this
    // page's canonical name? — so both read §21.2's own `classifyCanonical`.
    //
    // Two readings of that question have already produced a finding whose
    // evidence quoted the page's own URL back at it, and both are excluded
    // here by construction. It may not be asked through `isPublicDestination`,
    // which answers a broader question (membership) that a `noindex` page
    // fails for an unrelated reason. And an *unresolvable* canonical is not
    // "somewhere else": with no --base-url every absolute canonical is
    // unresolvable, so `null` must not accuse. The finding is therefore
    // narrower without the site's address — a root-relative canonical still
    // resolves, an absolute one cannot — and saying nothing is the only
    // honest answer when unify does not know where the site lives.
    const elsewhere = classifyCanonical(doc, base) === "elsewhere";

    // The cross-canonical shape, which is the contradiction: a page telling
    // crawlers not to index it while consolidating onto something else. A
    // canonical naming the page itself is redundant there, not contradictory —
    // §22.4 declines to complete one on a noindex page for the same reason.
    if (!robots.indexable && elsewhere) {
      add(doc, "canonical-noindex", "broken",
        `the page is ${JSON.stringify(foldSpaces(robots.raw))} and its canonical points at ${JSON.stringify(canonical)}`,
        "drop one of them — a page cannot both refuse indexing and nominate a replacement");
    }
    const listedBy = sitemapLocs.get(doc.outputPath);
    if (listedBy !== undefined && !robots.indexable) {
      add(doc, "sitemap-noindex", "broken",
        `${listedBy} lists this page, but the page is ${JSON.stringify(foldSpaces(robots.raw))}`,
        `remove it from ${listedBy}, or remove the robots meta`);
    }
    if (listedBy !== undefined && elsewhere) {
      add(doc, "sitemap-canonical-disagree", "broken",
        `${listedBy} lists this page, but its canonical names ${JSON.stringify(canonical)}`,
        `list the canonical URL instead, or remove this page from ${listedBy}`);
    }

    // §24.4 — the scheme `classifyCanonical` excludes from its host comparison.
    // The `self` inside it is what makes this a different fault from the two
    // findings above rather than a second complaint about one line: this build
    // publishes the page at doc.document.url while the page nominates another
    // address for itself. That contradiction is the whole severity, so it
    // holds where no sitemap entry does — a noindex page and 404.html fire it
    // and §21.2 lists neither.
    if (canonicalSchemeMismatch(doc, base)) {
      add(doc, "canonical-scheme-mismatch", "broken",
        `the canonical is ${JSON.stringify(canonical)} but this page's URL is ${JSON.stringify(doc.document.url)}`,
        `write the canonical as ${JSON.stringify(doc.document.url)} — a canonical asks crawlers to consolidate on exactly the URL it names`);
    }

    // ---- duplicated visible text -------------------------------------------
    // IDENTICAL, not "substantially similar". A similarity threshold is a
    // number nobody can justify, so unify does not have one.
    if (doc.analysis.visibleText !== "") {
      const dupes = (byText.get(foldSpaces(doc.analysis.visibleText)) ?? []).filter((d) => d !== doc);
      if (dupes.length) {
        add(doc, "text-duplicate", "incomplete",
          `the visible text is identical to ${listPaths(dupes)}`,
          "give the pages different content, or keep one and redirect the rest");
      }
    }
  }

  // ---- a sitemap robots.txt promises and this build never wrote -------------
  // The one finding whose subject is not a page: it is located at the source
  // `robots.txt` and carries no url, because there is no record to read. §23.3
  // exempts `Sitemap: /sitemap.xml` from P13 when no --base-url told §21 where
  // the site lives — the author's line is right for the deployed site, and
  // blocking would fail a correct site over a flag they did not pass. This is
  // that exemption's stated limit, reported where §23.4 assigns every judgement
  // about intent.
  //
  // `incomplete`, not `broken`: the markup is right. Run the same audit with
  // --base-url and the file exists, the line resolves, and nothing is reported
  // — so what is absent is this run's output, not the author's line, and a
  // `broken` that a command-line flag repairs is the accusation this catalogue
  // has already withdrawn twice (§24.4).
  //
  // The values arrive from the branch that skipped them, so the exemption and
  // the finding cannot disagree about which lines they are, and the quoted
  // spelling is the author's own — §23.1 rewrites no byte of that file.
  for (const { file, value } of exemptedSitemaps) {
    out.push({
      id: "robots-sitemap-missing",
      severity: "incomplete",
      file,
      outputPath: null, // not a page — there is no record to read (see the comment block above)
      url: null,
      distinguisher: value, // more than one exempted line in one robots.txt needs its own identity
      evidence: `the Sitemap: line names ${JSON.stringify(value)}, and no file is emitted there — a sitemap is generated only under --base-url`,
      fix: "build with --base-url, or add a sitemap.xml of your own at the source root",
    });
  }

  const findings = sortFindings(out);
  // §31.1's only channel out — see `lastAuditRun`'s own comment for why this
  // exists and why it is safe.
  lastAuditRun = { documents, base, findings, htmlFiles };
  return findings;
}

function listPaths(documents) {
  const names = documents.map((d) => d.source.path).sort();
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

function truncate(s, n = 60) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/**
 * §24.3 — the human report. Evidence and a fix, never a score.
 *
 * `problemCount` is the §14 tally the same run reported, and it is here for
 * one reason: §24.6 exits 1 on a pipeline problem regardless of findings, so a
 * run that hit one and found nothing printed the problem, then said "audit:
 * nothing to report", then exited 1 — three lines that read as a tool bug. The
 * severity axes stay separate, as §24.4 requires; the summary just stops
 * pretending the other one was not there.
 *
 * @param {Finding[]} findings
 * @param {number} [problemCount] - §14 problems reported by the same run
 * @returns {string}
 */
export function formatFindings(findings, problemCount = 0) {
  const problems = problemCount > 0
    ? `${problemCount} ${problemCount === 1 ? "problem" : "problems"} (reported above; the build could not publish)`
    : "";
  if (!findings.length) {
    return problems ? `audit: no findings, and ${problems}` : "audit: nothing to report";
  }
  const lines = [];
  for (const f of findings) {
    // The same `(generated)` marker §33.4 already uses in the collision
    // report and the --dry-run rows, for the same reason: a reader who
    // greps their source tree for this path must not come up empty.
    const where = f.generated === true ? `${f.file} (generated)` : f.file;
    lines.push(`${where}: ${f.severity}: ${f.evidence} [${f.id}]`);
    lines.push(`  fix: ${f.fix}`);
  }
  const broken = findings.filter((f) => f.severity === "broken").length;
  const incomplete = findings.length - broken;
  lines.push(
    problems
      ? `audit: ${broken} broken, ${incomplete} incomplete, and ${problems}`
      : `audit: ${broken} broken, ${incomplete} incomplete`,
  );
  return lines.join("\n");
}

/**
 * §31.3 — turn `external.js`'s network-probe results into `external-unreachable`
 * findings. The only finding this catalogue adds outside `auditManifest`
 * itself, because it is the only one whose evidence depends on the network:
 * everything else is decidable from the §20 manifest alone, and this one
 * needs `--external`'s own round trip first (`cli/commands/audit.js` runs
 * that, then calls this).
 *
 * `incomplete`, never `broken` — §31.3's own distinction: "the answer is
 * about someone else's server at one moment", not about this site's output,
 * so the `broken` severity §24.3 reserves for a self-contradiction would be
 * unearned. One finding per distinct URL (`results`' own keys, already
 * deduplicated by `external.js`'s `probeUrls`), located at the FIRST page
 * that references it in manifest order (`owners`, from
 * `collectExternalReferences`) — the same "first in document/manifest order
 * wins" rule §20.4 and §21.2 already use for locating a shared fault.
 * @param {Map<string, import('./external.js').ProbeResult>} results
 * @param {Map<string, import('./manifest.js').BuildDocument>} owners - url -> the
 *   first referencing document, from `external.js`'s `collectExternalReferences`
 * @returns {Finding[]} §24.5's order
 */
export function externalUnreachableFindings(results, owners) {
  const out = [];
  // Sorted by URL before anything is built, so this function's output does not
  // depend on which probe finished first. `sortFindings` below cannot rescue
  // that on its own: every finding here shares one `file` and one `id`, so a
  // stable sort would preserve exactly the network-completion order it was
  // handed — which made two runs over one unchanged tree emit different bytes,
  // against §31.3's own "two runs print the same bytes whatever the network
  // did". Both halves are kept: this sort makes the input deterministic, and
  // `sortFindings`'s third key makes the output total regardless of input.
  for (const [url, result] of [...results].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (result.ok) continue;
    const doc = owners.get(url);
    if (!doc) continue; // defensive: every key of `results` came from `owners`' own keys
    out.push({
      id: "external-unreachable",
      severity: "incomplete",
      file: doc.source.path,
      outputPath: doc.outputPath,
      url: doc.document.url,
      distinguisher: url, // §31.3: "one finding per distinct URL"
      evidence: `${JSON.stringify(url)} ${result.error}`,
      fix: "confirm the URL is correct, or remove the reference — the failure may be on the other server rather than this one, not in this site's output",
    });
  }
  return sortFindings(out);
}
