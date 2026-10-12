/**
 * gen.mjs, the derived half of this site, run by unify through `generate: scripts/gen.mjs` in unify.yaml.
 *
 * The repository's own `docs/` is the documentation; this script publishes it,
 * at every build, so the site cannot drift from it. The docs template's
 * importer does the publishing (every document to `docs/<its path>`, a link
 * leaving the folder sent to GitHub); what is left here is this site's own
 * reading order, which is the one thing about it no folder listing can know,
 * and the template's docs-nav helper turns that order into the navigation.
 *
 * What it writes into the overlay unify hands it (argv[3]):
 *   docs/**                the documents, by the importer, each ending in previous/next links
 *   docs/index.md          every document, grouped in reading order, with its description
 *   _includes/docnav.html  the sidebar, the same groups, replacing the template's
 */
import { docsNav } from "../../../templates/docs/scripts/docs-nav.mjs";
import { importDocs } from "../../../templates/docs/scripts/import-docs.mjs";

const [, , , overlay] = process.argv;

const pages = importDocs({
  from: new URL("../../../docs/", import.meta.url),
  into: overlay,
  github: "https://github.com/fwdslsh/unify/blob/main/docs",
});

/**
 * Reading order, in curated groups, then anything else under "More". The
 * short label is what the sidebar and the previous/next links show; the index
 * keeps the full title.
 */
const GROUPS = [
  { label: "Guides", docs: [
    ["getting-started.md", "Getting started"],
    ["templates.md", "Templates"],
    ["authoring-rules.md", "Authoring rules"],
    ["integrations.md", "Integrations"],
    ["guides/catalog-and-search.md", "Catalog and search"],
    ["guides/eleventy-htmx.md", "Eleventy and htmx"],
    ["guides/generator-recipes.md", "Generator recipes"],
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

docsNav({
  pages,
  groups: GROUPS,
  into: overlay,
  index: {
    description: "Every unify document, in reading order, rendered from the repository's own docs directory.",
    intro: "Every page below is published from the repository's `docs/` directory at build time, so this site cannot drift from the documentation it renders.",
  },
});

console.log(`gen.mjs: ${pages.length} documents, an index, the sidebar, and previous/next links`);
