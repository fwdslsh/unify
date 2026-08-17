/**
 * `unify init basic` — the bare-bones scaffold: the same primitives as
 * `default` (conformance-spec §19 / SCF-01) with no Markdown page, for
 * someone who wants the smallest possible HTML-only starting point.
 */
import { contactHtml, layoutHtml, navHtml, notFoundHtml, styleCss } from "./shared.js";

const SITE_NAME = "My Site";

export const files = {
  "_layout.html": layoutHtml(SITE_NAME),

  "_includes/nav.html": navHtml([
    ["Home", "/"],
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
      <p>Edit this page, then add more under <code>src/</code>.</p>
    </main>
  </body>
</html>
`,

  "contact.html": contactHtml(SITE_NAME),

  "404.html": notFoundHtml(),

  "assets/style.css": styleCss(),
};
