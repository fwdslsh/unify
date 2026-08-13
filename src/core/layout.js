/**
 * layout.js — conformance-spec §6 (layout resolution).
 *
 * Scope: this module decides, for one page, WHICH layout file applies (or
 * that none does) and flags the ways a `data-layout`/`layout:` declaration
 * can be wrong (§6.1-§6.3: P04, P05, P07, P15) plus the retired-vocabulary
 * scan (§6.3: P08). It never composes (§7 — compose.js's exclusive scope):
 * the caller takes the resolved layout's absolute path (or `none`) and hands
 * both the page text and the layout text to `compose.compose()` itself.
 *
 * Two document shapes feed selection (§6.1 steps 1-3):
 *   - An HTML page/layout: the `data-layout` attribute lives on a parsed
 *     `<html>` or `<body>` element — `resolveHtmlLayout` takes an
 *     already-parsed root (html.js) plus its source text.
 *   - A Markdown page: the `layout:` frontmatter value is already extracted
 *     by markdown.js's `convert()` (its `.layout` field) — `resolveMarkdownLayout`
 *     takes that value plus the page's raw source text (to locate the key's
 *     line for diagnostics; markdown.js parses the VALUE, this module only
 *     needs to know which line it came from — see the implementation report
 *     for why that line lookup is duplicated here rather than exported by
 *     markdown.js).
 *
 * Step 4 (the discovery walk) and the explicit-path resolver (leading `/`
 * from the source root, otherwise relative to the declaring file — always
 * the page itself, since frontmatter and `data-layout` both live IN the
 * page) are shared by both document shapes.
 */
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CHECK_SPELLING } from "./diagnostics.js";
import { contains, toRelative } from "./paths.js";
import { findAll, getAttrNode, hasAttr, isElement, lineOf, parse, tokens } from "./html.js";

/** §6.1 step 4 — the automatic layout, discovered by name alone. */
export const LAYOUT_FILENAME = "_layout.html";

const DATA_LAYOUT = "data-layout";
const DATA_UNIFY = "data-unify";
const UNIFY_CLASS_PREFIX = "unify-";

// ------------------------------------------------------------- §6.1 selection

/**
 * Resolve an HTML page's layout selection (§6.1 steps 1-5) and flag any
 * `data-layout` found on a non-root element (§6.3/P07) anywhere in the
 * document — includes already inlined, so a fragment-contributed
 * `data-layout` is caught too (consequence of §5's textual-splice ordering,
 * same convention compose.js's own A04/P16 checks already use: attributed to
 * the host page's post-inlining line, not the fragment's own file).
 *
 * @param {object} args
 * @param {import('./html.js').RootNode} args.root - `html.parse(text).root`
 * @param {string} args.text - the page's own (include-inlined) document text
 * @param {string} args.pageAbsPath
 * @param {string} args.sourceRoot
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{none: true} | {path: string} | {problem: true}}
 */
export function resolveHtmlLayout({ root, text, pageAbsPath, sourceRoot, reporter }) {
  const file = toRelative(sourceRoot, pageAbsPath);
  const { onHtml, onBody, misplaced } = findDataLayoutAttrs(root);
  reportMisplaced(misplaced, { text, file, reporter });

  // "on the page's <html> or <body>" (§6.1): both are legal; the spec does
  // not say which wins when both are set (see the implementation report) —
  // <body> is preferred, matching every fixture and worked example, which
  // write it there exclusively.
  const attr = onBody ?? onHtml;
  if (attr) {
    const value = (attr.value ?? "").trim();
    if (value === "none") return { none: true };
    return resolveExplicitPath(value, {
      declaringDir: dirname(pageAbsPath), sourceRoot, file, line: lineOf(text, attr.start), reporter,
      spelling: (p) => `data-layout="${p}"`,
    });
  }

  const found = walkForLayout(dirname(pageAbsPath), sourceRoot);
  return found ? { path: found } : { none: true };
}

/**
 * Resolve a Markdown page's layout selection (§6.1 steps 1, 3-5; step 2's
 * `data-layout` attribute does not apply — a Markdown source has no tags of
 * its own to carry it, so P07 cannot fire pre-conversion).
 *
 * @param {object} args
 * @param {string|undefined} args.layoutValue - markdown.js `convert()`'s `.layout` (frontmatter's raw `layout` value, or undefined when absent)
 * @param {string} args.mdSource - the page's raw source text (frontmatter included), to locate the `layout:` key's line
 * @param {string} args.pageAbsPath
 * @param {string} args.sourceRoot
 * @param {string} args.file - source-root-relative path, for diagnostics
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{none: true} | {path: string} | {problem: true}}
 */
