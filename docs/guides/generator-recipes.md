---
description: "Two generators you own: a content hash in an asset's URL for cache-busting, and an RSS feed written from the source inventory."
---

# Two small generators: cache-busting URLs and an RSS feed

**Role**: Two recipes for the `--generate` seam, each the answer to a thing people ask the core to do — put a content hash in an asset's URL, and publish a feed in a format other than Atom. unify does neither, and does not need to: a generator you own does each in a screenful, and whatever it writes is composed, rewritten and checked like a file you typed. Read the `--generate` section of [the CLI reference](../cli-reference.md) first. Every literal below is tested (`tests/conformance/generator-recipes.test.js`); both assume the layout `unify init` scaffolds: content in `site/`, the generator in `scripts/` beside it, and `generate: scripts/<name>.mjs` in `unify.yaml`.

## Cache-busting URLs

A browser that cached `style.css` last week keeps using it after you change the file, because the address did not change. The cure is a version in the address, and the generator is the place to compute it: it runs on every build, it can read the files, and a fragment it writes reaches every page through the layout.

`scripts/cache-bust.mjs`:

```js
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , sourceRoot, overlay] = process.argv;
const v = (path) =>
  createHash("sha256").update(readFileSync(join(sourceRoot, path))).digest("hex").slice(0, 8);

mkdirSync(join(overlay, "_includes"), { recursive: true });
writeFileSync(join(overlay, "_includes/assets.html"),
  `<link rel="stylesheet" href="/assets/style.css?v=${v("assets/style.css")}">
<script src="/assets/app.js?v=${v("assets/app.js")}" defer></script>
`);
```

Keep the line for each file you have. The layout asks for the fragment in its `<head>`; being under `_includes/`, it is never published:

```html
<include src="/_includes/assets.html"></include>
```

With an `assets/style.css` holding `body{color:#333}` and an `assets/app.js` holding `console.log("hello");`, a build under `--base-url https://example.com/sub/` puts this in every page:

```html
<link rel="stylesheet" href="/sub/assets/style.css?v=0039f158">
<script src="/sub/assets/app.js?v=f9444510" defer></script>
```

- **The version is the file's bytes.** The same bytes give the same URL on the next build, on another machine, in CI; change one byte of `style.css` and only its URL changes. Every rebuild under `unify dev` and `watch` runs the generator again, so saving the stylesheet changes the URL on that rebuild.
- **Nothing else moves.** The file ships byte-for-byte at its source path, and the `href` is an ordinary link, prefixed by `--base-url` like any other (the `/sub/` above). The reference check ignores a URL's query string, so it still checks that the file exists; a misspelled path fails the build, in the generator's `readFileSync`.
- **The boundary.** This versions the URLs the fragment writes, and only those. A stylesheet's `@import` and an ES module's `import` are addresses inside files unify ships as written, so a file reached only that way can change under an unchanged URL. Those need a bundler your generator runs, or a hash in the file name; either is yours to write. unify neither hashes nor renames files.

## An RSS feed

