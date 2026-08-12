/**
 * references.js — conformance-spec §12 (the post-build reference check).
 *
 * Runs against the COMPLETED temporary output tree (§2 step 8, after §11
 * rewriting and §13 path computation) — content in, diagnostics out; no
 * filesystem access here, so the caller (the wiring pass) reads the temp
 * tree into memory once and passes it in as plain text maps. Checking is
 * broader than rewriting on purpose (§12's own text: "rewriting deliberately
 * never reaches these — §11.1 — but checking is not rewriting"): `url()` in
 * CSS files, `<style>` blocks, and `style` attributes are all in scope here
 * even though §11 never touches them.
 *
 * Resolution here is deliberately NOT provenance-based (contrast urls.js):
 * §12 resolves a relative reference "against the containing output file's
 * URL" — i.e. against the location of the file the reference-check is
 * currently reading, which this module always knows on its own (it is
 * iterating that file's own text). What §12 needs help with, and cannot
 * derive from the output tree alone, is DIAGNOSTIC ATTRIBUTION: §14.1's R3
 * rule locates a reference problem at the reference's true PROVENANCE file
 * (a page, layout, or include — see `stranded-underscore-asset`'s pinned
 * location `src/_includes/nav.html:2`, not the composed page's own path).
 * That is the identical gap urls.js documents at length (its "PROVENANCE
 * GAP" note) applied to attribution instead of rewriting. `checkReferences`
 * takes an optional `locate` callback for this reason; its default
 * attributes every diagnostic to the OUTPUT file itself, which is correct
 * for page-authored content and imprecise for anything inherited from a
 * layout or include.
 */
import { posix } from "node:path";
import { findAll, getAttr, getAttrNode, isElement, lineOf, parse } from "./html.js";
import { isSkippedUrl, splitUrl } from "./urls.js";
import { CHECK_SPELLING } from "./diagnostics.js";

// ------------------------------------------------------------- CSS url()

/** `url(...)`, matching bare/`"..."`/`'...'` forms, capturing whichever fired. */
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s][^)]*?))\s*\)/gi;

/**
 * Every `url(...)` reference in a CSS text (a `.css` file's full content, a
 * `<style>` block's text, or a `style="…"` attribute's value), with byte
 * offsets relative to `text` itself (the caller adds `baseOffset` when
 * `text` is a substring of a larger document).
 * @param {string} text
 * @param {number} baseOffset
 * @returns {{raw:string, offset:number}[]}
 */
