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
 * from the namespace root, otherwise relative to the declaring file — always
 * the page itself, since frontmatter and `data-layout` both live IN the
 * page) are shared by both document shapes.
 *
 * THE NAMESPACE (§33.3): both climb VIRTUAL paths, not absolute directories,
 * and ask `paths.js` which root holds each candidate — the source tree first,
 * the `--generate` overlay second. A generated `docs/page.md` therefore walks
 * `docs/` and then the root exactly as a hand-written one does. Before that,
 * the walk started at the page's absolute directory inside the overlay,
 * left the source root's containment check immediately, and returned "no
 * layout" — every generated page published bare, with no diagnostic, exit 0
 * (issue #54). `roots` defaults to the source root alone, which is exactly
 * the namespace of a build without `--generate`.
 *
 * DIAGNOSTIC LOCATION (§14.1): `resolveHtmlLayout` and `checkLayoutDocument`
 * are handed an INCLUDE-INLINED document, so an offset in `text` is not a
 * position in `file` — every line a fragment spliced in above a fault shifts
 * it, routinely past the end of the file the message names (a `data-layout`
 * on line 6 of an 8-line page, under a 5-line nav fragment, printed as line
 * 11). Both therefore take the `spans` that inlining produced plus an injected
 * `resolveLine`, and locate through `spansToDiagnosticLocator` — identically
 * to compose.js's §7 diagnostics and head-merge.js's §8 advisory, through the
 * same urls.js helper, so the three stages can never drift apart. Both
 * arguments are optional: with neither, `text` IS `file`'s raw source and
 * `lineOf` on it is exact, which is what every unit test passes.
 *
 * `checkRetiredVocabulary` (§6.3/P08) is the exception that needs none of
 * this: its caller sweeps every `.html`/`.md` source file in its own right, on
 * RAW text, so a `unify-` class in a fragment is already found and located in
 * that fragment — provenance-exact by construction rather than by span
 * arithmetic.
 */
import { posix } from "node:path";
import { CHECK_SPELLING } from "./diagnostics.js";
import { locateExisting, nameOf, resolutionRoots, virtualOf, virtualResolve } from "./paths.js";
import { findAll, getAttrNode, hasAttr, isElement, lineOf, parse, tokens } from "./html.js";
import { spansToDiagnosticLocator, verbatimLineResolver, wholeTextSpan } from "./urls.js";

/** §6.1 step 4 — the automatic layout, discovered by name alone. */
const LAYOUT_FILENAME = "_layout.html";

const DATA_LAYOUT = "data-layout";
const DATA_UNIFY = "data-unify";
const DATA_SLOT = "data-slot";
const UNIFY_CLASS_PREFIX = "unify-";

// ------------------------------------------------------------- §6.1 selection

/**
 * Resolve an HTML page's layout selection (§6.1 steps 1-5) and flag any
 * `data-layout` found on a non-root element (§6.3/P07) anywhere in the
 * document — includes already inlined, so a fragment-contributed
 * `data-layout` is caught too (a consequence of §5's textual-splice ordering,
 * not a separate rule).
 *
 * Such a fault is reported IN THE FRAGMENT, at its own line there, exactly as
 * compose.js's P16/P20 and §12's reference check already do: the host's
 * post-inlining line is a position no source file has, and one stray
 * `data-layout` in a fragment included by three pages is one authored fault
 * with one place to fix it, not three. (An earlier version of this comment
 * documented the opposite convention; the engine had never actually been able
 * to honor it, since the shifted line it printed was not the host's real line
 * either.) The RESOLUTION base is untouched by any of this — §6.1 resolves a
 * relative layout path against the declaring page's directory, which stays
 * `pageAbsPath`'s, because that is where §5 says the declaration textually is.
 *
 * @param {object} args
 * @param {import('./html.js').RootNode} args.root - `html.parse(text).root`
 * @param {string} args.text - the page's own (include-inlined) document text
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} [args.spans] -
 *   `text`'s provenance, from `includes.inlineIncludes`; defaults to
 *   attributing all of `text` to the page, exact when it inlined nothing
 * @param {(file: string, fileOffset: number) => number|undefined} [args.resolveLine] -
 *   see this module's DIAGNOSTIC LOCATION note
 * @param {string} args.pageAbsPath
 * @param {string} args.sourceRoot
 * @param {string[]} [args.roots] - the §33.3 namespace (`paths.js`'s `resolutionRoots`)
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{none: true} | {path: string} | {problem: true}}
 */
export function resolveHtmlLayout({ root, text, spans, resolveLine, pageAbsPath, sourceRoot, roots = resolutionRoots(sourceRoot), reporter }) {
  const file = nameOf(roots, pageAbsPath);
  const at = documentLocator({ file, text, spans, resolveLine });
  const { onHtml, onBody, misplaced } = findDataLayoutAttrs(root);
  reportMisplaced(misplaced, { at, reporter });

  // "on the page's <html> or <body>" (§6.1): both are legal; the spec does
  // not say which wins when both are set (see the implementation report) —
  // <body> is preferred, matching every fixture and worked example, which
  // write it there exclusively.
  const attr = onBody ?? onHtml;
  if (attr) {
    const value = (attr.value ?? "").trim();
    if (value === "none") return { none: true };
    return resolveExplicitPath(value, {
      declaringFile: pageAbsPath, roots, at: at(attr.start), reporter,
      spelling: (p) => `data-layout="${p}"`,
    });
  }

  const found = walkForLayout(pageAbsPath, roots);
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
 * @param {string[]} [args.roots] - the §33.3 namespace (`paths.js`'s `resolutionRoots`)
 * @param {string} args.file - the page's virtual path, for diagnostics
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{none: true} | {path: string} | {problem: true}}
 */
export function resolveMarkdownLayout({ layoutValue, mdSource, pageAbsPath, sourceRoot, roots = resolutionRoots(sourceRoot), file, reporter }) {
  if (layoutValue !== undefined) {
    const value = String(layoutValue).trim();
    if (value === "none") return { none: true };
    // No spans/locator here: `mdSource` is the page's RAW source and
    // frontmatter precedes both conversion and include inlining (§10.1), so
    // the key's line is already a true line in `file` — the one place in this
    // module where the naive measurement is the correct one.
    return resolveExplicitPath(value, {
      declaringFile: pageAbsPath, roots, reporter,
      at: { file, line: frontmatterKeyLine(mdSource, "layout") },
    });
  }

  const found = walkForLayout(pageAbsPath, roots);
  return found ? { path: found } : { none: true };
}

/**
 * §6.2/P15 — a layout that itself declares `data-layout` (any value,
 * including `"none"`) is a problem, never a silent no-op; layout chaining is
 * not supported. Also flags §6.3/P07 misplacement within the layout's
 * own document, same as a page. Call once per loaded layout file (the
 * caller is expected to cache by absolute path — §14.1's diagnostics must
 * not repeat once per page that merely references the same broken layout).
 *
 * @param {object} args
 * @param {import('./html.js').RootNode} args.root - `html.parse(text).root` of the layout's own (include-inlined) text
 * @param {string} args.text
 * @param {{start:number,end:number,file:string,fileOffset:number}[]} [args.spans] - `text`'s provenance; see `resolveHtmlLayout`
 * @param {(file: string, fileOffset: number) => number|undefined} [args.resolveLine] - see this module's DIAGNOSTIC LOCATION note
 * @param {string} args.file - source-root-relative path of the layout
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {{broken: boolean}}
 */
export function checkLayoutDocument({ root, text, spans, resolveLine, file, reporter }) {
  const at = documentLocator({ file, text, spans, resolveLine });
  const { onHtml, onBody, misplaced } = findDataLayoutAttrs(root);
  reportMisplaced(misplaced, { at, reporter });

  const attr = onBody ?? onHtml;
  if (!attr) return { broken: false };
  reporter.problem({
    // Located wherever the declaration was written; the FIX still names the
    // layout, which is the file whose ROLE is wrong (compose.js's A13
    // messages keep `layoutFile` for the same reason — "which layout is this"
    // stays the useful fact even when a fragment contributed the markup).
    ...at(attr.start),
    message: "this layout declares data-layout — layout chaining is not supported",
    fixes: [`make ${file} a complete standalone layout, or delete it so pages use a parent ${LAYOUT_FILENAME}`],
  });
  return { broken: true };
}

// --------------------------------------------------------------- §6.3 / P08

/**
 * §6.3 second bullet / P08: any `data-unify` attribute, any `data-slot`
 * attribute, and any class token beginning `unify-`, anywhere in ANY source file — excluded files included;
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
/** Opening or closing `<pre>`/`<code>` tag, textually (see `inertRanges`). */
const PROTECT_TAG = /<(\/?)(pre|code)\b[^>]*>/gi;
/** A fenced block's opening or closing line: up to three spaces, then ``` or ~~~. */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;
/** A run of backticks delimiting an inline code span. */
const BACKTICK_RUN = /`+/g;

/**
 * §6.3 — the regions of a source file where a retired spelling is CONTENT
 * rather than markup, and P08 must stay silent.
 *
 * This is #56's rule (`inertRanges` in includes.js) applied to the one check
 * that never got it. A page DOCUMENTING unify has to be able to show the
 * vocabulary it is telling you not to use, and until this existed it could
 * not: unify's own documentation site went red the day `conformance-spec.md`
 * gained a sentence about `data-slot`, because P08 parses raw source as HTML
 * and a well-formed sample is indistinguishable from authored markup to a
 * parser that was never told the difference (issue #71).
 *
 * TWO VOCABULARIES, because P08 runs on raw text and a `.md` file has not
 * been converted yet. In HTML, code is `<pre>`/`<code>` — the same textual
 * depth count includes.js uses, so the two checks agree about what a code
 * sample is. In Markdown it is the three forms the language actually has,
 * and all three had to be covered because all three were measured failing:
 * fenced blocks, indented blocks, and inline spans. HTML's rule applies to
 * Markdown too, since a `.md` file may contain raw HTML.
 *
 * The Markdown rules are deliberately the CommonMark ones rather than
 * something looser, because every byte marked inert is a byte P08 stops
 * protecting. An indented run only counts when a blank line precedes it —
 * CommonMark forbids an indented code block from interrupting a paragraph —
 * so a continuation line that merely happens to be indented is still markup,
 * and a `data-unify` sitting in it is still reported.
 *
 * @param {string} text
 * @param {string} file - source-root-relative path; only its extension is read
 * @returns {[number, number][]} sorted, non-overlapping [start, end) ranges
 */
export function inertRanges(text, file) {
  /** @type {[number, number][]} */
  const ranges = [];

  // ---- HTML `<pre>`/`<code>`, one nesting depth across both names.
  let depth = 0;
  let open = 0;
  for (const m of text.matchAll(PROTECT_TAG)) {
    if (m[0].endsWith("/>")) continue;
    if (m[1] === "") {
      if (depth === 0) open = m.index;
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) ranges.push([open, m.index + m[0].length]);
    }
  }
  if (depth > 0) ranges.push([open, text.length]);

  if (posix.extname(file).toLowerCase() === ".md") {
    // ---- Fenced and indented blocks, line by line. One pass, because a
    // fence suspends every other rule until it closes — an indented line
    // inside a fence is fence content, not a second code block.
    let at = 0;
    let fence = null; // the opening run, while one is open
    let indentStart = null; // start offset of an indented run
    let blankBefore = true; // an indented block may not interrupt a paragraph
    for (const line of text.split("\n")) {
      const lineEnd = at + line.length;
      const fenceHit = FENCE_LINE.exec(line);
      if (fence !== null) {
        // Only a run of the SAME character and at least the opener's length closes it.
        if (fenceHit && fenceHit[1][0] === fence.char && fenceHit[1].length >= fence.len) {
          ranges.push([fence.start, lineEnd]);
          fence = null;
        }
      } else if (fenceHit) {
        if (indentStart !== null) { ranges.push([indentStart, at - 1]); indentStart = null; }
        fence = { start: at, char: fenceHit[1][0], len: fenceHit[1].length };
      } else if (/^(\t| {4})/.test(line) && (blankBefore || indentStart !== null)) {
        if (indentStart === null) indentStart = at;
      } else if (line.trim() !== "" && indentStart !== null) {
        ranges.push([indentStart, at - 1]);
        indentStart = null;
      }
      if (fence === null && indentStart === null) blankBefore = line.trim() === "";
      at = lineEnd + 1;
    }
    if (fence !== null) ranges.push([fence.start, text.length]);
    if (indentStart !== null) ranges.push([indentStart, text.length]);

    // ---- Inline spans: a backtick run closes on a run of EQUAL length, which
    // is what lets ``` `` ` `` ``` show a backtick. Runs already inside a
    // block range are skipped so a fence's own ``` never opens a span.
    const blocks = [...ranges];
    const inBlock = (i) => blocks.some(([s, e]) => i >= s && i < e);
    /** @type {{index:number,len:number}[]} */
    const runs = [];
    for (const m of text.matchAll(BACKTICK_RUN)) {
      if (!inBlock(m.index)) runs.push({ index: m.index, len: m[0].length });
    }
    for (let i = 0; i < runs.length; i += 1) {
      const j = runs.findIndex((r, k) => k > i && r.len === runs[i].len);
      if (j === -1) continue;
      ranges.push([runs[i].index, runs[j].index + runs[j].len]);
      i = j;
    }
  }

  // ---- Merge, so the membership test below is a simple scan.
  ranges.sort((a, b) => a[0] - b[0]);
  /** @type {[number, number][]} */
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

export function checkRetiredVocabulary({ text, file, reporter }) {
  const { root } = parse(text);
  const inert = inertRanges(text, file);
  const isInert = (offset) => inert.some(([s, e]) => offset >= s && offset < e);
  for (const el of findAll(root, (n) => n.type === "element")) {
    // A sample is not a declaration (§6.3, issue #71).
    if (isInert(el.start)) continue;
    if (hasAttr(el, DATA_UNIFY)) {
      reporter.problem({
        file,
        line: lineOf(text, el.start),
        message: "data-unify is a retired spelling",
        fixes: ['write data-layout="/path.html" (or data-layout="none") on <html> or <body>'],
      });
    }
    if (hasAttr(el, DATA_SLOT)) {
      reporter.problem({
        file,
        line: lineOf(text, el.start),
        message: "data-slot is a retired spelling",
        fixes: ['write slot="name" on the page element and <slot name="name">…</slot> in the layout'],
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
          message: `class "${token}" is retired area vocabulary`,
          fixes: [`mark the region with <slot name="${name}">…</slot> in the layout and slot="${name}" on the page element`],
        });
      }
    }
  }
}

