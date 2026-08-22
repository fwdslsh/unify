/**
 * support.mjs — shared spawn/ledger helpers for the targeted and E2E behavior
 * tests that sit beside harness.test.js (dry-run wiring, unify.yaml, publish
 * sync, DEBUG=1, and the init scaffold contract). Deliberately independent of
 * harness.test.js (out of this task's scope to edit): its own CLI spawner and
 * its own ledger writer, following the identical contract documented in
 * testing-strategy.md §3.2 — append `{rule, test, status}` to the same
 * `.conformance-ledger.jsonl` the release gate reads at
 * `check-traceability.mjs --runtime`, so these rules are credited exactly
 * like the fixture-driven ones. No mocks, no `src/**` imports (hygiene
 * H1/H3) — every helper here either spawns the real CLI as a subprocess or
 * touches a real temp directory on a real filesystem.
 */
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTmp } from "../tmp-reaper.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..");
export const CLI = join(ROOT, "src", "cli.js");
const LEDGER = join(ROOT, ".conformance-ledger.jsonl");

const CLI_TIMEOUT_MS = 30_000; // a hang is a failure, never a wait (same discipline as harness.test.js)

/**
 * Runtime rule-coverage declaration, same contract as harness.test.js's own
 * helper of the same name (testing-strategy §3.2): call as the LAST
 * statement of a test body so an earlier thrown assertion means nothing gets
 * recorded. Defined as an arrow assignment, name then equals-sign then
 * parenthesis, rather than the `function` form — so this definition site
 * does not itself read as a call to check-traceability.mjs's call-site
 * scanner, which looks for the name immediately followed by an open paren.
 * @param {...string} ruleIds
 */
export const covers = (...ruleIds) => {
  const frame = (new Error().stack ?? "").split("\n")[2] ?? "";
  const testId = frame.replace(/^\s*at\s+/, "").replaceAll(`${ROOT}/`, "").trim() || "unknown-test";
  const lines = ruleIds.map((rule) => JSON.stringify({ rule, test: testId, status: "pass" }));
  appendFileSync(LEDGER, `${lines.join("\n")}\n`);
};

/**
 * Spawn the real CLI (the one entrypoint path, hygiene H3) and collect its
 * output. Unlike harness.test.js's reader this has no byte cap — every case
 * in this file writes small, known, non-adversarial fixtures, so a simple
 * buffered read is enough; the hang guard below is what still matters.
 * @param {string[]} args
 * @param {string} cwd
 * @param {Record<string,string>} [envOverrides] - merged over a clean base
 *   env; set `DEBUG` here to test DIA-09 (the base env otherwise deletes it)
 * @returns {Promise<{exit: number, stdout: string, stderr: string}>}
 */
export async function runCli(args, cwd, envOverrides = {}) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.DEBUG;
  delete env.FORCE_COLOR;
  delete env.CLAUDECODE;
  Object.assign(env, envOverrides);
  const proc = Bun.spawn({
    cmd: [process.execPath, CLI, ...args],
    cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const timer = setTimeout(() => { try { proc.kill(9); } catch { /* already gone */ } }, CLI_TIMEOUT_MS);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  clearTimeout(timer);
  return { exit, stdout, stderr };
}

/**
 * A fresh empty temp directory, same convention as harness.test.js.
 *
 * Registered for removal at the end of the run — see `tests/tmp-reaper.mjs` for
 * why that is a preload hook rather than an exit handler, and what it cost to
 * leave undone.
 */
export function mkTmp() {
  return registerTmp(mkdtempSync(join(tmpdir(), "unify-targeted-")));
}

/**
 * Write a `{relativePath: content}` map under `root`, creating parent
 * directories as needed.
 * @param {string} root
 * @param {Record<string,string>} files
 */
export function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}