function findCssUrls(text, baseOffset) {
  const out = [];
  for (const m of text.matchAll(CSS_URL_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    // Locate the captured group's own offset within the full match text.
    const withinMatch = m[0].indexOf(raw, m[0].indexOf("url"));
    out.push({ raw, offset: baseOffset + m.index + Math.max(withinMatch, 0) });
  }
  return out;
}

// --------------------------------------------------------- HTML collection

function isOgOrTwitterMeta(el) {
  const property = getAttr(el, "property");
  if (property && /^og:/i.test(property)) return true;
  const name = getAttr(el, "name");
  return Boolean(name && /^twitter:/i.test(name));
}

/**
 * Every checkable reference in one emitted HTML file's text: href/src/poster
 * (any element, any `<link>` rel — REF-01), srcset candidates, root-relative
 * og:/twitter: meta content, `<style>` block url(), and `style=` attribute
 * url() (B5). Byte offsets are relative to `text`.
 * @param {string} text
 * @returns {{raw:string, offset:number}[]}
 */
function collectHtmlReferences(text) {
  const { root } = parse(text);
  const refs = [];
  for (const el of findAll(root, (n) => n.type === "element")) {
    for (const attrName of ["href", "src", "poster"]) {
      const attr = getAttrNode(el, attrName);
      if (attr && attr.value) refs.push({ raw: attr.value, offset: attr.valueStart });
    }
    const srcset = getAttrNode(el, "srcset");
    if (srcset && srcset.value) {
      for (const m of srcset.value.matchAll(/(^|,)(\s*)([^\s,]+)/g)) {
        const urlStart = srcset.valueStart + m.index + m[1].length + m[2].length;
        refs.push({ raw: m[3], offset: urlStart });
      }
    }
    if (isElement(el, "meta") && isOgOrTwitterMeta(el)) {
      const content = getAttrNode(el, "content");
      if (content && content.value && content.value.startsWith("/")) {
        refs.push({ raw: content.value, offset: content.valueStart });
      }
    }
    if (isElement(el, "style")) {
      for (const child of el.children) {
        if (child.type === "text") refs.push(...findCssUrls(child.data, child.start));
      }
    }
    const styleAttr = getAttrNode(el, "style");
    if (styleAttr && styleAttr.value) refs.push(...findCssUrls(styleAttr.value, styleAttr.valueStart));
  }
  return refs;
}

// -------------------------------------------------------------- resolution

/**
 * Strip the `--base-url` prefix from a URL so a value §11.3 absolutized
 * stays checkable instead of masquerading as external (REF-02). Tries the
 * full origin+path form first (only meaningful when `base.origin` is set),
 * then the bare path-prefix form. A value matching neither is returned
 * unchanged — it will be classified as root-relative/relative/external
 * normally by the caller.
 * @param {string} url
 * @param {import('./urls.js').BaseUrlConfig} base
 * @returns {string}
 */
export function stripBaseUrl(url, base) {
  if (base.origin && url.startsWith(base.origin)) {
    const rest = url.slice(base.origin.length); // expected to start with "/"
    if (rest.startsWith(base.pathPrefix)) return `/${rest.slice(base.pathPrefix.length)}`;
    return rest || "/";
  }
  if (base.pathPrefix !== "/" && url.startsWith(base.pathPrefix)) {
    return `/${url.slice(base.pathPrefix.length)}`;
  }
  return url;
}

/**
 * Resolve one reference to the output path it names, per §12's own
 * resolution rule (relative to the CONTAINING OUTPUT FILE, never
 * provenance): root-relative URLs resolve from the tree root; relative ones
 * resolve against `dirname(containingOutputPath)`; a directory URL (empty
 * path or trailing `/`) resolves to `index.html` within it (REF-03).
 * @param {string} url - already base-url-stripped
 * @param {string} containingOutputPath
 * @returns {string|null} an output path with no leading "/", or null when
 *   the URL is out of scope (skipped) or escapes the tree entirely
 */
export function resolveReference(url, containingOutputPath) {
  if (isSkippedUrl(url)) return null;
  const { path } = splitUrl(url); // query/fragment never participate (REF-06 for fragments)
  if (path === "") return null;
  let resolved = path.startsWith("/")
    ? posix.normalize(path).replace(/^\/+/, "")
    : posix.normalize(posix.join(posix.dirname(containingOutputPath), path));
  if (resolved === "." ) resolved = "";
  if (resolved.startsWith("..")) return null; // escapes the tree — never resolvable, never emitted
  if (resolved === "" || resolved.endsWith("/")) resolved = posix.join(resolved, "index.html");
  return resolved;
}

// ------------------------------------------------------------------- check

/**
 * @typedef {(outputFile: string, offset: number) => {file: string, line?: number}} Locate
 *   Maps a byte offset within an emitted output file's text back to its true
 *   authoring source for diagnostic attribution (§14.1 R3). See the
 *   module-level docs. Defaults to attributing to the output file itself.
 */

/**
 * §12 — the post-build reference check.
 *
 * @param {object} args
 * @param {Map<string,string>} args.htmlFiles - emitted HTML output path
 *   (source-root-relative, posix, no leading "/") -> full text
 * @param {Map<string,string>} args.cssFiles - emitted CSS output path -> full text
 * @param {Set<string>} args.emittedPaths - every emitted output path,
 *   HTML/CSS/every other asset alike (superset of htmlFiles/cssFiles keys) —
 *   membership is what "resolves to an emitted file" means (REF-04)
 * @param {import('./urls.js').BaseUrlConfig|null} [args.base] - the
 *   `--base-url` config, or null/omitted when not set
 * @param {Locate} [args.locate]
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {void} reports P13 problems via `reporter`
 */
export function checkReferences({ htmlFiles, cssFiles, emittedPaths, base = null, locate, reporter }) {
  const resolveLocate = locate ?? defaultLocate(htmlFiles, cssFiles);

  for (const [outputPath, text] of htmlFiles) {
    for (const ref of collectHtmlReferences(text)) {
      checkOne(ref, outputPath, { base, emittedPaths, reporter, locate: resolveLocate });
    }
  }
  for (const [outputPath, text] of cssFiles) {
    for (const ref of findCssUrls(text, 0)) {
      checkOne(ref, outputPath, { base, emittedPaths, reporter, locate: resolveLocate });
    }
  }
}

function checkOne({ raw, offset }, containingOutputPath, { base, emittedPaths, reporter, locate }) {
  const stripped = base ? stripBaseUrl(raw, base) : raw;
  const resolved = resolveReference(stripped, containingOutputPath);
  if (resolved === null) return; // out of scope: external/mailto/tel/data/fragment-only/escaping
  if (emittedPaths.has(resolved)) return; // REF-05: exact, case-sensitive membership

  const { file, line } = locate(containingOutputPath, offset);
  reporter.problem({
    file,
    line,
    message: `${raw} does not resolve to any emitted file`,
    context: raw,
    fixes: [CHECK_SPELLING],
  });
}

/**
 * Default `locate`: attribute every diagnostic to the output file itself, at
 * that file's own line. Correct for page-authored content; see the
 * module-level docs for why this is an approximation for inherited content.
 * @param {Map<string,string>} htmlFiles
 * @param {Map<string,string>} cssFiles
 * @returns {Locate}
 */
function defaultLocate(htmlFiles, cssFiles) {
  return (file, offset) => {
    const text = htmlFiles.get(file) ?? cssFiles.get(file) ?? "";
    return { file, line: lineOf(text, offset) };
  };
}