// ------------------------------------------------------------------ helpers

/**
 * `(offset) => {file, line}` for an offset in the include-inlined `text` —
 * §14.1's pair, both halves from one span (see the DIAGNOSTIC LOCATION note).
 * Absent `spans`, `text` is `file`'s own raw source; absent `resolveLine`,
 * `verbatimLineResolver` answers for exactly that case and declines (line
 * omitted, never guessed) for anything else.
 */
function documentLocator({ file, text, spans, resolveLine }) {
  const s = spans ?? wholeTextSpan(text, file);
  return spansToDiagnosticLocator(s, file, resolveLine ?? verbatimLineResolver([{ file, text, spans: s }]));
}

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

function reportMisplaced(misplaced, { at, reporter }) {
  for (const { el, attr } of misplaced) {
    reporter.problem({
      ...at(attr.start),
      message: `data-layout on <${el.tag}> is never a component import`,
      fixes: [`use <include src="…"> to import a fragment instead of data-layout`],
    });
  }
}

/**
 * §6.1: an explicit layout value other than `none` — P04 (not a `.html`
 * path, checked before any existence check) then P05 (missing or escaping
 * the source root, same shape as include-not-found). `at` is the already-
 * resolved `{file, line}` of the declaration itself (§14.1), not the page's
 * path: for HTML the two differ whenever a fragment contributed the tag
 * carrying `data-layout`.
 */
