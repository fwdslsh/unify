/**
 * `structured-data.js` — conformance-spec §26.
 *
 * Two halves, deliberately unequal in size, and the asymmetry is the design:
 * unify **validates** structured data at length and **generates** almost none
 * of it (product-spec §6.3.6). This module owns the small half plus the one
 * reading both halves share; §24's evaluator owns the findings themselves.
 *
 * What lives here:
 *
 *  - **`subjectObject`/`stringProperty` (§26.2)** — the bounded reading every
 *    §26.3 comparison starts from. A JSON-LD entry contributes a subject only
 *    when its `data` is a single object that is not a `@graph` wrapper, and
 *    only that object's own string-valued properties are read. An array and a
 *    graph are several entities, and deciding which of them is *this page* is
 *    a judgement rather than a reading — §20.8 drew that line for `schemaType`
 *    and this is the same line, applied to one more question, so the two
 *    cannot disagree about what a block declares.
 *
 *  - **P23 (§26.4)** — `<meta name="schema">` is unify's own key, defined by
 *    no standard, so constraining its values constrains unify's vocabulary
 *    rather than the author's HTML. It is read WITH THE HEAD (§20.3), so a
 *    body-placed declaration is not P23 at all: it declares nothing, generates
 *    nothing, and is §24.4's `metadata-in-body`, whose closed set names
 *    `schema` for that reason. Exactly three spellings generate, and they
 *    are case-sensitive: `article` is not a schema.org type, and a declaration
 *    that generated nothing *in silence* is the failure class §14 exists to
 *    forbid. A page needing `Product` or `Recipe` writes its own block — which
 *    also switches generation off (§26.5), so the two never fight.
 *
 *  - **The generator (§26.5–§26.8)** — one `<script type="application/ld+json">`
 *    before `</head>`, built from **record fields only** (§20), never from
 *    frontmatter. That is §20.2's equal-citizen rule doing its work: an HTML
 *    page generates exactly what a Markdown page with the same emitted head
 *    generates, and character references are already resolved (§20.3) so the
 *    JSON carries the text a reader sees.
 *
 * Three properties are load-bearing and easy to lose in a later edit:
 *
 *  1. **It fills a gap; it never adjudicates.** Any authored `ld+json`
 *     anywhere in the document switches generation off (§26.5's condition 2 —
 *     document-wide, not head-scoped, because §20.8 is not and §24.4's
 *     `metadata-in-body` says outright that `ld+json` does its job in the
 *     body). §22.3's rule, one artifact over.
 *
 *  2. **Nothing here invents a fact.** No `publisher`, no `@id`, no
 *     `articleBody`/`wordCount`/`keywords` derived from `record.text`, no
 *     `isPartOf`/`breadcrumb`/`speakable`, no image dimensions, and no date
 *     from any source but an authored well-formed one (§26.8). `author` is a
 *     **plain string** and never `{"@type": "Person", …}`: `<meta
 *     name="author">` declares a name and says nothing about what kind of
 *     thing bears it, and asserting `Person` about an organization's
 *     publication is the invented claim product-spec §6.1 forbids by name.
 *
 *  3. **Serialization is fixed**, so two builds of one tree emit identical
 *     bytes: two-space indentation, the §26.6 property order, and every `<`
 *     written `\u003c`. That last is not decoration — a description containing
 *     `</script>` would otherwise end the element early and spill the rest of
 *     the JSON into the document as text.
 *
 * No finding is defined here. §26.3's five are §24's, because they are
 * predicates over the §20 manifest like every other finding and `build`
 * consults them exactly as much as it consults those — not at all (§24.7).
 */

import { decodeEntities } from "./entities.js";
import { findAll, findFirst, getAttr, isElement, isInside, parse } from "./html.js";

/**
 * §26.4 — the closed set, spelled exactly. Not a claim that other types do not
 * matter: any other vocabulary is written by hand in a `<script
 * type="application/ld+json">`, which is product-spec §6.3.6's own instruction.
 */
