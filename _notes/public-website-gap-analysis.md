# Gap analysis: Databasin public-website vs. unify product spec

**Date:** 2026-08-11
**Compared:** `~/code/tpi/public-website` (custom Node ESM build, `src/scripts/build-site.mjs` + `src/site/renderers.mjs`) against `docs/product-spec.md` (Draft v1 — the authoritative spec per its own header; the shipped tool intentionally differs until realignment).

**Site inventory:** 35 pages (`content/pages/**/*.md`, all raw-HTML bodies — zero use `renderMarkdown`), 36 news entries, a manifest-driven docs collection, 33 sidecar CSS files, 6 token-templated layouts, 18 token-templated partials.

## Verdict

The public website is a **generated** site: collections (news, docs), derived artifacts (sitemap, RSS, search index, llms.txt, cache-busted URLs), parameterized chrome (nav/footer variants, per-page tracking flags), and build-time policy gates (approval blocks, frontmatter validation). unify is deliberately a **hand-authored** site tool — its spec names collections, RSS, templating/props, config, and custom build logic as explicit non-goals (§5). The 35 marketing pages' chrome could be re-expressed in unify's model (includes + `_layout.html` + `unify-*` areas), but roughly half the build's output cannot be produced by unify at all and would require a companion script layer around it — at which point the site has re-built `build-site.mjs` as a wrapper.

---

## A. Hard gaps — cannot be expressed in unify (spec non-goals or absent features)

1. **News collection (36 entries).** `src/features/news/build.mjs` derives the `/news/` index (date-desc sort, category filter chips, tag pills), per-entry pages with newer/older navigation, reading time (220 wpm), pretty dates, and validates frontmatter (category enum, date format, slug rules, no-H1-in-body). Spec §5: *"No collections, pagination, RSS, or taxonomies."* The spec's blog answer is a hand-maintained index page; the derived data (sort, prev/next, chips, reading time) has no unify expression.

2. **RSS feed** (`/news/rss.xml`). Generated from the collection. Explicit non-goal (§5).

