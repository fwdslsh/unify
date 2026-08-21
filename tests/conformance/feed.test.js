/**
 * §29 feed generation — FEED-01..06 and A17.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4). Written
 * from docs/conformance-spec.md §29 alone — nothing here imports src/**, and
 * every assertion traces to a sentence in that section (or in §11.3, §12,
 * §14, §15, §17, §20, §21, §22, §24.3-24.6, or §26, which §29 leans on).
 *
 * Unlike sitemap.test.js, structural assertions here do NOT compare whole
 * documents byte-for-byte. §21.4 pins the sitemap's serialization explicitly
 * ("one element per line, newline-terminated"); §29 has no equivalent clause
 * for feed.xml, so assuming one particular pretty-printing would make this
 * file an implementation-matching test rather than a spec test. Instead,
 * structural checks extract named elements with tolerant regexes (below),
 * indifferent to attribute order, quoting of surrounding whitespace, or
 * self-closing style. Byte-for-byte comparison is still used exactly where
 * the RULE ITSELF is about bytes staying identical: two builds of one tree
 * (§29.4's determinism clause) and an authored feed.xml shipping untouched
 * (§29.7).
 *
 * The two-sided convention, same as sitemap.test.js: every rule that fires
 * has an adjacent case where it must not, and every silence (no feed, no
 * entry, no advisory) sits beside a positive control in the same test so it
 * cannot pass against a feature that was never wired up.
 */
import { test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";

// --------------------------------------------------------------- fixtures

/** The smallest complete page. No layout anywhere in these fixtures, so §3's preservation rule means the emitted bytes are exactly these bytes. */
const page = (title, body = "<p>x</p>", head = "") =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n${head}</head>\n<body>\n${body}\n</body>\n</html>\n`;

/**
 * An Article/BlogPosting-declaring page, built from the fields §29.4/§29.5
 * read: schema type, dates, description, author, robots, canonical.
 */
function post(title, { type = "BlogPosting", date, lastmod, description, author, canonical, robots, h1 = title } = {}) {
  let head = `<meta name="schema" content="${type}">\n`;
  if (date) head += `<meta name="date" content="${date}">\n`;
  if (lastmod) head += `<meta name="lastmod" content="${lastmod}">\n`;
  if (description) head += `<meta name="description" content="${description}">\n`;
  if (author) head += `<meta name="author" content="${author}">\n`;
  if (robots) head += `<meta name="robots" content="${robots}">\n`;
  if (canonical) head += `<link rel="canonical" href="${canonical}">\n`;
  return page(title, `<h1>${h1}</h1>`, head);
}

// --------------------------------------------------------------- CLI/file helpers

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectBytes(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what}\n--- expected ---\n${JSON.stringify(expected)}\n--- actual ---\n${JSON.stringify(actual)}`);
  }
}

function read(...parts) {
  return readFileSync(join(...parts), "utf8");
}

// --------------------------------------------------------------- tolerant XML reading

