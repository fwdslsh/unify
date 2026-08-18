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

import { classifyCanonical } from "./sitemap.js";

/**
 * @typedef {object} Finding
 * @property {string} id - stable machine identifier; never renamed
 * @property {'broken'|'incomplete'} severity
 * @property {string} file - the source path a reader should open
 * @property {string|null} url - the page's public address, when known
 * @property {string} evidence - what was observed, quoting the output
 * @property {string} fix - one concrete action
 */

/**
 * The fields a page may declare **once**, by the standard that defines them.
 *
 * §20.4's `conflicts` array is a record of which value the manifest kept, not
 * a claim that the markup is wrong, and reading it as one made `audit` report
 * conforming pages as `broken`. Two fields prove it:
 *
 *   - **`image`.** The Open Graph protocol defines arrays by repeating the
 *     tag — "if a tag can have multiple values, just put multiple versions of
 *     the same meta tag on your page; the first is given preference during
 *     conflicts" — and ogp.me's own `og:image` example ships two. A page with
 *     several share images is correct, common, and was being told to delete
 *     valid tags.
 *   - **`schemaType`.** §20.8 reads the first block's `@type` deliberately,
 *     as a bounded read. An `Organization` block beside a `BreadcrumbList` is
 *     routine and recommended, and every consumer parses every block, so the
 *     second is not "ignored".
 *
 * `author` is excluded too: a co-authored page names two authors, and the HTML
 * spec does not restrict `<meta name="author">` to one per document. What
 * remains is the set where a second differing value genuinely leaves consumers
 * without an answer.
 */
const SINGLE_VALUED = new Set([
  "canonical", "title", "description", "lang", "robots", "datePublished", "dateModified",
]);

/** Normalize a heading or title for comparison — case and whitespace only. */
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

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
 * @param {import('./manifest.js').PageRecord[]} args.records
 * @param {Map<string, import('./manifest.js').PageRecord>} args.byOutputPath
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {Map<string, string>} [args.sitemapLocs] - output path -> the sitemap
 *   file that lists it, for the discovery-artifact comparisons
 * @returns {Finding[]} ordered by source path, then by finding id
 */
