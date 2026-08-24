/**
 * Include inlining — conformance-spec §5.
 *
 * Textual, before any parsing: an include's target replaces the element's span,
 * so a fragment's top-level elements simply become the host's. That ordering is
 * why a fragment may carry `slot=` fills or contribute `<slot>` elements without
 * either being a special rule.
 *
 * Path resolution is harvested from the earlier SSI processor, which the audit
 * found was the only correct implementation of §5.1 in the old codebase:
 * `file=` against the including file's directory, `virtual=` against the
 * source root.
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
import { extname } from "node:path";
import { CHECK_SPELLING, formatChain } from "./diagnostics.js";
import { locateVirtual, nameOf, resolutionRoots, virtualResolve } from "./paths.js";
import { declaresSlot, mergeSlottedInclude } from "./slotted-include.js";

/**
 * §4.4 — a name ending `.fragment.html` opts out of page-ness, and §32.2 makes
 * it the one shape a non-empty include may target. Case-insensitive, matching
 * how build.js classifies the same suffix.
 * @param {string} absPath
 */
function isFragment(absPath) {
  return absPath.toLowerCase().endsWith(".fragment.html");
}

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
 * Resolution runs in the §33.3 **namespace**, not against one directory: the
 * spec becomes a virtual path (root-relative, or relative to the including
 * file's own virtual directory), and only then does the filesystem say which
 * root holds it — the source tree first, the `--generate` overlay second
 * (`paths.js`'s `resolutionRoots`). That is what lets a source `_layout.html`
 * include `/_includes/nav.html` that a generator wrote, and a generated page
 * include `./sibling.html` that the author wrote, with one spelling each.
 *
 * @param {object} args
 * @param {string} args.spec - the path as written
 * @param {'src'|'virtual'|'file'} args.form
 * @param {string} args.fromFile - absolute path of the including file
 * @param {string[]} args.roots - the namespace, from `resolutionRoots`
 * @returns {{path: string}|{escapes: true}}
 */
function resolveTarget({ spec, form, fromFile, roots }) {
  let virtual;
  if (form === "virtual") {
    // `virtual=` is root-relative by SSI's definition, leading slash or not.
    const bare = spec.replace(/^\//, "");
    if (bare.startsWith("/")) return { escapes: true };
    virtual = virtualResolve(roots, fromFile, `/${bare}`);
  } else if (form === "file") {
    // `file=` is filesystem-relative by SSI's definition and cannot be absolute.
    if (spec.startsWith("/")) return { escapes: true };
    virtual = virtualResolve(roots, fromFile, spec);
  } else {
    virtual = virtualResolve(roots, fromFile, spec);
  }
  // Traversal safety is internal and always on — an escaping path is simply not
  // a path the build will read, reported with the same shape as not-found.
  if (virtual === null) return { escapes: true };
  return { path: locateVirtual(roots, virtual) };
}

/**
 * Inline every include in `text`, recursively.
 *
 * @param {object} args
 * @param {string} args.text
 * @param {string} args.file - absolute path of the file `text` came from
 * @param {string} args.sourceRoot
 * @param {string[]} [args.roots] - the §33.3 namespace this build resolves in
 *   (`paths.js`'s `resolutionRoots`); defaults to the source root alone, which
 *   is exactly the namespace of a build without `--generate`
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
  roots = resolutionRoots(sourceRoot),
  reporter,
  convertMarkdown,
  stack = [file],
  origin = null,
  linesAreSource = true,
}) {
  // §33.3 — a file is named by its VIRTUAL path, so a diagnostic about a
  // generated fragment says `_includes/nav.html`, the name the author's
  // generator gave it, and never the overlay's temp path.
  const relFile = nameOf(roots, file);
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
    // §32.1 — the CONTENT decides which of two operations this is. An empty
    // include is everything below: verbatim, textual, pre-parse. A non-empty
    // one is a composition, and was P03 until §32; §5.1's sixth rule now
    // defers there and P03 keeps only its other half (an include with no src).
    const slotted = content !== undefined && content.trim() !== "";
    if (form === "src" && content === undefined) {
      reporter.advisory({
        ...at,
        message: "void <include> — builds identically, but previews wrong in a browser",
        fixes: ["close the tag: <include src=\"…\"></include>"],
      });
    }

    const target = resolveTarget({ spec, form, fromFile: file, roots });
    if ("escapes" in target || !isPage(target.path)) {
      reporter.problem({
        ...at,
        message: `include not found: ${spec}`,
        context: match.trim().slice(0, 120),
        fixes: [`create it, or point src at an existing .html or .md file`, CHECK_SPELLING],
      });
      continue;
    }

    const chain = [...stack, target.path].map((p) => nameOf(roots, p));
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
      roots,
      reporter,
      convertMarkdown,
      stack: [...stack, target.path],
      origin: chainAt,
      // Same DIA-13 reason one level down: a `.md` include target was
      // converted above, so the child frame is walking converted HTML too.
      linesAreSource: extname(target.path).toLowerCase() !== ".md",
    });
    if (!slotted) {
      edits.push({ index, length: match.length, text: child.text, spans: child.spans });
      continue;
    }

    // §32.2 — a non-empty include is valid only when its target is a
    // *.fragment.html declaring at least one <slot>. Both halves are required
    // and each has its own problem, located at the INCLUDE element in the file
    // that wrote it — where the author can act — and naming the fragment too,
    // because the fix is as likely to be in one file as the other.
    const fragmentRel = nameOf(roots, target.path);
    if (!isFragment(target.path)) {
      reporter.problem({
        ...at,
        message: `<include> with content: ${fragmentRel} is not a .fragment.html`,
        context: match.trim().slice(0, 120),
        fixes: [
          "an include may carry content only when its target is a fragment with slots",
          `rename it ${fragmentRel.replace(/\.html$/i, ".fragment.html")}, or empty the include`,
        ],
      });
      continue;
    }
    if (!declaresSlot(child.text)) {
      reporter.problem({
        ...at,
        message: `<include> with content: ${fragmentRel} declares no <slot>, so the content has nowhere to go`,
        context: match.trim().slice(0, 120),
        fixes: [`add <slot></slot> to ${fragmentRel}`, "or empty the include — an empty one splices the file verbatim"],
      });
      continue;
    }

    // The content's own offsets are offsets in THIS file's text: `text` is
    // `file`'s raw source (or its converted Markdown), and `edits` are
    // computed against it, so a fill's provenance is this file at its own
    // offset. That is what keeps §14.1's line attribution exact across the
    // interleaving the merge produces.
    const contentStart = index + match.indexOf(">") + 1;
    const merged = mergeSlottedInclude({
      fragmentText: child.text,
      fragmentSpans: child.spans,
      fragmentFile: fragmentRel,
      contentText: content,
      contentSpans: [{ start: 0, end: content.length, file: relFile, fileOffset: contentStart }],
      contentFile: relFile,
      at,
      reporter,
    });
    edits.push({ index, length: match.length, text: merged.text, spans: merged.spans });
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
 * substitution patterns, which is a real defect of the previous
 * implementation that the landmines pin.
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