/** The text content of every top-level <entry>...</entry>, in document order. */
function feedEntries(xml) {
  const out = [];
  const re = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/** Everything before the first <entry> — the feed-level id/title/updated/links live here. */
function feedHeader(xml) {
  const i = xml.indexOf("<entry");
  return i === -1 ? xml : xml.slice(0, i);
}

/** Inner text of <name ...>...</name> inside `block`, tolerant of attributes; null if absent. */
function tagText(block, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`).exec(block);
  return m ? m[1] : null;
}

/**
 * href of a <link> carrying the given rel inside `block`, tolerant of
 * attribute order and of single- vs double-quoted attributes (§29 does not
 * pin feed.xml's serialization the way §10.2 pins synthesized-element
 * quoting for other artifacts); null if absent.
 */
function linkHref(block, rel) {
  const a = new RegExp(`<link\\b[^>]*\\brel=["']${rel}["'][^>]*\\bhref=["']([^"']*)["']`).exec(block);
  if (a) return a[1];
  const b = new RegExp(`<link\\b[^>]*\\bhref=["']([^"']*)["'][^>]*\\brel=["']${rel}["']`).exec(block);
  return b ? b[1] : null;
}

/** True when <tagName ...> carries attr="value" (either quote style) somewhere in its own start tag. */
function hasAttr(block, tagName, attr, value) {
  return new RegExp(`<${tagName}\\b[^>]*\\b${attr}=["']${value}["'][^>]*>`).test(block);
}

/** Decode a text-construct's raw captured content, whether written as CDATA or as escaped text (§29 does not pin which). */
function unwrapXmlText(raw) {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw.trim());
  if (cdata) return cdata[1];
  return raw.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

// ------------------------------------------------------------------- §29.1

test("FEED-01: a feed is written only when --base-url is set AND at least one page declares Article or BlogPosting", async () => {
  const article = post("A Post", { date: "2026-01-05T09:00:00Z" });

  // 1. --base-url present, but no Article/BlogPosting page (a WebPage doesn't count).
  const noArticle = mkTmp();
  writeTree(join(noArticle, "src"), { "index.html": page("Home"), "about.html": post("About", { type: "WebPage", date: "2026-01-05T09:00:00Z" }) });
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], noArticle);
  expectExit(a, 0, "base-url, no Article/BlogPosting page");
  if (existsSync(join(noArticle, "dist", "feed.xml"))) {
    throw new Error("§29.1: --base-url alone, with no Article/BlogPosting page, must not generate a feed");
  }

  // 2. An Article/BlogPosting page exists, but no --base-url.
  const noBase = mkTmp();
  writeTree(join(noBase, "src"), { "index.html": page("Home"), "post.html": article });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], noBase);
  expectExit(b, 0, "no --base-url");
  if (existsSync(join(noBase, "dist", "feed.xml"))) {
    throw new Error("§29.1: an Article/BlogPosting page with no --base-url must not generate a feed — unify does not know the site's address");
  }

  // 3. Both together.
  const both = mkTmp();
  writeTree(join(both, "src"), { "index.html": page("Home"), "post.html": article });
  const c = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], both);
  expectExit(c, 0, "both conditions");
  if (!existsSync(join(both, "dist", "feed.xml"))) {
    throw new Error("§29.1: --base-url plus a declaring page must generate feed.xml — those two conditions are the whole opt-in");
  }
  covers("FEED-01");
}, TEST_MS);

// ------------------------------------------------------------------- §29.2

test("FEED-02: the document is Atom at output-root feed.xml; an authored offset ships verbatim, never normalized to Z or midnight", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "post.html": post("A Post", { type: "Article", date: "2026-07-04T15:30:00+02:00" }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "atom build");
  const xml = read(tmp, "dist", "feed.xml");
  if (!/<feed\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2005\/Atom"/.test(xml)) {
    throw new Error(`§29.2: the root element must be <feed xmlns="http://www.w3.org/2005/Atom">.\n${xml}`);
  }
  if (!xml.includes("2026-07-04T15:30:00+02:00")) {
    throw new Error(`§29.2/§20.10: an authored non-Z offset must be emitted verbatim — Atom's date construct is RFC 3339, so a time-bearing iso is already conforming and is not rewritten.\n${xml}`);
  }
  if (existsSync(join(tmp, "dist", "atom.xml"))) {
    throw new Error("§29.2: the document is named feed.xml, not atom.xml");
  }
  covers("FEED-02");
}, TEST_MS);

// ------------------------------------------------------------------- §29.3 / A17

