/**
 * docs-nav.mjs — a docs site's navigation, from one ordered list.
 *
 * import-docs.mjs publishes a folder of Markdown but cannot know the order a
 * reader should take it in; that is the one thing about a docs site no folder
 * listing can say. This takes the pages the importer returned and one list of
 * groups, and writes the three surfaces that list decides, so they cannot
 * disagree with each other:
 *
 *   // scripts/gen.mjs, after importDocs
 *   import { importDocs } from "unify-docs-template/scripts/import-docs.mjs";
 *   import { docsNav } from "unify-docs-template/scripts/docs-nav.mjs";
 *   const [, , , overlay] = process.argv;
 *   const pages = importDocs({ from: new URL("../docs/", import.meta.url), into: overlay, github });
 *   docsNav({
 *     pages,
 *     into: overlay,
 *     groups: [
 *       { label: "Guides", docs: [["getting-started.md", "Getting started"], ["guides/deploy.md", "Deploying"]] },
 *       { label: "Reference", docs: [["cli.md"]] },
 *     ],
 *   });
 *
 * A group is a `label` and its `docs`, each `[source, label]`: `source` is the
 * document's path inside the folder (the importer's `source`, before any
 * `rename`), `label` the short name the sidebar and the previous/next links
 * show. Leave the label out and the document's title is used. The groups, in
 * order, and the documents within them, in order, are the reading order.
 *
 * - **The sidebar** is `_includes/docnav.html`, which replaces the template's
 *   (a site that extends the template wins at the same path): one list per
 *   group, then a link to the index.
 * - **The section index** is `<base>/index.md`: every document, grouped, with
 *   its full title and description. `index` sets its `title` (default "All
 *   documentation"), `description`, and an `intro` paragraph (Markdown, written
 *   as given). `base` is the one given to importDocs, "docs" unless set.
 * - **Previous and next** end every document in the reading order: a
 *   `<nav class="pager" aria-label="Previous and next pages">` holding a link
 *   to the document before and one to the document after, or one link at the
 *   first and last, and none when there is only one document. The reading
 *   order runs across groups, so the first document of one group links back to
 *   the last of the one before. The template's stylesheet styles it.
 *
 * Why the pager is appended to the imported files. A layout is shared by every
 * page, so it cannot know a page's neighbours; the links have to be written
 * into the page. The importer has already written each document into the
 * overlay as Markdown, and unify passes a raw HTML block in Markdown through
 * unchanged, so appending a `<nav>` to the end of the file puts it inside the
 * page's `<main>` with no layout change, no slot, and no script. The importer's
 * `transform` hook runs earlier and sees one document at a time, before the
 * titles and the set of pages that the labels and the "More" group depend on
 * exist. Links are root-relative paths to the Markdown sources (`/docs/a.md`),
 * as the importer's own are, so unify's --pretty-urls and --base-url rewriting
 * and its reference check apply to them like any other link.
 *
 * A document the importer produced but no group lists goes in a trailing
 * "More" group, in path order, labelled by its title, and in the reading order
 * after every listed one: a new document is reachable the day it is added.
 *
 * Mistakes in the list fail the generator, and so the build, rather than
 * quietly dropping a page: a listed source the importer did not produce, and a
 * source listed twice, each throw an Error naming the source. So does a
 * document that already publishes to the index's path. Call it once, after
 * importDocs, with the same `into`.
 *
 * Only `node:` built-ins, so it runs under Node and Bun alike, as unify does.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @typedef {object} NavGroup
 * @property {string} label - the group's heading
 * @property {Array<[source: string, label?: string]>} docs - documents in reading order, by path inside the folder
 */

/**
 * @typedef {object} NavEntry
 * @property {string} source
 * @property {string} path
 * @property {string} title
 * @property {string} description
 * @property {string} label - the short name the sidebar and the previous/next links show
 */

/**
 * @param {object} options
 * @param {import("./import-docs.mjs").ImportedPage[]} options.pages - what importDocs returned
 * @param {NavGroup[]} options.groups - the reading order
 * @param {string} options.into - the directory importDocs wrote into: the generator's overlay (argv[3])
 * @param {string} [options.base] - the `base` given to importDocs; "docs" unless set, "" for the site root
 * @param {object} [options.index]
 * @param {string} [options.index.title] - the index page's title; "All documentation" unless set
 * @param {string} [options.index.description] - its description
 * @param {string} [options.index.intro] - a paragraph of Markdown between its heading and the groups
 * @returns {{label: string, entries: NavEntry[]}[]} the groups as written, "More" last when it was needed
 */
