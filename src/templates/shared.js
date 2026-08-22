/**
 * Shared building blocks for the `unify init` templates (conformance-spec
 * §19). Every template's `_layout.html`, nav fragment, footer-slot-filling
 * page, 404 page, stylesheet, `robots.txt`, and share image follow the
 * identical shape — only the site name and the nav links vary — so those
 * pieces are built here once instead of copy-pasted five times and risking
 * drift on the parts that must stay byte-identical (the charset, the
 * include, the slot comment, the `data-layout="none"` opt-out, and every
 * property §19.2 makes checkable).
 *
 * Everything here is plain data assembled at module-evaluation time.
 * **Nothing reads the filesystem** — that is the constraint §19.5 keeps:
 * `bun build --compile` bundles by tracing `import`, and a single-file
 * executable has no sibling directory to read, so the one binary file a
 * template ships (the share image) is a base64 literal decoded here into
 * bytes, never `readFileSync(new URL(..., import.meta.url))`.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WRITING A TEMPLATE: the properties `unify audit --strict` checks (§19.2)
 * ────────────────────────────────────────────────────────────────────────
 * `unify init <t> && unify audit --strict` must exit 0 (§19.3, SCF-08), and
 * `--strict` gates on ANY finding of either severity (§24.6). The building
 * blocks below cover everything site-wide; a template's own pages must
 * cover the per-page half:
 *
 *   - a `<title>` AND a `<meta name="description">` on every page, both
 *     UNIQUE within the template (`title-duplicate`, `description-duplicate`
 *     compare case-folded, whitespace-collapsed strings across pages);
 *   - exactly one `<h1>`, and the emitted title must contain it or be
 *     contained by it (`title-h1-mismatch`). The emitted title is the merged
 *     one — page `About` under a layout `— My Site` is `About — My Site`,
 *     which contains the `<h1>` `About`. A page titled `Home` with an `<h1>`
 *     reading `Welcome!` is the mismatch this scaffold used to ship;
 *   - `og:title` and `og:description` per page (`pageHead`/`mdFrontmatter`
 *     write them from the same two strings; `og:type` and the whole
 *     `og:image` set are site-wide, in the layout);
 *   - a link in from somewhere (`page-orphan` fires when nothing links to a
 *     page and it is neither `index.html` nor `404.html`; the nav fragment
 *     covers whatever it lists, and a listing page covers what it lists);
 *   - visible text no other page repeats exactly (`text-duplicate`);
 *   - no canonical anywhere (§19.2 item 7 — a scaffold does not know the
 *     site's address; `DEPLOY.md` teaches `--base-url … --canonical auto`).
 *
 * Placeholders are conspicuous on purpose (§19.7): a reader must never
 * mistake scaffolded text for a fact. Use `class="placeholder"` (styled by
 * `styleCss()`) on any invented business identity, name, date, price,
 * rating, or address, and never write a plausible-looking one.
 */

// ---------------------------------------------------------------- escaping

/**
 * Escape a string for use in a double-quoted HTML attribute value.
 * @param {string} value
 * @returns {string}
 */
export function attr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/**
 * Escape a string for use as HTML text content (`<title>`, a heading).
 * @param {string} value
 * @returns {string}
 */