test("A17/FEED-03: a day-only datePublished draws the advisory and is excluded from feed.xml; the same page with a full instant is included — and the feed never manufactures midnight", async () => {
  // The literal fixture from §29.3's own worked example: src/posts/hello.md,
  // date: 2026-01-02. Activation is MEMBERSHIP (§29.1), so this single
  // BlogPosting page — whose only candidate fails §29.3's date rule — leaves
  // no entry, and no feed is written at all.
  //
  // That is the third answer to a question with only two bad ones. RFC 4287
  // §4.1.1 requires atom:updated on every feed and §29.5 defines it as the
  // newest entry's, so a zero-entry feed can only be emitted invalid or
  // filled with an invented instant — and §6.1 forbids the second. Writing
  // nothing is honest, and A17 below is what tells the author why.
  const dayOnly = mkTmp();
  writeTree(join(dayOnly, "src"), {
    "index.html": page("Home"),
    "posts/hello.md": "---\ntitle: Hello\nschema: BlogPosting\ndate: 2026-01-02\n---\n\n# Hello\n\nSome words.\n",
  });
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], dayOnly);
  expectExit(a, 0, "an advisory never blocks a publish");
  if (existsSync(join(dayOnly, "dist", "feed.xml"))) {
    // The trap, and the reason this asserts absence rather than emptiness: an
    // implementation that manufactured midnight would produce a perfectly
    // well-formed one-entry feed here and pass every "the entry exists" test.
    const badXml = read(dayOnly, "dist", "feed.xml");
    throw new Error(
      `§29.1: no page is an entry, so no feed is written — RFC 4287 requires atom:updated ` +
      `and there is no newest entry to read it from.\n${badXml}`,
    );
  }
  // §14.1's stable contract is the FILE:LINE:SEVERITY: prefix and the shape
  // (continuation lines, "fix:"); the prose after it is explicitly marked
  // illustrative, so this checks the stable parts: the exact prefix with NO
  // line number (a manifest-derived fact has no line to report — §14.1's
  // omit-rather-than-guess rule), that the raw authored value is quoted,
  // that feed.xml is named, and that a "fix:" line proposes a corrected
  // instant for the SAME date rather than a different one.
  const prefixLine = a.stderr.split("\n").find((l) => l.startsWith("src/posts/hello.md:"));
  if (!prefixLine || !prefixLine.startsWith("src/posts/hello.md: advisory: ")) {
    throw new Error(`§14.1/A17: expected an advisory at "src/posts/hello.md: advisory: " with no line number.\nstderr:\n${a.stderr}`);
  }
  if (!prefixLine.includes('"2026-01-02"')) {
    throw new Error(`§29.3: the advisory must quote the value the author wrote.\n${prefixLine}`);
  }
  if (!prefixLine.includes("feed.xml")) {
    throw new Error(`§29.3: the advisory must say this page is not in feed.xml.\n${prefixLine}`);
  }
  const fixLine = a.stderr.split("\n").find((l) => l.trim().startsWith("fix:") && l.includes("2026-01-02T"));
  if (!fixLine) {
    throw new Error(`§29.3: expected a "fix:" continuation line proposing a corrected instant for the same date (2026-01-02T…).\nstderr:\n${a.stderr}`);
  }

  // Positive control: the identical page, with a time and offset.
  const withTime = mkTmp();
  writeTree(join(withTime, "src"), {
    "index.html": page("Home"),
    "posts/hello.md": "---\ntitle: Hello\nschema: BlogPosting\ndate: 2026-01-02T09:00:00Z\n---\n\n# Hello\n\nSome words.\n",
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], withTime);
  expectExit(b, 0, "clean build");
  if (b.stderr.trim() !== "") {
    throw new Error(`§29.3: a usable instant must draw no advisory.\nstderr:\n${b.stderr}`);
  }
  const goodXml = read(withTime, "dist", "feed.xml");
  const goodEntries = feedEntries(goodXml);
  if (goodEntries.length !== 1) {
    throw new Error(`§29.4: exactly one entry expected once the date carries a time.\n${goodXml}`);
  }
  if (tagText(goodEntries[0], "published") !== "2026-01-02T09:00:00Z") {
    throw new Error(`§29.5: <published> must be the authored instant, verbatim.\n${goodXml}`);
  }
  if (goodXml.includes("T00:00:00")) {
    throw new Error(`§29.3: still no manufactured midnight anywhere, now that the page IS an entry.\n${goodXml}`);
  }
  covers("A17", "FEED-03");
}, TEST_MS);

// ------------------------------------------------------------------- §29.4 (membership)

