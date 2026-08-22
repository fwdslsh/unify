/**
 * The reaper, pinned — because the first attempt at it silently did nothing.
 *
 * `process.on("exit")` was the obvious hook and Bun's test runner does not run
 * exit handlers, so the cleanup registered, the suite passed, and every
 * directory stayed exactly where it was. Nothing failed. That is the whole
 * hazard of this kind of fix: its absence is invisible, which is how 114,174
 * directories accumulated in the first place.
 *
 * So the mechanism is asserted rather than trusted. A test that only called
 * `reapRegistered()` directly would pass against a broken preload wiring, so
 * the wiring is checked too — `bunfig.toml` must actually load this module.
 */
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingCount, registerTmp, reapRegistered } from "../tmp-reaper.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("a registered directory is removed, and an unregistered one is left alone", () => {
  const registered = registerTmp(mkdtempSync(join(tmpdir(), "unify-reaper-test-")));
  const untouched = mkdtempSync(join(tmpdir(), "unify-reaper-control-"));
  writeFileSync(join(registered, "a.txt"), "x");
  writeFileSync(join(untouched, "a.txt"), "x");

  expect(pendingCount()).toBeGreaterThan(0);
  reapRegistered();

  expect(existsSync(registered)).toBe(false);
  // The control proves the reaper removes what it was GIVEN rather than
  // sweeping a prefix — which would delete a concurrent run's directories.
  expect(existsSync(untouched)).toBe(true);
  expect(pendingCount()).toBe(0);
});

test("UNIFY_KEEP_TMP=1 keeps everything, so a failing test's tree survives", () => {
  const dir = registerTmp(mkdtempSync(join(tmpdir(), "unify-reaper-keep-")));
  const prior = process.env.UNIFY_KEEP_TMP;
  process.env.UNIFY_KEEP_TMP = "1";
  try {
    reapRegistered();
    expect(existsSync(dir)).toBe(true);
  } finally {
    if (prior === undefined) delete process.env.UNIFY_KEEP_TMP;
    else process.env.UNIFY_KEEP_TMP = prior;
  }
  reapRegistered();
  expect(existsSync(dir)).toBe(false);
});

test("bunfig.toml actually preloads the reaper — the wiring, not just the function", () => {
  const bunfig = readFileSync(join(ROOT, "bunfig.toml"), "utf8");
  const line = bunfig.split("\n").find((l) => l.trimStart().startsWith("preload"));
  expect(line).toBeDefined();
  // Without this entry the module's `afterAll` never registers, and the leak
  // returns with every test still green.
  expect(line).toContain("tests/tmp-reaper.mjs");
});
