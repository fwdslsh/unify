---
title: Generating a Machine-Readable Catalog
schema: BlogPosting
date: 2026-03-10T09:00:00Z
description: What --catalog writes, and how the listing page on this site reads it.
tags: [unify, catalog]
series: recipes
---

# Generating a Machine-Readable Catalog

`unify build --catalog` writes `assets/unify/catalog.json`: one entry per
public page, carrying its `path`, its resolved `url`, and the same head and
body facts `unify audit` itself reads — title, meta, headings. Nothing is
sorted for you, and there's no body text in it; a browse UI does its own
sorting and its own rendering, entirely in the browser, against a file
written once at build time.

The listing page on this very site is built from nothing else: it fetches
`catalog.json`, filters to pages declaring `schema: BlogPosting`, sorts
newest-first by each page's own `date`, and renders a tag and series facet
from whatever frontmatter keys the posts happen to declare. Add a post with a
new tag and the facet picks it up with no code change, because the tag was
never registered anywhere — it just showed up in a `<meta>` tag the same way
any frontmatter key does.
