---
title: Hello, world
description: A sample post — what a post file contains, and what to run after you add one.
og:title: Hello, world
og:description: A sample post — what a post file contains, and what to run after you add one.
schema: BlogPosting
date: 2026-01-15T09:30:00Z
author: Your Name Here
og:type: article
---

# Hello, world

<p class="placeholder">Sample post — the title, the byline, and the date 2026-01-15T09:30:00Z are placeholders, not facts. Edit this file, or delete it and write your own.</p>

A post is one Markdown file in `posts/`. Its frontmatter carries the title, the description, the date, and the author's name; `scripts/gen.mjs` reads those and builds the listing page and the feed out of them, every time unify builds.

`schema: BlogPosting` asks unify to write this page's JSON-LD from what the page already declares. Nothing is guessed — a date it cannot read as `2026-01-15T09:30:00Z` or `2026-01-15T09:30:00ZT09:30:00Z` is left out and reported, never filled in from the clock, the filesystem, or Git.

`blog.html` and `feed.xml` are derived: there is no copy of either in `site/` to keep fresh. `unify.yaml` names the script (`generate: scripts/gen.mjs`), so adding, editing or deleting a post and running the build from the project root is the whole job:

```
unify build
```