test("FEED-03: membership requires the declared type, indexable, and self-canonical — nofollow alone does not exclude", async () => {
  const tmp = mkTmp();
  const when = "2026-02-01T09:00:00Z";
  writeTree(join(tmp, "src"), {
    "index.html": post("Home", { type: "Article", date: when }),
    "hidden.html": post("Hidden Post", { type: "BlogPosting", date: when, robots: "noindex" }),
    "nofollow.html": post("Nofollow Post", { type: "Article", date: when, robots: "nofollow" }),
    "consolidated.html": post("Consolidated Post", { type: "BlogPosting", date: when, canonical: "/index.html" }),
    "selfcanon.html": post("Self Canonical Post", { type: "Article", date: when, canonical: "/selfcanon.html" }),
    "webpage.html": post("Web Page Type", { type: "WebPage", date: when }),
    "noschema.html": page("No Schema Post", "<h1>No Schema Post</h1>", `<meta name="date" content="${when}">\n`),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "membership build");
  const xml = read(tmp, "dist", "feed.xml");
  const titles = feedEntries(xml).map((e) => tagText(e, "title")).sort();
  const expected = ["Home", "Nofollow Post", "Self Canonical Post"].sort();
  if (JSON.stringify(titles) !== JSON.stringify(expected)) {
    throw new Error(
      `§29.4: expected entries {${expected.join(", ")}} — noindex/consolidated/WebPage/no-schema excluded, nofollow and self-canonical kept — got {${titles.join(", ")}}.\n${xml}`,
    );
  }
  covers("FEED-03");
}, TEST_MS);

// ------------------------------------------------------------------- §29.4 (ordering, ties, determinism)

test("FEED-03: entries order by datePublished descending, ties break by output path ascending, and two builds are byte-identical", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "post-a.html": post("Post A", { date: "2026-01-10T10:00:00Z" }),
    "post-b.html": post("Post B", { date: "2026-03-10T10:00:00Z" }),
    "post-c.html": post("Post C", { date: "2026-08-10T10:00:00Z" }),
    "tied-1.html": post("Tied One", { date: "2026-05-10T10:00:00Z" }),
    "tied-2.html": post("Tied Two", { date: "2026-05-10T10:00:00Z" }),
  });
  const first = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(first, 0, "first build");
  const xml1 = read(tmp, "dist", "feed.xml");
  const order = feedEntries(xml1).map((e) => tagText(e, "title"));
  const expectedOrder = ["Post C", "Tied One", "Tied Two", "Post B", "Post A"];
  if (JSON.stringify(order) !== JSON.stringify(expectedOrder)) {
    throw new Error(
      `§29.4: expected order ${JSON.stringify(expectedOrder)} (descending datePublished; the tie between Tied One/Two breaks by output path ascending — tied-1.html < tied-2.html), got ${JSON.stringify(order)}.\n${xml1}`,
    );
  }
  const second = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(second, 0, "second build");
  const xml2 = read(tmp, "dist", "feed.xml");
  expectBytes(xml2, xml1, "§29.4: two builds of one tree must produce byte-identical feeds");
  covers("FEED-03");
}, TEST_MS);

// ------------------------------------------------------------------- §29.5 (element table)

