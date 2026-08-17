// Regenerates the data-driven parts of the site from ../../varieties.json.
// Run this, then `unify build`. Nobody hand-edits the files it writes.
//
//   node src/_scripts/gen.mjs && ./unify build ...
//
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "..");
const projectRoot = path.resolve(srcRoot, "..");

const catalogue = JSON.parse(
  readFileSync(path.join(projectRoot, "varieties.json"), "utf8")
);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function familySlug(family) {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function pluralPackets(n) {
  return n === 1 ? "1 packet" : `${n} packets`;
}

// --- disambiguate slugs -----------------------------------------------
// The catalogue is re-exported each season and is not guaranteed to have
// globally unique `slug` values (two different lots can share a name and
// slug while belonging to different families). Every catalogue entry
// still needs its own page, so entries whose base slug collides get the
// family folded into the URL slug to keep them apart and stable.
const bySlug = new Map();
for (const v of catalogue.varieties) {
  if (!bySlug.has(v.slug)) bySlug.set(v.slug, []);
  bySlug.get(v.slug).push(v);
}
for (const v of catalogue.varieties) {
  const siblings = bySlug.get(v.slug);
  v.urlSlug = siblings.length > 1 ? `${v.slug}--${familySlug(v.family)}` : v.slug;
}

const urlSlugCounts = new Map();
for (const v of catalogue.varieties) {
  urlSlugCounts.set(v.urlSlug, (urlSlugCounts.get(v.urlSlug) || 0) + 1);
}
const stillColliding = [...urlSlugCounts.entries()].filter(([, n]) => n > 1);
if (stillColliding.length) {
  throw new Error(
    `gen.mjs: URL slugs still collide after disambiguation: ${stillColliding
      .map(([slug]) => slug)
      .join(", ")}`
  );
}

// --- variety pages -------------------------------------------------------
const varietiesDir = path.join(srcRoot, "varieties");
rmSync(varietiesDir, { recursive: true, force: true });
mkdirSync(varietiesDir, { recursive: true });

for (const v of catalogue.varieties) {
  const name = escapeHtml(v.name);
  const family = escapeHtml(v.family);
  const season = escapeHtml(v.season);
  const sow = escapeHtml(v.sow);
  const notes = escapeHtml(v.notes);
  const keepsSentence =
    `Fernhollow keeps ${pluralPackets(v.packets_available)} of ${name} ` +
    `(${family}) in trust for members, ready to sow ${sow} and to ` +
    `harvest in about ${v.days_to_maturity} days.`;

  const html = `<!doctype html>
<html lang="en">
<head>
<title>${name}</title>
<meta name="description" content="${name} — a ${family} variety in this season's Fernhollow Seed Library catalogue.">
</head>
<body class="variety-page">
<article>
<p><a href="/catalogue/">&larr; Back to the catalogue</a></p>
<img class="variety-icon" src="/assets/seed-packet.svg" alt="" width="64" height="64">
<h1>${name}</h1>
<dl class="variety-facts">
<dt>Family</dt><dd>${family}</dd>
<dt>Season</dt><dd>${season}</dd>
<dt>Sow</dt><dd>${sow}</dd>
<dt>Days to maturity</dt><dd>${v.days_to_maturity}</dd>
<dt>Packets available</dt><dd>${v.packets_available}</dd>
</dl>
<p>${notes}</p>
<p class="keeps">${keepsSentence}</p>
</article>
</body>
</html>
`;

  writeFileSync(path.join(varietiesDir, `${v.urlSlug}.html`), html, "utf8");
}

// --- per-family catalogue data (fetched client-side, one family at a time) --
const dataDir = path.join(srcRoot, "catalogue", "data");
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const families = new Map(); // family name -> entries
for (const v of catalogue.varieties) {
  if (!families.has(v.family)) families.set(v.family, []);
  families.get(v.family).push(v);
}

const familyRows = [...families.entries()]
  .map(([family, entries]) => ({
    family,
    slug: familySlug(family),
    count: entries.length,
    entries: [...entries].sort((a, b) => a.name.localeCompare(b.name)),
  }))
  .sort((a, b) => a.family.localeCompare(b.family));

for (const row of familyRows) {
  const publicEntries = row.entries.map((v) => ({
    slug: v.urlSlug,
    name: v.name,
    season: v.season,
    sow: v.sow,
    days_to_maturity: v.days_to_maturity,
    packets_available: v.packets_available,
  }));
  writeFileSync(
    path.join(dataDir, `${row.slug}.json`),
    JSON.stringify(publicEntries),
    "utf8"
  );
}

// --- family picker nav (included into catalogue/index.html) --------------
const navItems = familyRows
  .map(
    (row) =>
      `<li><a href="/catalogue/data/${row.slug}.json" data-family="${escapeHtml(
        row.family
      )}">${escapeHtml(row.family)} <span class="count">(${row.count})</span></a></li>`
  )
  .join("\n");

const navHtml = `<ul>
${navItems}
</ul>
`;
writeFileSync(path.join(srcRoot, "catalogue", "_family-nav.html"), navHtml, "utf8");

console.log(`gen.mjs: wrote ${catalogue.varieties.length} variety pages`);
console.log(`gen.mjs: wrote ${familyRows.length} family data files`);
console.log(`gen.mjs: family counts — ${familyRows.map((r) => `${r.family}:${r.count}`).join(", ")}`);
