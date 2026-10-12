import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// A `docs/_layout.html` that must WIN for everything in `docs/` — nearest
// decides the walk, because the namespace merges one directory at a time, not
// one tree at a time. The source tree holds `_includes/badge.html` and the
// overlay does not: the two trees never hold the same path (§33.4).
const out = process.argv[3];
mkdirSync(join(out, "docs"), { recursive: true });

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
