# Unify 0.9.0: Final Document Manifest, Catalog, Search Corpus, and Generator Context

## Implementation brief

### Status

Proposed breaking redesign for **Unify 0.9.0**.

This proposal intentionally assumes there is no compatibility obligation to the 0.8.x public machine schemas or CLI naming. The goal is to simplify the architecture now, while the project can still make hard breaks cheaply.

---

## 1. Executive summary

Unify should replace the current denormalized `PageRecord` model with a thinner, standards-shaped representation of each page's **final emitted HTML document**.

The central rule should be:

> **Final emitted HTML is the source of truth. Unify records a bounded structural projection of that document, and built-in features interpret it through shared selectors instead of storing the same facts again as Unify-specific fields.**

The public client-facing data should be split into two deliberately different artifacts:

- **`assets/unify/catalog.json`** — a compact catalog of public pages for browse, filter, listing, navigation, TOC, and metadata-driven UI. It contains important document/head data and headings, but no body text.
- **`assets/unify/search-corpus.json`** — an optional full-text corpus for client-side search. It contains only the page identity needed to join to the catalog plus normalized visible text.

The final build manifest remains an **internal build model**, not a file automatically dumped into the output tree. It may carry source/provenance and analysis data that the public catalog should never need.

The existing generator seam should also gain a **versioned generator context JSON file**, passed as an additional argument. This gives generators effective build configuration without exposing Unify internals or introducing a plugin lifecycle.

A future post-build **emitter** may be considered later, but should be constrained to generating additional artifacts from the final manifest. Arbitrary post-processing of emitted pages remains out of scope.

This redesign should also remove special-purpose public fields and concepts that are no longer necessary, especially:

- `taxonomyKeys`
- special `tags` / `categories` interpretation
- serialized `schemaType`
- duplicated fields such as `description`, `author`, dates, canonical, and image where they can instead be read through shared selectors over the final document projection
- the current `search-index.json` contract and `--search-index` option

The result should make Unify more standards-oriented and easier to compose with HTMX, Eleventy, custom generators, and small browser-side applications without turning Unify into a template engine or collections framework.

---

## 2. Goals

### 2.1 Primary goals

1. **Make the final emitted HTML document the sole semantic source of truth.**
2. **Replace the large custom `PageRecord` schema with a thin document-oriented representation.**
3. **Preserve arbitrary metadata without teaching Unify what every metadata key means.**
4. **Provide a compact browser-friendly artifact for listing, filtering, sorting, and browsing pages.**
5. **Keep full body text out of that compact artifact.**
6. **Provide full-text search data separately and only when requested.**
7. **Keep HTML and Markdown equal citizens.** Markdown frontmatter must matter only through the HTML it ultimately emits.
8. **Keep built-in consumers consistent by using one set of shared semantic selectors.**
9. **Give pre-build generators useful effective build context without exposing build internals.**
10. **Preserve Unify's existing simplicity boundaries: no expression language, collections DSL, plugin lifecycle, or arbitrary pipeline hooks.**

### 2.2 Secondary goals

- Make the output schemas easy for browser JavaScript, HTMX-adjacent applications, Eleventy adapters, and external tools to consume.
- Make the public schema intuitive to developers who already understand HTML.
- Keep JSON size bounded as long-form content grows.
- Reduce special-case extraction logic in `manifest.js`.
- Make future output projections and emitters easier to add without modifying page extraction again.

---

## 3. Non-goals

This work should **not** add:

- token replacement
- template expressions
- loops or conditionals
- built-in collections
- automatic tag/category archive generation
- pagination
- a query DSL
- component props
- a recursive JSON serialization of the entire DOM
- body paragraphs, code blocks, lists, or raw article markup in the catalog
- arbitrary post-build mutation of generated HTML
- a generic plugin lifecycle
- runtime JavaScript injected by Unify

Eleventy or a generator remains the answer when a site needs actual build-time collections, pagination, taxonomy routes, or complex data-driven page generation.

---

## 4. Naming and output location

The current name `search-index.json` and the proposed `content-index.json` are too similar. They sound like two versions of the same artifact even though they serve different purposes.

Use these names instead.

### 4.1 Catalog

**Filesystem path:**

```text
dist/assets/unify/catalog.json
```

**Public path at a domain-root deployment:**

```text
/assets/unify/catalog.json
```

The catalog is the compact structural/data projection used for:

- blog/article listings
- filters
- tags or arbitrary metadata facets
- sorting
- archive-style browsing
- command palettes
- page choosers
- TOC and heading navigation
- related-content logic based on declared metadata
- external cataloging/indexing tools

`catalog` is intentionally not called `content-index`: it is a catalog of documents and their metadata/structure, not an inverted search index and not a copy of their content.

### 4.2 Search corpus

**Filesystem path:**

```text
dist/assets/unify/search-corpus.json
```

**Public path at a domain-root deployment:**

```text
/assets/unify/search-corpus.json
```

The search corpus exists only for full-text search. It contains normalized visible text and a stable page identity used to join the result to `catalog.json`.

`search-corpus` is intentionally not called an index because Unify is not performing stemming, tokenization, ranking, inverted-index construction, or any search-engine-specific processing. It is supplying the corpus that a client-side search implementation can index however it chooses.

### 4.3 Why `assets/unify/`

Use `assets/unify/` rather than the output root because these files are machine-consumed runtime assets, not navigable site pages.

