/**
 * `unify init blog` — a blog with the generator seam worked end-to-end
 * (conformance-spec §19 / SCF-03, SCF-05): `_scripts/gen.mjs` reads
 * `posts/*.md` and `_data/authors.json` and writes `blog.html` and
 * `feed.xml`, the sanctioned answer to collections and RSS (product-spec
 * §5). Two ratification findings shaped this scaffold, and both are
 * load-bearing (docs/ratification.md §6; _notes/ratification-rounds-7-20.md,
 * rounds 16/19/20):
 *
 * - Twelve of twelve agents across rounds 19-20 wrote a generator script
 *   unprompted — it is the most universal thing anyone builds on top of
 *   unify — and round 16 showed the scaffold teaches shapes the prose
 *   failed at (5/5 on the named-slot fill) and mis-teaches placeholders
 *   just as efficiently (3/4 copied one verbatim). What this file
 *   demonstrates, agents will copy; so it demonstrates the pattern
 *   properly: the run-it-yourself contract (`node _scripts/gen.mjs &&
 *   unify build` — the authoring rules' own literal, and the two must
 *   agree), a generated-file marker, and the derived files shipped
 *   pre-generated.
 * - Eight of those twelve correctly excluded their data file and still
 *   published its private fields. File-level exclusion cannot protect a
 *   field, and no diagnostic can exist once a script copies one into a
 *   page — that page is ordinary content. The only enforcement point is
 *   the generator itself, so gen.mjs names the fields it emits — never
 *   spreads the record — and its comments say why.
 *
 * The scaffold ships `blog.html`/`feed.xml` already generated from the two
 * sample posts and the authors file below — `unify init blog && unify build
 * --dry-run --strict` must exit 0 with no intervening step (SCF-04), so the
 * listing page and feed can't depend on the user having run the script
 * first. The checked-in copies are byte-identical to what running the
 * script produces: the SCF-03 test deletes them, reruns the script, and
 * compares the whole tree. **Anything that changes a post, the authors
 * file, or the generator changes those two literals in the same edit.**
 *
 * ── The §19.2 discovery set, in this template ──────────────────────────
 * `commonFiles()` carries the site-wide half (the language, the `og:image`
 * trio, `og:type`, the `schema` declaration, `robots.txt`, no canonical);
 * this file owns the per-page half, and `unify init blog && unify audit
 * --strict` exits 0 only while all of it holds (§19.3, SCF-08):
 *
 * - every page has its own `<title>` and `<meta name="description">`, and
 *   no two repeat (`description-duplicate` folds case and whitespace);
 * - every page has exactly one `<h1>` naming THAT PAGE, spelled the same way
 *   as the page's own `<title>` — `<h1>Home</h1>` under `Home — My Blog`,
 *   each post's `# Title` under `Title — My Blog`. `<h1>My Blog</h1>` on the
 *   home page also satisfies §24.4's containment test, and is what this
 *   template shipped, but it satisfies it through the LAYOUT's half of the
 *   merged title: rename the site in `_layout.html` alone — the first edit
 *   anyone makes — and `Home — Sam's Notes` no longer contains `My Blog`,
 *   so §19.3's second guarantee breaks on a template the author never
 *   touched. The site name belongs in the layout and nowhere else; the four
 *   other templates already pair a heading with its own page's title, and
 *   this one now reads the same way. A Markdown `title:` alone emits no
 *   heading, which is why every post body opens with one;
 * - each post declares `schema: BlogPosting` beside an authored, W3C-DTF
 *   `date:` — §20.10 will not invent one and `schema-incomplete` fires
 *   without it — plus `og:type: article`, both replacing the layout's
 *   value by the ordinary head merge (§8);
 * - `blog.html` links every post and the nav links `blog.html`, so nothing
 *   is a `page-orphan` (`index.html` and `404.html` are exempt); and
 *   `feed.xml` is reachable — `<link rel="alternate">` on the home and
 *   listing pages, a visible link on the listing — because §19.7's last
 *   rule is that a template ships no file the site does not use.
 *
 * ── Placeholders (§19.7) ───────────────────────────────────────────────
 * The byline is `Your Name Here`, the author's site is on the reserved
 * `.example` TLD, and both sample posts open with a `class="placeholder"`
 * line naming their own date and byline as scaffolding. A plausible
 * invented person with a plausible date is exactly what a reader would
 * mistake for a fact — and would publish.
 */
