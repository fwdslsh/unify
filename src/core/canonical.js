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
  return `<link rel="canonical" href="${url}">`;
}

/**
 * §22 — complete the canonical of one emitted page, or return its text
 * unchanged.
 *
 * @param {string} html - the page's emitted text, after §11's URL phases
 * @param {import('./manifest.js').PageRecord} record
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {string} the text to publish
 */
export function completeCanonical(html, record, base) {
  if (!isCompletablePage(record, base)) return html;
  if (record.canonical !== null) return html; // §22.3 — authored wins, always
  if (record.url === null) return html; // unreachable while §22.1 requires --base-url

  const { root } = parse(html);
  const head = findFirst(root, (n) => isElement(n, "head"));
  // §22.2 — no head, no insertion point. Synthesizing one would be a
  // structural change this section does not make.
  if (!head || head.endTagStart === null) return html;

  // Reuse the whitespace immediately before `</head>` so the element lands at
  // that tag's own indentation and every other byte is preserved (§3/S01).
  const indent = /(?:^|\n)([ \t]*)$/.exec(html.slice(head.openTagEnd, head.endTagStart))?.[1] ?? "";
  const insertion = `${canonicalLink(record.url)}\n${indent}`;
  return html.slice(0, head.endTagStart) + insertion + html.slice(head.endTagStart);
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
