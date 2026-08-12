/**
 * compose.js — conformance-spec §7 (composition: the merge), §3 (the splice
 * model, S1-S12, behavioral form), and §9 (root attributes, S11 — producing
 * the composed `<html>`/`<body>` tags is part of "the merge" this module
 * performs, and S11 is one of the S1-S12 rules explicitly in scope).
 *
 * Parse-and-splice, not parse-and-serialize: this module never rebuilds a
 * tree and re-emits markup from it. Every output is the LAYOUT's original
 * text (the output shell is always the layout's — SHL-01) with a list of
 * non-overlapping `{start, end, replacement}` edits applied, where a
 * replacement string is sometimes a verbatim span lifted from the PAGE's
 * source. That is how the author's own formatting survives composition
 * untouched outside the spans a rule actually names (S1).
 *
 * Processing happens in two text-edit passes rather than one, purely for
 * implementation robustness, not because the spec calls for two passes:
 *
 *   Pass A neutralizes constructs that are structurally invisible to the
 *   rest of composition before it starts — stray `<slot>` elements (§7.1:
 *   "a slot anywhere in a page, or in a layout's head" is not a sink; A04 +
 *   S4) and P16 nested-slot violations (§7.1) — and reparses. Reparsing
 *   after Pass A means every offset Pass B computes is valid in exactly one
 *   text, with no risk of an attribute-removal edit landing inside a span
 *   that a sibling edit is about to excise wholesale (a stray slot nested
 *   inside a slot fill's own markup, for instance).
 *
 *   Pass B does everything else against the once-edited text: the page's
 *   `<main>` unwrap (§7.2), fill/default-content classification (§7.2-7.3),
 *   sink routing (§7.4-7.5), head merge (head-merge.js, §8), and root
 *   attribute merge (§9/S11).
 */
import {
  applyEdits, attrValueOrEmpty, contentSpan, elementChildren, findAll,
  findFirst, getAttrNode, hasAttr, isBlank, isElement, lineOf, parse,
  rawSpan, removeAttrEdit, spanWithAttrRemoved, tokens,
} from "./html.js";
import { mergeHead } from "./head-merge.js";

const DATA_LAYOUT = "data-layout";
const SLOT_ATTR = "slot";
/** Never merged onto the composed <html>/<body> tag — consumed before §9's merge (ATT-03). */
const ROOT_ATTR_SKIP = new Set([DATA_LAYOUT, SLOT_ATTR]);

// ------------------------------------------------------------- public API

/**
 * §10.7 / SHL-01 — the seam between markdown.js's structured conversion
 * result and this module's document-text contract. markdown.js deliberately
 * returns pieces, not a document (its own docstring: "Text, not a DOM — the
 * caller merges it via §8 exactly as it would the literal `<head>` of an
 * HTML page") — this is that caller, for the one shape §10.7 defines
 * completely: doctype; `<html>` with frontmatter lang/dir; `<head>` with
 * `<meta charset="utf-8">` first (standalone only — see below), then
 * markdown.js's own `headHtml` (already title-then-metas, in source order);
 * `<body>` with frontmatter class, holding the converted body.
 *
 * Two calling shapes, both real:
 *   - `standalone: true` — the page resolved to NO layout (§6.1 steps 1/5).
 *     This function's return IS the final output; nothing else touches it.
 *     Charset synthesis is exclusive to this path — §10.7 promises a
 *     charset the author never wrote only when there is no layout to
 *     supply one.
 *   - `standalone: false` (default) — the page WILL compose against a
 *     layout. §10.1: "layout rules apply exactly as for an HTML page whose
 *     body is the converted output and whose head is synthesized from
 *     frontmatter." The returned pseudo-document is meant to be `compose()`'s
 *     `pageText` — un-charset'd, so §8 row 1 (head-merge.js) decides the
 *     charset outcome instead of this function inventing one ahead of it.
 *
 * @param {{html:string, headHtml:string, bodyClass?:string, htmlAttrs?:{lang?:string,dir?:string}}} md
 *   — exactly `markdown.js`'s `convert()` return shape (this module never
 *   imports markdown.js; the caller passes its result through).
 * @param {{standalone?: boolean}} [opts]
 * @returns {string}
 */
