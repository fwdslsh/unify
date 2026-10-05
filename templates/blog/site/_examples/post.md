---
title: Hello, world
description: An example post — what a post file contains, and what to run after you add one.
og:title: Hello, world
og:description: An example post — what a post file contains, and what to run after you add one.
schema: BlogPosting
date: 2026-01-15T09:30:00Z
author: Your Name Here
og:type: article
---

# Hello, world

<p class="placeholder">Example post — copy this file to <code>site/posts/</code> under the name you want in its address, and edit the copy. The title, the byline and the date 2026-01-15T09:30:00Z are placeholders, not facts. Nothing under <code>_examples/</code> ships.</p>

A post is one Markdown file in `posts/`. Its frontmatter carries the title, the description, the date, and the author's name; unify reads those once, hands them to `scripts/gen.mjs` as the source page list, and the script builds the listing page out of them every time unify builds — it parses nothing itself. The author's name has to match a record in `site/_data/authors.json` — copy `site/_examples/authors.json` there and put yourself in it.

`schema: BlogPosting` asks unify to write this page's JSON-LD from what the page already declares. Nothing is guessed — a date it cannot read as `2026-01-15T09:30:00Z` is left out and reported, never filled in from the clock, the filesystem, or Git.

The listing sorts by `date`, newest first, and breaks ties by address, so two runs of the script can never disagree. The feed is unify's own: build with `--base-url` and `feed.xml` lists every page declaring `schema: BlogPosting`, this one included, with its title, description and date, and `sitemap.xml` lands beside it. The private email in `_data/authors.json` reaches neither the listing nor the feed, because only the generator reads that file and it names the fields it emits. Excluding a file cannot protect a field; only the script that writes the page can.

`blog.html` is derived: there is no copy of it in `site/` to keep fresh. `unify.yaml` names the script (`generate: scripts/gen.mjs`), so adding, editing or deleting a post and running the build from the project root is the whole job:

```
unify build
```
