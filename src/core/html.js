/**
 * html.js — HTML tokenizing/parsing support for the splice engine.
 *
 * Conformance-spec §3 (the splice model): unify composes by editing SPANS of
 * source text; it never reformats, re-indents, or re-serializes markup. That
 * means this module is not a browser-grade tree builder that a caller then
 * re-serializes — it is a strict tokenizer, like the one the conformance
 * harness's own comparator (tests/conformance/compare.mjs) hand-rolls, except
 * every node here additionally carries the byte offsets a caller needs to cut
 * and splice the original text.
 *
 * The tokenization rules are deliberately IDENTICAL to compare.mjs's: same
 * void-element list, same raw-text elements (script/style/textarea/title),
 * same attribute grammar, same tolerant mismatched-end-tag handling, same
 * `<div/>`-is-self-closing deviation from real HTML parsing. That agreement
 * is load-bearing: this module's output is what the engine edits, and
 * compare.mjs's output is what the test harness compares against — if the
 * two tokenizers disagreed about where an element starts or ends, the engine
 * could produce byte-correct-by-its-own-model output that the harness then
 * mis-slices and fails, or worse, silently mis-splices content. No entity
 * decoding, no tag-case folding, no attribute reordering, no whitespace
 * trimming happens anywhere in this file — those are exactly the previous
 * implementation's failure modes (testing-strategy §1 M5) the splice model
 * exists to avoid.
 */

export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Raw-text elements: content is captured as one opaque text child, never tokenized for nested tags. */
export const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

const WS_RE = /[ \t\n\r\f]/;

/**
 * @typedef {object} ElementNode
 * @property {'element'} type
 * @property {string} tag - as written, case preserved
 * @property {Attr[]} attrs
 * @property {number} start - index of '<' of the start tag
 * @property {number} openTagEnd - index right after the start tag's closing '>' (or '/>')
 * @property {number} attrsEnd - index right before the start tag's closing '>' or '/>' — the
 *   insertion point for a new attribute
 * @property {boolean} selfClosing - written as `<tag ... />`
 * @property {boolean} void - tag is in VOID_ELEMENTS
 * @property {number|null} endTagStart - index of '<' of the matching end tag, or null
 * @property {number|null} endTagEnd - index right after the matching end tag's '>', or null
 * @property {number} end - index right after this element's last byte (== openTagEnd when
 *   void/self-closing/unclosed)
 * @property {Node[]} children
 * @property {Node|null} parent
 *
 * @typedef {object} Attr
 * @property {string} name
 * @property {string|null} value - null = bare attribute (present, no `=`), distinct from ""
 * @property {number} start - includes the attribute's own leading whitespace, for clean removal
 * @property {number} end
 * @property {number} nameStart
 * @property {number} valueStart
 * @property {number} valueEnd
 *
 * @typedef {{type:'text', data:string, start:number, end:number, parent:Node|null}} TextNode
 * @typedef {{type:'comment', data:string, start:number, end:number, parent:Node|null}} CommentNode
 * @typedef {{type:'bogus', raw:string, start:number, end:number, parent:Node|null}} BogusNode
 * @typedef {{type:'stray-endtag', tag:string, start:number, end:number, parent:Node|null}} StrayEndTagNode
 * @typedef {{type:'root', children:Node[], parent:null}} RootNode
 * @typedef {ElementNode|TextNode|CommentNode|BogusNode|StrayEndTagNode|RootNode} Node
 */

/**
 * Tokenize `text` into a tree. The doctype (if any, wherever it appears) is
 * reported separately, exactly as compare.mjs treats it — it is metadata,
 * not a tree node, because nothing in the splice model ever edits it.
 *
 * @param {string} text
 * @returns {{doctype: {raw:string,start:number,end:number}|null, root: RootNode}}
 */
