/**
 * Markdown conversion — conformance-spec §10.
 *
 * Scope: this module owns Markdown-to-HTML conversion and frontmatter only.
 * It never touches the filesystem except to read the one file it is asked to
 * read (`convertFragment`), never resolves includes (§5 stays in
 * includes.js — a converted page's raw `<include>`/SSI markup survives
 * conversion untouched, for the caller to inline afterwards per §10.1), and
 * never resolves layouts (§6 — the `layout` field below is the frontmatter
 * value, unvalidated, exactly as `data-layout` is the unvalidated attribute
 * value for an HTML page; one validator, owned elsewhere, should judge both).
 *
 * Dependency choice — CommonMark engine: markdown-it, in its `commonmark`
 * preset (`html: true`). Justification, stated deliberately per the brief:
 *   - The preset exists specifically to match the CommonMark spec (it drops
 *     tables/strikethrough/linkify/typographer, none of which v0.7.0 wants —
 *     "CommonMark, no extensions"). Hand-rolling a full CommonMark parser
 *     (unlike the frontmatter grammar below) would mean re-deriving a large,
 *     intricate spec — link reference definitions, lazy continuation, list
 *     tightness, emphasis flanking rules, seven HTML-block start conditions —
 *     with much higher odds of silent divergence than reusing a
 *     conformance-tested engine.
 *   - It is already a project dependency, pure JS, no native bindings —
 *     fits "Bun-native".
 *   - Its block-rule ruler (`ruler.before`) is the documented extension
 *     mechanism, and it is exactly what §10.1's one converter extension
 *     needs: a block rule for `<include` registered with the same `alt`
 *     paragraph-interrupt list `html_block` itself uses, so a line-initial
 *     `<include` behaves exactly like a type-6 tag (interrupts a paragraph,
 *     ends at blank line) without forking or monkey-patching the library.
 *   - Its token tree exposes source line spans (`token.map`) and flat
 *     inline-child arrays with pre-entity-decoded `.content` — which is what
 *     makes exact P11 line attribution and entity-safe heading-text
 *     extraction (§10.3/§10.4) possible without ever re-parsing rendered
 *     HTML for entities, the exact class of bug that got linkedom rejected
 *     elsewhere in this codebase.
 *
 * Dependency choice — frontmatter YAML: js-yaml (already present
 * transitively via gray-matter; promoted to a direct dependency here since
 * this module imports it directly), loaded with `FAILSAFE_SCHEMA`.
 * Justification: §10.2's value-serialization rule is source-text fidelity —
 * "no type coercion ever rewrites a value" (`0.50` must stay `"0.50"`,
 * `2026-01-01` must stay a string, never a Date). js-yaml's *default* schema
 * actively violates this (verified empirically: default-schema `weight: 0.50`
 * parses to the JS number `0.5`, `date: 2026-01-01` parses to a native `Date`
 * object) — using it unconfigured would be a real bug, not a style choice.
 * `FAILSAFE_SCHEMA` disables all of js-yaml's type resolution beyond
 * str/seq/map, so every scalar — plain, quoted, or block — resolves to
 * exactly the string §10.2 wants, verified against every case in the
 * frontmatter-junk-keys fixture. What FAILSAFE_SCHEMA does *not* give me is
 * per-node source position, so P17 location uses a small separate
 * line-indexer (`indexFrontmatterLines`) that scans the raw YAML text for
 * key lines only — deliberately not a general YAML parser, since the value
 * semantics already come from js-yaml and this indexer's only job is "which
 * line is this key on".
 */

import { readFile } from "node:fs/promises";
import MarkdownIt from "markdown-it";
import yaml from "js-yaml";
import { toRelative } from "./paths.js";

// --------------------------------------------------------------- engine

const md = new MarkdownIt("commonmark", { html: true });
const escapeHtml = md.utils.escapeHtml;