export function text(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Quote a YAML scalar when the value would otherwise change meaning — the
 * authoring rules' own instruction ("quote any value containing a colon").
 * @param {string} value
 * @returns {string}
 */
function yamlScalar(value) {
  const s = String(value);
  const needsQuotes = s === "" || /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /:\s|\s#/.test(s) || /^\s|\s$/.test(s) || /:$/.test(s);
  return needsQuotes ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
}

/**
 * Re-indent a block of markup to `pad`, ignoring whatever indentation the
 * caller's template literal happened to have, so a template can write its
 * page bodies flush left or nested and get the same house style either way.
 * @param {string} block
 * @param {string} pad
 * @returns {string}
 */
function reindent(block, pad) {
  const lines = String(block).replace(/\s+$/, "").split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  const widths = lines.filter((l) => l.trim() !== "").map((l) => l.match(/^ */)[0].length);
  const strip = widths.length > 0 ? Math.min(...widths) : 0;
  return lines.map((l) => (l.trim() === "" ? "" : pad + l.slice(strip))).join("\n");
}

// ------------------------------------------------------------ share image

/**
 * A real 1200×630 PNG, base64 here and bytes on disk (§19.5). An SVG would
 * have kept this module textual and would not have done the job: the social
 * crawlers `og:image` exists for do not render SVG, so a template shipping
 * one would teach a tag that silently fails at the only moment it matters.
 *
 * It is a PLACEHOLDER and looks like one (§19.7) — a flat dark card with a
 * single light band, not a photograph — because `og:image:width` and
 * `og:image:height` must state this file's REAL pixel dimensions (§19.2
 * item 4): a declared dimension that does not match the file is the
 * invented claim product-spec §6.1 forbids, in the one place nothing would
 * ever catch it. `layoutHtml()` writes the two numbers from the constants
 * below, so the declaration cannot drift from the file, and the layout
 * carries a comment telling the author to correct them if their own image
 * is a different size.
 *
 * 869 bytes: 8-bit palette colour, non-interlaced, IHDR 1200×630.
 */
const SHARE_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAABLAAAAJ2CAMAAAB4notuAAAABlBMVEUPERp6ovfQm1aBAAADGklEQVR42u3UAQ0AAAwCIN+/9GvoBiFIAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAocwAhhAcICEBYgLABhAQgLEBaAsACEBQgLQFgAwgKEBSAsAGEBwgIQFoCwAGEBCAtAWICwAIQFICxA" +
  "WADCAhAWICwAYQHCAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACjwwoWMocNTzb4AAAAASUVORK5CYII=";

/** Decode a base64 literal to bytes with no filesystem and no node: import. */
function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The one binary file every template ships. `path` is the template-map key
 * (source-root-relative), `url` is what markup writes, and `width`/`height`
 * are the file's real IHDR dimensions — read them from here rather than
 * typing the numbers, so §19.2 item 4 cannot drift.
 * @type {{path: string, url: string, width: number, height: number, bytes: Uint8Array}}
 */
export const SHARE_IMAGE = {
  path: "assets/share-placeholder.png",
  url: "/assets/share-placeholder.png",
  width: 1200,
  height: 630,
  bytes: decodeBase64(SHARE_IMAGE_BASE64),
};

// -------------------------------------------------------------- page parts

/**
 * Refuse to build a page out of a value that was never supplied.
 *
 * Without this, a caller that omits `description:` gets the string
 * `"undefined"` interpolated into `<meta name="description">`, into
 * `og:description`, and — because §26.6 reads the record, not the source —
 * into that page's generated JSON-LD. **Nothing downstream can see it**:
 * §24.4 asks only whether a description is present, non-empty, and unlike
 * its neighbours', and `"undefined"` is all three, so `audit --strict`
 * stays silent and §19.3's guarantee holds over a page describing itself as
 * `undefined`. That is worse than a missing description and worse than a
 * placeholder — §19.7 forbids making an invented placeholder look
 * publishable, and this one looks like nothing at all.
 *
 * The check belongs here rather than in a test because here it cannot be
 * forgotten by the sixth template: these maps are built at module
 * evaluation, so a slip throws the moment `src/templates/index.js` is
 * imported — at `unify init`, and in every test that touches the registry.
 *
 * @param {string} what - the field name, for the message
 * @param {unknown} value
 * @returns {string}
 */
function required(what, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(
      `template builder: ${what} is ${JSON.stringify(value)} — a scaffolded page is built from ` +
        `strings its template supplies (conformance-spec §19.2), and an absent argument would be ` +
        `interpolated as the literal "undefined", which no check downstream distinguishes from prose`,
    );
  }
  return value;
}

/**
 * A page's own `<head>` — the per-page half of §19.2. The layout supplies
 * the charset, the title suffix, `og:type`, the `og:image` set, and the
 * `schema` declaration; a page supplies the four things only it can know.
 *
 * @param {object} page
 * @param {string} page.title - the page's own name; the layout's title is
 *   joined behind it (`About` + `— My Site` → `About — My Site`, §8 row 2)
 * @param {string} page.description - one sentence about THIS page, unique
 *   within the template
 * @param {string} [page.ogType] - only when this page overrides the
 *   layout's `website` (a blog post writes `article`)
 * @param {string} [page.extra] - further head lines, re-indented for you
 * @returns {string} `  <head>` … `  </head>`, indented for a page document
 */
