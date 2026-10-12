/**
 * `generator-recipes.test.js` — every literal in `docs/guides/generator-recipes.md`.
 *
 * The guide, like `docs/integrations.md`, opens by claiming that every literal
 * in it is tested. As there, the literals are EXTRACTED FROM THE DOCUMENT
 * (`codeBlock()` reads a fenced block by its position in its section), not
 * retyped: a test that retyped them would pass forever while the guide rotted
 * beside it. The two generators run as the guide prints them, through
 * `generate:` in a project-root `unify.yaml` over a `site/` directory, which is
 * the layout the guide says it assumes. The guide's printed OUTPUTS — the two
 * versioned tags, the whole `rss.xml` — are compared against what the build
 * actually wrote.
 *
 * What is checked is every claim the guide makes ABOUT UNIFY: that the version
 * is the file's bytes (same bytes, same URL; other bytes, other URL; a rebuild
 * under watch re-derives it), that the file ships untouched and the query
 * string does not hide a missing file from the reference check; that the feed
 * is well-formed and escaped, that a day-only date draws no `<pubDate>` while
 * a full timestamp keeps its instant, that the item links are the sitemap's
 * own addresses plain, pretty and under a subpath, that a feed named
 * `feed.xml` replaces unify's own (and its A17) while `rss.xml` sits beside
 * it, and exactly how much of each is checked. A stand-in for somebody else's
 * file — an Atom feed with a broken entry link — is written by a tiny
 * generator visible in the test, not hidden in a fixture.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLI, ROOT, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const DOC = readFileSync(join(ROOT, "docs", "guides", "generator-recipes.md"), "utf8");

const CACHE = "Cache-busting URLs";
const RSS = "An RSS feed";

/**
 * The nth fenced code block of the given language inside the named `##`
 * section, verbatim.
 * @param {string} heading - the section's `## ` heading text
 * @param {string} lang - the fence's language tag
 * @param {number} nth - 0-based
 */
function codeBlock(heading, lang, nth = 0) {
  const start = DOC.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`generator-recipes.md has no section "## ${heading}"`);
  const after = DOC.indexOf("\n## ", start + 1);
  const section = DOC.slice(start, after < 0 ? DOC.length : after);
  const blocks = [...section.matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);
  if (!blocks[nth]) throw new Error(`generator-recipes.md "${heading}" has no ${lang} block #${nth} (found ${blocks.length})`);
  return blocks[nth];
}

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

const read = (...parts) => readFileSync(join(...parts), "utf8");

const doc = (title, body, head = "") =>
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title><meta name="description" content="The ${title} page.">${head}</head>
<body>${body}</body>
</html>
`;

const layout = (headExtra) =>
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Notes</title>
  ${headExtra}
</head>
<body><main></main></body>
</html>
`;

// ------------------------------------------------------ cache-busting URLs

const CSS = "body{color:#333}\n";
const JS = 'console.log("hello");\n';

function cacheProject(tmp, { css = CSS, js = JS, extra = {} } = {}) {
  writeTree(tmp, {
    "unify.yaml": "source: site\ngenerate: scripts/cache-bust.mjs\n",
    "scripts/cache-bust.mjs": codeBlock(CACHE, "js", 0),
    "site/_layout.html": layout(codeBlock(CACHE, "html", 0).trim()),
    "site/index.html": doc("Home", "<h1>Home</h1>"),
    "site/assets/style.css": css,
    "site/assets/app.js": js,
    ...extra,
  });
}

const sha8 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 8);

test("cache-busting — the page carries the guide's versioned tags (plain, pretty, under a subpath), the files ship untouched, and the fragment does not publish", async () => {
  const shown = codeBlock(CACHE, "html", 1).trim().split("\n");
  if (shown.length !== 2) throw new Error(`the guide shows the two tags it generates:\n${shown.join("\n")}`);
  const variants = [
    { args: [], tags: shown.map((t) => t.replaceAll("/sub/", "/")) },
    { args: ["--pretty-urls"], tags: shown.map((t) => t.replaceAll("/sub/", "/")) },
    { args: ["--base-url", "https://example.com/sub/"], tags: shown },
    { args: ["--base-url", "https://example.com/sub/", "--pretty-urls"], tags: shown },
  ];
  for (const v of variants) {
    const tmp = mkTmp();
    cacheProject(tmp);
    const r = await runCli(["build", "-o", "dist", "--strict", ...v.args], tmp);
    expectExit(r, 0, `the guide's cache-busting generator with [${v.args.join(" ")}]`);
    const html = read(tmp, "dist", "index.html");
    for (const tag of v.tags) {
      if (!html.includes(tag)) throw new Error(`[${v.args.join(" ")}] the page must carry ${tag}\n${html}`);
    }
    // "ships byte-for-byte at its source path"
    if (read(tmp, "dist", "assets", "style.css") !== CSS) throw new Error("style.css must ship byte-for-byte");
    if (read(tmp, "dist", "assets", "app.js") !== JS) throw new Error("app.js must ship byte-for-byte");
    // "being under _includes/, it is never published"
    if (existsSync(join(tmp, "dist", "_includes"))) throw new Error("the generated fragment must not publish");
  }
}, TEST_MS);

