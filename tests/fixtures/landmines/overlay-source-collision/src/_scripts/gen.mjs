import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// §33.4 — the same virtual path the author already wrote. Unifying the
// RESOLUTION namespace must not unify the OUTPUT: neither copy wins.
const out = process.argv[3];
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "about.html"), `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>About</title></head>
  <body><main><p>Generated about page.</p></main></body>
</html>
`);
