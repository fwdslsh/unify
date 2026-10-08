// All pages: renders a directory of the site from assets/unify/catalog.json.
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

/**
 * The section a page is listed under: the first directory of its address, or
 * "" for a page at the top level. A documentation tree published under docs/
 * is listed by the directory below that, so /docs/guides/x.html is under
 * "guides" rather than every page sitting under "docs".
 */
export function sectionOf(address) {
  const segments = String(address).split("/").filter(Boolean);
  if (segments[0] === "docs" && segments.length > 2) return segments[1];
  return segments.length > 1 ? segments[0] : "";
}

/** A section's heading: its directory name with hyphens as spaces and a capital first letter. */
export function sectionHeading(section) {
  if (section === "") return "Top level";
  const words = section.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The name shown for a page: its first <h1>, else its <title> without the
 * layout's " · Site name" suffix, else its address.
 */
export function labelOf(page) {
  const h1 = ((page.body && page.body.headings) || []).find((h) => h.level === 1 && h.text);
  const title = ((page.head && page.head.title) || "").replace(/\s*·[^·]*$/, "").trim();
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
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
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
      heading.textContent = sectionHeading(group.section);
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
