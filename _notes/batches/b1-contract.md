# Batch B1 — `src/core/document.js`: final-document extraction primitives

Read first: `_notes/unify-0.9-brief.md` (the redesign), `_notes/release-0.9.0-implementation-plan.md`
(the resolved decisions — they govern where the brief leaves latitude), and
`src/core/manifest.js` in full (the semantics being ported live there today).

## Objective

Create `src/core/document.js`, the single extraction pass over a final emitted
HTML document, producing the 0.9 `DocumentSnapshot` + per-document
`DocumentAnalysis`. This batch is **additive**: no CLI-observable behavior may
change, and `manifest.js` keeps producing PageRecords exactly as today. The new
module is wired into the module graph by *relocating* the shared low-level text
machinery out of `manifest.js` and importing it back.

## Deliverables

### 1. `src/core/document.js`

Exports:

- `extractDocument(html, { path = null, url = null } = {}) → { document, analysis }`
- The relocated helpers (moved from `manifest.js`, byte-identical semantics,
  exported): `textContent`, `readText`, `collapse`, `nonEmpty`, `orNull`, and
  the `INVISIBLE`/`INLINE` sets (export the sets only if `manifest.js` or tests
  need them; otherwise keep private). `manifest.js` deletes its local copies and
  imports from `./document.js`. Its own `extract()` logic, field set, and output
  are otherwise untouched.

`document` (the `DocumentSnapshot`):

```
{
  path,                       // passed through, default null
  url,                        // passed through, default null
  html: { attributes },       // the <html> element's attributes
  head: { title, meta, link, base },
  body: { attributes, headings }
}
```

- **Attribute objects** (`html.attributes`, `body.attributes`, and each
  `meta`/`link`/`base` entry): plain objects mapping the attribute name,
  lowercased, to its value with character references decoded
  (`decodeEntities`) and **nothing else** — no trimming, no coercion. A bare
  attribute (no `=`) maps to `""`. When one element repeats an attribute name,
  the first occurrence wins (HTML's own rule). Missing `<html>`/`<body>`
  element → `{}`. The tag name is never a key.
- **Head scope** is §20.3's rule, unchanged: when the document has a `<head>`
  element, `head.title`/`meta`/`link`/`base` read only elements inside it; a
  document with **no** `<head>` element is read whole. `findAll`'s default
  `skipTag: "template"` applies — `<template>` contents are never scanned.
- `head.title`: the first `<title>` (in head scope) whose visible-text
  normalization (`orNull(readText(innerText(...)))` — decode, collapse ASCII
  whitespace, trim) is non-empty; `null` when none. Same first-accepted rule as
  today's `title` field.
- `head.meta` / `head.link` / `head.base`: one attribute object per
  `<meta>`/`<link>`/`<base>` element in head scope, in document order, **all**
  attributes preserved (including `data-*` and unknown ones).
- `body.headings`: flat `[{ level, id, text }]` — **scope is the 0.9 change**:
  headings inside the first `<main>` element when one exists, else inside
  `<body>`, else the whole document. Document order, authored levels (no
  hierarchy manufactured, skipped levels preserved). `text` via
  `textContent(node)`; `id` via `nonEmpty(getAttr(node, "id"))` (decoded,
  trimmed, `null` when absent/empty). Headings inside `<template>` or inside
  the INVISIBLE subtrees are excluded exactly as `findAll`/`textContent`
  already exclude them; a heading *outside* `<main>` (when `<main>` exists) is
  excluded by the scope rule.

`analysis` (the per-document half of `DocumentAnalysis`):

```
{
  visibleText,   // §20.7/§20.3 exactly: textContent of first <main>, else <body>, else root
  ids,           // every non-empty id attr document-wide, document order, repeats kept (nonEmpty)
  titleTexts,    // every accepted (non-empty, normalized) head-scope <title> text, in order
  jsonLd,        // [{raw, data, error}] per ld+json script document-wide, document order,
                 //   parse failure never throws — port manifest.js verbatim
  strayMetadata, // [{tag, key}] — port manifest.js's closed-set logic verbatim
                 //   (only when the document has a <head>)
  rawHrefs,      // every <a href> attribute value document-wide, document order, raw/undecoded
  refresh        // the FIRST meta http-equiv=refresh (document-wide) that declares a refresh,
                 //   as {raw, seconds, url, hasSecondPart} — raw is the decoded non-empty
                 //   content value (nonEmpty), the rest from parseRefreshMeta; null when none.
                 //   Target resolution is NOT this module's job (manifest second pass, B3).
}
```

Port the exact discipline documented in `manifest.js`: decode-then-collapse
order, `nonEmpty` for raw attribute slices vs `orNull` for already-normalized
text (never double-decode), `findAll` template-skipping, `INVISIBLE` subtree
omission with enter/leave separators for non-`INLINE` elements, `<br>` not
inline. `extractDocument` observes only — it never throws on malformed markup,
never reports, never writes.

Module header comment: follow the repository's house style (see `manifest.js`,
`search-index.js`) — state what the module owns, the snapshot/analysis split,
and that interpretation belongs to selectors (coming in the next batch), citing
the brief's rule: extract once, interpret centrally, project many times. Do not
cite conformance-spec section numbers for the *new* shapes yet (the spec
rewrite lands with the model swap); citing existing sections for ported
semantics (§20.3, §20.7 etc.) is right.

