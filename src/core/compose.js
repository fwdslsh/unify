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
 * PROVENANCE (§1, §11.1, §14.1 R3): `compose()` and `assembleMarkdownDocument()`
 * return `{text, spans}`, not a bare string — `spans` is the same
 * `{start,end,file,fileOffset}[]` contract `includes.js` documents (this
 * module's own doc comment there is the canonical description), extended
 * end-to-end through composition: `compose()` accepts the PAGE's and
 * LAYOUT's own already-computed spans (`pageSpans`/`layoutSpans`, from
 * `inlineIncludes` — a plain whole-text span when the caller omits them, so
 * every existing simple caller keeps working) and produces a spans array
 * covering the composed output, so that a byte the layout's own `<main>`
 * wrote is attributed to the layout, a byte an include contributed (however
 * many layers deep, however it got positioned by composition) is attributed
 * to that include, and a byte the page contributed is attributed to the
 * page — or, once more precisely, to whichever file's text that byte was
 * ultimately lifted from, since a page's own head can itself contain an
 * include. Two internal techniques make this tractable without touching
 * head-merge.js (out of this task's scope):
 *
 *   - Every edit THIS module constructs (Pass A's stray-slot removal, the
 *     `<main>` unwrap, fill/default-content classification, sink routing,
 *     duplicates) is a self-referential slice of a text this module already
 *     has spans for, so its `replacementSpans` are computed in parallel with
 *     the replacement text itself, by the same helpers (`sliceSpans`,
 *     `shiftSpans`, `joinWithGlue`) — never re-derived after the fact.
 *   - head-merge.js's edits are opaque `{start,end,replacement}` triples
 *     with no span information, and this module does not reimplement its
 *     row-by-row dedup logic to get any. But every one of its replacements
 *     is either empty or a `"\n    "`-joined concatenation of one or more
 *     PAGE HEAD ELEMENTS' own raw spans (verified against head-merge.js's
 *     source — rows 1/3-7; row 2's title join mixes page+layout TEXT rather
 *     than copying an element, which this reconciliation cannot place
 *     precisely, but a `<title>`'s text can never carry a checkable
 *     href/src/srcset/poster/og:/twitter: value, so attributing it to the
 *     page as a harmless default is exact-enough by construction, not a
 *     shortcut). `mergeHeadWithProvenance` below matches each
 *     `"\n    "`-delimited piece of a returned replacement against the
 *     page head's own children by EXACT text equality — not substring
 *     search — since a piece is always one child's whole raw span.
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
 *
 * DIAGNOSTIC LOCATION (§14.1): every diagnostic below names the file and line
 * the SPANS say authored the offending byte — never "the page/layout this
 * offset belongs to, measured in the include-inlined text". Those two answers
 * differ by every line any fragment inlined above the fault contributed, so
 * the second one routinely pointed past the end of the file it named — a
 * duplicate `<slot>` on line 7 of a nine-line layout reported at line 12,
 * the fragment above it having contributed five lines (ratification round
 * 18; pinned by tests/fixtures/landmines/line-after-include, and its
 * counterpart slot-inside-include pins the file half: a `<slot>` a fragment
 * contributed is reported IN that fragment, at its own line, not at the host
 * that included it). See `spansToDiagnosticLocator` (urls.js) for the
 * mechanism and `resolveLine` for why the offset→line half is injected rather
 * than computed here.
 */
import {
  attrValueOrEmpty, contentSpan, elementChildren, findAll,
  findFirst, getAttr, getAttrNode, hasAttr, isBlank, isElement, parse,
  rawSpan, removeAttrEdit, spanWithAttrRemoved, tokens,
} from "./html.js";
import { mergeHead } from "./head-merge.js";
import { spansToDiagnosticLocator, verbatimLineResolver, wholeTextSpan } from "./urls.js";

const DATA_LAYOUT = "data-layout";
const SLOT_ATTR = "slot";
/** Never merged onto the composed <html>/<body> tag — consumed before §9's merge (ATT-03). */
const ROOT_ATTR_SKIP = new Set([DATA_LAYOUT, SLOT_ATTR]);
/** head-merge.js's own, sole join/insert separator for every multi-piece row (verified against its source). */
const HEAD_JOIN = "\n    ";

// ------------------------------------------------------- span-tracking utils
//
// A `Span` is `{start, end, file, fileOffset}`: `[start,end)` is a range in
// SOME text this module is currently building; `file` is who authored it
// (source-root-relative); `fileOffset` is where `start` sits in `file`'s OWN
// raw text (so a caller can compute a real line number there, not just a
// filename). These four functions are this module's one splice-with-spans
// primitive, used everywhere an edit list becomes new text: they mirror
// html.js's plain `applyEdits` ordering/overlap contract exactly (in fact
// delegate text assembly to conceptually the same algorithm) while also
// producing the matching spans array.