export function pageHead({ title, description, ogType, extra = "" }) {
  required("title", title);
  required("description", description);
  const lines = [
    `    <title>${text(title)}</title>`,
    `    <meta name="description" content="${attr(description)}">`,
    `    <meta property="og:title" content="${attr(title)}">`,
    `    <meta property="og:description" content="${attr(description)}">`,
  ];
  if (ogType) lines.push(`    <meta property="og:type" content="${attr(ogType)}">`);
  if (extra.trim() !== "") lines.push(reindent(extra, "    "));
  return `  <head>\n${lines.join("\n")}\n  </head>`;
}

/**
 * A complete HTML page in the house style: a `<head>` from `pageHead`, the
 * content inside a `<main>` (which the layout unwraps into its own sink),
 * and any top-level extras — the `slot="footer"` fill, typically — after it.
 *
 * @param {object} page
 * @param {string} page.title
 * @param {string} page.description
 * @param {string} page.main - the page's content; indentation is normalised
 * @param {string} [page.ogType]
 * @param {string} [page.head] - extra `<head>` lines
 * @param {string} [page.body] - extra top-level `<body>` elements
 * @returns {string}
 */
export function pageHtml({ title, description, main, ogType, head = "", body = "" }) {
  required("main", main);
  const extras = body.trim() === "" ? "" : `\n${reindent(body, "    ")}`;
  return `<!doctype html>
<html>
${pageHead({ title, description, ogType, extra: head })}
  <body>
    <main>
${reindent(main, "      ")}
    </main>${extras}
  </body>
</html>
`;
}

/**
 * The frontmatter block for a Markdown page — the same four declarations
 * `pageHead` writes, in the spelling §10.2 accepts. `title` and
 * `description` become `<title>`/`<meta name="description">`; a key named
 * `og:…` emits `property=` instead.
 *
 * @param {object} page
 * @param {string} page.title
 * @param {string} page.description
 * @param {Record<string, string>} [page.extra] - further keys in order
 *   (`schema`, `date`, `lastmod`, `author`, `og:type`, …)
 * @returns {string} the `---` block, newline-terminated
 */
export function mdFrontmatter({ title, description, extra = {} }) {
  required("title", title);
  required("description", description);
  const rows = [
    ["title", title],
    ["description", description],
    ["og:title", title],
    ["og:description", description],
    ...Object.entries(extra),
  ];
  for (const [key, value] of Object.entries(extra)) required(`frontmatter key "${key}"`, value);
  return `---\n${rows.map(([k, v]) => `${k}: ${yamlScalar(v)}`).join("\n")}\n---\n`;
}

// ------------------------------------------------------------ shared files

/**
 * The site chrome — one complete HTML page, always the same shape (§19.1,
 * SCF-02): `lang` on `<html>`, charset first in `<head>`, the title
 * separator, one `<include>` for the nav, `<main>` as the default-content
 * sink, and one named slot ("footer") with visible fallback content. §19.1's
 * comment convention covers **each** slot, not just the named one: the bare
 * `<slot>` inside `<main>` is the one a reader meets first and the one whose
 * routing rule ("everything else") is least guessable, so a layout that
 * labelled only the footer was demonstrating the convention on the easier
 * half — and saying, by omission, that the default sink needs no label.
 *
 * Everything site-wide that §19.2 makes checkable lives here, so one
 * declaration serves every page: the language (item 1), `og:type` and the
 * whole `og:image` set with the shipped file's real dimensions (item 4),
 * and the `schema` declaration that lets unify write each page's JSON-LD
 * from what that page already declares (item 6, §26.4 — "a layout may carry
 * it for a whole section"). It deliberately declares NO description and NO
 * canonical: a layout-wide description would ship the same sentence on
 * every page (`description-duplicate`), and a canonical is one page's own
 * address, which a scaffold cannot know (item 7).
 *
 * @param {string} siteName - e.g. "My Site" — the layout writes "— My Site";
 *   a page's own <title> is joined in front of it by the head merge (S10).
 * @returns {string}
 */
