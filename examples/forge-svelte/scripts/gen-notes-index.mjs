// Writes notes/index.html — the course notes, newest first — into the overlay
// unify hands it. unify runs this before every build, dev rebuild and audit
// (`generate: scripts/gen-notes-index.mjs` in unify.yaml): argv[3] is the
// overlay directory, argv[4] generator-context.json, whose inputs.sourcePages
// names the source page list unify has already read — every page's title,
// date and <meta> records — so nothing here parses frontmatter, and nothing
// is written into site/. Instructors add notes; nobody has to remember to
// list them, and nobody commits the list.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , , overlay, contextPath] = process.argv;
if (!overlay || !contextPath) {
  throw new Error("gen-notes-index.mjs: unify runs this (generate: scripts/gen-notes-index.mjs in unify.yaml); run unify build to see its output");
}
const context = JSON.parse(readFileSync(contextPath, "utf8"));
const inventory = JSON.parse(readFileSync(context.inputs.sourcePages, "utf8"));

// A note is a Markdown page under notes/. `instructor` is the one <meta> its
// frontmatter synthesizes beyond the title, description and date unify reads.
const notes = inventory.pages
  .filter((p) => p.source.startsWith("notes/") && p.source.endsWith(".md"))
  .map((p) => {
    if (!p.date || !p.title) {
      // A located failure: unify stops the build and publishes nothing.
      console.error(`gen-notes-index.mjs: ${p.source} needs both "title" and "date" in frontmatter`);
      process.exit(1);
    }
    return { href: p.href, title: p.title, date: p.date, instructor: p.meta.find((m) => m.name === "instructor")?.content ?? "" };
  })
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

const escapeHtml = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const items = notes
  .map(
    (n) => `      <li>
        <a href="${n.href}">${escapeHtml(n.title)}</a>
        <time datetime="${n.date}">${n.date}</time>${n.instructor ? ` &mdash; ${escapeHtml(n.instructor)}` : ""}
      </li>`,
  )
  .join("\n");

const html = `<!doctype html>
<html>
  <head>
    <title>Course notes</title>
    <meta name="description" content="Notes from Thistleknap Forge instructors, newest first.">
    <link rel="stylesheet" href="../assets/css/site.css">
  </head>
  <body class="notes-index">
    <main>
    <h1>Course notes</h1>
    <p>
      Instructors post a note after most sessions. This list is generated from
      those notes and always sorted newest first &mdash; nobody has to remember
      to update it by hand.
    </p>
    <p>
      Thistleknap keeps every session note here, in the order they were
      written, oldest never trimmed.
    </p>
    <ul class="note-list">
${items}
    </ul>
    </main>
  </body>
</html>
`;

mkdirSync(join(overlay, "notes"), { recursive: true });
writeFileSync(join(overlay, "notes", "index.html"), html);
console.log(`gen-notes-index.mjs: wrote notes/index.html from ${notes.length} note(s)`);