/**
 * Clip `spans` to `[from, to)` and rebase to be 0-based at `from`.
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} spans
 * @param {number} from
 * @param {number} to
 * @returns {{start:number,end:number,file:string,fileOffset:number}[]}
 */
function sliceSpans(spans, from, to) {
  const out = [];
  for (const sp of spans) {
    const s = Math.max(sp.start, from);
    const e = Math.min(sp.end, to);
    if (s < e) out.push({ start: s - from, end: e - from, file: sp.file, fileOffset: sp.fileOffset + (s - sp.start) });
  }
  return out;
}

/**
 * Move `spans`' output positions by `delta` (their `file`/`fileOffset` — what
 * they mean — never changes just because they landed somewhere else).
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} spans
 * @param {number} delta
 */
function shiftSpans(spans, delta) {
  if (!delta) return spans;
  return spans.map((s) => ({ ...s, start: s.start + delta, end: s.end + delta }));
}

/**
 * Ensure `spans` (0-based, local to a string of length `len`) cover `[0,len)`
 * entirely, filling any hole with a synthetic `fallbackFile` span (structural
 * glue this module writes itself — a `"\n    "` joiner, an unmatched
 * head-merge title join — never carries a checkable URL, so an
 * unattributable/approximate `fileOffset` of 0 is harmless).
 */
function fillGaps(spans, len, fallbackFile) {
  if (len === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start > cursor) out.push({ start: cursor, end: s.start, file: fallbackFile, fileOffset: 0 });
    out.push(s);
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < len) out.push({ start: cursor, end: len, file: fallbackFile, fileOffset: 0 });
  return out;
}

/**
 * The splice-with-spans primitive: apply non-overlapping
 * `{start, end, replacement, replacementSpans?}` edits to `text` (covered
 * end-to-end by `spans`), returning new text and its matching spans.
 * `replacementSpans` (0-based within `edit.replacement`) needs only cover
 * the parts of the replacement whose provenance is known; `fillGaps` covers
 * the rest with `fallbackFile`. Throws on overlap, exactly like html.js's
 * `applyEdits` (same contract, extended).
 * @param {string} text
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} spans
 * @param {{start:number,end:number,replacement:string,replacementSpans?:{start:number,end:number,file:string,fileOffset:number}[]}[]} edits
 * @param {string} fallbackFile
 * @returns {{text:string, spans:{start:number,end:number,file:string,fileOffset:number}[]}}
 */
function spliceTrackingSpans(text, spans, edits, fallbackFile) {
  if (edits.length === 0) return { text, spans };
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  const result = [];
  for (const edit of sorted) {
    if (edit.start < cursor) {
      throw new Error(`compose.js spliceTrackingSpans: overlapping edit at ${edit.start} (cursor at ${cursor})`);
    }
    if (edit.start > cursor) {
      result.push(...shiftSpans(sliceSpans(spans, cursor, edit.start), out.length));
      out += text.slice(cursor, edit.start);
    }
    if (edit.replacement.length > 0) {
      const filled = fillGaps(edit.replacementSpans ?? [], edit.replacement.length, fallbackFile);
      result.push(...shiftSpans(filled, out.length));
      out += edit.replacement;
    }
    cursor = edit.end;
  }
  if (cursor < text.length) {
    result.push(...shiftSpans(sliceSpans(spans, cursor, text.length), out.length));
    out += text.slice(cursor);
  }
  return { text: out, spans: result };
}

// -------------------------------------------------- §14.1 diagnostic location
//
// WHERE THE OFFSET→LINE CONVERSION BELONGS, and why it is not here.
//
// A span answers "which file, and at what offset in THAT file" exactly
// (`spansToSourceLocator`). Turning that offset into a line needs the source
// file's own raw text — which this module deliberately never has: it is
// content-in/diagnostics-out (module header; every input is a string its
// caller loaded) and reading `_includes/nav.html` off disk to number a line
// would make composition a filesystem client, breaking every unit test that
// composes from strings and every future caller that composes from memory
// (`unify dev`'s in-memory rebuilds).
//
// So the conversion is INJECTED: `compose()` takes an optional
// `resolveLine(file, fileOffset) => number|undefined`, supplied by the one
// component that already knows how to obtain any source file's text —
// `src/cli/commands/build.js`, which does the same thing for the §12
// reference check (`makeReferenceLocator`). This module only ever composes
// the two halves, via `spansToDiagnosticLocator` (urls.js — shared with
// layout.js's §6 diagnostics and head-merge.js's §8 advisory, so all three
// stages locate a fault identically); `verbatimLineResolver` is the
// no-injection fallback for unit tests, and returns undefined rather than
// guessing whenever the text in hand is not the named file's raw source.

