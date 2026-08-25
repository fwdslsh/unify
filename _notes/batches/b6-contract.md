# Batch B6 — non-normative docs + the catalog/search guide + E2E blog fixture

Read first: `_notes/unify-0.9-brief.md` §23, §25, §29.7, §30 (docs changes);
`_notes/release-0.9.0-implementation-plan.md`; the landed conformance-spec
§20/§30/§33 (write the human docs FROM the landed normative text, never from
memory of the brief); `docs/product-spec.md`, `docs/getting-started.md`,
`docs/authoring-rules.md`, `docs/cli-reference.md`, `docs/integrations.md`,
`docs/guides/eleventy-htmx.md`. Check `tests/unit/docs-sync.test.js` — the
authoring-rules page has an enforced line budget.

## Part 1 — product-spec.md

- §6.2 (page manifest): rewrite around the final-document model — snapshot +
  private analysis + one-selector-interpretation rule; keep the "one shared
  interpretation" law and the implementation-boundary framing.
- §6.5.2 (search manifest) → the two public artifacts: compact catalog for
  browse/filter/TOC/metadata UI; optional full-text corpus joined by `path`;
  `assets/unify/` location; author-wins posture.
- §6.3.9 / §2 (frontmatter keys): `tags`/`categories` lose their finding —
  they are ordinary metadata, inert by design, meaningful only to a consumer
  that interprets them (catalog consumers included); `draft`/`permalink`/
  `slug` problems unchanged.
- §6.3.6: no stored schema type — declared types read from the document;
  the `schema:` authoring convenience and bounded generation stay.
- §6.4.2: the generator context (three arguments now).
- §6.5.3: audit JSON's document-shaped pages.
- The CLI synopsis blocks: `--search-index` → `--catalog`/`--search-corpus`.
- Non-goals: add the brief's §3 items that are new (no recursive DOM
  serialization, no body markup in the catalog, no post-build mutation).

## Part 2 — remaining docs

- **getting-started.md**: replace the search-index passage with a short
  catalog/corpus passage; fix the tags/categories sentence (nothing is
  reported now); keep tone and length discipline.
- **authoring-rules.md**: the one tags/categories sentence loses "`unify
  audit` says so"; nothing else changes (no catalog authoring syntax exists);
  the docs-sync line budget must still pass.
- **integrations.md**: generator-context third argument (if B5 did not
  already cover it fully — check first, do not duplicate).
- **New `docs/guides/catalog-and-search.md`**: the brief's §30.5 guide —
  a static blog list from `catalog.json` (metaValues over head.meta,
  sort-by-date, tag facets), the module-URL-relative fetch pattern that
  survives `--base-url` subpath hosting, full-text search joining
  `search-corpus.json` hits back to catalog pages by `path`, a short
  MiniSearch/FlexSearch sketch (no dependency added to unify), and where
  HTMX fits alongside. Every literal the guide shows must actually work
  against the fixture from Part 3 — test the snippets by hand before writing
  them into the doc, following the repo's "every literal tested" posture.

## Part 3 — E2E blog fixture (brief §29.7)

A conformance-tier test (spawning the CLI) with a small blog fixture:
Markdown posts with arbitrary `tags`, a custom `series` field, dates,
descriptions, headings; built with `--catalog --search-corpus --base-url`.
Assert, by executing a small node/bun script against the emitted JSON (the
"browser-side" listing logic — plain data manipulation, no DOM needed):

- select posts by a `kind`/type facet; sort newest-first by declared date;
- filter by tag and by series;
- full-text search: find a body phrase via the corpus, join the hit back to
  its catalog entry by `path`, and read title/description/tags from it;
- no collections feature exists in unify to make any of this pass (the JSON
  files alone suffice).

Register coverage with `covers()` against the SRCH- rows this exercises (or
a dedicated row if Part 1's spec edits warrant one — prefer reusing existing
rows; add none without a matching spec sentence).

## Definition of done

Full gate green (docs-sync test included). `grep -ri "search-index" docs/ src/ tests/`
→ nothing left except deliberate history (migration-plan.md and
ratification records are history — leave them). Product-spec and
conformance-spec must not contradict each other anywhere the diff touched.

## Out of scope

CHANGELOG, version bump, README (B7 decides what README needs).

---

## Addenda after B3–B5 (binding)

- Earlier batches already made *minimal* product-spec edits where the
  docs-sync test forced them (§6.5.2 flag naming in B4, §6.4.2's argv count
  in B5). This batch completes those sections properly rather than assuming
  they are untouched — read them as they are now.
- product-spec §6.3.9 still requires the audit finding for `tags`/`categories`
  that conformance-spec §28.2 deleted (the B3 spec reviewer flagged the
  contradiction; the conformance side already states the 0.9 posture). This
  batch owns fixing §6.3.9 — and re-check §4 and any other passage the B3
  reviewer's grep would hit (`taxonomy`, `tags`, `categories` across
  product-spec).
- `docs/guides/eleventy-htmx.md` and `docs/integrations.md` were updated in
  B5 (three-argument generator contract, context consumption) — do not
  regress them; B6 only touches them if a tags/categories or search-index
  passage remains.
- The catalog-and-search guide's snippets must be validated against the real
  CLI (the repo's every-literal-tested posture; B5's review enforced this on
  the eleventy guide — expect the same scrutiny).
