// One FRAGMENT per view: notes/all.fragment.html and one per topic.
//
// The same four-item pagination as view-page.11ty.js, so a page and its fragment are
// always emitted as a pair. The .fragment.html suffix is what makes a bare snippet legal
// in unify: it ships byte-for-byte, is never composed into a layout, and is the swap
// target htmx fetches. Every page <include>s the fragment it also fetches, which is the
// only tripwire an hx-get path has — a name that does not exist fails the build.
import { entriesFor, releaseList, topicTabs } from "./lib/render.mjs";

export const data = {
  pagination: { data: "views", size: 1, alias: "view" },
  eleventyComputed: { permalink: (d) => `notes/${d.view.slug}.fragment.html` },
};

export function render(data) {
  const entries = entriesFor(data.collections.releases, data.view.slug);
  return `${topicTabs(data.views, data.view.slug)}\n${releaseList(entries)}\n`;
}
