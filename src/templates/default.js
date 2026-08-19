/**
 * `unify init` (or `unify init default`) — the flagship scaffold, matching
 * product-spec §2's five-minute site and docs/getting-started.md file for
 * file. See src/templates/shared.js for the pieces every template shares,
 * and for the properties `unify audit --strict` checks page by page.
 *
 * ── Deliberate deviations from the two documents' literals ──────────────
 *
 * Each one is §19.2's discovery set landing on a snippet written before it
 * existed, and each is forced by §19.3's second guarantee (`unify init &&
 * unify audit --strict` exits 0). Every snippet stays correct about the
 * primitive it was written to teach; what changes is metadata beside it.
 *
 * 1. **Every page carries a `<meta name="description">`**, and the
 *    `og:title`/`og:description` pair beside it (§19.2 items 2 and 4).
 *    No snippet of `index.html` or `contact.html` in either document shows
 *    one. Without them a one-second-old scaffold reports
 *    `description-missing` on every page it wrote.
 *
 * 2. **`index.html`'s heading is `<h1>Home</h1>`, not `<h1>Welcome!</h1>`.**
 *    §24.4's `title-h1-mismatch` is containment in either direction, and
 *    the emitted title `Home — My Site` contains no part of `Welcome!` —
 *    a search result and the page would name different things. The title
 *    is the half that stays, so both documents' built-result literal,
 *    `<title>Home — My Site</title>`, is still exactly what this template
 *    emits; only the heading text moved to agree with it. The paragraph
 *    under it is the documented one, unchanged.
 *
 *    This one is no longer a deviation: README.md, product-spec §2 and
 *    getting-started.md now show `<h1>Home</h1>` too. They were reconciled
 *    rather than left drifting because their snippet is introduced as what
 *    `unify init` writes, and the old pairing is *precisely* the input
 *    `title-h1-mismatch` fires on — a reader copying it got a finding from
 *    a command the same page tells them to run.
 *
 * 3. **`about.md` declares `title: About`** — product-spec §2's snippet
 *    does; docs/getting-started.md's omits it to teach that the first
 *    `# Heading` supplies the title when frontmatter does not. Both
 *    produce `About — My Site` here; the explicit key is what lets this
 *    page state its own `og:title` (item 4), which a derived title cannot.
 *
 * 4. **`about.md` does not carry getting-started.md's `og:` block**
 *    (`og:\n  image: /assets/team.jpg`). That names an image the golden
 *    path never ships — the tree listing has only `assets/style.css` — so
 *    it is a broken reference (P13) that fails SCF-04 outright. Shipping a
 *    fabricated team photograph to satisfy it is exactly what §19.7
 *    forbids. The snippet's real subject, a share image with honest
 *    dimensions, is met site-wide instead: `_layout.html` declares
 *    `og:image` with `og:image:width`/`og:image:height` read from the
 *    1200×630 placeholder card the template really ships (§19.2 item 4).
 *
 * Nothing here declares a canonical (§19.2 item 7): a canonical is one
 * page's own absolute address, which a scaffold cannot know. `AGENTS.md`
 * and `DEPLOY.md`, written to the project root, teach
 * `--base-url … --canonical auto` instead.
 */
import { commonFiles, mdFrontmatter, pageHtml } from "./shared.js";

const SITE_NAME = "My Site";

export const files = {
  // _layout.html, _includes/nav.html, contact.html, 404.html,
  // assets/style.css, assets/share-placeholder.png, robots.txt.
  ...commonFiles(SITE_NAME, [
    ["Home", "/"],
    ["About", "/about.html"],
    ["Contact", "/contact.html"],
  ]),

  "index.html": pageHtml({
    title: "Home",
    description: `The front page of ${SITE_NAME} — scaffolded starter copy, waiting to be replaced with your own.`,
    main: `<h1>Home</h1>
<p>This content lands in the layout's &lt;main&gt;.</p>`,
  }),

  "about.md": `${mdFrontmatter({ title: "About", description: "Who we are" })}
# About

Everything here is converted to HTML and dropped into the layout
exactly like an HTML page's content.
`,
};
