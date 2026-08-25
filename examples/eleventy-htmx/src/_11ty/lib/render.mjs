// Shared markup for all three templates, so a fragment and the page that includes it can
// never disagree about what a release list looks like.
//
// The extension carries no meaning here: `render.js` builds identically. Eleventy's
// `11ty.js` template format matches `.11ty.js`, `.11ty.cjs` and `.11ty.mjs` and nothing
// else, so what a helper module inside the input directory has to avoid is the `.11ty.`
// infix — not the `.js` ending.

export const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A release note's PUBLISHED address: root-absolute, in the pretty spelling the built site
// actually serves. Two separate rules meet in this one string.
//
//  1. It must read page.inputPath. page.fileSlug and page.filePathStem strip Eleventy's
//     date prefix — they would name "firmware-2-6-0" for a page that is really
//     "2026-06-30-firmware-2-6-0", and every link would fail unify's reference check.
//
//  2. It is spelled the way the OUTPUT publishes it, "/notes/<name>/", and not the way the
//     source spells it, "/notes/<name>.md". That inverts the usual advice in
//     docs/authoring-rules.md ("always link the real filename") and it has to, because
//     these links are emitted into a .fragment.html, which lives two lives: unify splices
//     it into a page with <include> and rewrites the links in that copy, and unify also
//     ships the file itself byte-for-byte for htmx to fetch, rewriting nothing. A source
//     spelling would compose to "/notes/<name>/" inside the page and stay
//     "/notes/<name>.html" in the fetched file — a path --pretty-urls never writes. The
//     pretty spelling is the one string that is already right in both copies: unify
//     resolves it against the emitted page, finds it, and leaves it exactly as written.
export const hrefFor = (entry) =>
  entry.page.inputPath.replace(/^\.\/notes\//, "/notes/").replace(/\.md$/, "/");

const DAY = { day: "numeric", month: "long", year: "numeric" };
// UTC, so the rendered date never drifts a day against the machine's time zone — a build
// must produce the same bytes wherever it runs.
export const humanDate = (d) => new Intl.DateTimeFormat("en-GB", { ...DAY, timeZone: "UTC" }).format(d);

export function releaseList(entries) {
  const items = entries.map((e) => `    <li>
      <a href="${hrefFor(e)}">${escapeHtml(e.data.title)}</a>
      <time datetime="${e.date.toISOString().slice(0, 10)}">${humanDate(e.date)}</time>
      <span>${escapeHtml(e.data.description)}</span>
    </li>`).join("\n");
  return `  <ul class="release-list">\n${items}\n  </ul>`;
}

// The tabs live INSIDE the swapped panel, so the aria-current marking updates with the
// list it describes.
//
// href and hx-get are both root-absolute, for the reason hrefFor explains: this markup is
// emitted into a file that is both spliced into four different pages and fetched from four
// different addresses, so it cannot be relative to anything. A .fragment.html is never
// moved by --pretty-urls and never rewritten, so "/notes/firmware.fragment.html" names the
// same real file in dist/ whichever page is asking.
//
// unify rewrites href and never hx-get — so the two attributes here are deliberately not
// the same address. The href names the PAGE (a real document, which is what makes this
// progressive: with JavaScript off the tab is an ordinary link to a page that already
// contains this exact list, because that page <include>s this same fragment at build
// time). The hx-get names the FRAGMENT, and htmx swaps it into #releases.
//
// An anchor carrying an explicit hx-get is never boosted, even though <body hx-boost="true">
// is inherited here: htmx processes explicit verbs first and only boosts what has none.
export function topicTabs(views, currentSlug) {
  const tabs = views.map((v) => {
    const page = v.slug === "all" ? "/notes/" : `/notes/${v.slug}/`;
    const current = v.slug === currentSlug ? ' aria-current="page"' : "";
    return `    <a href="${page}" hx-get="/notes/${v.slug}.fragment.html"${current}>${escapeHtml(v.label)}</a>`;
  }).join("\n");
  return `  <nav class="topic-tabs" hx-target="#releases" hx-swap="innerHTML">\n${tabs}\n  </nav>`;
}

export const entriesFor = (releases, slug) =>
  slug === "all" ? releases : releases.filter((e) => e.data.topic === slug);
