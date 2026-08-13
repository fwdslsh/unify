// Generates derived pages from varieties.json and from the seasonal-notes
// entries. Run with `node src/_scripts/gen.mjs` before `unify build`.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..");
const ROOT = path.resolve(SRC, "..");

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Variety pages + catalogue index, from varieties.json
// ---------------------------------------------------------------------------
const catalogue = JSON.parse(readFileSync(path.join(ROOT, "varieties.json"), "utf8"));
const varieties = catalogue.varieties
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name));

function variantPageHtml(v) {
  const title = esc(v.name);
  const desc = `${esc(v.name)} — ${esc(v.family)}, sown ${esc(v.sow)}, ready in about ${v.days_to_maturity} days. Available from Fernhollow Seed Library.`;
  return `<!doctype html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta name="description" content="${desc}">
    <meta property="og:title" content="${title} — Fernhollow Seed Library">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="/assets/card.svg">
  </head>
  <body>
    <main>
      <p><a href="/catalogue/index.html">&larr; Back to the full catalogue</a></p>
      <h1>${title}</h1>
      <p class="family">${esc(v.family)}</p>

      <p>Fernhollow keeps ${esc(v.packets_available)} packets of ${title} on the
      shelf this season.</p>

      <table>
        <tbody>
          <tr><th scope="row">Family</th><td>${esc(v.family)}</td></tr>
          <tr><th scope="row">Typical season</th><td>${esc(v.season)}</td></tr>
          <tr><th scope="row">Sow</th><td>${esc(v.sow)}</td></tr>
          <tr><th scope="row">Days to maturity</th><td>about ${v.days_to_maturity} days</td></tr>
          <tr><th scope="row">Packets available</th><td>${v.packets_available}</td></tr>
        </tbody>
      </table>

      <p>${esc(v.notes)}</p>

      <p>To borrow ${title}, come to a Saturday opening — see
      <a href="/how-lending-works.html">how lending works</a> for the details, or
      check <a href="/availability.html">current availability</a> first.</p>
    </main>
  </body>
</html>
`;
}

for (const v of varieties) {
  writeFileSync(path.join(SRC, "varieties", `${v.slug}.html`), variantPageHtml(v));
}

const families = [...new Set(varieties.map((v) => v.family))].sort();

const cardsHtml = varieties
  .map(
    (v) => `        <li class="variety-card" data-name="${esc(v.name.toLowerCase())}" data-family="${esc(v.family)}">
          <h3><a href="/varieties/${v.slug}.html">${esc(v.name)}</a></h3>
          <p class="family">${esc(v.family)}</p>
          <p>${esc(v.packets_available)} packets available &middot; sow ${esc(v.sow)}</p>
        </li>`
  )
  .join("\n");

const familyButtonsHtml = [`        <button type="button" data-family="all" aria-pressed="true">All</button>`]
  .concat(
    families.map(
      (f) => `        <button type="button" data-family="${esc(f)}" aria-pressed="false">${esc(f)}</button>`
    )
  )
  .join("\n");

const catalogueHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Catalogue</title>
    <meta name="description" content="This season's full seed catalogue at Fernhollow Seed Library — ${varieties.length} varieties across ${families.length} families.">
  </head>
  <body>
    <main>
      <h1>This season's catalogue</h1>
      <p>Fernhollow keeps ${varieties.length} varieties on the shelf this season,
      across ${families.length} families. Narrow the list below, or browse the
      whole thing.</p>

      <div class="filters">
        <input type="search" id="q" placeholder="Search by name…" aria-label="Search varieties by name">
        <div class="family-filter" id="family-filter" role="group" aria-label="Filter by family">
${familyButtonsHtml}
        </div>
      </div>

      <p id="count" aria-live="polite"></p>

      <ul class="variety-grid" id="variety-grid">
