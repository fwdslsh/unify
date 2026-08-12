/**
 * §14.1 DIA-09 — DEBUG=1 adds stack traces. "targeted" per rules.tsv.
 *
 * harness.test.js deliberately deletes DEBUG from every spawn's environment
 * ("not under test here" — its own comment) precisely because this file
 * exists to test it. The trigger is an invalid CLI option: it throws a
 * UsageError from src/cli.js's top-level catch before any filesystem access,
 * so the same empty temp directory works for both runs, and the two runs
 * differ ONLY in the DEBUG env var, isolating its effect.
 */
import { test } from "bun:test";
import { covers, mkTmp, runCli } from "./support.mjs";

const TEST_MS = 30_000;

// A stack frame line, Bun/V8 shape: "    at name (file:line:col)".
const STACK_FRAME = /\n\s+at .+:\d+:\d+\)?/;

test("DIA-09: DEBUG=1 adds a stack trace to a fatal error; without it, none appears", async () => {
  const tmp = mkTmp(); // empty: an unknown option is rejected before any fs access

  const withoutDebug = await runCli(["build", "--this-flag-does-not-exist"], tmp);
  if (withoutDebug.exit !== 2) throw new Error(`expected exit 2 (usage error), got ${withoutDebug.exit}. stderr: ${withoutDebug.stderr}`);
  if (!withoutDebug.stderr.includes("unknown option")) throw new Error(`expected an unknown-option message. stderr:\n${withoutDebug.stderr}`);
  if (STACK_FRAME.test(withoutDebug.stderr)) throw new Error(`a stack trace appeared WITHOUT DEBUG=1:\n${withoutDebug.stderr}`);

  const withDebug = await runCli(["build", "--this-flag-does-not-exist"], tmp, { DEBUG: "1" });
  if (withDebug.exit !== 2) throw new Error(`expected exit 2 (usage error), got ${withDebug.exit}. stderr: ${withDebug.stderr}`);
  if (!withDebug.stderr.includes("unknown option")) throw new Error(`expected an unknown-option message. stderr:\n${withDebug.stderr}`);
  if (!STACK_FRAME.test(withDebug.stderr)) throw new Error(`DEBUG=1 did not add a stack trace. stderr:\n${withDebug.stderr}`);

  covers("DIA-09");
}, TEST_MS);

test("DIA-09: DEBUG=1 also adds a stack trace for a --clean containment refusal (a second, independent UsageError site)", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const tmp = mkTmp();
  mkdirSync(join(tmp, "src"), { recursive: true });
  writeFileSync(join(tmp, "src", "index.html"), "<!doctype html><html><head><title>P</title></head><body>hi</body></html>\n");

  // -o . --clean: the output directory contains the source root — refused.
  const withDebug = await runCli(["build", "-s", "src", "-o", ".", "--clean"], tmp, { DEBUG: "1" });
  if (withDebug.exit !== 2) throw new Error(`expected exit 2 (the --clean containment refusal), got ${withDebug.exit}. stderr: ${withDebug.stderr}`);
  if (!STACK_FRAME.test(withDebug.stderr)) throw new Error(`DEBUG=1 did not add a stack trace for the --clean refusal. stderr:\n${withDebug.stderr}`);

  covers("DIA-09");
}, TEST_MS);
