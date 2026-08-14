# Fernhollow Seed Library — build report

## 1. Files created, and why

Hand-authored:

- `src/_layout.html` — the site-wide chrome: leaf mark header, `<main>` slot, and
  a `<footer>` whose named slot defaults to the contact strip.
- `src/_includes/header.html` — the shared header (leaf mark + nav), included by
  both layouts so it is byte-identical everywhere.
- `src/_includes/footer.html` — the shared contact strip, included as the
  fallback for the layout's `footer` slot.
- `src/styles.css` — the site's stylesheet (also styles the shared header/footer
  inside the seasonal-notes section, since that section reuses them).
- `src/assets/leaf.svg` — the library's leaf mark, used in the header and as the
  favicon; no image files were supplied, so this is a small placeholder I wrote.
- `src/assets/card.svg` — a placeholder share-card image used for `og:image` on
  the home page, variety pages, and the catalogue (variety pages need to "look
  right" when shared; there are no photos to use).
- `src/index.html` — the home page.
- `src/how-lending-works.html` — the lending-terms page; fills the layout's
  `footer` slot with membership terms instead of the usual contact strip.
- `src/guides/index.html` — a hand-curated list of the three guides (only three
  exist and they don't change weekly, so this didn't need to be generated).
- `src/guides/seed-saving-basics.md`, `src/guides/sowing-under-cover.md`,
  `src/guides/dealing-with-slugs.md` — the three Markdown growing guides,
  written as plain Markdown with only a `title`/`description` frontmatter, as a
  non-HTML-writing volunteer would.
- `src/seasonal-notes/_layout.html` — the section's own layout: warmer palette,
  its own extra stylesheet, but the identical shared header/footer includes.
- `src/seasonal-notes/notes.css` — the section-only stylesheet, scoped under
  `body.seasonal-notes` so it can't leak onto pages using the root layout.
- `src/seasonal-notes/2026-01-12-*.md`, `2026-02-02-*.md`, `2026-02-21-*.md`,
  `2026-03-07-*.md` — four dated seasonal-note entries, each with a `date`
  frontmatter key (also shown as visible text in the entry).
- `src/seasonal-notes/seed-swap-dates.html` — the section's one exception page;
  sets `data-layout="/_layout.html"` to explicitly opt back into the root
  layout instead of the section's nearest one.
- `src/_scripts/gen.mjs` — the generator script. Reads `../../varieties.json`
  (outside the source root, so it is never itself a build input that could be
  emitted) and the seasonal-notes Markdown files, and writes:
  - `src/varieties/<slug>.html` — one page per catalogue variety (27 files).
  - `src/catalogue/index.html` — the full-catalogue page with client-side
    family filter and name search.
  - `src/availability.html` — the bare availability page (`data-layout="none"`),
    a season-by-family packet count with no site chrome.
  - `src/seasonal-notes/index.html` — the seasonal-notes index, newest entry
    first, built from whatever `.md` files it finds — no hand edits needed
    when a volunteer adds another note.

Generated (committed as part of the source tree, produced by `gen.mjs`, listed
here as source files since they live in `src/`):
`src/varieties/*.html` (27), `src/catalogue/index.html`,
`src/availability.html`, `src/seasonal-notes/index.html`.

Not created: `varieties.json` and `drafts/` were left exactly where they were,
outside `src/`, so unify's source root never sees them and they cannot be
emitted.

## 2. Publish command and verification

Generation step, then the publish build:

```
node src/_scripts/gen.mjs
./unify build --pretty-urls --base-url https://fernhollow.pages.dev/library/ --clean
```

`src/` exists, so it is the source root automatically. `--pretty-urls` gives
extension-less addresses; `--base-url https://fernhollow.pages.dev/library/` is
the site's whole published address (a subdirectory, not a domain root), which
prefixes every root-relative link/asset and makes `og:image` absolute.

Before publishing I ran `./unify build --dry-run --strict --pretty-urls --base-url
https://fernhollow.pages.dev/library/`, which reported zero problems and listed
all 45 files it would write, each with the layout it resolved to — this is where
I confirmed, before anything was written, that `seed-swap-dates.html` resolved
against `_layout.html` (not the section layout) and that `availability.html`
resolved with "no layout".

Verification performed on the actual `dist/` output (not just locally-plausible
markup):

- `find dist -type f` — 45 files, no `varieties.json`, no `drafts/` content.
- Grepped for every `keeper_contact` address and every `seed_keeper` name from
  `varieties.json` across all of `dist/` — none present.
- Read the emitted `dist/index.html`, `dist/how-lending-works/index.html`,
  `dist/seasonal-notes/index.html`, `dist/seasonal-notes/seed-swap-dates/index.html`,
  `dist/availability/index.html`, and a sample variety page in full, and
  confirmed: every internal `href`/`src`/`<link>` is rewritten to
  `/library/...` (not bare `/...`, not `.html`); the how-lending-works footer
  shows membership terms with no contact strip and no nested `<footer>`; the
  seasonal-notes pages carry `class="seasonal-notes"` and load
  `/library/seasonal-notes/notes.css`, while `seed-swap-dates` does neither;
  `availability/index.html` has no header, nav, footer, or stylesheet link at
  all; `og:image`/`og:title`/`og:description` on variety and home pages are
  absolute `https://fernhollow.pages.dev/library/...` URLs.
- Grepped all of `dist/**/*.html` for a literal `.html` inside any `href="…"`
  — none found, so no visitor-facing address ends in `.html`.
- Re-ran the same `--dry-run --strict` build after the real build and diffed
  the file list against what was actually written — identical, confirming the
  publish matches what the dry run promised.
- Extracted the "Fernhollow keeps…" sentence from all 41 pages and confirmed
  all 41 are present and pairwise distinct (`sort | uniq -c` shows every count
  as 1).

I don't have a browser, so "correct for that address" here means: every
resource reference in the emitted HTML is an absolute path under
`/library/...` (verified by inspecting the files directly), which is what a
static host would need to serve those files correctly from that subdirectory —
I did not render the pages, only inspected the markup.

## 3. Rules re-read, and what I had to decide myself

Re-read repeatedly: the "Merging a page into its layout" section, particularly
slot handling. The unclear sentence:

> "slot= counts on direct children of `<body>` — or of your `<main>`, unwrapped
> first — and silently does nothing deeper."

It wasn't obvious whether a `slot="footer"` element had to live outside a page's
`<main>` or could live inside it. I resolved this empirically: I scaffolded
`unify init`, built its sample `contact.html` (whose `slot="footer"` paragraph
is a direct child of `<body>`, no `<main>` at all), then wrote my own test page
that put content in a `<main>` with a `slot="footer"` element among its direct
children, built it, and confirmed the slot still filled correctly. I used that
pattern (content and the footer-slot element both as direct children of one
`<main>`) throughout.

Also re-read: "where the layout wraps its slot in its own `<footer>`, write
`<p slot="footer">`, or you ship a footer inside a footer" — confirmed against
the scaffolded template's `contact.html`, and used a `<div slot="footer">` (not
`<footer>`) on the how-lending-works page for the same reason.