${cardsHtml}
      </ul>

      <p id="no-results" hidden>No varieties match that search.</p>
    </main>
    <script>
      (function () {
        var q = document.getElementById("q");
        var grid = document.getElementById("variety-grid");
        var cards = Array.prototype.slice.call(grid.querySelectorAll(".variety-card"));
        var buttons = Array.prototype.slice.call(document.querySelectorAll("#family-filter button"));
        var countEl = document.getElementById("count");
        var noResults = document.getElementById("no-results");
        var activeFamily = "all";

        function apply() {
          var term = q.value.trim().toLowerCase();
          var shown = 0;
          cards.forEach(function (card) {
            var matchesFamily = activeFamily === "all" || card.getAttribute("data-family") === activeFamily;
            var matchesTerm = term === "" || card.getAttribute("data-name").indexOf(term) !== -1;
            var show = matchesFamily && matchesTerm;
            card.hidden = !show;
            if (show) shown++;
          });
          countEl.textContent = shown + " of " + cards.length + " varieties shown";
          noResults.hidden = shown !== 0;
        }

        q.addEventListener("input", apply);
        buttons.forEach(function (btn) {
          btn.addEventListener("click", function () {
            buttons.forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
            btn.setAttribute("aria-pressed", "true");
            activeFamily = btn.getAttribute("data-family");
            apply();
          });
        });

        apply();
      })();
    </script>
  </body>
</html>
`;

writeFileSync(path.join(SRC, "catalogue", "index.html"), catalogueHtml);

// ---------------------------------------------------------------------------
// Availability page (bare, no chrome), from varieties.json
// ---------------------------------------------------------------------------
const byFamily = new Map();
for (const v of varieties) {
  if (!byFamily.has(v.family)) byFamily.set(v.family, []);
  byFamily.get(v.family).push(v);
}

const availabilityRows = [...byFamily.keys()]
  .sort()
  .map((family) => {
    const rows = byFamily
      .get(family)
      .map((v) => `        <tr><td>${esc(v.name)}</td><td>${v.packets_available}</td></tr>`)
      .join("\n");
    return `      <h2>${esc(family)}</h2>\n      <table>\n        <thead><tr><th>Variety</th><th>Packets available</th></tr></thead>\n        <tbody>\n${rows}\n        </tbody>\n      </table>`;
  })
  .join("\n");

const totalPackets = varieties.reduce((n, v) => n + v.packets_available, 0);

const availabilityHtml = `<!doctype html>
<html lang="en" data-layout="none">
  <head>
    <meta charset="utf-8">
    <title>Availability — Fernhollow Seed Library</title>
  </head>
  <body>
    <h1>Availability</h1>
    <p>Fernhollow keeps this page free of the rest of the site's navigation and
    styling so it can be pulled straight into another site's own pages.</p>
    <p>${varieties.length} varieties, ${totalPackets} packets, correct as of this
    season's export (${esc(catalogue.season)}).</p>
${availabilityRows}
  </body>
</html>
`;

writeFileSync(path.join(SRC, "availability.html"), availabilityHtml);

// ---------------------------------------------------------------------------
// Seasonal notes index, from the markdown entries already on disk
// ---------------------------------------------------------------------------
const notesDir = path.join(SRC, "seasonal-notes");
const noteFiles = readdirSync(notesDir).filter(
  (f) => f.endsWith(".md") && f !== "index.md"
);

const notes = noteFiles.map((file) => {
  const text = readFileSync(path.join(notesDir, file), "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const titleMatch = fm && fm[1].match(/^title:\s*(.+)$/m);
  const dateMatch = fm && fm[1].match(/^date:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : file;
  const date = dateMatch ? dateMatch[1].trim() : "0000-00-00";
  const slug = file.replace(/\.md$/, "");
  return { title, date, slug };
});

notes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

const notesListHtml = notes
  .map(
    (n) => `        <li>
          <a href="/seasonal-notes/${n.slug}.html">${esc(n.title)}</a>
          <time datetime="${n.date}">${formatDate(n.date)}</time>
        </li>`
  )
  .join("\n");

const notesIndexHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Seasonal notes</title>
    <meta name="description" content="What's happening at Fernhollow Seed Library, newest first.">
  </head>
  <body>
    <main>
      <h1>Seasonal notes</h1>
      <p>Fernhollow keeps this index generated, newest first, straight from the
      dated entries below it — nobody has to remember to update it by hand.</p>
      <p><a href="/seasonal-notes/seed-swap-dates.html">Seed swap dates</a> is kept
      alongside these notes but is not itself a dated entry.</p>
      <ul class="notes-list">
${notesListHtml}
      </ul>
    </main>
  </body>
</html>
`;

writeFileSync(path.join(notesDir, "index.html"), notesIndexHtml);

console.log(`generated ${varieties.length} variety pages, catalogue index, availability page, and seasonal notes index (${notes.length} entries)`);