export function assembleMarkdownDocument(md, { standalone = false } = {}) {
  const htmlAttrs = md.htmlAttrs ?? {};
  const attrParts = [];
  if (htmlAttrs.lang !== undefined) attrParts.push(`lang="${escapeAttr(htmlAttrs.lang)}"`);
  if (htmlAttrs.dir !== undefined) attrParts.push(`dir="${escapeAttr(htmlAttrs.dir)}"`);
  const htmlTag = attrParts.length > 0 ? `<html ${attrParts.join(" ")}>` : "<html>";

  const headParts = [];
  if (standalone) headParts.push('<meta charset="utf-8">');
  if (md.headHtml) headParts.push(md.headHtml);

  const bodyTag = md.bodyClass !== undefined ? `<body class="${escapeAttr(md.bodyClass)}">` : "<body>";

  return `<!doctype html>\n${htmlTag}\n  <head>\n    ${headParts.join("\n    ")}\n  </head>\n  ${bodyTag}\n    ${md.html}\n  </body>\n</html>\n`;
}

/** Minimal attribute-value escaping for text synthesized here (never applied to parsed source — parsing never decodes). */
function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Compose page C against layout L, or emit C standalone when there is no
 * layout (SHL-01: "a page with no layout is emitted from its own text").
 *
 * @param {object} args
 * @param {string} args.pageText - C's full HTML document text: already
 *   include-inlined (§5); for a Markdown page, the document markdown.js
 *   synthesized (§10.1/§10.7) — this module does not know or care which.
 * @param {string} args.pageFile - source-root-relative path, for diagnostics
 * @param {string|null|undefined} args.layoutText - L's full HTML document
 *   text (also already include-inlined), or absent for no layout
 * @param {string} [args.layoutFile] - required whenever `layoutText` is given
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {string} the composed HTML document text
 */
export function compose({ pageText, pageFile, layoutText, layoutFile, reporter }) {
  if (!layoutText) return composeNoLayout({ pageText, pageFile, reporter });
  return composeWithLayout({ pageText, pageFile, layoutText, layoutFile, reporter });
}

// --------------------------------------------------------------- no layout

function composeNoLayout({ pageText, pageFile, reporter }) {
  const { root } = parse(pageText);
  const excluded = checkNestedSlots(root, pageText, pageFile, reporter);
  const edits = collectStraySlotEdits(root, pageText, pageFile, reporter, excluded);

  const html = findFirst(root, (n) => isElement(n, "html"));
  const body = findFirst(root, (n) => isElement(n, "body"));
  for (const el of [html, body]) {
    if (!el) continue;
    // data-layout never appears in output, including the "none" form (LAY-12/S07).
    const e = removeAttrEdit(el, DATA_LAYOUT);
    if (e) edits.push(e);
  }

  return stripPolyfillScripts(applyEdits(pageText, edits));
}

// ------------------------------------------------------------- with layout

function composeWithLayout({ pageText, pageFile, layoutText, layoutFile, reporter }) {
  // ---- Pass A: neutralize stray slots (§7.1 MRG-04/A04), both documents.
  const c0 = parse(pageText);
  const cExcluded = checkNestedSlots(c0.root, pageText, pageFile, reporter);
  const cEdits0 = collectStraySlotEdits(c0.root, pageText, pageFile, reporter, cExcluded);
  const preparedCText = applyEdits(pageText, cEdits0);

  const l0 = parse(layoutText);
  const lHead0 = findFirst(l0.root, (n) => isElement(n, "head"));
  const lHeadExcluded = lHead0 ? checkNestedSlots(lHead0, layoutText, layoutFile, reporter) : new Set();
  const lEdits0 = lHead0 ? collectStraySlotEdits(lHead0, layoutText, layoutFile, reporter, lHeadExcluded) : [];
  const preparedLText = applyEdits(layoutText, lEdits0);

  // ---- Pass B: reparse once, do everything else against stable offsets.
  const C = parse(preparedCText);
  const L = parse(preparedLText);
  const lHtml = findFirst(L.root, (n) => isElement(n, "html"));
  const lBody = findFirst(L.root, (n) => isElement(n, "body"));
  const lHead = findFirst(L.root, (n) => isElement(n, "head"));
  const cHtml = findFirst(C.root, (n) => isElement(n, "html"));
  const cBody = findFirst(C.root, (n) => isElement(n, "body"));
  const cHead = findFirst(C.root, (n) => isElement(n, "head"));

  if (!lBody) {
    // A layout with no <body> at all is outside anything the spec describes
    // (layouts are complete documents). Fail soft — one malformed layout
    // must not crash best-effort analysis of the rest of the site.
    return preparedLText;
  }

  const edits = [];

  // §7.1 sink detection, including P16 (checked once, fresh, on the stable body).
  const lBodyExcluded = checkNestedSlots(lBody, preparedLText, layoutFile, reporter);
  const sinks = detectSinks(lBody, lBodyExcluded, preparedLText, layoutFile, reporter);

  if (sinks.none) {
    // §7.5 — sink-less: the whole body is the default slot, verbatim, no unwrap.
    const [cs, ce] = contentSpan(cBody);
    const [ls, le] = contentSpan(lBody);
    edits.push({ start: ls, end: le, replacement: preparedCText.slice(cs, ce) });
  } else {
    edits.push(...composeSinkedBody({
      preparedCText, cBody, preparedLText, sinks, pageFile, layoutFile, reporter,
    }));
  }

  // §8 head merge.
  edits.push(...mergeHead({
    layoutHead: lHead, layoutText: preparedLText, layoutFile,
    pageHead: cHead, pageText: preparedCText, pageFile, reporter,
  }));

  // §9/S11 root attributes, and defensive data-layout/slot stripping on the layout's own tags.
  edits.push(...mergeRootAttrs(lHtml, cHtml, preparedCText));
  edits.push(...mergeRootAttrs(lBody, cBody, preparedCText));

  return stripPolyfillScripts(applyEdits(preparedLText, edits));
}

