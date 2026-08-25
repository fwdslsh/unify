/**
 * `document.js` — the single extraction pass over a final emitted HTML
 * document.
 *
 * The redesign's rule in one sentence: *extract the document once, interpret
 * it centrally, project it many times.* Everything downstream of a composed
 * page — the build's own manifest, the audit report, the catalog, the search
 * corpus — used to re-walk the emitted markup with its own reading of "what
 * is the title", "what counts as body text". This module is the one reading.
 * It produces two halves from one parse:
 *
 *  - a `DocumentSnapshot` — a small, bounded, HTML-shaped projection of the
 *    final document (root/body attributes, head title/meta/link/base,
 *    main-scoped headings) that is safe to publish as-is;
 *  - a `DocumentAnalysis` — the heavier, build-only reading (full visible
 *    text, every id, every raw href, JSON-LD blocks, stray metadata, the
 *    first refresh declaration) that selectors and diagnostics consume but
 *    that never becomes a public content field by default.
 *
 * `extractDocument` only observes: it never throws on malformed markup, never
 * reports a diagnostic, and never writes anything. Interpreting these two
 * shapes — "what is the canonical URL", "is this indexable", "what image
 * represents this page" — is a selector's job, not this module's; selectors
 * live in a module of their own so every consumer reads one interpretation
 * rather than growing a second.
 *
 * `manifest.js` (conformance-spec §20) imports its low-level text machinery
 * from here rather than keeping a second copy: `textContent`, `readText`,
 * `collapse`, `nonEmpty`, `orNull` all port §20.3's exact discipline —
 * decode-then-collapse order, `nonEmpty` for a raw attribute slice vs
 * `orNull` for text a helper already normalized (never double-decode),
 * `findAll`'s default `template` skip, and `INVISIBLE` subtree omission with
 * enter/leave separators for non-`INLINE` elements (`<br>` deliberately not
 * inline — it separates lines, so it separates words).
 */

import { decodeEntities } from "./entities.js";
import { findAll, findFirst, getAttr, innerText, isElement, isInside, isJsonLdScript, parse } from "./html.js";
import { parseRefreshMeta } from "./urls.js";

/** Subtrees whose characters are not visible page text (§20.3). */
export const INVISIBLE = new Set(["script", "style", "template", "noscript"]);

/**
 * §20.3's closed inline set: leaving one of these contributes no separator;
 * leaving any other element contributes one space. Without the separator
 * `<p>a</p><p>b</p>` reads as `ab`; with an unconditional one `a <em>b</em>!`
 * reads as `a b !`. `<br>` is absent on purpose — it separates lines, so it
 * separates words.
 */
export const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "i", "img",
  "kbd", "mark", "q", "rp", "rt", "ruby", "s", "samp", "small", "span", "strong",
  "sub", "sup", "time", "u", "var", "wbr",
]);

/**
 * §20.3's text-content rule: the character data of `el` and its descendants
 * with `INVISIBLE` subtrees omitted, whitespace runs collapsed to one space,
 * and the result trimmed. Comments contribute nothing.
 *
 * Implemented over the parser's node tree rather than by stripping tags from
 * a raw slice, because the raw slice would keep the contents of a `<script>`
 * — which is exactly the "visible text" mistake that makes duplicate-content
 * detection report two pages as identical when only their inline analytics
 * snippet is.
 * @param {import('./html.js').Node} el
 * @returns {string}
 */
export function textContent(el) {
  let out = "";
  const visit = (node) => {
    if (node.type === "text") { out += node.data; return; }
    if (node.type !== "element" && node.type !== "root") return;
    const tag = node.type === "element" ? node.tag.toLowerCase() : "";
    if (INVISIBLE.has(tag)) return;
    // Entering AND leaving: leaving alone fuses a parent's own text with a
    // block child's ("<div>Intro<p>Para</p></div>" -> "IntroPara"). The
    // doubled separator between two adjacent blocks costs nothing, because
    // `collapse` runs over the result.
    const separates = node.type === "element" && !INLINE.has(tag);
    if (separates) out += " ";
    for (const child of node.children ?? []) visit(child);
    if (separates) out += " ";
  };
  for (const child of el.children ?? []) visit(child);
  return readText(out);
}

/** Collapse every run of ASCII whitespace to one space and trim (§20.3). */
export function collapse(s) {
  return s.replace(/[ \t\n\r\f]+/g, " ").trim();
}