export function layoutHtml(siteName) {
  required("siteName", siteName);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>— ${text(siteName)}</title>
    <link rel="stylesheet" href="/assets/style.css">
    <!-- share card: ${SHARE_IMAGE.path} is a PLACEHOLDER, a flat
         ${SHARE_IMAGE.width}×${SHARE_IMAGE.height} image. Replace the file, and correct these two numbers
         if yours is a different size — they must match it (see DEPLOY.md). -->
    <meta property="og:type" content="website">
    <meta property="og:image" content="${SHARE_IMAGE.url}">
    <meta property="og:image:width" content="${SHARE_IMAGE.width}">
    <meta property="og:image:height" content="${SHARE_IMAGE.height}">
    <!-- schema: unify writes each page's JSON-LD from what that page itself
         declares. Delete this line and none is written; write your own
         <script type="application/ld+json"> and yours wins. -->
    <meta name="schema" content="WebPage">
  </head>
  <body>
    <include src="/_includes/nav.html"></include>
    <!-- main: everything a page did not address to a named slot -->
    <main><slot></slot></main>
    <footer class="site-footer">
      <!-- footer: the site byline, or whatever a page puts here instead -->
      <slot name="footer"><p>© ${text(siteName)}</p></slot>
    </footer>
  </body>
</html>
`;
}

/**
 * The nav fragment `_layout.html` includes. One line, space-separated
 * anchors — exactly the shape product-spec §2's own worked example shows
 * spliced into the built page.
 *
 * The nav is also what keeps pages off `page-orphan` (§24.4): a page no
 * other page links to is a finding unless it is `index.html` or `404.html`,
 * so every page a template ships is either listed here or linked from a
 * page that is.
 *
 * @param {[string, string][]} links - [label, href] pairs, in nav order
 * @returns {string}
 */
export function navHtml(links) {
  if (!Array.isArray(links) || links.length === 0) throw new TypeError("template nav: navHtml needs at least one [label, href] pair — the nav is what keeps a template's pages off §24.4's page-orphan");
  for (const [label, href] of links) {
    required("nav label", label);
    required("nav href", href);
  }
  const anchors = links.map(([label, href]) => `<a href="${attr(href)}">${text(label)}</a>`).join(" ");
  return `<nav>${anchors}</nav>\n`;
}

/**
 * The one page in every template that fills the layout's named "footer"
 * slot (SCF-01) — same shape as product-spec §2's `contact.html`: ordinary
 * content plus one top-level element carrying `slot="footer"`.
 *
 * The contact details are conspicuous placeholders (§19.7): a reserved
 * `example.com` address, marked in the page's own visible text, and no
 * postal address at all — a plausible-looking street address would be
 * teaching authors to publish an invented one.
 *
 * @param {string} siteName
 * @returns {string}
 */
export function contactHtml(siteName) {
  required("siteName", siteName);
  const description = `How to reach ${siteName} — placeholder details, waiting to be replaced with your own.`;
  return pageHtml({
    title: "Contact",
    description,
    main: `<h1>Contact</h1>
<p>Ordinary content as usual — and one element addressed to the layout's named slot.</p>
<ul>
  <li>Email: <a href="mailto:hi@example.com">hi@example.com</a> <span class="placeholder">placeholder — replace</span></li>
</ul>
<p>Every detail on this page is scaffolding, not a fact: put your own here before you publish.</p>`,
    body: `<p slot="footer">© ${text(siteName)} — <a href="mailto:hi@example.com">email us</a></p>`,
  });
}

/**
 * The one page in every template that opts out of the layout (SCF-01):
 * `data-layout="none"` on `<body>`, a complete standalone document since no
 * layout will supply its head or chrome — which is why every site-wide
 * declaration `layoutHtml` makes is repeated here by hand, `lang` included.
 *
 * It declares `noindex` and no `schema`: this is the one page of the site
 * that asks crawlers to ignore it, so generating structured data for it
 * would describe an entity nobody should index. `404.html` is exempt from
 * `page-orphan` (§24.4) for the same reason nothing links to it.
 *
 * `siteName` is REQUIRED and deliberately has no default. It carried one
 * (`"this site"`) so that a caller who forgot would not emit `undefined`,
 * and the flagship template then called this with no argument at all and
 * shipped `<title>Page not found — this site</title>` while every other
 * page said "My Site". Nothing reported it: a title that is wrong but
 * present is not a finding, so a plausible default hides exactly the slip
 * it was added to soften. `required()` above is the general form.
 *
 * @param {string} siteName
 * @returns {string}
 */
export function notFoundHtml(siteName) {
  required("siteName", siteName);
  const description = `That address does not match a page on ${siteName}.`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Page not found — ${text(siteName)}</title>
    <meta name="description" content="${attr(description)}">
    <link rel="stylesheet" href="/assets/style.css">
    <meta name="robots" content="noindex">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Page not found">
    <meta property="og:description" content="${attr(description)}">
    <meta property="og:image" content="${SHARE_IMAGE.url}">
    <meta property="og:image:width" content="${SHARE_IMAGE.width}">
    <meta property="og:image:height" content="${SHARE_IMAGE.height}">
  </head>
  <body data-layout="none">
    <h1>Page not found</h1>
    <p>The page you were looking for doesn't exist. <a href="/">Go home</a>.</p>
  </body>
</html>
`;
}

