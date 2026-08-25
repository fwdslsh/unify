# Release 0.9.0 — implementation plan

Working plan for the 0.9.0 breaking redesign described in the brief "Unify 0.9.0:
Final Document Manifest, Catalog, Search Corpus, and Generator Context". All work
lands on `release/0.9.0` in reviewed batches; each batch is implemented on a batch
branch, tested, reviewed, fixed, and only then merged. The tree must be green
(`bun test`, including the traceability gate) at every merge to `release/0.9.0`.

## What changes, in one paragraph

`PageRecord` — the denormalized per-page schema in `src/core/manifest.js` — is
replaced by a thin `BuildDocument` envelope: `{source: {path, generated, layout},
outputPath, document: DocumentSnapshot, analysis: DocumentAnalysis}`. The snapshot
is a bounded HTML-shaped projection of the final emitted document (root attributes,
head title/meta/link/base arrays, body attributes, main-scoped headings); the
analysis is private build data (visible text, ids, links, fragment links, JSON-LD,
stray metadata, refresh). One selector module,
`src/core/document-selectors.js`, owns every semantic interpretation
(canonical, robots, dates, image, declared types, membership), and every built-in
consumer — sitemap, canonical completion, feed, structured data, audit, dev
report — reads through it. Two new public artifacts replace `search-index.json`:
`assets/unify/catalog.json` (`--catalog`) and `assets/unify/search-corpus.json`
(`--search-corpus`). `taxonomyKeys`, the `taxonomy-inert` finding, and serialized
`schemaType` are removed. The `--generate` seam gains a versioned
`generator-context.json` passed as `process.argv[4]`.

## Design decisions resolved up front

These are the points where the brief needed a call; batches implement them as
stated here unless a review turns up a contradiction, which comes back to the
orchestrator rather than being decided ad hoc.

1. **Snapshot shape.** `DocumentSnapshot = {path, url, html: {attributes},
   head: {title, meta, link, base}, body: {attributes, headings}}`.
   `head.meta/link/base` are arrays of plain attribute objects (all attributes,
   character-reference decoded, no trimming/coercion), in head order. `head.title`
   is the first accepted `<title>` text (visible-text normalized). Headings are
   `{level, id, text}` — note `id` before `text`, matching the brief's catalog
   examples.
2. **Head scoping keeps §20.3's rule.** Metadata elements are read from `<head>`;
   a document with no `<head>` is read whole. Elements outside the head feed
   `analysis.strayMetadata` (the `metadata-in-body` closed set, unchanged).
