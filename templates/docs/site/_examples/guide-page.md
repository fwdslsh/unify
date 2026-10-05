---
title: Getting started
description: The first run of the project this site documents — placeholder steps, and where a nested page finds its layout.
og:title: Getting started
og:description: The first run of the project this site documents — placeholder steps, and where a nested page finds its layout.
---

# Getting started

<p class="placeholder">Example guide page — copy this file into <code>site/guide/</code> under the name you want in its address, edit the copy, and link it from the home page or the nav. Nothing under <code>_examples/</code> ships.</p>

Placeholder copy, describing no real project: it is here to show the shape of a guide page, and to be
replaced the moment you write your own.

```
<your package manager> run dev
```

## Where this page lives

Once copied, this file sits one folder below the source root, and it declares no layout. unify looks for
`_layout.html` in `site/guide/` first, finds none, and keeps walking up until it does — so the layout at the
source root supplies the nav, the head, and the footer for this page and for the home page, with nothing
written in either to arrange it.

Nothing about the name `guide/` is special to unify; it is a folder, and the pages in it are ordinary
Markdown. The one folder name that does mean something is a leading underscore, which keeps everything
inside it out of the built site.

## What to write here

Replace this section with the steps a reader takes the first time, in order. Every Markdown heading becomes
an anchor named after its own text, so another page can link straight to `#what-to-write-here`.

Keep one `#` heading per page: it becomes the page's `<h1>`, and `unify audit` checks there is exactly one.