/**
 * `html.js`'s `spanWithAttrRemoved` (an element's raw span with one
 * attribute cleanly excised), mirrored for spans: the same two-piece
 * before/after excision, so a fill's `replacementSpans` line up byte for
 * byte with `spanWithAttrRemoved`'s text.
 */
function spansWithAttrRemoved(spans, el, name) {
  const a = getAttrNode(el, name);
  if (!a) return sliceSpans(spans, el.start, el.end);
  const before = sliceSpans(spans, el.start, a.start);
  const after = shiftSpans(sliceSpans(spans, a.end, el.end), a.start - el.start);
  return [...before, ...after];
}

/**
 * Concatenate `{text, spans}` pieces with a glue string between them (§7.3's
 * multi-fill join, S3: "in page order"). The glue itself is left
 * unattributed on purpose — it is this module's own punctuation, not
 * anyone's authored byte — and picked up by `fillGaps` in the enclosing
 * `spliceTrackingSpans` call.
 * @param {{text:string, spans:{start:number,end:number,file:string,fileOffset:number}[]}[]} pieces
 * @param {string} glue
 */
function joinWithGlue(pieces, glue) {
  let text = "";
  const spans = [];
  for (let i = 0; i < pieces.length; i++) {
    if (i > 0) text += glue;
    spans.push(...shiftSpans(pieces[i].spans, text.length));
    text += pieces[i].text;
  }
  return { replacement: text, replacementSpans: spans };
}

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
 *     `pageText`/`pageSpans`, un-charset'd, so §8 row 1 (head-merge.js)
 *     decides the charset outcome instead of this function inventing one
 *     ahead of it.
 *
 * Provenance: `md.html` may carry its own `md.htmlSpans` (from
 * `inlineIncludes`, when the converted body had includes of its own —
 * §10.1's post-conversion resolution); everything else this function
 * synthesizes (the doctype/html/head/body scaffolding, `md.headHtml`'s
 * frontmatter-derived metas) is trivially page-authored — there is nowhere
 * else it could have come from — so it is attributed to `pageFile`.
 *
 * @param {{html:string, headHtml:string, bodyClass?:string, htmlAttrs?:{lang?:string,dir?:string}, htmlSpans?:{start:number,end:number,file:string,fileOffset:number}[]}} md
 *   — `markdown.js`'s `convert()` return shape plus the optional `htmlSpans`
 *   this module's own caller (`src/cli/commands/build.js`) attaches after
 *   running `md.html` through `includes.inlineIncludes`.
 * @param {{standalone?: boolean, pageFile: string}} opts
 * @returns {{text: string, spans: {start:number,end:number,file:string,fileOffset:number}[]}}
 */
export function assembleMarkdownDocument(md, { standalone = false, pageFile }) {
  const htmlAttrs = md.htmlAttrs ?? {};
  const attrParts = [];
  if (htmlAttrs.lang !== undefined) attrParts.push(`lang="${escapeAttr(htmlAttrs.lang)}"`);
  if (htmlAttrs.dir !== undefined) attrParts.push(`dir="${escapeAttr(htmlAttrs.dir)}"`);
  const htmlTag = attrParts.length > 0 ? `<html ${attrParts.join(" ")}>` : "<html>";

  const headParts = [];
  if (standalone) headParts.push('<meta charset="utf-8">');
  if (md.headHtml) headParts.push(md.headHtml);

  const bodyTag = md.bodyClass !== undefined ? `<body class="${escapeAttr(md.bodyClass)}">` : "<body>";

  const before = `<!doctype html>\n${htmlTag}\n  <head>\n    ${headParts.join("\n    ")}\n  </head>\n  ${bodyTag}\n    `;
  const after = `\n  </body>\n</html>\n`;
  const text = before + md.html + after;

  const htmlSpans = md.htmlSpans ?? wholeTextSpan(md.html, pageFile);
  const spans = [
    ...wholeTextSpan(before, pageFile),
    ...shiftSpans(htmlSpans, before.length),
    ...shiftSpans(wholeTextSpan(after, pageFile), before.length + md.html.length),
  ];
  return { text, spans };
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
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} [args.pageSpans] -
 *   `pageText`'s own provenance (from `inlineIncludes`/`assembleMarkdownDocument`);
 *   defaults to attributing all of `pageText` to `pageFile`, which is exact
 *   for a caller with no includes of its own to track.
 * @param {string|null|undefined} args.layoutText - L's full HTML document
 *   text (also already include-inlined), or absent for no layout
 * @param {string} [args.layoutFile] - required whenever `layoutText` is given
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} [args.layoutSpans] -
 *   `layoutText`'s own provenance; same default as `pageSpans`.
 * @param {(file: string, fileOffset: number) => number|undefined} [args.resolveLine] -
 *   turns a provenance position into a 1-based line in that file, for §14.1
 *   diagnostic locations (see the DIAGNOSTIC LOCATION note above and
 *   `verbatimLineResolver` for the omitted case). Injected because this module
 *   never reads the filesystem.
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{text: string, spans: {start:number,end:number,file:string,fileOffset:number}[]}}
 */