/**
 * §10.1's one converter extension: "a line beginning with <include starts an
 * HTML block, exactly as if include were on CommonMark's block-tag (type 6)
 * list", ending at the next blank line. `include` is not a real HTML tag, so
 * it is not on markdown-it's built-in type-6 name list (common/html_blocks);
 * type-7 (the generic-open-tag fallback already in html_block) would match
 * `<include ...>` too, but type-7 cannot interrupt an open paragraph, and the
 * spec is explicit that this construct must (type-6 semantics) — an include
 * following non-blank text with no blank line before it must still end the
 * paragraph and splice as a clean block. Modeled directly on html_block.mjs's
 * own type-6 handling (same state APIs, same end condition), registered with
 * the same `alt` list html_block uses so it participates in the same
 * paragraph-interrupt check.
 */
const INCLUDE_BLOCK_START = /^<\/?include(?=[\s/>]|$)/i;

function includeBlockRule(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (!state.md.options.html) return false;
  if (state.src.charCodeAt(pos) !== 0x3c /* < */) return false;
  if (!INCLUDE_BLOCK_START.test(state.src.slice(pos, max))) return false;
  if (silent) return true; // type-6: can interrupt an open paragraph

  let nextLine = startLine + 1;
  for (; nextLine < endLine; nextLine++) {
    if (state.isEmpty(nextLine)) break;
  }
  state.line = nextLine;

  const token = state.push("html_block", "", 0);
  token.map = [startLine, nextLine];
  token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
  return true;
}

md.block.ruler.before("html_block", "unify_include_block", includeBlockRule, {
  alt: ["paragraph", "reference", "blockquote"],
});

// ------------------------------------------------------- heading ids (§10.4)

/**
 * §10.4's slug algorithm, applied in the stated order: lowercase; each run of
 * whitespace becomes one hyphen; every remaining character that is not a
 * letter, digit, or hyphen is dropped (Unicode letters/digits kept); leading
 * and trailing hyphens trimmed. Order matters: collapsing whitespace to
 * hyphens *before* stripping punctuation is why "C++ & Rust!" keeps two
 * hyphens (the spaces around `&` each become one; `&` itself just vanishes
 * without merging them) — fixture-verified.
 */
export function slugify(text) {
  const withHyphens = text.toLowerCase().replace(/\s+/g, "-");
  const stripped = withHyphens.replace(/[^\p{L}\p{N}-]/gu, "");
  return stripped.replace(/^-+|-+$/g, "");
}

/**
 * Plain text of a heading's inline content, markup stripped (§10.3/§10.4).
 * Walks markdown-it's flat inline-child array rather than re-parsing
 * rendered HTML: `text`/`code_inline` children carry already
 * entity-decoded `.content` (the `entity` inline rule resolves `&amp;` etc.
 * at tokenize time), so this never needs an HTML entity decoder — the exact
 * hazard linkedom was rejected for elsewhere in this codebase. Container
 * markers (`em_open`, `link_open`, raw `html_inline` tags, …) contribute
 * nothing themselves; the text they wrap is a sibling token and is picked up
 * on its own.
 */
function inlinePlainText(children) {
  let out = "";
  for (const child of children ?? []) {
    if (child.type === "text" || child.type === "code_inline") out += child.content;
    else if (child.type === "softbreak" || child.type === "hardbreak") out += " ";
    else if (child.type === "image") out += inlinePlainText(child.children);
  }
  return out;
}

/** `<head[\s>/]` / `</head[\s>/]` — deliberately excludes `<header`. */
const HEAD_TAG_RE = /<\/?head(?=[\s>/]|$)/i;

/**
 * One pass over a parsed token stream (flat — markdown-it represents block
 * nesting as open/close markers in one array, so this also sees headings and
 * html blocks inside blockquotes/lists without extra work):
 *   - assigns every heading without an explicit id one derived from its text
 *     (§10.4), tracking per-call dedup counts (`-2`, `-3`, …) — scoped to
 *     this one conversion, which is the only meaning "within the page" can
 *     have when a Markdown *fragment* is converted in isolation (see
 *     `convertFragment`);
 *   - records the first `<h1>`'s plain text for the §10.3 title fallback;
 *   - locates every literal `<head` element for P11 (§10.5), at the exact
 *     source line — the block token's own `.map` for a line-initial block,
 *     refined to the specific line within a multi-line block if the match
 *     isn't on the block's first line; the parent inline token's line for a
 *     mid-paragraph occurrence (raw inline HTML tokens carry no `.map` of
 *     their own).
 * Mutates heading tokens in place (`attrSet`); returns what it found.
 */
