# unify-docs — unify's own documentation site, built by unify

The dogfooding example (issue #51). It renders the repository's real `docs/` directory as
a documentation site, using nothing but the five authoring primitives.

**Live at <https://unify.fwdslsh.dev/>**, deployed on every push to `main` that touches
`docs/` or this directory (`.github/workflows/deploy-docs.yml`). The address below is that
real address — a custom domain, DNS-verified and configured as this repository's Pages
domain in Settings → Pages.

```bash
cd examples/unify-docs
unify build -s src -o dist \
  --generate _scripts/gen.mjs \
  --pretty-urls \
  --base-url https://unify.fwdslsh.dev/ \
  --canonical auto \
  --search-index
```

Both gates pass:

```bash
unify build -s src -o dist --generate _scripts/gen.mjs --pretty-urls \
  --base-url https://unify.fwdslsh.dev/ --canonical auto --search-index --dry-run --strict   # exit 0
unify audit -s src --generate _scripts/gen.mjs --pretty-urls \
  --base-url https://unify.fwdslsh.dev/ --canonical auto --search-index --strict            # exit 0
```

18 files: 12 documentation pages, an index, a front page, a 404, the stylesheet,
`sitemap.xml`, and `search-index.json`.

## It renders the real docs, not a copy

`src/_scripts/gen.mjs` reads `../../../docs` — the repository's actual documentation — and
writes one page per file into the `--generate` overlay. **Nothing is copied into this
example.** Edit `docs/authoring-rules.md` and this site changes on the next build; there is
no second copy to drift.

That is also the one thing to know before copying this example elsewhere: it is deliberately
*not* self-contained. It only builds inside a unify checkout, and says so with a located
error if `docs/` is missing.

## What each primitive is doing here

| Primitive | Where |
|---|---|
| `<include src>` | the masthead, hand-authored in `src/_includes/`; the sidebar, generated into the overlay's `_includes/` |
| Layout | one `src/_layout.html` wraps every page, generated ones included; discovery is automatic and no page names it |
| Named slot | the footer, with fallback content the pages don't override |
| Underscore | `_includes/` and `_scripts/` are read by the build and never ship |
| `data-layout="none"` | `src/404.html` opts out of the chrome entirely |

Plus the production layer: `--pretty-urls`, `--base-url`, `--canonical auto`,
`sitemap.xml`, `--search-index`, and `schema: WebPage` on every generated page.

## The generator

`--generate` names one file and hands it two arguments — the source root and an empty
overlay directory. `gen.mjs` uses them to do four things:

1. **One page per doc**, with `title`, `description`, `lang` and `schema` frontmatter
   derived from the document itself (the title from its `# Heading`, the description from
   its `**Role**:` line).
2. **Rewrite every internal link** so it resolves in the built site — `authoring-rules.md`
   becomes `/docs/authoring-rules.html`, and anything naming a repository file the site
   does not publish becomes a GitHub URL. unify's reference check audits generated pages
   exactly like hand-authored ones, so a link left unrewritten is a build failure, not a
   404 a reader finds later.
3. **Disambiguate repeated headings**, because heading ids are slugs and two identical
   headings in one document would collide into a duplicate id.
4. **Generate the sidebar**, from the same list the pages came from, so a new document
   cannot be published unreachable. It is written to the overlay's `_includes/docnav.html`
   and picked up by `_layout.html`'s ordinary `<include src="/_includes/docnav.html">`: the
   overlay and `src/` share one path space, so an include resolves across the boundary in
   either direction. It was hand-authored with a completeness assertion standing in for
   this until issue #55 was fixed — see `FINDINGS.md`, finding 2.

## What it found

Building this site was the point; the site is the instrument. `FINDINGS.md` records what it
turned up — one bug that contradicts the documented `--generate` contract (generated pages
silently get no layout), a related gap in include resolution, an undocumented trap for
HTML-authored docs sites, one genuine defect in the documentation (fixed), and five things
that worked better than expected.

The first two were one flaw — the overlay joined the scan but not the resolution namespace —
and are fixed ([#54](https://github.com/fwdslsh/unify/issues/54),
[#55](https://github.com/fwdslsh/unify/issues/55)). This example carried the workarounds for
both, and removing them is how the fix was proved: no page names a layout any more, and the
sidebar is generated rather than hand-authored and asserted.

## Deployment

`.github/workflows/deploy-docs.yml` builds this example and publishes `dist/` to GitHub
Pages on every push to `main` under `docs/` or `examples/unify-docs/`, or on demand via
`workflow_dispatch`. It runs the same two gates as above — `build --dry-run --strict`, then
`audit --strict` — before the real `build --clean --strict` that is actually published;
either gate failing stops the deploy, the same transactional guarantee `unify build` itself
gives a local run.

**Two things the workflow could not do for itself, both now done**: GitHub Pages' source is
set to **Settings → Pages → Build and deployment → Source → "GitHub Actions"**, and the
custom domain (`unify.fwdslsh.dev`, DNS-verified) is configured on the same settings page —
which is also what provisions the certificate. No `CNAME` file lives in the build output for
this: GitHub Actions deployments ignore one if present, and the domain lives entirely in the
repository setting. Before the domain existed, the site was reachable at the default
project-pages address, `fwdslsh.github.io/unify/`; that address still resolves and now
redirects to the custom domain.

If either setting is ever missing — a fresh fork, say — the `deploy` job fails with GitHub's
own "Pages site not found," while the `build` job (both gates plus the real build) succeeds
regardless, so a red `deploy` step next to a green `build` step means exactly this.