export function docsNav({ pages, groups, into, base = "docs", index = {} }) {
  const { title = "All documentation", description = "Every document, in reading order.", intro } = index;
  const indexPath = base ? `${base}/index.md` : "index.md";
  if (pages.some((p) => p.path === indexPath)) {
    throw new Error(`docs-nav: a document already publishes to ${indexPath}, where the index goes; move it with importDocs' rename`);
  }

  const resolved = arrange(pages, groups);
  const order = resolved.flatMap((g) => g.entries);
  const write = (rel, text) => {
    const abs = join(into, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  };

  write("_includes/docnav.html", [
    '<nav class="docnav" id="docnav" aria-label="Documentation">',
    ...resolved.flatMap((g) => [
      "  <div>",
      `    <p class="docnav-label">${html(g.label)}</p>`,
      "    <ul>",
      ...g.entries.map((e) => `      <li>${anchor(e.path, html(e.label))}</li>`),
      "    </ul>",
      "  </div>",
    ]),
    `  <p class="docnav-all">${anchor(indexPath, html(`${title} →`))}</p>`,
    "</nav>",
    "",
  ].join("\n"));

  write(indexPath, [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `# ${markdown(title)}`,
    "",
    ...(intro ? [intro, ""] : []),
    ...resolved.flatMap((g) => [`## ${markdown(g.label)}`, "", ...g.entries.map((e) => `- **[${markdown(e.title)}](${destination(`/${e.path}`)})**: ${markdown(e.description)}`), ""]),
  ].join("\n"));

  order.forEach((entry, i) => {
    const prev = order[i - 1];
    const next = order[i + 1];
    if (!prev && !next) return;
    const file = join(into, ...entry.path.split("/"));
    const pager = [
      '<nav class="pager" aria-label="Previous and next pages">',
      ...(prev ? [`  ${anchor(prev.path, `<span>Previous</span> ${html(prev.label)}`, ' class="pager-prev" rel="prev"')}`] : []),
      ...(next ? [`  ${anchor(next.path, `<span>Next</span> ${html(next.label)}`, ' class="pager-next" rel="next"')}`] : []),
      "</nav>",
    ].join("\n");
    writeFileSync(file, `${readFileSync(file, "utf8").trimEnd()}\n\n${pager}\n`);
  });

  return resolved;
}

// ------------------------------------------------------------------ helpers

/** The groups with their documents looked up, plus a "More" group for any the groups leave out. */
function arrange(pages, groups) {
  const bySource = new Map(pages.map((p) => [p.source, p]));
  const placed = new Map(); // source → the group that lists it
  const resolved = groups.map((g) => ({
    label: g.label,
    entries: g.docs.map(([source, label]) => {
      const page = bySource.get(source);
      if (!page) throw new Error(`docs-nav: "${source}" in group "${g.label}" is not a document the importer produced`);
      if (placed.has(source)) throw new Error(`docs-nav: "${source}" is listed twice, in group "${placed.get(source)}" and in group "${g.label}"`);
      placed.set(source, g.label);
      return { ...page, label: label || page.title };
    }),
  }));
  const rest = pages.filter((p) => !placed.has(p.source));
  if (rest.length) resolved.push({ label: "More", entries: rest.map((p) => ({ ...p, label: p.title })) });
  return resolved;
}

/** An `<a>` to a site path, root-relative; `inner` is HTML, already escaped. */
function anchor(path, inner, attributes = "") {
  return `<a href="/${html(path)}"${attributes}>${inner}</a>`;
}

/** Text for an HTML text node or a double-quoted attribute. */
function html(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A Markdown link destination; a space or a parenthesis in a file name needs the angle-bracket form. */
function destination(url) {
  return /[\s()]/.test(url) ? `<${url}>` : url;
}

/** Text for a line of Markdown, with its punctuation made literal. */
function markdown(s) {
  return String(s).replace(/[\\`*_[\]<>&]/g, "\\$&");
}