export function compose({ pageText, pageFile, pageSpans, layoutText, layoutFile, layoutSpans, resolveLine, reporter }) {
  const pSpans = pageSpans ?? wholeTextSpan(pageText, pageFile);
  const lSpans = layoutText ? (layoutSpans ?? wholeTextSpan(layoutText, layoutFile)) : [];
  const resolve = resolveLine ?? verbatimLineResolver([
    { file: pageFile, text: pageText, spans: pSpans },
    { file: layoutFile, text: layoutText ?? "", spans: lSpans },
  ]);
  if (!layoutText) return composeNoLayout({ pageText, pageFile, pageSpans: pSpans, resolveLine: resolve, reporter });
  return composeWithLayout({
    pageText, pageFile, pageSpans: pSpans, layoutText, layoutFile, layoutSpans: lSpans, resolveLine: resolve, reporter,
  });
}

// --------------------------------------------------------------- no layout

function composeNoLayout({ pageText, pageFile, pageSpans, resolveLine, reporter }) {
  const { root } = parse(pageText);
  const at = spansToDiagnosticLocator(pageSpans, pageFile, resolveLine);
  const excluded = checkNestedSlots(root, at, reporter);
  const edits = collectStraySlotEdits(root, pageText, pageSpans, at, reporter, excluded, true);

  const html = findFirst(root, (n) => isElement(n, "html"));
  const body = findFirst(root, (n) => isElement(n, "body"));
  for (const el of [html, body]) {
    if (!el) continue;
    // data-layout never appears in output, including the "none" form (LAY-12/S07).
    const e = removeAttrEdit(el, DATA_LAYOUT);
    if (e) edits.push(e);
  }

  const spliced = spliceTrackingSpans(pageText, pageSpans, edits, pageFile);
  return stripPolyfillScripts(spliced.text, spliced.spans, pageFile);
}

// ------------------------------------------------------------- with layout

function composeWithLayout({ pageText, pageFile, pageSpans, layoutText, layoutFile, layoutSpans, resolveLine, reporter }) {
  // ---- Pass A: neutralize stray slots (§7.1 MRG-04/A04), both documents.
  const c0 = parse(pageText);
  const cAt = spansToDiagnosticLocator(pageSpans, pageFile, resolveLine);
  const cExcluded = checkNestedSlots(c0.root, cAt, reporter);
  const cEdits0 = collectStraySlotEdits(c0.root, pageText, pageSpans, cAt, reporter, cExcluded, true);
  const preparedC = spliceTrackingSpans(pageText, pageSpans, cEdits0, pageFile);

  const l0 = parse(layoutText);
  const lAt = spansToDiagnosticLocator(layoutSpans, layoutFile, resolveLine);
  const lHead0 = findFirst(l0.root, (n) => isElement(n, "head"));
  const lHeadExcluded = lHead0 ? checkNestedSlots(lHead0, lAt, reporter) : new Set();
  const lEdits0 = lHead0 ? collectStraySlotEdits(lHead0, layoutText, layoutSpans, lAt, reporter, lHeadExcluded) : [];
  const preparedL = spliceTrackingSpans(layoutText, layoutSpans, lEdits0, layoutFile);

  // ---- Pass B: reparse once, do everything else against stable offsets.
  const C = parse(preparedC.text);
  const L = parse(preparedL.text);
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
    return preparedL;
  }

  const edits = [];

  // §7.1 sink detection, including P16 (checked once, fresh, on the stable body).
  // Offsets are now Pass-A text offsets, so the locator is rebuilt over the
  // PREPARED spans — the same bytes, still carrying their original provenance.
  const lPreparedAt = spansToDiagnosticLocator(preparedL.spans, layoutFile, resolveLine);
  const lBodyExcluded = checkNestedSlots(lBody, lPreparedAt, reporter);
  const sinks = detectSinks(lBody, lBodyExcluded, lPreparedAt, layoutFile, reporter);

  if (sinks.none) {
    // §7.5 — sink-less: the whole body is the default slot, verbatim, no unwrap.
    const [cs, ce] = contentSpan(cBody);
    const [ls, le] = contentSpan(lBody);
    edits.push({
      start: ls, end: le,
      replacement: preparedC.text.slice(cs, ce),
      replacementSpans: sliceSpans(preparedC.spans, cs, ce),
    });
  } else {
    edits.push(...composeSinkedBody({
      preparedC, cBody, preparedL, sinks, pageFile, layoutFile, layoutAt: lPreparedAt, resolveLine, reporter,
    }));
  }

  // §8 head merge. `cPreparedAt` is the page-side counterpart of `lPreparedAt`
  // — head-merge.js's own A08 advisory locates through it, so a `<meta
  // charset>` a fragment pushed down the page's head is still reported at its
  // true line (§14.1). Built over preparedC rather than reusing `cAt`, whose
  // offsets index the PRE-Pass-A text, and separately from composeSinkedBody's
  // `pageAt`, whose offsets index the post-`<main>`-unwrap text.
  const cPreparedAt = spansToDiagnosticLocator(preparedC.spans, pageFile, resolveLine);
  edits.push(...mergeHeadWithProvenance({
    layoutHead: lHead, layoutText: preparedL.text, layoutFile,
    pageHead: cHead, pageText: preparedC.text, pageSpans: preparedC.spans, pageFile, pageAt: cPreparedAt, reporter,
  }));

  // §9/S11 root attributes, and defensive data-layout/slot stripping on the layout's own tags.
  edits.push(...mergeRootAttrs(lHtml, cHtml));
  edits.push(...mergeRootAttrs(lBody, cBody));

  const composed = spliceTrackingSpans(preparedL.text, preparedL.spans, edits, pageFile);
  return stripPolyfillScripts(composed.text, composed.spans, pageFile);
}

