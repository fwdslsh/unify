---
description: "An unreleased JavaScript helper for a server-rendered table of contents, sharing Unify's Markdown heading IDs."
---

# A table of contents from Markdown

> **Unreleased:** This helper requires an unreleased Unify checkout/package. It is not available in Unify 0.11.16. No new Markdown syntax or CLI flag is involved.

A generator can read a page's headings without maintaining a second Markdown parser,
slugger, or HTML query library. `analyzeMarkdown` uses the same Markdown conversion
as the CLI, then reads the resulting HTML with Unify's document reader. You choose
which headings to list and write ordinary HTML for your design.

## The API

```js
import { analyzeMarkdown } from "@fwdslsh/unify/markdown.js";

const { headings } = analyzeMarkdown("# Guide\n\n## Setup\n\n## Setup\n");
// [{ level: 1, id: "guide", text: "Guide" },
//  { level: 2, id: "setup", text: "Setup" },
//  { level: 2, id: "setup-1", text: "Setup" }]
```

The function is synchronous and takes a string containing **one Markdown page**,
including its optional frontmatter. It returns `{ headings }`, in document order.
Each heading has a numeric `level` (1–6), an `id` (string or `null`), and plain `text`.
Each call has its own heading-ID state. Nothing is read from or written to disk.

- Markdown headings, including setext headings and headings inside lists or
  blockquotes, receive exactly the IDs the CLI assigns. Inline formatting and
  entities participate in that existing algorithm; Unicode letters are retained.
- Raw HTML headings are included too. Their authored IDs are read; a raw heading
  without an ID has `id: null`. The helper does not assign an ID to raw HTML or
  reserve its IDs when numbering Markdown headings. A conflicting authored ID
  therefore remains a conflict, just as it does in the build.
- Text uses the document reader's rules: character references decoded, inline
  markup removed, ASCII whitespace collapsed and trimmed. Image alt text can
  contribute to a Markdown heading's **ID**, but is not text content of the
  resulting HTML heading. Do not generate IDs again from the returned text.
- As in the catalog, headings are scoped to the first authored `<main>`, otherwise
  `<body>`, otherwise the converted fragment. `<template>` content is omitted.
- A non-string argument throws `TypeError`. Invalid page frontmatter (including
  unsupported `draft`/`permalink`/`slug` keys), or a literal `<head>` in the Markdown
  body, throws `SyntaxError` with the converter's message and source line. It does
  not validate layout paths, included files, links, duplicate HTML IDs, or the
  complete build. `unify build --strict` checks composition and references;
  `unify audit --strict` additionally checks findings such as duplicate IDs.

**This is not a final-page outline.** Includes and layouts have not run. The helper
does not read their headings or know whether slots later move or replace content.
Each Markdown include is converted separately and has its own ID numbering. If
you need headings after all composition, use the built page's
`document.body.headings` in `unify audit --format json` instead. There is no plugin
loader, new TOC directive, configurable slugger, or URL projection API in this MVP.

## A runnable generator

Use an npm-installed copy of the unreleased checkout, so your generator and CLI
use the same Unify package. From a project outside that checkout:

```sh
npm install --save-exact /absolute/path/to/unify-checkout
```

Create `site/guide.md`:

```markdown
---
title: Guide
description: Set up and use the project.
---
# Guide

<include src="/_generated/guide-toc.html"></include>

## Setup

Install the project.

## Everyday use

Edit, preview, and publish.
```

Create `scripts/toc.mjs`:

```js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeMarkdown } from "@fwdslsh/unify/markdown.js";

const [, , sourceRoot, overlay] = process.argv;
const { headings } = analyzeMarkdown(readFileSync(join(sourceRoot, "guide.md"), "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const items = headings.filter((h) => h.level === 2 && h.id)
  .map((h) => `<li><a href="#${esc(encodeURIComponent(h.id))}">${esc(h.text)}</a></li>`);
const toc = items.length ? `<nav aria-label="On this page"><ul>${items.join("")}</ul></nav>` : "";
mkdirSync(join(overlay, "_generated"), { recursive: true });
writeFileSync(join(overlay, "_generated/guide-toc.html"), toc);
```

Build from the project root:

```sh
npx unify build --generate ../scripts/toc.mjs --pretty-urls --strict
```

The CLI argument is relative to the source root (`site/`); a saved `generate:`
setting would be relative to `unify.yaml`. The generated include is held back by
its underscore directory. `dist/guide/index.html` contains the navigation and the
article in the first build, without a browser script. Editing the page and running
the command again regenerates its table of contents. The navigation's fragment
links work under `--base-url` too; Unify handles the page address.

For several pages, iterate the source inventory and write one TOC include per page;
each page chooses where its include appears. A site that already generates
article layouts can put this markup in its existing TOC slot instead. Neither
approach needs a second build or a second implementation of heading IDs.

## What this replaces, and what it does not

A site helper that creates a markdown-it instance, extracts inline token text,
duplicates Unify's slug/dedup loop, renders the tokens, and queries `h2[id]` can
replace that machinery with:

```js
const toc = analyzeMarkdown(source).headings
  .filter((h) => h.level === 2 && h.id)
  .map(({ id, text }) => ({ id, text }));
```

This replaces heading analysis only. Dates, reading-time policy, navigation order,
article metadata, and the site's HTML/CSS remain its own decisions. It does not
remove a generator that the site uses for those other purposes. The runnable
recipe and API boundaries are exercised in
`tests/conformance/markdown-analysis.test.js` through the real CLI and npm package.