test("cache-busting — the version is the file's bytes: identical builds agree, a changed byte changes only that URL", async () => {
  const one = mkTmp();
  const two = mkTmp();
  cacheProject(one);
  cacheProject(two);
  expectExit(await runCli(["build", "-o", "dist"], one), 0, "first build");
  expectExit(await runCli(["build", "-o", "dist"], two), 0, "second build, another directory");
  // "the same bytes give the same URL on the next build, on another machine"
  if (read(one, "dist", "index.html") !== read(two, "dist", "index.html")) {
    throw new Error("the same bytes must give the same page, wherever the project sits");
  }
  expectExit(await runCli(["build", "-o", "dist"], one), 0, "rebuild of the first project");
  if (read(one, "dist", "index.html") !== read(two, "dist", "index.html")) throw new Error("a rebuild must not change the URLs");

  const edited = "body{color:#334}\n";
  writeFileSync(join(two, "site", "assets", "style.css"), edited);
  expectExit(await runCli(["build", "-o", "dist"], two), 0, "build after editing style.css");
  const html = read(two, "dist", "index.html");
  const want = [`/assets/style.css?v=${sha8(edited)}`, `/assets/app.js?v=${sha8(JS)}`];
  for (const w of want) if (!html.includes(w)) throw new Error(`expected ${w} after the edit\n${html}`);
  if (sha8(edited) === sha8(CSS)) throw new Error("the fixture edit must change the hash");
  if (html.includes(`style.css?v=${sha8(CSS)}`)) throw new Error("the old stylesheet URL must be gone");
}, TEST_MS);

test("cache-busting — the reference check ignores the query string but still needs the file", async () => {
  const tmp = mkTmp();
  cacheProject(tmp, {
    extra: { "site/gone.html": doc("Gone", '<h1>Gone</h1>', '<link rel="stylesheet" href="/assets/missing.css?v=0039f158">') },
  });
  const r = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r, 1, "a versioned URL naming a file that does not exist");
  if (!r.stderr.includes("missing.css")) throw new Error(`the problem must name the missing file:\n${r.stderr}`);
  if (existsSync(join(tmp, "dist"))) throw new Error("a reference problem blocks the publish");
}, TEST_MS);

test("cache-busting — a misspelled path stops the build in the generator, and nothing publishes", async () => {
  const tmp = mkTmp();
  // The guide: "Keep the line for each file you have" — a line for a file the
  // site does not have is the misspelled path.
  cacheProject(tmp);
  writeTree(tmp, { "scripts/cache-bust.mjs": codeBlock(CACHE, "js", 0).replace('v("assets/app.js")', 'v("assets/apps.js")') });
  const r = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r, 1, "a generator reading a file that is not there");
  if (!r.stderr.includes("apps.js")) throw new Error(`the generator's own error must reach the author:\n${r.stderr}`);
  if (existsSync(join(tmp, "dist"))) throw new Error("nothing publishes when the generator fails");
}, TEST_MS);

test("cache-busting — under unify watch, saving the stylesheet changes its URL on the rebuild", async () => {
  const tmp = mkTmp();
  cacheProject(tmp);
  const proc = spawn(process.execPath, [CLI, "watch"], { cwd: tmp, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d; });
  const waitFor = async (predicate, what) => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        const text = read(tmp, "dist", "index.html");
        if (predicate(text)) return text;
      } catch { /* not built yet */ }
      if (Date.now() >= deadline) throw new Error(`timed out waiting for ${what}\n${stderr}`);
      await new Promise((res) => setTimeout(res, 25));
    }
  };
  try {
    await waitFor((t) => t.includes(`style.css?v=${sha8(CSS)}`), "the first build");
    const edited = "body{color:#335}\n";
    writeFileSync(join(tmp, "site", "assets", "style.css"), edited);
    await waitFor((t) => t.includes(`style.css?v=${sha8(edited)}`), "the rebuild to re-run the generator");
  } finally {
    proc.kill("SIGTERM");
    await new Promise((res) => {
      if (proc.exitCode !== null || proc.signalCode !== null) return res();
      const t = setTimeout(() => { try { proc.kill("SIGKILL"); } catch { /* gone */ } res(); }, 5000);
      proc.once("close", () => { clearTimeout(t); res(); });
    });
  }
}, TEST_MS);

