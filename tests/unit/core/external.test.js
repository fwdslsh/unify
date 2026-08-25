/**
 * Unit tests for src/core/external.js — conformance-spec §31.3 (Tier 3; no
 * conformance authority, testing-strategy §2). CLI-observable behavior for
 * `unify audit --external` is covered in tests/conformance/report.test.js
 * (RPT-03), which is where the rule's real authority lives.
 *
 * This file exists because three of §31.3's properties are impractical to
 * exercise honestly through the real CLI: the ten-second timeout and the
 * five-redirect cap would make a conformance run either dishonestly fast
 * (asserting nothing about the real bound) or minutes slow for one test, and
 * the "cannot reach the network at all" heuristic needs to be checked against
 * inputs a CLI-level fixture cannot construct on demand (an all-connection-
 * refused batch alongside a mixed one, in the same process, back to back).
 * Real local HTTP server throughout (`startServer` below); never a real
 * external host, since a test that depends on the internet is a test that
 * fails on a train.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { collectExternalReferences, probeUrls } from "../../../src/core/external.js";

function startServer() {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/ok") return new Response("ok", { status: 200 });
      if (url.pathname === "/notfound") return new Response("nope", { status: 404 });
      if (url.pathname === "/servererror") return new Response("bad", { status: 500 });
      if (url.pathname === "/method-check") {
        return req.method === "HEAD" ? new Response(null, { status: 405 }) : new Response("via get", { status: 200 });
      }
      if (url.pathname === "/redirect-once") return new Response(null, { status: 302, headers: { location: "/ok" } });
      if (url.pathname === "/redirect-loop") return new Response(null, { status: 302, headers: { location: "/redirect-loop" } });
      if (url.pathname === "/slow") {
        // Comfortably longer than every client timeoutMs under test (300ms)
        // without leaving a minutes-long timer alive server-side once the
        // client has already given up — that timer previously outlived
        // server.stop(true) and hung this file's own afterAll hook.
        await new Promise((r) => {
          if (req.signal.aborted) return r();
          req.signal.addEventListener("abort", () => r(), { once: true });
        });
        return new Response("late", { status: 200 });
      }
      return new Response("unhandled", { status: 404 });
    },
  });
  return { server, base: `http://127.0.0.1:${server.port}` };
}

const { server, base } = startServer();
afterAll(() => server.stop(true));

describe("probeUrls", () => {
  test("200 is ok; 404/500 are not, with the answered-<status> evidence", async () => {
    const results = await probeUrls(
      [`${base}/ok`, `${base}/notfound`, `${base}/servererror`],
      { timeoutMs: 2000 },
    );
    expect(results.get(`${base}/ok`)).toMatchObject({ ok: true, status: 200, error: null });
    expect(results.get(`${base}/notfound`)).toMatchObject({ ok: false, status: 404, error: "answered 404" });
    expect(results.get(`${base}/servererror`)).toMatchObject({ ok: false, status: 500, error: "answered 500" });
  });

  test("HEAD 405 falls back to GET", async () => {
    const results = await probeUrls([`${base}/method-check`], { timeoutMs: 2000 });
    expect(results.get(`${base}/method-check`).ok).toBe(true);
  });

  test("a redirect is followed", async () => {
    const results = await probeUrls([`${base}/redirect-once`], { timeoutMs: 2000 });
    expect(results.get(`${base}/redirect-once`).ok).toBe(true);
  });

  test("redirects are capped — a loop fails as 'too many redirects', not an infinite fetch", async () => {
    const results = await probeUrls([`${base}/redirect-loop`], { timeoutMs: 2000, maxRedirects: 3 });
    const r = results.get(`${base}/redirect-loop`);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too many redirects/);
  });

  test("a request is bounded by its own timeout, not the runtime default", async () => {
    const started = Date.now();
    const results = await probeUrls([`${base}/slow`], { timeoutMs: 300, concurrency: 1 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(results.get(`${base}/slow`)).toMatchObject({ ok: false, status: null, error: "timed out", reason: "timeout" });
  });

  test("each distinct URL is fetched once, however many times it is passed", async () => {
    const results = await probeUrls([`${base}/ok`, `${base}/ok`, `${base}/ok`], { timeoutMs: 2000 });
    expect(results.size).toBe(1);
  });

  test("every failure is a result, INCLUDING all of them — there is no 'no network' verdict", async () => {
    // §31.3, and the rule that replaced a heuristic. `probeUrls` used to also
    // return `networkUnreachable`, true when every probe failed to connect,
    // so the caller could raise one usage error instead of a finding per URL.
    // It made the commonest shape wrong: a site with a SINGLE off-origin link
    // is most sites, and for one of those the identical dead host reported as
    // a finding at exit 0 when some other URL happened to answer, and as a
    // usage error at exit 2 when it did not — one fault, two answers, decided
    // by an unrelated page. Nothing here can tell "this machine has no
    // network" from "the one host this site links to is down"; the only test
    // that could is a request to some third party unify chose.
    //
    // So this asserts the shape the deleted verdict would have collapsed:
    // two dead hosts, and BOTH are ordinary failed probes.
    const results = await probeUrls(
      ["http://127.0.0.1:1/closed-a", "http://127.0.0.1:2/closed-b"],
      { timeoutMs: 2000 },
    );
    expect(results.size).toBe(2);
    for (const r of results.values()) {
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("connection");
    }
  });

  test("a single dead host is one ordinary failure — the shape the old heuristic got wrong", async () => {
    // The exact input that used to become a usage error: one off-origin link,
    // dead. It must read identically to the same link beside a live one.
    const alone = await probeUrls(["http://127.0.0.1:1/closed-a"], { timeoutMs: 2000 });
    const beside = await probeUrls([`${base}/ok`, "http://127.0.0.1:1/closed-a"], { timeoutMs: 2000 });
    expect(alone.get("http://127.0.0.1:1/closed-a")).toMatchObject(
      { ok: beside.get("http://127.0.0.1:1/closed-a").ok, reason: beside.get("http://127.0.0.1:1/closed-a").reason },
    );
    expect(alone.get("http://127.0.0.1:1/closed-a").ok).toBe(false);
  });

  test("an empty URL list probes nothing and returns an empty map", async () => {
    const results = await probeUrls([], { timeoutMs: 2000 });
    expect(results.size).toBe(0);
  });
});

describe("collectExternalReferences", () => {
  /**
   * The minimal BuildDocument shape this module reads: `outputPath` and
   * `analysis.jsonLd` — nothing else here reads `document` or any other
   * `analysis` field, so the fixture carries only what §31.3 consumes.
   */
  const rec = (over) => ({
    source: { path: over.sourcePath ?? "p.html", generated: false, layout: null },
    outputPath: "p.html",
    analysis: { jsonLd: [] },
    ...over,
  });
  /** A minimal complete document — collectHtmlReferences scans every element regardless of head/body placement. */
  const doc = (bodyHtml, headHtml = "") => `<!doctype html><html><head>${headHtml}</head><body>${bodyHtml}</body></html>`;

  test("collects href/src anywhere in the page, og/twitter meta content, and <link href> of any rel (canonical included) — off-origin only", () => {
    const records = [
      rec({ sourcePath: "a.html", outputPath: "a.html" }),
      rec({ sourcePath: "b.html", outputPath: "b.html" }),
    ];
    const htmlByOutputPath = new Map([
      [
        "a.html",
        doc(
          `<a href="${base}/elsewhere.html">x</a><img src="${base}/img.png">`,
          `<link rel="canonical" href="${base}/canon.html">`,
        ),
      ],
      ["b.html", doc(`<a href="/internal.html">home</a>`, `<meta property="og:image" content="${base}/og.png">`)],
    ]);
    const owners = collectExternalReferences(records, htmlByOutputPath, null);
    expect([...owners.keys()].sort()).toEqual(
      [`${base}/elsewhere.html`, `${base}/img.png`, `${base}/canon.html`, `${base}/og.png`].sort(),
    );
    expect(owners.get(`${base}/elsewhere.html`).source.path).toBe("a.html");
    expect(owners.get(`${base}/og.png`).source.path).toBe("b.html");
    // A root-relative href is internal — §12's job, never this module's.
    expect(owners.has("/internal.html")).toBe(false);
  });

  test("JSON-LD URL-valued properties, off-origin half — the one source collectHtmlReferences's own JSON-LD branch can never supply (it accepts root-relative values only)", () => {
    const records = [rec({
      sourcePath: "b.html", outputPath: "b.html",
      analysis: { jsonLd: [{ raw: "{}", error: null, data: { "@type": "WebPage", logo: `${base}/logo.png`, url: "/internal.html" } }] },
    })];
    const owners = collectExternalReferences(records, new Map(), null);
    expect([...owners.keys()]).toEqual([`${base}/logo.png`]);
    expect(owners.get(`${base}/logo.png`).source.path).toBe("b.html");
    // A root-relative json-ld url is internal — §12's job, never this module's.
    expect(owners.has("/internal.html")).toBe(false);
  });

  test("the FIRST referencing record wins for a URL shared by several pages", () => {
    const records = [
      rec({ sourcePath: "first.html", outputPath: "first.html" }),
      rec({ sourcePath: "second.html", outputPath: "second.html" }),
    ];
    const htmlByOutputPath = new Map([
      ["first.html", doc(`<a href="${base}/shared.png">x</a>`)],
      ["second.html", doc(`<a href="${base}/shared.png">x</a>`)],
    ]);
    const owners = collectExternalReferences(records, htmlByOutputPath, null);
    expect(owners.size).toBe(1);
    expect(owners.get(`${base}/shared.png`).source.path).toBe("first.html");
  });

  test("@context's value is a term definition, not data — never collected even under a listed property name", () => {
    const records = [rec({
      analysis: { jsonLd: [{
        raw: "{}", error: null,
        data: { "@context": { url: `${base}/should-not-collect` }, "@type": "Thing", logo: `${base}/collected.png` },
      }] },
    })];
    const owners = collectExternalReferences(records, new Map(), null);
    expect(owners.has(`${base}/should-not-collect`)).toBe(false);
    expect(owners.has(`${base}/collected.png`)).toBe(true);
  });

  test("a value under --base-url's own prefix is internal, not off-origin", () => {
    const base22 = { origin: "https://example.com", pathPrefix: "/repo/", scheme: "https:" };
    const records = [rec({ outputPath: "about.html" })];
    const htmlByOutputPath = new Map([["about.html", doc('<a href="https://example.com/repo/about.html">self</a>')]]);
    const owners = collectExternalReferences(records, htmlByOutputPath, base22);
    expect(owners.size).toBe(0);
  });

  test("a value on a DIFFERENT host is off-origin even under --base-url", () => {
    const base22 = { origin: "https://example.com", pathPrefix: "/repo/", scheme: "https:" };
    const records = [rec({ outputPath: "about.html" })];
    const htmlByOutputPath = new Map([["about.html", doc('<a href="https://partner.example/about.html">x</a>')]]);
    const owners = collectExternalReferences(records, htmlByOutputPath, base22);
    expect(owners.has("https://partner.example/about.html")).toBe(true);
  });

  test("a protocol-relative reference borrows --base-url's scheme; https: without one", () => {
    const base22 = { origin: "https://example.com", pathPrefix: "/", scheme: "https:" };
    const records = [rec({ sourcePath: "a.html", outputPath: "a.html" })];
    const htmlByOutputPath = new Map([["a.html", doc('<a href="//partner.example/x">x</a>')]]);
    expect([...collectExternalReferences(records, htmlByOutputPath, base22).keys()]).toEqual(["https://partner.example/x"]);
    expect([...collectExternalReferences(records, htmlByOutputPath, null).keys()]).toEqual(["https://partner.example/x"]);
  });

  test("a character reference in an off-origin href is fetched decoded, not as literal entity bytes (§12's own read-decoded rule)", () => {
    const records = [rec({ sourcePath: "a.html", outputPath: "a.html" })];
    const htmlByOutputPath = new Map([["a.html", doc(`<a href="${base}/a&amp;b.html">x</a>`)]]);
    expect([...collectExternalReferences(records, htmlByOutputPath, null).keys()]).toEqual([`${base}/a&b.html`]);
  });

  test("a page absent from htmlByOutputPath contributes no href/src references but its JSON-LD is still read", () => {
    const records = [rec({
      sourcePath: "a.html", outputPath: "a.html",
      analysis: { jsonLd: [{ raw: "{}", error: null, data: { "@type": "Thing", logo: `${base}/still-found.png` } }] },
    })];
    const owners = collectExternalReferences(records, new Map(), null);
    expect([...owners.keys()]).toEqual([`${base}/still-found.png`]);
  });
});