import { commonFiles, mdFrontmatter, pageHtml } from "./shared.js";

const SITE_NAME = "My Blog";

/**
 * The two sample posts' dates, named once. §19.7 puts dates on the list of
 * things a reader must not be able to mistake for a fact, and the repair is
 * to say the value in the page's own visible disclaimer — which only works
 * while the disclaimer and the frontmatter cannot drift apart.
 */
const HELLO_DATE = "2026-01-15T09:30:00Z";
const SECOND_DATE = "2026-02-03T14:05:00Z";

/**
 * The line `gen.mjs` writes above the listing. `blog.html` was the one content
 * page of this template with no placeholder marking at all, and it is the page
 * that renders the invented dates and bylines as plain visible text — every
 * other item on §19.7's list is covered by the template's own uniform
 * `class="placeholder"` mechanism (styled in assets/style.css precisely so a
 * reader cannot mistake one for a fact), and the dates were the one item it
 * never reached. It carries no site name: this file is generated, and a second
 * copy of the site's identity in it would be one more place DEPLOY.md's step 1
 * has to name.
 */
const LISTING_PLACEHOLDER_NOTE = "Sample listing — every title, date and byline below is a placeholder, not a fact.";

/**
 * The generated listing page's own description — `gen.mjs` writes it into
 * `blog.html`'s `<meta name="description">` and `og:description`, and into
 * the feed's channel description. It lives here so that the script the
 * scaffold ships and the pre-generated copy below cannot end up describing
 * the same page two different ways.
 */
const listingDescription = (siteName) => `Every post on ${siteName}, newest first — a listing page written by _scripts/gen.mjs, never by hand.`;
const LISTING_DESCRIPTION = listingDescription(SITE_NAME);
/**
 * The same sentence with the site's name left as the SCRIPT's own
 * interpolation — a double-quoted argument, so `${SITE_NAME}` survives into
 * `gen.mjs` as source rather than being substituted here. It is what makes
 * DEPLOY.md's step 1 sufficient rather than merely complete: an author who
 * renames the site edits `SITE_NAME` once and the listing description, the
 * feed's channel description and every `og:description` follow, instead of
 * `My Blog` surviving in a second constant that nothing corrects and
 * `feed.xml` publishing it (a mirror-copied asset — §11 never rewrites it,
 * §12 never follows it, and `audit` reads no finding out of it).
 */
const LISTING_DESCRIPTION_SOURCE = listingDescription("${SITE_NAME}");

