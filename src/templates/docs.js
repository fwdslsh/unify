/**
 * `unify init docs` — a small documentation site: two Markdown pages nested
 * under `guide/`, so layout discovery is shown walking up more than one
 * level (conformance-spec §6.1 step 4) even though every primitive from
 * SCF-01 still appears exactly once (nav include, root `_layout.html`, the
 * footer slot fill, `404.html`, `_includes/`).
 */
import { contactHtml, layoutHtml, navHtml, notFoundHtml, styleCss } from "./shared.js";

const SITE_NAME = "Docs";

export const files = {
  "_layout.html": layoutHtml(SITE_NAME),

  "_includes/nav.html": navHtml([
    ["Home", "/"],
    ["Guide", "/guide/getting-started.html"],
    ["Contact", "/contact.html"],
  ]),

  "index.html": `<!doctype html>
<html>
  <head>
    <title>Home</title>
  </head>
  <body>
    <main>
      <h1>Welcome!</h1>
      <p>Start with the <a href="/guide/getting-started.html">guide</a>.</p>
    </main>
  </body>
</html>
`,

  "guide/getting-started.md": `---
title: Getting Started
description: How to install and run this project.
---

# Getting Started

Install the project, then follow along here. See [Installation](/guide/installation.html)
for the setup steps.

This page — and everything under \`guide/\` — is an ordinary Markdown page; nothing about
the folder name is special to unify. The nearest \`_layout.html\` still applies automatically,
even two levels deep.
`,

  "guide/installation.md": `---
title: Installation
description: Install the project.
---

# Installation

Describe how to install your project here, then continue to
[Getting Started](/guide/getting-started.html).
`,

  "contact.html": contactHtml(SITE_NAME),

  "404.html": notFoundHtml(),

  "assets/style.css": styleCss(),
};
