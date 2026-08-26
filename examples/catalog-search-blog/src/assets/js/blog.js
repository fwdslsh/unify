// assets/js/blog.js — the whole listing/filter/search UI, dependency-free.
//
// Resolved relative to the module's own URL (docs/guides/catalog-and-search.md
// §4), never hardcoded, so this file works unmodified whether the site is
// built at a domain root or under a --base-url subpath: assets/js/ sits one
// directory below the site root, same as assets/unify/.
const catalogUrl = new URL("../unify/catalog.json", import.meta.url);
const corpusUrl = new URL("../unify/search-corpus.json", import.meta.url);

function metaValue(page, name) {
  const hit = page.head.meta.find((m) => m.name === name);
  return hit ? hit.content : undefined;
}

function metaValues(page, name) {
  return page.head.meta.filter((m) => m.name === name).map((m) => m.content);
}

const [catalog, corpus] = await Promise.all([
  fetch(catalogUrl).then((r) => r.json()),
  fetch(corpusUrl).then((r) => r.json()),
]);

// Newest-first by each post's own `date`, mapping a missing or unparsable
// one to -Infinity so it sinks to the end instead of breaking the sort
// (Date.parse rather than a string compare, so two authors writing the same
// instant with different UTC offsets still land in the right order).
const ts = (p) => {
  const t = Date.parse(metaValue(p, "date") ?? "");
  return Number.isNaN(t) ? -Infinity : t;
};
const posts = catalog.pages
  .filter((p) => ["BlogPosting", "Article"].includes(metaValue(p, "schema")))
  .sort((a, b) => ts(b) - ts(a));

const byPath = new Map(catalog.pages.map((p) => [p.path, p]));

const tags = [...new Set(posts.flatMap((p) => metaValues(p, "tags")))].sort();
const series = [...new Set(posts.map((p) => metaValue(p, "series")).filter(Boolean))].sort();

const searchInput = document.getElementById("search");
const tagFilter = document.getElementById("tag-filter");
const seriesFilter = document.getElementById("series-filter");
const list = document.getElementById("posts");
const countEl = document.getElementById("count");
const noResults = document.getElementById("no-results");

let activeTag = null;
let activeSeries = null;

function makeFacetButtons(container, values, label, onPick) {
  const all = document.createElement("button");
  all.type = "button";
  all.textContent = `All ${label}`;
  all.setAttribute("aria-pressed", "true");
  all.addEventListener("click", () => onPick(null));
  container.append(all);
  for (const value of values) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = value;
    btn.dataset.value = value;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => onPick(value));
    container.append(btn);
  }
}

function setPressed(container, value) {
  for (const btn of container.querySelectorAll("button")) {
    btn.setAttribute("aria-pressed", String((btn.dataset.value ?? null) === value));
  }
}

makeFacetButtons(tagFilter, tags, "tags", (value) => {
  activeTag = value;
  setPressed(tagFilter, value);
  render();
});
makeFacetButtons(seriesFilter, series, "series", (value) => {
  activeSeries = value;
  setPressed(seriesFilter, value);
  render();
});

// The search step: fold the query, filter the corpus for a substring match,
// and join each hit back to its full catalog entry by `path` — the field
// both generated files share (docs/guides/catalog-and-search.md §5).
function searchResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) return posts;
  const hitPaths = new Set(
    corpus.pages.filter((p) => p.text.toLowerCase().includes(q)).map((p) => p.path)
  );
  return posts.filter((p) => hitPaths.has(p.path));
}

function render() {
  let shown = searchResults(searchInput.value);
  if (activeTag) shown = shown.filter((p) => metaValues(p, "tags").includes(activeTag));
  if (activeSeries) shown = shown.filter((p) => metaValue(p, "series") === activeSeries);

  list.replaceChildren();
  for (const post of shown) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = post.path; // already the page's real emitted address
    a.textContent = post.head.title;
    li.append(a);

    const meta = document.createElement("p");
    meta.className = "post-meta";
    const date = metaValue(post, "date");
    const seriesName = metaValue(post, "series");
    const parts = [];
    if (date) parts.push(new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }));
    if (seriesName) parts.push(`${seriesName} series`);
    const tagList = metaValues(post, "tags");
    if (tagList.length) parts.push(tagList.join(", "));
    meta.textContent = parts.join(" — ");
    li.append(meta);

    const description = metaValue(post, "description");
    if (description) {
      const p = document.createElement("p");
      p.textContent = description;
      li.append(p);
    }
    list.append(li);
  }
  countEl.textContent = `${shown.length} of ${posts.length} posts shown`;
  noResults.hidden = shown.length !== 0;
}

searchInput.addEventListener("input", render);
render();

// Kept for anything that wants to inspect the join from a console: the same
// lookup render() uses internally.
window.__byPath = byPath;
