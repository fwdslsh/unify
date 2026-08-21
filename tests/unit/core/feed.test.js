/**
 * `feed.test.js` — §29's pure logic, in-process, at the tier where edge cases
 * are cheap.
 *
 * This file exists because of a measured asymmetry. The first mutation sweep
 * of the 0.8 modules found three genuine coverage gaps, and all three were in
 * feed.js — the one 0.8 module with NO unit test file. report.js, which has
 * one, had no real gap: the same sweep's fingerprint mutation dies against its
 * unit test in 0.4ms. The gaps were not caused by too little machinery; they
 * were caused by skipping the cheap tier in one module.
 *
 * So each test here is the UNIT TWIN of a conformance regression test written
 * for one of those gaps. The conformance twin spawns the real CLI and proves
 * the wiring once (~3s); the twin here proves the logic through the module's
 * own exports (~1ms), which is the tier where the NEXT edge case should land
 * first. Division of labour, stated so it survives this file's authors:
 * conformance demonstrates that the pipe exists; this file explores what flows
 * through it.
 *
 * Records are hand-built in §20's shape, same convention as sitemap.test.js.
 * No mocks — Reporter, parseBaseUrl and generateFeed are the real code.
 */
import { describe, expect, test } from "bun:test";
import { FEED_PATH, checkFeedLocs, generateFeed } from "../../../src/core/feed.js";
import { Reporter } from "../../../src/core/diagnostics.js";
import { parseBaseUrl } from "../../../src/core/urls.js";

const BASE = parseBaseUrl("https://example.com/blog/");

/** A quiet reporter plus access to what it was told. */
function reporter() {
  const lines = [];
  const r = new Reporter({ stderr: { write(s) { lines.push(s); } }, stdout: { write() {} } });
  return { r, lines };
}

/** The record shape §29 consumes, with §20's defaults for everything unstated. */
const rec = (over = {}) => ({
  sourcePath: "post.html",
  outputPath: "post.html",
  path: "/blog/post.html",
  url: "https://example.com/blog/post.html",
  title: "Post",
  description: "A post.",
  author: null,
  lang: "en",
  canonical: null,
  robots: { raw: null, directives: [], indexable: true, followable: true },
  schemaType: "BlogPosting",
  datePublished: { raw: "2026-08-02T21:30:00Z", iso: "2026-08-02T21:30:00Z" },
  dateModified: null,
  ...over,
});

const gen = (records, over = {}) =>
  generateFeed({ records, base: BASE, emittedFromSource: new Map(), reporter: reporter().r, ...over });

/** Entry blocks of a feed, so assertions cannot match the feed-level header. */
const entries = (xml) => [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);

const unescape = (s) =>
  s.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");

describe("§29.5 the entry address (unit twin of conformance FEED-02)", () => {
  test("a RELATIVE authored canonical is resolved against the page's own URL", () => {
    const xml = gen([rec({ canonical: "post.html" })]).get(FEED_PATH);
    const [entry] = entries(xml);
    // The exact absolute value, not a shape check: the failure this pins
    // produced a value that was merely SHORTER, and survived lax assertions.
    expect(entry).toContain("<id>https://example.com/blog/post.html</id>");
    expect(entry).toMatch(/<link[^>]*href="https:\/\/example\.com\/blog\/post\.html"/);
  });

  test("an ABSOLUTE authored canonical passes through untouched — the case every old test had", () => {
    const xml = gen([rec({ canonical: "https://example.com/blog/post.html" })]).get(FEED_PATH);
    expect(entries(xml)[0]).toContain("<id>https://example.com/blog/post.html</id>");
  });
});

describe("§29.6 full-content URLs (unit twin of conformance FEED-05)", () => {
  test("every href and src in <content> is absolutized, from both relative forms", () => {
    const record = rec({ outputPath: "posts/entry.html", path: "/blog/posts/entry.html", url: "https://example.com/blog/posts/entry.html" });
    // What the EMITTED page holds by feed time: §11.3 has prefixed the
    // root-relative link with the path prefix, and §11.1 left the page's own
    // relative link alone. Both must leave here absolute.
    const html = `<!doctype html><html lang="en"><head><title>E</title></head>
<body><main><h1>E</h1><p><a href="sibling.html">rel</a> <a href="/blog/index.html">rooted</a></p><img src="pic.png" alt=""></main></body></html>`;
    const xml = gen([record], { feedFull: true, pageHtml: new Map([[record.outputPath, html]]) }).get(FEED_PATH);
    const content = unescape(/<content[^>]*>([\s\S]*?)<\/content>/.exec(xml)[1]);
    expect(content).toContain('href="https://example.com/blog/posts/sibling.html"');
    expect(content).toContain('href="https://example.com/blog/index.html"');
    // src goes through the same handler as href; asserting it keeps one
    // regression from hiding behind the other.
    expect(content).toContain('src="https://example.com/blog/posts/pic.png"');
  });
});

describe("§29.7 which locators are checked (unit twin of conformance FEED-06)", () => {
  const feedXml = (entryHref) => `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://example.com/blog/</id><title>Blog</title><updated>2026-08-02T21:30:00Z</updated>
  <link rel="alternate" href="https://example.com/blog/"/>
  <link rel="self" href="https://example.com/blog/feed.xml"/>
  <entry><id>x</id><title>P</title><updated>2026-08-02T21:30:00Z</updated>
    <link rel="alternate" href="${entryHref}"/></entry>
</feed>`;

  test("feed-level links are NOT reference-checked: no root index.html, no problem", () => {
    const { r, lines } = reporter();
    // The emitted site has the post and the feed — and no index.html, so the
    // feed-level alternate pointing at the site root resolves to nothing.
    checkFeedLocs({
      text: feedXml("https://example.com/blog/post.html"),
      file: FEED_PATH,
      emittedPaths: new Set(["post.html", FEED_PATH]),
      base: BASE,
      reporter: r,
    });
    expect(r.problemCount).toBe(0);
  });

  test("an ENTRY link naming a missing file IS a problem — the silence above is not vacuous", () => {
    const { r, lines } = reporter();
    checkFeedLocs({
      text: feedXml("https://example.com/blog/deleted.html"),
      file: FEED_PATH,
      emittedPaths: new Set(["post.html", FEED_PATH]),
      base: BASE,
      reporter: r,
    });
    expect(r.problemCount).toBe(1);
    r.flush(); // the Reporter buffers for dedup and ordering; the text arrives here
    expect(lines.join("")).toContain("deleted.html");
  });
});

describe("§29.1 activation is membership, not declaration", () => {
  test("a candidate that fails the date condition yields NO feed — a zero-entry feed cannot be valid Atom", () => {
    expect(gen([rec({ datePublished: { raw: "2026-08-02", iso: "2026-08-02" } })]).size).toBe(0);
  });

  test("the same record with a full instant yields the feed — the silence above is the date's doing", () => {
    expect(gen([rec()]).get(FEED_PATH)).toContain("<entry");
  });
});