test("FEED-04: feed-level id/title/updated/links, and an entry's id is its canonical — authored, or completed by --canonical auto — never a bare url", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": post("Home Post", {
      type: "BlogPosting",
      date: "2026-02-01T09:00:00Z",
      lastmod: "2026-02-15T10:00:00Z",
      description: "Home desc",
      author: "Ada Lovelace",
      canonical: "/index.html", // authored, differs from the natural url ("/") — §20.5 drops a trailing index.html
    }),
    "second.html": post("Second Post", {
      type: "Article",
      date: "2026-04-05T08:00:00Z",
      lastmod: "2026-04-20", // a valid W3C-DTF day, but carries no TIME
    }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(r, 0, "element-table build");
  const xml = read(tmp, "dist", "feed.xml");
  const header = feedHeader(xml);

  if (tagText(header, "id") !== BASE) {
    throw new Error(`§29.5: feed <id> must be --base-url exactly as given.\ngot: ${JSON.stringify(tagText(header, "id"))}`);
  }
  if (tagText(header, "title") !== "Home Post") {
    throw new Error(`§29.5: feed <title> must be the root page's (index.html) <title>.\ngot: ${JSON.stringify(tagText(header, "title"))}`);
  }
  if (linkHref(header, "self") !== `${BASE}feed.xml`) {
    throw new Error(`§29.5: <link rel="self"> must be the feed's own absolute URL.\ngot: ${JSON.stringify(linkHref(header, "self"))}`);
  }
  if (linkHref(header, "alternate") !== BASE) {
    throw new Error(`§29.5: feed-level <link rel="alternate"> must be the site's own address.\ngot: ${JSON.stringify(linkHref(header, "alternate"))}`);
  }

  const entries = feedEntries(xml);
  if (entries.length !== 2) throw new Error(`expected 2 entries, got ${entries.length}\n${xml}`);
  const byTitle = Object.fromEntries(entries.map((e) => [tagText(e, "title"), e]));

  const home = byTitle["Home Post"];
  if (!home) throw new Error(`missing the Home Post entry\n${xml}`);
  if (tagText(home, "id") !== `${BASE}index.html`) {
    throw new Error(`§29.5: <id> must be the authored canonical (/index.html → ${BASE}index.html) — never record.url (${BASE}).\ngot: ${JSON.stringify(tagText(home, "id"))}`);
  }
  if (linkHref(home, "alternate") !== tagText(home, "id")) {
    throw new Error(`§29.5: an entry's <link rel="alternate"> must be the same URL as <id>.\n${xml}`);
  }
  if (tagText(home, "updated") !== "2026-02-15T10:00:00Z") {
    throw new Error(`§29.5: <updated> must prefer dateModified.iso when it carries a time.\ngot: ${JSON.stringify(tagText(home, "updated"))}`);
  }
  if (tagText(home, "published") !== "2026-02-01T09:00:00Z") {
    throw new Error(`§29.5: <published> is always datePublished.iso.\ngot: ${JSON.stringify(tagText(home, "published"))}`);
  }
  if (!hasAttr(home, "summary", "type", "text") || tagText(home, "summary") !== "Home desc") {
    throw new Error(`§29.5: <summary type="text"> must carry record.description.\n${home}`);
  }
  const authorBlock = tagText(home, "author");
  if (authorBlock === null || tagText(authorBlock, "name") !== "Ada Lovelace") {
    throw new Error(`§29.5: <author><name> must carry record.author.\n${home}`);
  }
  if (tagText(home, "content") !== null) {
    throw new Error(`§29.6: without --feed-full there must be no <content>.\n${home}`);
  }

  const second = byTitle["Second Post"];
  if (!second) throw new Error(`missing the Second Post entry\n${xml}`);
  if (tagText(second, "id") !== `${BASE}second.html`) {
    throw new Error(`§29.5/§22: with no authored canonical, --canonical auto completes one before §20's manifest is derived, and <id> follows it.\ngot: ${JSON.stringify(tagText(second, "id"))}`);
  }
  if (tagText(second, "updated") !== "2026-04-05T08:00:00Z") {
    throw new Error(
      `§29.5: dateModified (2026-04-20) is a valid date but carries no TIME, so it must not be used for <updated> — it falls back to datePublished.iso.\ngot: ${JSON.stringify(tagText(second, "updated"))}`,
    );
  }
  if (tagText(second, "summary") !== null) {
    throw new Error(`§29.5: <summary> must be omitted when description is null.\n${second}`);
  }
  if (tagText(second, "author") !== null) {
    throw new Error(`§29.5: <author> must be omitted when record.author is null.\n${second}`);
  }

  if (tagText(header, "updated") !== tagText(second, "updated")) {
    throw new Error(`§29.5: feed <updated> must be the newest entry's (Second Post has the later datePublished) <updated>.\n${xml}`);
  }
  covers("FEED-04");
}, TEST_MS);

