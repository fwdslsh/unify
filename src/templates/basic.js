/**
 * `unify init basic` — the bare-bones scaffold: the same primitives as
 * `default` (conformance-spec §19 / SCF-01) with no Markdown page, for
 * someone who wants the smallest possible HTML-only starting point.
 *
 * Three pages — `index.html`, `contact.html`, `404.html` — and every one of
 * them ships §19.2's discovery set, because §19.3's second guarantee is that
 * `unify init basic && unify audit --strict` exits 0. `commonFiles()` (see
 * src/templates/shared.js) supplies the site-wide half: `<html lang>`, the
 * `og:image` set carrying the shipped file's real pixel dimensions, the
 * `schema` declaration the JSON-LD block is generated from, `robots.txt`,
 * and the two pages every template shares. The one page written here
 * supplies the per-page half — its own `<title>`, its own one-sentence
 * `<meta name="description">`, its own `og:title`/`og:description`, and a
 * single `<h1>` naming the page (the heading and the title say the same
 * thing).
 *
 * No canonical anywhere (§19.2 item 7): a canonical is one page's own
 * absolute address, which a scaffold cannot know, so `DEPLOY.md` teaches
 * `--base-url … --canonical auto` instead — the place the address lives.
 */
import { commonFiles, pageHtml } from "./shared.js";

const SITE_NAME = "My Site";

export const files = {
  ...commonFiles(SITE_NAME, [
    ["Home", "/"],
    ["Contact", "/contact.html"],
  ]),

  "index.html": pageHtml({
    title: "Home",
    description: `The front page of ${SITE_NAME} — plain HTML wrapped by the shared layout, and the first file to edit.`,
    main: `<h1>Home</h1>
<p>This file holds only what you see here. The nav above and the footer below come from
<code>site/_layout.html</code>, which wrapped this page at build time.</p>
<p>Edit it, add more <code>.html</code> files beside it in <code>src/</code>, and list them in
<code>site/_includes/nav.html</code> so readers can reach them. Give each new page its own
<code>&lt;title&gt;</code>, its own description, and one <code>&lt;h1&gt;</code> — <code>unify audit</code>
reports every page that is missing one or has more than one.</p>`,
  }),
};