This location:

- keeps the output root clean
- groups Unify-generated browser-consumable files together
- avoids confusing `catalog.json` with ordinary site content
- avoids reusing the existing dev-only `/_unify/` namespace
- works on ordinary static hosts without relying on dot-directory behavior
- avoids abusing `/.well-known/`, which is intended for registered well-known URI conventions
- leaves room for future browser-facing Unify artifacts without creating more root-level files

Do **not** reserve all of `assets/unify/`. Reserve only exact generated artifact paths.

If the author already emits the exact file being requested, the authored file should suppress generation, matching the existing author-wins posture used for sitemap/feed/search outputs. `--dry-run` should make the suppression visible.

Example:

```text
assets/unify/catalog.json already exists in source; generated catalog suppressed
```

---

## 5. CLI changes

Target these breaking CLI changes for 0.9.0:

```text
REMOVE: --search-index
ADD:    --catalog
ADD:    --search-corpus
```

### 5.1 `--catalog`

Writes:

```text
assets/unify/catalog.json
```

No catalog file is emitted without the flag. The golden path remains free of extra generated artifacts.

### 5.2 `--search-corpus`

Writes:

```text
assets/unify/search-corpus.json
```

No corpus is emitted without the flag.

`--search-corpus` should **not** implicitly turn on `--catalog`. Hidden output coupling is unnecessary. Documentation should normally recommend enabling both for a full search UI:

```bash
unify dev --catalog --search-corpus
```

A consumer that only needs body search data may use the corpus alone. A browse/filter UI needs only the catalog.

### 5.3 Configuration

The equivalent `unify.yaml` settings should map directly to the same behaviors. Do not create behavior that can only be expressed in configuration.

---

## 6. Core architecture

The current conceptual architecture is heavily denormalized:

```text
final HTML
   |
   v
PageRecord
  |- title
  |- description
  |- author
  |- canonical
  |- robots
  |- dates
  |- image
  |- schemaType
  |- taxonomyKeys
  |- headings
  |- text
  |- links
  |- ids
  |- conflicts
  `- ...
```

The new architecture should separate three things:

1. **A final-document snapshot** — a small structural projection of the emitted HTML.
2. **Private analysis data** — body text, IDs, links, diagnostic/provenance data, malformed JSON-LD details, etc.
3. **Shared semantic selectors** — canonical interpretations used by built-in features.

```text
                     FINAL EMITTED HTML
                            |
                            v
                  one document extraction
                            |
              +-------------+--------------+
              |                            |
              v                            v
       DocumentSnapshot              AnalysisData
       HTML-shaped data              build-only data
              |                            |
              +-------------+--------------+
                            |
                            v
                     BuildManifest
                            |
          +-----------------+------------------+
          |                 |                  |
          v                 v                  v
    shared selectors      catalog          search corpus
          |
   +------+------+------+------+
   |      |      |      |      |
   v      v      v      v      v
 sitemap feed   audit canonical structured data
```

The rule is:

> Extract the document once. Interpret it centrally. Project it many times.

---

## 7. Replace `PageRecord` with a thin build document envelope

The internal build still needs a small envelope because some facts do not exist in HTML at all: source path, generated-source status, layout provenance, output file path, and diagnostic mappings.

Do not expose those as page content fields.

A recommended internal shape is:

```js
/**
 * @typedef {object} BuildDocument
 * @property {object} source
 * @property {string} source.path
 * @property {boolean} source.generated
 * @property {string|null} source.layout
 * @property {string} outputPath
 * @property {DocumentSnapshot} document
 * @property {DocumentAnalysis} analysis
 */
```

This is intentionally an envelope around the document rather than a semantic page schema.

### 7.1 `DocumentSnapshot`

The snapshot should contain only stable, bounded information from the final document:

```js
/**
 * @typedef {object} DocumentSnapshot
 * @property {string} path
 * @property {string|null} url
 * @property {{attributes: Record<string,string>}} html
 * @property {HeadSnapshot} head
 * @property {BodySnapshot} body
 */
```

### 7.2 `DocumentAnalysis`

Private analysis may contain the heavier or diagnostic-oriented information that should not appear in the public catalog:

```js
/**
 * @typedef {object} DocumentAnalysis
 * @property {string} visibleText
 * @property {string[]} ids
 * @property {string[]} rawHrefs
 * @property {string[]} linksOut
 * @property {string[]} linksIn
 * @property {{target:string,id:string}[]} fragmentLinks
 * @property {{raw:string,data:any,error:string|null}[]} jsonLd
 * @property {{tag:string,key:string|null}[]} strayMetadata
 */
