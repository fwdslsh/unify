# Fernhollow Seed Library — build report

## 1. Files created

Hand-authored files, plus the generator that produces the rest.

- `src/_layout.html` — root layout: shared header, `<main>` slot, and a named `footer`
  slot (defaulting to the contact strip) used by every page except How lending works.
- `src/_includes/header.html` — the shared header with the leaf mark and main nav,
  included by both layouts so it is byte-identical everywhere.
- `src/_includes/footer.html` — the contact-strip content (no `<footer>` tag of its
  own, since both layouts already wrap the slot in one).
- `src/index.html` — the home page.
- `src/how-lending-works.html` — the lending page; fills the `footer` slot with
  membership terms instead of the contact strip.
- `src/catalogue/index.html` — the Browse the catalogue page shell: the family picker
  nav plus an empty results region and a `<script>` tag. Hand-written (not generated)
  because its structure doesn't change season to season, only the data behind it does.
- `src/catalogue/_family-nav.html` — generated fragment of real `<a href>` links (one
  per family, with counts), included into `catalogue/index.html`. Underscore-prefixed
  so it never ships as its own page.
- `src/catalogue/data/<family>.json` (12 files) — one per plant family, generated;
  each holds only that family's varieties (public fields only). This is what the
  browse page fetches after the visitor picks a family.
- `src/assets/catalogue.js` — the client script: intercepts a click on a family link,
  fetches that family's JSON, and renders the results in place, no reload.
- `src/assets/site.css` — shared site styling (header, footer, home, catalogue,
  variety pages).
- `src/assets/guides.css` — the extra styling that gives Growing Guides its own look;
  loaded in addition to `site.css`, not instead of it.
- `src/assets/leaf-mark.svg`, `src/assets/seed-packet.svg`, `src/assets/sprout.svg` —
  placeholder art (logo, variety-page icon, unused-reserve icon), since no real images
  were supplied.
- `src/guides/_layout.html` — the guides section's own standalone layout (own look,
  same header/footer includes as the root layout — layouts don't chain, so it repeats
  the includes rather than wrapping the root layout).
- `src/guides/index.html` — Growing Guides landing page, listing the guides.
- `src/guides/starting-seed-indoors.md`, `src/guides/watering-in-a-dry-summer.md`,
  `src/guides/saving-your-own-seed.md` — the three guides, written in Markdown as the
  brief specifies volunteers do.
- `src/varieties/<slug>.html` (225 files) — one page per catalogue entry, generated.
- `src/_scripts/gen.mjs` — the generator. Reads `../../varieties.json`, disambiguates
  slugs, and (re)writes `src/varieties/*.html`, `src/catalogue/data/*.json`, and
  `src/catalogue/_family-nav.html`. Re-running it after a fresh seasonal export and
  then rebuilding is the whole update — nobody hand-edits a variety page.
- `REPORT.md` — this file.

Everything above lives under `src/`, which I created as the source root specifically
so that `rules.md`, `BRIEF-r20.md`, `varieties.json`, `drafts/`, and the `unify`
binary itself — none of which are part of the site — stay outside it and can never be
shipped by "everything in the source root ships."

## 2. Publish command and verification

```
./unify build --source src --output dist --pretty-urls \
  --base-url https://fernhollow.pages.dev/library/ --clean
```

