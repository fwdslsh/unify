import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// §33.2 — argv[3] is the generated directory. Neither page names a layout:
// the whole point is that §6.1 step 4's walk finds one for them.
const out = process.argv[3];
mkdirSync(join(out, "docs"), { recursive: true });

writeFileSync(join(out, "atroot.html"), `<!doctype html>
<html>
  <head><title>At root</title></head>
  <body>
    <main><p>Generated at the overlay root.</p></main>
  </body>
</html>
`);

writeFileSync(join(out, "docs", "api.md"), `---
title: API
---

# API

Generated into a subdirectory.
`);