function annotateHeadingsAndFindHeadElements(tokens) {
  const seen = new Map();
  let firstH1;
  const headLines = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "heading_open") {
      const inline = tokens[i + 1];
      const text = inlinePlainText(inline?.children);
      if (!token.attrGet("id")) {
        const base = slugify(text);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        token.attrSet("id", count === 0 ? base : `${base}-${count + 1}`);
      }
      if (token.tag === "h1" && firstH1 === undefined) firstH1 = text;
      continue;
    }

    if (token.type === "html_block" && HEAD_TAG_RE.test(token.content)) {
      const lines = token.content.split("\n");
      const offset = Math.max(0, lines.findIndex((l) => HEAD_TAG_RE.test(l)));
      headLines.push(token.map[0] + offset);
      continue;
    }

    if (token.type === "inline" && token.children) {
      for (const child of token.children) {
        if (child.type === "html_inline" && HEAD_TAG_RE.test(child.content)) {
          headLines.push(token.map[0]);
          break;
        }
      }
    }
  }

  return { firstH1, headLines };
}

/**
 * Convert one Markdown body (frontmatter already removed) to HTML, applying
 * heading ids and raising P11 for any literal `<head>` element. Shared by
 * `convert` (page mode) and `convertFragment` (fragment mode) — the only
 * difference between those two callers is what happens to frontmatter, never
 * how the body converts.
 *
 * @param {string} bodyText
 * @param {number} bodyStartLine - 1-based file line where `bodyText` begins
 * @param {{file: string, reporter: import('./diagnostics.js').Reporter}} ctx
 * @returns {{html: string, firstH1: string|undefined}}
 */
function convertBody(bodyText, bodyStartLine, { file, reporter }) {
  const tokens = md.parse(bodyText, {});
  const { firstH1, headLines } = annotateHeadingsAndFindHeadElements(tokens);

  for (const offset of headLines) {
    reporter.problem({
      file,
      line: bodyStartLine + offset,
      message: "Markdown pages have no <head>; use frontmatter (this element would land in the body)",
    });
  }

  const html = md.renderer.render(tokens, md.options, {});
  return { html, firstH1 };
}

// -------------------------------------------------------- frontmatter (§10.2)

/** The five keys with dedicated behavior (§10.2's table) — never become metas. */
const RESERVED_KEYS = new Set(["title", "layout", "class", "lang", "dir"]);

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split a source file into its frontmatter YAML text (or `null` if the file
 * doesn't open with a `---` fence — "very start of the file", §10.2) and the
 * remaining body, with 1-based file line numbers for each so downstream
 * diagnostics (P11, P17) point at the real file, not an offset into a slice.
 * A fence with no matching close is treated as no frontmatter at all — the
 * leading `---` then simply becomes part of the Markdown body (a thematic
 * break), which is the graceful, un-crashing reading; the spec does not say
 * what an unterminated fence should do.
 */
function splitFrontmatter(source) {
  const m = FRONTMATTER_RE.exec(source);
  if (!m) return { yamlText: null, body: source, bodyStartLine: 1 };
  let newlines = 0;
  for (let i = 0; i < m[0].length; i++) if (m[0].charCodeAt(i) === 10) newlines++;
  return { yamlText: m[1], body: source.slice(m[0].length), bodyStartLine: 1 + newlines };
}

/**
 * §10.5, first hard error: a `---` fence at byte 0 of an **HTML** page. This
 * is the one check in this module that runs on `.html` sources rather than
 * `.md` ones — exported standalone (not folded into `convert`) because an
 * HTML page is never otherwise handed to this module. The caller that
 * dispatches by extension (owned elsewhere) is expected to call this before
 * treating an `.html` source as ordinary markup.
 *
 * @param {string} source
 * @param {{path: string, sourceRoot: string, reporter: import('./diagnostics.js').Reporter}} ctx
 */
export function checkHtmlFrontmatter(source, { path, sourceRoot, reporter }) {
  if (!/^---[ \t]*(?:\r?\n|$)/.test(source)) return;
  reporter.problem({
    file: toRelative(sourceRoot, path),
    line: 1,
    message: "HTML pages have no frontmatter; use <head> (frontmatter here would render as visible text)",
  });
}

/**
 * Index every block-mapping key's line number in raw frontmatter YAML text,
 * as a path (parent keys joined by a space — safe because the key pattern
 * below never captures whitespace as part of a key) → 1-based file line.
 * Deliberately not a YAML parser: it only tracks "key name at this indent,
 * on this line",
 * skipping anything that isn't a `key:` line (list items, comments, scalar
 * continuation lines) — sufficient because it is consulted only to locate a
 * P17 diagnostic, never to derive a value. The key pattern matches greedily
 * up to the *last* colon that is followed by whitespace-or-end-of-line,
 * mirroring YAML's own key/value split (a colon not followed by whitespace,
 * as in `og:image:`, is part of the key, not a separator) — otherwise a
 * flat-spelled compound key would be invisible to this index even though
 * §10.2 makes it byte-identical in meaning to the block-nested spelling.
 */
/**
 * Joins nested frontmatter key paths into a single map key. A NUL can never
 * appear in a YAML key, so it cannot collide with real content. Written as an
 * escape rather than a literal: two literal NUL bytes here previously made
 * this file register as binary, so grep, diff and review tooling silently
 * skipped it.
 */
const KEY_SEP = "\u0000";

function indexFrontmatterLines(yamlText, startLine) {
  const KEY_LINE_RE = /^(\s*)((?:[^\s:]|:(?!\s|$))+):(?:\s|$)/;
  const index = new Map();
  const stack = [];
  const lines = yamlText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = KEY_LINE_RE.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const key = m[2];
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parentPath = stack.length ? stack[stack.length - 1].path : [];
    const path = [...parentPath, key];
    index.set(path.join(KEY_SEP), startLine + i);
    stack.push({ indent, path });
  }
  return index;
}

