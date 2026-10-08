/**
 * gen.mjs, the derived half of this site, run by unify through `generate: scripts/gen.mjs` in unify.yaml.
 *
 * The repository's own `docs/` is the documentation; this script publishes it,
 * at every build, so the site cannot drift from it. The docs template's
 * importer does the publishing (every document to `docs/<its path>`, a link
 * leaving the folder sent to GitHub); what is left here is this site's own
 * reading order, which is the one thing about it no folder listing can know.
 *
 * What it writes into the overlay unify hands it (argv[3]):
 *   docs/**                the documents, by the importer
 *   docs/index.md          every document, grouped in reading order, with its description
 *   _includes/docnav.html  the sidebar, the same groups, replacing the template's
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { importDocs } from "../../../templates/docs/scripts/import-docs.mjs";

const [, , , overlay] = process.argv;

const pages = importDocs({
  from: new URL("../../../docs/", import.meta.url),
  into: overlay,
  github: "https://github.com/fwdslsh/unify/blob/main/docs",
});

/**
 * Reading order, in curated groups, then anything else under "More". The
 * short label is what the sidebar shows; the index keeps the full title.
 */
const GROUPS = [
  { label: "Guides", docs: [
    ["getting-started.md", "Getting started"],
    ["templates.md", "Templates"],
    ["authoring-rules.md", "Authoring rules"],
    ["integrations.md", "Integrations"],
    ["guides/catalog-and-search.md", "Catalog and search"],
    ["guides/eleventy-htmx.md", "Eleventy and htmx"],
    ["docker-usage.md", "Docker"],
  ] },
  { label: "Reference", docs: [
    ["cli-reference.md", "CLI reference"],
    ["product-spec.md", "Product spec"],
    ["conformance-spec.md", "Conformance spec"],
  ] },
  { label: "Project", docs: [
    ["testing-strategy.md", "Testing strategy"],
    ["cicd-workflows.md", "CI/CD workflows"],
    ["ratification.md", "Ratification"],
    ["ratification-protocol.md", "Ratification protocol"],
    ["migration-plan.md", "Migration plan"],
  ] },
];

const bySource = new Map(pages.map((p) => [p.source, p]));
const listed = new Set(GROUPS.flatMap((g) => g.docs.map(([source]) => source)));
const groups = GROUPS.map((g) => ({
  label: g.label,
  entries: g.docs.filter(([source]) => bySource.has(source)).map(([source, short]) => ({ ...bySource.get(source), short })),
}));
const extras = pages.filter((p) => !listed.has(p.source));
if (extras.length) groups.push({ label: "More", entries: extras.map((p) => ({ ...p, short: p.title })) });

const href = (p) => `/${p.path}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const write = (rel, body) => {
  const abs = join(overlay, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
};

write("docs/index.md", [
  "---",
  'title: "All documentation"',
  'description: "Every unify document, in reading order, rendered from the repository\'s own docs directory."',
  "---",
  "",
  "# All documentation",
  "",
  "Every page below is published from the repository's `docs/` directory at build time, so this site cannot drift from the documentation it renders.",
  "",
  ...groups.flatMap((g) => [`## ${g.label}`, "", ...g.entries.map((p) => `- **[${p.title}](${href(p)})**: ${p.description}`), ""]),
].join("\n"));

write("_includes/docnav.html", [
  '<nav class="docnav" id="docnav" aria-label="Documentation">',
  ...groups.flatMap((g) => [
    "  <div>",
    `    <p class="docnav-label">${esc(g.label)}</p>`,
    "    <ul>",
    ...g.entries.map((p) => `      <li><a href="${href(p)}">${esc(p.short)}</a></li>`),
    "    </ul>",
    "  </div>",
  ]),
  '  <p class="docnav-all"><a href="/docs/index.html">All documentation →</a></p>',
  "</nav>",
  "",
].join("\n"));

console.log(`gen.mjs: ${pages.length} documents, an index, and the sidebar`);
