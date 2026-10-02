/**
 * The "All pages" starter shipped by `unify init docs` (issue #91): an
 * ordinary page, one stylesheet block and one plain JavaScript module the
 * AUTHOR owns, rendering a directory of the site from
 * `assets/unify/catalog.json`. unify injects nothing: the script is an
 * authored asset like any other and is mirror-copied byte for byte.
 *
 * Why it fits §19.3. The template ships `unify.yaml` with `catalog: true`
 * (§19.8), so a plain `unify build` writes the catalog, and the page's
 * `<link rel="preload" … as="fetch">` makes it a reference §12 checks:
 * drop `catalog: true` and the build says so, rather than shipping a page
 * that can only show its error state. The catalog is addressed relative to the module
 * (`new URL("unify/catalog.json", import.meta.url)`), never as a
 * root-relative string, so it is also right under a `--base-url` with a
 * path prefix, where unify rewrites the `<script src>` in the HTML and
 * the module then finds its sibling directory wherever it was loaded from.
 *
 * The filtering and grouping are exported pure functions, so the suite can
 * import the scaffolded file under Bun and test them without a browser; the
 * DOM half only runs when a `document` exists.
 *
 * The string below is `String.raw` and contains no backtick and no `${`.
 */
import { pageHtml } from "./shared.js";

export const ALL_PAGES_JS = String.raw`// All pages: renders a directory of the site from assets/unify/catalog.json.
// Yours to edit. unify only writes the catalog (build with --catalog); it
// ships this file exactly as written.

// ---- Pure functions: no DOM, no network. -------------------------------

/** The path prefix the site is served under: "/docs/" for a --base-url of https://x.example/docs/, else "/". */
export function prefixOf(catalog) {
  try {
    return new URL(catalog.baseUrl).pathname;
  } catch {
    return "/";
  }
}

/** A page's address inside the site: its path with the --base-url prefix taken off. */
export function addressOf(path, prefix) {
  return path.startsWith(prefix) ? "/" + path.slice(prefix.length) : path;
}

/** The section a page is listed under: the first segment of its address, or "" for a page at the top level. */
export function sectionOf(address) {
  const segments = String(address).split("/").filter(Boolean);
  return segments.length > 1 ? segments[0] : "";
}

/** The name shown for a page: its first <h1>, else its <title>, else its address. */
export function labelOf(page) {
  const h1 = ((page.body && page.body.headings) || []).find((h) => h.level === 1 && h.text);
  const title = page.head && page.head.title;
  return (h1 && h1.text) || title || page.path;
}

/** One {path, address, label, section} per page in the catalog. Throws when the file is not a catalog. */
export function entriesOf(catalog) {
  if (!catalog || !Array.isArray(catalog.pages)) throw new Error("not a catalog.json: no pages list");
  const prefix = prefixOf(catalog);
  return catalog.pages.map((page) => {
    const address = addressOf(page.path, prefix);
    return { path: page.path, address, label: labelOf(page), section: sectionOf(address) };
  });
}

/** Entries whose title or address contains every word of the query (case-insensitive). */
export function filterEntries(entries, query) {
  const words = String(query).toLowerCase().split(" ").filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((entry) => {
    const haystack = (entry.label + " " + entry.address).toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

const byLabel = (a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path);

/** Entries grouped by section: top-level pages first, then sections A to Z; titles A to Z within each. */
export function groupEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.section)) groups.set(entry.section, []);
    groups.get(entry.section).push(entry);
  }
  return [...groups.keys()]
    .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map((section) => ({ section, entries: groups.get(section).sort(byLabel) }));
}

/** The sentence the live region announces. */
export function countMessage(shown, total, query) {
  const noun = (n) => n + (n === 1 ? " page" : " pages");
  if (String(query).trim() === "") return noun(total) + ".";
  if (shown === 0) return "No pages match " + JSON.stringify(String(query).trim()) + ".";
  return "Showing " + shown + " of " + noun(total) + ".";
}

// ---- The page. Runs only in a browser. ---------------------------------

async function start(doc) {
  const controls = doc.getElementById("all-pages-controls");
  const input = doc.getElementById("all-pages-query");
  const status = doc.getElementById("all-pages-count");
  const list = doc.getElementById("all-pages-list");
  const failure = doc.getElementById("all-pages-error");

  let entries;
  try {
    // Relative to this file, so it is right wherever the site is hosted,
    // including under a --base-url path prefix.
    const response = await fetch(new URL("unify/catalog.json", import.meta.url));
    if (!response.ok) throw new Error("HTTP " + response.status);
    entries = entriesOf(await response.json());
  } catch (error) {
    status.textContent = "";
    failure.hidden = false;
    failure.querySelector("[data-reason]").textContent = error.message;
    return;
  }

  function render() {
    const query = input.value;
    const shown = filterEntries(entries, query);
    status.textContent = countMessage(shown.length, entries.length, query);
    list.replaceChildren();
    if (shown.length === 0) {
      const empty = doc.createElement("p");
      empty.textContent = "Nothing to show. Try fewer or different words.";
      list.append(empty);
      return;
    }
    for (const group of groupEntries(shown)) {
      const section = doc.createElement("section");
      const heading = doc.createElement("h2");
      heading.textContent = group.section === "" ? "Top level" : group.section;
      const items = doc.createElement("ul");
      for (const entry of group.entries) {
        const item = doc.createElement("li");
        const link = doc.createElement("a");
        link.href = entry.path;
        link.textContent = entry.label;
        item.append(link);
        items.append(item);
      }
      section.append(heading, items);
      list.append(section);
    }
  }

  controls.hidden = false;
  input.addEventListener("input", render);
  render();
}

if (typeof document !== "undefined") start(document);
`;

