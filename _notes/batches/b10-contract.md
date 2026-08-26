# Batch B10 — live examples gallery on the unify site

Read first: `.github/workflows/deploy-docs.yml` end to end,
`examples/unify-docs/` (site shape, `_scripts/gen.mjs`, masthead/docnav,
CSS voice), `examples/README.md` (the card descriptions' source of truth),
each example's README build command, and `docs/ratification.md` rounds 19–20
(the client-side URL seam this design leans on).

## Objective

Visitors to https://unify.fwdslsh.dev/ can browse `/examples/`: a card per
example (name, one-paragraph description, "Source on GitHub", and for the
dependency-free examples a "View live" that opens the rendered example in a
new tab). The live copies are built by the deploy workflow and assembled
into the published artifact under `/examples/<name>/`.

## The design constraint, stated so nobody fights it accidentally

The live example trees are supplied by DEPLOYMENT ASSEMBLY, not by the docs
site's own unify build — so a plain `href="/examples/<name>/"` on a site
page is P13 by §12's own correct rule (this build emits no such file), and
post-build editing of unify-emitted pages is forbidden by the product's
whole philosophy. Therefore:

- The gallery page IS a normal authored site page (checked, composed,
  audited like every other).
- "Source on GitHub" links are ordinary `<a href="https://github.com/fwdslsh/unify/tree/main/examples/<name>">`
  — off-origin, §12 skips them by design.
- "View live" uses the client-side URL seam rounds 19–20 ratified: the
  address is written in JS (e.g. anchors carrying `data-example="<name>"`,
  a small inline script setting `href`/`target="_blank" rel="noopener"` on
  DOMContentLoaded), so §12 never sees an internal href it cannot verify.
  `<noscript>` shows a sentence pointing at the GitHub source instead.
- A comment IN THE PAGE SOURCE and one in the workflow must state this
  reasoning — the next maintainer will otherwise "fix" the JS links into
  hrefs and break the deploy at the reference check.

Reviewers: challenge this mechanism. If you find a strictly better one that
keeps §12 honest (no placeholder files overwritten by assembly, no post-build
page edits, no off-origin redirect hacks through fwdslsh.github.io), propose
it with evidence; otherwise verify this one is implemented exactly.

## Part 1 — the gallery page

- `examples/unify-docs/src/examples/index.html`: cards for all eight
  examples. Descriptions distilled from `examples/README.md` (do not invent
  capabilities). Live-view for the five dependency-free examples
  (`seed-library`, `seed-library-alt`, `seed-library-ondemand`,
  `htmx-fragments`, `catalog-search-blog`). `eleventy-htmx` and
  `forge-svelte` cards say plainly they need an npm toolchain and link to
  GitHub only (a follow-up after 0.9.0 publishes can add them).
  `unify-docs`'s own card notes "you are looking at it" + GitHub link.
- Masthead/docnav gains an Examples link (whichever nav the site's shape
  says is right — study it, don't guess).
- Styling in the site's existing CSS file and voice; no new framework, no
  external assets. Keep the page light — cards, not screenshots.
- The site build + `audit --strict` with the deploy flags stay exit 0.

## Part 2 — deploy assembly

In `.github/workflows/deploy-docs.yml`'s build job, after the site's
verify/audit/build steps:

- For each of the five live examples, in a loop or clearly-named steps:
  `--dry-run --strict` verify, then real build, with the CHECKOUT CLI
  (`bun src/cli.js`), the example's own README-canonical flags, and
  `--base-url "$SITE_BASE_URL"examples/<name>/`, output into
  `examples/unify-docs/dist/examples/<name>`.
- Order: after the site's own `--clean` build so nothing deletes them;
  before the Pages artifact upload.
- Extend the workflow's `on.push.paths` with `examples/**` (an example edit
  must redeploy the gallery).
- Workflow comments: the assembly seam (what owns which paths) and the
  JS-link reasoning pointer.

## Part 3 — validation

- Assemble the full tree locally exactly as the workflow will (site +
  five example builds), serve it, and Playwright it: the gallery renders
  eight cards; a live link carries the right computed href and
  `target="_blank" rel="noopener"`; navigating to
  `/examples/catalog-search-blog/` renders and its search UI works at the
  NESTED path (this re-proves the subpath-safe fetch pattern where it now
  actually matters); `/examples/seed-library/` renders with working CSS.
- `<noscript>` fallback present in the served gallery HTML.
- Full repo gate green (fresh-ledger bun test, both traceability modes,
  module graph, suite hygiene) — expected untouched, verify anyway.
- `unify dev` on the docs site locally still works (the gallery page's JS
  degrades to the noscript state where /examples/<name>/ is absent — the
  README section for unify-docs gains two sentences saying so).

## Out of scope

No src/** changes, no conformance-spec changes, no new dependencies, no
screenshots/thumbnails pipeline, no second Pages site or DNS work.