// ------------------------------------------------------------- an RSS feed

const BASE = "https://example.com/sub/";
const ALTERNATE = codeBlock(RSS, "html", 0).trim();

/** A markdown post; `fm` lines are written as given, so a test controls quoting. */
const post = (fm) => `---\n${fm.join("\n")}\nlang: en\n---\n# Post\n\nBody.\n`;

/** The two posts the guide's printed feed was made from. */
const GUIDE_POSTS = {
  "site/posts/one.md": post(['title: "Fish & Chips <tasty>"', "description: Friday supper, reviewed.", "date: 2026-03-04"]),
  "site/posts/two.md": post(["title: Two Weeks Of Rain", "description: What the gauge said.", "date: 2026-03-05T21:30:00+02:00"]),
};

function rssProject(tmp, { posts = GUIDE_POSTS, generator = codeBlock(RSS, "js", 0), head = ALTERNATE, extra = {} } = {}) {
  writeTree(tmp, {
    "unify.yaml": "source: site\ngenerate: scripts/rss.mjs\n",
    "scripts/rss.mjs": generator,
    "site/_layout.html": layout(head),
    "site/index.html": doc("Home", "<h1>Home</h1>"),
    ...posts,
    ...extra,
  });
}

/**
 * Minimal XML 1.0 well-formedness: one root, balanced tags, quoted attributes,
 * and every `&` in text beginning a real entity. Bun ships no XML parser and
 * a behavior test may not import one from `src/**`; this is as much of the
 * spec as the guide's claim ("stays well-formed") needs. Returns the first
 * fault as text, or null.
 * @param {string} xml
 */
function wellFormedFault(xml) {
  const body = xml.replace(/^<\?xml[^>]*\?>\n?/, "");
  const token = /<(\/?)([A-Za-z_][\w.-]*)((?:[ ]+[A-Za-z_][\w.-]*="[^"<&]*")*)[ ]*(\/?)>|([^<]+)/y;
  const stack = [];
  let roots = 0;
  let at = 0;
  while (at < body.length) {
    token.lastIndex = at;
    const m = token.exec(body);
    if (!m) return `unparseable markup at offset ${at}: ${JSON.stringify(body.slice(at, at + 40))}`;
    at = token.lastIndex;
    if (m[5] !== undefined) {
      if (stack.length === 0) {
        if (m[5].trim() !== "") return "text outside the root element";
      } else if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5]) || m[5].includes("]]>")) {
        return `unescaped text: ${JSON.stringify(m[5])}`;
      }
      continue;
    }
    const [, closing, tag, , selfClosing] = m;
    if (closing) {
      if (stack.pop() !== tag) return `</${tag}> does not close the open element`;
    } else {
      if (stack.length === 0 && ++roots > 1) return "more than one root element";
      if (!selfClosing) stack.push(tag);
    }
  }
  if (stack.length) return `<${stack.at(-1)}> is never closed`;
  return roots === 1 ? null : "no root element";
}

const unescapeXml = (s) =>
  s.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");

/** Every `<tag>text</tag>` value in document order. */
const textsOf = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((m) => m[1]);
const itemsOf = (xml) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

test("rss — the guide's printed feed is exactly what the build writes, shipped untouched and linked from the layout", async () => {
  const tmp = mkTmp();
  rssProject(tmp);
  const r = await runCli(["build", "-o", "dist", "--base-url", BASE, "--pretty-urls", "--strict"], tmp);
  expectExit(r, 0, "the guide's RSS generator, strict");
  const printed = codeBlock(RSS, "xml", 0);
  const written = read(tmp, "dist", "rss.xml");
  if (written !== printed) throw new Error(`the guide's printed rss.xml is not what the build wrote.\n--- printed\n${printed}\n--- written\n${written}`);
  const fault = wellFormedFault(written);
  if (fault) throw new Error(`rss.xml is not well-formed: ${fault}\n${written}`);
  // "--base-url prefixes it": the layout's alternate link is an ordinary link.
  const home = read(tmp, "dist", "index.html");
  if (!home.includes(ALTERNATE.replace('href="/rss.xml"', 'href="/sub/rss.xml"'))) {
    throw new Error(`the layout's alternate link must be prefixed by --base-url:\n${home}`);
  }
  // Two builds, one file: nothing in it comes from the clock.
  const again = mkTmp();
  rssProject(again);
  expectExit(await runCli(["build", "-o", "dist", "--base-url", BASE, "--pretty-urls"], again), 0, "second build");
  if (read(again, "dist", "rss.xml") !== written) throw new Error("two builds of the same source must write the same feed");
  if (written.includes("lastBuildDate")) throw new Error("the guide says there is no lastBuildDate");
}, TEST_MS);