3. **Docs pipeline.** `content/docs/manifest.json` drives category structure → sidebar rendered on every docs page, docs index with category cards/accents, per-article TOC extracted from rendered `<h2>`s **with generated heading IDs** (cheerio post-pass; unify's markdown pipeline specifies no heading-ID/anchor generation), prev/next links, reading time, "Last updated" formatting. Entirely derived; no unify equivalent.

4. **Token templating.** Layouts/partials use `{{ }}` / `{{{ }}}` substitution (`src/site/templates.mjs`); body partials additionally support `{{#if}}`, `{{#each}}`, dotted lookup, and JSON-parameterized includes (`<!-- include: hero {"title": …} -->`, `src/site/partials.mjs`). Spec §5: *"No templating language… No component framework. No props."* unify `<include>` is verbatim inlining only. Body-partial usage is thin (1 page uses `breadcrumb`), but the entire shell — nav, footer, all 7 tracking partials, GA, logos — is parameterized partials.

5. **Data-driven nav/footer with per-page parameters.** `navItems()`/`FOOTER_LINKS` generate chrome from JS data: `navVariant` (3 values in use), `footerVariant` (6 in use), `activeNav` highlighting per page, `navDemo`/`navSignupUrl`/`navCtaLabel` overrides (4 pages), dark/light logo switching keyed off `bodyClass`, footer year `new Date().getFullYear()`. In unify every combination becomes a distinct static layout/include, or the varying region becomes a `unify-*` area that deviating pages override. Build-time active-nav marking is impossible without per-page nav markup — realistic replacement is client JS (the site already ships its own `nav.js`; unify never touches author JS) or accepting ~10 flattened layout files.

6. **Sitemap.xml** with `includeInSitemap` filtering and `sitemapPath` overrides. unify: post-MVP candidate #3, not in MVP. Currently a hard SEO requirement (verified by `seo:check`).

7. **search-index.json** (pages + news + docs records) consumed by the sitewide nav search overlay (`static/js/search.js`). Custom emitted artifact.

8. **llms.txt** — curated allowlist (3 routes) + docs manifest, with build failure if an allowlisted route is missing. Custom artifact + custom check.

9. **Cache-busting query strings.** `bustAssetCaches()` stamps every local css/js reference with `?v=<sha256:8>`. Load-bearing for the Azure SWA cache policy (`max-age=86400` on css/js — without busting, a deploy leaves returning visitors on day-old CSS). unify rewrites URLs only for pretty-urls/base-url; it will not add content hashes. Post-build script, or change the cache-header strategy.

10. **Computed head assembly.** `renderCommonHead()` synthesizes ~15 tags per page from 2–3 frontmatter fields: title→og:title→twitter:title, description→og:description fallback chain, canonical derived from file path and absolutized, og:url, og:image resolution with site-wide default and a **build-failing SVG guard**, og:type by page id, robots default. In unify, layout head carries the static site-wide defaults and page metas replace layout metas by `name`/`property` — but every URL/title-bearing per-page tag must be hand-written in each page's `<head>` (~10–15 tags × 35 pages, duplication between title/og/twitter maintained by hand). `--base-url` does absolutize canonical/og/twitter — that one piece maps.

11. **Per-page tracking toggles + config-gated pixels.** `includeClarity`/`includeHubspot` frontmatter booleans (default true; kiosk opts out), five ad pixels emitted only when their IDs are configured in `site.mjs`, split head/body tracking channels (LinkedIn `<noscript>` fallback), GA dedupe check (skips injection when `extraHead` already carries the property ID). In unify tracking becomes static markup in layouts (opt-out = a separate layout); the conditional/dedupe logic disappears.

12. **Publication policy gates.** `assertPublishableApproval()` fails the build unless a page's `approval` block is `type: page`, `status: APPROVED`, targets the canonical route, and names a reviewer + ISO timestamp; news validation (see 1); og:image raster guard (see 10). unify has no plugin/hook system and its advisory set is fixed — these must move to a separate CI lint script.

13. **Multi-output pages.** Homepage writes `index.html` + `databasin-homepage.html` via `outputPath`/`outputs[]`. unify: one source, one output. Mitigation: `staticwebapp.config.json` already 301s the legacy path, so the duplicate file may simply be droppable.

14. **Vendor assembly from node_modules.** `build.mjs` assembles exact-version Mermaid (11.16.0) and Prism (1.29.0, 4 allowlisted grammars) with license files into `dist/vendor/<pkg>/<version>/`, failing on version drift. Under unify this becomes a committed `vendor/` tree in the source (copy-through) or a pre-build script.

---

## B. Misalignments — expressible in unify, but semantics differ / real migration work

15. **Pages are `.md` in name only.** All 35 bodies are raw HTML inside markdown files. unify runs `.md` through markdown conversion — indentation-sensitive and risky for full-page raw HTML. The unify-native move is converting every page to a complete `.html` document (spec design rule 2), folding frontmatter into real head/body markup.

16. **Frontmatter surface (~25 keys) mostly dissolves.** `title`/`description`/`robots`/`ogImage`/`extraHead`/`viewportContent` → hand-written head tags; `layout` → `data-unify`; `bodyClass` → `<body class>` (merges cleanly, §3.2 rule 4); `styles` → a `<link>`; `navVariant`/`footerVariant`/`activeNav`/`navDemo` → layout choice or area overrides; `canonicalPath`/`sitemapPath`/`includeInSitemap`/`outputPath`/`outputs`/`approval` → no equivalent (external tooling or dropped).

17. **Legacy URL normalization.** `normalizeSiteHtml()` rewrites `src="images/…"` → `/images/…`, `databasin-*.html` → clean URLs at build time. unify resolves URLs against the authoring file instead — the remaining legacy-relative references need a one-time content cleanup to root-relative paths.

18. **Sidecar CSS repathing.** Auto-detected `styles.css` beside each page is emitted to `/css/pages/<slug>/index.css` (homepage special-cased to `homepage.css`). Under mirror-copy the sidecar ships beside the page (`/platform/styles.css`) and the page links it relatively — works, but the `/css/pages/` URL tree and the homepage special case die, and any checks/tests asserting those paths break.

19. **Dev loop changes.** Vite (port 3000, CSS-only HMR fast path, ws full-reload) → `unify watch` + external static server. CSS HMR nicety is lost; the watch contract's atomic writes/error pages arrive instead.

20. **Source restructure.** `content/pages/<slug>/index.md` + `static/` + repo-root `staticwebapp.config.json` collapse into one source root mirroring the site (`<slug>/index.html`, `css/`, `images/`, `js/`, `features/`, config file inside the root so it copies through). `trailingScripts` land inside the layout's `<main>` slot rather than before `</body>` (fine with `defer`, but DOM placement changes — or move them into layouts).

21. **Adjacent tooling needs re-pointing, not replacing.** `seo-check`, `site-check`, `baseline-diff`, `content-snapshot`, `page-hash`, `parity-all`, `publish-devto` (reads `content/news` frontmatter) read `dist/` or content and survive — but several assert current output details (css paths, shell markup) and all assume the current directory layout. `test/site-rendering.test.mjs` and feature tests assert renderer output.

---

## C. What maps cleanly (the honest other column)

- Shared chrome as `<include>` fragments + `_layout.html`; layout chaining (§3.2) fits marketing/docs/news/standalone sections.
- `bodyClass: dark-portal` → page `<body class>`, merged additively by §3.2 rule 4.
- `extraHead` JSON-LD / preloads → real tags in each page's `<head>`; head merge appends them after the layout's.
- Per-page `robots`/`viewport` overrides → page `<meta>` replaces layout `<meta>` by name.
- Clean URLs need no `--pretty-urls`: author sources as `<slug>/index.html` and output mirrors it exactly.
- `--base-url https://www.databasin.ai/` absolutizes canonical/og:/twitter: URLs (§4), matching `seo:check`'s absolutization requirement.
- All author JS (`nav.js`, `search.js`, `reveal.js`, mermaid/prism loaders, mobile-bridge) copies through untouched — unify adds/removes no JS.
- `staticwebapp.config.json` routing (301s, 404, headers) is platform-side and unaffected.
- The kiosk/standalone page → its own minimal layout via `data-unify`.

---

## Bottom line

To host this site, unify-as-spec'd must be wrapped by external scripts for: news + docs generation (A1–A3), sitemap/search-index/llms.txt/RSS (A2, A6–A8), cache busting (A9), and policy gates (A12) — plus a full content migration (B15–B18) and a flattening of the nav/footer variant matrix (A4–A5, A10–A11). None of these wrappers violate unify's model (it tolerates generated files landing in its source tree), but the division of labor means unify would replace only `renderPageHtml()` + `copyStatic()` — the smallest part of `build-site.mjs`. Items that are spec non-goals (collections, RSS, templating, hooks) are permanent gaps by design; sitemap generation (post-MVP #3) is the one gap the spec already plans to close.
