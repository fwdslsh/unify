/**
 * Path containment and source/output resolution.
 *
 * Traversal safety is internal engineering — always on, invisible, no flags,
 * no logging (product-spec §5, no security theater). A path that escapes the
 * source root is simply not a path the build will read.
 */

import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Never emitted, independent of --exclude and not replaceable by it (§4.3). */
export const NEVER_SHIPPED = [".git", ".hg", ".svn", "node_modules", ".env", "unify.yaml"];

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
 * `--clean` refuses when the output directory is, contains, or is contained by
 * the source root or the working directory. `-o . --clean` is an error, not a
 * deleted project.
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
    if (contains(dir, out)) return `the output directory is inside ${name}`;
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
