/**
 * Unit tests for src/core/dev-server.js (Tier 3 — no conformance authority;
 * testing-strategy §2): the WCH-05 static server (directory indexes, 404
 * page, port-in-use → exit 2) and WCH-06 (reload injection scoped to what
 * this server serves, and only that — proven here at the HTTP-response
 * level; `tests/unit/cli/commands/dev.test.js` additionally proves it never
 * lands in the output directory on disk, wired through the real `dev()`
 * command).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { createDevServer, injectReloadScript, RELOAD_PATH, resolveStaticFile } from "../../../src/core/dev-server.js";
import { UsageError } from "../../../src/core/diagnostics.js";
import { createTempDirTracker, writeSite } from "../helpers/watch-test-helpers.js";

const { tempDir, cleanupAll } = createTempDirTracker();
afterEach(cleanupAll);

// ========================================================= injectReloadScript

describe("injectReloadScript", () => {
  test("inserts right before </body>, leaving everything else untouched", () => {
    const out = injectReloadScript("<html><body><h1>hi</h1></body></html>");
    expect(out).toContain("<h1>hi</h1>");
    expect(out.indexOf("EventSource")).toBeLessThan(out.indexOf("</body>"));
    expect(out).toContain(RELOAD_PATH);
    expect(out.endsWith("</html>")).toBe(true);
  });

  test("appends at the end when there is no </body> (a bare fragment)", () => {
    const out = injectReloadScript("<p>fragment</p>");
    expect(out.startsWith("<p>fragment</p>")).toBe(true);
    expect(out.endsWith("</script>")).toBe(true);
  });
});

// ============================================================ resolveStaticFile

describe("resolveStaticFile", () => {
  test("resolves an exact file", () => {
    const dir = tempDir("resolve-file");
    writeSite(dir, { "style.css": "body{}" });
    expect(resolveStaticFile(dir, "/style.css")).toBe(join(dir, "style.css"));
  });

  test("resolves a directory to its index.html", () => {
    const dir = tempDir("resolve-dirindex");
    writeSite(dir, { "blog/index.html": "<h1>blog</h1>" });
    expect(resolveStaticFile(dir, "/blog/")).toBe(join(dir, "blog", "index.html"));
    expect(resolveStaticFile(dir, "/blog")).toBe(join(dir, "blog", "index.html")); // no forced redirect — permanently minimal
  });

  test("resolves the root to index.html", () => {
    const dir = tempDir("resolve-root");
    writeSite(dir, { "index.html": "<h1>home</h1>" });
    expect(resolveStaticFile(dir, "/")).toBe(join(dir, "index.html"));
  });

  test("returns null for a missing file", () => {
    const dir = tempDir("resolve-missing");
    writeSite(dir, { "index.html": "x" });
    expect(resolveStaticFile(dir, "/nope.html")).toBeNull();
  });

  test("path traversal is rejected even when the escape target exists", () => {
    const outside = tempDir("resolve-outside");
    writeFileSync(join(outside, "secret.txt"), "SECRET");
    const dir = tempDir("resolve-traversal");
    writeSite(dir, { "safe.html": "x" });

    const escaped = resolveStaticFile(dir, `/../${basename(outside)}/secret.txt`);
    expect(escaped).toBeNull();
  });
});

// ============================================================= createDevServer

describe("createDevServer (a real node:http server, ephemeral port)", () => {
  test("serves a file from the output directory with the reload script injected (WCH-05/06)", async () => {
    const dir = tempDir("serve-basic");
    writeSite(dir, { "index.html": "<html><body><h1>Home</h1></body></html>" });
    const s = await createDevServer({ outputDir: dir, port: 0 });
    try {
      const res = await fetch(`${s.url}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const text = await res.text();
      expect(text).toContain("<h1>Home</h1>");
      expect(text).toContain(RELOAD_PATH); // injected into what dev SERVES
    } finally {
      s.stop();
    }
  });

  test("directory index: /blog/ serves blog/index.html", async () => {
    const dir = tempDir("serve-dirindex");
    writeSite(dir, { "blog/index.html": "<html><body><h1>Blog</h1></body></html>" });
    const s = await createDevServer({ outputDir: dir, port: 0 });
    try {
      const res = await fetch(`${s.url}/blog/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<h1>Blog</h1>");
    } finally {
      s.stop();
    }
  });

  test("serves the site's own 404.html with a real 404 status when a request matches nothing", async () => {
    const dir = tempDir("serve-404");
    writeSite(dir, { "404.html": "<html><body>Nothing here</body></html>", "index.html": "hi" });
    const s = await createDevServer({ outputDir: dir, port: 0 });
    try {
      const res = await fetch(`${s.url}/nope`);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toContain("Nothing here");
      expect(text).toContain(RELOAD_PATH); // the 404 page is also HTML dev serves — reload still applies
    } finally {
      s.stop();
    }
  });

  test("falls back to a plain 404 response when the output has no 404.html", async () => {
    const dir = tempDir("serve-404-fallback");
    writeSite(dir, { "index.html": "hi" });
    const s = await createDevServer({ outputDir: dir, port: 0 });
    try {
      const res = await fetch(`${s.url}/nope`);
      expect(res.status).toBe(404);
    } finally {
      s.stop();
    }
  });

  test("non-HTML assets are served as-is, with no injection", async () => {
    const dir = tempDir("serve-asset");
    writeSite(dir, { "style.css": "body{color:red}" });
    const s = await createDevServer({ outputDir: dir, port: 0 });
    try {
      const res = await fetch(`${s.url}/style.css`);
      const text = await res.text();
      expect(text).toBe("body{color:red}");
      expect(text).not.toContain("EventSource");
    } finally {
      s.stop();
    }
  });

  test("reload notifications are delivered over the SSE stream", async () => {
    const dir = tempDir("serve-sse");
    writeSite(dir, { "index.html": "hi" });
    const s = await createDevServer({ outputDir: dir, port: 0 });
    try {
      const res = await fetch(`${s.url}${RELOAD_PATH}`);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const reader = res.body.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain("connected");

      s.notifyReload();
      const second = await reader.read();
      expect(new TextDecoder().decode(second.value)).toContain("data: reload");
      await reader.cancel();
    } finally {
      s.stop();
    }
  });

  test("rejects with a UsageError (exit code 2) when the port is already in use", async () => {
    // createDevServer binds the literal 127.0.0.1 address (see its own doc
    // comment for why "localhost" the hostname STRING was rejected: a runtime
    // resolves it inconsistently across separate binds, so two real `unify
    // dev` processes on the same port did not reliably conflict — confirmed
    // by running the actual CLI twice, see the report). Occupying that same
    // literal address is what makes this test a faithful reproduction of the
    // real "something else is already using this port" condition, not an
    // artifact of the test's own setup.
    const dir = tempDir("serve-portinuse");
    const occupier = createServer((_req, res) => res.end("occupied"));
    await new Promise((ready) => occupier.listen({ port: 0, host: "127.0.0.1" }, ready));
    try {
      let caught = null;
      try {
        await createDevServer({ outputDir: dir, port: occupier.address().port });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(UsageError);
      expect(caught.exitCode).toBe(2);
    } finally {
      occupier.closeAllConnections();
      occupier.close();
    }
  });
});
