import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The nav fragment the hand-authored layout includes, and a page that
// includes a hand-authored fragment back — the namespace read both ways.
const out = process.argv[3];
mkdirSync(join(out, "_includes"), { recursive: true });
mkdirSync(join(out, "posts"), { recursive: true });

writeFileSync(join(out, "_includes", "nav.html"),
  `<nav><a href="/index.html">Home</a></nav>\n`);

writeFileSync(join(out, "posts", "one.html"), `<!doctype html>
<html>
  <head><title>Post one</title></head>
  <body>
    <main>
      <p>Generated post.</p>
      <include src="../_includes/note.html"></include>
    </main>
  </body>
</html>
`);
