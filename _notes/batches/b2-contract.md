# Batch B2 — `src/core/document-selectors.js`: the shared interpretation layer

Read first: `_notes/unify-0.9-brief.md` §14 (shared semantic selectors),
`_notes/release-0.9.0-implementation-plan.md` (decisions 5–8),
`_notes/batches/b1-contract.md` and the landed `src/core/document.js`, plus the
current interpretation code being relocated: `src/core/manifest.js`
(`isoDate`, robots parsing, `declaredType`, `intOrNull`, image precedence,
`Field` first-wins/conflict semantics) and `src/core/sitemap.js`
(`classifyCanonical`, `isSelfCanonical`, `canonicalSchemeMismatch`).

## Objective

Create `src/core/document-selectors.js`: the one place built-in features will
interpret the HTML-shaped snapshot. This batch is **additive with zero
observable behavior change**: doc-level selectors are new (unit-tested but not
yet consumed by the pipeline), while the value-level interpretation cores are
*relocated* here from their current owners, which import them back — that
wiring keeps the module-graph gate green and makes the model swap in B3 a
call-site migration rather than a reimplementation.

## Deliverables

### 1. Value-level cores (pure relocations; original modules delegate)

- `isoDate(raw)` — move from `manifest.js` verbatim (W3C-DTF grammar).
  `manifest.js` re-exports it so existing importers keep working until B3.
- `parseRobotsValue(raw)` — move from `manifest.js` verbatim.
- `declaredType(data)` — the bounded JSON-LD single-object `@type` read, move
  from `manifest.js` verbatim.
- `intOrNull(raw)` — move from `manifest.js` verbatim.
- `classifyCanonicalValue(canonical, outputPath, base)` — extract the core of
  `sitemap.js`'s `classifyCanonical` (which today takes a record): same
  four-state answer (`none`/`self`/`elsewhere`/`unknown`), same
  `stripBaseUrl`/`resolveReference` steps, byte-identical decisions.
  `sitemap.js`'s `classifyCanonical(record, base)` becomes a one-line wrapper
  over it. Same treatment for the scheme-comparison core of
  `canonicalSchemeMismatch` if extracting it is clean; otherwise leave
  `canonicalSchemeMismatch` in `sitemap.js` untouched and note why.

Every relocation must preserve behavior byte-for-byte: same inputs, same
outputs, same edge decisions. Existing tests must not notice.

### 2. Doc-level selectors

All take an *envelope* — any object with `{document, analysis}` as produced by
`extractDocument` (B3's `BuildDocument` will carry these keys plus
`source`/`outputPath`). Selectors that need the output path (`membership`,
canonical classification) read `envelope.outputPath` and are documented as
requiring it. Snapshot attribute values arrive decoded but untrimmed; the
selectors own trimming/normalization, mirroring today's `nonEmpty` discipline
(trim; empty → not a declaration). Metadata name/property/rel comparisons are
per HTML's rules: compare the attribute's value trimmed and lowercased.

- `titleOf(doc)` → `doc.document.head.title`.
- `langOf(doc)` → the `<html>` `lang` attribute, trimmed, empty/absent → null.
- `metaValues(doc, name)` → the `content` of every head `meta` whose `name`
  matches (trimmed/lowercased compare), in order; an entry without `content`
  contributes `""`. No filtering — callers decide.
- `propertyValues(doc, property)` → same for `property=`.
- `linksWithRel(doc, rel)` → head `link` entries whose `rel` token list
  (whitespace-split, trimmed, lowercased) contains `rel`, in order.
- `descriptionOf(doc)` / `authorOf(doc)` → first *non-empty* (trimmed)
  `meta name="description"`/`"author"` content, else null — today's
  `Field`+`nonEmpty` first-wins semantics exactly.
- `canonicalOf(doc)` → first `rel~=canonical` link with non-empty trimmed
  `href`; the trimmed value; else null.
- `robotsPolicyOf(doc)` → union across **every** `meta name="robots"`:
  collect non-empty trimmed contents in order, comma-join,
  `parseRobotsValue` — identical output shape `{raw, directives, indexable,
  followable}` and identical results to today's `record.robots`.
