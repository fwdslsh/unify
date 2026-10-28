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
 *   _includes/docs-version.html  released runtime and separate docs revision
 */
import { docsNav } from "../../../templates/docs/scripts/docs-nav.mjs";
import { importDocs } from "../../../templates/docs/scripts/import-docs.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , , overlay] = process.argv;
const root = new URL("../../../", import.meta.url);
const version = readFileSync(new URL("docs/.runtime-version", root), "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("docs/.runtime-version must name an exact stable release");
let revision = "local working tree";
try {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "docs", "examples/unify-docs", "templates/docs", "scripts/check-docs.mjs"], { cwd: root, encoding: "utf8" }).trim();
  revision = `<a href="https://github.com/fwdslsh/unify/tree/${sha}">${sha.slice(0, 7)}</a>${dirty ? " (working tree)" : ""}`;
} catch { /* A downloaded source archive has no Git revision. */ }
mkdirSync(join(overlay, "_includes"), { recursive: true });
writeFileSync(join(overlay, "_includes/docs-version.html"), `<p class="docs-version">Released guidance: Unify ${version} · Docs revision: ${revision}. <a href="/docs/documentation.md">Compatibility convention</a> · <a href="/docs/unreleased/README.md">Unreleased guidance</a></p>\n`);

const pages = importDocs({
  from: new URL("../../../docs/", import.meta.url),
  into: overlay,
  github: "https://github.com/fwdslsh/unify/blob/main/docs",
  transform(path, text) {
    if (!path.startsWith("unreleased/") || /^> \*\*Unreleased:\*\*/m.test(text)) return text;
    const front = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)?.[0] ?? "";
    return `${front}> **Unreleased:** This page describes development behavior, not released Unify ${version}.\n\n${text.slice(front.length)}`;
  },
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
    ["guides/template-versions.md", "Template versions"],
    ["docker-usage.md", "Docker"],
  ] },
  { label: "Reference", docs: [
    ["cli-reference.md", "CLI reference"],
    ["product-spec.md", "Product spec"],
    ["conformance-spec.md", "Conformance spec"],
  ] },
  { label: "Project", docs: [
    ["documentation.md", "Documentation maintenance"],
    ["unreleased/README.md", "Unreleased guidance"],
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