test("rss — text is escaped: a title and description full of markup round-trip through the XML", async () => {
  const title = `Tom & Jerry's <b>"bold"</b> ]]> &amp; more`;
  const description = `5 < 6 & 7 > 6, "quoted" &lt;`;
  const tmp = mkTmp();
  rssProject(tmp, {
    posts: {
      // Single-quoted YAML scalars keep every character literal ('' is one quote).
      "site/posts/odd.md": post([`title: '${title.replaceAll("'", "''")}'`, `description: '${description.replaceAll("'", "''")}'`, "date: 2026-03-05T09:00:00Z"]),
    },
  });
  expectExit(await runCli(["build", "-o", "dist", "--base-url", BASE], tmp), 0, "a post with markup in its title");
  const xml = read(tmp, "dist", "rss.xml");
  const fault = wellFormedFault(xml);
  if (fault) throw new Error(`rss.xml is not well-formed: ${fault}\n${xml}`);
  const [item] = itemsOf(xml);
  const gotTitle = unescapeXml(textsOf(item, "title")[0]);
  const gotDescription = unescapeXml(textsOf(item, "description")[0]);
  if (gotTitle !== title) throw new Error(`title did not round-trip:\n${JSON.stringify(gotTitle)}\n${JSON.stringify(title)}`);
  if (gotDescription !== description) throw new Error(`description did not round-trip:\n${JSON.stringify(gotDescription)}\n${JSON.stringify(description)}`);
}, TEST_MS);

test("rss — dates are the code's decision: a day-only post has no pubDate, a timestamp keeps its instant, no date is no post", async () => {
  const tmp = mkTmp();
  rssProject(tmp, {
    posts: {
      "site/posts/day.md": post(["title: Day", "description: d", "date: 2026-03-04"]),
      "site/posts/utc.md": post(["title: Utc", "description: d", "date: 2026-03-05T09:00:00Z"]),
      "site/posts/offset.md": post(["title: Offset", "description: d", "date: 2026-03-05T21:30:00+02:00"]),
      "site/posts/nozone.md": post(["title: Nozone", "description: d", "date: 2026-03-05T21:30:00"]),
      "site/posts/nodate.md": post(["title: Nodate", "description: d"]),
      "site/notes/elsewhere.md": post(["title: Elsewhere", "description: d", "date: 2026-03-06T09:00:00Z"]),
    },
  });
  expectExit(await runCli(["build", "-o", "dist", "--base-url", BASE], tmp), 0, "a mix of dates");
  const xml = read(tmp, "dist", "rss.xml");
  const got = {};
  for (const i of itemsOf(xml)) got[textsOf(i, "title")[0]] = textsOf(i, "pubDate");
  const want = {
    Day: [], // a bare day names no instant
    Utc: ["Thu, 05 Mar 2026 09:00:00 GMT"],
    Offset: ["Thu, 05 Mar 2026 19:30:00 GMT"], // the same instant, in RFC 822
    Nozone: [], // a time with no zone is still not an instant
  };
  if (Object.keys(got).sort().join() !== Object.keys(want).sort().join()) {
    throw new Error(`only posts/ pages with a title and a date are items; got ${Object.keys(got).join(", ")}\n${xml}`);
  }
  for (const [title, pubDate] of Object.entries(want)) {
    if (JSON.stringify(got[title]) !== JSON.stringify(pubDate)) {
      throw new Error(`${title}: expected pubDate ${JSON.stringify(pubDate)}, got ${JSON.stringify(got[title])}\n${xml}`);
    }
  }
  // "Items run newest first by the date as written."
  const order = itemsOf(xml).map((i) => textsOf(i, "title")[0]).join(",");
  if (order !== "Offset,Nozone,Utc,Day") throw new Error(`items must run newest first by the date text:\n${order}`);
}, TEST_MS);