### 2. `tests/unit/core/document.test.js`

Unit tier (may import `src/**`), `bun:test`, following the idioms of
`tests/unit/core/manifest.test.js`. Cover at least:

- `<html>`/`<body>` attribute capture: arbitrary and `data-*` attributes,
  lowercased names, decoded values (`lang="fr"`, `data-x="a&amp;b"`), bare
  attribute → `""`, repeated attribute first-wins, absent element → `{}`.
- Title: first-wins across repeats, whitespace collapse + entity decoding,
  empty/whitespace-only → skipped (next non-empty wins; `titleTexts` shows the
  accepted list), body-placed `<title>` excluded when a head exists (and
  present in `strayMetadata`).
- Meta: arbitrary names, `property=` entries, repeated values preserved in
  order, arbitrary extra attributes preserved, `name`-vs-`property` both just
  attributes (no interpretation).
- Link: all attributes, repeated links, order.
- Base elements captured.
- Character-reference decoding in attribute values; unknown references left
  as written.
- Head scope: metadata outside head excluded from snapshot arrays; no-`<head>`
  document read whole (metas in body then count, `strayMetadata` empty).
- Headings: first-`<main>` scope, `<body>` fallback, whole-document fallback,
  ids (decoded/null), skipped levels (`h1`→`h3`) preserved flat, heading
  inside `<template>` ignored, heading outside `<main>` ignored when `<main>`
  exists.
- `visibleText`: body text absent from the snapshot (assert nothing in
  `document` contains body paragraph text) but present in
  `analysis.visibleText`; script/style/template/noscript excluded; U+00A0
  preserved (no Unicode folding here); block-boundary spacing (`<div>a<p>b</p></div>`
  → `a b`); inline elements not separated (`a<em>b</em>!` → `ab!`).
- `jsonLd`: valid block parsed, invalid block `{data: null, error}` without
  throwing, body placement still read, document order.
- `ids`: document-wide, repeats kept, order.
- `rawHrefs`: order, raw values (undecoded).
- `refresh`: first declaration wins, `content="5"` → `hasSecondPart false`,
  `content="0; url=/x.html"` parsed, none → `null`.
- `path`/`url` passthrough and defaults.

### 3. Regression safety

No existing test may change in this batch (except `manifest.js`'s internals
moving — which existing tests must not notice). The full gate must pass:

```
cd /home/user/unify
rm -f .conformance-ledger.jsonl
CLAUDECODE=1 bun test 2>&1 | tail -5
bun tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl --baseline tests/conformance/phase-gaps/baseline.txt
bun tests/conformance/check-module-graph.mjs
bun tests/conformance/check-suite-hygiene.mjs
```

## Out of scope (do not touch)

Selectors, `manifest.js`'s PageRecord fields or consumers, any `docs/` file,
`rules.tsv`, CLI flags, catalog/search modules. No conformance-spec edits —
this module is internal until the model swap batch rewrites §20.