export function parse(text) {
  /** @type {RootNode} */
  const root = { type: "root", children: [], parent: null };
  /** @type {Node[]} */
  const stack = [root];
  let doctype = null;
  let i = 0;
  const top = () => stack[stack.length - 1];
  const pushText = (s, start, end) => {
    if (s) top().children.push({ type: "text", data: s, start, end, parent: top() });
  };

  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) { pushText(text.slice(i), i, text.length); break; }
    if (lt > i) pushText(text.slice(i, lt), i, lt);

    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      const stop = end === -1 ? text.length : end + 3;
      top().children.push({ type: "comment", data: text.slice(lt + 4, end === -1 ? text.length : end), start: lt, end: stop, parent: top() });
      i = stop;
      continue;
    }
    if (/^<!doctype/i.test(text.slice(lt, lt + 9))) {
      const gt = text.indexOf(">", lt);
      const stop = gt === -1 ? text.length : gt + 1;
      doctype = { raw: text.slice(lt, stop), start: lt, end: stop };
      i = stop;
      continue;
    }
    if (text.startsWith("<!", lt) || text.startsWith("<?", lt)) {
      const gt = text.indexOf(">", lt);
      const stop = gt === -1 ? text.length : gt + 1;
      top().children.push({ type: "bogus", raw: text.slice(lt, stop), start: lt, end: stop, parent: top() });
      i = stop;
      continue;
    }
    if (text.startsWith("</", lt)) {
      const m = /^<\/([^\s>]+)\s*>/.exec(text.slice(lt));
      if (!m) { pushText("<", lt, lt + 1); i = lt + 1; continue; }
      const name = m[1].toLowerCase();
      const stop = lt + m[0].length;
      let found = -1;
      for (let s = stack.length - 1; s >= 1; s--) {
        if (/** @type {ElementNode} */ (stack[s]).tag.toLowerCase() === name) { found = s; break; }
      }
      if (found === -1) {
        top().children.push({ type: "stray-endtag", tag: m[1], start: lt, end: stop, parent: top() });
      } else {
        // Closes intermediates too (deterministic on both sides — compare.mjs
        // does the same): elements between the matched frame and the top of
        // the stack had no end tag of their own.
        for (let s = stack.length - 1; s >= found; s--) {
          const el = /** @type {ElementNode} */ (stack[s]);
          if (s === found) {
            el.endTagStart = lt;
            el.endTagEnd = stop;
            el.end = stop;
          } else {
            el.endTagStart = null;
            el.endTagEnd = null;
            el.end = lt;
          }
        }
        stack.length = found;
      }
      i = stop;
      continue;
    }
    const tm = /^<([a-zA-Z][^\s/>]*)/.exec(text.slice(lt));
    if (!tm) { pushText("<", lt, lt + 1); i = lt + 1; continue; }
    const tag = tm[1];
    let j = lt + tm[0].length;
    /** @type {Attr[]} */
    const attrs = [];
    let selfClosing = false;
    let attrsEnd = j;
    for (;;) {
      const segStart = j;
      while (j < text.length && WS_RE.test(text[j])) j++;
      if (j >= text.length) { attrsEnd = j; break; }
      if (text[j] === ">") { attrsEnd = j; j++; break; }
      if (text[j] === "/" && text[j + 1] === ">") { attrsEnd = j; selfClosing = true; j += 2; break; }
      if (text[j] === "/") { j++; continue; }
      const am = /^[^\s=/>]+/.exec(text.slice(j));
      if (!am) { j++; continue; }
      const aname = am[0];
      const nameStart = j;
      j += aname.length;
      let k = j;
      while (k < text.length && WS_RE.test(text[k])) k++;
      let avalue = null;
      let valueStart = -1;
      let valueEnd = -1;
      if (text[k] === "=") {
        k++;
        while (k < text.length && WS_RE.test(text[k])) k++;
        const q = text[k];
        if (q === '"' || q === "'") {
          const endq = text.indexOf(q, k + 1);
          valueStart = k + 1;
          valueEnd = endq === -1 ? text.length : endq;
          avalue = text.slice(valueStart, valueEnd);
          k = endq === -1 ? text.length : endq + 1;
        } else {
          const vm = /^[^\s>]*/.exec(text.slice(k));
          valueStart = k;
          valueEnd = k + vm[0].length;
          avalue = vm[0];
          k += vm[0].length;
        }
        j = k;
      }
      attrs.push({ name: aname, value: avalue, start: segStart, end: j, nameStart, valueStart, valueEnd });
    }
    const openTagEnd = j;
    const lower = tag.toLowerCase();
    const isVoid = VOID_ELEMENTS.has(lower);
    /** @type {ElementNode} */
    const node = {
      type: "element", tag, attrs, start: lt, openTagEnd, attrsEnd,
      selfClosing, void: isVoid, endTagStart: null, endTagEnd: null,
      end: openTagEnd, children: [], parent: top(),
    };
    top().children.push(node);

    if (RAW_TEXT_ELEMENTS.has(lower) && !selfClosing && !isVoid) {
      const rest = text.slice(openTagEnd);
      const cm = new RegExp(`</${lower}[\\s/>]`, "i").exec(rest);
      const rawEnd = cm ? openTagEnd + cm.index : text.length;
      const raw = text.slice(openTagEnd, rawEnd);
      if (raw) node.children.push({ type: "text", data: raw, start: openTagEnd, end: rawEnd, parent: node });
      if (cm) {
        const gt = text.indexOf(">", rawEnd);
        const stop = gt === -1 ? text.length : gt + 1;
        node.endTagStart = rawEnd;
        node.endTagEnd = stop;
        node.end = stop;
        i = stop;
      } else {
        node.end = text.length;
        i = text.length;
      }
      continue;
    }
    if (!isVoid && !selfClosing) stack.push(node);
    i = openTagEnd;
  }

  // Anything left open at EOF never got an end tag; finalize its span.
  for (let s = stack.length - 1; s >= 1; s--) {
    const el = /** @type {ElementNode} */ (stack[s]);
    el.end = text.length;
  }

  return { doctype, root };
}

