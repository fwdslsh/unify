/**
 * Path containment and source/output resolution.
 *
 * Traversal safety is internal engineering — always on, invisible, no flags,
 * no logging (product-spec §5, no security theater). A path that escapes the
 * source root is simply not a path the build will read.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";

/** Never emitted, independent of --exclude and not replaceable by it (§4.3). */
const NEVER_SHIPPED = [".git", ".hg", ".svn", "node_modules", ".env", "unify.yaml"];

/**
 * Is `candidate` inside `root` (or the root itself)?
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
export function contains(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * A path is never-shipped when any segment matches the list, or when the
 * basename is `.env` / `.env.*`. Deliberately short and literal — no
 * heuristics, no guessing at what "looks secret".
 * @param {string} relativePath - source-root-relative, `/`-separated
 * @returns {boolean}
 */
export function isNeverShipped(relativePath) {
  return relativePath.split("/").some((segment) => {
    if (NEVER_SHIPPED.includes(segment)) return true;
    return segment === ".env" || segment.startsWith(".env.");
  });
}

/**
 * Resolve the source root: an explicit --source wins; otherwise `src/` when it
 * exists, else the working directory. The distinction matters beyond
 * convenience — defaulting to the working directory is exactly the condition
 * that triggers the would-copy notice (§4.4), so it is reported back.
 *
 * @param {string|undefined} flag - the --source value, if any
 * @param {string} [cwd]
 * @returns {{root: string, defaulted: boolean}} `defaulted` is true only when
 *   no flag was given and no `src/` existed
 */
export function resolveSource(flag, cwd = process.cwd()) {
  if (flag !== undefined) return { root: resolve(cwd, flag), defaulted: false };
  const src = resolve(cwd, "src");
  if (existsSync(src) && statSync(src).isDirectory()) return { root: src, defaulted: false };
  return { root: resolve(cwd), defaulted: true };
}

/**
 * `--clean` refuses when the output directory **is, or contains,** the source
 * root or the working directory — `-o . --clean` is an error, not a deleted
 * project, and `-o ..` must not empty the source.
 *
 * It deliberately does NOT refuse when the output merely sits inside them.
 * That was the original rule and it was wrong: `src/` beside `dist/` under a
 * project root is what `init` scaffolds and what nearly every site uses, and
 * `-s . -o dist` puts the output inside the source root by construction. The
 * guard exists to stop `--clean` destroying something the author wrote, not to
 * police directory nesting.
 *
 * @param {string} output
 * @param {string} source
 * @param {string} [cwd]
 * @returns {string|null} the reason to refuse, or null when safe
 */
export function cleanRefusalReason(output, source, cwd = process.cwd()) {
  const out = resolve(output);
  for (const [name, dir] of [["the source root", resolve(source)], ["the working directory", resolve(cwd)]]) {
    if (out === dir) return `the output directory is ${name}`;
    if (contains(out, dir)) return `the output directory contains ${name}`;
  }
  return null;
}

/**
 * Normalize a filesystem path to a source-root-relative, `/`-separated form.
 * Every diagnostic and every output path uses this shape.
 * @param {string} root
 * @param {string} absolutePath
 * @returns {string}
 */
export function toRelative(root, absolutePath) {
  return relative(resolve(root), resolve(absolutePath)).split(sep).join("/");
}

// ------------------------------------------------- §33.3 — the namespace

/**
 * §33.3 — **the resolution namespace**: one path space, one or two
 * directories behind it.
 *
 * The `--generate` overlay is scanned exactly as the source tree is, and a
 * scanned file is named by its path *relative to the root it was found
 * under* — `docs/api.md` whether it was written by hand in `src/docs/` or by
 * a generator into the overlay. That name is the **virtual path**, and it is
 * the only path the rest of the build reasons about: it is what
 * `<include src="/…">` names, what the layout walk climbs, what §13 keys
 * collisions on, and what §17's report prints.
 *
 * Resolution therefore happens in the virtual path space and only afterwards
 * asks the filesystem which root holds the file. Before this existed, the
 * overlay joined the scan but not resolution — the walk climbed absolute
 * directories out of the overlay and stopped, and `/_includes/x.html`
 * resolved against the source root alone, so a generated page got no layout
 * (silently) and a generated fragment was invisible to `<include>`.
 *
 * **Precedence is source-first** (`roots[0]` is always the source root). For
 * a path present in both trees and *published*, §33.4's P12 already refuses
 * the build, so precedence is unobservable there. It is observable only for
 * paths that never publish — an underscore-excluded fragment, a
 * `_layout.html` — and there the author's own file must win: a generator that
 * could shadow a file the author wrote would be the silent overwrite §13
 * exists to forbid. The overlay fills gaps in the namespace; it never
 * replaces what is already in it.
 *
 * @param {string} sourceRoot
 * @param {string|null} [overlayDir] - §33.3's generated directory, when one exists
 * @returns {string[]} absolute roots, in precedence order (source root first)
 */
