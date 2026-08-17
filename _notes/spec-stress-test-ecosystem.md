# Spec stress test: hooks, ecosystem fit, and whether we cut too much

**Date:** 2026-08-11
**Context:** Follow-up to [public-website-gap-analysis.md](public-website-gap-analysis.md). Question under test: should the spec add guidance and/or a hook for external build steps; which existing tools fill the gaps; does a pre-build blog-index generator actually work; which spec assumptions crack under load.

---

## 1. The hook question: unify already has one — the filesystem

The unix-y integration story is mostly **latent in the spec already**; it just isn't named. unify's input is a directory, its output is a directory, and it touches nothing else. That makes the shell the hook:

- **Pre-build generators** write pages *into the source tree* → `node gen.mjs && unify build`. The generated page is a first-class unify page: the nearest `_layout.html` wraps it, head merge applies, and — the strongest part — **unify's post-build reference check supervises the generator's output**. Rename a post and the build reports the stale index link. The seam is checked, not just tolerated.
- **Post-build processors** read/write `dist/` → `unify build && node sitemap.mjs`. The §4 watch contract (atomic temp-then-rename writes, skip-unchanged, precise deletions) was designed to make external *servers* reliable — the same guarantees make external *processors* reliable for free.
- **Tooling has a home in the source tree at zero config**: the default `_*` exclude means `_scripts/gen-feed.mjs` sits beside the content it generates and never ships. The convention already accommodates this; nobody planned it, it just composes.
- **Watch mode** is the only real friction: `unify watch` won't re-run a generator. The unix answer is a second watcher (`watchexec -w posts -- node _scripts/gen-blog.mjs` next to `unify watch`), chained through the filesystem — unify's watcher sees the generated file change and rebuilds. Two processes instead of one.

**Recommendation: no hook mechanism in the MVP; name the seam in the spec instead.** A `--run <cmd>` pre-build flag would pass the spec's own tests (one sentence, flag-mirrorable in `unify.yaml`, no polyfill impact) — but it doesn't *earn its place* yet, because `&&` covers build and the two-watcher pattern covers watch. Park `--run` in §6 as a demand-gated candidate, same posture as the dev server: only if the two-process inner loop proves to be genuine friction.

What the spec should add — a short "Composing with other tools" passage (§4 note or a §5 sibling, ~6 sentences) stating the contract that makes the seam safe to build on:

1. unify reads only the source tree and writes only the output directory — never the reverse.
2. Generated source files are indistinguishable from authored ones: layouts, head merge, URL rules, and the reference check all apply.
3. `_*` exclusion gives scripts and working files a home inside the source tree.
4. Post-build tools can trust `dist/`: atomic writes, unchanged files untouched, deletions precise.
5. Builds are deterministic: same tree in, same tree out.
6. One line of honest positioning: *unify's plugin interface is the filesystem; there is no other one.*

That paragraph converts every future "can unify do X?" into "run X before or after unify" — the graceful no the non-goals list currently lacks.

## 2. Which gaps deserve spec inclusion vs. delegation

