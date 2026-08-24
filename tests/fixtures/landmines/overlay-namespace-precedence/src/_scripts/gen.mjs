import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Two claims in one overlay: a `_includes/badge.html` that must LOSE to the
// author's file of the same virtual path, and a `docs/_layout.html` that must
// WIN for everything in `docs/` — nearest beats precedence, because the
// namespace merges one directory at a time, not one tree at a time.
const out = process.argv[3];
mkdirSync(join(out, "_includes"), { recursive: true });
mkdirSync(join(out, "docs"), { recursive: true });

writeFileSync(join(out, "_includes", "badge.html"),
  `<p class="badge">Generated badge.</p>\n`);

writeFileSync(join(out, "docs", "_layout.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>— Docs</title>
  </head>
  <body>
    <header>Docs chrome</header>
    <main></main>
  </body>
</html>
`);

writeFileSync(join(out, "docs", "api.md"), `---
title: API
---

# API

Generated, in a directory whose layout the generator also wrote.
`);
