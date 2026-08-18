/**
 * `canonical.js` — conformance-spec §22, canonical completion.
 *
 * The second projection of §20, and the first that writes *into* a page rather
 * than beside it. That difference is the whole risk, so two properties are
 * load-bearing:
 *
 *  1. **It fills a gap; it never adjudicates.** A page that declared any
 *     `rel="canonical"` is left exactly as written — several of them, one
 *     naming another page, one naming nothing this site emits. Completion is
 *     for the pages that said nothing (§22.3).
 *
 *  2. **Membership is §21.2's, imported rather than re-derived.** Stamping a
 *     canonical onto a `noindex` page would manufacture the very contradiction
 *     product-spec §6.3.2 asks unify to report, and a page consolidated onto
 *     another already has the canonical it wants — which is exactly why §21.2
 *     excluded it from the sitemap. One predicate, one answer (§22.4).
 *
 * No diagnostic is defined here. A canonical naming a location the site does
 * not emit is already P13 through §12's link-href check, and multiple
 * canonicals, canonical/noindex, and canonical/sitemap disagreement are the
 * evaluation command's business (§22.5).
 */

import { getAttr, isElement, findAll, findFirst, parse } from "./html.js";
import { isCompletablePage } from "./sitemap.js";

/**
 * §22.2 — the element, serialized exactly. Fixed form, matching §10.2's rule
 * for synthesized elements: double-quoted attributes, `rel` before `href`.
 * @param {string} url
 * @returns {string}
 */
function canonicalLink(url) {
  return `<link rel="canonical" href="${escapeAttr(url)}">`;
}

/**
 * HTML attribute escaping for a synthesized value.
 *
 * `record.url` can legitimately contain `&`: §20.5 deliberately does not
 * re-encode the `--base-url` path prefix, because the author wrote it as a
 * URL. Emitted raw into an attribute, a value like `.../&copy;x/` is a
 * character reference, and §20.3 says the manifest resolves those — so the
 * page came back declaring a canonical of `.../©x/`, §21.2's self-canonical
 * test then failed, and the page vanished from the sitemap of the build whose
 * flag exists to help crawlers find it. Silently. §21.3 XML-escapes for
 * exactly this reason; this is the same obligation one document type over.
 */
function escapeAttr(s) {
  return s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * §22 — complete the canonical of one emitted page, or return its text
 * unchanged.
 *
 * @param {string} html - the page's emitted text, after §11's URL phases
 * @param {import('./manifest.js').PageRecord} record
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {{text: string, insertions: {at: number, length: number}[]}} the
 *   text to publish, and where bytes were added — §14.1's diagnostic locator
 *   indexes span tables computed BEFORE this ran, so it needs to undo them.
 */
export function completeCanonical(html, record, base) {
  const unchanged = { text: html, insertions: [] };
  if (!isCompletablePage(record, base)) return unchanged;
  // §22.3 — "declares ANY rel=canonical", which is a question about the
  // DOCUMENT, not about the manifest's value. `record.canonical` is null for
  // `<link rel="canonical" href="">` and for one with no href at all, so
  // gating on it stamped a second canonical onto a page that had authored one
  // — manufacturing the multiple-canonical fault, and manufacturing it
  // invisibly, since the manifest then reads only the completed value and
  // records no conflict for `unify audit` to find.
  if (declaresCanonical(html)) return unchanged;
  if (record.url === null) return unchanged; // unreachable while §22.1 requires --base-url

  const { root } = parse(html);
  const head = findFirst(root, (n) => isElement(n, "head"));
  // §22.2 — no head, or a head left unclosed, means no insertion point.
  // Synthesizing either would be a structural change this section does not
  // make.
  if (!head || head.endTagStart === null) return unchanged;

  // Reuse the whitespace immediately before `</head>` — the line terminator
  // included, so a CRLF document does not gain one LF-terminated line — and
  // preserve every other byte (§3/S01).
  const before = html.slice(head.openTagEnd, head.endTagStart);
  const lead = /(\r?\n[ \t]*)$/.exec(before)?.[1] ?? "";
  // The link first, then the reused whitespace — so `</head>` keeps the exact
  // lead it had and the new element takes an identical one. Reversing these
  // strands the original whitespace and butts `</head>` against the link.
  const insertion = `${canonicalLink(record.url)}${lead}`;
  return {
    text: html.slice(0, head.endTagStart) + insertion + html.slice(head.endTagStart),
    insertions: [{ at: head.endTagStart, length: insertion.length }],
  };
}

/**
 * True when the emitted document declares any `rel="canonical"`. Exported for
 * the same reason §21.2's predicate is: one answer to one question.
 * @param {string} html
 * @returns {boolean}
 */
export function declaresCanonical(html) {
  const { root } = parse(html);
  return findAll(root, (n) =>
    isElement(n, "link") && (getAttr(n, "rel") ?? "").trim().toLowerCase().split(/\s+/).includes("canonical"),
  ).length > 0;
}
