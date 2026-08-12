/**
 * Unit tests for src/core/watcher.js (Tier 3 — no conformance authority;
 * testing-strategy §2). Three independent surfaces, tested independently:
 *
 *   - `createCoalescer` — the WCH-01 guarantee in isolation, with a fully
 *     controllable fake task (deferred promises) so the "trigger lands
 *     mid-run" race is deterministic rather than timing-dependent.
 *   - `watchSource` — real `fs.watch` + debounce + ignore filtering, against
 *     a real temp directory, real timers (no mocking).
 *   - the WCH-04 helpers (`computeErrorPageTargets`, `renderErrorPage`,
 *     `writeErrorPages`, `knownGoodPages`) — pure logic tested with
 *     synthetic diagnostics, plus real-filesystem tests for the write path.
 *
 * `tests/unit/cli/commands/watch.test.js` covers the same rules end to end
 * through the real `watch()` command; this file isolates each mechanism so a
 * failure here points at the exact piece responsible.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeErrorPageTargets, createCoalescer, knownGoodPages, renderErrorPage, watchSource, writeErrorPages,
} from "../../../src/core/watcher.js";
import { createTempDirTracker, sleep, writeSite } from "../helpers/watch-test-helpers.js";

const { tempDir, cleanupAll } = createTempDirTracker();
afterEach(cleanupAll);

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// ============================================================ createCoalescer

describe("createCoalescer (WCH-01)", () => {
  test("trigger() runs the task immediately when idle", async () => {
    let calls = 0;
    const c = createCoalescer(async () => {
      calls++;
    });
    c.trigger();
    await c.whenIdle();
    expect(calls).toBe(1);
  });

  test("a trigger() that lands mid-run is coalesced into exactly one follow-up — never zero, never more", async () => {
    let calls = 0;
    /** @type {{promise: Promise<void>, resolve: () => void}[]} */
    const gates = [];
    const c = createCoalescer(async () => {
      calls++;
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
    });

    c.trigger(); // starts call #1 synchronously (up to its own await)
    expect(calls).toBe(1);
    expect(c.isRunning).toBe(true);

    // Several triggers land while call #1 is still in flight.
    c.trigger();
    c.trigger();
    c.trigger();
    expect(calls).toBe(1); // none of them started a second run yet

    gates[0].resolve(); // let call #1 finish
    await sleep(10); // let the coalescer's own await chain settle

    expect(calls).toBe(2); // exactly one follow-up — not three, not zero
    expect(c.isRunning).toBe(true); // the follow-up is the one now in flight

    gates[1].resolve();
    await c.whenIdle();
    expect(calls).toBe(2); // and nothing further once the follow-up itself completes clean
  });

  test("triggers landing during a coalesced follow-up chain correctly, indefinitely — no drops across multiple hand-offs", async () => {
    let calls = 0;
    const gates = [];
    const c = createCoalescer(async () => {
      calls++;
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
    });

    c.trigger();
    expect(calls).toBe(1);

    for (let round = 0; round < 4; round++) {
      c.trigger(); // land a save while the current run is still in flight
      c.trigger(); // and a second one, to prove multiple triggers still coalesce to one
      gates[round].resolve();
      await sleep(10);
      expect(calls).toBe(round + 2); // exactly one more run per round, never more
    }

    gates[gates.length - 1].resolve();
    await c.whenIdle();
    expect(calls).toBe(5);
  });

  test("whenIdle() resolves immediately when nothing is running", async () => {
    const c = createCoalescer(async () => {});
    await expect(c.whenIdle()).resolves.toBeUndefined();
  });
});

// ================================================================ watchSource