/**
 * §7.2-7.4: unwrap the page's first `<main>`, classify its top-level body
 * content into fills and default content, route default content to its
 * sink, and fill (or fall back) every named slot.
 */
function composeSinkedBody({ preparedC, cBody, preparedL, sinks, pageFile, layoutFile, layoutAt, resolveLine, reporter }) {
  const edits = [];
  const preparedCText = preparedC.text;
  const preparedLText = preparedL.text;

  // §7.2 — unwrap C's first <main>, at any depth, exactly once (R4).
  let bodyText = preparedCText;
  let bodySpans = preparedC.spans;
  let body = cBody;
  const main = findFirst(cBody, (n) => isElement(n, "main"));
  // Where this <main>'s own element children will land once its open tag is
  // gone — every one shifts left by exactly that tag's length. Captured here,
  // before the splice, because after it the nodes are new objects. See the
  // fill-scope note below for why they count.
  const unwrappedKidStarts = new Set();
  if (main) {
    const delta = main.openTagEnd - main.start;
    for (const k of elementChildren(main)) unwrappedKidStarts.add(k.start - delta);
  }
  if (main) {
    const unwrapEdits = [{ start: main.start, end: main.openTagEnd, replacement: "" }];
    if (main.endTagStart != null) unwrapEdits.push({ start: main.endTagStart, end: main.endTagEnd, replacement: "" });
    const unwrapped = spliceTrackingSpans(preparedCText, preparedC.spans, unwrapEdits, pageFile);
    bodyText = unwrapped.text;
    bodySpans = unwrapped.spans;
    body = findFirst(parse(bodyText).root, (n) => isElement(n, "body"));
  }
  // Built AFTER the unwrap: A02 below carries offsets into `bodyText`.
  const pageAt = spansToDiagnosticLocator(bodySpans, pageFile, resolveLine);

  // §7.2 — classify top-level children into fills (by slot name) and default content.
  const topKids = elementChildren(body);

  // §7.2 — the unwrapped <main>'s own element children are fills too, wherever
  // that <main> sat. Unwrapping a <main> nested in a wrapper makes its children
  // the WRAPPER's children, not the body's, so the scan below never saw them:
  // the author watched their <main> tags vanish from the output — the strongest
  // possible evidence unify processed exactly that region — while the fill did
  // nothing and `slot=` shipped, at exit 0. Removing the open tag shifts each
  // child left by exactly that tag's length, which is how these offsets are
  // recovered after the splice. The parent of a fill is therefore always <body>
  // or that <main>, and neither can be a component the author is assigning
  // light DOM to — which is what keeps `slot=` inside their own web-component
  // markup untouched.
  const seenStarts = new Set(topKids.map((n) => n.start));
  const extraKids = unwrappedKidStarts.size
    ? findAll(body, (n) => n.type === "element" && unwrappedKidStarts.has(n.start) && !seenStarts.has(n.start))
    : [];
  const fillScope = extraKids.length
    ? [...topKids, ...extraKids].sort((a, b) => a.start - b.start)
    : topKids;
  const fillsByName = new Map(); // name -> {text,spans}[] (already slot-attr-stripped, in page order)
  const localEdits = []; // within body's own content span
  for (const el of fillScope) {
    const slotVal = attrValueOrEmpty(el, SLOT_ATTR);
    const isFillCandidate = slotVal !== "";
    const matchesRealSlot = isFillCandidate && sinks.namedSlots.has(slotVal);

    if (matchesRealSlot) {
      if (!fillsByName.has(slotVal)) fillsByName.set(slotVal, []);
      fillsByName.get(slotVal).push({
        text: spanWithAttrRemoved(bodyText, el, SLOT_ATTR),
        spans: spansWithAttrRemoved(bodySpans, el, SLOT_ATTR),
      });
      localEdits.push({ start: el.start, end: el.end, replacement: "" }); // excised from default content
    } else if (isFillCandidate) {
      // MRG-10/A02: names a slot the layout doesn't have — stays in default content, attr consumed.
      reporter.advisory({
        ...pageAt(el.start),
        message: `no slot named "${slotVal}" in ${layoutFile}; the element stayed in the page content`,
      });
      const attrEdit = removeAttrEdit(el, SLOT_ATTR);
      if (attrEdit) localEdits.push(attrEdit);
    }

  }

  const [bs, be] = contentSpan(body);
  const local = localEdits.map((e) => ({ start: e.start - bs, end: e.end - bs, replacement: e.replacement }));
  const defaultSlice = spliceTrackingSpans(bodyText.slice(bs, be), sliceSpans(bodySpans, bs, be), local, pageFile);
  const defaultContentText = defaultSlice.text;
  const defaultContentSpans = defaultSlice.spans;
  const defaultEmpty = isBlank(defaultContentText);

  // §7.4 — route default content.
  let swallowedByMain = null;
  const namedSlotsInMain = new Set(sinks.namedSlotsInMain);
  if (sinks.defaultSlot) {
    if (defaultEmpty) {
      const [s, e] = contentSpan(sinks.defaultSlot);
      edits.push({
        start: sinks.defaultSlot.start, end: sinks.defaultSlot.end,
        replacement: preparedLText.slice(s, e), replacementSpans: sliceSpans(preparedL.spans, s, e),
      });
    } else {
      edits.push({
        start: sinks.defaultSlot.start, end: sinks.defaultSlot.end,
        replacement: defaultContentText, replacementSpans: defaultContentSpans,
      });
    }
  } else if (sinks.firstMain) {
    if (namedSlotsInMain.size > 0) {
      // P19 (§7.4): no default slot, main is the wholesale-replacement sink,
      // AND a named slot sits inside it — the two rules target overlapping
      // spans (this bullet would replace main's children wholesale; §7.3
      // would separately fill or fall back the nested slot). Resolving it
      // either way loses something silently, so: report, and touch neither
      // main's children nor the nested slot(s) — left exactly as written,
      // matching how P16-flagged slots are left untouched below. The page
      // will not publish (a problem was just raised), so this is a
      // best-effort remnant, not a resolution.
      for (const node of namedSlotsInMain) {
        const name = attrValueOrEmpty(node, "name");
        reporter.problem({
          ...layoutAt(node.start),
          message: `named slot "${name}" is inside <main>, which is also the default-content sink`,
          fixes: [
            "add <slot></slot> inside <main> — then main's other children are left alone (§7.7 C6)",
            `or move <slot name="${name}"> outside <main>`,
          ],
        });
      }
    } else if (!defaultEmpty) {
      const [s, e] = contentSpan(sinks.firstMain);
      edits.push({ start: s, end: e, replacement: defaultContentText, replacementSpans: defaultContentSpans });
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

  // §7.3 — fill or fall back every named slot (P19-flagged ones are left untouched, like P16's).
  for (const [name, node] of sinks.namedSlots) {
    if (isSwallowed(node) || namedSlotsInMain.has(node)) continue;
    const fills = fillsByName.get(name);
    if (fills && fills.length > 0) {
      const { replacement, replacementSpans } = joinWithGlue(fills, "\n    ");
      edits.push({ start: node.start, end: node.end, replacement, replacementSpans });
    } else {
      const [s, e] = contentSpan(node);
      edits.push({ start: node.start, end: node.end, replacement: preparedLText.slice(s, e), replacementSpans: sliceSpans(preparedL.spans, s, e) });
    }
  }

  // A13 duplicates: bare/named slots render fallback; a duplicate <main> just stays untouched.
  for (const dup of sinks.duplicates) {
    if (dup.kind === "main" || isSwallowed(dup.node)) continue;
    const [s, e] = contentSpan(dup.node);
    edits.push({ start: dup.node.start, end: dup.node.end, replacement: preparedLText.slice(s, e), replacementSpans: sliceSpans(preparedL.spans, s, e) });
  }

  return edits;
}

// ------------------------------------------------------------- sink detection

/**
 * §7.1: the layout's sinks — the default slot, each first named slot, the
 * first `<main>` — plus every duplicate (advisory A13, first occurrence wins)
 * and, when there is no default slot, every named slot nested inside
 * `firstMain` (§7.4 P19 — see `composeSinkedBody`).
 * `at` locates a layout-text offset at its true source (`spansToDiagnosticLocator`);
 * `layoutFile` is still named in the A13 messages themselves, because "which
 * layout is this page composing against" is the fact the author needs there
 * and stays true even when the duplicate arrived from a fragment.
 * @returns {{defaultSlot: object|null, namedSlots: Map<string,object>, firstMain: object|null,
 *   duplicates: {node:object, kind:'slot'|'main'}[], namedSlotsInMain: object[], none: boolean}}
 */
function detectSinks(lBody, excluded, at, layoutFile, reporter) {
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
          ...at(slot.start),
          message: `duplicate bare <slot> in ${layoutFile} — the first one wins and renders its own fallback`,
        });
        duplicates.push({ node: slot, kind: "slot" });
      }
    } else if (!namedSlots.has(name)) {
      namedSlots.set(name, slot);
    } else {
      reporter.advisory({
        ...at(slot.start),
        message: `duplicate <slot name="${name}"> in ${layoutFile} — the first one wins and this one renders its own fallback`,
      });
      duplicates.push({ node: slot, kind: "slot" });
    }
  }

  const allMains = findAll(lBody, (n) => isElement(n, "main"));
  const firstMain = allMains[0] ?? null;
  for (let i = 1; i < allMains.length; i++) {
    reporter.advisory({
      ...at(allMains[i].start),
      message: `duplicate <main> in ${layoutFile} — the first one wins`,
    });
    duplicates.push({ node: allMains[i], kind: "main" });
  }

  // §7.4 P19: named slots physically inside firstMain's CONTENT, only
  // meaningful (and only checked) when there is no default slot — a bare
  // slot anywhere would already have become `defaultSlot` above, so
  // `!defaultSlot` here means the layout truly has none.
  const namedSlotsInMain = [];
  if (!defaultSlot && firstMain) {
    const [ms, me] = contentSpan(firstMain);
    for (const node of namedSlots.values()) {
      if (node.start >= ms && node.end <= me) namedSlotsInMain.push(node);
    }
  }

  return {
    defaultSlot, namedSlots, firstMain, duplicates, namedSlotsInMain,
    none: !defaultSlot && namedSlots.size === 0 && !firstMain,
  };
}