```

Additional private fields are acceptable when a build feature genuinely needs them, but they must not become new public content-schema fields by default.

---

## 8. Public catalog schema

Use a thin HTML-shaped JSON structure optimized for filtering and ordinary JavaScript access.

Recommended top-level shape:

```json
{
  "schemaVersion": 1,
  "baseUrl": "https://example.com/",
  "pages": []
}
```

`baseUrl` is `null` when the build has no public base URL.

### 8.1 Recommended page entry

```json
{
  "path": "/posts/unify-and-htmx/",
  "url": "https://example.com/posts/unify-and-htmx/",
  "html": {
    "attributes": {
      "lang": "en"
    }
  },
  "head": {
    "title": "Unify and HTMX",
    "meta": [
      {
        "name": "description",
        "content": "A practical static-site architecture."
      },
      {
        "name": "tags",
        "content": "unify"
      },
      {
        "name": "tags",
        "content": "htmx"
      },
      {
        "property": "article:published_time",
        "content": "2026-08-25T09:00:00-05:00"
      }
    ],
    "link": [
      {
        "rel": "canonical",
        "href": "https://example.com/posts/unify-and-htmx/"
      },
      {
        "rel": "alternate",
        "type": "application/rss+xml",
        "href": "https://example.com/feed.xml"
      }
    ],
    "base": []
  },
  "body": {
    "attributes": {
      "class": "post"
    },
    "headings": [
      {
        "level": 1,
        "id": "unify-and-htmx",
        "text": "Unify and HTMX"
      },
      {
        "level": 2,
        "id": "architecture",
        "text": "Architecture"
      }
    ]
  }
}
```

### 8.2 Why this shape

This deliberately resembles HTML without serializing a recursive DOM.

Consumers can write obvious code:

```js
const tags = page.head.meta
  .filter((m) => m.name === "tags")
  .map((m) => m.content);
```

```js
const published = page.head.meta
  .find((m) => m.property === "article:published_time")
  ?.content;
```

```js
const canonical = page.head.link
  .find((l) => l.rel?.split(/\s+/).includes("canonical"))
  ?.href;
```

No Unify taxonomy or page-type schema is required.

---

## 9. Catalog extraction rules

The catalog needs a precise bounded contract. Do not specify it as "important parts of the DOM" without defining what that means.

### 9.1 Location

Every catalog page includes:

- `path` — the final public root-relative path, including any configured base path prefix
- `url` — the final absolute URL when `--base-url` is set, otherwise `null`

Do not expose:

- source path
- generated/source status
- layout path
- filesystem output path

Those are build facts, not public content facts.

### 9.2 `<html>`

Include:

```json
{
  "html": {
    "attributes": {}
  }
}
```

Preserve all final emitted root attributes, including arbitrary `data-*` attributes.

Attribute names should use normalized HTML attribute-name casing. Attribute values should be character-reference decoded but otherwise preserved; interpretation belongs in selectors.

### 9.3 `<head>`

The public catalog should include only bounded head information:

- the effective first `<title>` text
- every `<meta>` element in head order
- every `<link>` element in head order
- every `<base>` element in head order

Do **not** include:

- `<style>` contents
- executable `<script>` contents
- inline JavaScript
- inline CSS
- arbitrary raw head HTML

`meta`, `link`, and `base` entries should be plain objects containing all attributes on that element. The tag name is implied by the containing array and should not be duplicated on every object.

Example:

```json
{
  "meta": [
    {"name": "tags", "content": "unify"},
    {"name": "tags", "content": "htmx"},
    {"property": "og:type", "content": "article"}
  ]
}
```

This preserves:

- arbitrary metadata vocabulary
- repeated values
- declaration order
- `name` vs `property`
- custom metadata
- future metadata conventions Unify does not know about

### 9.4 JSON-LD and scripts

Do **not** copy JSON-LD script bodies into `catalog.json` by default.

A JSON-LD block can itself contain large article bodies, product datasets, graphs, or duplicated content. Including it wholesale would undermine the catalog's bounded-size goal.

Continue parsing and retaining JSON-LD in **private analysis** for:

- audit
- structured-data validation
- feed/type decisions
- built-in structured-data behavior

A future separate machine projection can expose structured-data graphs if a real use case demands it. Do not make the browsing catalog carry them preemptively.

### 9.5 `<body>`

Include:

```json
{
  "body": {
    "attributes": {},
    "headings": []
  }
}
```

Preserve all `<body>` attributes.

Do not serialize the body DOM.

### 9.6 Headings / TOC source

The catalog should contain a **flat heading sequence**, not a generated hierarchy:

```json
[
  {"level": 1, "id": "intro", "text": "Introduction"},
  {"level": 3, "id": "details", "text": "Details"}
]
```

Use:

1. headings inside the first `<main>` when one exists
2. otherwise headings inside `<body>`
3. otherwise headings in the document root

Preserve:

- source/document order
- actual heading level
- final emitted `id`
- normalized visible heading text

Do not construct parent/child relationships. A nested TOC is a consumer presentation decision, and manufacturing hierarchy for skipped levels such as `h1 -> h3` would add semantics the document did not explicitly state.

### 9.7 Text normalization

For `title` and heading text, use the same visible-text normalization everywhere:

- decode character references
- omit invisible script/style/template content
- collapse ASCII whitespace runs
- trim leading/trailing whitespace

For attribute values, decode character references but do not perform semantic trimming or coercion in the snapshot. Selectors may trim when a standard's interpretation requires it.

---

## 10. Catalog membership

`catalog.json` is public runtime data, not an internal dump of every emitted HTML file.

Use one shared predicate for pages that represent public site destinations. Reuse the same canonical/indexability policy used by sitemap/search membership where appropriate.

Recommended default membership:

- has a final document record
- is indexable according to the document's robots policy
- is not the root `404.html`
- is self-canonical rather than consolidated onto another page

The exact predicate must live in one shared function. Do not reimplement it separately in sitemap, catalog, and search corpus.

Suggested name:

```js
isPublicDestination(document, baseConfig)
```

This keeps a page from being present in the sitemap but absent from the catalog because two implementations disagreed about canonical or robots semantics.

---

## 11. Search corpus schema

The search corpus should be intentionally minimal.

Recommended shape:

```json
{
  "schemaVersion": 1,
  "pages": [
    {
      "path": "/posts/unify-and-htmx/",
      "text": "Full normalized visible page text..."
    }
  ]
}
```

Do not duplicate metadata, headings, title, description, tags, or canonical URLs in this file. They already exist in the catalog.

The public path is the join key:

```js
const catalogByPath = new Map(
  catalog.pages.map((page) => [page.path, page])
);

