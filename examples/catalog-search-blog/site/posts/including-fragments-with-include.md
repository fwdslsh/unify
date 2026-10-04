---
title: Splitting a Page with <include>
schema: BlogPosting
date: 2026-02-02T09:00:00Z
description: Composing a shared header and footer out of an include, before the layout ever runs.
tags: [unify, includes]
series: fundamentals
---

# Splitting a Page with &lt;include&gt;

`<include src="...">` is resolved before anything else — before layout,
before slots — so by the time the rest of composition runs, the tree already
looks like one document. This site's own header and footer are two small
files spliced into `_layout.html` this way, and this post's nav is one of
them: the "browse by series" links you see above are generated at build time
and included exactly like a hand-written fragment, because a generated file
and an authored one share the same path space.

Nesting works too — an included file can itself include another — as long as
nothing includes itself, directly or by a longer cycle. unify catches that
before it recurses forever and reports where the cycle closes.
