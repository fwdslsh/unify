---
description: "Share social metadata defaults, override them per page, and optionally reuse an HTML page's title and description without repeating their values."
---

# Social metadata with ordinary HTML

Put site-wide defaults in your layout, and page-specific values in the page's head or Markdown frontmatter. Unify's normal head merge does the rest; no generator is needed. If you want to reuse an HTML page's title and description automatically, the optional recipe below adds one small generator and one include per page. These examples work with Unify 0.11.16 and are executed from this guide by `tests/conformance/social-metadata.test.js`.

## Shared defaults

Create `site/_includes/social.html`:

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="Field Notes">
<meta property="og:title" content="Field Notes">
<meta property="og:description" content="Notes from the workshop.">
<meta property="og:image" content="/assets/social.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Field Notes">
<meta name="twitter:description" content="Notes from the workshop.">
<meta name="twitter:image" content="/assets/social.png">
```

Include it in `site/_layout.html`, and add your image at `site/assets/social.png`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>— Field Notes</title>
  <include src="/_includes/social.html"></include>
</head>
<body><main></main></body>
</html>
```

The fragment is optional organization: putting its tags directly in the layout works identically. The leading underscore keeps the fragment out of the published files. Defaults belong in the **layout's** head; Unify replaces matching layout tags with page tags. It deliberately preserves repeated tags within a single head, because repeated `og:image` values can be intentional.

## Per-page overrides

An HTML page, `site/about.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <title>About</title>
  <meta name="description" content="Meet the people behind the notes.">
  <meta property="og:title" content="Meet the workshop">
  <meta property="og:description" content="The people and ideas behind Field Notes.">
  <meta name="twitter:title" content="Meet the workshop">
  <meta name="twitter:description" content="The people and ideas behind Field Notes.">
</head>
<body><h1>About</h1><p>We make things and share what we learn.</p></body>
</html>
```

Or a Markdown page, `site/start.md`:

```md
---
title: Start here
description: Find your first workshop project.
og:title: Your next project starts here
og:description: Pick a project and follow along.
twitter:title: Your next project starts here
twitter:description: Pick a project and follow along.
---
# Start here

Choose something you would like to make.
```

Build from the project root:

```sh
unify build --pretty-urls --base-url https://example.com/notes/
```

The HTML page's document title becomes `About — Field Notes`, while its social title stays `Meet the workshop`. Its description and social description are deliberately different. The Markdown page works the same way: `og:` keys become `property` tags, and `twitter:` keys become `name` tags. Both pages inherit the image, card type and site name. Omit any override to retain that layout default; changing `title` or `description` alone does not change a social tag.

Under this command, the shared image becomes `https://example.com/notes/assets/social.png`, and the HTML page gets a canonical URL of `https://example.com/notes/about/`. Do not put one page's canonical or `og:url` in the shared fragment: every page would inherit the same address. To author `og:url`, put that page's own source URL in its head (`/about.html`) or frontmatter; Unify rewrites it for pretty URLs and the base URL.

## Reuse an HTML page's title and description (optional)

Use this only when repeating values is a maintenance burden. Keep the shared layout above. Replace `site/about.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <title>Café &amp; code</title>
  <meta name="description" content="A &quot;small&quot; guide to &lt;good&gt; coffee &amp; code.">
  <meta property="og:title" content="A different title for sharing">
  <include src="/_social/about.html"></include>
</head>
<body><h1>Café &amp; code</h1><p>Bring a mug and something to make.</p></body>
</html>
```

Create `scripts/social.mjs` beside `site/`:

```js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [, , , overlay, contextPath] = process.argv;
const context = JSON.parse(readFileSync(contextPath, "utf8"));
const { pages } = JSON.parse(readFileSync(context.inputs.sourcePages, "utf8"));
const esc = (value) => String(value).replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

for (const page of pages.filter((page) => page.source.endsWith(".html"))) {
  const tags = [
    ["property", "og:title", page.title],
    ["property", "og:description", page.description],
    ["name", "twitter:title", page.title],
    ["name", "twitter:description", page.description],
    ["property", "og:url", page.href],
  ].filter(([attribute, key, value]) => value !== null &&
    !page.meta.some((meta) => meta[attribute]?.toLowerCase() === key));
  const output = join(overlay, "_social", page.source);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, tags.map(([attribute, key, value]) =>
    `<meta ${attribute}="${key}" content="${esc(value)}">`).join("\n") + "\n");
}
```

Run one build; the generator path on the CLI is relative to the source root:

```sh
unify build --generate ../scripts/social.mjs --source-inventory --pretty-urls --base-url https://example.com/notes/
```

The document title is `Café & code — Field Notes`. The authored Open Graph title wins, Twitter uses `Café & code`, and both social descriptions use the description written once in the page. HTML escaping preserves quotes, ampersands and angle brackets as text. The generated `og:url` goes through Unify's own URL rewriting; this script does not implement routing. All tags are in the built HTML, with no browser script required.

To use this on another HTML page, add the matching include: `guides/coffee.html` uses `/_social/guides/coffee.html`. Keep per-page title, description and social overrides **directly in that page's head**. The [source inventory](../integrations.md#source-facts-or-final-facts) reads the page before includes and layouts; it cannot see metadata inside a page-head include. The script emits only missing social tags, avoiding duplicates with direct overrides. Missing title or description means no generated fallback for that field, so the layout's default remains.

**Markdown and single-source values.** This optional script handles HTML pages only. Markdown uses the frontmatter example above: it cannot include a generated `<head>` fragment. Slots accept markup and do not substitute frontmatter values into attributes. Automatically reusing one value across Markdown metadata fields needs generated frontmatter/pages or a generated per-page layout carrying those tags. This recipe does not add that machinery; use explicit frontmatter unless the repetition justifies it. If your site [already generates pages](../integrations.md#3-an-external-cms-over-the-source-tree), reuse title and description while producing their head tags or frontmatter there instead.

Unify runs **one** generator: add this task to the existing generator if you have one. The generated `_social/` files are temporary build inputs and are never published or edited by hand.