const result = catalogByPath.get(searchHit.path);
```

### 11.1 Visible text rules

Use the current visible-text concept:

1. first `<main>`
2. otherwise `<body>`
3. otherwise document root

Exclude invisible subtrees such as:

- `script`
- `style`
- `template`
- `noscript`

Normalize whitespace for search corpus output, including the existing Unicode space-separator folding currently performed for `search-index.json`.

Do not add:

- stemming
- case folding
- stop-word removal
- tokenization
- ranking
- truncation

Those are search-engine decisions.

### 11.2 Membership

Use the same `isPublicDestination` predicate as `catalog.json`.

---

## 12. Arbitrary metadata replaces taxonomy concepts

Remove the idea that Unify understands `tags` and `categories` as special taxonomy keys.

A Markdown page may write:

```yaml
tags:
  - unify
  - htmx
series: Small Web
audience:
  - beginner
  - intermediate
```

Markdown conversion already turns arbitrary non-reserved frontmatter into emitted metadata. The final catalog should therefore contain the same representation an equivalent HTML page would produce:

```json
{
  "head": {
    "meta": [
      {"name": "tags", "content": "unify"},
      {"name": "tags", "content": "htmx"},
      {"name": "series", "content": "Small Web"},
      {"name": "audience", "content": "beginner"},
      {"name": "audience", "content": "intermediate"}
    ]
  }
}
```

A consumer chooses which fields are facets:

```js
metaValues(page, "tags");
metaValues(page, "series");
metaValues(page, "audience");
```

### 12.1 Remove

Remove:

- `taxonomyKeys`
- taxonomy-specific extraction
- the `taxonomy-inert` audit finding
- documentation implying that `tags` or `categories` have special meaning in Unify

Arbitrary metadata is inert by design. It becomes meaningful only to the consumer that chooses to interpret it.

---

## 13. Remove serialized `schemaType`

`schemaType` should not survive as a field in the 0.9 final document model or public catalog.

A final document can contain multiple structured-data declarations and multiple types. Collapsing them to one scalar creates an unnecessarily Unify-specific answer to a richer standard representation.

Replace the field with shared selectors used only by features that actually need a bounded answer.

Example:

```js
function declaredTypes(buildDocument) {
  // Read any supported <meta name="schema"> declaration if that authoring
  // convenience remains, plus valid JSON-LD types from analysis.jsonLd.
}
```

Consumers such as feed generation can then ask a precise feature-level question:

```js
function isFeedCandidate(doc) {
  return declaredTypes(doc).some(
    (type) => type === "Article" || type === "BlogPosting"
  );
}
```

### 13.1 Scope note

This proposal removes the **stored `schemaType` field**.

Whether 0.9 also removes the custom `<meta name="schema">` authoring convenience and bounded JSON-LD generation is a separate product decision. It is not required for this manifest redesign.

If that behavior remains, it must be implemented through selectors over the final document rather than by restoring a `schemaType` property.

---

## 14. Shared semantic selectors

The new architecture only works if built-in consumers do not each invent their own interpretation of the HTML-shaped snapshot.

Create one internal selector module, for example:

```text
src/core/document-selectors.js
```

Suggested helpers:

```js
titleOf(doc)
metaValues(doc, name)
propertyValues(doc, property)
linksWithRel(doc, rel)
canonicalOf(doc)
robotsPolicyOf(doc)
refreshOf(doc)
authorOf(doc)
publicationDatesOf(doc)
preferredImageOf(doc)
declaredTypes(doc)
isPublicDestination(doc, base)
```

The selectors are the canonical interpretation layer.

### 14.1 Important rule

Do **not** serialize all selector results back into the document object.

This would simply recreate the old `PageRecord` under a new name.

A selector result should become a persisted field only when it is itself a fundamental document/build identity that cannot reasonably be read from the snapshot.

### 14.2 Parsing rules belong in selectors

Examples:

- `robotsPolicyOf` unions repeated `meta name="robots"` declarations.
- `canonicalOf` interprets canonical links and preserves the current conflict rules.
- `publicationDatesOf` applies the accepted date grammar.
- `preferredImageOf` handles OG/Twitter image precedence.
- `declaredTypes` reads the bounded supported structured-data declarations.

All existing built-in features should call these helpers rather than inspect arrays with their own rules.

---

## 15. Internal manifest structure

Recommended internal model:

```js
/**
 * @typedef {object} BuildManifest
 * @property {BuildDocument[]} documents
 * @property {Map<string, BuildDocument>} byOutputPath
 * @property {Map<string, BuildDocument>} byPublicPath
 */