// Zero dependencies, one `node:` import: it produces BOTH blog.html and
// feed.xml, escapes text into HTML and XML correctly, omits rather than
// invents (no date it cannot read, no byline it was not given), and carries
// the field-privacy comments SCF-05 requires — the teaching is the point,
// not the byte count.
const GEN_MJS = `// Regenerates blog.html and feed.xml — the derived files — from posts/*.md
// and _data/authors.json. Zero dependencies, run it yourself:
//   node _scripts/gen.mjs && unify build
// That is the path from the source root, where this script lives. Every other
// command in this project runs from the project root one level up, and from
// there the same line reads:
//   node src/_scripts/gen.mjs && unify build
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const HERE = import.meta.url;
const POSTS = new URL("../posts/", HERE);
const SITE_NAME = ${JSON.stringify(SITE_NAME)};
const LISTING_DESCRIPTION =
  \`${LISTING_DESCRIPTION_SOURCE}\`;
// A feed's links have to be absolute, so this script has to be told the
// site's address — the same one you pass to \`unify build --base-url\` (see
// DEPLOY.md). \`you.example\` is a placeholder domain, not an address.
const SITE_URL = "https://you.example";
const MARKER = "generated by _scripts/gen.mjs — edit the data, not this file";
// Every title, date and byline below comes from the sample posts, so the
// listing says so where a reader sees it (the feed does not: an RSS reader
// renders no class of ours, and inventing a disclaimer item would be adding
// a post nobody wrote).
const PLACEHOLDER_NOTE = ${JSON.stringify(LISTING_PLACEHOLDER_NOTE)};

// Text content, then attribute values. Both, because a post title with an
// ampersand in it belongs in this page as text and in that page's link as
// an attribute, and one escaper cannot be right for both.
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s = "") => esc(s).replace(/"/g, "&quot;");
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

// _data/authors.json holds a private field (email) beside the public ones.
// The underscore keeps the FILE out of the built site; only this script can
// keep a FIELD out of the pages it writes.
const AUTHORS = JSON.parse(readFileSync(new URL("../_data/authors.json", HERE), "utf8"));

function readFrontmatter(text) {
  const m = text.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?/);
  const data = {};
  for (const line of m ? m[1].split(/\\r?\\n/) : []) {
    const kv = line.match(/^([\\w:-]+):\\s*(.*)\$/);
    // A quoted YAML scalar keeps its quotes in a reader this naive; drop
    // them, or a title with a colon in it lands in the listing wearing them.
    if (kv) data[kv[1]] = kv[2].trim().replace(/^"([\\s\\S]*)"\$/, "\$1");
  }
  return data;
}

const posts = readdirSync(POSTS)
  .filter((f) => f.endsWith(".md"))
  .map((file) => {
    const fm = readFrontmatter(readFileSync(new URL(file, POSTS), "utf8"));
    const slug = file.slice(0, -3);
    // Name the fields you emit — never spread the record (no {...author}).
    // Picking \`name\` and \`url\` is what keeps \`email\` private: it never
    // leaves this file, and no build check could catch it if it did.
    const record = AUTHORS.find((a) => a.name === fm.author) || {};
    const author = { name: record.name || "", url: record.url || "" };
    return { slug, title: fm.title || slug, date: fm.date || "", description: fm.description || "", author };
  })
  // Newest first, ties broken by filename, so two runs always agree.
  .sort((a, b) => cmp(b.date, a.date) || cmp(a.slug, b.slug));

const items = posts
  .map((p) => {
    // <time> splits the machine's value from the reader's: the attribute keeps
    // the full instant a feed needs, the text shows the day. The slice is the
    // whole formatting rule on purpose — no locale, no month names, nothing
    // invented from a value the author did not write.
    const when = p.date
      ? ' <time datetime="' + escAttr(p.date) + '">' + esc(p.date.slice(0, 10)) + "</time>"
      : "";
    const by = p.author.name
      ? ' by <a href="' + escAttr(p.author.url) + '" rel="author">' + esc(p.author.name) + "</a>"
      : "";
    return '        <li><a href="/posts/' + p.slug + '.html">' + esc(p.title) + "</a>" + when + by + "</li>";
  })
  .join("\\n");

writeFileSync(
  new URL("../blog.html", HERE),
  "<!doctype html>\\n<html>\\n  <head>\\n    <title>Blog</title>\\n" +
    '    <meta name="description" content="' + escAttr(LISTING_DESCRIPTION) + '">\\n' +
    '    <meta property="og:title" content="Blog">\\n' +
    '    <meta property="og:description" content="' + escAttr(LISTING_DESCRIPTION) + '">\\n' +
    '    <link rel="alternate" type="application/rss+xml" title="' + escAttr(SITE_NAME) + '" href="/feed.xml">\\n' +
    "  </head>\\n  <body>\\n    <main>\\n" +
    "      <!-- " + MARKER + " -->\\n" +
    "      <h1>Blog</h1>\\n" +
    '      <p class="placeholder">' + esc(PLACEHOLDER_NOTE) + "</p>\\n" +
    "      <ul>\\n" + items + "\\n      </ul>\\n" +
    '      <p>Every post above, in one file: the <a href="/feed.xml">RSS feed</a>.</p>\\n' +
    "    </main>\\n  </body>\\n</html>\\n",
);

// RSS's <author> element wants an email address — exactly the field that
// stays private — so the feed carries no author at all. A post with no
// usable date gets no <pubDate> either: leave it out rather than invent one.
const rssItems = posts
  .map((p) => {
    const at = p.date ? new Date(p.date) : null;
    const pubDate =
      at && !Number.isNaN(at.getTime()) ? "      <pubDate>" + at.toUTCString() + "</pubDate>\\n" : "";
    return "    <item>\\n" +
      "      <title>" + esc(p.title) + "</title>\\n" +
      "      <link>" + SITE_URL + "/posts/" + p.slug + ".html</link>\\n" +
      "      <description>" + esc(p.description) + "</description>\\n" +
      pubDate +
      "    </item>";
  })
  .join("\\n");

writeFileSync(
  new URL("../feed.xml", HERE),
  '<?xml version="1.0" encoding="UTF-8"?>\\n' +
    "<!-- " + MARKER + " -->\\n" +
    '<rss version="2.0">\\n  <channel>\\n' +
    "    <title>" + esc(SITE_NAME) + "</title>\\n" +
    "    <link>" + SITE_URL + "/blog.html</link>\\n" +
    "    <description>" + esc(LISTING_DESCRIPTION) + "</description>\\n" +
    rssItems +
    "\\n  </channel>\\n</rss>\\n",
);

console.log("gen.mjs: wrote blog.html and feed.xml from " + posts.length + " post(s)");
`;

