---
title: Composing Pages with Layouts and Slots
schema: BlogPosting
date: 2026-01-05T09:00:00Z
description: How named slots and the bare main slot combine page content with a shared layout.
tags: [unify, layouts]
series: fundamentals
---

# Composing Pages with Layouts and Slots

A layout is an ordinary HTML document with a `<slot>` in it. Content you don't
address to a named slot lands in the bare `<slot>`, or in the layout's
`<main>` if there is no bare slot at all — one rule, no template language.

A page that wants to override the footer just says so:

```html
<footer slot="footer">Custom footer for this one page.</footer>
```

Everything else about the page — the rest of its body — goes to `<main>`
untouched. Nothing here is unify-specific vocabulary: `slot` and `slot=` are
the same attributes a framework component would use, so a layout previews
its own fallback content in a plain browser with no build step at all.
