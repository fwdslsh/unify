/**
 * `slotted-include.js` — conformance-spec §32, the non-empty `<include>`.
 *
 * §5's include is unchanged for the case it already served, and the two are
 * told apart by one byte of the author's own markup: an EMPTY
 * `<include src="…"></include>` is a verbatim textual splice, and a NON-EMPTY
 * one is a composition. That split is the whole feature. It adds no
 * vocabulary — an author filling a fragment's slots has already learned the
 * rule from layouts — and an author who never writes content between the tags
 * never meets it.
 *
 * Read from the fragment's side the same split says something more useful:
 * an empty include PASSES its `<slot>` elements through to the host, where a
 * layout's composition consumes them (the established behaviour, unchanged),
 * and a non-empty include CONSUMES them itself. So one shared fragment can be
 * a layout's chrome in one file and a filled component in another without
 * being written twice (§32.4).
 *
 * WHAT THIS IS NOT (§32.7). No props. No attributes passed to a fragment. No
 * expressions, loops, conditionals, or implicit data. No attribute merging.
 * No style scoping. A fragment cannot read the page that included it and a
 * page cannot read the fragment. The complete authoring rule is one sentence:
 * an include may carry content when its target is a fragment with slots, and
 * that content fills them the way a page fills a layout's.
 *
 * TWO SUBTRACTIONS from §7, and both follow from what a fragment is (§4.4):
 * no head merge and no root attributes. A fragment is a bare snippet; it
 * contributes no `<title>`, no `<meta>`, no `<link>`, and it has neither
 * `<html>` nor `<body>` for §9 to range over. One of those elements inside a
 * fragment reached this way is **P27** — §10.5's shape one file type over,
 * and for the same reason: it would land in the body and do nothing.
 *
 * ONE SEVERITY DIFFERS FROM ITS NEIGHBOUR, deliberately. §7.3 makes a page's
 * unmatched fill advisory **A02**, because that content stays in the page
 * flow and nothing is lost. A fragment has no flow — the include element is
 * replaced entirely — so an unmatched fill is content the author wrote and
 * the build dropped, which the content-loss law never permits. Hence **P28**.
 *
 * PROVENANCE is why this module exists at all rather than being a few lines
 * in includes.js. The merged text interleaves bytes from two files: the
 * fragment supplies the frame, the host supplies the fills, and §14.1's line
 * attribution has to survive the interleaving. `spliceTrackingSpans` (from
 * compose.js, the same function the page/layout merge uses) is what carries
 * it — the fragment's own spans go in, the fills' host spans ride on each
 * edit, and every byte of the result still names the file that wrote it.
 */

import { findAll, getAttr, getAttrNode, isElement, parse } from "./html.js";
import {
  checkNestedSlots,
  joinWithGlue,
  sliceSpans,
  spansWithAttrRemoved,
  spliceTrackingSpans,
} from "./compose.js";

/** A `<slot>`'s name, trimmed; `""` for the bare slot. */
function slotName(el) {
  return (getAttr(el, "name") ?? "").trim();
}

/**
 * Every `<slot>` inside a `<template>`, which §7.1 never touches and neither
 * does this: markup inside a template is inert in the shipped page, so it
 * declares nothing.
 */
function templateExcluded(root) {
  const excluded = new Set();
  for (const tpl of findAll(root, (n) => isElement(n, "template"))) {
    for (const slot of findAll(tpl, (n) => isElement(n, "slot"))) excluded.add(slot);
  }
  return excluded;
}

/**
 * §32.2 — does this fragment declare a slot? The question `includes.js` asks
 * before it commits to a composition, and the one that separates P26 from a
 * successful merge.
 * @param {string} fragmentText
 * @returns {boolean}
 */
export function declaresSlot(fragmentText) {
  const { root } = parse(fragmentText);
  const excluded = templateExcluded(root);
  return findAll(root, (n) => isElement(n, "slot")).some((n) => !excluded.has(n));
}

