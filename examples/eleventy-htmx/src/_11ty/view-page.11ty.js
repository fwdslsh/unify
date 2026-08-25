// One PAGE per view: notes/index.html, notes/firmware.html, notes/hardware.html,
// notes/field-notes.html.
//
// The emitted document has no layout of its own and no data-layout. It is an ordinary
// unify page, and unify's discovery walk finds src/_layout.html for it exactly as it does
// for a hand-authored page — across the boundary between the overlay and the source tree,
// which is the point of the example.
import { escapeHtml } from "./lib/render.mjs";

export const data = {
  pagination: { data: "views", size: 1, alias: "view" },
  eleventyComputed: {
    // Overrides the global `permalink: false` that keeps the release notes unwritten.
    permalink: (d) => (d.view.slug === "all" ? "notes/index.html" : `notes/${d.view.slug}.html`),
  },
};

export function render(data) {
  const { label, slug, blurb } = data.view;
  const heading = slug === "all" ? "Release notes" : label;
  const path = slug === "all" ? "notes/" : `notes/${slug}/`;
  // baseUrl comes from generator-context.json (argv[4], §33.2), read once in
  // _scripts/eleventy.mjs and threaded through Eleventy's data cascade. Without
  // --base-url it is null and this line is blank; with it, og:url carries the exact
  // origin and path prefix unify itself is about to publish this page under.
  const ogUrl = data.baseUrl ? `\n    <meta property="og:url" content="${data.baseUrl}${path}">` : "";
  // The <head> carries data and nothing else: this page's own title and description. The
  // layout owns the charset, the stylesheet, the icon and the " — Ashgrove Instruments"
  // suffix, and a page that repeated any of them would double-suffix the title or raise a
  // charset advisory.
  //
  // <p slot="aside"> fills the layout's named slot; the layout supplies the surrounding
  // <aside>, so the fill is the contents. Everything inside <main> goes to the bare slot —
  // unify unwraps this <main> and uses its children.
  //
  // Note the two different address spellings on this page, and that both are correct:
  //
  //   href="/docs/index.html"  — a PAGE's link. Source spelling, the one authoring-rules.md
  //                              asks for; unify rewrites it to "/docs/" on the way out.
  //   src="/notes/x.fragment.html" — a FRAGMENT's path. Fragments are never moved by
  //                              --pretty-urls, so this string is the same before and after.
  //
  // That second string is also, character for character, the hx-get inside the fragment's
  // own tabs. The file this page includes at build time is the file htmx fetches at
  // runtime, which is what gives every view its content with JavaScript off, before htmx
  // loads, and for every crawler — and it is the only tripwire an hx-get path has, since
  // unify checks an <include src> and never an hx-get.
  return `<!doctype html>
<html>
  <head>
    <title>${escapeHtml(heading)}</title>
    <meta name="description" content="${escapeHtml(blurb)}">${ogUrl}
  </head>
  <body>
    <p slot="aside">Every change ships with a note. The <a href="/docs/index.html">documentation</a> always describes the current firmware.</p>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <div id="releases"><include src="/notes/${slug}.fragment.html"></include></div>
    </main>
  </body>
</html>
`;
}