export function auditManifest({ records, byOutputPath, base = null, sitemapLocs = new Map() }) {
  /** @type {Finding[]} */
  const out = [];
  const add = (record, id, severity, evidence, fix) =>
    out.push({ id, severity, file: record.sourcePath, url: record.url, evidence, fix });

  // ---- cross-page groupings, computed once ---------------------------------
  const group = (pick) => {
    const m = new Map();
    for (const r of records) {
      const key = pick(r);
      if (key === null || key === "") continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    return m;
  };
  const byTitle = group((r) => (r.title === null ? null : norm(r.title)));
  const byDescription = group((r) => (r.description === null ? null : norm(r.description)));
  const byText = group((r) => (r.text === "" ? null : foldSpaces(r.text)));

  for (const record of records) {
    const others = (m, key) => (key === null ? [] : (m.get(norm(key)) ?? []).filter((r) => r !== record));

    // ---- titles ------------------------------------------------------------
    if (record.title === null) {
      add(record, "title-missing", "incomplete",
        "the emitted <head> declares no <title>",
        "add a <title> to the page, or to its layout for a site-wide suffix");
    } else {
      const dupes = others(byTitle, record.title);
      if (dupes.length) {
        add(record, "title-duplicate", "incomplete",
          `the title ${JSON.stringify(record.title)} is also used by ${listPaths(dupes)}`,
          "give each page a title naming what is on it — the layout's suffix stays shared");
      }
    }

    // ---- descriptions ------------------------------------------------------
    if (record.description === null) {
      add(record, "description-missing", "incomplete",
        "the emitted <head> declares no <meta name=\"description\">",
        "add a description describing this page; a layout-wide one repeats on every page");
    } else {
      const dupes = others(byDescription, record.description);
      if (dupes.length) {
        add(record, "description-duplicate", "incomplete",
          `the description ${JSON.stringify(truncate(record.description))} is also used by ${listPaths(dupes)}`,
          "describe each page separately, or drop the shared one from the layout");
      }
    }

    // ---- headings ----------------------------------------------------------
    const h1s = record.headings.filter((h) => h.level === 1);
    if (h1s.length === 0) {
      add(record, "h1-missing", "incomplete",
        "the page emits no <h1>",
        "add one <h1> naming the page's subject");
    } else if (h1s.length > 1) {
      add(record, "h1-multiple", "incomplete",
        `the page emits ${h1s.length} <h1> elements: ${h1s.map((h) => JSON.stringify(truncate(h.text))).join(", ")}`,
        "keep one <h1> and demote the rest to <h2>");
    }
    // Containment, not similarity: §8 row 2 PREPENDS a page title to the
    // layout's, so "About — Site" legitimately contains the h1 "About". A
    // distance score would be a number nobody could defend.
    if (record.title !== null && h1s.length === 1) {
      const t = norm(record.title);
      const h = norm(h1s[0].text);
      if (h !== "" && !t.includes(h) && !h.includes(t)) {
        add(record, "title-h1-mismatch", "incomplete",
          `the title is ${JSON.stringify(record.title)} but the <h1> reads ${JSON.stringify(h1s[0].text)}`,
          "make one of them contain the other, so a search result and the page agree");
      }
    }

    // ---- language ----------------------------------------------------------
    if (record.lang === null) {
      add(record, "lang-missing", "incomplete",
        "the emitted <html> has no lang attribute",
        'set it on the layout: <html lang="en">');
    }

    // ---- orphans -----------------------------------------------------------
    // The site root is reachable by definition and 404.html is never linked, so
    // neither is an orphan; every other page nothing links to is unreachable by
    // a reader who did not already have its URL.
    // A self-link is not an incoming link. §20.9 records one (a permalink, a
    // "back to top" href to the page's own URL), and counting it made a page
    // nothing else links to unreportable — contradicting this finding's own
    // evidence line, which has always said "no OTHER page links to this one".
    const linksInFromElsewhere = record.linksIn.filter((p) => p !== record.outputPath);
    if (linksInFromElsewhere.length === 0 && record.outputPath !== "index.html" && record.outputPath !== "404.html") {
      add(record, "page-orphan", "incomplete",
        "no other page links to this one",
        "link to it from a page that is reachable, or exclude it with a leading underscore");
    }

    // ---- ids and fragments -------------------------------------------------
    const seen = new Set();
    const repeated = new Set();
    for (const id of record.ids) (seen.has(id) ? repeated : seen).add(id);
    for (const id of [...repeated].sort()) {
      add(record, "id-duplicate", "broken",
        `the id ${JSON.stringify(id)} is declared more than once`,
        "make each id unique — a duplicate makes every link to it ambiguous");
    }
    for (const link of record.fragmentLinks) {
      const target = byOutputPath.get(link.target);
      if (!target || target.ids.includes(link.id)) continue;
      add(record, "fragment-missing", "broken",
        `${JSON.stringify(`#${link.id}`)} in ${link.target === record.outputPath ? "this page" : link.target} names no element`,
        `add the id ${JSON.stringify(link.id)} to the element it should reach, or correct the link`);
    }

    // ---- contradictory declarations ----------------------------------------
    // §20.4 keeps the first of two differing values and records the loser;
    // §22.5 assigns the reporting of that to this command by name. Without
    // this loop the record carried the data and nothing read it, so a page
    // declaring two different canonicals — the case product-spec §6.3.2 asks
    // to have reported — was silent in `build` AND in `audit`.
    for (const conflict of record.conflicts) {
      if (!SINGLE_VALUED.has(conflict.field)) continue;
      add(record, "metadata-conflict", "broken",
        `the page declares ${conflict.discarded.length + 1} different values for ${conflict.field}: ` +
        `${JSON.stringify(truncate(conflict.kept))} is used, ` +
        `${conflict.discarded.map((d) => JSON.stringify(truncate(d))).join(", ")} ignored`,
        `keep one — a page that declares two answers to one question has given consumers no answer`);
    }

    // ---- metadata placement ------------------------------------------------
    // §20.3 already declined to READ these; this says so out loud, because a
    // silently-dropped <title> is indistinguishable from one never written.
    for (const el of record.strayMetadata) {
      const shown = el.key === null ? `<${el.tag}>`
        : el.tag === "link" ? `<link rel="${el.key}">`
        : el.key === "charset" ? "<meta charset>"
        : `<meta ${el.key.startsWith("og:") ? "property" : "name"}="${el.key}">`;
      add(record, "metadata-in-body", "broken",
        `${shown} is emitted outside <head>, where no browser or crawler reads it`,
        `move it into <head> — in the page's own <head>, or the layout's if every page needs it`);
    }

    // ---- structured data ---------------------------------------------------
    for (const entry of record.jsonLd) {
      if (entry.error === null) continue;
      add(record, "jsonld-invalid", "broken",
        `a <script type="application/ld+json"> does not parse: ${entry.error}`,
        "correct the JSON — a block that does not parse is ignored entirely");
    }
    if (record.schemaType === "Article" || record.schemaType === "BlogPosting") {
      // Objective because product-spec §6.3.6 names exactly the fields bounded
      // generation may use: a declared Article with no title or no authored
      // date cannot produce valid structured data from them.
      const missing = [];
      if (record.title === null) missing.push("a title");
      if (record.datePublished === null || record.datePublished.iso === null) missing.push("an authored ISO 8601 date");
      if (missing.length) {
        add(record, "schema-incomplete", "incomplete",
          `the page declares ${record.schemaType} but supplies ${missing.join(" and ")} — the fields structured data is built from`,
          "supply them, or drop the declared type rather than publish a partial claim");
      }
    }

    // ---- social image ------------------------------------------------------
    // Only the dimensions. A share image naming no emitted file is already
    // P13 — §12 has checked `content` on every og:/twitter: meta since v0.7.0
    // — so a finding here would answer one question with two mechanisms, and
    // answer it worse: P13 blocks the publish, a finding only reports. §24.4
    // records the reasoning; this is where it would otherwise have been added.
    if (record.image !== null) {
      if (record.image.width === null || record.image.height === null) {
        // §20.3 reads the dimensions only when og:image supplied the url, so a
        // twitter:image-only page reaches here with og:image:width and
        // og:image:height BOTH declared. Saying "declares no og:image:width"
        // there is a false statement about the page, under a fix that changes
        // nothing (§24.5). The action that clears it is the one named.
        const [evidence, fix] = record.image.fromOg
          ? ["the share image declares no og:image:width and og:image:height",
             "declare both — some crawlers skip an image whose size they cannot know in advance"]
          : ["the share image comes from twitter:image, which carries no dimensions",
             "add an og:image with og:image:width and og:image:height — og:image is what dimensions attach to"];
        add(record, "image-missing-dimensions", "incomplete", evidence, fix);
      }
    }

    // ---- discovery-artifact agreement --------------------------------------
    // Both cross-artifact findings turn on ONE question — WHICH page does this
    // page's canonical name? — so both read §21.2's own `canonicalTarget`.
    //
    // Two readings of that question have already produced a finding whose
    // evidence quoted the page's own URL back at it, and both are excluded
    // here by construction. It may not be asked through `isCompletablePage`,
    // which answers a broader question (membership) that a `noindex` page
    // fails for an unrelated reason. And an *unresolvable* canonical is not
    // "somewhere else": with no --base-url every absolute canonical is
    // unresolvable, so `null` must not accuse. The finding is therefore
    // narrower without the site's address — a root-relative canonical still
    // resolves, an absolute one cannot — and saying nothing is the only
    // honest answer when unify does not know where the site lives.
    const elsewhere = classifyCanonical(record, base) === "elsewhere";

    // The cross-canonical shape, which is the contradiction: a page telling
    // crawlers not to index it while consolidating onto something else. A
    // canonical naming the page itself is redundant there, not contradictory —
    // §22.4 declines to complete one on a noindex page for the same reason.
    if (!record.robots.indexable && elsewhere) {
      add(record, "canonical-noindex", "broken",
        `the page is ${JSON.stringify(foldSpaces(record.robots.raw))} and its canonical points at ${JSON.stringify(record.canonical)}`,
        "drop one of them — a page cannot both refuse indexing and nominate a replacement");
    }
    const listedBy = sitemapLocs.get(record.outputPath);
    if (listedBy !== undefined && !record.robots.indexable) {
      add(record, "sitemap-noindex", "broken",
        `${listedBy} lists this page, but the page is ${JSON.stringify(foldSpaces(record.robots.raw))}`,
        `remove it from ${listedBy}, or remove the robots meta`);
    }
    if (listedBy !== undefined && elsewhere) {
      add(record, "sitemap-canonical-disagree", "broken",
        `${listedBy} lists this page, but its canonical names ${JSON.stringify(record.canonical)}`,
        `list the canonical URL instead, or remove this page from ${listedBy}`);
    }

    // ---- duplicated visible text -------------------------------------------
    // IDENTICAL, not "substantially similar". A similarity threshold is a
    // number nobody can justify, so unify does not have one.
    if (record.text !== "") {
      const dupes = (byText.get(foldSpaces(record.text)) ?? []).filter((r) => r !== record);
      if (dupes.length) {
        add(record, "text-duplicate", "incomplete",
          `the visible text is identical to ${listPaths(dupes)}`,
          "give the pages different content, or keep one and redirect the rest");
      }
    }
  }

  return out.sort((a, b) =>
    a.file === b.file ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.file < b.file ? -1 : 1);
}

function listPaths(records) {
  const names = records.map((r) => r.sourcePath).sort();
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

function truncate(s, n = 60) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/**
 * §24.3 — the human report. Evidence and a fix, never a score.
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatFindings(findings) {
  if (!findings.length) return "audit: nothing to report";
  const lines = [];
  for (const f of findings) {
    lines.push(`${f.file}: ${f.severity}: ${f.evidence} [${f.id}]`);
    lines.push(`  fix: ${f.fix}`);
  }
  const broken = findings.filter((f) => f.severity === "broken").length;
  const incomplete = findings.length - broken;
  lines.push(`audit: ${broken} broken, ${incomplete} incomplete`);
  return lines.join("\n");
}