/**
 * §32.3 — merge an include's content into its fragment.
 *
 * @param {object} args
 * @param {string} args.fragmentText - the fragment, its OWN includes already inlined
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} args.fragmentSpans
 * @param {string} args.fragmentFile - source-root-relative, for provenance gaps
 * @param {string} args.contentText - the include's content, verbatim
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} args.contentSpans
 * @param {string} args.contentFile - source-root-relative
 * @param {{file:string, line?:number}} args.at - where to locate a problem: the
 *   include element in the file that wrote it (§32.2), never the fragment
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{text:string, spans:{start:number,end:number,file:string,fileOffset:number}[]}}
 */
export function mergeSlottedInclude({
  fragmentText, fragmentSpans, fragmentFile, contentText, contentSpans, contentFile, at, reporter,
}) {
  const { root: fRoot } = parse(fragmentText);
  const excluded = templateExcluded(fRoot);

  // P27 — a fragment is a bare snippet (§4.4). These three would land in the
  // body and do nothing, which is §10.5's own reasoning one file type over.
  for (const tag of ["head", "html", "body"]) {
    const el = findAll(fRoot, (n) => isElement(n, tag))[0];
    if (!el) continue;
    reporter.problem({
      ...at,
      message: `<${tag}> in ${fragmentFile} — a fragment filled by an <include> contributes no head and no root attributes`,
      fixes: [
        `delete the <${tag}> and leave the fragment a bare snippet`,
        "site-wide head content belongs in the layout, which is the file that has a <head>",
      ],
    });
    return collapsedToFallbacks(fragmentText, fragmentSpans, fragmentFile);
  }

  // §7.1's nesting rule, reported against the fragment's own slots.
  checkNestedSlots(fRoot, () => at, reporter);

  // ---- the fragment's sinks -----------------------------------------------
  const slots = findAll(fRoot, (n) => isElement(n, "slot")).filter((n) => !excluded.has(n));
  let bare = null;
  const named = new Map();
  for (const slot of slots) {
    const name = slotName(slot);
    if (name === "") {
      if (bare === null) bare = slot;
      else reporter.advisory({ ...at, message: `duplicate bare <slot> in ${fragmentFile} — the first one wins and renders its own fallback` });
    } else if (!named.has(name)) {
      named.set(name, slot);
    } else {
      reporter.advisory({ ...at, message: `duplicate <slot name="${name}"> in ${fragmentFile} — the first one wins and renders its own fallback` });
    }
  }

  // ---- the include's fills ------------------------------------------------
  // Top-level only, exactly as §7.1 counts a page's fills on direct children
  // of <body>: a `slot=` deeper than that addresses nothing, and pretending
  // otherwise is the area-matching this feature exists without.
  const { root: cRoot } = parse(contentText);
  const fills = new Map();
  const unaddressed = [];
  for (const node of cRoot.children ?? []) {
    const name = node.type === "element" ? (getAttr(node, "slot") ?? "").trim() : "";
    if (name === "") {
      unaddressed.push(node);
      continue;
    }
    if (!named.has(name)) {
      // P28 — not §7.3's advisory. A fragment has no flow for this content to
      // stay in: the include element is replaced entirely, so it would be
      // dropped, and the content-loss law never permits that.
      reporter.problem({
        ...at,
        message: `slot="${name}" names no <slot> in ${fragmentFile} — this content would be dropped`,
        context: contentText.slice(node.start, Math.min(node.end, node.start + 120)).trim(),
        fixes: [
          `add <slot name="${name}"></slot> to ${fragmentFile}`,
          `or use one of the names it does declare: ${[...named.keys()].map((n) => `"${n}"`).join(", ") || "(it declares none)"}`,
        ],
      });
      return collapsedToFallbacks(fragmentText, fragmentSpans, fragmentFile);
    }
    if (!fills.has(name)) fills.set(name, []);
    fills.get(name).push(node);
  }

  // ---- the edits ----------------------------------------------------------
  const piecesFor = (nodes, dropSlotAttr) => nodes.map((n) => ({
    text: dropSlotAttr && n.type === "element" && getAttrNode(n, "slot")
      ? withAttrRemoved(contentText, n, "slot")
      : contentText.slice(n.start, n.end),
    spans: dropSlotAttr && n.type === "element"
      ? shiftToZero(spansWithAttrRemoved(contentSpans, n, "slot"), n.start)
      : shiftToZero(sliceSpans(contentSpans, n.start, n.end), n.start),
  }));

  const edits = [];
  const fallbackEdit = (slot) => ({
    // An unfilled slot is replaced by its OWN children (§7.1's fallback), so
    // a fragment previews in a browser exactly as a layout does.
    start: slot.start,
    end: slot.end,
    replacement: fragmentText.slice(slot.openTagEnd, slot.endTagStart ?? slot.openTagEnd),
    replacementSpans: shiftToZero(
      sliceSpans(fragmentSpans, slot.openTagEnd, slot.endTagStart ?? slot.openTagEnd),
      slot.openTagEnd,
    ),
  });

  for (const [name, slot] of named) {
    const nodes = fills.get(name);
    if (!nodes) {
      edits.push(fallbackEdit(slot));
      continue;
    }
    // `joinWithGlue` already returns `{replacement, replacementSpans}` — the
    // exact shape `spliceTrackingSpans` reads, which is why the page/layout
    // merge spreads it rather than re-wrapping it.
    edits.push({ start: slot.start, end: slot.end, ...joinWithGlue(piecesFor(nodes, true), "\n") });
  }

  if (bare !== null) {
    const nodes = unaddressed.filter((n) => n.type !== "text" || contentText.slice(n.start, n.end).trim() !== "");
    if (nodes.length === 0) {
      edits.push(fallbackEdit(bare));
    } else {
      edits.push({ start: bare.start, end: bare.end, ...joinWithGlue(piecesFor(unaddressed, false), "") });
    }
  } else if (unaddressed.some((n) => n.type !== "text" || contentText.slice(n.start, n.end).trim() !== "")) {
    // Content addressed to nobody, in a fragment with no bare slot to take
    // it. Same reasoning as P28 above: it would be dropped.
    reporter.problem({
      ...at,
      message: `this <include>'s content addresses no slot, and ${fragmentFile} declares no bare <slot>`,
      fixes: [
        `add <slot></slot> to ${fragmentFile} for unaddressed content`,
        `or address the content with slot="…": ${[...named.keys()].map((n) => `"${n}"`).join(", ") || "(the fragment declares no named slots either)"}`,
      ],
    });
    return collapsedToFallbacks(fragmentText, fragmentSpans, fragmentFile);
  }

  return spliceTrackingSpans(fragmentText, fragmentSpans, edits, fragmentFile);
}