/**
 * The starter stylesheet. Two rules earn their place beyond looking
 * presentable: `slot { display: contents }` is design-time preview only —
 * it keeps a layout opened directly in a browser from getting an extra box
 * around a slot's fallback, and built pages never contain a `<slot>`
 * element for it to match (SCF-02) — and `.placeholder` marks invented copy
 * as invented (§19.7).
 *
 * @returns {string}
 */
export function styleCss() {
  return `:root {
  color-scheme: light dark;
  font: 100%/1.5 system-ui, sans-serif;
}

body {
  max-width: 42rem;
  margin: 0 auto;
  padding: 1.5rem;
}

nav a {
  margin-right: 1rem;
}

.site-footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid #88888880;
  font-size: 0.875rem;
}

/* Scaffolded copy nobody should publish: conspicuous on purpose, so a
   reader cannot mistake an invented name, date, price, or address for a
   fact. Delete the class along with the text it marks. */
.placeholder {
  border: 1px dashed;
  border-radius: 0.25em;
  padding: 0 0.25em;
  font-style: italic;
  opacity: 0.8;
}

/* Design-time preview only — built pages contain no <slot> elements. */
slot {
  display: contents;
}
`;
}

/**
 * A minimal, honest `robots.txt` at the source root (§19.2 item 5). unify
 * never decides what a site should block (§23), so this one blocks nothing
 * and exists to be edited.
 *
 * It carries NO `Sitemap:` line. A scaffold ships no sitemap, and §21.1
 * generates one only under `--base-url` — so a live `Sitemap:` line would
 * name a file this build was not asked to write, which §23.3 exempts from
 * the reference check and `audit` then reports as `robots-sitemap-missing`
 * (§24.4). That is a finding in a fresh scaffold, and §19.3 has none. The
 * commented line teaches the same thing without being one: §23.2 reads a
 * `#` line as a comment, so nothing parses it.
 *
 * @returns {string}
 */
export function robotsTxt() {
  return `# What crawlers may fetch. This file blocks nothing — unify never decides
# what a site should block, and a scaffold knows even less. Edit it freely.
User-agent: *
Disallow:

# A Sitemap: line has to name a file this site actually publishes.
# \`unify build --base-url https://you.example/\` writes dist/sitemap.xml (see
# DEPLOY.md); once you build that way, uncomment the next line and put your
# own address in it.
# Sitemap: https://you.example/sitemap.xml
`;
}

/**
 * The two files §19.2 requires of **every** template that take no parameter
 * from it: the share image (item 4) and `robots.txt` (item 5).
 *
 * They are merged into every entry of the registry (src/templates/index.js)
 * as well as being part of `commonFiles` below, and the reason is §19.3's
 * own history: every template shipped between seven and thirteen findings
 * because each was written separately, and a requirement that five
 * separate files must each remember is one that will eventually be
 * forgotten.
 * A template that wants its own `robots.txt` still wins — the registry
 * merges the template's keys over these — so nothing is taken away.
 *
 * @type {Record<string, string|Uint8Array>}
 */
export const TEMPLATE_BASE_FILES = {
  [SHARE_IMAGE.path]: SHARE_IMAGE.bytes,
  "robots.txt": robotsTxt(),
};

