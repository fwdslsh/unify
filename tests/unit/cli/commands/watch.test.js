/**
 * Integration-level tests for `unify watch` (Tier 3 — no conformance
 * authority; testing-strategy §2, but real filesystem/timers throughout,
 * same discipline as a behavior test, per the task brief for this phase).
 * Drives the real `watch()` command in-process (an `AbortController`
 * replaces SIGINT for deterministic shutdown) against real temp
 * directories, exercising the real `build()` pipeline on every rebuild.
 *
 * Covers, end to end:
 *   - WCH-01: a save landing mid-rebuild is coalesced into exactly one
 *     follow-up, proven by actually racing real file saves against a
 *     deliberately slowed rebuild (`testDelayMs`).
 *   - WCH-02: watch output after a scripted edit sequence is tree-identical
 *     to a fresh `unify build` of the same final source, via the
 *     conformance suite's own comparator (`tests/conformance/compare.mjs`).
 *   - WCH-03: unrelated rebuilds leave unchanged files byte- and
 *     inode-identical (no spurious writes); `--clean` empties the output
 *     only at startup, never on a later rebuild; deletions are precise.
 *   - WCH-04: a page that fails to build gets a default error page while
 *     watching, replaced by the next successful rebuild; a problem that
 *     cannot be attributed to one page (a broken shared layout) marks every
 *     previously-good page instead of silently doing nothing.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "../../../../src/cli/commands/build.js";
import { watch } from "../../../../src/cli/commands/watch.js";
import { Reporter } from "../../../../src/core/diagnostics.js";
import { compareTrees } from "../../../../tests/conformance/compare.mjs";
import { baseContext, createTempDirTracker, rebuildTracker, sleep, writeSite } from "../../helpers/watch-test-helpers.js";

const { tempDir, cleanupAll } = createTempDirTracker();
afterEach(cleanupAll);

// ==================================================================== WCH-01

describe("WCH-01 — coalescing", () => {
  test("a save landing mid-rebuild is coalesced into exactly one follow-up; no change is dropped", async () => {
    const src = tempDir("coalesce-src");
    const out = tempDir("coalesce-out");
    writeSite(src, { "index.html": "<html><body><h1>v1</h1></body></html>" });

    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);

    // The initial rebuild starts synchronously inside watch() (runWatchLoop's
    // own coalescer.trigger() fires before this call returns) and
    // testDelayMs pads it, so the race below has a wide, reliable window —
    // every write below lands while THIS FIRST rebuild is still in flight.
    const done = watch(context, {
      signal: controller.signal, onRebuild: tracker.onRebuild, testDelayMs: 150, debounceMs: 20,
    });

    await sleep(30);
    writeFileSync(join(src, "index.html"), "<html><body><h1>v2</h1></body></html>");
    await sleep(15);
    writeFileSync(join(src, "index.html"), "<html><body><h1>v3</h1></body></html>");
    await sleep(15);
    writeFileSync(join(src, "index.html"), "<html><body><h1>v4</h1></body></html>");
    await sleep(15);
    writeFileSync(join(src, "index.html"), "<html><body><h1>v5</h1></body></html>");

    const first = await tracker.next(); // the initial rebuild
    expect(first.ok).toBe(true);
    const second = await tracker.next(); // the ONE coalesced follow-up absorbing v2..v5
    expect(second.ok).toBe(true);

    controller.abort();
    await done;

    // Exactly two rebuilds total (initial + one coalesced follow-up) — never
    // one per save, never dropped.
    expect(tracker.all.length).toBe(2);
    // The LAST save's content won — nothing was silently dropped.
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain("v5");
  }, 15000);
});

// ==================================================================== WCH-02

describe("WCH-02 — every rebuild is a full rebuild", () => {
  test("watch output after an edit sequence is tree-identical to a fresh build of the same final source", async () => {
    const src = tempDir("equiv-src");
    const outWatch = tempDir("equiv-out-watch");
    writeSite(src, {
      "_layout.html":
        '<!doctype html><html><head><meta charset="utf-8"><title>— Site</title></head><body><main><slot></slot></main><footer><slot name="footer"><p>(c) default</p></slot></footer></body></html>',
      "index.html": "<!doctype html><html><head><title>Home</title></head><body><h1>Welcome</h1></body></html>",
      "about.html": "<!doctype html><html><head><title>About</title></head><body><h1>About v1</h1></body></html>",
      "assets/style.css": "body{color:blue}",
    });

    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, outWatch);
    const done = watch(context, { signal: controller.signal, onRebuild: tracker.onRebuild, debounceMs: 20 });
    expect((await tracker.next()).ok).toBe(true);

    // Edit an existing page.
    writeFileSync(join(src, "about.html"), "<!doctype html><html><head><title>About</title></head><body><h1>About v2</h1></body></html>");
    expect((await tracker.next()).ok).toBe(true);

    // A burst: add a page, edit an asset, and edit the shared layout close together.
    writeFileSync(
      join(src, "contact.html"),
      '<!doctype html><html><head><title>Contact</title></head><body><p slot="footer">Reach us</p><h1>Contact</h1></body></html>',
    );
    writeFileSync(join(src, "assets", "style.css"), "body{color:green}");
    writeFileSync(
      join(src, "_layout.html"),
      '<!doctype html><html><head><meta charset="utf-8"><title>— Site v2</title></head><body><main><slot></slot></main><footer><slot name="footer"><p>(c) default</p></slot></footer></body></html>',
    );
    expect((await tracker.next()).ok).toBe(true);

    // Delete a page.
    rmSync(join(src, "index.html"));
    expect((await tracker.next()).ok).toBe(true);

    controller.abort();
    await done;

    // A fresh, independent build of the FINAL source tree.
    const outFresh = tempDir("equiv-out-fresh");
    const freshReporter = new Reporter({ stdout: { write() {} }, stderr: { write() {} } });
    const code = await build({ sourceRoot: src, output: outFresh, settings: context.settings, reporter: freshReporter, sourceDefaulted: false });
    expect(code).toBe(0);

    const diffs = compareTrees(outFresh, outWatch);
    expect(diffs).toEqual([]);
  }, 20000);
});

// ==================================================================== WCH-03

describe("WCH-03 — minimal, atomic writes; --clean only at startup", () => {
  test("an unrelated rebuild does not rewrite a file whose content did not change", async () => {
    const src = tempDir("minimal-src");
    const out = tempDir("minimal-out");
    writeSite(src, {
      "index.html": "<html><body><h1>Home</h1></body></html>",
      "about.html": "<html><body><h1>About</h1></body></html>",
    });
    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    const done = watch(context, { signal: controller.signal, onRebuild: tracker.onRebuild, debounceMs: 20 });
    expect((await tracker.next()).ok).toBe(true);

    const before = statSync(join(out, "about.html"));
    await sleep(10);

    writeFileSync(join(src, "index.html"), "<html><body><h1>Home v2</h1></body></html>");
    expect((await tracker.next()).ok).toBe(true);

    const after = statSync(join(out, "about.html"));
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(readFileSync(join(out, "index.html"), "utf8")).toContain("Home v2"); // sanity: the changed file DID update

    controller.abort();
    await done;
  }, 15000);

  test("a no-op resave (byte-identical content) triggers a full rebuild but rewrites nothing (release gate G7)", async () => {
    const src = tempDir("noop-src");
    const out = tempDir("noop-out");
    const content = "<html><body><h1>Home</h1></body></html>";
    writeSite(src, { "index.html": content });
    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    const done = watch(context, { signal: controller.signal, onRebuild: tracker.onRebuild, debounceMs: 20 });
    expect((await tracker.next()).ok).toBe(true);

    const before = statSync(join(out, "index.html"));
    await sleep(10);

    writeFileSync(join(src, "index.html"), content); // byte-identical resave — still a real fs write
    expect((await tracker.next()).ok).toBe(true); // a full rebuild DID run (WCH-02: no shortcuts) ...

    const after = statSync(join(out, "index.html"));
    expect(after.ino).toBe(before.ino); // ...but it rewrote nothing (WCH-03 / G7)
    expect(after.mtimeMs).toBe(before.mtimeMs);

    controller.abort();
    await done;
  }, 15000);

  test("deleting a source page removes its output file on the next rebuild", async () => {
    const src = tempDir("delete-src");
    const out = tempDir("delete-out");
    writeSite(src, {
      "index.html": "<html><body><h1>Home</h1></body></html>",
      "gone.html": "<html><body><h1>Bye</h1></body></html>",
    });
    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    const done = watch(context, { signal: controller.signal, onRebuild: tracker.onRebuild, debounceMs: 20 });
    expect((await tracker.next()).ok).toBe(true);
    expect(existsSync(join(out, "gone.html"))).toBe(true);

    rmSync(join(src, "gone.html"));
    expect((await tracker.next()).ok).toBe(true);
    expect(existsSync(join(out, "gone.html"))).toBe(false);

    controller.abort();
    await done;
  }, 15000);

  test("--clean empties the output only at startup, never on a later rebuild", async () => {
    const src = tempDir("clean-src");
    const out = tempDir("clean-out");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "stale-from-before.html"), "leftover junk from a previous, unrelated run");
    writeSite(src, {
      "index.html": "<html><body><h1>Home</h1></body></html>",
      "about.html": "<html><body><h1>About</h1></body></html>",
    });

    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out, { clean: true });
    const done = watch(context, { signal: controller.signal, onRebuild: tracker.onRebuild, debounceMs: 20 });
    expect((await tracker.next()).ok).toBe(true); // startup build: --clean applies here

    expect(existsSync(join(out, "stale-from-before.html"))).toBe(false); // wiped at startup
    const aboutStat1 = statSync(join(out, "about.html"));
    await sleep(10);

    // An unrelated edit triggers a second rebuild; about.html's content does not change.
    writeFileSync(join(src, "index.html"), "<html><body><h1>Home v2</h1></body></html>");
    expect((await tracker.next()).ok).toBe(true);

    const aboutStat2 = statSync(join(out, "about.html"));
    // If --clean had re-applied on this rebuild, publish() would have had
    // nothing to diff against (a freshly emptied directory), so EVERY file —
    // about.html included, despite its content never changing — would have
    // been a fresh write with a new inode. It must not be.
    expect(aboutStat2.ino).toBe(aboutStat1.ino);
    expect(aboutStat2.mtimeMs).toBe(aboutStat1.mtimeMs);

    controller.abort();
    await done;
  }, 15000);
});

// ==================================================================== WCH-04

describe("an unexpected exception during a rebuild (not a normal diagnosed problem)", () => {
  test("is treated as a failed rebuild, not a false success, and does not crash the watch loop", async () => {
    const src = tempDir("crash-src");
    const tmp = tempDir("crash-tmp");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "index.html"), "<html><body><h1>Home</h1></body></html>");
    // A FILE, not a directory, at the exact spot the output path needs a
    // directory — build.js's own publish step throws ENOTDIR from mkdir(),
    // an exception, not a diagnosed problem/advisory.
    writeFileSync(join(tmp, "blocker"), "not a directory");
    const out = join(tmp, "blocker", "dist");

    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    const done = watch(context, { signal: controller.signal, onRebuild: tracker.onRebuild, debounceMs: 20 });

    const first = await tracker.next();
    expect(first.ok).toBe(false); // never a false "success" for an exception

    controller.abort();
    await done; // the loop shut down cleanly rather than crashing the process
  }, 15000);
});

describe("WCH-04 — default error page while watching", () => {
  test("a page that fails to build gets a default error page, replaced by the next successful rebuild", async () => {
    const src = tempDir("error-src");
    const out = tempDir("error-out");
    writeSite(src, {
      "index.html": "<html><body><h1>Home</h1></body></html>",
      "about.html": '<html><body><include src="/does-not-exist.html"></include></body></html>',
    });
    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    const done = watch(context, { signal: controller.signal, onRebuild: tracker.onRebuild, debounceMs: 20 });

    const first = await tracker.next();
    expect(first.ok).toBe(false);

    // build.js's own transactional gate is unmodified by watch mode: a
    // problem anywhere blocks the WHOLE tree from publishing, and there is
    // no previous output yet — so index.html (itself perfectly valid) has
    // never been written. about.html is the one thing this rebuild may
    // still write (WCH-04).
    expect(existsSync(join(out, "index.html"))).toBe(false);
    const errorHtml = readFileSync(join(out, "about.html"), "utf8");
    expect(errorHtml).toContain("unify-watch-error-page");
    expect(errorHtml).toContain("about.html");
    expect(errorHtml).toContain("include not found");

    // Fix the page — the next rebuild is fully clean, so it publishes for real.
    writeFileSync(join(src, "about.html"), "<html><body><h1>About</h1></body></html>");
    const second = await tracker.next();
    expect(second.ok).toBe(true);

    expect(readFileSync(join(out, "index.html"), "utf8")).toContain("Home");
    const fixedHtml = readFileSync(join(out, "about.html"), "utf8");
    expect(fixedHtml).not.toContain("unify-watch-error-page");
    expect(fixedHtml).toContain("About");

    controller.abort();
    await done;
  }, 15000);

  test("a problem that cannot be attributed to one page (a broken shared layout) marks every previously-good page", async () => {
    const src = tempDir("error2-src");
    const out = tempDir("error2-out");
    writeSite(src, {
      "_layout.html": "<html><body><main><slot></slot></main></body></html>",
      "index.html": "<html><body><h1>Home</h1></body></html>",
      "about.html": "<html><body><h1>About</h1></body></html>",
    });
    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    const done = watch(context, { signal: controller.signal, onRebuild: tracker.onRebuild, debounceMs: 20 });
    expect((await tracker.next()).ok).toBe(true); // both pages published normally at first

    // Break the shared layout (P15: a layout that declares its own data-layout).
    writeFileSync(join(src, "_layout.html"), '<html><body data-layout="/_layout.html"><main><slot></slot></main></body></html>');
    const second = await tracker.next();
    expect(second.ok).toBe(false);

    for (const page of ["index.html", "about.html"]) {
      const html = readFileSync(join(out, page), "utf8");
      expect(html).toContain("unify-watch-error-page");
      expect(html).toContain("layout chaining is not supported");
    }

    controller.abort();
    await done;
  }, 15000);
});
