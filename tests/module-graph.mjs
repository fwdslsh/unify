/**
 * module-graph.mjs — the one owner of two questions: which files are this
 * tree's JavaScript, and which relative modules does each one pull in.
 *
 * Two gates ask that question and must not be able to disagree about it: the
 * dead-module gate (check-module-graph.mjs, G8) walks it forward from
 * src/cli.js, and the test preflight (tests/preflight.mjs) walks it to decide
 * what must parse before the runner loads anything. They each had their own
 * copy of the walk, which is the two-owners-for-one-question shape
 * testing-strategy §5 exists to remove: a specifier form one copy missed was
 * invisible in the other.
 *
 * Deliberately dependency-free (node:fs / node:path only): preflight.mjs
 * imports this file before it can vouch for any other file, so anything this
 * file pulled in would be code the guard cannot itself have checked.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Every file under `dir` with one of `extensions`, as absolute paths,
 * recursively. `skipDir` prunes a subtree by name.
 */
export function sourceFiles(dir, { extensions = [".js"], skipDir = () => false } = {}) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (skipDir(name, p)) continue;
      out.push(...sourceFiles(p, { extensions, skipDir }));
    } else if (extensions.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/**
 * Relative specifiers imported by one file. Covers the static forms the
 * codebase uses — `import … from "…"`, side-effect `import "…"`, and
 * `export … from "…"` — plus `import("…")` so a lazily loaded command still
 * counts as wired. Text analysis, never module loading: a gate must not
 * execute the code it is judging.
 */
export function importsOf(file) {
  const src = readFileSync(file, "utf8");
  const specs = [];
  for (const re of [
    /\bimport\s+[^;'"]*\sfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^;'"]*\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const m of src.matchAll(re)) specs.push(m[1]);
  }
  return specs.filter((s) => s.startsWith("."));
}

/**
 * Transitive closure of `roots` under relative imports, as a Set of absolute
 * paths. `within` bounds the walk: a specifier resolving outside those roots
 * is a dependency, not a file of this tree.
 *
 * An unreadable file is skipped rather than thrown on — the callers are gates
 * that must reach their own report, and each has a better error for it than a
 * stack trace out of the walker.
 */
export function reachableFrom(roots, within) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let specs;
    try {
      specs = importsOf(file);
    } catch {
      continue;
    }
    for (const spec of specs) {
      const target = resolve(dirname(file), spec);
      if (within && !within.some((w) => target.startsWith(w))) continue;
      queue.push(target);
    }
  }
  return seen;
}