describe("watchSource (real fs.watch, real timers)", () => {
  test("a file change triggers onChange after the debounce window", async () => {
    const dir = tempDir("watchsrc-basic");
    writeFileSync(join(dir, "a.txt"), "1");
    let count = 0;
    const w = watchSource(dir, { debounceMs: 20, onChange: () => count++ });
    await sleep(30);
    writeFileSync(join(dir, "a.txt"), "2");
    await sleep(150);
    w.close();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("a burst of writes within the debounce window coalesces into a single onChange", async () => {
    const dir = tempDir("watchsrc-burst");
    let count = 0;
    const w = watchSource(dir, { debounceMs: 60, onChange: () => count++ });
    await sleep(30);
    for (let i = 0; i < 6; i++) writeFileSync(join(dir, "a.txt"), String(i));
    await sleep(250);
    w.close();
    expect(count).toBe(1);
  });

  test("changes under an ignored directory are dropped; changes elsewhere still fire", async () => {
    const dir = tempDir("watchsrc-ignore");
    mkdirSync(join(dir, "dist"), { recursive: true });
    let count = 0;
    const w = watchSource(dir, { ignoreDirs: [join(dir, "dist")], debounceMs: 20, onChange: () => count++ });
    await sleep(30);

    writeFileSync(join(dir, "dist", "x.html"), "hi");
    await sleep(120);
    expect(count).toBe(0);

    writeFileSync(join(dir, "real.html"), "hi");
    await sleep(120);
    w.close();
    expect(count).toBe(1);
  });

  test("changes under a never-shipped directory (.git) are dropped", async () => {
    const dir = tempDir("watchsrc-neverShipped");
    mkdirSync(join(dir, ".git"), { recursive: true });
    let count = 0;
    const w = watchSource(dir, { debounceMs: 20, onChange: () => count++ });
    await sleep(30);
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main");
    await sleep(120);
    w.close();
    expect(count).toBe(0);
  });

  test("close() stops further notifications", async () => {
    const dir = tempDir("watchsrc-close");
    let count = 0;
    const w = watchSource(dir, { debounceMs: 20, onChange: () => count++ });
    w.close();
    await sleep(20);
    writeFileSync(join(dir, "a.txt"), "1");
    await sleep(120);
    expect(count).toBe(0);
  });
});

// ===================================================== computeErrorPageTargets

describe("computeErrorPageTargets (WCH-04 attribution)", () => {
  const problem = (file) => ({ severity: "problem", file, message: "x" });

  test("a problem on a real page maps directly to that page's own output path", () => {
    const targets = computeErrorPageTargets({
      problems: [problem("src/about.html")],
      sourceRoot: "/proj/src",
      cwd: "/proj",
      prettyUrls: false,
      lastGoodPages: new Set(["index.html"]),
    });
    expect(targets).toEqual(new Set(["about.html"]));
  });

  test("honors --pretty-urls when computing the target path", () => {
    const targets = computeErrorPageTargets({
      problems: [problem("src/about.html")],
      sourceRoot: "/proj/src",
      cwd: "/proj",
      prettyUrls: true,
      lastGoodPages: new Set(),
    });
    expect(targets).toEqual(new Set(["about/index.html"]));
  });

  test("a .md page is attributed the same way as .html", () => {
    const targets = computeErrorPageTargets({
      problems: [problem("src/about.md")],
      sourceRoot: "/proj/src",
      cwd: "/proj",
      prettyUrls: false,
      lastGoodPages: new Set(),
    });
    expect(targets).toEqual(new Set(["about.html"]));
  });

  test("a problem at a layout/include (underscore-prefixed) is not directly attributable — falls back to every known-good page", () => {
    const targets = computeErrorPageTargets({
      problems: [problem("src/_layout.html")],
      sourceRoot: "/proj/src",
      cwd: "/proj",
      prettyUrls: false,
      lastGoodPages: new Set(["about.html", "index.html"]),
    });
    expect(targets).toEqual(new Set(["about.html", "index.html"]));
  });

  test("a problem in an underscore DIRECTORY (not just an underscore-prefixed file) also falls back", () => {
    const targets = computeErrorPageTargets({
      problems: [problem("src/_includes/nav.html")],
      sourceRoot: "/proj/src",
      cwd: "/proj",
      prettyUrls: false,
      lastGoodPages: new Set(["index.html"]),
    });
    expect(targets).toEqual(new Set(["index.html"]));
  });

  test("a mix of attributable and unattributable problems unions both", () => {
    const targets = computeErrorPageTargets({
      problems: [problem("src/about.html"), problem("src/_layout.html")],
      sourceRoot: "/proj/src",
      cwd: "/proj",
      prettyUrls: false,
      lastGoodPages: new Set(["index.html"]),
    });
    expect(targets).toEqual(new Set(["about.html", "index.html"]));
  });

  test("a diagnostic with no file at all is unattributable", () => {
    const targets = computeErrorPageTargets({
      problems: [{ severity: "problem", message: "no file" }],
      sourceRoot: "/proj/src",
      cwd: "/proj",
      prettyUrls: false,
      lastGoodPages: new Set(["index.html"]),
    });
    expect(targets).toEqual(new Set(["index.html"]));
  });

  test("no diagnostics and no known-good pages: empty target set", () => {
    const targets = computeErrorPageTargets({
      problems: [], sourceRoot: "/proj/src", cwd: "/proj", prettyUrls: false, lastGoodPages: new Set(),
    });
    expect(targets).toEqual(new Set());
  });
});

// ============================================================ renderErrorPage

describe("renderErrorPage", () => {
  test("escapes HTML special characters in diagnostic text and carries a stable marker", () => {
    const html = renderErrorPage([
      { severity: "problem", file: "src/index.html", line: 3, message: "<include> takes no content" },
    ]);
    expect(html).toContain('id="unify-watch-error-page"');
    expect(html).toContain("&lt;include&gt;");
    expect(html).not.toContain("<include>"); // the raw diagnostic text must never become live markup
    expect(html).toContain("src/index.html:3");
  });

  test("carries every problem passed to it", () => {
    const html = renderErrorPage([
      { severity: "problem", file: "a.html", message: "first" },
      { severity: "problem", file: "b.html", message: "second" },
    ]);
    expect(html).toContain("first");
    expect(html).toContain("second");
  });
});

// ============================================================ writeErrorPages

describe("writeErrorPages (real filesystem, WCH-03 minimal + atomic)", () => {
  test("writes new content when the target is missing", async () => {
    const dir = tempDir("errpages-new");
    const written = await writeErrorPages({ outputDir: dir, targets: new Set(["about.html"]), html: "<p>err</p>" });
    expect(written).toEqual(["about.html"]);
    expect(readFileSync(join(dir, "about.html"), "utf8")).toBe("<p>err</p>");
  });

  test("does not rewrite when content is already identical (WCH-03 minimal writes)", async () => {
    const dir = tempDir("errpages-unchanged");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "about.html"), "<p>err</p>");
    const before = statSync(join(dir, "about.html"));
    await sleep(10);

    const written = await writeErrorPages({ outputDir: dir, targets: new Set(["about.html"]), html: "<p>err</p>" });
    expect(written).toEqual([]);
    const after = statSync(join(dir, "about.html"));
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test("creates nested directories as needed", async () => {
    const dir = tempDir("errpages-nested");
    await writeErrorPages({ outputDir: dir, targets: new Set(["blog/post.html"]), html: "<p>x</p>" });
    expect(readFileSync(join(dir, "blog", "post.html"), "utf8")).toBe("<p>x</p>");
  });

  test("an empty target set writes nothing and does not even require the directory to exist", async () => {
    const dir = tempDir("errpages-empty");
    const written = await writeErrorPages({ outputDir: join(dir, "does-not-exist"), targets: new Set(), html: "x" });
    expect(written).toEqual([]);
    expect(existsSync(join(dir, "does-not-exist"))).toBe(false);
  });
});

// ============================================================== knownGoodPages

describe("knownGoodPages", () => {
  test("returns only .html paths from the output snapshot", async () => {
    const dir = tempDir("knowngood");
    writeSite(dir, { "index.html": "x", "assets/style.css": "y", "blog/post.html": "z" });
    const pages = await knownGoodPages(dir);
    expect(pages).toEqual(new Set(["index.html", "blog/post.html"]));
  });

  test("an empty/missing output directory yields an empty set", async () => {
    const dir = tempDir("knowngood-missing");
    const pages = await knownGoodPages(join(dir, "nope"));
    expect(pages).toEqual(new Set());
  });
});