/**
 * Every file that is identical in all five templates, ready to spread into
 * a template's own map:
 *
 *     export const files = {
 *       ...commonFiles(SITE_NAME, [["Home", "/"], ["Contact", "/contact.html"]]),
 *       "index.html": pageHtml({ … }),
 *     };
 *
 * The share image's value is a `Uint8Array`, not a string — §19.5's raw
 * bytes, written verbatim by `init`.
 *
 * @param {string} siteName
 * @param {[string, string][]} navLinks
 * @returns {Record<string, string|Uint8Array>}
 */
export function commonFiles(siteName, navLinks) {
  required("siteName", siteName);
  return {
    "_layout.html": layoutHtml(siteName),
    "_includes/nav.html": navHtml(navLinks),
    "contact.html": contactHtml(siteName),
    "404.html": notFoundHtml(siteName),
    "assets/style.css": styleCss(),
    ...TEMPLATE_BASE_FILES,
  };
}

// --------------------------------------------------- project-root files (§19.4)

/**
 * `AGENTS.md` — product-spec §6.7's repository-local guidance, required of
 * every template and written to the PROJECT ROOT, outside the source
 * root, so it cannot publish (§19.4).
 *
 * It repeats only the high-conflict rules §19.4 enumerates, and it states
 * no behavior the author-facing documents do not: **one rule
 * set, three audiences**, never a tool-specific variant. Every claim below
 * is a restatement of an authoring rule — when that file changes and this
 * one disagrees, this one is wrong.
 *
 * @returns {string}
 */