| Gap (from the Databasin analysis) | Verdict | Why |
|---|---|---|
| Sitemap | **In spec already** (§6 #3) | Validated — keep; priority confirmed by how load-bearing it was for Databasin's SEO ops. |
| RSS / blog index | **Delegate — but ship it in the blog template** | See §4 below; this is the one non-goal with a crack in it. |
| Markdown heading IDs / anchors | **Add to §6 candidates** | §8's success criterion is an OSS project adopting unify *for its docs* — docs without deep-linkable headings fail that user. One sentence ("headings get `id`s derived from their text"), deterministic, no JS, no polyfill impact. TOC generation stays out; anchors are the enabling primitive. |
| Search | Delegate | Pagefind is a *post-build indexer of static HTML* — a perfect seam citizen (see tool list). Recipe, not feature. |
| Head/SEO synthesis for HTML pages | Keep as-is | §5 already prices this in ("every HTML page carries the standard document skeleton"). Markdown pages get frontmatter synthesis; layouts carry site-wide defaults via replace-by-name. The residue (hand-written canonical/og per HTML page) is consistent with the product's honesty. |
| Fingerprinting / cache busting | Delegate | Host-specific (Databasin's SWA cache policy, not a universal need). Post-build recipe. |
| Collections, taxonomies, pagination | Keep cut | The seam answer is strictly better than a feature: a generator script the author owns beats a DSL the tool owns. |
| Parameterized chrome (active nav, per-page CTAs) | Keep cut — but say so in recipes | Generators can't help (they'd have to generate whole pages); the honest answers are areas, client JS, or N layouts. Preempt the question in docs. |

## 3. Existing tools that fit the model

**Fit cleanly (directory-contract citizens):**

- **Pagefind** — post-build static search: indexes `dist/`, emits its own assets into `dist/`. The flagship example; fills Databasin-style search entirely. (It ships JS into the site — the *author's* JS, which §5 explicitly permits.)
- **Serving** (already spec'd): VS Code Live Preview, `bunx live-server`, caddy, browser-sync, `python -m http.server`.
- **Orchestration**: `watchexec`, `entr`, `nodemon`, `concurrently` / npm scripts / a Makefile — the author's idiom, not unify's.
- **Decap CMS / Sveltia CMS** — git-based editing UIs over markdown + frontmatter files. No build coupling at all; they edit the source tree, unify builds it. This is how a unify site gets a CMS without unify knowing.
- **lychee / linkinator** — external-link checking (unify's reference check is internal-only by design).
- **html-minifier-terser** — post-build, until `--minify` (§6 #4).
- **sharp / Squoosh CLI** — image compression, pre-commit (the spec already tells authors to compress before adding).
- **Deploy CLIs**: `gh-pages`, `wrangler`, `netlify`, or plain rsync — "upload dist/ anywhere" is already the story.
- **Feeds/sitemaps**: a 20-line script beats a dependency here (see §4) — worth saying in recipes so people don't reach for npm by reflex.

**Do not fit — and that's diagnostic, not a bug:** anything that wants to hook *into* composition (per-page data injection, i18n string substitution, template contexts) or needs an entry-point/bundler model (Vite-as-bundler, PostCSS pipelines wired into HTML). No seam exists by design; recipes should state this so the boundary is legible.

## 4. The worked example: blog index + RSS as a pre-build step

Yes — it's easy, and the exercise surfaced the sharpest finding of the stress test.

**The crack:** §5 says list pages are maintained by hand and "the blog template models it — publishing a post is adding one line to `index.html`." That holds for the index. It does not hold for the feed: **a blog without RSS is half a blog, and RSS is not hand-maintainable** (dates, GUIDs, escaping, ordering). So the blog template as spec'd either ships no feed, or the "demonstrated demand" the collections bullet waits for is already demonstrated by the template's own existence.

**The resolution that keeps the tool small:** the blog template ships the generator as *authored content* — `_scripts/gen-blog.mjs`, a zero-dependency file the author owns, sitting in the source tree, excluded from output by the default `_*` glob. The tool grows nothing; the template teaches composition. ~40 lines:

```js
// _scripts/gen-blog.mjs — regenerate blog.html and feed.xml from posts/*.md
// Publish flow:  bun _scripts/gen-blog.mjs && unify build
// Inner loop:    watchexec -w posts -- bun _scripts/gen-blog.mjs   (beside `unify watch`)
import { readdir, readFile, writeFile } from "node:fs/promises";

const SITE = "https://example.com";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const posts = [];
for (const file of await readdir("posts")) {
  if (!file.endsWith(".md") || file.startsWith("_")) continue;
  const src = await readFile(`posts/${file}`, "utf8");
  posts.push({
    href:  `/posts/${file.replace(/\.md$/, ".html")}`,
    title: src.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? file,
    date:  src.match(/^date:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? "1970-01-01",
  });
}
posts.sort((a, b) => b.date.localeCompare(a.date));

await writeFile("blog.html", `<!doctype html>
<html>
  <head><title>Blog —</title></head>
  <body>
    <h1>Blog</h1>
    <ul class="post-list">
${posts.map((p) => `      <li><time>${p.date}</time> <a href="${p.href}">${esc(p.title)}</a></li>`).join("\n")}
    </ul>
  </body>
</html>
`);

await writeFile("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>My Site</title><link>${SITE}</link><description>Posts</description>
${posts.map((p) => `  <item><title>${esc(p.title)}</title><link>${SITE}${p.href}</link><guid>${SITE}${p.href}</guid><pubDate>${new Date(p.date + "T00:00:00Z").toUTCString()}</pubDate></item>`).join("\n")}
</channel></rss>
`);
```

Why this is a model citizen, point by point:

- `blog.html` is a **complete HTML page** (design rule 2), so the nearest `_layout.html` wraps it, its title merges, and it may use areas — generated pages participate in the cascade like hand-written ones.
- `feed.xml` is a non-page file → copied to output byte-for-byte, per the file-handling rule.
- The script lives under `_*` → never ships, zero config.
- Every link it emits is validated by the post-build reference check → a renamed post fails the build with a located error pointing at the stale index.
- No new runtime assumption for the *core* audience: the golden path never runs this script; it exists only in the blog template, whose README says "run this after adding a post." (Tension noted honestly: the headline install is a standalone binary for people who've never heard of Bun; the script needs `bun`/`node`. Acceptable for the blog-template user, who is by definition past the five-minute site. An alternative — `unify` growing a script runner — would be scope creep into being a runtime; rejected.)

## 5. Stress-test verdict: what cracked, what held

**Cracked (three findings, all fixable with sentences, not features):**

1. **The blog/RSS claim** (§4 above). Fix: blog template ships the generator; §5's collections bullet gains a clause pointing at the composition seam as the sanctioned escape valve.
2. **The polyfill can't do Markdown.** §3 makes Markdown fragments and pages part of the composition model; §1 rule 3 and §6 #2 claim a ~200-line polyfill implements §3 at runtime. A markdown engine does not fit in 200 lines — as written, the claim is false. Fix: one carve-out sentence — the polyfill previews *HTML composition*; `.md` sources require the build (or an author-supplied converter). This also cleanly scopes the conformance-check role to the part that's actually polyfill-able.
3. **§8 quietly demands more than §3–§5 provide.** The success criterion — an OSS project adopts unify for its site *or docs* — describes a user who needs heading anchors (deep links) and search. Anchors: add to §6 (cheap, deterministic, no JS). Search: Pagefind recipe. Sitemap: already planned. Without at least the anchors candidate and a recipes doc, the spec's own finish line is out of reach for the docs half of its stated ambition.

**Held (give the design credit):**

- **Zero-config and ecosystem composition don't conflict** — they reinforce: `_*` exclusion gives tooling a home, mirror-copy makes generated non-page files (feeds, JSON) ship correctly, the watch contract makes `dist/` safe for post-processors, and the reference check audits generator output. Four existing rules, none designed for this, compose into a real extension story.
- **"Existing SSG users are not the market" survives contact with evidence.** The Databasin analysis shows migration-from-SSG is feature-removal by design; the features unify excludes are the reasons people adopt SSGs. Worth one explicit sentence of positioning so the boundary reads as intent, not oversight: unify competes with copy-paste, SSI, and hand-maintained HTML — not with Hugo/Astro/Eleventy.
- Mirror-copy, body-class merge, head-merge replace-by-name, `--base-url` absolutization, and author-JS neutrality all mapped cleanly onto real Databasin needs (dark-portal theming, JSON-LD, robots overrides, crawler-absolute og tags). The cascade held.

**Ecosystem position in one line:** unify is the *composition stage* of a static pipeline — CMSs and generators clip on upstream through the source tree, indexers/minifiers/deployers clip on downstream through `dist/`, and the tool needs no plugin API because both flanges are directories.

## 6. Recommended spec changes (smallest set, in priority order)

1. Add the "Composing with other tools" seam contract (§1 list of six guarantees above) — ~6 sentences in §4 or beside §5.
2. Amend §5's collections bullet: the sanctioned answer to collections/feeds is a pre-build generator; blog template ships one.
3. Add to §6: Markdown heading `id`s (serves §8's docs ambition).
4. Add to §6 (demand-gated, lowest): `--run <cmd>` pre-build hook, only if the two-watcher inner loop proves painful.
5. Polyfill carve-out sentence in §1 rule 3 / §6 #2: polyfill covers HTML composition; Markdown needs the build.
6. One positioning sentence (§1 or §5): migration from existing SSGs is a non-goal; unify replaces copy-paste and SSI, not Hugo.

Items 1, 5, 6 are corrections/clarifications of things already true. Items 2–4 are the only genuine scope decisions.