test("rss — every item link is the sitemap's own address for that page: plain, pretty, and under a subpath", async () => {
  const variants = [
    { args: ["--base-url", "https://example.com/"], prefix: "https://example.com/" },
    { args: ["--base-url", "https://example.com/", "--pretty-urls"], prefix: "https://example.com/" },
    { args: ["--base-url", BASE], prefix: BASE },
    { args: ["--base-url", BASE, "--pretty-urls"], prefix: BASE },
  ];
  for (const v of variants) {
    const tmp = mkTmp();
    rssProject(tmp, {
      extra: {
        "site/posts/index.html": doc("Posts", "<h1>Posts</h1>"), // a listing page: no date, so not an item
        "site/posts/series/index.md": post(["title: Series", "description: An index post.", "date: 2026-03-06T09:00:00Z"]),
        "site/posts/two words.md": post(["title: Spaced", "description: A name needing encoding.", "date: 2026-03-07T09:00:00Z"]),
      },
    });
    expectExit(await runCli(["build", "-o", "dist", ...v.args], tmp), 0, `build [${v.args.join(" ")}]`);
    const xml = read(tmp, "dist", "rss.xml");
    const locs = new Set(textsOf(read(tmp, "dist", "sitemap.xml"), "loc"));
    const links = itemsOf(xml).map((i) => textsOf(i, "link")[0]);
    if (links.length !== 4) throw new Error(`[${v.args.join(" ")}] four posts are items (the posts/ listing page has no date):\n${xml}`);
    for (const link of links) {
      if (!locs.has(link)) throw new Error(`[${v.args.join(" ")}] ${link} is not a sitemap <loc>; the sitemap has ${[...locs].join(" ")}`);
    }
    if (!links.every((l) => l.startsWith(v.prefix))) throw new Error(`[${v.args.join(" ")}] links must carry ${v.prefix}:\n${links.join("\n")}`);
    if (textsOf(xml, "link")[0] !== v.prefix) throw new Error(`[${v.args.join(" ")}] the channel link is the site address`);
  }
}, TEST_MS);

test("rss — without --base-url the generator stops the build with its own message, and nothing publishes", async () => {
  const tmp = mkTmp();
  rssProject(tmp);
  const r = await runCli(["build", "-o", "dist"], tmp);
  expectExit(r, 1, "an RSS generator with no site address");
  if (!r.stderr.includes("must be absolute")) throw new Error(`the generator's message must reach the author:\n${r.stderr}`);
  if (existsSync(join(tmp, "dist"))) throw new Error("nothing publishes when the generator fails");
}, TEST_MS);

// ------------------------------------------ which file name, and what is checked

const BLOG_POSTS = {
  "site/posts/day.md": post(["title: Day Post", "description: A day.", "schema: BlogPosting", "date: 2026-03-04"]),
  "site/posts/full.md": post(["title: Full Post", "description: An instant.", "schema: BlogPosting", "date: 2026-03-05T21:30:00+02:00"]),
};
const A17 = "names a day rather than an instant";