export const GENERATED_TYPES = ["WebPage", "Article", "BlogPosting"];
const ACCEPTED = new Set(GENERATED_TYPES);
/** The three, as §26.4's own prose spells them in a sentence. */
const TYPE_LIST = `${GENERATED_TYPES.slice(0, -1).join(", ")}, or ${GENERATED_TYPES.at(-1)}`;

/**
 * §26.2 — the subject object of one JSON-LD entry, or `null` when the entry
 * has none.
 *
 * A block that did not parse has no subject (§24.4's `jsonld-invalid` owns
 * that page, and reading fields out of broken JSON would report one fault
 * twice). An array is several entities. A `{"@graph": […]}` wrapper is several
 * entities with a lid on.
 *
 * The cost is stated rather than hidden: `@graph` is how several
 * widely-deployed CMS plugins emit structured data, so on those pages every
 * §26.3 **comparison** is silent — the four findings that read a block, and
 * not `date-unusable`, which reads the record's own dates and no JSON-LD at
 * all (§26.3's own row). That is the conservative direction — §24.3's
 * severities are claims about a document, and a claim about the wrong node of
 * a graph is worse than no claim. A later revision that wants those pages must
 * first say *which* node is the page, in §26, with the rule written down.
 * @param {import('./manifest.js').JsonLdEntry} entry
 * @returns {Record<string, unknown>|null}
 */
export function subjectObject(entry) {
  if (!entry || entry.error !== null) return null;
  const data = entry.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  if (Object.hasOwn(data, "@graph")) return null;
  return data;
}

/**
 * §26.2 — one of a subject object's **own string-valued** properties, trimmed,
 * or `null` when the property is absent, is not a string, or is empty.
 *
 * The same reading §20.8 gives `@type`, and for the same reason: a property
 * whose value is an object, an array, or a number declares something this
 * section does not know how to compare, and comparing it anyway would be the
 * guess the bounded reading exists to refuse.
 * @param {Record<string, unknown>} subject
 * @param {string} name
 * @returns {string|null}
 */