// -------------------------------------------------------- shared: P16, A04

/**
 * §7.1 P16: a `<slot>` nested inside another slot's fallback content. Scoped
 * to whatever root the caller passes (a whole page document — every slot in
 * a page is fair game; a layout's `<head>`; a layout's `<body>`) so it can be
 * checked once per region, at the point that region is stable. Reports each
 * violation once, located at the inner (nested) slot — in whichever file
 * actually wrote it, which for a fragment-contributed slot is the fragment
 * (`at`, from `spansToDiagnosticLocator`) — and returns the set of both slots in the pair
 * so callers can exclude them from further processing.
 */
function checkNestedSlots(scopeRoot, at, reporter) {
  const excluded = new Set();
  const allSlots = findAll(scopeRoot, (n) => isElement(n, "slot"));
  for (const outer of allSlots) {
    if (excluded.has(outer)) continue;
    const inner = findFirst(outer, (n) => isElement(n, "slot"));
    if (!inner) continue;
    const outerName = attrValueOrEmpty(outer, "name");
    const innerName = attrValueOrEmpty(inner, "name");
    reporter.problem({
      ...at(inner.start),
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
 * §7.1 MRG-04/P20: every `<slot>` in `scopeRoot` (excluding P16-flagged ones,
 * which are left completely untouched) is a problem, and is replaced by its
 * own children (S4) so best-effort composition still produces a tree to
 * report on. Used for an entire page document (all of a page's slots are
 * "outside a layout's body") and for a layout's `<head>` alone.
 *
 * This was advisory A04 until 2026-08-13. A `<slot>` outside a layout's body
 * is inert in every case — pages fill with the `slot=` attribute, and a head
 * slot is never a sink — so the advisory's only effect was to let a page ship
 * whose author's intent had silently not happened: ratification round 7 had
 * three of five samples write `<slot name="footer">` into a page, and a plain
 * `unify build` published each of them at exit 0 with the layout's fallback
 * footer AND the intended content loose in the body. Every sibling
 * misplacement of this vocabulary (P07, P15, P16, P19) was already a problem;
 * this one was the outlier.
 */
function collectStraySlotEdits(scopeRoot, text, spans, at, reporter, excluded, inPage = false) {
  const edits = [];
  for (const slot of findAll(scopeRoot, (n) => isElement(n, "slot"))) {
    if (excluded.has(slot)) continue;
    const name = getAttr(slot, "name");
    reporter.problem({
      ...at(slot.start),
      message: inPage
        ? "<slot> in a page fills nothing — only a layout declares slots"
        : "<slot> in a layout's <head> is never a sink — sinks are the <slot> elements in the layout's <body>",
      fixes: inPage
        ? [`to fill a layout slot, put slot= on a real element: <footer slot="${name || "footer"}">…</footer>`]
        : ["move it into the layout's <body>, or drop it — a page contributes its own <head> and the two are merged (§8)"],
    });
    const [s, e] = contentSpan(slot);
    edits.push({ start: slot.start, end: slot.end, replacement: text.slice(s, e), replacementSpans: sliceSpans(spans, s, e) });
  }
  return edits;
}

// ------------------------------------------------------------ §8 provenance

/**
 * Calls the real `mergeHead` (head-merge.js) and reconciles provenance onto
 * its returned edits — see this file's header doc for why this is possible
 * without re-deriving head-merge.js's own dedup logic. `pageSpans` must
 * already be valid against `pageText` (i.e. `preparedC`, post-Pass-A) — same
 * text head-merge.js itself is called with — and `pageAt` must be the locator
 * built over those same spans, which head-merge.js's one located diagnostic
 * (A08) reports through.
 */
function mergeHeadWithProvenance({ layoutHead, layoutText, layoutFile, pageHead, pageText, pageSpans, pageFile, pageAt, reporter }) {
  const rawEdits = mergeHead({ layoutHead, layoutText, layoutFile, pageHead, pageText, pageFile, pageAt, reporter });
  if (!pageHead || rawEdits.length === 0) return rawEdits;
  const candidates = elementChildren(pageHead).map((el) => ({
    rawText: rawSpan(pageText, el),
    spans: sliceSpans(pageSpans, el.start, el.end),
  }));
  return rawEdits.map((e) => ({ ...e, replacementSpans: headEditReplacementSpans(e.replacement, candidates) }));
}

/**
 * Split `replacement` on head-merge.js's own `"\n    "` join separator and
 * match each non-empty piece against a page-head child by EXACT text
 * equality (a piece is always one child's whole raw span — rows 1/3-7).
 * Each candidate is consumed at most once (in piece order) so that two
 * byte-identical elements (e.g. a repeated `og:image`, legitimately plural
 * per §8 row 3) still resolve to their own, positionally-correct span rather
 * than both collapsing onto the first match. Unmatched pieces (only ever row
 * 2's title join, which mixes page+layout TEXT rather than copying a child)
 * are left uncovered, so the enclosing `spliceTrackingSpans` call attributes
 * them to `pageFile` via `fillGaps` — harmless, since title text never
 * carries a checkable URL.
 */
function headEditReplacementSpans(replacement, candidates) {
  if (replacement === "") return [];
  const spans = [];
  let cursor = 0;
  const used = new Array(candidates.length).fill(false);
  const pieces = replacement.split(HEAD_JOIN);
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (piece !== "") {
      const idx = candidates.findIndex((c, ci) => !used[ci] && c.rawText === piece);
      if (idx !== -1) {
        used[idx] = true;
        spans.push(...shiftSpans(candidates[idx].spans, cursor));
      }
    }
    cursor += piece.length + (i < pieces.length - 1 ? HEAD_JOIN.length : 0);
  }
  return spans;
}

// ------------------------------------------------------- §9/S11 root attrs

/**
 * Merges page attributes onto the layout's `<html>` or `<body>` start tag,
 * in place, per §9/S11: `class` is layout tokens then new page tokens
 * (deduplicated); any other page attribute overrides the layout's value at
 * its existing position, or is appended (page-source order) when the layout
 * doesn't have it; `data-layout`/consumed `slot` never participate. Never
 * URL-bearing (§11 has no rule for `<html>`/`<body>` attributes), so these
 * edits carry no `replacementSpans` — the enclosing splice attributes them
 * to `pageFile` by fallback, which is harmless and, for `class`/page-set
 * attributes, also simply correct.
 */
function mergeRootAttrs(layoutEl, pageEl) {
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
function stripPolyfillScripts(text, spans, fallbackFile) {
  const { root } = parse(text);
  const scripts = findAll(root, (n) => isElement(n, "script") && hasAttr(n, "data-polyfill"));
  if (scripts.length === 0) return { text, spans };
  const edits = scripts.map((s) => ({ start: s.start, end: s.end, replacement: "" }));
  return spliceTrackingSpans(text, spans, edits, fallbackFile);
}