// ------------------------------------------------------------------ queries

/** @param {Node} node @returns {node is ElementNode} */
export function isElement(node, tag) {
  return node.type === "element" && (tag === undefined || node.tag.toLowerCase() === tag.toLowerCase());
}

/**
 * Pre-order walk. `enter(node)` may return `false` to skip that node's
 * children (used to keep `<template>` contents — and anything else a caller
 * names — completely inert, per §7.1/§7.3/C9: template content is never
 * unify's).
 * @param {Node} node
 * @param {(node: Node) => boolean|void} enter
 */
export function walk(node, enter) {
  const children = node.children;
  if (!children) return;
  for (const child of children) {
    const descend = enter(child);
    if (descend !== false) walk(child, enter);
  }
}

/**
 * @param {Node} root
 * @param {(node: Node) => boolean} predicate
 * @param {{skipTag?: string}} [opts] - stop descending into elements with this tag (default "template")
 * @returns {Node[]}
 */
export function findAll(root, predicate, opts = {}) {
  const skip = (opts.skipTag ?? "template").toLowerCase();
  const out = [];
  walk(root, (node) => {
    if (predicate(node)) out.push(node);
    if (isElement(node, skip)) return false;
  });
  return out;
}

/**
 * @param {Node} root
 * @param {(node: Node) => boolean} predicate
 * @param {{skipTag?: string}} [opts]
 * @returns {Node|null}
 */
export function findFirst(root, predicate, opts = {}) {
  const skip = (opts.skipTag ?? "template").toLowerCase();
  let found = null;
  walk(root, (node) => {
    if (found) return false;
    if (predicate(node)) { found = node; return false; }
    if (isElement(node, skip)) return false;
  });
  return found;
}

/** @param {Node} node @returns {ElementNode[]} the element (not text/comment) children, in source order */
export function elementChildren(node) {
  return /** @type {ElementNode[]} */ (node.children.filter((c) => c.type === "element"));
}

/** True if `node` has an ancestor (up to but excluding `root`) that is an element named `tag`. */
export function isInside(node, tag) {
  const lower = tag.toLowerCase();
  for (let p = node.parent; p && p.type !== "root"; p = p.parent) {
    if (isElement(p, lower)) return true;
  }
  return false;
}

/**
 * Case-insensitive attribute lookup (HTML attribute names are ASCII
 * case-insensitive; this project's own attribute vocabulary — `slot`,
 * `data-layout`, `rel`, `name`, `property`, `charset` — is always written
 * lowercase, but comparison stays tolerant of authored case).
 * @param {ElementNode} el
 * @param {string} name
 * @returns {Attr|null}
 */
export function getAttrNode(el, name) {
  const lower = name.toLowerCase();
  for (const a of el.attrs) if (a.name.toLowerCase() === lower) return a;
  return null;
}

/**
 * @param {ElementNode} el
 * @param {string} name
 * @returns {string|null} the value, "" for a valueless bare attribute... no:
 *   null means absent OR bare (see getAttrNode for the bare/absent distinction)
 */