/**
 * §20.3's reading of one raw slice of emitted markup: resolve character
 * references, then collapse.
 *
 * The order is not interchangeable and this helper exists so no call site can
 * pick the wrong one. Collapsing first leaves whitespace a reference
 * INTRODUCES uncollapsed — `a&#32;&#32;b` keeps two spaces, `a&#10;b` keeps a
 * raw newline in a field the spec says is collapsed — so two fields reading
 * the same characters disagree. Every text-bearing field goes through here or
 * through `textContent`, which applies the same order, and nothing decodes a
 * value either of them has already returned.
 * @param {string} raw
 * @returns {string}
 */
export function readText(raw) {
  return collapse(decodeEntities(raw));
}

/** Trim-only emptiness, for a value already read by `readText`/`textContent`. */
export function orNull(s) {
  return typeof s === "string" && s.trim() !== "" ? s.trim() : null;
}

/**
 * `""` and whitespace-only both mean "declared nothing" (§20.3). Character
 * references resolve here too: an attribute carries them exactly as element
 * text does, so `content="Tea &amp; Coffee"` is `Tea & Coffee` in the record.
 *
 * For RAW slices only — an attribute value, straight from the parser. A value
 * `readText` or `textContent` already returned must use `orNull` instead, or it
 * decodes twice and reports text no page displays.
 */
