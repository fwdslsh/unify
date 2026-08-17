/**
 * Shared building blocks for the `unify init` templates (conformance-spec
 * §19). Every template's `_layout.html`, nav fragment, footer-slot-filling
 * page, and 404 page follow the identical shape shown in product-spec §2 and
 * docs/getting-started.md — only the site name and nav links vary — so those
 * pieces are built here once instead of copy-pasted five times and risking
 * drift on the parts that must stay byte-identical (the charset, the include,
 * the slot comment, the `data-layout="none"` opt-out).
 *
 * Everything here is plain string data assembled at module-evaluation time.
 * Nothing reads the filesystem: the whole point is that `src/templates/**`
 * compiles into the binary as ordinary bundled JS (see src/templates/index.js).
 */

/**
 * The site chrome — one complete HTML page, always the same shape (product
 * spec §2 / conformance-spec §19 SCF-02): charset first in <head>, the
 * separator lives in <title>, one <include> for the nav, <main> as the
 * default-content sink, and one named slot ("footer") with a plain-comment
 * label above it and visible fallback content.
 *
 * @param {string} siteName - e.g. "My Site" — the layout writes "— My Site";
 *   a page's own <title> is joined in front of it by the head merge (S10).
 * @returns {string}
 */
export function layoutHtml(siteName) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>— ${siteName}</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <include src="/_includes/nav.html"></include>
    <main><slot></slot></main>
    <footer class="site-footer">
      <!-- footer: the site byline, or whatever a page puts here instead -->
      <slot name="footer"><p>© ${siteName}</p></slot>
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
 * @param {[string, string][]} links - [label, href] pairs, in nav order
 * @returns {string}
 */
export function navHtml(links) {
  const anchors = links.map(([label, href]) => `<a href="${href}">${label}</a>`).join(" ");
  return `<nav>${anchors}</nav>\n`;
}

/**
 * The one page in every template that fills the layout's named "footer"
 * slot (SCF-01) — same shape as product-spec §2's `contact.html`: ordinary
 * content plus one top-level element carrying `slot="footer"`.
 *
 * @param {string} siteName
 * @returns {string}
 */
export function contactHtml(siteName) {
  return `<!doctype html>
<html>
  <head>
    <title>Contact</title>
  </head>
  <body>
    <h1>Contact</h1>
    <p>Ordinary content as usual.</p>
    <p slot="footer">© ${siteName} — <a href="mailto:hi@example.com">email us</a></p>
  </body>
</html>
`;
}

/**
 * The one page in every template that opts out of the layout (SCF-01):
 * `data-layout="none"` on `<body>`, a complete standalone document since no
 * layout will supply its head or chrome.
 *
 * @returns {string}
 */
export function notFoundHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Page not found</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body data-layout="none">
    <h1>Page not found</h1>
    <p>The page you were looking for doesn't exist. <a href="/">Go home</a>.</p>
  </body>
</html>
`;
}

/**
 * The starter stylesheet. Design-time preview only: `slot { display:
 * contents }` keeps a layout opened directly in a browser from getting an
 * extra box around a slot's fallback — built pages never contain a <slot>
 * element for this rule to match (SCF-02).
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

/* Design-time preview only — built pages contain no <slot> elements. */
slot {
  display: contents;
}
`;
}