/** Full path first, then progressively shorter prefixes — a location for any path, even one this index never saw directly (e.g. a list item). */
function lineForPath(path, index) {
  for (let n = path.length; n > 0; n--) {
    const hit = index.get(path.slice(0, n).join(KEY_SEP));
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * Parse frontmatter YAML with source-text-faithful scalars (§10.2's value
 * serialization: no type coercion — booleans/numbers/dates ship as written).
 * Returns a plain object (empty if there is no frontmatter, it parses to
 * something other than a mapping, or it fails to parse as YAML at all).
 *
 * A YAML syntax error has no dedicated problem ID in the closed catalogue
 * (§14.2) — this is a spec gap, reported in the implementation report rather
 * than worked around by inventing a new severity or a silent fallback. P17
 * ("a frontmatter value with no text form") is the closest existing fit —
 * unparsable YAML has no text form either — so that is what this reports;
 * never an uncaught exception (this build never crashes on bad author input,
 * per the diagnostic contract's blocks-publish-not-the-process design).
 */
function parseFrontmatterYaml(yamlText, { file, reporter }) {
  if (yamlText === null) return {};
  let parsed;
  try {
    parsed = yaml.load(yamlText, { schema: yaml.FAILSAFE_SCHEMA });
  } catch (err) {
    // js-yaml carries the real position on the thrown error. `mark.line` is
    // 0-based and relative to the frontmatter body, which starts on the line
    // after the opening `---` — so the file line is mark.line + 2. Reporting a
    // fixed line 2 pointed every parse failure at the first key regardless of
    // where the syntax actually broke.
    const markLine = err?.mark?.line;
    const reason = String(err?.reason ?? "").trim();
    reporter.problem({
      file,
      // The parser's position is where it *discovered* the fault, which for an
      // unterminated construct is the line after the one that opened it. That
      // is standard compiler behaviour and the only position actually known —
      // recovering the opening line would require parsing YAML ourselves — so
      // the parser's own reason is carried along to name the construct.
      line: Number.isInteger(markLine) ? markLine + 2 : 2,
      message: reason ? `frontmatter is not valid YAML: ${reason}` : "frontmatter is not valid YAML",
      // The parser's own reason names a construct the author never wrote
      // ("incomplete explicit mapping pair"), so the fix has to name the
      // cause instead. A colon in an unquoted value is the one that actually
      // happens: two of five ratification samples broke a build with
      // `title: Something: with a colon` in round 7, and four of six in round
      // 18 said this line did not tell them that — the three with no docs at
      // all got there only by knowing YAML.
      fixes: [
        'quote any value containing a colon — title: "Pruning: a short guide"',
        "otherwise check indentation, and that every [ and { is closed",
      ],
    });
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed;
}

/**
 * §10.2's value-serialization + og:/other-key/list rules, walked recursively
 * from each non-reserved top-level key. Returns an ordered `{key, value}[]`
 * (frontmatter source order, list items in list order) and raises P17 via
 * `ctx.reporter` for anything with no text form.
 *
 * The one-level flattening budget is tracked by whether the *effective key
 * built so far* already contains a colon — not by recursion depth — because
 * §10.2 states the flat and block spellings are "identical in every
 * respect": `og:image:` (a single top-level key, one colon already in its
 * name) with a nested block under it must be exactly as much a P17 as
 * `og:` → `image:` → a nested block is, even though the flat form only ever
 * reaches recursion depth 1. Depth-counting alone (what an earlier version
 * of this function did) would let the flat spelling flatten one level
 * further than its block-spelled equivalent — spelling would then change
 * behavior, contradicting the spec's own stated invariant.
 */
function collectMetas(data, ctx) {
  const metas = [];
  const lineIndex = indexFrontmatterLines(ctx.yamlText, 2);
  for (const key of Object.keys(data)) {
    if (RESERVED_KEYS.has(key)) continue;
    collectKey(key, data[key], [key], metas, { ...ctx, lineIndex });
  }
  return metas;
}

function collectKey(effectiveKey, value, path, metas, ctx) {
  if (value === null) {
    metas.push({ key: effectiveKey, value: "" });
    return;
  }
  if (typeof value === "string") {
    metas.push({ key: effectiveKey, value });
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item === null) metas.push({ key: effectiveKey, value: "" });
      else if (typeof item === "string") metas.push({ key: effectiveKey, value: item });
      else reportNoTextForm(effectiveKey, [...path, i], "a list item that is itself a mapping or list", ctx);
    }
    return;
  }
  // A plain object: one level of block nesting is sugar for prefixed keys —
  // but only if this key hasn't already used that one level (flat spelling).
  if (!effectiveKey.includes(":")) {
    for (const subKey of Object.keys(value)) {
      collectKey(`${effectiveKey}:${subKey}`, value[subKey], [...path, subKey], metas, ctx);
    }
    return;
  }
  reportNoTextForm(effectiveKey, path, "a nested block", ctx);
}

function reportNoTextForm(effectiveKey, path, shape, { file, reporter, lineIndex }) {
  reporter.problem({
    file,
    line: lineForPath(path, lineIndex),
    message: `frontmatter ${effectiveKey} is ${shape} — frontmatter flattens one level`,
    fixes: [`give ${effectiveKey} a single value (${effectiveKey}: /assets/a.jpg) or a list of values`],
  });
}

// ------------------------------------------------------------ serialization

/**
 * §10.2's fixed serialization: double-quoted attributes, name/property
 * before content, `<title>TEXT</title>`. Text and attribute values are
 * HTML-escaped (via markdown-it's own `escapeHtml`, the same function it
 * uses for every other attribute/text it renders) — necessary for validity
 * (a `&` or `"` in a description would otherwise break the tag) and not
 * optional even though no given fixture's values need it.
 */
function titleElement(text) {
  return `<title>${escapeHtml(text)}</title>`;
}

function metaElement(key, value) {
  const attr = key.startsWith("og:") ? "property" : "name";
  return `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(value)}">`;
}

// ----------------------------------------------------------------- exports

/**
 * Convert a Markdown **page**: parse frontmatter (§10.2, raising P17 for
 * values with no text form), convert the body (§10.1, applying heading ids
 * per §10.4 and raising P11 for a literal `<head>`), and resolve the title
 * per §10.3's fallback. Synchronous — the caller already has the source
 * text; this module does no I/O of its own for page conversion.
 *
 * Return shape (the seam with head-merge/compose, §10.2's closing sentence:
 * synthesized elements "merge by §8 exactly as if the page had written
 * them"):
 *   - `html` — the converted body. Raw `<include>`/SSI markup inside it is
 *     untouched, verbatim, unresolved — §10.1: includes resolve *after*
 *     conversion, which is a step this module never performs.
 *   - `headHtml` — zero or more `<title>…</title>`/`<meta …>` elements,
 *     title first when present then metas in frontmatter source order, each
 *     serialized exactly as §10.2 fixes. Text, not a DOM — the caller merges
 *     it via §8 exactly as it would the literal `<head>` of an HTML page.
 *   - `bodyClass` — the frontmatter `class` value verbatim (§9 material for
 *     the page's `<body>`), or `undefined` if absent. Not HTML-escaped: this
 *     is data, escaped by whoever serializes it into markup.
 *   - `htmlAttrs` — `{lang?, dir?}`, only the keys frontmatter set. Same
 *     "data, not markup" contract as `bodyClass`.
 *   - `layout` — the frontmatter `layout` value, unvalidated and passed
 *     through exactly as written (usually a string; whatever shape the
 *     author wrote otherwise, since this module does not own §6.1's
 *     validation). `undefined` when the key is absent. This field is not in
 *     the shape the brief sketched — added because without it the caller
 *     has no way to learn a Markdown page's layout selection at all; see the
 *     implementation report.
 *
 * @param {string} source
 * @param {{path: string, sourceRoot: string, reporter: import('./diagnostics.js').Reporter}} options
 */
export function convert(source, { path, sourceRoot, reporter }) {
  const file = toRelative(sourceRoot, path);
  const { yamlText, body, bodyStartLine } = splitFrontmatter(source);
  const data = parseFrontmatterYaml(yamlText, { file, reporter });
  const metas = yamlText === null ? [] : collectMetas(data, { file, reporter, yamlText });
  const { html, firstH1 } = convertBody(body, bodyStartLine, { file, reporter });

  const frontmatterTitle = typeof data.title === "string" && data.title.trim() !== "" ? data.title : undefined;
  const title = frontmatterTitle ?? firstH1;

  const headParts = [];
  if (title !== undefined) headParts.push(titleElement(title));
  for (const { key, value } of metas) headParts.push(metaElement(key, value));

  const htmlAttrs = {};
  if (typeof data.lang === "string") htmlAttrs.lang = data.lang;
  if (typeof data.dir === "string") htmlAttrs.dir = data.dir;

  return {
    html,
    headHtml: headParts.join("\n"),
    bodyClass: typeof data.class === "string" ? data.class : undefined,
    htmlAttrs,
    layout: data.layout,
  };
}

/**
 * Convert a Markdown **fragment** (an include target, §5.1 step 4 / §10.1):
 * "frontmatter stripped and ignored" — stripped so it never leaks into the
 * spliced output as visible text, ignored so thoroughly that it is not even
 * parsed as YAML or checked for P17, since a shared fragment's frontmatter
 * has no reader and validating-yet-discarding it would make an unrelated
 * page's build depend on the shape of data nobody uses. (This "don't even
 * parse it" reading is this module's own interpretation of "ignored" — the
 * spec does not say so explicitly either way; see the implementation
 * report.) The body still gets heading ids (§10.4, explicitly required by
 * §5.1 step 4) and is still checked for a literal `<head>` (P11 — §10.1
 * carves out no fragment exception for that hard error).
 *
 * Matches the `(path: string) => Promise<string>` shape includes.js expects
 * for the `convertMarkdown` callback it takes (§5.1 step 4), modulo the
 * extra options argument — the integrator wires
 * `convertMarkdown: (p) => convertFragment(p, { sourceRoot, reporter })`.
 *
 * @param {string} path - absolute path
 * @param {{sourceRoot: string, reporter: import('./diagnostics.js').Reporter}} options
 * @returns {Promise<string>}
 */
export async function convertFragment(path, { sourceRoot, reporter }) {
  const source = await readFile(path, "utf8");
  const file = toRelative(sourceRoot, path);
  const { body, bodyStartLine } = splitFrontmatter(source);
  const { html } = convertBody(body, bodyStartLine, { file, reporter });
  return html;
}