export const files = {
  ...commonFiles(SITE_NAME, [
    ["Home", "/"],
    ["Blog", "/blog.html"],
    ["Contact", "/contact.html"],
  ]),

  // The record every generator grows eventually: public fields beside one
  // that must never ship. It lives under `_data/` (excluded, like all `_*`),
  // and only gen.mjs decides which fields leave it.
  //
  // A list of authors, looked up by the name a post's frontmatter declares,
  // rather than a map keyed by a handle: `author:` is HTML's own key for
  // "the name of one of the page's authors" (§26.6 puts it in the generated
  // JSON-LD verbatim), so a post that wrote `author: sam` would ship an id
  // where a reader expects a name.
  //
  // The name is a CONSPICUOUS placeholder (§19.7) and the `url` is an
  // EXTERNAL personal site on the reserved `.example` TLD (RFC 2606),
  // deliberately on neither of the two domains a reader will type after
  // `--base-url`: not this site's own, and not `you.example`, the one
  // DEPLOY.md's recipe uses. Either collision makes REF-02 strip a matching
  // origin and read the byline as an internal link. It read
  // `https://example.com/sam` until the sitemap work made `--base-url` the
  // flag every site sets, and `--base-url https://example.com/` then
  // resolved it to a page no template ships — the scaffold failing its own
  // golden path on a broken reference. `https://you.example/` would strip
  // to `/` and quietly become a link to this site's home page, which is the
  // worse half of the same fault: nothing reports it. A placeholder that
  // collides with the most obvious value a reader will type is a scaffold
  // defect, not a CLI one.
  "_data/authors.json": `[
  {
    "name": "Your Name Here",
    "url": "https://author.example/",
    "email": "you@example.com"
  }
]
`,

  "_scripts/gen.mjs": GEN_MJS,

  "posts/hello-world.md": `${mdFrontmatter({
    title: "Hello, world",
    description: "A sample post — what a post file contains, and what to run after you add one.",
    extra: {
      schema: "BlogPosting",
      date: HELLO_DATE,
      author: "Your Name Here",
      "og:type": "article",
    },
  })}
# Hello, world

<p class="placeholder">Sample post — the title, the byline, and the date ${HELLO_DATE} are placeholders, not facts. Edit this file, or delete it and write your own.</p>

A post is one Markdown file in \`posts/\`. Its frontmatter carries the title, the description, the date, and the author's name; \`_scripts/gen.mjs\` reads those and builds the listing page and the feed out of them.

\`schema: BlogPosting\` asks unify to write this page's JSON-LD from what the page already declares. Nothing is guessed — a date it cannot read as \`${HELLO_DATE}\` or \`${HELLO_DATE}T09:30:00Z\` is left out and reported, never filled in from the clock, the filesystem, or Git.

\`blog.html\` and \`feed.xml\` are derived files, so regenerate them whenever you add, edit, or delete a post. Run it from the project root, the directory \`src/\` sits in:

\`\`\`
node src/_scripts/gen.mjs && unify build
\`\`\`
`,

  "posts/second-post.md": `${mdFrontmatter({
    title: "A second post",
    description: "The second sample post — it exists so the generated listing and feed have more than one item to show.",
    extra: {
      schema: "BlogPosting",
      date: SECOND_DATE,
      author: "Your Name Here",
      "og:type": "article",
    },
  })}
# A second post

<p class="placeholder">Another sample — the byline, and the date ${SECOND_DATE}, are placeholders and not facts. Delete both of these once you have written a post of your own.</p>

This file is dated later than \`hello-world.md\`, so the generated listing shows it first: \`_scripts/gen.mjs\` sorts by each post's \`date\`, newest first, and breaks ties by filename so that two runs of the script can never disagree.

The feed leaves the author out entirely. RSS's \`<author>\` element wants an email address — the one field \`_data/authors.json\` keeps private — so the generator emits no author rather than publish one. Excluding a file cannot protect a field; only the script that writes the page can.
`,

  "index.html": pageHtml({
    title: "Home",
    description: "Start here: what this blog scaffold ships, which two files are generated, and what to replace first.",
    head: `<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="/feed.xml">`,
    main: `<h1>Home</h1>
<p>A blog scaffold: two sample posts in <code>posts/</code>, and one script that turns them into a listing page and an RSS feed. <span class="placeholder">Every name and date in it is a placeholder</span> — replace them before you publish.</p>
<p>Read the <a href="/blog.html">blog index</a>, open <a href="/posts/hello-world.html">the first post</a>, or <a href="/contact.html">get in touch</a>.</p>
<h2>Two of these files are generated</h2>
<p><code>blog.html</code> and <code>feed.xml</code> are written by <code>src/_scripts/gen.mjs</code> from the posts and <code>src/_data/authors.json</code>. Edit those, never the generated files, and run the script before you build — from the project root, the directory <code>src/</code> sits in:</p>
<pre><code>node src/_scripts/gen.mjs &amp;&amp; unify build</code></pre>`,
  }),

  // Pre-generated — exactly the bytes `node _scripts/gen.mjs` produces from
  // the two posts and the authors file above, so the scaffold builds clean
  // with no extra step (SCF-04) and rerunning the script changes nothing
  // (SCF-03). Note the byline: the author's public name and url, never the
  // email that sits beside them in `_data/authors.json` (SCF-05).
  "blog.html": `<!doctype html>
<html>
  <head>
    <title>Blog</title>
    <meta name="description" content="${LISTING_DESCRIPTION}">
    <meta property="og:title" content="Blog">
    <meta property="og:description" content="${LISTING_DESCRIPTION}">
    <link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="/feed.xml">
  </head>
  <body>
    <main>
      <!-- generated by _scripts/gen.mjs — edit the data, not this file -->
      <h1>Blog</h1>
      <p class="placeholder">${LISTING_PLACEHOLDER_NOTE}</p>
      <ul>
        <li><a href="/posts/second-post.html">A second post</a> <time datetime="2026-02-03T14:05:00Z">2026-02-03</time> by <a href="https://author.example/" rel="author">Your Name Here</a></li>
        <li><a href="/posts/hello-world.html">Hello, world</a> <time datetime="2026-01-15T09:30:00Z">2026-01-15</time> by <a href="https://author.example/" rel="author">Your Name Here</a></li>
      </ul>
      <p>Every post above, in one file: the <a href="/feed.xml">RSS feed</a>.</p>
    </main>
  </body>
</html>
`,

  "feed.xml": `<?xml version="1.0" encoding="UTF-8"?>
<!-- generated by _scripts/gen.mjs — edit the data, not this file -->
<rss version="2.0">
  <channel>
    <title>${SITE_NAME}</title>
    <link>https://you.example/blog.html</link>
    <description>${LISTING_DESCRIPTION}</description>
    <item>
      <title>A second post</title>
      <link>https://you.example/posts/second-post.html</link>
      <description>The second sample post — it exists so the generated listing and feed have more than one item to show.</description>
      <pubDate>Tue, 03 Feb 2026 14:05:00 GMT</pubDate>
    </item>
    <item>
      <title>Hello, world</title>
      <link>https://you.example/posts/hello-world.html</link>
      <description>A sample post — what a post file contains, and what to run after you add one.</description>
      <pubDate>Thu, 15 Jan 2026 09:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`,
};
