---
title: Writing Posts in Markdown, with Frontmatter as Data
schema: BlogPosting
date: 2025-12-01T09:00:00Z
description: Frontmatter is metadata, made meaningful only by whatever reads it back.
tags: [unify, markdown]
---

# Writing Posts in Markdown, with Frontmatter as Data

unify has no schema for frontmatter beyond a handful of reserved keys
(`title`, `layout`, `class`, `lang`, `dir`). Everything else you write —
`tags`, `series`, a `description`, a made-up key nobody else uses — becomes a
`<meta>` tag on the built page, in declaration order, and that's the whole
contract.

This post doesn't declare a `series`, on purpose: not every post has to
belong to one, and the listing page's series filter simply doesn't offer one
for it. Metadata is inert until something reads it; nothing about unify
requires a post to carry any particular shape of frontmatter beyond what the
consumer — here, `assets/js/blog.js` — actually looks for.