const STYLE = `<style>
  .all-pages-search label { display: block; font-weight: bold; }
  .all-pages-search input { box-sizing: border-box; width: 100%; max-width: 24rem; padding: 0.4rem; font: inherit; }
  .all-pages-count { min-height: 1.5em; }
  .all-pages-list h2 { margin-bottom: 0.25rem; text-transform: none; }
  .all-pages-list ul { margin-top: 0; padding-left: 1.25rem; }
  .all-pages-error { border: 2px solid; border-radius: 0.25rem; padding: 0.5rem 1rem; }
</style>`;

export const ALL_PAGES_HTML = pageHtml({
  title: "All pages",
  description: "Every page on the site in one searchable list, grouped by section.",
  head: `${STYLE}
<link rel="preload" href="/assets/unify/catalog.json" as="fetch" crossorigin>
<script type="module" src="/assets/all-pages.js"></script>`,
  main: `<h1>All pages</h1>
<p>A directory of the whole site, read from <code>assets/unify/catalog.json</code> in your browser.
Type to filter by title or address.</p>
<noscript>
  <p>This directory needs JavaScript to read the site's page list. Without it, start from the
  <a href="/">home page</a> or use the navigation at the top of any page.</p>
</noscript>
<div class="all-pages-search" id="all-pages-controls" role="search" hidden>
  <label for="all-pages-query">Filter pages</label>
  <input id="all-pages-query" type="search" autocomplete="off">
</div>
<p class="all-pages-count" id="all-pages-count" role="status" aria-live="polite">Loading pages&hellip;</p>
<div class="all-pages-error" id="all-pages-error" role="alert" hidden>
  <p><strong>The page list could not be loaded</strong> (<span data-reason></span>).</p>
  <p>It is read from <code>assets/unify/catalog.json</code>, which unify writes only when you build
  with <code>--catalog</code>. Build that way, or follow the navigation links instead.</p>
</div>
<div class="all-pages-list" id="all-pages-list"></div>

<h2>What is listed</h2>
<p>The catalog lists the pages a search engine could index: not <code>noindex</code>, not
<code>404.html</code>, and not a page whose canonical points somewhere else. For a private site
that marks every page <code>noindex</code>, build with <code>--include-noindex</code> as well so
the directory is not empty. <code>noindex</code> is a request to crawlers, not access control:
anything in the catalog is a public file. Edit or delete this paragraph once you have decided.</p>`,
});