unify's own `feed.xml` is Atom, and it leaves out a post whose `date` is a day alone (advisory A17) rather than invent a time of day: the built-in feed section of [the CLI reference](../cli-reference.md) and conformance spec §29 give the reasons. If you want RSS, or a feed at an endpoint that already exists, or day-dated posts in it, write the feed yourself. The generator reads every page's authored title, description and date from the source inventory (`context.inputs.sourcePages`, which is on whenever a generator is named; [the blog template's generator](../../templates/blog/scripts/gen.mjs) reads it the same way), and each decision unify declined to make is a line you can read.

`scripts/rss.mjs`:

```js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [, , , overlay, contextPath] = process.argv;
const context = JSON.parse(readFileSync(contextPath, "utf8"));
const { baseUrl, prettyUrls } = context.site;
if (!baseUrl) throw new Error("rss.mjs: an RSS link must be absolute, so build with --base-url");
const { pages } = JSON.parse(readFileSync(context.inputs.sourcePages, "utf8"));

const SITE = { title: "My Notes", description: "Notes from the workshop." }; // yours to word
const OUT = "rss.xml"; // or an endpoint you already have, "news/rss.xml"; "feed.xml" replaces unify's Atom feed

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Nothing rewrites a link inside this file, so apply --pretty-urls and --base-url here.
const address = (href) => {
  const dir = href.replace(/(^|\/)index\.html$/, "$1"); // an index page answers at its directory
  return new URL((prettyUrls ? dir.replace(/\.html$/, "/") : dir).slice(1), baseUrl).href;
};

// Dates are your decision. A full timestamp becomes the same instant in RFC 822;
// a bare day names no instant, so that item gets no <pubDate>. Never the clock.
const rfc822 = (d) =>
  /T.*(Z|[+-]\d\d:\d\d)$/.test(d) && !Number.isNaN(Date.parse(d)) ? new Date(d).toUTCString() : null;

const item = (p) => {
  const url = esc(address(p.href)), when = rfc822(p.date);
  return [
    "    <item>",
    `      <title>${esc(p.title)}</title>`,
    `      <link>${url}</link>`,
    `      <guid>${url}</guid>`,
    p.description && `      <description>${esc(p.description)}</description>`,
    when && `      <pubDate>${when}</pubDate>`,
    "    </item>",
  ].filter(Boolean).join("\n");
};

const items = pages
  .filter((p) => p.source.startsWith("posts/") && p.title && p.date) // yours: which pages are posts
  .sort((a, b) => b.date.localeCompare(a.date) || a.source.localeCompare(b.source))
  .map(item);

mkdirSync(dirname(join(overlay, OUT)), { recursive: true }); // the overlay starts empty
writeFileSync(join(overlay, OUT), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(SITE.title)}</title>
    <link>${esc(baseUrl)}</link>
    <description>${esc(SITE.description)}</description>
${items.join("\n")}
  </channel>
</rss>
`);
```

Point readers at it from the layout's `<head>`:

```html
<link rel="alternate" type="application/rss+xml" title="My Notes" href="/rss.xml">
```

With `posts/one.md` titled `Fish & Chips <tasty>` and dated `2026-03-04`, `posts/two.md` titled `Two Weeks Of Rain` and dated `2026-03-05T21:30:00+02:00`, built with `--base-url https://example.com/sub/ --pretty-urls`, the file is:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>My Notes</title>
    <link>https://example.com/sub/</link>
    <description>Notes from the workshop.</description>
    <item>
      <title>Two Weeks Of Rain</title>
      <link>https://example.com/sub/posts/two/</link>
      <guid>https://example.com/sub/posts/two/</guid>
      <description>What the gauge said.</description>
      <pubDate>Thu, 05 Mar 2026 19:30:00 GMT</pubDate>
    </item>
    <item>
      <title>Fish &amp; Chips &lt;tasty&gt;</title>
      <link>https://example.com/sub/posts/one/</link>
      <guid>https://example.com/sub/posts/one/</guid>
      <description>Friday supper, reviewed.</description>
    </item>
  </channel>
</rss>
```

- **Links are built here.** The inventory's `href` is `/` plus the source path with `.md` turned into `.html`. In HTML, unify rewrites such a link for `--pretty-urls` and `--base-url`; `rss.xml` is not HTML and ships byte-for-byte, so `address()` applies both, from `context.site.prettyUrls` and `context.site.baseUrl`. The latter is absolute with its trailing slash, or `null` without `--base-url`, which is why the generator stops the build in that case rather than write links nobody can follow.
- **Dates are decided in the code, never by the build.** Nothing here reads the clock or a file's time, which is also why there is no `<lastBuildDate>`. A day-only post is listed without a `<pubDate>`, which RSS allows and Atom does not; if you would rather leave it out, filter it out. A post with no `date` is not a post to this filter. Items run newest first by the date as written.
- **Text is escaped.** A title with `&` or `<` in it stays well-formed, as the second item above shows.
- **Which file name.** Written as `rss.xml`, the feed sits beside whatever unify generates: a site whose posts declare `schema: BlogPosting` still gets its Atom `feed.xml` under `--base-url`, and A17 still names the day-dated posts left out of that one. Set `OUT` to `feed.xml` and yours is the feed: a `feed.xml` your generator writes, like one in the source tree, suppresses generation, and with it A17, because unify cannot say what is in a file it did not write.
- **What unify checks.** The layout's `<link rel="alternate">` is an ordinary link: `--base-url` prefixes it, and a build where `rss.xml` is missing fails on it. The feed is not read. Under `--base-url`, unify checks the internal URLs of a file named `feed.xml`, and only the `href` of a `<link>` inside an Atom `<entry>`: so a broken URL in an Atom `feed.xml` blocks the publish, and one in an RSS `feed.xml`, whose `<link>` is text, does not. Nothing in `rss.xml` is checked. The one line to get right is `address()`; `sitemap.xml` spells the same addresses, so compare a few.