export function resolveMarkdownLayout({ layoutValue, mdSource, pageAbsPath, sourceRoot, file, reporter }) {
  if (layoutValue !== undefined) {
    const value = String(layoutValue).trim();
    if (value === "none") return { none: true };
    return resolveExplicitPath(value, {
      declaringDir: dirname(pageAbsPath), sourceRoot, file, line: frontmatterKeyLine(mdSource, "layout"), reporter,
    });
  }

  const found = walkForLayout(dirname(pageAbsPath), sourceRoot);
  return found ? { path: found } : { none: true };
}

/**
 * §6.2/P15 — a layout that itself declares `data-layout` (any value,
 * including `"none"`) is a problem, never a silent no-op; layout chaining is
 * not part of v0.7.0. Also flags §6.3/P07 misplacement within the layout's
 * own document, same as a page. Call once per loaded layout file (the
 * caller is expected to cache by absolute path — §14.1's diagnostics must
 * not repeat once per page that merely references the same broken layout).
 *
 * @param {object} args
 * @param {import('./html.js').RootNode} args.root - `html.parse(text).root` of the layout's own (include-inlined) text
 * @param {string} args.text
 * @param {string} args.file - source-root-relative path of the layout
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{broken: boolean}}
 */
export function checkLayoutDocument({ root, text, file, reporter }) {
  const { onHtml, onBody, misplaced } = findDataLayoutAttrs(root);
  reportMisplaced(misplaced, { text, file, reporter });

  const attr = onBody ?? onHtml;
  if (!attr) return { broken: false };
  reporter.problem({
    file,
    line: lineOf(text, attr.start),
    message: "this layout declares data-layout — layout chaining is not supported in v0.7.0",
    fixes: [`make ${file} a complete standalone layout, or delete it so pages use a parent ${LAYOUT_FILENAME}`],
  });
  return { broken: true };
}

// --------------------------------------------------------------- §6.3 / P08

/**
 * §6.3 second bullet / P08: any `data-unify` attribute, and any class token
 * beginning `unify-`, anywhere in ANY source file — excluded files included;
 * only the never-shipped list (§4.3) escapes scanning. Call once per
 * discovered `.html`/`.md` file, independent of whether the build ever loads
 * it as a page, layout, or include (the caller owns that full-tree sweep;
 * §4/§4.1 classification is not this module's scope).
 *
 * @param {object} args
 * @param {string} args.text
 * @param {string} args.file - source-root-relative path
 * @param {import('./diagnostics.js').Reporter} args.reporter
 */
export function checkRetiredVocabulary({ text, file, reporter }) {
  const { root } = parse(text);
  for (const el of findAll(root, (n) => n.type === "element")) {
    if (hasAttr(el, DATA_UNIFY)) {
      reporter.problem({
        file,
        line: lineOf(text, el.start),
        message: "data-unify is the v0.6 spelling",
        fixes: ['write data-layout="/path.html" (or data-layout="none") on <html> or <body>'],
      });
    }
    const classAttr = getAttrNode(el, "class");
    if (classAttr) {
      for (const token of tokens(classAttr.value)) {
        if (!token.startsWith(UNIFY_CLASS_PREFIX)) continue;
        const name = token.slice(UNIFY_CLASS_PREFIX.length);
        reporter.problem({
          file,
          line: lineOf(text, el.start),
          message: `class "${token}" is the v0.6 area vocabulary`,
          fixes: [`mark the region with <slot name="${name}">…</slot> in the layout and slot="${name}" on the page element`],
        });
      }
    }
  }
}

// ------------------------------------------------------------------ helpers

/**
 * Every `data-layout`-carrying element in a parsed document, split into the
 * root ones §6.1 selection reads (`<html>`, `<body>`) and misplaced ones
 * (§6.3/P07 — any other element).
 */
