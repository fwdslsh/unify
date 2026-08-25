# Batch B3 — the model swap: `BuildDocument` replaces `PageRecord`

Read first: `_notes/unify-0.9-brief.md` (§6, §7, §13–§17, §21–§22, §30.2 of
the brief), `_notes/release-0.9.0-implementation-plan.md` (all decisions),
`src/core/document.js`, `src/core/document-selectors.js`, and — before touching
anything — `docs/conformance-spec.md` §20–§29, §31 and
`tests/conformance/rules.tsv` (the traceability inventory: every rule ID the
spec's sections carry must stay consistent with the tests that declare it).

## Objective

Replace the denormalized `PageRecord` with the thin `BuildDocument` envelope,
migrate every built-in consumer to the shared selectors, remove
`taxonomyKeys`/`taxonomy-inert`/serialized `schemaType`/the stored `conflicts`
array, break `audit --format json`'s page shape to the new document model, and
rewrite the conformance spec + rules.tsv + tests so the whole gate suite is
green. This batch is the 0.9.0 break: no compatibility aliases survive.

This work is split into three sequential parts. Each part commits separately.

---

## Part 1 — core model + consumer code

### `src/core/manifest.js`

Rewrite around:

```js
BuildDocument = {
  source: { path, generated, layout },   // provenance, verbatim from today's
                                         // sourcePath/generated/layout fields
  outputPath,
  document,   // DocumentSnapshot from extractDocument(html, {path, url})
              //   path/url computed exactly as today (urlForOutputPath, base)
  analysis,   // extractDocument's analysis + second pass adds:
              //   linksOut, linksIn, fragmentLinks (ported verbatim from
              //   today's second pass, consuming analysis.rawHrefs), and
              //   refresh resolved to {raw, seconds, url, target}
}
BuildManifest = { documents, byOutputPath, byPublicPath }
```

- `buildManifest({pages, base})` keeps its signature; returns the new shape.
  `documents` ordered by output path (unchanged rule); `byPublicPath` keys on
  `document.path`. Delete `records`/`byOutputPath`-of-records, the `PageRecord`
  typedef, the `Field` class, and every per-field extraction now owned by
  `document.js`/selectors. `analysis.rawHrefs` is consumed by the second pass
  and must not survive on the final envelope (delete it after resolution, as
  `_hrefs` is deleted today).
- `isoDate` re-export: remove it; importers now import from
  `document-selectors.js` directly.

### Consumers — migrate per the brief's §21 table, deleting shims as you go

- **sitemap.js**: membership via `isPublicDestination`; `<loc>` from
  `document.url`; `<lastmod>` from `publicationDatesOf(doc).modified.iso`
  (same condition as today); canonical-driven URL choice via `canonicalOf` +
  `classifyCanonicalValue`. `isCompletablePage` is replaced by
  `isPublicDestination` (delete the old name; update every importer).
- **canonical.js**: `isPublicDestination` + `document.url`; the
  `declaresCanonical` document scan stays (it reads emitted markup by design).
- **feed.js**: membership via
  `declaredTypes(doc).some(t => t === "Article" || t === "BlogPosting")`
  (the widening: *any* declared type qualifies, not just the first — a
  deliberate 0.9 change Part 2 writes into §29), `robotsPolicyOf(...).indexable`,
  self-canonical via the shared classification, dates via
  `publicationDatesOf`, entry fields via `titleOf`/`descriptionOf`/`authorOf`/
  `canonicalOf`/`document.url`. A17 logic unchanged in substance.
  `--feed-full` keeps reading emitted page markup (unchanged by design).
- **structured-data.js**: `checkSchemaDeclarations` (P23) is unchanged — it
  already scans emitted markup. Generation activation: declared type must be
  one of the three accepted values — read via the *meta* declarations
  (`metaValues(doc, "schema")` semantics) plus JSON-LD emptiness
  (`analysis.jsonLd.length === 0`) exactly as today; generated JSON-LD fields
  come from selectors (`titleOf`, `descriptionOf`, `canonicalOf`/`document.url`,
  `preferredImageOf`, `authorOf`, `publicationDatesOf`, `langOf`). Behavior
  must be byte-identical for every input the current tests cover. Do NOT
  reintroduce a stored type field.
- **audit.js**: every finding becomes a predicate over
  snapshot/selectors/analysis:
  - `title-*`/`description-*`/`lang-missing` via selectors.
  - `h1-missing`/`h1-multiple`/`title-h1-mismatch` read level-1 entries of
    `document.body.headings` — **inheriting the new heading scope**
    (first `<main>`, else `<body>`, else document). Part 2 states this
    behavior change in the spec; Part 3 adjusts/extends tests to pin it.
  - `id-duplicate`/`fragment-missing` via `analysis.ids`/`analysis.fragmentLinks`.
  - `metadata-conflict` via `metadataConflicts(doc)` (same four fields).
  - `metadata-in-body` via `analysis.strayMetadata` (unchanged).
  - `taxonomy-inert` — **deleted entirely**.
  - `schema-incomplete` via `declaredTypes(doc)` inclusion + `titleOf` +
    `publicationDatesOf`.
  - jsonld findings via `analysis.jsonLd` + the existing
    `subjectObject`/`stringProperty` helpers; `redirect-loop` via
    `refreshOf`; image finding via `preferredImageOf`; canonical/sitemap
    findings via the shared classification; `text-duplicate` via
    `analysis.visibleText`; `page-orphan` via `analysis.linksIn`.
  - Finding objects keep `{id, severity, file: source.path, generated,
    outputPath, url, distinguisher, evidence, fix}` — file/url from the
    envelope (`source.path`, `document.url`).
- **external.js**: iterate `documents`; owner map values are BuildDocuments.
- **dev-report.js**: per-page section renders the same facts through
  selectors/envelope fields; no second extractor.
- **report.js** (`audit --format json` / SARIF): new page shape, serialized
  with explicit key order:
  ```json
  { "source": "posts/foo.md", "generated": false,
    "outputPath": "posts/foo/index.html",
    "document": { "path": "...", "url": "...", "html": {...},
                   "head": {...}, "body": {...} } }
  ```
  — the snapshot serialized whole, the private `analysis` never serialized,
  `schemaVersion` stays `1` (0.9 is a declared clean break with the 0.8
  machine schema; the spec says so). `layout` provenance is **not** in the
  page object (audit fix lines still use it internally). Findings/fingerprint/
  SARIF unchanged.
- **build.js**: preliminary manifest passes (canonical completion,
  structured-data) and the final manifest all use the new model; the dry-run
  report's provenance printing (`← page + layout`, `← generated`) reads
  `source.*`. `search-index.js` keeps working during this batch — port its
  reads (`document.path`/`url`, `titleOf`, `descriptionOf`,
  `document.body.headings`, `analysis.visibleText`) minimally; it is deleted
  in the next batch.

Nothing else changes behavior: exit codes, diagnostics, publish, watch/dev.

## Part 2 — conformance spec + rules.tsv

Work with the traceability gate's mechanics in mind
(`tests/conformance/check-traceability.mjs`): every `## N` section (except §1)
needs ≥1 inventory row citing `§N`; every rule ID declared by a test must
exist in rules.tsv; every non-structural row needs a runtime-recording test;
problem/advisory *counts* are parsed out of §14.2/§14.3 and compared — the
closed lists are not touched by this batch (P24 stays; A17 stays; no new
diagnostics).

- **§20** — rewrite as "The final document model": membership (§20.1
  unchanged), extraction source (§20.2 unchanged in substance), the
  `DocumentSnapshot` shape and attribute/text normalization rules, the
  `DocumentAnalysis` private half, the `BuildDocument` envelope with the
  provenance argument (keep the existing §20.3 provenance prose — it is
  load-bearing), public URLs (§20.5 unchanged), robots reading (§20.6 → the
  `robotsPolicyOf` selector), visible text (§20.7 unchanged), structured-data
  reading (§20.8 → `analysis.jsonLd` + `declaredTypes`, stating the
  meta-before-jsonld order and that no consumer reads a single winner), link
  graph (§20.9 unchanged), dates (§20.10 → `publicationDatesOf`), refresh
  (§20.11 unchanged), and the selector layer itself: one interpretation
  module, first-wins rules, the conflict-computation rule (conflicts are
  computed by the selector for exactly the four renderable fields, no stored
  array), and the **heading-scope change** (main-first) stated as a 0.9
  decision with its rationale. Keep the text-content rules (inline set,
  entity resolution, U+00A0) verbatim — they are unchanged law.
- **§21–§23**: update field references to selector/envelope language;
  membership prose points at the shared `isPublicDestination` predicate
  (§21.2 keeps owning its definition).
- **§24**: catalogue updates — h1-scope consequence stated; `metadata-conflict`
  text updated to the computed-conflicts rule; `schema-incomplete` via
  declared types; delete every reference to `taxonomyKeys`/`conflicts`-as-field.
- **§26**: reading via selectors; no stored `schemaType`; SD-08/SD-09 rows
  updated accordingly.
- **§28.2**: replace the `taxonomy-inert` subsection: `tags`/`categories` are
  ordinary metadata, inert **by design**, reported by nothing; the closed-set
  reservation reasoning moves into a short statement of why no finding exists
  (product-spec §6.3.9's non-reservation posture now cuts the other way). Give
  the subsection one inventory row (e.g. `CPR-02`) pinning the absence: the
  metas emit normally and `audit` reports nothing for them.
- **§29**: membership via `declaredTypes` — state the any-declared-type
  widening and why (a page carrying `Organization` + `Article` JSON-LD is an
  article).
- **§31.1**: the new audit JSON page shape, with the analysis-is-private rule
  and the clean-break statement about 0.8.
- **rules.tsv**: rewrite MAN-01..14 for the new model (keep the MAN- prefix
  and §20 spec refs; delete MAN-13 (taxonomyKeys) — renumber nothing else;
  a deleted ID must no longer be declared by any test). Delete AUD-15. Update
  RPT-01 (page shape), SD-08/SD-09 wording, FEED rows for declaredTypes,
  MD-14's tags/categories phrasing, SIT/CAN rows only where their text names
  record fields. Every row edit stays consistent with what the tests actually
  cover after Part 3.

## Part 3 — test migration

- Update every test that reads removed fields or old shapes:
  `tests/unit/core/manifest.test.js` (new model),
  `tests/conformance/manifest-observable.test.js`,
  `tests/conformance/audit*.test.js` (taxonomy-inert gone — replace with an
  absence assertion; h1-scope cases; metadata-conflict unchanged behavior),
  `tests/conformance/counter-prior.test.js` (28.2's new pinning: tags/
  categories emit metas, audit says nothing, cover CPR-02),
  `tests/conformance/report.test.js` + `audit-report.test.js` (new JSON page
  shape; fingerprints unchanged), feed tests (declaredTypes widening: a page
  whose JSON-LD declares `WebPage` first and `Article` second is now a feed
  candidate — add the case), structured-data, dev-report, sitemap tests.
- Add the HTML/Markdown snapshot-equality conformance case (brief §29.2):
  equivalent frontmatter and hand-written HTML pages produce identical
  `document` objects in `audit --format json` (title, repeated tags metas,
  og: flattening, lang/body class).
- Heading-scope pinning: a page whose layout puts an `<h1>` in a `<header>`
  outside `<main>` — snapshot headings exclude it; `h1-missing` fires when
  `<main>` has none (state in the test comment that this is the 0.9 scope).
- `covers()` declarations updated for every rewritten/deleted rule ID; the
  ledger-based runtime gate and the static gate must both pass with the empty
  baseline.

## Definition of done

Full gate green (same commands as B1 §3). `grep -r "PageRecord\|taxonomyKeys\|taxonomy-inert\|schemaType" src/ tests/ docs/conformance-spec.md`
finds only deliberate remnants (e.g. spec prose *about the removal*, the
`schema:` authoring key which stays). No compatibility aliases.

## Out of scope

`--search-index` removal / catalog / corpus (next batch — search-index.js
keeps working on the new model here), generator context, product-spec.md and
the non-normative docs (B6), CHANGELOG/version.

---

## Addenda from the B2 review (binding on this batch)

The B2 verifier's differential harness left three notes; each gets a decision
here:

1. **`metaRole` must reproduce the full exclusive chain.** Today it covers
   only the eight image/date roles, so a contrived dual-axis meta
   (`<meta name="description" property="og:image">`) still drifts from the
   old chain. Extend `metaRole` to the complete 0.9 chain — the `name`
   branches (`description`, `author`, `robots`, `schema`, `date`, `lastmod`,
   `twitter:image`) checked before the `property` branches
   (`article:published_time`, `article:modified_time`, `og:image`,
   `og:image:width`, `og:image:height`) — one meta plays one role; the §20
   rewrite states the rule. (`tags`/`categories` branches do not exist in
   0.9.)
2. **`langOf` reads `analysis.langTexts[0]`** (first non-empty `lang` across
   every `<html>` element, document-wide) rather than the snapshot's
   first-`<html>` attributes — this keeps `record.lang`'s exact behavior on
   degenerate multi-`<html>` documents (which textual includes can produce).
   Document the choice on `langOf`; `metadataConflicts` already reads
   `langTexts`.
3. **Entity-decoded `name=`/`rel=` matching** (selectors match a decoded
   `name="descri&#112;tion"`, the old raw reads did not) is accepted as the
   HTML-correct reading — the §20 rewrite states that attribute values in the
   snapshot are character-reference decoded and comparisons happen on the
   decoded value.

Also from B2: relocating code moves `tests/conformance/mutations.tsv`
anchors — after the swap, re-point any rows whose anchor text moved, and
consider adding rows pinning the selector logic that the pipeline now
consumes (first-wins, robots union, og precedence) per that file's own
conventions.
