---
title: Getting started
description: The first run of the project this site documents — placeholder steps, and where a nested page finds its layout.
og:title: Getting started
og:description: The first run of the project this site documents — placeholder steps, and where a nested page finds its layout.
---

# Getting started

Placeholder copy, describing no real project: it is here to show the shape of a guide page, and to
be deleted the moment you write your own.

Set up first — the [prerequisites](/guide/installation.html#prerequisites) are on the installation
page — then run the project:

```
<your package manager> run dev
```

## Where this page lives

This file is `site/guide/getting-started.md`, one folder below the source root, and it declares no
layout. unify looks for `_layout.html` in `site/guide/` first, finds none, and keeps walking up
until it does — so the layout at the source root supplies the nav, the head, and the footer for
this page, for the installation page beside it, and for the home page, with nothing written in any
of the three to arrange it.

Nothing about the name `guide/` is special to unify; it is a folder, and the pages in it are
ordinary Markdown. The one folder name that does mean something is a leading underscore, which
keeps everything inside it out of the built site.

## What to write here

Replace this section with the steps a reader takes the first time, in order, and link to
[installation](/guide/installation.html) wherever they need to stop and set something up.

Keep one `#` heading per page: it becomes the page's `<h1>`, and `unify audit` checks there is exactly one.
