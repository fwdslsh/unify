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
 * single `<h1>` the emitted title contains.
 *
 * That last pairing is the thing this template used to get wrong, so it is
 * now the thing it teaches: a `<title>Home</title>` over an `<h1>Welcome!</h1>`
 * merged to `Home — My Site` and matched neither, which is §24.4's
 * `title-h1-mismatch` — a search result and the page it names disagreeing
 * about what the page is called. The heading and the title now name the same
 * thing, which is the repair the finding asks for and the smaller of the two
 * edits an author would otherwise have to guess between.
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
<code>src/_layout.html</code>, which wrapped this page at build time.</p>
<p>Edit it, add more <code>.html</code> files beside it in <code>src/</code>, and list them in
<code>src/_includes/nav.html</code> so readers can reach them. Give each new page its own
<code>&lt;title&gt;</code>, its own description, and one <code>&lt;h1&gt;</code> that says the same
thing the title does — <code>unify audit</code> reports every page that does not.</p>`,
  }),
};
