/**
 * `unify init docs` — a small documentation site. Its one structural
 * difference from the other templates is `guide/`: two ordinary Markdown
 * pages nested a directory down, declaring no layout of their own, so
 * layout discovery is shown walking up more than one directory level —
 * `src/guide/` holds no `_layout.html`, so the walk climbs to the source
 * root, which does (conformance-spec §6.1 step 4). Every §19.1 primitive
 * still appears exactly once — the nav `<include>`, the automatic root
 * `_layout.html`, the named "footer" slot plus the one page filling it, the
 * `data-layout="none"` page, and `_includes/` — and all six come from
 * `commonFiles()` (src/templates/shared.js), which is also where the
 * site-wide half of §19.2's discovery set lives: `<html lang>`, the
 * `og:image` set carrying the shipped placeholder's real pixel dimensions,
 * the `schema` declaration, and `robots.txt`.
 *
 * What this file owns is the per-page half, and §19.3's second guarantee is
 * why it looks the way it does: `unify init docs && unify audit --strict`
 * exits 0, and `--strict` gates on ANY finding of either severity (§24.6).
 * So each page below carries its own `<title>`, its own one-sentence
 * `<meta name="description">` that no other page repeats, its own
 * `og:title`/`og:description`, and exactly one `<h1>` the emitted title
 * contains — `Installation` under a layout titled `— Project Docs` emits
 * `Installation — Project Docs`, which contains the heading (§24.4's
 * containment test landing on §8 row 2's prepend). This template used to
 * ship `<title>Home</title>` over `<h1>Welcome!</h1>`, which matched
 * neither way round, and no description on any page at all.
 *
 * Two things it teaches that no other template can:
 *
 * 1. **A nested page needs nothing.** Neither `guide/*.md` names a layout,
 *    a section, or a path. The walk starts in `src/guide/`, finds no
 *    `_layout.html` there, and keeps going up until it does — so the one at
 *    the source root wraps both. Adding `src/guide/_layout.html` later is
 *    how that section gets its own chrome, and it is a complete standalone
 *    page because layouts do not chain (§6.2, P15).
 * 2. **A Markdown heading is a link target.** §10.4 gives every heading a
 *    slug id, so `getting-started.md` can link
 *    `/guide/installation.html#prerequisites` and name the `## Prerequisites`
 *    heading in the file beside it. That deep link is a checked reference
 *    rather than a hopeful one: §12 resolves the path and `unify audit`
 *    reports a fragment naming no id (`fragment-missing`).
 *
 * Nothing here declares a canonical (§19.2 item 7) — a canonical is one
 * page's own absolute address, which a scaffold cannot know; `DEPLOY.md`
 * teaches `--base-url … --canonical auto` instead. And nothing here states
 * a fact about a project that does not exist (§19.7): the site name is a
 * generic placeholder, the guide's prose is addressed to the author who
 * will replace it, and the two commands it shows are fill-in-the-blanks
 * (`<your package manager>`) rather than an invented package name a reader
 * could mistake for a real one — or publish.
 */
import { commonFiles, mdFrontmatter, pageHtml } from "./shared.js";

const SITE_NAME = "Project Docs";

export const files = {
  // _layout.html, _includes/nav.html, contact.html, 404.html,
  // assets/style.css, assets/share-placeholder.png, robots.txt.
  ...commonFiles(SITE_NAME, [
    ["Home", "/"],
    ["Guide", "/guide/getting-started.html"],
    ["Contact", "/contact.html"],
  ]),

  "index.html": pageHtml({
    title: "Overview",
    description:
      "Where this documentation starts: what the guide covers, and where each page's layout comes from.",
    main: `<h1>Overview</h1>
<p>The documentation home for <span class="placeholder">your project — replace this</span>.
Everything you can read on this site is scaffolding: replace the words, keep the shape.</p>

<h2>The guide</h2>
<ul>
  <li><a href="/guide/getting-started.html">Getting started</a> — the first run, and what to read next.</li>
  <li><a href="/guide/installation.html">Installation</a> — what to set up before that.</li>
</ul>

<h2>How this site is put together</h2>
<p>Both guide pages are ordinary Markdown files in <code>src/guide/</code>, and neither one says
anything about a layout. unify looks for <code>_layout.html</code> in a page's own folder and then
in each folder above it, so the layout at the source root wraps pages a level down without being
asked. Put a <code>_layout.html</code> in <code>src/guide/</code> and every page under it uses that
one instead — written out in full, because layouts do not chain.</p>
<p>Add a page by dropping a <code>.md</code> or <code>.html</code> file beside them and linking it
from this list, or from <code>src/_includes/nav.html</code> to put it in the nav on every page.
<code>unify audit</code> reports a page nothing links to, along with any page missing a title, a
description, or a heading.</p>`,
  }),

  "guide/getting-started.md": `${mdFrontmatter({
    title: "Getting started",
    description: "The first run of the project this site documents — placeholder steps, and where a nested page finds its layout.",
  })}
# Getting started

Placeholder copy, describing no real project: it is here to show the shape of a guide page, and to
be deleted the moment you write your own.

Set up first — the [prerequisites](/guide/installation.html#prerequisites) are on the installation
page — then run the project:

\`\`\`
<your package manager> run dev
\`\`\`

## Where this page lives

This file is \`src/guide/getting-started.md\`, one folder below the source root, and it declares no
layout. unify looks for \`_layout.html\` in \`src/guide/\` first, finds none, and keeps walking up
until it does — so the layout at the source root supplies the nav, the head, and the footer for
this page, for the installation page beside it, and for the home page, with nothing written in any
of the three to arrange it.

Nothing about the name \`guide/\` is special to unify; it is a folder, and the pages in it are
ordinary Markdown. The one folder name that does mean something is a leading underscore, which
keeps everything inside it out of the built site.

## What to write here

Replace this section with the steps a reader takes the first time, in order, and link to
[installation](/guide/installation.html) wherever they need to stop and set something up.

Keep one \`#\` heading per page: it becomes the page's \`<h1>\`, and \`unify audit\` checks that it and
the page's title still name the same thing.
`,

  "guide/installation.md": `${mdFrontmatter({
    title: "Installation",
    description: "What to have ready before the guide's first run — placeholder setup steps waiting for your project's own.",
  })}
# Installation

Placeholder steps, waiting for the real ones. Nothing on this page is a fact about any project yet.

## Prerequisites

List what a reader must already have before they start — a runtime, a package manager, an account.
The [getting started](/guide/getting-started.html) page links straight to this heading rather than
to the top of this file: every Markdown heading becomes an anchor named after its own text, so
\`#prerequisites\` is a link target you did not have to write.

## Install

\`\`\`
<your package manager> add <your package>
\`\`\`

Then carry on with [getting started](/guide/getting-started.html).
`,
};