export function getAttr(el, name) {
  const a = getAttrNode(el, name);
  return a ? a.value : null;
}

/** @param {ElementNode} el @param {string} name @returns {boolean} */
export function hasAttr(el, name) {
  return getAttrNode(el, name) !== null;
}

/**
 * The attribute's value with a non-empty test: absent, bare (no `=`), and
 * `name=""` all read as "no value" for the purposes of §7.2's `slot=""`
 * rule and similar non-empty checks elsewhere.
 * @param {ElementNode} el
 * @param {string} name
 * @returns {string} "" when absent, bare, or empty
 */
export function attrValueOrEmpty(el, name) {
  return getAttr(el, name) ?? "";
}

/** Space-separated attribute value split into tokens (rel, class). */
export function tokens(value) {
  return (value ?? "").split(WS_RE).filter(Boolean);
}

// ------------------------------------------------------------------- spans

/** @param {string} text @param {Node} node @returns {string} the node's own raw source span */
export function rawSpan(text, node) {
  return text.slice(node.start, node.end);
}

/**
 * An element's content span: between its start tag and end tag. Empty and
 * equal to `[openTagEnd, openTagEnd]` for void/self-closing/unclosed elements.
 * @param {ElementNode} el
 * @returns {[number, number]}
 */
export function contentSpan(el) {
  return [el.openTagEnd, el.endTagStart ?? el.openTagEnd];
}

/** @param {string} text @param {ElementNode} el @returns {string} */
export function innerText(text, el) {
  const [s, e] = contentSpan(el);
  return text.slice(s, e);
}

/**
 * True for `<script type="application/ld+json">`, case- and parameter-tolerant.
 *
 * It lives here, in the leaf both readers already import, because §12
 * (references.js) and §20.8 (manifest.js) must agree about which blocks are
 * structured data: two copies could disagree about a `; charset=utf-8`
 * parameter or an uppercase spelling, and the disagreement would be silent in
 * both — the checker skipping a block the manifest reports on, or the reverse.
 * `JSON.parse` is deterministic and may be called by either.
 * @param {Node} el
 * @returns {boolean}
 */
export function isJsonLdScript(el) {
  if (!isElement(el, "script")) return false;
  const type = getAttr(el, "type");
  return typeof type === "string" && type.trim().toLowerCase().split(";")[0] === "application/ld+json";
}

/**
 * @param {string} text
 * @param {number} index - 0-based offset into text
 * @returns {number} 1-based line number
 */
export function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Apply non-overlapping `{start, end, replacement}` edits to `text` in one
 * pass. Index-based, never `String.prototype.replace` — a replacement string
 * containing `$&`, `$1`, `$'`, `` $` ``, or `$$` must survive byte-for-byte
 * (the dollar-patterns landmine pins exactly this).
 * @param {string} text
 * @param {{start:number, end:number, replacement:string}[]} edits
 * @returns {string}
 */
export function applyEdits(text, edits) {
  if (edits.length === 0) return text;
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.start < cursor) {
      throw new Error(`html.js applyEdits: overlapping edit at ${edit.start} (cursor at ${cursor})`);
    }
    out += text.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  return out + text.slice(cursor);
}

/**
 * An edit that cleanly removes one attribute (including its own leading
 * whitespace) from an element's start tag — S7's "a removed attribute... is
 * removed cleanly from its tag", and nothing else about the tag changes.
 * @param {ElementNode} el
 * @param {string} name
 * @returns {{start:number,end:number,replacement:''}|null} null when absent
 */
export function removeAttrEdit(el, name) {
  const a = getAttrNode(el, name);
  return a ? { start: a.start, end: a.end, replacement: "" } : null;
}

/**
 * `text`'s raw span for `el` with one attribute cleanly excised — used to
 * render a slot fill (S3) or root-attribute-merge source without disturbing
 * anything else about the element's markup.
 * @param {string} text
 * @param {ElementNode} el
 * @param {string} name
 * @returns {string}
 */
export function spanWithAttrRemoved(text, el, name) {
  const a = getAttrNode(el, name);
  if (!a) return rawSpan(text, el);
  return text.slice(el.start, a.start) + text.slice(a.end, el.end);
}

/** @param {string} s @returns {boolean} true when s is empty or all HTML whitespace */
export function isBlank(s) {
  return /^[ \t\n\r\f]*$/.test(s);
}
