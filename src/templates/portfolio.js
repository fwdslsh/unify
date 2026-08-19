/**
 * `unify init portfolio` — a small portfolio site: a "Work" listing page
 * plus two individual project pages under `projects/`, hand-authored (unlike
 * `blog`, a portfolio's project list doesn't need a generator).
 *
 * See src/templates/shared.js for the pieces every template shares — the
 * layout, the nav fragment, `contact.html`, `404.html`, the stylesheet, the
 * share image, `robots.txt` — and for the properties `unify audit --strict`
 * checks page by page. This file supplies the per-page half: a unique title,
 * a unique description, one `<h1>`, and a link in (§19.2, §19.3).
 *
 * ── What this template teaches, beyond §19.1's primitives ───────────────
 *
 * 1. **A listing page and the pages it lists.** `work.html` is the only
 *    thing that links `projects/project-one.html` and
 *    `projects/project-two.html`, and that is what keeps them off
 *    `page-orphan` (§24.4): a nav entry is not the only way in, and a
 *    portfolio would not want one per project. Adding a project is one file
 *    plus one line on `work.html` — nothing else knows a project list
 *    exists, because nothing here is a collection.
 *
 * 2. **Where a project's facts go, with none of them invented** (§19.7).
 *    Each project page carries a `<dl>` for the two facts a portfolio entry
 *    states — the role and the year — and both values are `class="placeholder"`
 *    text saying exactly that. They are visible, so a reader meets them
 *    before publishing; a date written into a `<head>` instead would be a
 *    fact nobody ever sees and everybody ships.
 *
 * 3. **Structured data by the route that fits** (§19.2 item 6). Every page
 *    here is a `WebPage`, which `_layout.html` declares once for the whole
 *    site (§26.4), so unify writes each page's JSON-LD from what that page
 *    already declares. Nothing here declares `Article` or `BlogPosting`:
 *    both require an authored, well-formed `date` (§24.4's
 *    `schema-incomplete`, and §20.10 will not invent one), and by point 2
 *    this template has no honest date to write. A real portfolio whose
 *    projects are dated adds `schema: Article` and `date:` to the page
 *    together, once both are true. No hand-written
 *    `<script type="application/ld+json">` ships here either: §26's other
 *    route is for a vocabulary unify does not generate, and a `CreativeWork`
 *    block for a project would carry exactly the credits point 2 refuses to
 *    invent — into a place no reader ever sees them, which is the one shape
 *    §19.7 calls publishable by accident.
 *
 * 4. **A heading and a title that name the same thing.** `<h1>Home</h1>`
 *    under `<title>Home</title>`: §24.4's `title-h1-mismatch` is containment
 *    in either direction against the MERGED title ("Home — My Portfolio",
 *    §8 row 2), and the `<h1>Welcome!</h1>` this template used to ship
 *    shared no part of it — a search result and the page named different
 *    things. The title is the half that stays.
 *
 * Nothing here declares a canonical (§19.2 item 7): a canonical is one
 * page's own absolute address, which a scaffold cannot know, and a
 * placeholder domain would be a false claim on every page that shipped it.
 * `AGENTS.md` and `DEPLOY.md`, written to the project root, teach
 * `--base-url … --canonical auto` instead.
 */
import { commonFiles, pageHtml } from "./shared.js";

const SITE_NAME = "My Portfolio";

export const files = {
  // _layout.html, _includes/nav.html, contact.html, 404.html,
  // assets/style.css, assets/share-placeholder.png, robots.txt.
  ...commonFiles(SITE_NAME, [
    ["Home", "/"],
    ["Work", "/work.html"],
    ["Contact", "/contact.html"],
  ]),

  "index.html": pageHtml({
    title: "Home",
    description: `The front page of ${SITE_NAME} — a placeholder introduction, and the way in to the work.`,
    main: `<h1>Home</h1>
<p class="placeholder">Placeholder introduction — nothing on this page is a fact about anyone yet.</p>
<p>Two or three sentences about what you make and who you make it for, in your own words.</p>
<p>Then send people on: the <a href="/work.html">work</a> is the list of projects, and
<a href="/contact.html">contact</a> is how to reach you.</p>`,
  }),

  "work.html": pageHtml({
    title: "Work",
    description: "Every project in this portfolio, one page each — two placeholder entries to copy for your own.",
    main: `<h1>Work</h1>
<p>One entry per project, each linking to a page of its own. To add a project, copy a file in
<code>projects/</code>, rename it, and add a line here — there is no collection to register it with,
and nothing generates this list.</p>
<ul>
  <li><a href="/projects/project-one.html">Project One</a> — <span class="placeholder">placeholder project</span></li>
  <li><a href="/projects/project-two.html">Project Two</a> — <span class="placeholder">placeholder project</span></li>
</ul>`,
  }),

  "projects/project-one.html": pageHtml({
    title: "Project One",
    description: "A placeholder project page: the problem, what you did about it, and what changed.",
    main: `<h1>Project One</h1>
<p class="placeholder">Placeholder project — not a real credit, and not a real outcome.</p>
<p>Open with the problem somebody had. Then what you did about it, and what changed once it
shipped. Keep it to things you can show.</p>
<dl>
  <dt>Role</dt>
  <dd><span class="placeholder">your role — replace</span></dd>
  <dt>Year</dt>
  <dd><span class="placeholder">year — replace</span></dd>
</dl>
<p><a href="/work.html">Back to the work</a></p>`,
  }),

  "projects/project-two.html": pageHtml({
    title: "Project Two",
    description: "A second placeholder project page, so the pattern is visible: one file per project.",
    main: `<h1>Project Two</h1>
<p class="placeholder">Placeholder project — copy this file for the next one, and list it on the work page.</p>
<p>A second page so the shape is obvious: one file under <code>projects/</code>, one heading, its
own description in the head, and a link in from somewhere. Nothing else is required of it.</p>
<dl>
  <dt>Role</dt>
  <dd><span class="placeholder">your role — replace</span></dd>
  <dt>Year</dt>
  <dd><span class="placeholder">year — replace</span></dd>
</dl>
<p><a href="/work.html">Back to the work</a></p>`,
  }),
};