/**
 * §7.2-7.4: unwrap the page's first `<main>`, classify its top-level body
 * content into fills and default content, route default content to its
 * sink, and fill (or fall back) every named slot.
 */
function composeSinkedBody({ preparedCText, cBody, preparedLText, sinks, pageFile, layoutFile, reporter }) {
  const edits = [];

  // §7.2 — unwrap C's first <main>, at any depth, exactly once (R4).
  let bodyText = preparedCText;
  let body = cBody;
  const main = findFirst(cBody, (n) => isElement(n, "main"));
  if (main) {
    const unwrapEdits = [{ start: main.start, end: main.openTagEnd, replacement: "" }];
    if (main.endTagStart != null) unwrapEdits.push({ start: main.endTagStart, end: main.endTagEnd, replacement: "" });
    bodyText = applyEdits(preparedCText, unwrapEdits);
    body = findFirst(parse(bodyText).root, (n) => isElement(n, "body"));
  }

  // §7.2 — classify top-level children into fills (by slot name) and default content.
  const topKids = elementChildren(body);
  const fillsByName = new Map(); // name -> string[] (already slot-attr-stripped, in page order)
  const localEdits = []; // within body's own content span
  for (const el of topKids) {
    const slotVal = attrValueOrEmpty(el, SLOT_ATTR);
    const isFillCandidate = slotVal !== "";
    const matchesRealSlot = isFillCandidate && sinks.namedSlots.has(slotVal);

    if (matchesRealSlot) {
      if (!fillsByName.has(slotVal)) fillsByName.set(slotVal, []);
      fillsByName.get(slotVal).push(spanWithAttrRemoved(bodyText, el, SLOT_ATTR));
      localEdits.push({ start: el.start, end: el.end, replacement: "" }); // excised from default content
    } else if (isFillCandidate) {
      // MRG-10/A02: names a slot the layout doesn't have — stays in default content, attr consumed.
      reporter.advisory({
        file: pageFile,
        line: lineOf(bodyText, el.start),
        message: `no slot named "${slotVal}" in ${layoutFile}; the element stayed in the page content`,
      });
      const attrEdit = removeAttrEdit(el, SLOT_ATTR);
      if (attrEdit) localEdits.push(attrEdit);
    }

    // §7.6/A03 — top-level header/footer NOT addressed to a real slot stayed in default content.
    if ((isElement(el, "header") || isElement(el, "footer")) && !matchesRealSlot) {
      reporter.advisory({
        file: pageFile,
        line: lineOf(bodyText, el.start),
        message: `top-level <${el.tag}> is not addressed to any slot in ${layoutFile} — it stayed in the page content`,
      });
    }
  }

  const [bs, be] = contentSpan(body);
  const local = localEdits.map((e) => ({ start: e.start - bs, end: e.end - bs, replacement: e.replacement }));
  const defaultContentText = applyEdits(bodyText.slice(bs, be), local);
  const defaultEmpty = isBlank(defaultContentText);

  // §7.4 — route default content.
  // Spec gap (see implementation report): C6/§7.4 states explicitly that
  // "when a layout has a default slot, main's other children are never
  // touched" — but gives no equivalent carve-out for the no-default-slot
  // branch, where default content replaces main's children wholesale (S05).
  // A named slot the layout author nested *inside* that main would then have
  // its own span wholly contained in the very span being replaced. Rather
  // than let that produce an overlapping edit (a crash — worse than any
  // single-page best-effort outcome), this resolves it the same direction
  // the wholesale-replacement wording points: main's replacement wins, and a
  // named slot swallowed inside it is skipped below instead of double-edited.
  let swallowedByMain = null;
  if (sinks.defaultSlot) {
    if (defaultEmpty) {
      const [s, e] = contentSpan(sinks.defaultSlot);
      edits.push({ start: sinks.defaultSlot.start, end: sinks.defaultSlot.end, replacement: preparedLText.slice(s, e) });
    } else {
      edits.push({ start: sinks.defaultSlot.start, end: sinks.defaultSlot.end, replacement: defaultContentText });
    }
  } else if (sinks.firstMain) {
    if (!defaultEmpty) {
      const [s, e] = contentSpan(sinks.firstMain);
      edits.push({ start: s, end: e, replacement: defaultContentText });
      swallowedByMain = [s, e];
    } // else: main keeps its own children untouched (S1) — the layout's default persists.
  } else if (sinks.namedSlots.size > 0 && !defaultEmpty) {
    // §7.4 third bullet — content would vanish: P09, located at the page (whole-document anchor).
    reporter.problem({
      file: pageFile,
      line: 1,
      message: `page content has nowhere to land in ${layoutFile}`,
      fixes: ["add <slot></slot> or <main> to the layout, or address the content to a named slot"],
    });
  }
  const isSwallowed = (node) => swallowedByMain !== null && node.start >= swallowedByMain[0] && node.end <= swallowedByMain[1];

  // §7.3 — fill or fall back every named slot.
  for (const [name, node] of sinks.namedSlots) {
    if (isSwallowed(node)) continue;
    const fills = fillsByName.get(name);
    if (fills && fills.length > 0) {
      edits.push({ start: node.start, end: node.end, replacement: fills.join("\n    ") });
    } else {
      const [s, e] = contentSpan(node);
      edits.push({ start: node.start, end: node.end, replacement: preparedLText.slice(s, e) });
    }
  }

  // A13 duplicates: bare/named slots render fallback; a duplicate <main> just stays untouched.
  for (const dup of sinks.duplicates) {
    if (dup.kind === "main" || isSwallowed(dup.node)) continue;
    const [s, e] = contentSpan(dup.node);
    edits.push({ start: dup.node.start, end: dup.node.end, replacement: preparedLText.slice(s, e) });
  }

  return edits;
}