test("rss — rss.xml sits beside unify's Atom feed (and A17 still speaks); naming it feed.xml replaces that feed and silences A17", async () => {
  // Control: no generator at all. unify writes Atom, and says what it left out.
  const control = mkTmp();
  writeTree(control, {
    "site/_layout.html": layout(""),
    "site/index.html": doc("Home", "<h1>Home</h1>"),
    ...BLOG_POSTS,
  });
  const c = await runCli(["build", "-s", "site", "-o", "dist", "--base-url", BASE], control);
  expectExit(c, 0, "control: BlogPosting posts under --base-url");
  if (!read(control, "dist", "feed.xml").includes('<feed xmlns="http://www.w3.org/2005/Atom"')) throw new Error("control: unify writes an Atom feed.xml");
  if (!c.stderr.includes(A17)) throw new Error(`control: A17 names the day-only post:\n${c.stderr}`);

  // OUT = "rss.xml": both files exist; A17 is about the Atom file and still fires.
  const beside = mkTmp();
  rssProject(beside, { posts: BLOG_POSTS });
  const b = await runCli(["build", "-o", "dist", "--base-url", BASE], beside);
  expectExit(b, 0, "rss.xml beside the Atom feed");
  if (!read(beside, "dist", "feed.xml").includes("<feed xmlns=")) throw new Error("rss.xml must not displace unify's own feed.xml");
  if (!read(beside, "dist", "rss.xml").includes('<rss version="2.0">')) throw new Error("rss.xml must be the generator's feed");
  if (!b.stderr.includes(A17)) throw new Error(`A17 still describes the Atom feed:\n${b.stderr}`);

  // OUT = "feed.xml": the generator's file IS the feed.
  const replaced = mkTmp();
  const swapped = codeBlock(RSS, "js", 0).replace('const OUT = "rss.xml";', 'const OUT = "feed.xml";');
  if (swapped === codeBlock(RSS, "js", 0)) throw new Error("the guide's OUT line changed shape; update this test");
  rssProject(replaced, { posts: BLOG_POSTS, generator: swapped, head: ALTERNATE.replace("/rss.xml", "/feed.xml") });
  const f = await runCli(["build", "-o", "dist", "--base-url", BASE], replaced);
  expectExit(f, 0, "a generator-written feed.xml");
  const feed = read(replaced, "dist", "feed.xml");
  if (!feed.includes('<rss version="2.0">') || feed.includes("<feed")) throw new Error(`feed.xml must be the generator's RSS, not unify's Atom:\n${feed}`);
  if (existsSync(join(replaced, "dist", "rss.xml"))) throw new Error("OUT swapped: there is no rss.xml");
  if (f.stderr.includes(A17)) throw new Error(`A17 is a claim about a file unify wrote; it must be silent here:\n${f.stderr}`);
  // And it is the same file the build gave the generator's rss.xml, down to the bytes.
  if (feed !== read(beside, "dist", "rss.xml")) throw new Error("the same generator must write the same feed under either name");
}, TEST_MS);

test("rss — what unify checks: the layout link, and an Atom feed.xml's entry links; not an RSS feed.xml, not rss.xml", async () => {
  // The layout's link is checked like any link: swap the output name and leave it pointing at /rss.xml.
  const dangling = mkTmp();
  const swapped = codeBlock(RSS, "js", 0).replace('const OUT = "rss.xml";', 'const OUT = "feed.xml";');
  rssProject(dangling, { generator: swapped });
  const d = await runCli(["build", "-o", "dist", "--base-url", BASE], dangling);
  expectExit(d, 1, "a layout linking /rss.xml when only feed.xml is written");
  if (!d.stderr.includes("/rss.xml") || !d.stderr.includes("does not resolve")) throw new Error(`the dangling alternate link must be a reference problem:\n${d.stderr}`);

  // Stand-ins for the guide's claim about the rest, each with one broken internal URL.
  const gone = `${BASE}gone/`;
  const rssBody = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>T</title><link>${BASE}</link><description>D</description>
<item><title>Gone</title><link>${gone}</link><guid>${gone}</guid></item>
</channel></rss>
`;
  const atomBody = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><id>${BASE}</id><title>T</title><updated>2026-01-01T09:00:00Z</updated>
<entry><id>${gone}</id><title>Gone</title><link rel="alternate" href="${gone}"/><updated>2026-01-01T09:00:00Z</updated></entry>
</feed>
`;
  const writer = (name, body) =>
    `import { writeFileSync } from "node:fs";\nimport { join } from "node:path";\nwriteFileSync(join(process.argv[3], ${JSON.stringify(name)}), ${JSON.stringify(body)});\n`;
  const cases = [
    { name: "feed.xml", body: atomBody, exit: 1, what: "an Atom feed.xml from a generator is held to its entry links (P13, located at feed.xml)" },
    { name: "feed.xml", body: rssBody, exit: 0, what: "an RSS feed.xml's <link> is text, not an href: not read" },
    { name: "rss.xml", body: atomBody, exit: 0, what: "rss.xml is not a name unify reads, Atom-shaped or not" },
    { name: "rss.xml", body: rssBody, exit: 0, what: "rss.xml is not a name unify reads" },
  ];
  for (const c of cases) {
    const tmp = mkTmp();
    writeTree(tmp, {
      "unify.yaml": "source: site\ngenerate: scripts/stand-in.mjs\n",
      "scripts/stand-in.mjs": writer(c.name, c.body),
      "site/_layout.html": layout(""),
      "site/index.html": doc("Home", "<h1>Home</h1>"),
    });
    const r = await runCli(["build", "-o", "dist", "--base-url", BASE], tmp);
    expectExit(r, c.exit, c.what);
    if (c.exit === 1 && !(r.stderr.includes("feed.xml") && r.stderr.includes("gone/"))) {
      throw new Error(`${c.what}: the problem must be located at feed.xml and name the URL\n${r.stderr}`);
    }
  }
}, TEST_MS);
