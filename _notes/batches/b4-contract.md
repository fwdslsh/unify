# Batch B4 — `catalog.json` + `search-corpus.json`; `--search-index` removed

Read first: `_notes/unify-0.9-brief.md` §4, §5, §8–§11, §26–§28 (naming,
CLI, catalog schema/extraction/membership, corpus schema, collisions,
versioning, determinism) and §29.4/§29.5 (tests);
`_notes/release-0.9.0-implementation-plan.md` decisions 10–12; the landed
`src/core/document.js` / `document-selectors.js` / new `manifest.js`; and the
modules being replaced/mirrored: `src/core/search-index.js`,
`src/core/sitemap.js` (generated-artifact pattern), `src/cli/options.js`,
`src/cli/commands/build.js` (projection wiring), plus conformance-spec §30 and
its SRCH- rows in `tests/conformance/rules.tsv`.

## Objective

Ship the two public 0.9 artifacts as manifest projections —
`assets/unify/catalog.json` under `--catalog` and
`assets/unify/search-corpus.json` under `--search-corpus` — and remove
`--search-index`/`search-index.json` completely. Spec §30 is rewritten for the
new artifacts; the CLI reference is updated; the traceability inventory and
tests move in the same batch.

## Part 1 — code

### `src/core/catalog.js` (new)

- `CATALOG_PATH = "assets/unify/catalog.json"`.
- Membership: `isPublicDestination(doc, base)` — shared, never reimplemented.
- Projection per page (explicit key order, exactly):
  `{path, url, html, head, body}` — `document.path`, `document.url`, and the
  snapshot's `html`/`head`/`body` serialized whole (title, meta, link, base,
  attributes, headings — no analysis, no body text, no source/output paths).
- Document: `{schemaVersion: 1, baseUrl, pages}` — `baseUrl` is the build's
  base URL exactly as given, `null` without the flag; `pages` in manifest
  order; two-space-indented JSON + trailing newline; byte-identical across
  builds of one tree.
- Authored-file suppression: `emittedFromSource.has(CATALOG_PATH)` → return
  empty Map, silent — the sitemap/feed/search-index pattern verbatim. Only the
  exact path is special; `assets/unify/` is NOT reserved.

### `src/core/search-corpus.js` (new)

- `SEARCH_CORPUS_PATH = "assets/unify/search-corpus.json"`.
- Same membership predicate. Entry: `{path, text}` — `document.path` and
  `analysis.visibleText` folded by the existing Unicode space-separator rule
  (move `foldSpaceSeparators` + `SPACE_SEPARATORS` here from
  `search-index.js`). Nothing else: no url, no title, no headings, no
  metadata. `{schemaVersion: 1, pages}`; same serialization/determinism rules.

### `src/core/search-index.js` — delete

Delete the module and every reference. `--search-index` is gone from
`src/cli/options.js` (`OPTIONS` and `CONFIG_KEYS`) — passing it is the
ordinary unknown-flag usage error (exit 2), and a `search-index` key in
`unify.yaml` is the ordinary unknown-key usage error. No alias, no
deprecation message.

### CLI wiring

- `options.js`: add `"catalog": {kind: "flag"}` and `"search-corpus":
  {kind: "flag"}` to `OPTIONS` and `CONFIG_KEYS`; `cli.js` `resolveSettings`:
  `catalog: settings.catalog === true`, `searchCorpus:
  settings["search-corpus"] === true`; remove `searchIndex`.
  `--search-corpus` does NOT imply `--catalog`.