test("FEED-04: a URL needing both percent-encoding and XML-escaping gets both, in <id> and <link>", async () => {
  // Percent-encoding covers everything derived from an output path (§20.5);
  // the only route left for a raw & is the base-url prefix, which §20.5
  // deliberately does not re-encode (mirrors sitemap.test.js's own two SIT-03
  // tests, combined here into one URL as FEED-04 asks).
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "two words.html": post("Spaced Post", { type: "Article", date: "2026-06-01T09:00:00Z" }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/a&b/"], tmp);
  expectExit(r, 0, "encoding build");
  const xml = read(tmp, "dist", "feed.xml");
  const entries = feedEntries(xml);
  if (entries.length !== 1) throw new Error(`expected 1 entry, got ${entries.length}\n${xml}`);
  const expected = "https://example.com/a&amp;b/two%20words.html";
  if (tagText(entries[0], "id") !== expected) {
    throw new Error(`§29.5/§20.5/§21.3: <id> must be percent-encoded (the space) AND XML-escaped (the base-url's raw &), both.\nexpected: ${expected}\ngot: ${JSON.stringify(tagText(entries[0], "id"))}`);
  }
  if (linkHref(entries[0], "alternate") !== expected) {
    throw new Error(`§29.5: <link rel="alternate"> must be the same URL as <id>.\n${xml}`);
  }
  covers("FEED-04");
}, TEST_MS);

// ------------------------------------------------------------------- §29.6 (--feed-full)

test("FEED-05: --feed-full is a usage error without --base-url; with --base-url it is accepted", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page("Home") });
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--feed-full"], tmp);
  if (a.exit !== 2) {
    throw new Error(`§29.6: --feed-full without --base-url must be a usage error (exit 2), for §22.1's reason — it describes something the build will not do. Got exit ${a.exit}.\nstdout:\n${a.stdout}\nstderr:\n${a.stderr}`);
  }
  if (existsSync(join(tmp, "dist"))) {
    throw new Error("§14.1: exit 2 is invalid usage — nothing should be written");
  }
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--feed-full"], tmp);
  expectExit(b, 0, "--feed-full with --base-url is accepted (even with nothing for it to enrich)");
  covers("FEED-05");
}, TEST_MS);

test('FEED-05: --feed-full puts the emitted <main>\'s inner HTML in <content type="html">; without the flag, entries carry only <summary>', async () => {
  const tmp = mkTmp();
  const body = "<main>\n<h1>Full Post</h1>\n<p>Body <em>content</em> marker-9f21.</p>\n</main>";
  writeTree(join(tmp, "src"), {
    "index.html": page("Home"),
    "post.html": page("Full Post", body, `<meta name="schema" content="Article">\n<meta name="date" content="2026-07-01T09:00:00Z">\n<meta name="description" content="Desc">\n`),
  });

  const plain = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(plain, 0, "plain build");
  const plainEntry = feedEntries(read(tmp, "dist", "feed.xml"))[0];
  if (tagText(plainEntry, "content") !== null) {
    throw new Error(`§29.6: without --feed-full, no entry may carry <content>.\n${plainEntry}`);
  }
  if (tagText(plainEntry, "summary") !== "Desc") {
    throw new Error(`§29.5: <summary> must still carry the description.\n${plainEntry}`);
  }

  const full = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--feed-full"], tmp);
  expectExit(full, 0, "feed-full build");
  const fullEntry = feedEntries(read(tmp, "dist", "feed.xml"))[0];
  const rawContent = tagText(fullEntry, "content");
  if (rawContent === null) {
    throw new Error(`§29.6: --feed-full must put the page body in <content type="html">.\n${fullEntry}`);
  }
  if (!hasAttr(fullEntry, "content", "type", "html")) {
    throw new Error(`§29.5: <content type="html"> — the type attribute is part of the contract.\n${fullEntry}`);
  }
  const decoded = unwrapXmlText(rawContent);
  if (!decoded.includes("marker-9f21") || !decoded.includes("<em>content</em>")) {
    throw new Error(`§29.6: <content> must carry <main>'s inner HTML as MARKUP (the <em> must survive), not flattened text.\nraw: ${rawContent}\ndecoded: ${decoded}`);
  }
  if (tagText(fullEntry, "summary") !== "Desc") {
    throw new Error(`§29.5: <summary> is independent of --feed-full and must still carry the description.\n${fullEntry}`);
  }
  covers("FEED-05");
}, TEST_MS);