```

A `BuildDocument` contains:

```js
{
  source: {
    path,
    generated,
    layout
  },
  outputPath,
  document: {
    path,
    url,
    html,
    head,
    body
  },
  analysis: {
    visibleText,
    ids,
    rawHrefs,
    linksOut,
    linksIn,
    fragmentLinks,
    jsonLd,
    strayMetadata
  }
}
```

This remains a build-internal data structure. It is acceptable for it to carry more than the public catalog because its purpose is build correctness and diagnostics, not browser payload size.

---

## 16. Extraction should happen from final emitted HTML

Preserve the strongest current manifest rule:

> Never reach back into Markdown frontmatter or source files to derive page semantics when the same fact can be read from the emitted document.

This guarantees equivalent HTML and Markdown pages produce equivalent document snapshots.

Example Markdown:

```yaml
---
tags:
  - unify
  - htmx
---
```

and equivalent HTML:

```html
<meta name="tags" content="unify">
<meta name="tags" content="htmx">
```

must produce the same catalog metadata.

Source/provenance data is the only intentional exception, because values such as layout selection and generated-source status no longer exist after composition.

---

## 17. Build pipeline changes

The existing build already uses preliminary manifest passes for page mutations such as canonical completion and structured-data generation, then derives a final manifest after those mutations.

Keep that architectural ordering, but replace `PageRecord` extraction with document snapshot + selectors.

Recommended 0.9 pipeline:

```text
1. run pre-generator, if configured
2. scan source + generated overlay
3. Markdown conversion / includes / layout composition
4. resolve output paths and collisions
5. URL rewriting
6. canonical completion, if enabled
   - extract preliminary snapshot only when needed
   - use shared selectors
7. structured-data declaration checks / bounded generation
   - extract preliminary snapshot only when needed
   - use shared selectors
8. FINAL document extraction
   - DocumentSnapshot
   - private DocumentAnalysis
   - link graph resolution
9. built-in manifest consumers
   - sitemap
   - feed
   - audit
   - dev report
   - catalog, if enabled
   - search corpus, if enabled
10. reference checks
11. transactional publish
```

### 17.1 Final extraction is authoritative

Anything that mutates emitted page bytes must occur before the final extraction.

The final manifest should not be patched after the fact to account for generated canonical or structured-data bytes.

---

## 18. Generator context v1

Extend the existing generator subprocess contract additively.

Keep:

```text
process.argv[2] = absolute source root
process.argv[3] = absolute generated overlay directory
```

Add:

```text
process.argv[4] = absolute path to generator-context.json
```

Do not replace the first two arguments. Keeping them makes the seam trivial for simple generators and makes the context additive rather than mandatory ceremony.

### 18.1 Context example

```json
{
  "schemaVersion": 1,
  "unifyVersion": "0.9.0",
  "command": "dev",
  "paths": {
    "sourceRoot": "/project/src",
    "generatedRoot": "/tmp/unify-generated-abc123",
    "outputRoot": "/project/dist"
  },
  "site": {
    "baseUrl": "https://example.com/docs/",
    "prettyUrls": true,
    "canonical": "auto"
  },
  "outputs": {
    "catalog": "assets/unify/catalog.json",
    "searchCorpus": null
  }
}
```

### 18.2 Context rules

The context is:

- versioned
- JSON
- written to a temporary build location
- read-only input to the generator
- deleted with the build's temporary generator state
- not published
- not an imported JS API
- not an object reference into Unify internals

Do not expose:

- environment variables
- secrets
- reporter objects
- parser objects
- internal callbacks
- mutable build state
- intermediate page collections
- the final manifest, because it does not exist yet

### 18.3 Stable fields only

Expose only settings Unify is willing to treat as a machine contract.

Do not serialize the entire internal `settings` object. Internal option names and implementation details should remain free to change.

---

## 19. Future emitter boundary

Do not implement a generic postprocessor in this work.

If demand appears, the preferred future extension is a **manifest-driven emitter**:

```text
final BuildManifest
       |
       v
versioned emitter input
       |
       v
external emitter subprocess
       |
       v
fresh output overlay
       |
       v
collision/reference checks
       |
       v