Also re-read the layout-selection rule ("Pick one with `data-layout=…`… opt out
with `data-layout="none"`") to confirm an explicit `data-layout` on a page wins
over the nearest-folder `_layout.html` even when the page sits inside a folder
that has its own layout. I verified this with a throwaway `section/normal.html`
vs `section/special.html` test before relying on it for `seed-swap-dates.html`.

Nothing else needed re-reading; the file/include/markdown rules were
unambiguous once tested against a scaffold.

## 4. Anything unsure was legal

The catalogue entries carry `seed_keeper` (a member's name) and
`keeper_contact` (a member's personal email). The brief only explicitly forbids
shipping `varieties.json` itself, giving the reason "it carries members'
names" — it doesn't explicitly say those two fields must be withheld from the
generated variety pages. But since that's the brief's own stated reason for
keeping the file out of the site, I treated it as governing the fields too:
variety pages show name, family, season, sow window, days to maturity, and
packet count, but never `seed_keeper` or `keeper_contact`. I verified their
absence by grep across the whole `dist/` tree (see §2).

I also wasn't sure an SVG is a legitimate `og:image` for chat-app link
previews — some clients don't render SVG previews. The brief is explicit that
"you have no image files: write a small placeholder SVG wherever the site
needs one," so I used one anyway rather than omitting `og:image` altogether;
noted below as something I'd have liked the tool to warn about.

## 5. Anything I wanted the tool to tell me and it did not

- What actually triggers an "advisory" (the thing `--strict` promotes to a
  build-failing problem). I tried a few likely candidates — an orphaned page,
  an `<img>` pointing at a non-image file — and never got one to fire; broken
  links and unresolvable assets were always hard errors regardless of
  `--strict`. I never found out what `--strict` actually adds.
- Any check on `og:image` file type/dimensions — it happily accepted an SVG
  with no warning, and I have no way to confirm chat-app rendering without a
  browser or a reachable preview-fetcher.
- Anything about accessibility (missing `alt`, heading order, contrast) — out
  of scope for the tool per `rules.md`, but a build-time nudge would have been
  useful given there's no browser here to check visually.

## 6. Other project instructions or documentation

NO