- `publicationDatesOf(doc)` → `{published, modified}`, each `{raw, iso}|null`:
  `published` from `meta name="date"` and `property="article:published_time"`,
  `modified` from `name="lastmod"` and `property="article:modified_time"` —
  first non-empty declaration wins **across both spellings in head order**
  (the snapshot's `head.meta` array preserves document order, so this
  reproduces today's single-pass first-wins); `iso` via `isoDate`.
- `preferredImageOf(doc)` → `{url, width, height, fromOg}|null` — og:image
  wins over twitter:image *as spellings* (not document-order race);
  first-wins within each spelling; width/height from
  `og:image:width`/`og:image:height` via `intOrNull` only when `fromOg`.
  Identical to today's `record.image`.
- `declaredTypes(doc)` → array of every accepted declaration: non-empty
  `meta name="schema"` contents in head order, followed by `declaredType(entry.data)`
  for each `analysis.jsonLd` entry (document order) that yields one.
  **Ordering note (0.9 decision):** the old `schemaType` interleaved the two
  sources by document position; `declaredTypes` lists meta declarations before
  JSON-LD ones. No 0.9 consumer depends on a single winner (membership and
  findings use set-inclusion), and the B3 spec rewrite states this order.
- `refreshOf(doc)` → `doc.analysis.refresh` (accessor; target resolution
  remains the manifest's second pass).
- `metadataConflicts(doc)` → `[{field, kept, discarded}]` for exactly the
  fields §24.4's `metadata-conflict` renders — `canonical` (from all accepted
  canonical hrefs), `title` (from `analysis.titleTexts`), `description` (from
  all non-empty description contents), `lang` (structurally impossible — one
  element, one attribute — include the field only if a conflict can exist;
  document why it cannot) — with today's `Field.conflict` semantics: kept =
  first accepted, discarded = later *differing* values in order, identical
  repeats are no conflict; results ordered by field name.
- `isPublicDestination(doc, base)` → today's `isCompletablePage` predicate on
  the new model: `robotsPolicyOf(doc).indexable`, `doc.outputPath !==
  "404.html"`, and `classifyCanonicalValue(canonicalOf(doc), doc.outputPath,
  base)` ∈ {`none`, `self`}.

### 3. `tests/unit/core/document-selectors.test.js`

Unit tier, `bun:test`, envelopes built with `extractDocument` (plus
`outputPath` where needed). Pin each selector independently (brief §29.3):

- repeated robots declarations union (`noindex` + `nofollow` split across two
  metas; `none`; unknown directives preserved; no meta → indexable default);
- multiple canonicals: first-wins and `metadataConflicts` entries; identical
  repeats are not conflicts; title/description conflicts; conflict ordering;
- date parsing: the W3C-DTF grammar cases (day-only, `T`+TZD required, bad
  calendar day, bad clock, offset bounds, verbatim non-normalization),
  first-wins across `date` vs `article:published_time` in both orders;
- OG/Twitter image precedence: og wins regardless of order, dimensions only
  from og, non-integer dimensions → null;
- declaredTypes: meta + JSON-LD, `@graph`/array/non-string declare nothing,
  meta-before-jsonld ordering;
- membership: noindex excluded, `404.html` excluded, cross-canonical
  excluded, self- and no-canonical included; `classifyCanonicalValue`'s four
  states incl. absolute-with-no-base → `unknown`, off-origin with base →
  `elsewhere`, root-relative resolution;
- titleOf/langOf/descriptionOf/authorOf trimming and empty→null;
- metaValues/propertyValues/linksWithRel case-insensitivity and ordering.

Where a relocated core already has unit coverage through `manifest.js` tests,
keep those tests passing untouched; new tests target the selector surface.

### 4. Gates

Full validation (same commands as B1's contract §3) must pass; no observable
CLI behavior change; no docs/spec/rules.tsv edits.

## Out of scope

Consumer migration (sitemap/feed/audit/etc. keep reading PageRecords), the
manifest model, CLI flags, any documentation.