3. **Heading scope changes** from document-wide to: first `<main>`, else
   `<body>`, else document root (brief §9.6). The audit findings `h1-missing`,
   `h1-multiple`, and `title-h1-mismatch` become predicates over the snapshot's
   headings and therefore inherit the new scope. The conformance spec states
   this as a deliberate 0.9 behavior change (a chrome `<h1>` outside `<main>`
   no longer counts as the page's h1).
4. **`analysis` fields**: `visibleText` (unchanged §20.7 semantics), `ids`,
   `linksOut`, `linksIn`, `fragmentLinks`, `jsonLd` (`{raw, data, error}`),
   `strayMetadata`, `refresh` (`{raw, seconds, url, target}`, first declaration,
   document-wide, target resolved in the manifest's second pass — the brief's
   "additional private fields are acceptable" clause; audit's `redirect-loop`
   and §25's routing map need it), and `titleTexts` (every head `<title>` text
   in order, so `metadata-conflict` on `title` stays computable). Staging:
   `extractDocument` itself returns the per-document half (`visibleText`, `ids`,
   `titleTexts`, `jsonLd`, `strayMetadata`, `rawHrefs` — every `<a href>` value
   in document order — and the unresolved `refresh` reading `{raw, seconds,
   url, hasSecondPart}`); the manifest's second pass consumes `rawHrefs` into
   `linksOut`/`linksIn`/`fragmentLinks` and resolves `refresh.target`, exactly
   as `_hrefs`/`_refresh` work today.
5. **Conflicts are computed, not stored.** The `conflicts` array is gone from
   the stored model. `metadata-conflict` renders from selectors:
   `canonical` from `head.link`, `description` from `head.meta`, `title` from
   `analysis.titleTexts`, `lang` never (one `<html>`, one attribute). The other
   §20.4 fields drop out of conflict tracking entirely because nothing rendered
   them (§24.4 renders only the four); first-wins reads live in each selector.
6. **Selectors** (`src/core/document-selectors.js`): `titleOf`, `metaValues`,
   `propertyValues`, `linksWithRel`, `descriptionOf`, `authorOf`, `canonicalOf`,
   `classifyCanonical`, `robotsPolicyOf`, `refreshOf`, `publicationDatesOf`
   (→ `{published, modified}` as `{raw, iso}|null`), `preferredImageOf`,
   `declaredTypes`, `isPublicDestination`. Each ports the exact current
   semantics (first-wins, robots union, W3C-DTF grammar, og→twitter precedence,
   og-only dimensions) from `manifest.js`.
7. **`declaredTypes` replaces `schemaType`.** It returns every accepted
   declaration in document order (`<meta name="schema">` content values plus
   each JSON-LD entry whose `data` is a single object with a string `@type`).
   Feed membership and `schema-incomplete` use
   `declaredTypes(doc).some(t => t === "Article" || t === "BlogPosting")`. The
   spec states the widening (previously only the *first* declaration decided).
8. **`isPublicDestination(doc, base)`** is §21.2's membership predicate moved
   into the selector module: has a record, `indexable`, not root `404.html`,
   self-canonical (via `classifyCanonical`). Sitemap, catalog, and search corpus
   all call it; feed adds its own type/date conditions on top.
9. **`BuildManifest = {documents, byOutputPath, byPublicPath}`** with documents
   ordered by output path (unchanged ordering). `byPublicPath` keys on
   `document.path`.
10. **Catalog** (`src/core/catalog.js`): `assets/unify/catalog.json`,
    `{schemaVersion: 1, baseUrl, pages: [...]}` exactly as the brief's §8;
    membership via `isPublicDestination`; no body text; authored file at the
    exact path suppresses generation (§21.5's rule); joins the temp tree before
    reference checks; appears in `--dry-run`; deterministic two-space JSON with
    trailing newline.
11. **Search corpus** (`src/core/search-corpus.js`):
    `assets/unify/search-corpus.json`, `{schemaVersion: 1, pages:
    [{path, text}]}`; same membership; text is `analysis.visibleText` with the
    §30.3 Unicode space-separator folding. `path` (not `url`) is the join key —
    a deliberate change from `search-index.json`'s url-first shape.
12. **CLI**: `--search-index` is removed outright (unknown-flag usage error,
    exit 2 — no alias, no deprecation shim; same for the `unify.yaml` key).
    `--catalog` and `--search-corpus` are independent booleans on `build`,
    `audit`, `dev`, `watch` (the commands that build), each with a `unify.yaml`
    key of the same name.
13. **Audit JSON** (`--format json`): new page shape `{source, generated,
    outputPath, document: {path, url, html, head, body}}` — source/output
    identity stays because audit is a build artifact; the private `analysis`
    object is not serialized. `schemaVersion` stays `1` (the brief's examples;
    0.9 is declared an incompatible break with 0.8 machine schemas, and the
    spec says so). Findings/fingerprint/SARIF are unchanged.
14. **Generator context**: `generator-context.json` written per build/rebuild
    beside the overlay dir (same temp lifecycle), passed as `argv[4]`:
    `{schemaVersion: 1, unifyVersion, command, paths: {sourceRoot,
    generatedRoot, outputRoot}, site: {baseUrl, prettyUrls, canonical},
    outputs: {catalog, searchCorpus}}` — `outputs` values are the
    output-root-relative artifact paths or `null` when off. argv[2]/argv[3]
    unchanged. Read-only, deleted with the overlay, never published, fresh per
    rebuild.
15. **Taxonomy removal**: `taxonomyKeys` field, extraction, `taxonomy-inert`
    finding, §28.2, its rules.tsv rows and tests, and any product-spec /
    authoring-rules language implying `tags`/`categories` are special. §28.1's
    P24 problems (`draft`/`permalink`/`slug`) are untouched.
16. **Version**: `package.json` → `0.9.0`, CHANGELOG entry, in the final batch.
17. **Every batch keeps all four gates green**, not just `bun test`:
    `check-traceability.mjs --runtime` (ledger from a fresh `bun test` run, empty
    baseline), `check-module-graph.mjs` (G8 — so a new `src/` module must be
    reachable from `cli.js` the moment it lands: B1/B2 wire their modules by
    moving shared helpers out of `manifest.js`/`sitemap.js` and importing back,
    a pure relocation with byte-identical behavior), and
    `check-suite-hygiene.mjs` (behavior tests spawn the CLI, no `src/**`
    imports, no skip/only, comparisons via `compare.mjs`; no FIXME/HACK/XXX
    marker words anywhere in `src/**`).
18. **Brief §29.2 (HTML/Markdown snapshot equality)** cannot be a `document.js`
    unit test — frontmatter→meta emission happens in the pipeline — so those
    cases land at the conformance tier: B3 asserts equality through
    `audit --format json` documents, B4 through catalog output.

## Batches

Each batch: branch `b<N>-<name>` off `release/0.9.0` → workflow (Sonnet
implementers → test-fix loop → two Opus reviewers (spec-fidelity + correctness)
→ Sonnet fixer → Opus verify) → full `bun test` green → merge into
`release/0.9.0` (no-ff).

- **B1 — document.js.** `src/core/document.js`: `extractDocument(html, {path,
  url}) → {document, analysis}` implementing the new snapshot contract, plus
  the shared low-level text machinery (`textContent`, `readText`, `collapse`,
  `nonEmpty`, `orNull`, the INVISIBLE/INLINE sets) *moved* here from
  `manifest.js`, which imports them back — wiring the module (gate G8) while
  keeping every observable behavior identical. `manifest.js`'s own PageRecord
  extraction is otherwise untouched. Unit tests per brief §29.1.
- **B2 — document-selectors.js.** Doc-level selectors over
  `{document, analysis}` envelopes + unit tests per brief §29.3 (envelopes
  built via `extractDocument`). The value-level interpretation cores move in
  from their current owners and are imported back (`classifyCanonical` family
  from `sitemap.js`, `isoDate` from `manifest.js`, robots parsing) so the
  module is wired and B3's consumer migration is a call-site swap, not a
  reimplementation. No observable behavior change.
- **B3 — the swap.** `manifest.js` rewritten around `BuildDocument` (extraction
  delegated to `document.js`, second-pass link graph + refresh target + lookup
  maps kept); every consumer migrated (sitemap, canonical, feed,
  structured-data, audit + external, dev-report, dry-run report); `PageRecord`,
  `taxonomyKeys`, `schemaType`, `conflicts`, `taxonomy-inert` deleted; audit
  JSON new shape. Conformance spec §20 rewritten; §21–§29, §24.4, §28.2, §31.1
  updated; rules.tsv and all conformance/unit tests updated in the same batch
  so the traceability gate stays green.
- **B4 — catalog + corpus.** New modules, CLI/config flags, `search-index.js`
  and its tests deleted, spec §30 replaced (catalog + corpus + membership +
  serialization), cli-reference updated, tests per brief §29.4/§29.5.
- **B5 — generator context.** `generate.js` context file + argv[4], spec §33
  updates, tests per brief §29.6, eleventy-htmx guide updated.
- **B6 — docs + E2E.** Product-spec rewrite of the affected sections
  (manifest/catalog/corpus/taxonomy/generator), authoring-rules wording sweep,
  getting-started/cli-reference consistency, new
  `docs/guides/catalog-and-search.md`, E2E blog fixture per brief §29.7.
  **Taxonomy scope, named explicitly so B3's §28.2 rewrite does not go
  unreconciled**: B3 deleted the 0.8 `taxonomy-inert` finding outright
  (conformance-spec §28.2) on the grounds that product-spec §6.3.9's own
  closing clause — diagnostics exist "to prevent confident cross-generator
  assumptions ..., not to reserve ordinary metadata names without cause" —
  cuts against keeping it. That leaves product-spec itself unamended and in
  direct conflict with the conformance spec until this batch: §6.3.9's own
  first sentence ("`tags` and `categories` carry an audit finding stating
  that they create neither collections nor taxonomies") and §4's frontmatter
  paragraph ("`tags` and `categories` still build nothing and `unify audit`
  says so once per page") both still promise the finding B3 removed. B6 must
  edit both passages to state the 0.9 reading (ordinary metadata, inert by
  design, reported by nothing) before this rewrite is complete.
- **B7 — cleanup + release.** Dead-code sweep (helpers only populating removed
  fields), version bump, CHANGELOG, full validation: `bun test` (traceability
  `--runtime` included), node-parity gate, compiled-binary and scaffold suites,
  golden path (`unify init && unify build --dry-run --strict` exits 0).

## Non-goals guarded throughout

No token replacement, expressions, collections, pagination, taxonomy routes,
query DSL, component props, recursive DOM serialization, body markup in the
catalog, post-build HTML mutation, plugin lifecycle, or injected runtime JS.
Reviewers check every batch against this list as well as against the brief.
