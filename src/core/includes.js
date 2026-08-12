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
 */

import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { CHECK_SPELLING, formatChain } from "./diagnostics.js";
import { contains, toRelative } from "./paths.js";

/** Inclusive: ten include files may be on the stack; the eleventh is the problem. */
export const MAX_DEPTH = 10;

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
export function resolveTarget({ spec, form, fromFile, sourceRoot }) {
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
 * @param {string[]} [args.stack] - resolved paths currently being expanded
 * @returns {Promise<string>}
 */
export async function inlineIncludes({
  text,
  file,
  sourceRoot,
  reporter,
  convertMarkdown,
  stack = [file],
}) {
  const edits = [];

  for (const { match, spec, form, index, content } of findIncludes(text)) {
    const at = { file: toRelative(sourceRoot, file), line: lineOf(text, index) };

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
      reporter.problem({ ...at, message: `include cycle: ${formatChain(chain)}` });
      continue;
    }
    if (stack.length >= MAX_DEPTH) {
      reporter.problem({ ...at, message: `include depth over ${MAX_DEPTH}: ${formatChain(chain)}` });
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

    edits.push({
      index,
      length: match.length,
      // Step 5: the target's own includes resolve before this one is spliced.
      text: await inlineIncludes({
        text: body,
        file: target.path,
        sourceRoot,
        reporter,
        convertMarkdown,
        stack: [...stack, target.path],
      }),
    });
  }

  return applyEdits(text, edits);
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
 * @param {string} text
 * @param {{index: number, length: number, text: string}[]} edits
 */
function applyEdits(text, edits) {
  if (edits.length === 0) return text;
  edits.sort((a, b) => a.index - b.index);
  let out = "";
  let cursor = 0;
  for (const edit of edits) {
    out += text.slice(cursor, edit.index) + edit.text;
    cursor = edit.index + edit.length;
  }
  return out + text.slice(cursor);
}