export function nonEmpty(s) {
  if (typeof s !== "string") return null;
  const trimmed = decodeEntities(s).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * One element's attributes as a plain object: lowercased names, values with
 * character references decoded and nothing else — no trimming, no coercion.
 * A bare attribute (no `=`) reads as `""`. When a name repeats, the first
 * occurrence wins, which is HTML's own rule for a duplicated attribute.
 * `null`/absent element reads as `{}`.
 * @param {import('./html.js').ElementNode|null} el
 * @returns {Record<string,string>}
 */
function attributesOf(el) {
  const out = {};
  if (el === null) return out;
  const seen = new Set();
  for (const attr of el.attrs) {
    const name = attr.name.toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    out[name] = decodeEntities(attr.value ?? "");
  }
  return out;
}

/**
 * @typedef {object} DocumentSnapshot
 * @property {string|null} path
 * @property {string|null} url
 * @property {{attributes: Record<string,string>}} html
 * @property {{title:string|null, meta:Record<string,string>[], link:Record<string,string>[], base:Record<string,string>[]}} head
 * @property {{attributes: Record<string,string>, headings:{level:number,id:string|null,text:string}[]}} body
 *
 * @typedef {object} JsonLdEntry
 * @property {string} raw
 * @property {any} data
 * @property {string|null} error
 *
 * @typedef {object} RefreshReading
 * @property {string} raw - the decoded, non-empty `content` value
 * @property {number} seconds
 * @property {string|null} url
 * @property {boolean} hasSecondPart
 *
 * @typedef {object} DocumentAnalysis
 * @property {string} visibleText
 * @property {string[]} ids
 * @property {string[]} titleTexts
 * @property {JsonLdEntry[]} jsonLd
 * @property {{tag:string, key:string|null}[]} strayMetadata
 * @property {string[]} rawHrefs
 * @property {RefreshReading|null} refresh
 */

/**
 * Extract a `{document, analysis}` pair from one final emitted HTML document.
 *
 * A single document-order pass over every element does the reading; `path`
 * and `url` are pure passthrough — this module has no opinion on either and
 * never derives one, because a build's URL provenance (pretty URLs, a
 * `--base-url` origin) is a fact of the pipeline, not of the bytes.
 *
 * @param {string} html
 * @param {{path?: string|null, url?: string|null}} [options]
 * @returns {{document: DocumentSnapshot, analysis: DocumentAnalysis}}
 */
export function extractDocument(html, { path = null, url = null } = {}) {
  const { root } = parse(html);

  const htmlEl = findFirst(root, (n) => isElement(n, "html"));
  const bodyEl = findFirst(root, (n) => isElement(n, "body"));
  const hasHead = findFirst(root, (n) => isElement(n, "head")) !== null;

  const meta = [];
  const link = [];
  const base = [];
  const titleTexts = [];
  let title = null;

  /** @type {JsonLdEntry[]} */
  const jsonLd = [];
  /** @type {string[]} */
  const ids = [];
  /** @type {string[]} */
  const rawHrefs = [];
  /** @type {{tag:string, key:string|null}[]} */
  const strayMetadata = [];
  /** @type {RefreshReading|null} the first declaration, document-wide (§20.11). */
  let refreshFirst = null;

  // One document-order pass, mirroring manifest.js's own §20 loop. `findAll`
  // already refuses to descend into `<template>`, so every collector below
  // can trust that what it sees is markup a browser would actually parse into
  // the tree it renders.
  for (const node of findAll(root, (n) => n.type === "element")) {
    const tag = node.tag.toLowerCase();
    const inHead = !hasHead || isInside(node, "head");

    // Every id, document-wide, in document order, repeats kept (§20.3):
    // "this page declares one id twice" is only answerable if both survive.
    const idAttr = nonEmpty(getAttr(node, "id"));
    if (idAttr !== null) ids.push(idAttr);

    if (tag === "title") {
      if (inHead) {
        const text = orNull(readText(innerText(html, node)));
        if (text !== null) {
          titleTexts.push(text);
          if (title === null) title = text;
        }
      } else {
        strayMetadata.push({ tag: "title", key: null });
      }
    } else if (tag === "base") {
      if (inHead) base.push(attributesOf(node));
      else strayMetadata.push({ tag: "base", key: null });
    } else if (tag === "meta") {
      const name = (getAttr(node, "name") ?? "").trim().toLowerCase();
      const property = (getAttr(node, "property") ?? "").trim().toLowerCase();
      // §20.11 — read document-wide, before the head-scope branch below: a
      // redirect meta written outside <head> is still a redirect, and this
      // reading has to see it before deciding whether it also counts as
      // stray metadata.
      const refresh = parseRefreshMeta(node);
      if (refresh !== null && refreshFirst === null) {
        refreshFirst = {
          raw: nonEmpty(getAttr(node, "content")),
          seconds: refresh.seconds,
          url: refresh.url,
          hasSecondPart: refresh.hasSecondPart,
        };
      }
      if (!inHead) {
        // §24.4's closed set: the metas whose only valid position is the
        // head. `schema` is unify's own key (§26.4) and belongs here for the
        // same reason every other row does — it is read with the head, so in
        // the body it reaches no consumer.
        const key = getAttr(node, "charset") !== null ? "charset"
          : name === "description" || name === "robots" || name === "schema" || name.startsWith("twitter:") ? name
          : property.startsWith("og:") ? property
          : null;
        if (key !== null) strayMetadata.push({ tag: "meta", key });
        continue;
      }
      meta.push(attributesOf(node));
    } else if (tag === "link") {
      if (inHead) {
        link.push(attributesOf(node));
      } else {
        // Every other rel — stylesheet, preload, icon — is legal in the body
        // and does its job there. Only canonical is inert outside the head.
        const rel = (getAttr(node, "rel") ?? "").trim().toLowerCase().split(/\s+/);
        if (rel.includes("canonical")) strayMetadata.push({ tag: "link", key: "canonical" });
      }
    } else if (tag === "script" && isJsonLdScript(node)) {
      const raw = innerText(html, node);
      let data = null;
      let error = null;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        error = err.message;
      }
      jsonLd.push({ raw, data, error });
    } else if (tag === "a") {
      const href = getAttr(node, "href");
      if (typeof href === "string") rawHrefs.push(href);
    }
  }

  // §20.7 — the first <main>, else <body>, else the whole document. Reused
  // for both `body.headings`' scope (the 0.9 change: main-scoped, not
  // document-wide) and `analysis.visibleText`.
  const main = findFirst(root, (n) => isElement(n, "main"));
  const scope = main ?? bodyEl ?? root;

  const headings = findAll(scope, (n) => n.type === "element" && /^h[1-6]$/.test(n.tag.toLowerCase()))
    .map((node) => ({
      level: Number(node.tag.toLowerCase().slice(1)),
      id: nonEmpty(getAttr(node, "id")),
      text: textContent(node),
    }));

  const document = {
    path,
    url,
    html: { attributes: attributesOf(htmlEl) },
    head: { title, meta, link, base },
    body: { attributes: attributesOf(bodyEl), headings },
  };

  const analysis = {
    visibleText: textContent(scope),
    ids,
    titleTexts,
    jsonLd,
    strayMetadata,
    rawHrefs,
    refresh: refreshFirst,
  };

  return { document, analysis };
}
