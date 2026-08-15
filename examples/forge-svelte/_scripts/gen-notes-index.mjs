// Regenerates src/notes/index.html from the frontmatter of src/notes/*.md,
// newest first. Instructors add notes; nobody has to remember to list them.
// Re-run after adding or editing a note, then run `./unify build`.
import { readdir, readFile, writeFile } from "node:fs/promises";

const NOTES_DIR = new URL("../src/notes/", import.meta.url);

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  const fields = {};
  if (!match) return fields;
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[m[1]] = value;
  }
  return fields;
}

const files = (await readdir(NOTES_DIR)).filter(
  (f) => f.endsWith(".md") && !f.startsWith("_"),
);

const notes = [];
for (const file of files) {
  const raw = await readFile(new URL(file, NOTES_DIR), "utf8");
  const fm = parseFrontmatter(raw);
  if (!fm.date || !fm.title) {
    throw new Error(`${file}: notes need both "title" and "date" in frontmatter`);
  }
  notes.push({
    file,
    href: `/notes/${file.replace(/\.md$/, ".html")}`,
    title: fm.title,
    date: fm.date,
    instructor: fm.instructor || "",
  });
}

notes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

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
  </head>
  <body class="notes-index">
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
  </body>
</html>
`;

await writeFile(new URL("index.html", NOTES_DIR), html);
console.log(`wrote src/notes/index.html with ${notes.length} note(s)`);