export function agentsMd() {
  return `# Working on this site

This site is built by [unify](https://github.com/fwdslsh/unify): plain HTML composed at build time.
No template language, no variables, no loops, no config — if you reach for \`{{ }}\`, \`{% %}\`, props,
or a config key, the answer here is a different shape.

Below are the rules that get guessed wrong most often. They are the same rules unify's own
documentation states — one rule set, three audiences — not a variant for agents. The
inner loop is \`unify dev\` (build, watch, serve on localhost, reload), which also serves
\`http://localhost:3000/_unify/\` — every \`unify audit\` finding grouped by page, with that page's
title, description, language, canonical, headings and links beside it, and the build's own
diagnostics underneath. Nothing about it is written to \`dist/\`. \`unify --help\` lists every
command and flag there is.

## Finish by checking, and read the exit code

    unify build --dry-run --strict    # the whole build and every check, writing nothing
    unify audit --strict              # evaluates the site the build would publish; writes nothing

Exit 0 from \`unify build\` means \`dist/\` is the complete site. Non-zero means **nothing was
published** and the previous \`dist/\` is untouched — never report success on a non-zero exit.

## Files

- The source root is \`src/\`. **Everything in it ships**, at the same path: \`.html\` and \`.md\` are
  pages, and every other file is copied byte-for-byte.
- A leading underscore keeps a file or a whole directory out of the output — \`_layout.html\`,
  \`_includes/\`, \`_drafts/\`. The build still reads it; \`dist/\` never contains it. Files inside a
  \`_\` directory need no prefix of their own.
- To hold a page back, prefix its name with \`_\`. \`draft:\` in frontmatter is an **error** — unify
  has no draft mechanism, so a page carrying it would publish; the build says so and stops.
- To change a page's address, rename or move the source file. \`permalink:\` and \`slug:\` are
  **errors** for the same reason: a page's address is its source path, and a key that quietly
  changed nothing would look like it worked.
- \`tags:\` and \`categories:\` are allowed and become ordinary \`<meta>\` tags, but they build
  nothing — there are no collections and no taxonomies, and \`unify audit\` says so out loud.
- Link the real file: \`/about.html\`, never \`/about/\`. A directory link resolves only if you wrote
  \`about/index.html\`. A leading \`/\` means the source root, in any path you write.
- Derived files — a post index — come from a script you write and run yourself. From this
  directory, with the source tree in \`src/\`, that is \`node src/_scripts/gen.mjs && unify build\`.
  A feed is the one exception: declare \`schema: Article\`/\`BlogPosting\` (below) and build with
  \`--base-url\`, and unify writes \`feed.xml\` itself — no script, unless you ship your own
  (an authored \`feed.xml\` always wins and generates nothing).

## Composition

- Every page is wrapped by the nearest \`_layout.html\` — its own folder, then each parent. Choose a
  different one with \`data-layout="/path.html"\` on the page's \`<html>\` or \`<body>\` (Markdown:
  \`layout: /path.html\`); opt out with \`data-layout="none"\`. Layouts are **paths ending in .html** —
  a bare name like \`default\` is an error — and they do not chain: \`data-layout\` on a layout is an
  error, because a section layout is a complete standalone page.
- \`<include src="/_includes/nav.html"></include>\` splices a file in verbatim, always with the
  closing tag. **Never put content between the tags**: an include is not a component, takes no
  props, and merges no attributes.
- The layout's bare \`<slot></slot>\` — usually inside its \`<main>\` — receives everything the page
  did not address elsewhere. A \`<main>\` you wrote is unwrapped and its children used, so write
  complete semantic documents.
- A named slot \`<slot name="footer">fallback</slot>\` is filled by \`slot="footer"\` on a real
  element of the page, which replaces the slot tag and all. A \`<slot>\` tag written in a *page*
  fills nothing. Fills count on direct children of \`<body>\` (or of your \`<main>\`, unwrapped
  first). Omit the fill and the fallback ships.
- Heads merge: the layout's is the base, your \`<title>\` is joined in front of the layout's
  (the separator lives in the layout — \`<title>— My Site</title>\`, and a page writes just
  \`<title>About</title>\`), your \`<meta>\` replaces the layout's with the same \`name\`/\`property\`,
  and everything else appends. On \`<html>\`/\`<body>\` your classes are added and any other attribute
  you set wins; attributes merge nowhere else.

## Metadata, without inventing anything

- Give every page its own \`<title>\` and \`<meta name="description">\`, different from every other
  page's, and one \`<h1>\` the title contains (or is contained by). \`unify audit\` reports each of
  those gaps, plus pages nothing links to, duplicate ids, and fragment links that name nothing.
- \`--base-url\` is the site's **whole public address** — \`https://you.example/handbook/\`, never a
  bare path. It prefixes root-relative links, makes \`og:\` and canonical URLs absolute for share
  crawlers, and generates \`sitemap.xml\`. See \`DEPLOY.md\`.
- A canonical is one page's own address, so a layout must never set one and a scaffold cannot know
  it. Build with \`--base-url … --canonical auto\`, or write it on that one page by hand.
- \`<meta name="schema" content="WebPage">\` — or \`schema: Article\` in Markdown frontmatter; those
  three spellings exactly, \`WebPage\`, \`Article\`, \`BlogPosting\` — has unify write that page's
  JSON-LD from what the page already declares: title, description, canonical, \`og:image\`,
  \`author\`, \`date\`, \`lastmod\`, \`lang\`. Nothing else is added and **nothing is guessed** — a date
  it cannot read as \`2026-01-02\` or \`2026-01-02T09:30:00Z\` is left out and reported, never filled
  in from the clock, the filesystem, or Git. Write your own \`<script type="application/ld+json">\`
  for any other type or more detail: yours wins, and unify then generates nothing.
- unify rewrites only HTML's own URL attributes (\`href\`, \`src\`). A \`url()\` in CSS and a
  \`fetch()\`/\`hx-get\` address ship exactly as written.
- **Never invent a fact to fill a field.** The placeholders in this scaffold — the site name, the
  contact details, \`src/assets/share-placeholder.png\` — are there to be replaced, not published.
`;
}

/**
 * `DEPLOY.md` — the deployment recipe, the second project-root file (§19.4).
 * §19.2's item 4 (the share image's real dimensions) and item 7 (no
 * canonical in a scaffold) both defer to it, so it carries both, and it
 * ends in the two commands that carry the site's address.
 *
 * @returns {string}
 */