function resolveExplicitPath(value, { declaringFile, roots, at, reporter, spelling = (p) => `layout: ${p}` }) {
  if (!value.endsWith(".html")) {
    // Name the layout this page would actually get, not a fixed literal.
    // Round 8's repair fixed the *kind* (`layout:` vs `data-layout=`); round
    // 18 showed the *path* was still one hardcoded `/_layout.html`, which in
    // any site with a section layout is a real, resolvable, WRONG answer — a
    // sample followed it, both news articles silently lost their section's
    // body class and stylesheet, exit 0. "A rule that shows exactly one
    // literal will have that literal copied" is this project's most repeated
    // finding; it applies to diagnostics too, so the literal has to be right.
    const nearest = walkForLayout(declaringFile, roots);
    const suggestion = nearest ? `/${nameOf(roots, nearest)}` : "/_layout.html";
    reporter.problem({
      ...at,
      message: `layout is not a path: "${value}"`,
      fixes: [
        `layouts are paths — write ${spelling(suggestion)} (or a relative path ending in .html)`,
        nearest
          ? `or drop the layout selection: this page's nearest layout is ${nameOf(roots, nearest)}`
          : "or drop the layout selection to use the nearest _layout.html",
      ],
    });
    return { problem: true };
  }

  // §33.3 — the same namespace `<include src>` resolves in: a `/`-rooted value
  // names a virtual path, a relative one is measured from the declaring page's
  // virtual directory, and either may be satisfied by the source tree or by
  // the overlay (source first). `layout: /_layout.html` on a generated page
  // therefore still means the source root's layout, exactly as before — that
  // spelling was the workaround for issue #54 and it must not change meaning.
  const virtual = virtualResolve(roots, declaringFile, value);
  const resolved = virtual === null ? null : locateExisting(roots, virtual);
  if (resolved === null) {
    reporter.problem({
      ...at,
      message: `layout not found: ${value}`,
      fixes: ["create it, or point layout at an existing .html file", CHECK_SPELLING],
    });
    return { problem: true };
  }
  return { path: resolved };
}

