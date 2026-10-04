// One fragment, latest.fragment.html — the newest site.latestOnHome releases, for the
// front page, which splices it in with <include> at build time and never fetches it. It is
// here to show that a generated fragment is an ordinary build input, not an htmx artefact:
// nothing about .fragment.html implies JavaScript.
//
// The hrefs need no "notes/" prefix and no knowledge of which page includes this file,
// because hrefFor emits root-absolute addresses. A relative href would have had to be
// written against this fragment's own directory (the overlay root) when spliced, and
// against the host page's directory when fetched — two different answers for one string.
import { escapeHtml, hrefFor } from "./lib/render.mjs";

export const data = { permalink: "latest.fragment.html" };

export function render(data) {
  const items = data.collections.releases.slice(0, data.site.latestOnHome).map((e) =>
    `  <li><a href="${hrefFor(e)}">${escapeHtml(e.data.title)}</a></li>`).join("\n");
  return `<ul class="latest-releases">\n${items}\n</ul>\n`;
}