I ran `--dry-run --strict` first (exit 0, no problems reported, "would publish 250
files") and then the real build, which also exited 0.

To check correctness *for that address*, not just locally, I wrote a small local
static server that mounts `dist/` at the path prefix `/library/` (the only thing a
real host adds that a plain file-open wouldn't), so every request an actual visitor
at `https://fernhollow.pages.dev/library/...` would make resolves the same way here.
Against that server I:

- Confirmed the site 404s outside `/library/` and 200s for the home, catalogue,
  how-lending-works, guides, and a sample variety page, plus every asset
  (`site.css`, `guides.css`, `catalogue.js`, all three SVGs).
- Fetched `/library/catalogue/` and parsed the *actual rewritten HTML* it served —
  not my source — to pull out the 12 family links unify had rewritten with the
  `--base-url` prefix and pretty URL.
- For **every one of the 12 family links**, resolved the link the way a browser
  would, fetched the JSON it pointed to, and for **every item in every family's
  JSON** (225 total, matching the catalogue size) computed the variety URL the way
  `catalogue.js` does (deriving the site root from the fetched link's own resolved
  address, not a hard-coded path) and fetched it. All 225 returned 200 with the
  page's unique "Fernhollow keeps" sentence intact. Zero broken links.
- Grepped the built `dist/` for `seed_keeper`, `keeper_contact`, any member's name,
  `varieties.json`, and anything from `drafts/` — none present. The only
  `@fernhollow-members.example` address in the output is the library's own public
  contact address in the footer, which is intentional.
- Grepped every built page for the sentence beginning "Fernhollow keeps" and diffed
  it against the page count: 232 pages, 232 sentences, all distinct (225 varieties +
  home + how-lending-works + catalogue + guides index + 3 guides).

This is also why the browse page's fetch logic doesn't hard-code a relative path
like `../data/x.json`: it reads `link.href` off a real anchor tag that unify already
rewrote at build time (base-url and pretty-urls both applied), then derives the data
directory from that resolved address. `fetch()` strings themselves are never rewritten
by unify, so anything I typed as a literal path would have been my responsibility to
get right for one specific depth; deriving it from an already-correct rewritten href
means it can't drift out of sync with how the rest of the site is addressed.

## 3. Rules re-read, and what I had to decide myself

I went back to the **Include**, **Layout**, and **Merging a page into its layout**
sections repeatedly while getting the footer-override behavior right, and to the
**Styles, scripts, finishing** section for the base-url/pretty-urls caveat about
`fetch()`.

The line I had to slow down for was:

> "where the layout wraps its slot in its own `<footer>`, write `<p slot="footer">`,
> or you ship a footer inside a footer."

It's clear about the fix once you've hit the problem, but it doesn't say outright
that the *default* fallback content (what ships when a page doesn't override the
slot at all) must follow the same rule — I had to infer that `_includes/footer.html`
also needed to avoid its own `<footer>` tag, by reasoning from the general slot
mechanics rather than a sentence that said so directly. I confirmed this with a
throwaway test build before writing the real site (see below).

Two things the rules didn't answer, that I decided myself:

- **Duplicate `slug` values in the data.** Nothing in `rules.md` covers this — it's a
  data problem, not a tool problem. `varieties.json` has 210 unique slugs across 225
  entries; 15 slugs are each shared by two *different* catalogue entries (same name,
  different family and days-to-maturity). Writing straight to `varieties/<slug>.html`
  would have silently overwritten 15 pages and produced only 210. I disambiguated by
  appending the family to the URL slug whenever a base slug collides
  (`late-squash-1--apiaceae.html` / `late-squash-1--umbellifer.html`), and had
  `gen.mjs` hard-fail if any collision remained after that — so a future season's
  export that collides in some new way breaks the generator loudly instead of quietly
  dropping a page.
- **How to make the fetch URL survive `--base-url` at any depth.** `rules.md` states
  which attributes get rewritten (`href`, `src`) and warns that `fetch()`/`url()`
  don't, but doesn't prescribe a pattern for getting a correct address into a script
  anyway. I chose the "read a real rewritten `<a href>`" approach described in
  section 2 over hand-writing a relative path, specifically because the brief warns
  the site must resolve "from every page, at every depth" and I wanted the mechanism
  to be structurally incapable of drifting, not just correct for the one layout I
  happened to test.

## 4. Things I was unsure were legal

- **Writing `catalogue/index.html` directly** (a source file already named
  `index.html` inside a folder) rather than `catalogue.html` and letting
  `--pretty-urls` rename it. The rules only describe the `--pretty-urls` rewrite
  (`about.html → about/index.html`) and separately say a directory link "resolves
  only if you wrote a `guides/index.html`" — implying hand-authoring a `dir/index.html`
  is a supported, ordinary shape, not just a rewrite target. I built a throwaway test
  site to confirm: `--pretty-urls` left my hand-written `manualdir/index.html` alone
  (no double-wrapping into `manualdir/index/index.html`), and it correctly inherited
  the root `_layout.html`. I did the same kind of scratch-directory check before
  trusting the slot/footer behavior and the include-URL-rewriting behavior described
  above, rather than assuming from the prose alone.
- **Putting real, working `<a href>` elements in the family picker that JavaScript
  intercepts with `preventDefault()`.** The brief requires the switch to happen
  "without the page reloading," and I wanted the address to be tool-rewritten (see
  above), which meant it had to be a real anchor. I judged this legal since nothing in
  `rules.md` restricts what an `<a>` can be used for, and confirmed the click handler
  actually stops navigation and fetches instead by re-deriving and re-running the
  exact logic from `catalogue.js` against the built output (section 2).
- **Excluding `seed_keeper` and `keeper_contact` from every generated page and JSON
  file.** The brief says `varieties.json` itself must never appear published because
  "it carries members' names and addresses," but doesn't explicitly say those two
  fields must never appear even when copied out field-by-field into a variety page. I
  treated the brief's stated reason as controlling and left both fields out
  everywhere, including the per-family JSON, rather than treating "don't publish the
  file" and "the file's sensitive fields are fine once repackaged" as different rules.

## 5. Things I wanted the tool to tell me and it didn't

- Whether a `<script src>` or a JS `fetch()`/string literal is ever rewritten under
  any flag — `rules.md` says it isn't, but I would have liked `--dry-run --strict` to
  at least *flag* a root-relative-looking string inside a `<script>` block as
  something it can't verify, the way it already flags a broken local `href`/`src`. As
  it stands, a root-relative fetch path that's wrong for the deployed subdirectory
  would build clean and only fail in the browser — the dry run has no way to catch
  that class of mistake, and I had to verify it myself by simulating the address.
- Any per-page word count / payload-size reporting. The brief's core constraint is
  that the catalogue page must stay light; `--dry-run` tells me *what* it would
  publish but not how large the browse page (or each family JSON) actually is, so I
  had to size-check that manually rather than have the build confirm it.
- What counts as a "problem" versus an "advisory" wasn't itself listed anywhere I
  could find — I only saw the one class of problem (an unresolvable local link) in
  practice, via the intentional broken-link test in section-2-style scratch work, and
  had to infer the severity model from that single example rather than from
  documentation of it.

## 6. Outside documentation

NO
