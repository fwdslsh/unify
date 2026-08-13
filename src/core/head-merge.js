/**
 * head-merge.js — conformance-spec §8 (the head-merge table).
 *
 * Start from the layout's <head>; apply the table's seven rows in order.
 * This module computes the merge as a list of `{start, end, replacement}`
 * edits scoped to `layoutText` (the base document — SHL-01: the output
 * shell, head included, is the layout's) plus one append at the end of the
 * layout's head content — never a rebuilt/re-serialized head. That is the
 * splice model (conformance spec §3): S8 (replace in place), S9 (append),
 * S10 (title join), S7 (clean removal).
 *
 * Every row is a special case of the same shape: classify each head child
 * of both documents by a "key" (charset / title / meta name-or-property /
 * canonical / icon / stylesheet-or-script-src-URL / inline script-or-style
 * content); a page element whose key matches a layout element replaces it
 * in place (extra same-key layout elements are removed); a page element
 * with no layout counterpart is queued for the row-7 append; a layout
 * element with no page counterpart is simply never edited (S1).
 *
 * DIAGNOSTIC LOCATION (§14.1): this module raises exactly one located
 * diagnostic — A08, the charset-differs advisory — and it locates at the
 * PROVENANCE of the page-side `<meta charset>`, which is not always `pageFile`
 * at `lineOf(pageText, …)`. `pageText` is the page's INCLUDE-INLINED text
 * (INC-12: includes work in the head), so a fragment spliced in above the
 * charset shifts every offset below it — measured that way, the line-5
 * charset of tests/fixtures/landmines/charset-after-include reported as line
 * 8, which is the quiet kind of wrong: line 8 of that file exists, so a reader
 * who opened it found a real line with no charset on it. `pageAt` —
 * compose.js's own `spansToDiagnosticLocator` over the same spans it composes
 * with — answers both halves from one span, so file and line can never
 * disagree. It is an ADDITIONAL parameter rather than a replacement for
 * `pageText`, which the six other rows still need as raw text (`rawSpan`,
 * `innerText`, `dedupKey`); omitting it falls back to exactly the previous
 * behavior, which is exact for a direct caller passing a page's unspliced
 * source (every unit test).
 */
import {
  contentSpan, elementChildren, getAttr, hasAttr, innerText, isElement,
  lineOf, rawSpan, tokens,
} from "./html.js";
import { posix } from "node:path";

// ------------------------------------------------------------- row classifiers

function isCharsetMeta(el) {
  return isElement(el, "meta") && hasAttr(el, "charset");
}

/**
 * §11.1-shaped resolution, but only ever used for THIS row's URL-equality
 * test (row 6) — never for emission. A scheme, `//`-prefixed, or otherwise
 * non-resolvable URL is reported as `null`, meaning "not comparable": it
 * never dedups against anything, which is the correct behavior for an
 * external asset URL.
 * @param {string|null} url
 * @param {string} provenanceFile - source-root-relative path of the file that wrote `url`
 * @returns {string|null} a root-relative, normalized path, or null
 */