export function deployMd() {
  return `# Publishing this site

\`unify build\` writes the whole site to \`dist/\`. There is nothing to run in production: \`dist/\` is
plain files, so any static host serves it — GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket,
or a directory on a server you already have.

## 1. Replace the placeholders

Nothing a scaffold writes is a fact about you. **The site's name is written in more than one file**,
and the ones a build never corrects are the ones that publish it anyway — so this list names every
one of them rather than the first:

- **the site's name and byline** — \`src/_layout.html\` (the title suffix and the footer), and then
  \`src/index.html\`, \`src/404.html\` and \`src/contact.html\`, which each write it into their own
  visible text and their own \`description\`. Grep the scaffolded name once and you will find them
  all: \`grep -rn 'My Site' src/\`, with whichever name your template shipped;
- **the contact details** on \`src/contact.html\` — a reserved \`example.com\` address, and no postal
  address at all, because a plausible street address in a scaffold is one an author publishes;
- **a generator's own constants**, if your source tree has one. The blog template's
  \`src/_scripts/gen.mjs\` opens with \`SITE_NAME\`, \`SITE_URL\` and \`LISTING_DESCRIPTION\`.
  \`SITE_URL\` is a placeholder domain (\`https://you.example\`) and it has to match the
  \`--base-url\` you build with, because a feed's links are **absolute**: nothing in unify rewrites
  them, the reference check never follows them off-origin, and \`unify audit\` sees a mirror-copied
  asset. Edit those and **rerun the script** (step 3), or \`feed.xml\` will go on advertising a
  domain you do not own on every page that links to it;
- \`src/assets/share-placeholder.png\` — a flat 1200×630 placeholder card, not a photograph. It is
  the image social crawlers show. Replace the file, and **if your image is a different size,
  correct \`og:image:width\` and \`og:image:height\` in \`src/_layout.html\` to match it**: a declared
  size the file contradicts is a claim nothing else will ever catch;
- \`src/robots.txt\`, which blocks nothing. Edit it if you need to — unify never decides what a site
  should block.

## 2. Check before you publish

    unify build --dry-run --strict    # the whole build and every check, writing nothing
    unify audit --strict              # what a reader or a crawler would find missing

A fresh scaffold passes both. Keep it that way as you add pages: every page wants its own title,
description, and single \`<h1>\`, and a link in from somewhere.

## 3. Build with your address

\`--base-url\` is the site's whole public address, never a bare path. It prefixes every
root-relative link, makes \`og:\` and canonical URLs absolute — which is what share crawlers fetch —
and writes \`dist/sitemap.xml\`. Add \`--canonical auto\` and every page that authors no canonical of
its own gets one naming its own final URL; an authored canonical always wins.

Hosting the site under a subpath? Name the whole thing, trailing slash included:
\`--base-url https://you.example/handbook/\`.

If your source tree has a generator — the blog template's \`src/_scripts/gen.mjs\` — run it first,
so the derived pages are current. Every command in this file runs from here, the project root, so
the script's path starts at \`src/\` too: \`node src/_scripts/gen.mjs && unify build …\`.

## 4. Publish \`dist/\`

Whatever your host reads is the last step, and it is not a unify command. Copy the directory
(\`rsync\`, \`scp\`), push it to a Pages branch, or hand it to your host's own CLI — for example
\`npx wrangler pages deploy dist\` or \`netlify deploy --prod --dir=dist\`. In CI, run the two checks
from step 2 first and let a non-zero exit stop the deploy.

## The two commands

    unify build --base-url https://you.example/ --canonical auto
    rsync -av --delete dist/ you@your-host.example:/var/www/your-site/
`;
}

/**
 * The two files that scaffold at the **project root** rather than under the
 * source root (§19.4) — mapped by their project-root-relative path.
 *
 * They are kept out of the per-template maps in `src/templates/*.js`
 * deliberately, and that IS the distinction the registry needs: every key
 * of a template's map is source-root-relative and every one of them ships,
 * so a project-root file could only be spelled there as an escape (`../`)
 * out of the tree `init` was told to write into. These two are identical
 * for all five templates — §19.4's "one rule set, three audiences" makes
 * `AGENTS.md` template-independent by definition, and the deployment recipe
 * is the same site-agnostic four steps — so one map, consumed by
 * `src/cli/commands/init.js` beside whichever template was chosen, is the
 * whole mechanism. A future per-template root file is the day to give the
 * registry a second field; nothing needs one yet.
 *
 * @type {Record<string, string>}
 */
export const ROOT_FILES = {
  "AGENTS.md": agentsMd(),
  "DEPLOY.md": deployMd(),
};