// ------------------------------------------------------------- sink detection

/**
 * §7.1: the layout's sinks — the default slot, each first named slot, the
 * first `<main>` — plus every duplicate (advisory A13, first occurrence wins).
 * @returns {{defaultSlot: object|null, namedSlots: Map<string,object>, firstMain: object|null,
 *   duplicates: {node:object, kind:'slot'|'main'}[], none: boolean}}
 */
function detectSinks(lBody, excluded, layoutText, layoutFile, reporter) {
  const allSlots = findAll(lBody, (n) => isElement(n, "slot")).filter((n) => !excluded.has(n));
  let defaultSlot = null;
  const namedSlots = new Map();
  const duplicates = [];
  for (const slot of allSlots) {
    const name = attrValueOrEmpty(slot, "name");
    if (name === "") {
      if (!defaultSlot) {
        defaultSlot = slot;
      } else {
        reporter.advisory({
          file: layoutFile, line: lineOf(layoutText, slot.start),
          message: `duplicate bare <slot> in ${layoutFile} — the first one wins and renders its own fallback`,
        });
        duplicates.push({ node: slot, kind: "slot" });
      }
    } else if (!namedSlots.has(name)) {
      namedSlots.set(name, slot);
    } else {
      reporter.advisory({
        file: layoutFile, line: lineOf(layoutText, slot.start),
        message: `duplicate <slot name="${name}"> in ${layoutFile} — the first one wins and this one renders its own fallback`,
      });
      duplicates.push({ node: slot, kind: "slot" });
    }
  }

  const allMains = findAll(lBody, (n) => isElement(n, "main"));
  const firstMain = allMains[0] ?? null;
  for (let i = 1; i < allMains.length; i++) {
    reporter.advisory({
      file: layoutFile, line: lineOf(layoutText, allMains[i].start),
      message: `duplicate <main> in ${layoutFile} — the first one wins`,
    });
    duplicates.push({ node: allMains[i], kind: "main" });
  }

  return {
    defaultSlot, namedSlots, firstMain, duplicates,
    none: !defaultSlot && namedSlots.size === 0 && !firstMain,
  };
}

// -------------------------------------------------------- shared: P16, A04

/**
 * §7.1 P16: a `<slot>` nested inside another slot's fallback content. Scoped
 * to whatever root the caller passes (a whole page document — every slot in
 * a page is fair game; a layout's `<head>`; a layout's `<body>`) so it can be
 * checked once per region, at the point that region is stable. Reports each
 * violation once, located at the inner (nested) slot, and returns the set of
 * both slots in the pair so callers can exclude them from further processing.
 */