function resolveForCompare(url, provenanceFile) {
  if (!url) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return null;
  if (url.startsWith("#") || url === "") return null;
  const [pathPart] = url.split(/[?#]/); // query/fragment don't participate in "is this the same file"
  if (pathPart === "") return null;
  if (pathPart.startsWith("/")) return posix.normalize(pathPart);
  const dir = posix.dirname("/" + provenanceFile);
  return posix.normalize(posix.join(dir, pathPart));
}

/**
 * Classify one head element into a row-3..6 dedup key, or null when it
 * belongs to no keyed row (row 7: everything else, including http-equiv
 * metas, which are explicitly "not keyed" per §8 row 3).
 * @param {import('./html.js').ElementNode} el
 * @param {string} text - the source text `el` came from (page or layout)
 * @param {string} provenanceFile
 * @returns {string|null}
 */
function dedupKey(el, text, provenanceFile) {
  if (isElement(el, "meta")) {
    if (hasAttr(el, "name")) return `name:${(getAttr(el, "name") ?? "").toLowerCase()}`;
    if (hasAttr(el, "property")) return `property:${(getAttr(el, "property") ?? "").toLowerCase()}`;
    return null; // http-equiv, or a bare/other meta — never keyed
  }
  if (isElement(el, "link")) {
    const rel = tokens(getAttr(el, "rel")).map((t) => t.toLowerCase());
    if (rel.includes("canonical")) return "canonical";
    if (rel.includes("icon")) return "icon"; // covers `rel="shortcut icon"`; apple-touch-icon is a different token
    if (rel.includes("stylesheet") && hasAttr(el, "href")) {
      const resolved = resolveForCompare(getAttr(el, "href"), provenanceFile);
      return resolved ? `link-href:${resolved}` : null;
    }
    return null;
  }
  if (isElement(el, "script")) {
    if (hasAttr(el, "src")) {
      const resolved = resolveForCompare(getAttr(el, "src"), provenanceFile);
      return resolved ? `script-src:${resolved}` : null;
    }
    return `script-inline:${innerText(text, el)}`;
  }
  if (isElement(el, "style")) {
    return `style-inline:${innerText(text, el)}`;
  }
  return null;
}

// Rows 4/5/6 (row 3 — meta name/property — is handled by dedupKey directly;
// canonical/icon/asset are all "replace in place" except asset, which is
// "drop the duplicate, layout position stands" (§8 row 6).
const ASSET_KEY_PREFIXES = ["link-href:", "script-src:", "script-inline:", "style-inline:"];
const isAssetKey = (key) => ASSET_KEY_PREFIXES.some((p) => key.startsWith(p));

// ------------------------------------------------------------------- merge

/**
 * @param {object} args
 * @param {import('./html.js').ElementNode} args.layoutHead
 * @param {string} args.layoutText
 * @param {string} args.layoutFile
 * @param {import('./html.js').ElementNode} args.pageHead
 * @param {string} args.pageText
 * @param {string} args.pageFile
 * @param {(offset: number) => {file: string, line: number|undefined}} [args.pageAt] -
 *   §14.1 provenance locator for an offset in `pageText` (see this module's
 *   DIAGNOSTIC LOCATION note); defaults to "`pageText` is `pageFile`'s own
 *   raw source", which is true for every caller that inlined no includes.
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{start:number,end:number,replacement:string}[]} edits scoped to `layoutText`
 */
export function mergeHead({ layoutHead, layoutText, layoutFile, pageHead, pageText, pageFile, pageAt, reporter }) {
  if (!layoutHead) return [];
  const at = pageAt ?? ((offset) => ({ file: pageFile, line: lineOf(pageText, offset) }));
  /** @type {{start:number,end:number,replacement:string}[]} */
  const edits = [];
  const layoutChildren = elementChildren(layoutHead);
  const pageChildren = pageHead ? elementChildren(pageHead) : [];
  const consumed = new Set();

  // Row 1 — charset.
  const layoutCharset = layoutChildren.find(isCharsetMeta);
  const pageCharset = pageChildren.find(isCharsetMeta);
  if (pageCharset) {
    consumed.add(pageCharset);
    if (layoutCharset) {
      const lv = getAttr(layoutCharset, "charset") ?? "";
      const pv = getAttr(pageCharset, "charset") ?? "";
      if (lv.toLowerCase() !== pv.toLowerCase()) {
        reporter.advisory({
          ...at(pageCharset.start),
          message: `page charset "${pv}" differs from the layout's charset "${lv}"; the layout's is kept`,
        });
      }
      // Identical or different: the page's copy is dropped either way; the layout's stays untouched.
    } else {
      // The layout declares none: the page's charset is kept and moved to the head's first position.
      edits.push({ start: layoutHead.openTagEnd, end: layoutHead.openTagEnd, replacement: `${rawSpan(pageText, pageCharset)}\n    ` });
    }
  }

  // Row 2 — title, joined per S10.
  const layoutTitle = layoutChildren.find((el) => isElement(el, "title"));
  const pageTitle = pageChildren.find((el) => isElement(el, "title"));
  const pageTitleText = pageTitle ? innerText(pageText, pageTitle).trim() : "";
  if (layoutTitle) {
    if (pageTitleText !== "") {
      const layoutTitleText = innerText(layoutText, layoutTitle).trim();
      const [s, e] = contentSpan(layoutTitle);
      edits.push({ start: s, end: e, replacement: `${pageTitleText} ${layoutTitleText}` });
    }
    // Layout has no title but page's is empty/whitespace-only, or layout keeps its own text otherwise:
    // either way nothing else to do — S1 preserves the layout's title text untouched.
    if (pageTitle) consumed.add(pageTitle);
    // A layout title with an absent/empty page title stands alone, unedited (S1) — including any
    // literal separator text the layout author wrote as part of its own title, e.g. "— My Site".
  }
  // else: layout has no <title> at all — the page's (if any) is left unconsumed and falls
  // through to row 7, appended with its own raw text, exactly like any other unmatched element.

  // Rows 3-6 — keyed dedup (meta name/property, canonical, icon, stylesheet/script asset identity).
  const layoutByKey = new Map();
  for (const el of layoutChildren) {
    if (consumed.has(el)) continue;
    const key = dedupKey(el, layoutText, layoutFile);
    if (key === null) continue;
    if (!layoutByKey.has(key)) layoutByKey.set(key, []);
    layoutByKey.get(key).push(el);
  }
  const pageByKey = new Map();
  for (const el of pageChildren) {
    if (consumed.has(el)) continue;
    const key = dedupKey(el, pageText, pageFile);
    if (key === null) continue;
    if (!pageByKey.has(key)) pageByKey.set(key, []);
    pageByKey.get(key).push(el);
  }
  for (const [key, pageEls] of pageByKey) {
    const layoutEls = layoutByKey.get(key);
    if (!layoutEls || layoutEls.length === 0) continue; // no layout counterpart — falls through to row 7
    for (const el of pageEls) consumed.add(el);
    if (isAssetKey(key)) {
      // "The page copy is dropped — the layout's position stands." No edit at all: the layout's
      // element(s) are already correct and untouched; the page's duplicate(s) simply never append.
      continue;
    }
    // Meta name/property, canonical, icon: layout's first occurrence takes the page's element(s)
    // (dedup only crosses the layout/page boundary — multiple page elements with one key are ALL kept,
    // e.g. repeated og:image); any other same-key layout occurrences are removed entirely (S7).
    const [first, ...rest] = layoutEls;
    const joined = pageEls.map((el) => rawSpan(pageText, el)).join("\n    ");
    edits.push({ start: first.start, end: first.end, replacement: joined });
    for (const extra of rest) edits.push({ start: extra.start, end: extra.end, replacement: "" });
  }

  // Row 7 — everything else: appended after the layout's head content, in page-source order.
  const toAppend = pageChildren.filter((el) => !consumed.has(el));
  if (toAppend.length > 0) {
    const [, headContentEnd] = contentSpan(layoutHead);
    const text = toAppend.map((el) => rawSpan(pageText, el)).join("\n    ");
    edits.push({ start: headContentEnd, end: headContentEnd, replacement: `\n    ${text}` });
  }

  return edits;
}
