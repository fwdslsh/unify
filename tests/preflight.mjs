/**
 * preflight.mjs — loaded by `bunfig.toml [test] preload` (second, after
 * watchdog.mjs), i.e. before the runner loads a single test file. It answers
 * the one question no test can ask from inside the run: is this tree fit to be
 * tested at all?
 *
 * Why it exists (docs/testing-strategy.md §8, closed 2026-08-19): when two or
 * more test files fail to load because a module they import cannot be parsed,
 * `bun test` prints "Unhandled error between tests" and then spins at 100% CPU
 * without ever exiting — no child process to blame, and no per-test timeout in
 * reach, because the spin happens between test files. Measured on bun 1.3.11:
 * ONE such file exits 1 in under a second; TWO never exit (observed past
 * 900 s). One syntax error in `src/core/urls.js` reaches that threshold by
 * itself, because much of `tests/unit/**` imports it transitively. A suite
 * that stops being a gate exactly when the tree is broken is the failure class
 * this repository exists to keep closed.
 *
 * So the parse check runs before the runner does: every JavaScript file the
 * suite can load is handed to Bun.Transpiler.scan(), and one unparseable file
 * is a located failure and exit 2 about 40 ms in. Parse rather than import, on
 * purpose — importing to find out would run module side effects on a tree
 * already known to be untrustworthy.
 *
 * The bound on everything else lives in watchdog.mjs, which imports nothing
 * and therefore survives a parse error in this file or in module-graph.mjs.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { reachableFrom, sourceFiles } from "./module-graph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "src");
const TESTS = HERE;

/**
 * Every file the runner can load: a sweep of the product's and the suite's own
 * JavaScript, plus the import closure of that sweep. The sweep cannot miss a
 * file the way a graph walk can, and the closure only ever adds, so a
 * specifier form `importsOf` does not recognise can never remove a file from
 * the check.
 *
 * `fixtures/` is swept out and re-entered only through a real import. A
 * fixture `.js` is usually site content that unify must ship byte-for-byte,
 * and a deliberately malformed one is a case the suite has to be able to test
 * rather than a reason to refuse to start; a fixture *module* a test imports
 * (tests/fixtures/landmines/runtime-cases.mjs) reaches the runner and is
 * checked. A guard that fires on a legitimate test case is a guard that gets
 * switched off.
 */
function loadableFiles() {
  const swept = [
    // A tree with no src/ still has to be guarded: tests/ alone is enough to
    // reproduce the hang.
    ...(existsSync(SRC) ? sourceFiles(SRC, { extensions: [".js"] }) : []),
    ...sourceFiles(TESTS, { extensions: [".js", ".mjs"], skipDir: (name) => name === "fixtures" }),
  ];
  return [...reachableFrom(swept, [SRC, TESTS])].sort();
}

const transpiler = new Bun.Transpiler({ loader: "js" });
const unparseable = [];
const checked = [];
for (const file of loadableFiles()) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    // A specifier naming no file is bun's own clean error — it exits 1 rather
    // than hanging, so it is not this guard's business to duplicate.
    continue;
  }
  checked.push(relative(ROOT, file));
  try {
    transpiler.scan(text);
  } catch (err) {
    // scan() throws an AggregateError whose .errors carry message and
    // position — a located diagnostic, in the same shape unify itself reports.
    unparseable.push({ file: relative(ROOT, file), errors: err?.errors ?? [err] });
  }
}

if (unparseable.length) {
  process.stderr.write("preflight: the tree cannot be tested — a module the suite loads does not parse.\n");
  for (const { file, errors } of unparseable) {
    for (const e of errors) {
      const at = e?.position ? `${e.position.line}:${e.position.column}` : "?";
      process.stderr.write(`  ${file}:${at}: ${e?.message ?? String(e)}\n`);
    }
  }
  process.stderr.write(
    "Fix the syntax error and re-run. This is checked before the runner starts because\n" +
    "`bun test` hangs, rather than fails, once two test files fail to load from one parse\n" +
    "error (docs/testing-strategy.md §8).\n",
  );
  process.exit(2);
}

// What was actually parsed, for the same reason watchdog.mjs publishes its
// budget: a guard that ran over an empty file set passes silently, and so does
// a suite whose bunfig no longer preloads it. tests/unit/preflight.test.js
// reads this and names files that must appear.
globalThis.__unifyTestPreflight = { checked };