transactional publish
```

The emitter may add artifacts such as:

- custom JSON catalogs
- specialized search data
- custom feeds
- `llms.txt`
- deployment manifests
- third-party index payloads

It must not mutate already-composed page HTML.

This preserves the central guarantee that Unify remains the deterministic owner of its emitted pages.

---

## 20. Module/file refactor

A clean implementation should avoid leaving the old large manifest extractor in place with new fields bolted on.

Recommended module boundaries:

### 20.1 `src/core/document.js`

Own:

- final HTML parsing
- `DocumentSnapshot` extraction
- bounded head projection
- root/body attributes
- heading extraction
- private visible-text extraction
- raw reference and ID collection
- JSON-LD parsing for private analysis

It observes. It should not make audit findings or generate output.

### 20.2 `src/core/document-selectors.js`

Own:

- metadata lookup helpers
- canonical interpretation
- robots interpretation
- dates
- images
- declared types
- public-destination predicate
- other shared semantic interpretations

### 20.3 `src/core/manifest.js`

Shrink this module to:

- ordering documents
- building lookup maps
- resolving the second-pass link graph
- creating the final `BuildManifest`

It should no longer contain a long chain of special-case metadata field extraction.

### 20.4 `src/core/catalog.js`

New module.

Own:

- `CATALOG_PATH = "assets/unify/catalog.json"`
- membership filtering
- public projection from `DocumentSnapshot`
- schema serialization
- authored-file suppression

### 20.5 `src/core/search-corpus.js`

Replace `src/core/search-index.js`.

Own:

- `SEARCH_CORPUS_PATH = "assets/unify/search-corpus.json"`
- membership filtering
- visible-text whitespace folding
- minimal `{path,text}` projection
- authored-file suppression

Delete the old `search-index.js` once all consumers/tests are migrated.

### 20.6 `src/core/generate.js`

Extend the existing generator seam with context-file creation and argument passing.

Keep subprocess isolation and fresh-process rebuild behavior unchanged.

---

## 21. Built-in consumer migration

Every built-in consumer currently reading `PageRecord` fields must move to the shared selectors and thin document envelope.

### 21.1 Migration table

| Current field/use | 0.9 replacement |
|---|---|
| `record.title` | `titleOf(doc)` |
| `record.description` | `metaValue(doc, "description")` or dedicated selector |
| `record.lang` | `doc.document.html.attributes.lang` |
| `record.canonical` | `canonicalOf(doc)` |
| `record.robots` | `robotsPolicyOf(doc)` |
| `record.refresh` | `refreshOf(doc)` |
| `record.image` | `preferredImageOf(doc)` |
| `record.author` | `authorOf(doc)` |
| `record.datePublished` | `publicationDatesOf(doc).published` |
| `record.dateModified` | `publicationDatesOf(doc).modified` |
| `record.schemaType` | `declaredTypes(doc)` |
| `record.taxonomyKeys` | remove entirely |
| `record.headings` | `doc.document.body.headings` |
| `record.text` | `doc.analysis.visibleText` |
| `record.ids` | `doc.analysis.ids` |
| `record.linksOut` | `doc.analysis.linksOut` |
| `record.linksIn` | `doc.analysis.linksIn` |
| `record.fragmentLinks` | `doc.analysis.fragmentLinks` |
| `record.strayMetadata` | `doc.analysis.strayMetadata` |
| `record.jsonLd` | `doc.analysis.jsonLd` |
| `record.sourcePath` | `doc.source.path` |
| `record.generated` | `doc.source.generated` |
| `record.layout` | `doc.source.layout` |

### 21.2 Sitemap

Use:

- `doc.document.path/url`
- `robotsPolicyOf`
- `canonicalOf`
- shared `isPublicDestination`
- normalized modified date selector if sitemap still uses it

### 21.3 Feed

Use:

- `declaredTypes`
- `robotsPolicyOf`
- `canonicalOf`
- `titleOf`
- `publicationDatesOf`
- `authorOf`

`--feed-full` may continue to read final page markup separately because it intentionally copies emitted body markup rather than semantic data.

### 21.4 Structured data

Use selectors over the document and private JSON-LD analysis.

Do not restore `schemaType` merely because structured-data generation wants one bounded value.

### 21.5 Audit

Audit should operate on:

- snapshot structure
- selectors
- private analysis
- graph lookups

This makes findings predicates over the actual final document model rather than over duplicated convenience fields.

### 21.6 Dev report

Render the same final document facts/selectors used elsewhere. Do not create a second extractor for the report.

---

## 22. Audit JSON and machine surfaces

`unify audit --format json` must break in 0.9.0 rather than preserve the old `PageRecord` schema awkwardly.

Recommended direction:

```json
{
  "schemaVersion": 1,
  "baseUrl": "https://example.com/",
  "summary": {},
  "pages": [
    {
      "source": "posts/foo.md",
      "outputPath": "posts/foo/index.html",
      "document": {
        "path": "/posts/foo/",
        "url": "https://example.com/posts/foo/",
        "html": {},
        "head": {},
        "body": {}
      }
    }
  ],
  "findings": []
}
```

Audit JSON may include source/output identity because it is a build/evaluation artifact rather than a browser catalog.

Do not expose the entire private `analysis` object automatically. Findings already carry the diagnostic facts external automation normally needs.

Document the audit schema separately from the public catalog schema even if both reuse `DocumentSnapshot`.

---

## 23. Catalog and browser usage example

A simple blog listing can now be completely static and data-driven without Eleventy or build-time collections.

Example client module:

```js
const catalogUrl = new URL("./unify/catalog.json", import.meta.url);
const catalog = await fetch(catalogUrl).then((r) => r.json());

function metaValues(page, name) {
  return page.head.meta
    .filter((m) => m.name === name)
    .map((m) => m.content ?? "")
    .filter(Boolean);
}

const posts = catalog.pages
  .filter((page) => metaValues(page, "kind").includes("post"))
  .sort((a, b) => {
    const da = metaValues(a, "date")[0] ?? "";
    const db = metaValues(b, "date")[0] ?? "";
    return db.localeCompare(da);
  });
```

Because the script resolves the catalog relative to its own module URL, the example remains portable under `--base-url` subpath hosting when the module and generated Unify assets are placed under the same `assets/` tree.

For full-text search:

```js
const corpusUrl = new URL("./unify/search-corpus.json", import.meta.url);
const corpus = await fetch(corpusUrl).then((r) => r.json());

const pagesByPath = new Map(catalog.pages.map((p) => [p.path, p]));