/**
 * The fragment as it renders with NOTHING filled: every slot replaced by its
 * own children (§7.1's fallback). This is what every error path below returns.
 *
 * Returning the fragment untouched instead was the obvious thing and it was
 * wrong: the build is already blocked, but the stray `<slot>` elements then
 * flowed into the page, where §7's own composition reported them as P20
 * ("<slot> in a page fills nothing") — a second diagnostic, pointing at the
 * fragment, proposing a fix for a fault the author does not have. One fault,
 * one message; a cascade from a blocked build is noise (§12's own exemption
 * makes the same choice for a page that failed to compose).
 * @param {string} text
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} spans
 * @param {string} file
 */
function collapsedToFallbacks(text, spans, file) {
  const { root } = parse(text);
  const excluded = templateExcluded(root);
  const edits = findAll(root, (n) => isElement(n, "slot"))
    .filter((n) => !excluded.has(n))
    .map((slot) => ({
      start: slot.start,
      end: slot.end,
      replacement: text.slice(slot.openTagEnd, slot.endTagStart ?? slot.openTagEnd),
      replacementSpans: shiftToZero(
        sliceSpans(spans, slot.openTagEnd, slot.endTagStart ?? slot.openTagEnd),
        slot.openTagEnd,
      ),
    }));
  return spliceTrackingSpans(text, spans, edits, file);
}

/** An element's text with one attribute removed, mirroring `spansWithAttrRemoved`. */
function withAttrRemoved(text, el, name) {
  const a = getAttrNode(el, name);
  if (!a) return text.slice(el.start, el.end);
  return text.slice(el.start, a.start) + text.slice(a.end, el.end);
}

/** Rebase spans so the first byte of a slice is offset 0. */
function shiftToZero(spans, origin) {
  return spans.map((s) => ({ ...s, start: s.start - origin, end: s.end - origin }));
}