/**
 * §6.1 step 4: walk from the declaring file's own directory up to (and
 * including) the namespace root, returning the first `_layout.html` found.
 * "Discovery is by name; the file's excluded status is irrelevant" — no
 * exclude-set check here.
 *
 * §33.3 — the walk climbs VIRTUAL directories and asks every root at each
 * level, so `docs/api.md` looks for `docs/_layout.html` then `_layout.html`
 * whichever tree wrote it, and a generated page discovers the source root's
 * layout exactly as a hand-written sibling does. Per level the source tree
 * wins over the overlay (`locateExisting`); nearest still beats both, because
 * the namespace is merged one directory at a time rather than one tree at a
 * time — a `docs/_layout.html` written by a generator is nearer to
 * `docs/api.md` than the source root's, and is the one it gets.
 *
 * @param {string} declaringFile - absolute path of the page (or layout)
 * @param {string[]} roots - the namespace, from `resolutionRoots`
 * @returns {string|null} absolute path of the layout, or null
 */
function walkForLayout(declaringFile, roots) {
  const from = virtualOf(roots, declaringFile);
  if (from === null) return null;
  let dir = posix.dirname(from);
  if (dir === ".") dir = "";
  for (;;) {
    const found = locateExisting(roots, dir === "" ? LAYOUT_FILENAME : `${dir}/${LAYOUT_FILENAME}`);
    if (found) return found;
    if (dir === "") return null;
    const parent = posix.dirname(dir);
    dir = parent === "." ? "" : parent;
  }
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