function findDataLayoutAttrs(root) {
  const elements = findAll(root, (n) => n.type === "element" && hasAttr(n, DATA_LAYOUT));
  const htmlEl = elements.find((n) => isElement(n, "html"));
  const bodyEl = elements.find((n) => isElement(n, "body"));
  const rootSet = new Set([htmlEl, bodyEl].filter(Boolean));
  return {
    onHtml: htmlEl ? getAttrNode(htmlEl, DATA_LAYOUT) : null,
    onBody: bodyEl ? getAttrNode(bodyEl, DATA_LAYOUT) : null,
    misplaced: elements.filter((n) => !rootSet.has(n)).map((el) => ({ el, attr: getAttrNode(el, DATA_LAYOUT) })),
  };
}

function reportMisplaced(misplaced, { text, file, reporter }) {
  for (const { el, attr } of misplaced) {
    reporter.problem({
      file,
      line: lineOf(text, attr.start),
      message: `data-layout on <${el.tag}> is never a component import`,
      fixes: [`use <include src="…"> to import a fragment instead of data-layout`],
    });
  }
}

/**
 * §6.1: an explicit layout value other than `none` — P04 (not a `.html`
 * path, checked before any existence check) then P05 (missing or escaping
 * the source root, same shape as include-not-found).
 */
function resolveExplicitPath(value, { declaringDir, sourceRoot, file, line, reporter, spelling = (p) => `layout: ${p}` }) {
  if (!value.endsWith(".html")) {
    // Name the layout this page would actually get, not a fixed literal.
    // Round 8's repair fixed the *kind* (`layout:` vs `data-layout=`); round
    // 18 showed the *path* was still one hardcoded `/_layout.html`, which in
    // any site with a section layout is a real, resolvable, WRONG answer — a
    // sample followed it, both news articles silently lost their section's
    // body class and stylesheet, exit 0. "A rule that shows exactly one
    // literal will have that literal copied" is this project's most repeated
    // finding; it applies to diagnostics too, so the literal has to be right.
    const nearest = walkForLayout(declaringDir, sourceRoot);
    const suggestion = nearest ? `/${toRelative(sourceRoot, nearest)}` : "/_layout.html";
    reporter.problem({
      file,
      line,
      message: `layout is not a path: "${value}"`,
      fixes: [
        `layouts are paths — write ${spelling(suggestion)} (or a relative path ending in .html)`,
        nearest
          ? `or drop the layout selection: this page's nearest layout is ${toRelative(sourceRoot, nearest)}`
          : "or drop the layout selection to use the nearest _layout.html",
      ],
    });
    return { problem: true };
  }

  const resolved = value.startsWith("/") ? resolve(sourceRoot, value.slice(1)) : resolve(declaringDir, value);
  let isFile = false;
  if (contains(sourceRoot, resolved)) {
    try {
      isFile = statSync(resolved).isFile();
    } catch {
      isFile = false;
    }
  }
  if (!isFile) {
    reporter.problem({
      file,
      line,
      message: `layout not found: ${value}`,
      fixes: ["create it, or point layout at an existing .html file", CHECK_SPELLING],
    });
    return { problem: true };
  }
  return { path: resolved };
}

/**
 * §6.1 step 4: walk from `startDir` up to (and including) `sourceRoot`,
 * returning the first `_layout.html` found. "Discovery is by name; the
 * file's excluded status is irrelevant" — no exclude-set check here.
 */
function walkForLayout(startDir, sourceRoot) {
  const root = resolve(sourceRoot);
  let dir = resolve(startDir);
  while (contains(root, dir)) {
    const candidate = resolve(dir, LAYOUT_FILENAME);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not found at this level — keep walking up
    }
    if (dir === root) break;
    dir = dirname(dir);
  }
  return null;
}

/**
 * Locate the 1-based file line of a top-level frontmatter key. Purely for
 * diagnostics: markdown.js already parses the key's VALUE (`convert()`'s
 * `.layout`); this does not re-parse YAML, it only re-finds the fence and
 * scans for a `key:` line at column 0 — `layout` is always a top-level
 * scalar (§10.2), never nested, so no indent-tracking is needed the way
 * markdown.js's own (unexported) frontmatter line-indexer needs for
 * arbitrary nested keys. See the implementation report for why this exists
 * at all instead of markdown.js exposing the line directly.
 */
function frontmatterKeyLine(source, key) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source ?? "");
  if (!m) return undefined;
  const keyLineRe = new RegExp(`^${key}\\s*:`);
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (keyLineRe.test(lines[i])) return 2 + i; // line 1 is the opening `---` fence
  }
  return 2;
}
