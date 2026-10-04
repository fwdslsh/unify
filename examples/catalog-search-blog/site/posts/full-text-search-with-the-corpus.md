---
title: Full-Text Search with the Corpus
schema: BlogPosting
date: 2026-04-01T09:00:00Z
description: Building a client-side search box from --search-corpus, joined back to the catalog by path.
tags: [unify, search]
series: recipes
---

# Full-Text Search with the Corpus

`--search-corpus` writes a second, smaller file: `path` and folded visible
text, nothing else, for the same set of pages `--catalog` describes.
`search-corpus.json` carries no title and no tags on purpose — everything
else about a hit already lives in `catalog.json`, keyed by the same `path`.

The search box on this site's listing page does the simplest thing that
works: lowercase the query, filter the corpus for a substring match, and look
each hit's `path` up in the catalog to get back a title, a description, and a
link. No server, no index built ahead of time beyond the two JSON files
themselves, and no dependency — a few lines of `Array.prototype.filter` and
a `Map`.