export function resolutionRoots(sourceRoot, overlayDir = null) {
  const roots = [resolve(sourceRoot)];
  if (overlayDir !== null && overlayDir !== undefined && overlayDir !== "") {
    const overlay = resolve(overlayDir);
    if (overlay !== roots[0]) roots.push(overlay);
  }
  return roots;
}

/**
 * The virtual path of an absolute path: its name relative to whichever root
 * holds it. The **deepest** containing root wins, so a namespace whose
 * overlay happens to sit inside the source root (a `TMPDIR` under the
 * project) still names a generated file by its overlay-relative path rather
 * than by a temp path no author wrote.
 *
 * @param {string[]} roots - from `resolutionRoots`
 * @param {string} absolutePath
 * @returns {string|null} the virtual path, or null when no root holds it
 */
export function virtualOf(roots, absolutePath) {
  const abs = resolve(absolutePath);
  let best = null;
  for (const root of roots) {
    if (!contains(root, abs)) continue;
    if (best === null || root.length > best.length) best = root;
  }
  return best === null ? null : toRelative(best, abs);
}

/**
 * Resolve a written path — a `/`-rooted spec, or one relative to the file
 * that wrote it — to a virtual path (§5.1 steps 1–2, §6.1 steps 1–3).
 *
 * A relative spec is measured from the **virtual** directory of the declaring
 * file, which is what makes `./sibling.html` mean the same thing in a
 * generated page as in a hand-written one. Escapes are not paths this build
 * will read (§4.3): a spec climbing above the namespace root, or a `//x` that
 * is not root-relative at all, resolves to null and the caller reports it
 * with the same shape as not-found.
 *
 * @param {string[]} roots
 * @param {string} fromFile - absolute path of the file that wrote `spec`
 * @param {string} spec - the path as written
 * @returns {string|null} the virtual path, or null when it escapes
 */
export function virtualResolve(roots, fromFile, spec) {
  let raw;
  if (spec.startsWith("/")) {
    raw = spec.slice(1);
    if (raw.startsWith("/")) return null; // `//x` names no file in this namespace
  } else {
    const from = virtualOf(roots, fromFile);
    if (from === null) return null;
    const dir = posix.dirname(from);
    raw = dir === "." ? spec : `${dir}/${spec}`;
  }
  const normalized = posix.normalize(raw).replace(/\/+$/, "");
  if (normalized === "" || normalized === "." || normalized === ".." ||
      normalized.startsWith("../") || normalized.startsWith("/")) {
    return null;
  }
  return normalized;
}

/**
 * The absolute file behind a virtual path: the first root that holds it as a
 * file wins (source root before overlay — `resolutionRoots`).
 *
 * @param {string[]} roots
 * @param {string} virtualPath
 * @returns {string|null} null when no root holds it as a file
 */
export function locateExisting(roots, virtualPath) {
  for (const root of roots) {
    const candidate = resolve(root, virtualPath);
    if (!contains(root, candidate)) continue;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not in this root — try the next
    }
  }
  return null;
}

/**
 * The name a diagnostic gives a file (§14.1's `file` field): its virtual path.
 *
 * Every located diagnostic, every §17 report row and every §13 collision key
 * uses this one shape, so a generated file is named `_includes/nav.html` — the
 * name its generator gave it — and never by the overlay's temp path, which is
 * a directory the author never chose and that no longer exists by the time
 * they read the message. A path under no root at all (which the build should
 * never produce) falls back to source-root-relative rather than throwing.
 *
 * @param {string[]} roots
 * @param {string} absolutePath
 * @returns {string}
 */
export function nameOf(roots, absolutePath) {
  return virtualOf(roots, absolutePath) ?? toRelative(roots[0], absolutePath);
}

/**
 * `locateExisting`, but never null: with no root holding the file, the
 * **source root's** candidate is returned, so a caller's own existence check
 * fails exactly where and how it did before there was an overlay, naming the
 * path the author would look for.
 *
 * @param {string[]} roots
 * @param {string} virtualPath
 * @returns {string}
 */
export function locateVirtual(roots, virtualPath) {
  return locateExisting(roots, virtualPath) ?? resolve(roots[0], virtualPath);
}
