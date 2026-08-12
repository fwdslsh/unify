/**
 * `unify init` (or `unify init default`) — the flagship scaffold, matching
 * product-spec §2's five-minute site and docs/getting-started.md file for
 * file. See src/templates/shared.js for the pieces every template shares.
 *
 * One deliberate deviation from product-spec §2's literal about.md snippet:
 * that snippet's `og:\n  image: /assets/team.jpg` frontmatter names an image
 * the golden path never ships (the tree listing only has assets/style.css),
 * which is a broken reference (P13) that would fail SCF-04's
 * `unify build --dry-run --strict` guarantee. Dropped here rather than
 * shipping a fabricated placeholder photo or a broken link — see the
 * implementation report for the full defect writeup.
 */
import { contactHtml, layoutHtml, navHtml, notFoundHtml, styleCss } from "./shared.js";

const SITE_NAME = "My Site";

export const files = {
  "_layout.html": layoutHtml(SITE_NAME),

  "_includes/nav.html": navHtml([
    ["Home", "/"],
    ["About", "/about.html"],
    ["Contact", "/contact.html"],
  ]),

  "index.html": `<!doctype html>
<html>
  <head>
    <title>Home</title>
  </head>
  <body>
    <main>
      <h1>Welcome!</h1>
      <p>This content lands in the layout's &lt;main&gt;.</p>
    </main>
  </body>
</html>
`,

  "about.md": `---
description: Who we are
---

# About

Everything here is converted to HTML and dropped into the layout
exactly like an HTML page's content.
`,

  "contact.html": contactHtml(SITE_NAME),

  "404.html": notFoundHtml(),

  "assets/style.css": styleCss(),
};
