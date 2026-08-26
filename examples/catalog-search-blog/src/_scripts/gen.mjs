// _scripts/gen.mjs — one archive page per `series:` value declared across
// posts/*.md, the nav fragment that links to them, and a plain link list for
// every post so the listing page has a real, crawlable, JavaScript-off
// fallback beneath the client-rendered one assets/js/blog.js replaces it
// with. Run by unify as
//
//     unify build -s src -o dist --generate _scripts/gen.mjs ...
//
// The three positional arguments (conformance-spec §33.2): argv[2] is the
// absolute source root, argv[3] is the absolute overlay directory for this
// one build, argv[4] is generator-context.json. cwd is the source root.
// There is no unify module to import and nothing to return.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , sourceRoot, generatedDir, contextPath] = process.argv;

// context.site.baseUrl is the effective --base-url unify is about to build
// with, or null without the flag. A canonical link only means something
// once it can be made absolute, so it is added only once a base address is
// known, rather than emitted pointing at a relative address no crawler
// could resolve to this exact site.
const context = contextPath ? JSON.parse(readFileSync(contextPath, "utf8")) : null;
const baseUrl = context?.site?.baseUrl ?? null;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A frontmatter reader for exactly the shape this example's posts use:
// scalar `key: value` lines, plus one bracketed list form (`tags: [a, b]`).
// This runs before unify has scanned anything, so it reads the raw Markdown
// files itself rather than reusing unify's own frontmatter parser.
function readFrontmatter(text) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return {};
  const data = {};
  for (const line of block[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    data[key] = /^\[.*\]$/.test(raw)
      ? raw.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean)
      : raw.trim();
  }
  return data;
}

// Newest-first sorting shared by the series pages and the fallback list, with
// a missing or unparsable date sinking to the end instead of landing at the
// Unix epoch's year-1970 (or, worse, Date.parse(0)'s year-2000 — the string
// "0" is a valid ISO year) — the same idiom assets/js/blog.js uses so both
// renderings of the same list agree.
function newestFirst(a, b) {
  const ts = (p) => {
    const t = Date.parse(p.date || "");
    return Number.isNaN(t) ? -Infinity : t;
  };
  return ts(b) - ts(a);
}

const postsDir = join(sourceRoot, "posts");
const posts = readdirSync(postsDir)
  .sort()
  .filter((f) => f.endsWith(".md"))
  .map((file) => {
    const fm = readFrontmatter(readFileSync(join(postsDir, file), "utf8"));
    return { slug: file.replace(/\.md$/, ""), title: fm.title ?? file, date: fm.date ?? "", series: fm.series };
  });

const bySeries = new Map();
for (const post of posts) {
  if (!post.series) continue;
  if (!bySeries.has(post.series)) bySeries.set(post.series, []);
  bySeries.get(post.series).push(post);
}

const seriesDir = join(generatedDir, "series");
if (bySeries.size > 0) mkdirSync(seriesDir, { recursive: true });

const navItems = [];
for (const [series, entries] of [...bySeries].sort(([a], [b]) => a.localeCompare(b))) {
  entries.sort(newestFirst);
  const routePath = `series/${series}.html`;
  const canonicalTag = baseUrl ? `\n    <link rel="canonical" href="/${routePath}">` : "";
  const items = entries
    .map((p) => `        <li><a href="/posts/${p.slug}.html">${esc(p.title)}</a></li>`)
    .join("\n");
  writeFileSync(
    join(seriesDir, `${series}.html`),
    `<!doctype html>
<html lang="en">
  <head>
    <title>${esc(series)} series</title>
    <meta name="description" content="Every post in the ${esc(series)} series.">${canonicalTag}
  </head>
  <body>
    <main>
      <h1>${esc(series)}</h1>
      <p>${entries.length} post${entries.length === 1 ? "" : "s"} in this series, newest first.</p>
      <ul>
${items}
      </ul>
    </main>
  </body>
</html>
`
  );
  navItems.push(`      <li><a href="/${routePath}">${esc(series)}</a> (${entries.length})</li>`);
}

mkdirSync(join(generatedDir, "_includes"), { recursive: true });
writeFileSync(
  join(generatedDir, "_includes", "series-nav.html"),
  navItems.length
    ? `<ul class="series-nav">\n${navItems.join("\n")}\n    </ul>\n`
    : `<p class="series-nav-empty">No series declared yet.</p>\n`
);

// Every post, newest first, as plain <li><a> markup — no <ul> of its own, so
// index.html can <include> it straight inside its own <ul id="posts">.
// assets/js/blog.js overwrites this list the moment catalog.json/
// search-corpus.json load; until then, and for anyone who never runs the
// script, these are real links a crawler or a JS-off browser can follow —
// which is also what keeps every post reachable without one hand-maintained
// nav (`unify audit`'s page-orphan finding would otherwise catch exactly the
// posts that declare no `series`).
const allPosts = [...posts].sort(newestFirst);
writeFileSync(
  join(generatedDir, "_includes", "post-list.html"),
  allPosts.map((p) => `<li><a href="/posts/${p.slug}.html">${esc(p.title)}</a></li>`).join("\n") + "\n"
);

console.log(`generated ${bySeries.size} series page(s) and a ${allPosts.length}-post fallback list from ${posts.length} post(s)`);
