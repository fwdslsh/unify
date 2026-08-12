/**
 * Integration-level tests for `unify dev` (Tier 3 — no conformance
 * authority; testing-strategy §2, real filesystem/timers/network throughout).
 * Drives the real `dev()` command in-process against real temp directories
 * and a real `Bun.serve()` instance on an OS-assigned ephemeral port.
 *
 * Covers, end to end:
 *   - WCH-05: dev = watch + a static server (directory indexes, a 404 page).
 *   - WCH-06: the reload script appears in what the server SERVES, and is
 *     verified — the critical property — to never appear in the output
 *     directory ON DISK, by reading the files directly and by comparing the
 *     tree against a fresh plain `unify build` with the conformance suite's
 *     own comparator.
 *   - the reload stream actually fires after a real rebuild triggered by a
 *     real file save.
 *
 * `tests/unit/core/dev-server.test.js` covers the server's own request
 * handling in isolation; this file is about `dev.js`'s wiring of that server
 * to the real watch loop.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "../../../../src/cli/commands/build.js";
import { dev } from "../../../../src/cli/commands/dev.js";
import { RELOAD_PATH } from "../../../../src/core/dev-server.js";
import { Reporter } from "../../../../src/core/diagnostics.js";
import { listFiles } from "../../../../tests/conformance/compare.mjs";
import { baseContext, createTempDirTracker, rebuildTracker, writeSite } from "../../helpers/watch-test-helpers.js";

const { tempDir, cleanupAll } = createTempDirTracker();
afterEach(cleanupAll);

describe("dev() — WCH-05 (watch + static server)", () => {
  test("serves the built output and reflects a rebuild after a real save", async () => {
    const src = tempDir("dev-src");
    const out = tempDir("dev-out");
    writeSite(src, { "index.html": "<!doctype html><html><body><h1>v1</h1></body></html>" });

    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    let devServer;

    const done = dev(context, {
      signal: controller.signal,
      onReady: (s) => { devServer = s; },
      onRebuild: tracker.onRebuild,
      debounceMs: 20,
    });
    await tracker.next(); // initial build

    const res1 = await fetch(devServer.url + "/");
    expect(res1.status).toBe(200);
    expect(await res1.text()).toContain("<h1>v1</h1>");

    writeFileSync(join(src, "index.html"), "<!doctype html><html><body><h1>v2</h1></body></html>");
    await tracker.next();

    const res2 = await fetch(devServer.url + "/");
    expect(await res2.text()).toContain("<h1>v2</h1>");

    controller.abort();
    await done;
  }, 15000);

  test("a fatal environment fault (port already in use) throws before any build is attempted", async () => {
    const src = tempDir("dev-portinuse-src");
    const out = tempDir("dev-portinuse-out");
    writeSite(src, { "index.html": "hi" });

    // See src/core/dev-server.js's own doc comment for why the literal
    // 127.0.0.1 address, occupied here, is what dev-server.js itself binds.
    const occupier = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("x") });
    const port = occupier.port;
    try {
      const context = baseContext(src, out, { port });
      let threw = null;
      try {
        await dev(context);
      } catch (e) {
        threw = e;
      }
      expect(threw).not.toBeNull();
      expect(threw.exitCode).toBe(2);
      // Nothing was built — the port check happens before any watch/build work starts.
      const { existsSync } = await import("node:fs");
      expect(existsSync(join(out, "index.html"))).toBe(false);
    } finally {
      occupier.stop(true);
    }
  });
});

describe("dev() — WCH-06 (reload injection never touches the output directory)", () => {
  test("the reload script appears in what the server serves, but never in the files on disk", async () => {
    const src = tempDir("wch06-src");
    const out = tempDir("wch06-out");
    writeSite(src, {
      "_layout.html": "<!doctype html><html><head><title>— Site</title></head><body><main><slot></slot></main></body></html>",
      "index.html": "<!doctype html><html><head><title>Home</title></head><body><h1>Home</h1></body></html>",
      "about.html": "<!doctype html><html><head><title>About</title></head><body><h1>About</h1></body></html>",
      "404.html": '<!doctype html><html><head><title>Not found</title></head><body data-layout="none"><h1>Not found</h1></body></html>',
      "assets/style.css": "body{color:blue}",
    });

    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    let devServer;
    const done = dev(context, {
      signal: controller.signal, onReady: (s) => { devServer = s; }, onRebuild: tracker.onRebuild, debounceMs: 20,
    });
    await tracker.next();

    // The server DOES inject it into what it serves...
    const served = await (await fetch(devServer.url + "/about.html")).text();
    expect(served).toContain(RELOAD_PATH);

    // ...also into the 404 page...
    const served404 = await (await fetch(devServer.url + "/nope")).text();
    expect(served404).toContain(RELOAD_PATH);

    // ...trigger one more real rebuild via a real save, to prove the
    // invariant holds after watch has actually rewritten files, not only
    // right after the first build...
    writeFileSync(join(src, "about.html"), "<!doctype html><html><head><title>About</title></head><body><h1>About v2</h1></body></html>");
    await tracker.next();

    controller.abort();
    await done;

    // ...but the reload script must NEVER exist in the output directory
    // itself — this is the load-bearing check (WCH-06 / product-spec's "unify
    // ships no JavaScript, ever"). Read every emitted file directly off disk.
    for (const rel of listFiles(out)) {
      if (!rel.endsWith(".html")) continue;
      const onDisk = readFileSync(join(out, rel), "utf8");
      expect(onDisk).not.toContain(RELOAD_PATH);
      expect(onDisk).not.toContain("EventSource");
    }

    // Belt and suspenders: the ENTIRE tree dev produced is byte/structure
    // identical to a plain `unify build` of the same source — proving no
    // extra file was created and no existing file was altered by having run
    // under dev at all, not just that a substring is absent.
    const { compareTrees } = await import("../../../../tests/conformance/compare.mjs");
    const outFresh = tempDir("wch06-out-fresh");
    const freshReporter = new Reporter({ stdout: { write() {} }, stderr: { write() {} } });
    const code = await build({ sourceRoot: src, output: outFresh, settings: context.settings, reporter: freshReporter, sourceDefaulted: false });
    expect(code).toBe(0);
    expect(compareTrees(outFresh, out)).toEqual([]);
  }, 15000);

  test("reload notifications reach a connected client after a real rebuild", async () => {
    const src = tempDir("reload-src");
    const out = tempDir("reload-out");
    writeSite(src, { "index.html": "<html><body><h1>v1</h1></body></html>" });

    const controller = new AbortController();
    const tracker = rebuildTracker();
    const context = baseContext(src, out);
    let devServer;
    const done = dev(context, {
      signal: controller.signal, onReady: (s) => { devServer = s; }, onRebuild: tracker.onRebuild, debounceMs: 20,
    });
    await tracker.next();

    const sseRes = await fetch(devServer.url + RELOAD_PATH);
    const reader = sseRes.body.getReader();
    await reader.read(); // the initial ": connected" comment

    writeFileSync(join(src, "index.html"), "<html><body><h1>v2</h1></body></html>");
    await tracker.next();

    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("data: reload");
    await reader.cancel();

    controller.abort();
    await done;
  }, 15000);
});
