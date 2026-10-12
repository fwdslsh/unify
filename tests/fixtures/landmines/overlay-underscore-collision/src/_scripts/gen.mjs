import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// §33.4 — the same virtual paths the author already wrote, both of them paths
// that never publish. Neither tree wins: a fragment and a layout in both trees
// are P12, not a precedence question.
const out = process.argv[3];
mkdirSync(join(out, "_includes"), { recursive: true });

writeFileSync(join(out, "_includes", "badge.html"), `<p class="badge">Generated badge.</p>\n`);

writeFileSync(join(out, "_layout.html"), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>— Generated</title>
  </head>
  <body>
    <main></main>
  </body>
</html>
`);