// Give corpus.pages to MiniSearch/FlexSearch/custom search code.
// Join hits back to pagesByPath for title, description, tags, headings, etc.
```

HTMX remains complementary for fetching real HTML resources or progressively enhancing navigation. It does not need to become the client-side search engine.

---

## 24. Interaction with Markdown frontmatter

Do not create a separate `frontmatter` object in the manifest or catalog.

Reserved frontmatter keys continue to affect document construction where appropriate, but arbitrary frontmatter must be observed later through the emitted HTML it produces.

This preserves the invariant:

```text
Markdown frontmatter -> emitted HTML metadata -> final snapshot
HTML head metadata ---------------------------> final snapshot
```

Not:

```text
Markdown -> source metadata model
HTML ----> separate DOM metadata model
```

There must be only one semantic reading.

---

## 25. Remove token replacement from consideration

This architecture removes most of the motivation for basic token replacement.

A simple blog can now obtain:

- title
- arbitrary metadata
- dates
- tags
- categories
- custom facets
- headings
- public paths
- optional full text

through the generated catalog/corpus without requiring `{{ ... }}` substitution in Unify.

When authored HTML must be generated from data at build time, use:

- the existing generator seam
- Eleventy for advanced cases
- another external generator

Do not add a second templating language to Unify.

---

## 26. Output collision and transaction rules

Both public artifacts must participate in normal generated-output rules.

Exact generated paths:

```text
assets/unify/catalog.json
assets/unify/search-corpus.json
```

Rules:

1. If the site already emits the exact path from source, authored content wins and generated output is suppressed.
2. Generated output joins the temporary tree before reference checks/publish.
3. Generated files appear in `--dry-run` output.
4. A failed build never partially updates either file.
5. Watch mode updates them atomically and only when contents change.
6. The directory itself is not reserved; only exact generated files are special.

---

## 27. Schema versioning

Both public files carry independent `schemaVersion` values.

Start the new 0.9 contracts at:

```json
{"schemaVersion": 1}
```

Within schema version 1:

- new optional fields may be added
- existing field meanings must not change
- existing field types must not change
- removing or renaming a field requires a schema-version increment

Do not tie schema version to Unify package version.

The generator context has its own `schemaVersion` because it is a separate machine contract.

---

## 28. Determinism

All generated JSON must remain deterministic.

Rules:

- documents sort by final output/public path using one shared ordering
- head arrays preserve emitted document order
- heading arrays preserve document order
- object field serialization order is fixed by explicit object construction
- JSON uses two-space indentation and a trailing newline, matching existing generated JSON style
- no timestamps, build IDs, random values, filesystem mtimes, or Git-derived data

The same final page bytes and the same build settings must produce byte-identical catalog and corpus files.

---

## 29. Testing strategy

### 29.1 Document extraction unit tests

Cover:

- root attributes
- body attributes
- title extraction
- arbitrary meta names
- `property=` metadata
- repeated metadata values
- metadata ordering
- arbitrary meta attributes
- all link attributes
- repeated links
- base elements
- character-reference decoding
- body text excluded from snapshot
- body text present in private analysis
- first-main heading scope
- body fallback heading scope
- heading IDs
- skipped heading levels preserved
- script/style/template text excluded from visible text
- JSON-LD retained privately but omitted from catalog

### 29.2 HTML/Markdown equality tests

For every metadata shape supported by frontmatter, create equivalent HTML and Markdown pages and assert identical `DocumentSnapshot` content.

Important cases:

- scalar metadata
- repeated/list metadata
- nested one-level `og:` frontmatter flattening
- title
- lang / body class behavior where applicable

### 29.3 Selector tests

Pin each selector independently:

- repeated robots declarations
- multiple canonicals/conflicts
- date parsing
- OG/Twitter image precedence
- declared structured-data types
- indexability/public-destination membership
- authored canonical vs self canonical

### 29.4 Catalog tests

Assert:

- exact output path
- no output without `--catalog`
- source file suppresses generation
- no body text appears
- arbitrary metadata appears
- long article body does not materially increase catalog entry size except headings/head data
- 404/noindex/cross-canonical pages are excluded according to shared membership
- base URL path is reflected in `path/url`
- deterministic ordering and bytes

### 29.5 Search corpus tests

Assert:

- exact output path
- no output without `--search-corpus`
- minimal `{path,text}` shape
- visible body text rules
- Unicode search whitespace folding
- shared membership with catalog
- deterministic bytes

### 29.6 Generator context tests

Assert:

- argv 2 and 3 unchanged
- argv 4 exists and names readable JSON
- schema version
- effective base URL and pretty URL settings
- output artifact paths
- context removed after build
- subprocess isolation unchanged
- every rebuild gets a fresh generator process and fresh context
- no final manifest is exposed to the pre-generator

### 29.7 End-to-end test

Add a small blog fixture with:

- Markdown posts
- arbitrary tags
- a custom `series` field
- dates
- descriptions
- headings
- catalog enabled
- search corpus enabled
- a browser-side listing script fixture

Assert that the generated data is enough to:

- select blog posts
- sort newest-first
- filter tags
- filter series
- search full text by joining corpus results to catalog pages

No collections feature should exist in Unify to make the fixture pass.

---

## 30. Documentation changes

### 30.1 Product spec

Rewrite the current page-manifest section around:

- final document snapshot
- private build analysis
- one-selector interpretation rule
- public catalog projection
- optional search corpus
- generator context

Remove taxonomy-specific product language.

### 30.2 Conformance spec

Replace the existing `PageRecord` field-by-field contract with normative rules for:

- final snapshot extraction
- attribute normalization
- text normalization
- heading scope
- catalog membership
- catalog serialization
- corpus membership
- corpus text normalization
- generator context contract

### 30.3 CLI reference

Replace:

```text
--search-index
```

with:

```text
--catalog
--search-corpus
```

Document exact output locations.

### 30.4 Authoring rules

The core authoring-rules page should remain essentially unchanged.

Do not add catalog-specific authoring syntax. Arbitrary metadata already flows through ordinary frontmatter/meta behavior.

Remove wording that implies `tags` and `categories` are special Unify concepts.

### 30.5 Advanced guide

Add a concise guide such as:

```text
docs/guides/catalog-and-search.md
```

Demonstrate:

- a static blog list from `catalog.json`
- arbitrary metadata facets
- sorting by declared date
- full-text search using `search-corpus.json`
- an optional MiniSearch/FlexSearch example
- HTMX for HTML navigation/fragments alongside the client search UI

---

## 31. Suggested implementation sequence

### Phase 1 — Define the new contracts

1. Update product-spec design language.
2. Define `DocumentSnapshot` and `DocumentAnalysis` in the conformance spec.
3. Define catalog schema and exact output path.
4. Define search corpus schema and exact output path.
5. Define generator context v1.

Do this before refactoring implementation so tests have a stable target.

### Phase 2 — Build extraction primitives

1. Create `document.js`.
2. Move common text extraction from current `manifest.js` into it.
3. Implement root/head/body snapshot extraction.
4. Implement private text/ID/link/JSON-LD analysis.
5. Preserve provenance hooks required for diagnostics.

### Phase 3 — Build selectors

1. Create `document-selectors.js`.
2. Port current field interpretation one concept at a time.
3. Add unit tests before migrating consumers.
4. Remove equivalent extraction state from the old manifest as each selector lands.

### Phase 4 — Replace manifest model

1. Rewrite `manifest.js` around `BuildDocument`.
2. Resolve graph relationships in the existing second pass.
3. Delete the old `PageRecord` typedef and field collector classes.
4. Remove taxonomy extraction.
5. Remove serialized `schemaType`.

### Phase 5 — Migrate built-in consumers

Recommended order:

1. sitemap
2. canonical
3. feed
4. structured data
5. audit
6. dev report
7. external audit

After each migration, delete compatibility shims rather than accumulating aliases.

### Phase 6 — Add public projections

1. Add `catalog.js`.
2. Add `search-corpus.js`.
3. Remove `search-index.js`.
4. Add CLI/config options.
5. Wire both before final reference/publish stages.

### Phase 7 — Add generator context

1. Create context JSON per build/rebuild.
2. Pass as argv 4.
3. Update generator documentation/examples.
4. Update the Eleventy integration example to consume context when useful.

### Phase 8 — Cleanup

Delete:

- legacy search-index docs/tests/code
- taxonomy field handling
- taxonomy-inert finding
- PageRecord compatibility properties
- any helpers whose only purpose was to populate removed fields

Run the full conformance, unit, compiled-binary, Node, Bun, watch, and scaffold suites after cleanup.

---

## 32. Acceptance criteria

The 0.9.0 implementation is complete when all of the following are true:

### Core model

- There is no public/internal denormalized `PageRecord` schema carrying the old field set.
- Final page semantics come from final emitted HTML.
- HTML and Markdown with equivalent emitted markup produce equivalent snapshots.
- Built-in consumers use shared selectors rather than independently interpreting metadata.

### Catalog

- `--catalog` emits `assets/unify/catalog.json`.
- The catalog contains final page location, root attributes, bounded head data, body attributes, and headings.
- Arbitrary repeated metadata is preserved.
- Body paragraphs/full text are absent.
- Long-form page growth does not proportionally grow the catalog.
- `tags`, `categories`, `series`, or any other custom metadata require no Unify schema changes.

### Search corpus

- `--search-corpus` emits `assets/unify/search-corpus.json`.
- The corpus contains only page identity and normalized visible full text.
- Catalog and corpus use the same public-page membership rule.
- Full-text data is never generated unless requested.

### Removed custom schema

- `taxonomyKeys` is gone.
- taxonomy-specific interpretation is gone.
- `taxonomy-inert` is gone.
- serialized `schemaType` is gone.
- no compatibility aliases remain for 0.8.x machine schemas.

### Generator context

- pre-generators still receive source root and overlay as argv 2/3.
- argv 4 supplies a versioned context JSON file.
- effective build settings needed by integrations no longer need to be reparsed from CLI/config by the generator.
- no plugin API or intermediate build-state API is introduced.

### Output behavior

- generated data files live under `assets/unify/`, not the output root.
- generated files participate in dry-run, atomic watch updates, checks, and transactional publish.
- authored exact-path files suppress generated equivalents.
- output is deterministic.

---

## 33. Final architectural rule

The 0.9 design should be easy to summarize in one paragraph:

> **Unify composes HTML. After all page mutations are complete, it reads each final document once into a small HTML-shaped snapshot plus private analysis data. Built-in features interpret that snapshot through shared selectors. `catalog.json` publishes only bounded metadata and heading structure for browser-side listing/filtering, while `search-corpus.json` separately publishes full visible text when requested. Generators receive build context before composition; future emitters may derive new artifacts after composition, but neither gets hooks that change Unify's HTML composition semantics.**

That keeps Unify simple while making it substantially more useful as the foundation of static blogs, documentation sites, searchable catalogs, HTMX sites, and integrations with richer generators such as Eleventy.
