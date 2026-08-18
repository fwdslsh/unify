#!/usr/bin/env bun
/**
 * check-module-graph.mjs — release gate G8, "no dead modules".
 *
 * The claim: every file under `src/**` is reachable from `src/cli.js` by
 * following static `import` specifiers. A module nothing imports is either a
 * feature that was cut and left behind or a feature that was written and never
 * wired — both are bugs, and both are invisible to a green test suite, because
 * a unit test importing a module directly makes it *covered* without making it
 * *reachable*. That combination is exactly how the v0.6 suite reached 93%
 * coverage on a product that did not work (testing-strategy §1).
 *
 * Static analysis only, deliberately: `import` specifiers are read out of the
 * source text rather than by loading modules, so the gate never executes CLI
 * code and cannot be satisfied by a dynamic import written to fool it. Only
 * relative specifiers are followed — a bare specifier is a dependency, not a
 * `src/**` file.
 *
 * Exit 0 clean; 1 unreachable modules.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");
const ENTRY = join(SRC, "cli.js");

/** Every `.js` file under `src/**`, as absolute paths. */
function allSourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...allSourceFiles(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

/**
 * Relative specifiers imported by one file. Covers the static forms the
 * codebase uses — `import … from "…"`, side-effect `import "…"`, and
 * `export … from "…"` — plus `import("…")` so a lazily loaded command still
 * counts as wired.
 */
function importsOf(file) {
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

const reachable = new Set();
const queue = [ENTRY];
while (queue.length) {
  const file = queue.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);
  for (const spec of importsOf(file)) {
    const target = resolve(dirname(file), spec);
    if (!target.startsWith(SRC)) continue;
    queue.push(target);
  }
}

const dead = allSourceFiles(SRC).filter((f) => !reachable.has(f));
console.log(`module graph: ${reachable.size} reachable from src/cli.js`);
if (dead.length) {
  console.error(`FAIL ${dead.length} unreachable module(s) under src/:`);
  for (const f of dead.sort()) console.error(`  ${relative(ROOT, f)}`);
  console.error("wire it into the build, or delete it — an unimported module is dead code");
  process.exit(1);
}
console.log("module graph: OK");