export function stringProperty(subject, name) {
  const value = subject[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The `content` of a synthesized-or-authored meta, read exactly as §20.3 reads
 * an attribute: character references resolved, trimmed, empty is absent. Read
 * any other way, `<meta name="schema" content="&#65;rticle">` and
 * `content="Article"` would be two different declarations of one type.
 * @param {string|null} value
 * @returns {string|null}
 */
function attrText(value) {
  if (typeof value !== "string") return null;
  const trimmed = decodeEntities(value).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * §26.4/P23 — check every `schema` declaration this page emits.
 *
 * Scope is §20.8's, not a second one: the `<meta name="schema">` spelling is
 * read **with the head** (§20.3), a document with no `<head>` at all is read
 * whole (§20.3's own rule), and `<template>` contents declare nothing (§20.2 —
 * `findAll` refuses to descend). Reading it anywhere else would diagnose a
 * declaration §20.8 never accepted, which is a problem raised against markup
 * that changes nothing.
 *
 * It is located **at the declaration**, through the build's ordinary
 * provenance locator: the `<meta>` element and its line for an HTML page, and
 * for a Markdown page the `.md` file with **no line** — §10.1 converts before
 * it inlines, so an offset attributed to a `.md` source indexes converted HTML
 * and no line of the author's file corresponds to it. §14.1 requires the
 * line-less `FILE: problem:` form there rather than a plausible-looking number.
 *
 * The return value is not the rule and must never become it: it says only
 * whether this page *might* generate, so the caller can skip deriving a
 * manifest for a site that opted into nothing (§26.5's "the declaration is the
 * whole opt-in"). Whether a page generates is `record.schemaType`'s answer
 * alone (§26.5's condition 1) — this is a superset of it by construction,
 * since under condition 2 the surviving `schemaType` is always a meta's.
 *
 * @param {object} args
 * @param {string} args.html - the page's emitted text
 * @param {string} args.outputPath - the emitted file, for the locator
 * @param {import('./references.js').Locate} args.locate
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {boolean} true when the page declares one of the three accepted types
 */
export function checkSchemaDeclarations({ html, outputPath, locate, reporter }) {
  const { root } = parse(html);
  const head = findFirst(root, (n) => isElement(n, "head"));
  let generable = false;

  for (const el of findAll(root, (n) => isElement(n, "meta") && (getAttr(n, "name") ?? "").trim().toLowerCase() === "schema")) {
    if (head !== null && !isInside(el, "head")) continue;
    const value = attrText(getAttr(el, "content"));
    if (value === null) continue; // `content=""`, or none at all: names no type
    if (ACCEPTED.has(value)) {
      generable = true;
      continue;
    }
    const at = locate(outputPath, el.start);
    // The fix is spelled in the vocabulary of the file the author will open:
    // a Markdown page declared this in frontmatter and has no element to edit.
    const fromFrontmatter = at.file.toLowerCase().endsWith(".md");
    // A value that differs from an accepted type only in case gets that type
    // back, spelled correctly — the whole fault is the spelling. Anything else
    // names a type unify does not generate at all, so the fix is the list, and
    // the escape hatch is the same sentence either way.
    const near = GENERATED_TYPES.find((t) => t.toLowerCase() === value.toLowerCase());
    const write = near
      ? (fromFrontmatter ? `write schema: ${near}` : `write <meta name="schema" content="${near}">`)
      : `declare one of ${TYPE_LIST}`;
    reporter.problem({
      file: at.file,
      line: at.line,
      message: `schema is ${JSON.stringify(value)} — unify generates ${TYPE_LIST}, spelled exactly`,
      fixes: [`${write}, or write the block yourself in a <script type="application/ld+json">`],
    });
  }
  return generable;
}

/**
 * §26.6 — the object to serialize, in the section's own property order.
 *
 * Every value is a **record field** (§20), never frontmatter, and every one is
 * omitted when its source is absent. §26.6 argues four of these choices rather
 * than asserting them, and every one is visible in the lines below.
 * `headline` for an article and `name` for a page: a `WebPage` defines no
 * `headline`, and `headline` is the property Google's Article documentation
 * reads, so the other pairing would emit one property that is unread and one
 * its type does not define. `author` is a plain string. And `url` is the
 * **final** canonical, which is why §26.7 orders generation after §22 — a page
 * whose canonical `--canonical auto` supplied must generate *that* URL, not a
 * second opinion about its own address.
 *
 * A date is emitted only from `iso`. `raw` is never emitted anywhere (§20.10),
 * so a page whose `date:` is not W3C-DTF generates no `datePublished` — and
 * says so, through §26.3's `date-unusable`, rather than emitting a value that
 * is invalid where it lands.
 * @param {import('./manifest.js').PageRecord} record
 * @returns {Record<string, string>}
 */
function structuredDataFor(record) {
  /** @type {Record<string, string>} */
  const out = { "@context": "https://schema.org", "@type": record.schemaType };
  const put = (key, value) => {
    if (value !== null && value !== undefined) out[key] = value;
  };
  put(record.schemaType === "WebPage" ? "name" : "headline", record.title);
  put("description", record.description);
  put("url", record.canonical ?? record.url);
  put("image", record.image === null ? null : record.image.url);
  put("author", record.author);
  put("datePublished", record.datePublished === null ? null : record.datePublished.iso);
  put("dateModified", record.dateModified === null ? null : record.dateModified.iso);
  put("inLanguage", record.lang);
  return out;
}

/**
 * §26.6 — the fixed serialization.
 *
 * Two-space indentation and the table's property order (insertion order, which
 * `structuredDataFor` fixes), so two builds of one tree produce identical
 * bytes. Then every `<` becomes `\u003c`: a description containing
 * `</script>` would otherwise end the element early and put the rest of the
 * JSON into the document as text. `\u003c` is a JSON string escape, so the
 * block a consumer parses is unchanged — and `<` cannot appear anywhere in
 * JSON but inside a string, so the replacement is total and touches no syntax.
 * @param {Record<string, string>} data
 * @returns {string}
 */
function serialize(data) {
  return JSON.stringify(data, null, 2).replaceAll("<", "\\u003c");
}

/**
 * §26.5–§26.7 — generate one page's structured data, or return its text
 * unchanged.
 *
 * The three activation conditions, in §26.5's own order: the page declares one
 * of the three generated types; it emits **no** `ld+json` anywhere in the
 * document (authored structured data always wins — a gap is filled, a value
 * the author chose is never adjudicated); and the emitted document has a
 * `<head>` with a closing tag, since with no `</head>` there is no insertion
 * point and synthesizing one would be a structural change §26 does not make
 * (§22.2's rule, unchanged).
 *
 * @param {string} html - the page's emitted text, after §11's URL phases and §22
 * @param {import('./manifest.js').PageRecord} record - derived from THAT text
 * @returns {{text: string, insertions: {at: number, length: number}[]}} the
 *   text to publish, and where bytes were added — §14.1's diagnostic locator
 *   indexes span tables computed BEFORE this ran, so it needs to undo them.
 */
export function generateStructuredData(html, record) {
  const unchanged = { text: html, insertions: [] };
  if (record.schemaType === null || !ACCEPTED.has(record.schemaType)) return unchanged;
  // §26.5's condition 2, document-wide: `jsonLd` is every `ld+json` block the
  // page emits, head or body (§20.3), a `<template>`'s contents excluded
  // (§20.2). Head-scoping it here would generate a second, contradicting block
  // onto a page that wrote its own after its content — which §24.4's
  // `metadata-in-body` says outright is where `ld+json` does its job.
  if (record.jsonLd.length > 0) return unchanged;

  const { root } = parse(html);
  const head = findFirst(root, (n) => isElement(n, "head"));
  if (!head || head.endTagStart === null) return unchanged;

  // Reuse the whitespace immediately before `</head>` — the line terminator
  // included, so a CRLF document does not gain LF-terminated lines — and
  // preserve every other byte (§3/S01, §22.2's own rule and its own reading of
  // "the whitespace that precedes that tag").
  const before = html.slice(head.openTagEnd, head.endTagStart);
  const lead = /(\r?\n[ \t]*)$/.exec(before)?.[1] ?? "";
  // §26.6 fixes TWO things about this element and only a line break keeps
  // both: every line carries `</head>`'s own indentation, and the JSON between
  // those lines keeps the fixed two-space serialization. Joining on `lead`
  // alone satisfies the first and silently loses the second wherever there is
  // no whitespace to reuse — which is not an exotic case but the ORDINARY one:
  // §8's head merge routinely emits `…<meta …></head>` with `</head>` abutting
  // the last head element, so a Markdown page under a layout — the default
  // authoring path — produced `{  "@context": …,  "@type": …}` on one line,
  // with no two-space indentation anywhere in it. That is a different
  // serialization, not a different indent. Where there is no lead to reuse the
  // indentation is empty and the break is the document's own terminator.
  const eol = lead !== "" ? lead : (html.includes("\r\n") ? "\r\n" : "\n");
  const element = [
    '<script type="application/ld+json">',
    ...serialize(structuredDataFor(record)).split("\n"),
    "</script>",
  ].join(eol);
  // The element first, then the reused whitespace — so `</head>` keeps the
  // exact lead it had and the new element takes an identical one. Reversing
  // these strands the original whitespace and butts `</head>` against the block.
  const insertion = element + lead;
  return {
    text: html.slice(0, head.endTagStart) + insertion + html.slice(head.endTagStart),
    insertions: [{ at: head.endTagStart, length: insertion.length }],
  };
}