- `build.js`: replace the search-index projection block with the two new ones
  (same position: after the final manifest, before reference checks; results
  join `tempFiles`); dry-run rows with `from: "generated (--catalog)"` /
  `"generated (--search-corpus)"`; the §12 `wouldGenerate` fix-line map:
  replace the search-index line with
  `assets/unify/catalog.json is generated, not authored: this build generates it only under --catalog`
  and the corpus equivalent. Both artifacts participate in reference checks,
  transactional publish, and watch full rebuilds automatically (no
  special-casing — verify, don't add).
- `--help` text in `cli.js` (and anywhere usage strings live): replace
  `--search-index` with the two new flags.

## Part 2 — spec + rules.tsv + cli-reference

- **§30** rewritten: "The catalog and the search corpus" — activation (two
  independent flags; neither implies the other), exact output paths and why
  `assets/unify/` (machine-consumed runtime assets, root kept clean, only
  exact paths reserved), the catalog schema (snapshot projection, bounded
  head data, headings, no body text, no JSON-LD script bodies), the corpus
  schema (`{path, text}`, path is the join key to the catalog), shared
  membership (§21.2's predicate via `isPublicDestination`), text folding
  (§20.3's obligation discharged here — same Unicode space-separator rule,
  nothing else folded), authored-file suppression + P22 + dry-run +
  transactional publish, determinism, and independent `schemaVersion: 1`
  contracts (within version 1: additive optional fields only).
- **rules.tsv**: replace SRCH-01..03 with rows for the new section (keep the
  SRCH- prefix; write one row per normative cluster — activation/shape for
  each artifact, projection/membership, folding). Delete nothing else.
- **docs/cli-reference.md**: remove the `--search-index` flag and the
  "Search manifest" section; add `--catalog` and `--search-corpus` to the
  options block and new `## Catalog` / `## Search corpus` sections in the
  house style (runnable transcripts, JSON examples, authored-file-override
  notes, exact output locations). Leave every other doc for B6.

## Part 3 — tests

- Delete `tests/unit/core/search-index.test.js` and
  `tests/conformance/search-index.test.js`.
- New `tests/unit/core/{catalog,search-corpus}.test.js` (unit tier) and
  `tests/conformance/catalog.test.js` + corpus coverage (behavior tier,
  spawning the CLI), covering brief §29.4/§29.5:
  - exact output paths; nothing emitted without each flag; independent flags;
  - authored file at the exact path suppresses generation (and `--dry-run`
    shows the authored file as an ordinary copy, no generated row);
  - no body text in the catalog (assert a distinctive body phrase absent from
    catalog bytes, present in corpus); long article grows corpus, not catalog
    (beyond head/headings);
  - arbitrary repeated metadata preserved (tags twice, custom series, og:
    property entries) with order and all attributes;
  - membership: 404/noindex/cross-canonical pages excluded from both, same
    set in both files;
  - base-url path prefix reflected in `path`/`url`; `baseUrl: null` without;
  - Unicode space folding in corpus text; U+00A0 preserved in... (folded in
    corpus — assert folded);
  - deterministic bytes (build twice, compare);
  - unify.yaml keys work; `--search-index` now exits 2 with the unknown-flag
    error; `search-index` config key rejected;
  - HTML/Markdown equality (brief §29.2) through catalog bytes: equivalent
    pages produce identical catalog entries.
- `covers()` declarations for the new SRCH- rows; full gate green (empty
  baseline).

## Out of scope

Generator context, product-spec/getting-started/authoring-rules (B6, which
also writes the catalog-and-search guide), version/CHANGELOG.

---

## Addenda after B3 (binding)

- `search-index.js` already reads the new model (B3's minimal port) and §30
  already speaks the post-swap vocabulary; this batch still replaces both
  wholesale as specified above.
- Catalog page entries serialize in key order `{path, url, html, head, body}`
  — the snapshot exactly as `audit --format json` now serializes `document`,
  so the two artifacts cannot drift; state that in §30.
- Snapshot headings are `{level, id, text}` and main-scoped (0.9 law since
  B3); the catalog inherits both without restating them — cite §20.
- The B3 review added decoded-value matching as spec law (§20.3); catalog
  membership and projection must go through the selectors/snapshot only —
  no raw markup scans in the new modules.
