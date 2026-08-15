/**
 * Include inlining — conformance-spec §5.
 *
 * Textual, before any parsing: an include's target replaces the element's span,
 * so a fragment's top-level elements simply become the host's. That ordering is
 * why a fragment may carry `slot=` fills or contribute `<slot>` elements without
 * either being a special rule.
 *
 * Path resolution is harvested from the v0.6 SSI processor, which the audit found
 * was the only correct implementation of §5.1 in the old codebase: `file=` against
 * the including file's directory, `virtual=` against the source root.
 *
 * PROVENANCE (§1, §11.1, §14.1 R3): `inlineIncludes` returns `{text, spans}`,
 * not a bare string. `spans` is a sorted, contiguous, non-overlapping
 * `{start, end, file, fileOffset}[]` covering the whole of `text`: for any
 * output offset `o` with `start <= o < end`, the byte at `o` was authored by
 * `file` (source-root-relative), and it sat at offset `fileOffset + (o -
 * start)` in `file`'s OWN raw source text — that second fact is what lets a
 * caller recover a real line number (`lineOf(rawTextOfFile, fileOffset)`),
 * not just a filename, which §14.1 R3's exact `:2` line attribution needs.
 * Every byte of `text` is covered by exactly one span, including a spliced
 * include's own contents (recursively, so a page -> layout -> include chain
 * attributes correctly at every level) and — as a zero-length span, so the
 * file's identity is still recorded even though nothing can ever "be inside"
 * it — a completely empty include target. This is the fix threaded through
 * `compose.js` and `src/cli/commands/build.js` to close the provenance gap
 * `urls.js`/`references.js` were built to consume (their own doc comments;
 * see this task's report for the full chain).
 */

import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { CHECK_SPELLING, formatChain } from "./diagnostics.js";
import { contains, toRelative } from "./paths.js";

/** Inclusive: ten include files may be on the stack; the eleventh is the problem. */
const MAX_DEPTH = 10;

/** `<include src="…">` — paired or void — captured with its full span. */
const INCLUDE_TAG = /<include\b([^>]*)>(?:([\s\S]*?)<\/include\s*>)?/gi;
/** Apache SSI, supported indefinitely as the legacy alias (§3.1). */
const SSI_TAG = /<!--#include\s+(virtual|file)\s*=\s*"([^"]*)"\s*-->/gi;

/**
 * @param {string} attrs - raw attribute text of an <include> start tag
 * @returns {string|null}
 */
function srcOf(attrs) {
  const m = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return m ? (m[1] ?? m[2]) : null;
}

/**
 * Resolve an include target to an absolute path (§5.1 steps 1–2).
 *
 * @param {object} args
 * @param {string} args.spec - the path as written
 * @param {'src'|'virtual'|'file'} args.form
 * @param {string} args.fromFile - absolute path of the including file
 * @param {string} args.sourceRoot
 * @returns {{path: string}|{escapes: true}}
 */