// ------------------------------------------------------------------- §29.7 (references, suppression, blog template)

test("FEED-06: an authored feed.xml suppresses generation and ships byte-for-byte when clean; a broken internal reference in one is still P13, located at the feed", async () => {
  const clean = mkTmp();
  const authored =
    '<?xml version="1.0"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n' +
    "<id>https://example.com/</id>\n<title>Hand Written</title>\n<updated>2026-01-01T09:00:00Z</updated>\n" +
    '<entry><id>https://example.com/index.html</id><title>Home</title>' +
    '<link rel="alternate" href="https://example.com/index.html"/><updated>2026-01-01T09:00:00Z</updated></entry>\n' +
    "</feed>\n";
  writeTree(join(clean, "src"), {
    "index.html": page("Home"),
    "post.html": post("A Post", { date: "2026-01-05T09:00:00Z" }), // would otherwise activate generation
    "feed.xml": authored,
  });
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], clean);
  expectExit(a, 0, "authored-feed build");
  expectBytes(read(clean, "dist", "feed.xml"), authored, "§29.7: the author's file is the site's feed — never overwritten, never merged into, even though an Article page would otherwise trigger generation");

  const broken = mkTmp();
  const brokenFeed =
    '<?xml version="1.0"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n' +
    "<id>https://example.com/</id><title>Mine</title><updated>2026-01-01T09:00:00Z</updated>\n" +
    '<entry><id>https://example.com/gone.html</id><title>Gone</title>' +
    '<link rel="alternate" href="https://example.com/gone.html"/><updated>2026-01-01T09:00:00Z</updated></entry>\n' +
    "</feed>\n";
  writeTree(join(broken, "src"), {
    "index.html": page("Home"),
    "post.html": post("A Post", { date: "2026-01-05T09:00:00Z" }),
    "feed.xml": brokenFeed,
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], broken);
  if (b.exit !== 1) {
    throw new Error(`§29.7: a broken internal reference in an authored feed.xml must block the publish (P13), exactly as §21.6 checks a sitemap's. Got exit ${b.exit}.\nstderr:\n${b.stderr}`);
  }
  if (!b.stderr.includes("feed.xml") || !b.stderr.includes("gone.html")) {
    throw new Error(`§29.7: expected a problem located at feed.xml naming gone.html.\nstderr:\n${b.stderr}`);
  }
  if (existsSync(join(broken, "dist"))) {
    throw new Error("§15: a P13 blocks publish — nothing ships, sitemap/feed included");
  }
  covers("FEED-06");
}, TEST_MS);

test("FEED-06: unify init blog ships its own feed.xml, and building/auditing it under --base-url stays clean", async () => {
  const tmp = mkTmp();
  const initR = await runCli(["init", "blog"], tmp);
  expectExit(initR, 0, "init blog");
  if (!existsSync(join(tmp, "src", "feed.xml"))) {
    throw new Error("§19.6/§29.7: the blog template ships its own pre-generated feed.xml — the scaffold that teaches feeds is also the fixture that proves the suppression");
  }
  const authored = read(tmp, "src", "feed.xml");

  // Not --strict here: whether A17 fires for a page whose feed.xml is
  // authored (generation, and so §29.4's membership computation, suppressed
  // entirely) is not settled by §29's text either way — see the written
  // report. A plain (non-strict) clean build/audit is true under either
  // reading, since advisories never block a publish regardless of --strict,
  // and it is the literal claim FEED-06 makes ("still builds and audits
  // clean").
  const buildR = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(buildR, 0, "blog template build under --base-url");
  expectBytes(read(tmp, "dist", "feed.xml"), authored, "§29.7: the template's own feed.xml ships byte-for-byte; generation is suppressed even though the template's posts declare BlogPosting");

  const auditR = await runCli(["audit", "-s", "src", "--base-url", BASE], tmp);
  if (auditR.exit !== 0) {
    throw new Error(`§29.7: unify init blog must audit clean under --base-url too.\nexit: ${auditR.exit}\nstdout:\n${auditR.stdout}\nstderr:\n${auditR.stderr}`);
  }
  covers("FEED-06");
}, TEST_MS);
