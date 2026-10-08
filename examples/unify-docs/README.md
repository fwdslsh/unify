# unify-docs: unify's own documentation site, built by unify

The dogfooding example (issue #51). It renders the repository's real `docs/` directory as
a documentation site, using nothing but the five authoring primitives.

**Live at <https://unify.fwdslsh.dev/>**, deployed on every push to `main` that touches
`docs/`, `src/`, or `examples/**` (`.github/workflows/deploy-docs.yml`). That address is a
custom domain, DNS-verified and configured as this repository's Pages domain in
Settings > Pages.

The look is the docs template's (`templates/docs`), which this site **extends** rather
than copies (`extends: ../../templates/docs` in `unify.yaml`): the layout, the stylesheet
and the All-pages directory are the template's, read in place from this repository, and
akm.fwdslsh.dev extends the same template from npm. What is this site's own is small:
the four files that name it (`site/_includes/head.html`, `nav.html` and `footer.html`, and
the sidebar the generator writes), its own pages (`index.html`, `examples/`, `templates/`),
`assets/site.css` for those pages, and its share card. The only client JavaScript on the site is the few lines on `/examples/` that
resolve the "View live" addresses — see the comment in `site/examples/index.html` for why
they cannot be plain hrefs.

The build's flags live in `unify.yaml` beside `site/` (generator, pretty URLs, base URL,
canonical, catalog, search corpus), so the documented build is just:

```bash
cd examples/unify-docs
unify build
```

Both gates pass:

```bash
unify build --dry-run --strict   # exit 0
unify audit --strict             # exit 0
```

From the repository root (what the workflow does, with the CLI from the checkout), name
the source explicitly; `--generate` on the command line is relative to the source root, so
it is `../scripts/gen.mjs` there, while `generate:` inside `unify.yaml` is relative to the
file:

```bash
unify build -s examples/unify-docs/site -o examples/unify-docs/dist \
  --generate ../scripts/gen.mjs --extends templates/docs --pretty-urls \
  --base-url https://unify.fwdslsh.dev/ --canonical auto --catalog --search-corpus
```

## It renders the real docs, not a copy

`scripts/gen.mjs` publishes the repository's `docs/` at every build through the docs
template's importer (`templates/docs/scripts/import-docs.mjs`): every document lands at
`docs/<its path>`, keeps its links (unify resolves a `.md` link to the page it publishes,
and `#anchor` to the heading GitHub would), and a link to a repository file the site does
not publish goes to GitHub. **Nothing is copied into this example.** Edit
`docs/authoring-rules.md` and this site changes on the next build; there is no second copy
to drift. Each document carries its own `description:` in frontmatter, which is what the
page and the index show.

What the generator still does itself is the one thing no folder listing can know: this
site's reading order. It groups the documents (Guides, Reference, Project, and More for
anything new) and writes them as the sidebar (`_includes/docnav.html`, which replaces the
template's) and as the docs index (`docs/index.md`), so a new document cannot be published
unreachable.

It is deliberately *not* self-contained: it only builds inside a unify checkout, because
the documents and the template are both read from the repository.

## What it found

Building this site was the point; the site is the instrument. `FINDINGS.md` records what it
turned up: one bug that contradicts the documented `--generate` contract (generated pages
silently get no layout), a related gap in include resolution, an undocumented trap for
HTML-authored docs sites, one genuine defect in the documentation (fixed), and five things
that worked better than expected.

The first two were one flaw (the overlay joined the scan but not the resolution namespace)
and are fixed ([#54](https://github.com/fwdslsh/unify/issues/54),
[#55](https://github.com/fwdslsh/unify/issues/55)). This example carried the workarounds for
both, and removing them is how the fix was proved: no page names a layout any more, and the
sidebar is generated rather than hand-authored and asserted.

## Deployment

`.github/workflows/deploy-docs.yml` builds this example and publishes `dist/` to GitHub
Pages on every push to `main` under `docs/`, `src/`, or `examples/**`, or on demand via
`workflow_dispatch`. It runs the same two gates as above, `build --dry-run --strict` and
then `audit --strict`, before the real `build --clean --strict` that is actually published;
either gate failing stops the deploy, the same transactional guarantee `unify build` itself
gives a local run.

After that build, the workflow assembles five more example sites into
`dist/examples/<name>/` — `seed-library`, `seed-library-alt`, `seed-library-ondemand`,
`htmx-fragments`, and `catalog-search-blog` — each built with the CHECKOUT CLI as a wholly
separate unify project, addressed at its own `--base-url` subpath, and each gated by its
own `--dry-run --strict` before the real build. Those five directories, roughly 360 of the
published tree's ~380 files, are what the `/examples/` gallery's "View live" links resolve
to at runtime; this site's own build never emits them (see the comment at the bottom of
`site/examples/index.html`, and Part 2 of `_notes/batches/b10-contract.md`, for why).

**Two things the workflow could not do for itself, both now done**: GitHub Pages' source is
set to **Settings > Pages > Build and deployment > Source > "GitHub Actions"**, and the
custom domain (`unify.fwdslsh.dev`, DNS-verified) is configured on the same settings page,
which is also what provisions the certificate. No `CNAME` file lives in the build output for
this: GitHub Actions deployments ignore one if present, and the domain lives entirely in the
repository setting. Before the domain existed, the site was reachable at the default
project-pages address, `fwdslsh.github.io/unify/`; that address still resolves and now
redirects to the custom domain.

If either setting is ever missing (a fresh fork, say) the `deploy` job fails with GitHub's
own "Pages site not found," while the `build` job (both gates plus the real build) succeeds
regardless, so a red `deploy` step next to a green `build` step means exactly this.

**The examples gallery under `unify dev`.** `site/examples/index.html`'s five "View live"
links resolve against `location.href` no matter what, so `unify dev` on this site still
builds and serves `/examples/` correctly. Only the deploy workflow's separate assembly
steps (`.github/workflows/deploy-docs.yml`) ever produce the five `/examples/<name>/`
trees those links point at, so following one locally 404s — the same dead end a visitor
with JavaScript off sees from the page's `<noscript>` fallback, just reached by a
different path.