function resolveTarget({ spec, form, fromFile, sourceRoot }) {
  let resolved;
  if (form === "virtual") {
    resolved = resolve(sourceRoot, spec.replace(/^\//, ""));
  } else if (form === "file") {
    // `file=` is filesystem-relative by SSI's definition and cannot be absolute.
    if (spec.startsWith("/")) return { escapes: true };
    resolved = resolve(dirname(fromFile), spec);
  } else {
    resolved = spec.startsWith("/")
      ? resolve(sourceRoot, spec.slice(1))
      : resolve(dirname(fromFile), spec);
  }
  // Traversal safety is internal and always on — an escaping path is simply not
  // a path the build will read, reported with the same shape as not-found.
  if (!contains(sourceRoot, resolved)) return { escapes: true };
  return { path: resolved };
}

/**
 * Inline every include in `text`, recursively.
 *
 * @param {object} args
 * @param {string} args.text
 * @param {string} args.file - absolute path of the file `text` came from
 * @param {string} args.sourceRoot
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @param {(path: string) => Promise<string>} args.convertMarkdown - §5.1 step 4
 * @param {string[]} [args.stack] - resolved paths currently being expanded;
 *   element 0 is the originating page, so the include count is `length - 1`
 * @param {{file: string, line: number}} [args.origin] - the outermost include
 *   site: where expansion entered this chain. §14.1 fixes cycle and depth
 *   diagnostics to that site, not the innermost frame, so the author is
 *   pointed at the include they wrote rather than at a file they may never
 *   have opened.
 * @returns {Promise<{text: string, spans: {start:number,end:number,file:string,fileOffset:number}[]}>}
 */
export async function inlineIncludes({
  text,
  file,
  sourceRoot,
  reporter,
  convertMarkdown,
  stack = [file],
  origin = null,
  linesAreSource = true,
}) {
  const relFile = toRelative(sourceRoot, file);
  /** @type {{index:number,length:number,text:string,spans:{start:number,end:number,file:string,fileOffset:number}[]}[]} */
  const edits = [];

  for (const { match, spec, form, index, content } of findIncludes(text)) {
    // §14.1/DIA-13: a line that cannot be mapped to the named file is
    // omitted, not guessed. For a `.md` host `text` is markdown.js's
    // CONVERTED HTML (§10.1 converts before inlining), so counting newlines
    // in it numbers a document the author never wrote — an <include> on line
    // 11 of an 11-line post.md was reported at line 4, a blank line. The file
    // is right either way; only the line is unknowable, so it is left out.
    const at = linesAreSource
      ? { file: relFile, line: lineOf(text, index) }
      : { file: relFile };
    // §14.1/DIA-11: cycle and depth problems locate at the OUTERMOST include
    // site — the one the author wrote — not at the recursion frame that
    // happened to notice. `origin` is null at the top level, where `at` is
    // already that site.
    const chainAt = origin ?? at;

    if (spec === null) {
      reporter.problem({ ...at, message: "<include> without src", context: match.trim() });
      continue;
    }
    if (content !== undefined && content.trim() !== "") {
      reporter.problem({
        ...at,
        message: "<include> takes no content — the file's contents replace the element",
        context: match.trim().slice(0, 120),
        fixes: [
          "includes are not components; put page content in the page, or generate variants with a script (_scripts/)",
        ],
      });
      continue;
    }
    if (form === "src" && content === undefined) {
      reporter.advisory({
        ...at,
        message: "void <include> — builds identically, but previews wrong in a browser",
        fixes: ["close the tag: <include src=\"…\"></include>"],
      });
    }

    const target = resolveTarget({ spec, form, fromFile: file, sourceRoot });
    if ("escapes" in target || !isPage(target.path)) {
      reporter.problem({
        ...at,
        message: `include not found: ${spec}`,
        context: match.trim().slice(0, 120),
        fixes: [`create it, or point src at an existing .html or .md file`, CHECK_SPELLING],
      });
      continue;
    }

    const chain = [...stack, target.path].map((p) => toRelative(sourceRoot, p));
    if (stack.includes(target.path)) {
      reporter.problem({ ...chainAt, message: `include cycle: ${formatChain(chain)}` });
      continue;
    }
    // Inclusive cap (R2): ten include files may be on the stack at once, so a
    // chain ten deep builds and the eleventh is the problem. stack[0] is the
    // originating page, hence the -1 — without it the cap fired at nine.
    if (stack.length - 1 >= MAX_DEPTH) {
      reporter.problem({ ...chainAt, message: `include depth over ${MAX_DEPTH}: ${formatChain(chain)}` });
      continue;
    }

    let body;
    try {
      body = extname(target.path).toLowerCase() === ".md"
        ? await convertMarkdown(target.path)
        : await readFile(target.path, "utf8");
    } catch {
      reporter.problem({
        ...at,
        message: `include not found: ${spec}`,
        context: match.trim().slice(0, 120),
        fixes: [`create it, or point src at an existing .html or .md file`, CHECK_SPELLING],
      });
      continue;
    }

    // Step 5: the target's own includes resolve before this one is spliced.
    const child = await inlineIncludes({
      text: body,
      file: target.path,
      sourceRoot,
      reporter,
      convertMarkdown,
      stack: [...stack, target.path],
      origin: chainAt,
      // Same DIA-13 reason one level down: a `.md` include target was
      // converted above, so the child frame is walking converted HTML too.
      linesAreSource: extname(target.path).toLowerCase() !== ".md",
    });
    edits.push({ index, length: match.length, text: child.text, spans: child.spans });
  }

  return spliceWithProvenance(text, edits, relFile);
}

/**
 * Both include spellings, in source order.
 * @param {string} text
 */
function* findIncludes(text) {
  /** @type {{match: string, spec: string|null, form: string, index: number, content?: string}[]} */
  const found = [];
  for (const m of text.matchAll(INCLUDE_TAG)) {
    found.push({ match: m[0], spec: srcOf(m[1]), form: "src", index: m.index, content: m[2] });
  }
  for (const m of text.matchAll(SSI_TAG)) {
    found.push({ match: m[0], spec: m[2], form: m[1].toLowerCase(), index: m.index });
  }
  yield* found.sort((a, b) => a.index - b.index);
}

/** @param {string} p */
function isPage(p) {
  const ext = extname(p).toLowerCase();
  return ext === ".html" || ext === ".md";
}

/**
 * @param {string} text
 * @param {number} index
 * @returns {number} 1-based line
 */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Splice by index so replacement text is never rescanned — a fragment
 * containing `$&` or `$'` would otherwise be mangled by String.replace's
 * substitution patterns, which is a real v0.6 defect the landmines pin.
 *
 * Also builds the provenance spans array (module doc comment): every byte of
 * `text` not covered by an edit is a verbatim gap authored by `relFile` at
 * its own offset (`fileOffset`); every edit's replacement is a spliced
 * child's own text, so its spans are lifted from `edit.spans` verbatim
 * (only the OUTPUT position shifts — `fileOffset` stays relative to
 * whichever file the child attributed it to, since that fact never changes
 * just because the text moved to a new position in the parent's output).
 * @param {string} text
 * @param {{index: number, length: number, text: string, spans: {start:number,end:number,file:string,fileOffset:number}[]}[]} edits
 * @param {string} relFile
 * @returns {{text: string, spans: {start:number,end:number,file:string,fileOffset:number}[]}}
 */
function spliceWithProvenance(text, edits, relFile) {
  if (edits.length === 0) {
    return { text, spans: text.length > 0 ? [{ start: 0, end: text.length, file: relFile, fileOffset: 0 }] : [] };
  }
  edits.sort((a, b) => a.index - b.index);
  let out = "";
  let cursor = 0;
  const spans = [];
  for (const edit of edits) {
    const gapLen = edit.index - cursor;
    if (gapLen > 0) {
      spans.push({ start: out.length, end: out.length + gapLen, file: relFile, fileOffset: cursor });
      out += text.slice(cursor, edit.index);
    }
    const base = out.length;
    for (const s of edit.spans) spans.push({ ...s, start: base + s.start, end: base + s.end });
    out += edit.text;
    cursor = edit.index + edit.length;
  }
  const tailLen = text.length - cursor;
  if (tailLen > 0) {
    spans.push({ start: out.length, end: out.length + tailLen, file: relFile, fileOffset: cursor });
    out += text.slice(cursor);
  }
  return { text: out, spans };
}