function checkNestedSlots(scopeRoot, text, file, reporter) {
  const excluded = new Set();
  const allSlots = findAll(scopeRoot, (n) => isElement(n, "slot"));
  for (const outer of allSlots) {
    if (excluded.has(outer)) continue;
    const inner = findFirst(outer, (n) => isElement(n, "slot"));
    if (!inner) continue;
    const outerName = attrValueOrEmpty(outer, "name");
    const innerName = attrValueOrEmpty(inner, "name");
    reporter.problem({
      file,
      line: lineOf(text, inner.start),
      message: `<slot${innerName ? ` name="${innerName}"` : ""}> is nested inside the fallback of ` +
        `<slot${outerName ? ` name="${outerName}"` : ""}> — slots do not nest`,
      fixes: ["move the inner slot out of the outer slot's fallback, or drop one of them"],
    });
    excluded.add(outer);
    excluded.add(inner);
  }
  return excluded;
}

/**
 * §7.1 MRG-04/A04: every `<slot>` in `scopeRoot` (excluding P16-flagged ones,
 * which are left completely untouched) is replaced by its own children (S4),
 * advisory A04. Used for an entire page document (all of a page's slots are
 * "outside a layout's body") and for a layout's `<head>` alone.
 */
function collectStraySlotEdits(scopeRoot, text, file, reporter, excluded) {
  const edits = [];
  for (const slot of findAll(scopeRoot, (n) => isElement(n, "slot"))) {
    if (excluded.has(slot)) continue;
    reporter.advisory({
      file,
      line: lineOf(text, slot.start),
      message: "<slot> is outside a layout's <body> — replaced by its own children",
    });
    const [s, e] = contentSpan(slot);
    edits.push({ start: slot.start, end: slot.end, replacement: text.slice(s, e) });
  }
  return edits;
}

// ------------------------------------------------------- §9/S11 root attrs

/**
 * Merges page attributes onto the layout's `<html>` or `<body>` start tag,
 * in place, per §9/S11: `class` is layout tokens then new page tokens
 * (deduplicated); any other page attribute overrides the layout's value at
 * its existing position, or is appended (page-source order) when the layout
 * doesn't have it; `data-layout`/consumed `slot` never participate.
 */
function mergeRootAttrs(layoutEl, pageEl, pageText) {
  const edits = [];
  if (!layoutEl) return edits;
  // Defensive: a layout should never itself carry these (a layout declaring
  // data-layout is P15, someone else's check), but LAY-12 is unconditional.
  for (const name of ROOT_ATTR_SKIP) {
    const e = removeAttrEdit(layoutEl, name);
    if (e) edits.push(e);
  }
  if (!pageEl) return edits;

  const appendParts = [];
  for (const pa of pageEl.attrs) {
    const lname = pa.name.toLowerCase();
    if (ROOT_ATTR_SKIP.has(lname)) continue;

    if (lname === "class") {
      const layoutClass = getAttrNode(layoutEl, "class");
      const merged = [...tokens(layoutClass ? layoutClass.value : "")];
      for (const t of tokens(pa.value)) if (!merged.includes(t)) merged.push(t);
      const value = merged.join(" ");
      if (layoutClass) {
        edits.push({ start: layoutClass.nameStart, end: layoutClass.end, replacement: `class="${value}"` });
      } else {
        appendParts.push(`class="${value}"`);
      }
      continue;
    }

    const layoutAttr = getAttrNode(layoutEl, pa.name);
    if (layoutAttr) {
      const rendered = pa.value === null ? layoutAttr.name : `${layoutAttr.name}="${pa.value}"`;
      edits.push({ start: layoutAttr.nameStart, end: layoutAttr.end, replacement: rendered });
    } else {
      appendParts.push(pa.value === null ? pa.name : `${pa.name}="${pa.value}"`);
    }
  }
  if (appendParts.length > 0) {
    edits.push({ start: layoutEl.attrsEnd, end: layoutEl.attrsEnd, replacement: ` ${appendParts.join(" ")}` });
  }
  return edits;
}

// -------------------------------------------------------------- §6.4 LAY-13

/** A `<script>` carrying `data-polyfill` is removed entirely from built output. */
function stripPolyfillScripts(text) {
  const { root } = parse(text);
  const scripts = findAll(root, (n) => isElement(n, "script") && hasAttr(n, "data-polyfill"));
  if (scripts.length === 0) return text;
  return applyEdits(text, scripts.map((s) => ({ start: s.start, end: s.end, replacement: "" })));
}
