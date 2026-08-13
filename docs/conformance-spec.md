# unify — Conformance Specification

**Status**: v0.7.0, normative
**Role**: The implementer-grade reference. `docs/product-spec.md` defines the product; this document defines the exact behavior, rule by rule. Every worked example in this document is a test fixture: an implementation conforms when it reproduces each example's output exactly — exact in element structure, tag names, attributes and their order, and text content — with only whitespace between block-level elements waived (§3; the comparator contract is `docs/testing-strategy.md` §2), and each diagnostic at the stated severity. Where this document and the product spec appear to differ, that is a defect in the document set to be fixed — neither may be silently reinterpreted.

Conventions: "problem" and "advisory" are the only two severities (§14). MUST-level language is implied throughout; nothing here is optional. All paths in examples are relative to the source root unless prefixed `src/` or `dist/` for clarity. All files are UTF-8.

---

## 1. Definitions

- **Source root**: the directory named by `--source` (default `src/` if it exists, else the working directory).
- **Page**: a file whose extension is exactly `.html` or `.md`. No other extension is a page; `.htm` is not special and copies through like any asset.
- **Asset**: any non-page file. Assets are mirror-copied byte-for-byte to the same source-root-relative path.
- **Fragment**: any file referenced by an include. **Layout**: any `.html` file referenced by layout selection (§6).
- **Excluded**: matched by the effective `--exclude` set (§4). Excluded files are never emitted but remain build material (includable, usable as layouts).
- **Top-level element**: an element child of `<body>` (elements only; text and comment nodes cannot carry attributes).
- **Provenance**: the source file whose text contained an element's start tag. Every composed element has exactly one provenance file (the page, a layout, or an include file).
- **Emitted file**: a file present in the output tree of a successful build.

---

## 2. Build pipeline (order is normative)

For `build`, `--dry-run`, and every watch rebuild, in this order:

1. **Scan** the source tree; apply the never-shipped list (§4.3), then classify every remaining file: page or asset; excluded or emitted.
2. **Load and inline includes** (§5) for every layout and every `.html` page as it is loaded — textual, recursive, before any parsing. A `.md` page converts first, then inlines: frontmatter is read, the body is converted (§10), and its includes resolve on the converted HTML (§10.1). Same machinery, one difference (the moment), one reason: a fragment's contents are spliced verbatim in every host and never pass through the Markdown converter.
3. **Parse** each page; detect frontmatter/`<head>` misuse (§10.5).
4. **Resolve layouts** (§6) and compose each page with its layout (§7–§9).
5. **Rewrite URLs** by provenance (§11.1), then apply `--pretty-urls` (§11.2), then `--base-url` (§11.3).
6. **Compute output paths**; detect collisions (§13).
7. **Write** pages and copy assets into a temporary tree.
8. **Reference check** the temporary tree (§12).
9. **Report** all diagnostics (§14), ordered by path then line.
10. **Publish** transactionally (§15): zero problems → the output directory is updated; otherwise it is untouched.

Composition is best-effort: a problem in one page never stops the analysis of the others; all problems in the site are reported in one pass.

---

## 3. Output text rules (the splice model)

unify composes by editing spans of source text — it never reformats, re-indents, or re-serializes markup, so the author's own formatting survives composition. The rules below say **which span is replaced by what**; they are behavioral, not byte-level. **Whitespace between block-level elements is not normative**: no rule in this specification depends on the indentation or inter-element whitespace a splice happens to produce, and conformance comparison normalizes exactly that class of whitespace and nothing else — element structure, tag names, attributes and their order, and text content are compared exactly (the comparator contract is `docs/testing-strategy.md` §2).

- **S1 — Preservation.** Outside the composed regions the rules below name, source text ships as written. The layout file is the base document for a composed page; the page contributes what the rules below place into it.
- **S2 — Include splice.** The include element (start tag through matching end tag, or the void tag, or the SSI comment) is replaced by the included file's processed contents.
- **S3 — Slot fill.** The slot element is replaced by the fill elements, in page order. The consumed `slot` attribute is removed from each fill; nothing else about a fill's markup changes.
- **S4 — Slot fallback.** An unfilled slot's start and end tags are removed; its children remain, as written.
- **S5 — Children replacement** (a `<main>` receiving default content, or a sink-less layout `<body>`, §7.4–7.5). The element's children are replaced by the default content; the element itself — tag and attributes — stays.
- **S6 — Unwrap.** The page's first `<main>`'s start and end tags are removed; its children stay in place.
- **S7 — Removal.** A removed element (head dedup, replaced layout elements) is removed entirely; a removed attribute (`data-layout`, a consumed `slot`) is removed cleanly from its tag. Removal changes nothing else.
- **S8 — Head replacement in place.** A layout head element replaced under §8 has the page's element(s) take its position, in page order; the layout's other same-key elements are removed per S7.
- **S9 — Head append.** Appended head elements land at the end of the layout's head content, in page-source order.
- **S10 — Title join.** The layout `<title>`'s text becomes `pageText + " " + layoutText`, both trimmed of leading/trailing whitespace. The layout's title element (tag and attributes) is kept. Title text is text content and is compared exactly.
- **S11 — Root attributes.** The layout's `<html>`/`<body>` tags are edited in place: the `class` value becomes the layout's tokens in order followed by page tokens not already present, space-separated; an overridden attribute keeps its position with the page's value; a new attribute is appended to the tag, in page-source order.
- **S12 — Default content.** Default content (§7.2) keeps its nodes — elements, text, comments — in source order, interior text preserved as written; whitespace-only text nodes at its boundaries are not significant.

The output document's shell — doctype, `<html>`, `<head>`, `<body>` tags — is the layout's. The page's doctype and shell tags are not emitted (their attributes participate via S11). A page with no layout is emitted from its own text; for a layout-less Markdown page that text is its converted body inside the synthesized shell of §10.7.

---

## 4. File classification, exclusion, and copying

### 4.1 Exclusion globs

`--exclude` (repeatable; `unify.yaml` key `exclude`, a list) defines the exclusion set. Default: the single glob `_*`. User-supplied globs **replace** the default.

Matching semantics:

- A pattern containing no `/` is tested against **every path segment** of a file's source-root-relative path. `_*` therefore matches `_layout.html`, `blog/_draft.md`, and every file under `_includes/` or `blog/_partials/` — any path with a `_`-prefixed segment.
- A pattern containing `/` is tested against the **full source-root-relative path**, with `*` (within a segment), `**` (across segments), `?`, and `[…]` supported. `drafts/**` matches everything under `drafts/`.
- A matched directory segment excludes the entire subtree. Files inside a `_`-prefixed directory need no underscore of their own:

```
src/
├── _includes/
│   ├── nav.html          # excluded (inside a _ directory)
│   └── _legacy.html      # excluded (prefix redundant but allowed)
├── blog/
│   ├── _sidebar.html     # excluded (_ prefix required here)
│   ├── helper.html       # EMITTED — no underscore, ships as a page
│   └── post.html         # emitted (intended page)
└── _drafts/
    └── notes.md          # excluded (inside a _ directory)
```

### 4.2 The underscore guard (problem)

Replacing the default cannot silently publish the build's working files. **An emitted file that is a `_`-prefixed page, or whose path contains a `_`-prefixed directory segment, is a problem** naming the file and the `--exclude` line that fixes it:

```
src/_layout.html:1: problem: _layout.html would be published as a page
  fix: keep the underscore convention in your exclude set: --exclude '_*' --exclude 'drafts/**'
```

The guard deliberately does not cover root-level (or any-level) `_`-prefixed **non-page files**. That is the Netlify seam: on default settings `_*` excludes `_headers` and `_redirects` too, and the supported recipe is replacing the default with globs that spare them —

```bash
unify build --exclude '_*.html' --exclude '_*.md' --exclude '_includes' --exclude '_scripts'
```

— which ships `_headers`/`_redirects` (non-page files, guard passes them) while the guard still stops any `_`-page or `_`-directory the replacement missed.

**The deployment-file advisory.** The seam has a silent side: these files work by *being at the publish root* — nothing links to them, so when the exclude set holds one back the reference check (§12) has no thread to pull, and the deploy simply arrives without its headers. A **known deployment file** at the source root that the effective exclude set keeps out of the output is advisory **A14** (§14.3), naming the file and an `--exclude` replacement that ships it:

```
src/_headers: advisory: _headers is a deployment file (Netlify, Cloudflare Pages), and the exclude set ('_*') keeps it out of the output
  fix: replace the default: --exclude '_*.html' --exclude '_*.md' --exclude '_includes' --exclude '_scripts'
```

The advisory is the entire mechanism: nothing is exempted from the exclude set, the file stays held back, the build publishes, and `--strict` is what makes the miss fatal in CI. Recognition is by exact file name, at the source root only — the one place these files function on any host; a nested `blog/_headers` is ordinary excluded material and draws nothing. The recognized names are a maintained list in the implementation — one exported constant, `KNOWN_DEPLOYMENT_FILES`, one entry per file name, greppable and editable in one place — and the list is deliberately **not** enumerated as normative text: hosting providers add conventions faster than a specification is amended, so recognizing a new provider's file is a one-line code change, not a spec revision, and growth of the list is not a conformance break. Its contents today (informative, non-normative): `_headers` and `_redirects` (Netlify and Cloudflare Pages; GitLab Pages also reads `_redirects`), `_routes.json` and `_worker.js` (Cloudflare Pages). Only names the default `_*` would catch belong on it — `netlify.toml`, `vercel.json`, `CNAME`, and `.nojekyll` carry no underscore and already ship (§4.3: dotfiles ship).

### 4.3 Never-shipped list

Independent of `--exclude` and not replaceable by it, these never appear in output and are never scanned as source: the output directory (when inside the source root), `.git/`, `.hg/`, `.svn/`, `node_modules/`, `.env` and `.env.*`, and `unify.yaml`. Nothing else — dotfiles ship (`.htaccess`, `.nojekyll`). The list is literal: no scanning, no heuristics.

### 4.4 Mirror copy and symlinks

Every emitted asset is copied byte-for-byte to the same source-root-relative path. Symlinks are followed only while the resolved target stays inside the source root; a symlink resolving outside is treated as absent, with advisory A12 (§14.3).

**The defaulted-source notice.** When the source root **defaulted to the working directory** — no `--source` flag, no `source` key in `unify.yaml`, and no `src/` directory exists, i.e. the §1 default fell all the way through (the state of a directory `init` did not scaffold) — the build summary on stdout additionally reports how many files mirror copy is about to ship, and points at `--dry-run`:

```
building from the working directory (no src/ here): 3 files will be copied as-is — run unify build --dry-run to list them
```

The predicate is the CLI's own argument resolution and nothing else — no marker files, no scaffold detection (§4.3 forbids heuristics). An explicit `--source` — including `--source .` — or an existing `src/` suppresses the notice: naming a directory is declaring intent. The notice is summary text on stdout, never a diagnostic: it names no problem, does not touch the exit code, and prints for `build` and `--dry-run` alike. Its two facts — the copied-file count and the `--dry-run` pointer — are contract; the wording around them is prose (§14.1).

---

## 5. Includes

### 5.1 Resolution algorithm

For `<include src="P">…</include>`, `<include src="P">`, `<!--#include virtual="P" -->`, or `<!--#include file="P" -->` in file F:

1. `virtual="P"`: resolve P against the source root (a leading `/` is permitted and equivalent). `file="P"`: P must be relative; resolve against `dirname(F)`. `<include src="P">`: if P starts with `/`, resolve against the source root, else against `dirname(F)`.
2. The resolved path must lie inside the source root. Escaping it (`../…`) is a problem (same shape as not-found; traversal safety is internal and always on).
3. The target must exist and end in `.html` or `.md`; otherwise a problem:

```
src/index.html:8: problem: include not found: /_includes/navv.html
  in: <include src="/_includes/navv.html">
  fix: create src/_includes/navv.html, or point src at an existing file
  fix: check the path spelling and casing
```

4. A `.md` target is converted to HTML first (frontmatter stripped and ignored, heading ids applied per §10.4); an `.html` target is used verbatim.
5. The target's own includes are processed recursively before splicing (S2). Cycle detection uses the resolved-path stack; **depth cap 10, inclusive**: the stack may hold ten include files at once — a chain ten deep builds, and the include that would push an eleventh is the problem. Both violations are problems that print the full chain:

```
src/_layout.html:7: problem: include cycle: _layout.html → _includes/nav.html → _layout.html
```

6. An `<include>` without `src` is a problem. An `<include>` with non-whitespace content between its tags is a problem — includes are verbatim and never take fills:

```
src/index.html:9: problem: <include> takes no content — the file's contents replace the element
  in: <include src="/_includes/card.html"><h3>My title</h3></include>
  fix: includes are not components; put page content in the page, or generate variants with a script (_scripts/)
```

7. The void form (no closing tag) builds identically and carries advisory A01 (§14.3).

Inlining is textual and happens before parsing, so an include may appear anywhere — `<head>` included — and a fragment's top-level elements become the host's (a fragment included at body top level may therefore carry `slot=` fills, and a fragment included in a layout body may contribute `<slot>` elements; both are consequences of this ordering, not extra rules). In a Markdown page the same textual inlining runs on the converted HTML (§10.1); the timing is the only difference.

### 5.2 Fixture — nested include with relative resolution

`src/index.html`:
```html
<!doctype html>
<html>
  <head><title>Home</title></head>
  <body data-layout="none">
    <include src="/_includes/card.html"></include>
  </body>
</html>
```

`src/_includes/card.html`:
```html
<div class="card">
  <include src="badge.html"></include>
</div>
```

`src/_includes/badge.html` (note: resolved relative to `card.html`):
```html
<span class="badge">New</span>
```

`dist/index.html`:
```html
<!doctype html>
<html>
  <head><title>Home</title></head>
  <body>
    <div class="card">
  <span class="badge">New</span>
</div>
  </body>
</html>
```

(Each spliced file keeps its own indentation — S1/S2; unify never re-indents. `data-layout` is removed per §6.4/S7.)

---

## 6. Layout resolution

### 6.1 Selection (first match wins)

1. `data-layout="none"` on the page's `<html>` or `<body>`, or frontmatter `layout: none` → no layout. Includes and URL rules still apply.
2. `data-layout="V"` on the page's `<html>` or `<body>` → explicit layout V.
3. Frontmatter `layout: V` → explicit layout V.
4. Walk from the page's directory up to the source root; the first `_layout.html` found applies. (Discovery is by name; the file's excluded status is irrelevant.)
5. Otherwise: no layout; the page is emitted as-is.

An explicit V other than `none` must be a path ending in `.html`: `/`-prefixed resolves from the source root, anything else relative to the declaring file. A value without a `.html` extension is a problem (before any existence check):

```
src/about.md:2: problem: layout is not a path: "default"
  fix: layouts are paths — write layout: /_layout.html (or a relative path ending in .html)
```

A path that resolves to no file, or escapes the source root, is a problem with the include-not-found shape (§5.1 step 3), including the casing line.

Layout-less emission, both routes (step 1's opt-out and step 5's nothing-found): an `.html` page is emitted from its own text (§3); a `.md` page is emitted inside the minimal synthesized shell of §10.7.

### 6.2 No chaining

Layout chaining is not part of v0.7.0. **A layout that itself declares `data-layout` — any value, including `"none"` — is a problem (P15)**, located, naming the layout file and stating plainly that chaining is not supported; it is never a silent no-op:

```
src/blog/_layout.html:6: problem: this layout declares data-layout — layout chaining is not supported in v0.7.0
  fix: make blog/_layout.html a complete standalone layout, or delete it so pages use /_layout.html
```

A section that wants its own chrome writes a complete `_layout.html` in its directory — the discovery walk (§6.1 step 4) already scopes it to that section. Chaining is a recorded future candidate (product spec §6) and returns only on demonstrated demand.

### 6.3 Misplacement and migration (problems)

- `data-layout` on any element other than `<html>`/`<body>`: problem naming `<include src="…">` as the replacement — `data-layout` is never a component import.
- Any `data-unify` attribute, and any class token beginning `unify-`, anywhere in any source file — **excluded files included**: excluded files are build material (§1) and are scanned like everything else; only the never-shipped list (§4.3) escapes scanning. A retired spelling in an excluded fragment or draft would otherwise sit silently meaning something else until the day the file is included or published. Problem naming the v0.7.0 spelling —

```
src/index.html:2: problem: data-unify is the v0.6 spelling
  fix: write data-layout="/path.html" (or data-layout="none") on <html> or <body>
src/_layout.html:14: problem: class "unify-footer" is the v0.6 area vocabulary
  fix: mark the region with <slot name="footer">…</slot> in the layout and slot="footer" on the page element
```

### 6.4 Consumed attributes

`data-layout` never appears in output (removed per S7, including the `"none"` form). The `slot` attribute consumed by a fill is removed per S3. A `<script>` tag carrying `data-polyfill` is removed entirely from built output (the author-signed design-time aid; product spec §6.3).

---

## 7. Composition: the merge

For each page: C is the page document (after includes and Markdown conversion), L its selected layout (§6.1).

### 7.1 Sink detection

L's **sinks** are the `<slot>` elements in L's `<body>` (skipping any inside `<template>`), plus L's first `<main>`. If L's body has no slot and no `<main>`, L is **sink-less** (§7.5).

- The first bare `<slot>` (no `name`) is **the default slot**. Further bare slots: advisory A13 (duplicated construct), and they render their fallback.
- The first `<slot name="X">` for each X receives X's fills. A repeated name: advisory A13; later ones render their fallback.
- A `<slot>` outside a layout's `<body>` (a slot anywhere in a page, or in a layout's `<head>`) is a **problem (P20)**; it is still replaced by its own children (S4), so best-effort composition (§2) produces a tree to report on. Such a slot is inert in every case — a page fills a layout's slot with the `slot=` attribute, and a slot in a head is never a sink — and the message names the spelling that belongs in *that* file:

```
src/contact.html:4: problem: <slot> in a page fills nothing — only a layout declares slots
  fix: to fill a layout slot, put slot= on a real element: <footer slot="footer">…</footer>
```

This was advisory A04 until 2026-08-13. Ratification round 7 had three of five samples write `<slot name="footer">` into a page — the layout-side spelling, in the file that cannot use it — and under the advisory a plain `unify build` published every one of them at exit 0, carrying the layout's fallback footer *and* the intended replacement loose in the body. Nothing was lost, so the content-loss law was satisfied and the author's intent still silently did not happen. Every sibling misplacement of this vocabulary (P07, P15, P16, P19) was already a problem; this one was the outlier, and `A04` is now a retired ID.
- Duplicate `<main>` in L: the first wins; advisory A13.
- **Slots do not nest.** A `<slot>` anywhere inside another `<slot>` element — that is, inside a slot's fallback content — is a **problem (P16)**, located: fallback content is plain markup, and a nested slot would silently vanish (or strand its fills) the moment the outer slot is filled, which the content-loss law forbids:

```
src/_layout.html:8: problem: <slot name="inner"> is nested inside the fallback of <slot name="outer"> — slots do not nest
  fix: move the inner slot out of the outer slot's fallback, or drop one of them
```

### 7.2 Preparing C's content

If L has at least one sink: C's body content is **unwrapped once** — the first `<main>` in C's body in document order, **at any depth, not only top level**, is replaced by its children (S6): a `<main>` inside a wrapper `<div>` unwraps and the wrapper stays. Exactly once — a `<main>` inside the first one is the author's own markup and survives. No other element is unwrapped. (Top-level-only unwrap would ship `<main>`-inside-`<main>` for the common wrapper pattern; unwrapping the first one anywhere is what keeps composed output valid.)

**Fills** are then collected: every top-level element of C's body carrying a `slot` attribute with a non-empty value. (`slot=""` counts as absent. `slot` on non-top-level elements is the author's own markup and is never touched or reported.) Fill elements are removed from the default-content sequence.

**Default content** is everything else in C's body — elements, text, comments — in source order (S12).

### 7.3 Filling

For each name X with fills: `<slot name="X">` is replaced by the fills in page order (S3). A fill whose name matches no slot in L: advisory A02, its `slot` attribute is consumed, and the element stays in place in the default-content sequence — nothing is lost.

Each unfilled named slot is replaced by its own children (S4). Fallback content is plain markup — a `<slot>` inside it is P16 (§7.1), so no recursive processing exists. Slots inside `<template>` are never touched and ship as written.

### 7.4 Routing default content

- L has a default slot → the default content replaces it (S3, S12). If the default content is empty, the default slot renders its fallback (S4).
- No default slot, L has `<main>` → the default content replaces `<main>`'s children (S5). If the default content is empty, `<main>` keeps its children (the layout's default persists). The sink `<main>` is L's first in document order, at any depth — the same search §7.2 uses for the page's own `<main>`.
- No default slot, and a named `<slot>` sits inside that `<main>` → **problem** (**P19**). The two rules would target overlapping spans: this bullet replaces `<main>`'s children wholesale, while §7.3 fills or falls back that slot. Resolving it either way loses something silently — swallow the slot and a page's fill vanishes against the content-loss law; honor it and the sink is no longer wholesale — so the layout is ambiguous and says so:

```
src/_layout.html:6: problem: named slot "hero" is inside <main>, which is also the default-content sink
  fix: add <slot></slot> inside <main> — then main's other children are left alone (§7.7 C6)
  fix: or move <slot name="hero"> outside <main>
```

  A bare `<slot>` inside `<main>` is the supported way to have both, and carries no such ambiguity: it marks exactly where default content lands, and everything else in `<main>` — named slots included — is untouched.
- No default slot, no `<main>`, L has named slots, and the default content is non-empty → **problem** (content would vanish):

```
src/about.html:1: problem: page content has nowhere to land in _layout.html
  fix: add <slot></slot> or <main> to the layout, or address the content to a named slot
```

Every message about a slot or a layout names the layout file it was checked against.

### 7.5 Sink-less layouts

A layout with no slots and no `<main>` treats its whole `<body>` as the default slot: C's body children replace L's body children verbatim (S5, **no unwrap** — C's own `<main>` survives). The head-only layout (shared stylesheet, empty body) is the intended use and is legitimate, not a mistake.

### 7.6 Advisory on stray chrome

When a page composes with a layout, a top-level `<header>` or `<footer>` element left in the default content is advisory A03 (it probably meant `slot=`). It still ships, in place, per the content-loss law.

**The law**: content the author wrote is never dropped without failing the build. Every rule above either places content or raises a problem; no future rule may do otherwise.

### 7.7 Fixtures

#### C1 — golden path: `<main>` default with unwrap

`src/_layout.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>— My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <main>
      <p>Page content appears here.</p>
    </main>
  </body>
</html>
```

`src/index.html`:
```html
<!doctype html>
<html>
  <head>
    <title>Home</title>
  </head>
  <body>
    <main>
      <h1>Welcome!</h1>
      <p>Hello.</p>
    </main>
  </body>
</html>
```

`dist/index.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Home — My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <main>
      <h1>Welcome!</h1>
      <p>Hello.</p>
    </main>
  </body>
</html>
```

(The page's `<main>` was unwrapped (S6); its children replaced the layout `<main>`'s children (S5); the title joined (S10).)

#### C2 — named slot: replace the element

`src/_layout.html` body contains:
```html
  <body>
    <main>
      <p>Page content appears here.</p>
    </main>
    <footer class="site-footer">
      <slot name="footer"><p>© My Site</p></slot>
    </footer>
  </body>
```

`src/contact.html` body:
```html
  <body>
    <h1>Contact</h1>
    <p slot="footer">© My Site — <a href="mailto:hi@example.com">email us</a></p>
  </body>
```

`dist/contact.html` body:
```html
  <body>
    <main>
      <h1>Contact</h1>
    </main>
    <footer class="site-footer">
      <p>© My Site — <a href="mailto:hi@example.com">email us</a></p>
    </footer>
  </body>
```

(The slot element was replaced by the page's element with the `slot` attribute consumed (S3); the wrapper `<footer class="site-footer">` persisted because the slot sat inside it — the layout author chose the boundary by placement.)

#### C3 — unfilled slot renders its fallback

Same layout as C2; `src/about.html` body is `<h1>About</h1>` only. `dist/about.html` body:
```html
  <body>
    <main>
      <h1>About</h1>
    </main>
    <footer class="site-footer">
      <p>© My Site</p>
    </footer>
  </body>
```

(S4: slot tags removed, inner bytes kept.)

#### C4 — multiple fills, one name, page order

Layout body: `<slot name="aside"><p>Default</p></slot>`. Page body top level, in this order: `<p slot="aside">One</p>`, `<h1>Title</h1>`, `<p slot="aside">Two</p>`. The slot is replaced by:
```html
<p>One</p>
<p>Two</p>
```
(fills land in page order — S3; whitespace between them is not significant, §3). `<h1>Title</h1>` is default content.

#### C5 — fill to a slot that doesn't exist

Layout has only `<main>`. Page body: `<h1>Hi</h1>` then `<p slot="footer">Mine</p>`. Diagnostics:
```
src/page.html:7: advisory: no slot named "footer" in _layout.html; the element stayed in the page content
```
`<main>` receives:
```html
<h1>Hi</h1>
<p>Mine</p>
```
(the `slot` attribute is consumed; the element keeps its position in the default sequence; nothing is lost; build publishes.)

#### C6 — bare slot inside `<main>`: pinning without a rule

Layout:
```html
  <body>
    <main>
      <slot name="hero"><section class="hero">Default hero</section></slot>
      <slot></slot>
    </main>
  </body>
```

Page body: `<h2 slot="hero">Big launch</h2>` and `<p>Body text.</p>`. Output body:
```html
  <body>
    <main>
      <h2>Big launch</h2>
      <p>Body text.</p>
    </main>
  </body>
```

A page supplying only `<p>Body text.</p>` keeps the layout's default hero:
```html
    <main>
      <section class="hero">Default hero</section>
      <p>Body text.</p>
    </main>
```

When a layout has a default slot, `<main>`'s other children are never touched — the bare slot is the sink, so persistent (pinned) content is simply markup the layout wrote outside the slot.

#### C7 — a layout that declares `data-layout` is a problem

`src/blog/_layout.html`:
```html
<!doctype html>
<html>
  <head><title>— Blog</title></head>
  <body data-layout="/_layout.html">
    <main>
      <aside>Blog sidebar</aside>
      <slot></slot>
    </main>
  </body>
</html>
```

With any page under `blog/` (and the C1 site `src/_layout.html` present), the build reports P15, publishes nothing, and exits 1:

```
src/blog/_layout.html:4: problem: this layout declares data-layout — layout chaining is not supported in v0.7.0
  fix: make blog/_layout.html a complete standalone layout, or delete it so pages use /_layout.html
```

A section gets its own chrome by writing a *complete* layout in its directory — the discovery walk (§6.1 step 4) already scopes it to the section, and the accepted cost is that shared chrome is written out in each layout that wants it. Chaining is a recorded future candidate (product spec §6).

#### C8 — sink-less layout: head-only passthrough

`src/_layout.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
  </body>
</html>
```

Page C1's `index.html` composes to:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="/assets/style.css">
    <title>Home</title>
  </head>
  <body>
    <main>
      <h1>Welcome!</h1>
      <p>Hello.</p>
    </main>
  </body>
</html>
```

(No unwrap — the page's `<main>` survives (§7.5) and ships as written. The layout had no `<title>`, so the page's title appended at the end of the head (S9).)

#### C9 — slots inside `<template>` are never unify's

A layout containing
```html
    <template shadowrootmode="open"><slot name="x"><p>shadow default</p></slot></template>
```
ships those bytes unchanged, and a page fill `slot="x"` matching only that slot gets advisory A02 (no slot named "x" *of the layout's*).

---

## 8. Head merge

Start from the layout's `<head>`; apply, in this order:

| # | Page head element | Key | Behavior |
|---|---|---|---|
| 1 | `<meta charset>` | — | Dropped in favor of the layout's, which stays first. If the layout declares none, the page's is kept and moved to the head's first position. Identical values: silent. Different values: advisory A08. |
| 2 | `<title>` | — | Joined per S10: page text + `" "` + layout text, in the layout title's position. Page title with empty/whitespace-only text = absent. Layout with no `<title>`: the page's title appends (row 7) with its own text. |
| 3 | `<meta name="…">`, `<meta property="…">` | the `name`/`property` value, ASCII case-insensitive | Replaces in place (S8): all layout elements with the key are removed, the page's take the first one's position in page order. Multiple page elements with one key are all kept (`og:image` is legitimately plural) — dedup only crosses the layout/page boundary, never within one source. `http-equiv` metas are not keyed; they append (row 7). |
| 4 | `<link rel="canonical">` | `canonical` ∈ rel tokens | Replaces in place (S8). **One canonical, never two** — this closes the doubled-canonical defect. |
| 5 | `<link rel="icon">` (rel token list contains `icon`, ASCII case-insensitive — covers `shortcut icon`) | `icon` | Replaces in place (S8): all the layout's icon links are removed; the page's icon set takes the first one's position. `apple-touch-icon` is a different token and is not keyed. |
| 6 | `<link rel="stylesheet">`, `<script src>` | the URL, **compared after §11.1 resolution** | If the resolved URL equals a layout head reference's resolved URL, the page copy is dropped (S7) — the layout's position stands. A page `assets/style.css` and layout `/assets/style.css` are one reference. Inline `<script>`/`<style>` with byte-identical content: the page copy is dropped. |
| 7 | Everything else | — | Appended after the layout's head content, in page-source order (S9) — page CSS loads last and wins the cascade. |

### 8.1 Fixture — the whole table at once

`src/_layout.html` head:
```html
  <head>
    <meta charset="utf-8">
    <title>— My Site</title>
    <meta name="description" content="A site.">
    <link rel="canonical" href="https://example.com/">
    <link rel="icon" href="/favicon.ico">
    <link rel="stylesheet" href="/assets/style.css">
  </head>
```

`src/deep/page.html` head (page sits in `deep/`):
```html
  <head>
    <meta charset="utf-8">
    <title>Page</title>
    <meta name="description" content="This page.">
    <link rel="canonical" href="https://example.com/deep/page.html">
    <link rel="stylesheet" href="../assets/style.css">
    <link rel="stylesheet" href="page.css">
  </head>
```

`dist/deep/page.html` head:
```html
  <head>
    <meta charset="utf-8">
    <title>Page — My Site</title>
    <meta name="description" content="This page.">
    <link rel="canonical" href="https://example.com/deep/page.html">
    <link rel="icon" href="/favicon.ico">
    <link rel="stylesheet" href="/assets/style.css">
    <link rel="stylesheet" href="page.css">
  </head>
```

Row by row: identical charset silent; title joined; description replaced in place; canonical replaced in place (one canonical); icon kept (page declared none); the page's `../assets/style.css` *resolves* to `/assets/style.css` — a duplicate of the layout's, so the page copy is dropped (row 6 compares after resolution); `page.css` is appended **as written** (row 7) — it is page-authored, the output file sits at the page's mirrored path, so it is already correct (§11.1; only comparison uses the resolved form, emission does not rewrite page-authored URLs).

---

## 9. Root attributes

On `<html>` and `<body>` only (S11): the page's class tokens are appended to the layout's (duplicates not repeated); any other attribute the page sets wins (edited in place if the layout had it, inserted before `>` otherwise). `data-layout` and consumed `slot` attributes are removed before this merge. A page cannot remove a layout attribute — there is no mechanism, by design. Attributes merge nowhere else.

Fixture: layout `<body class="site">` + page `<body class="home" data-theme="dark">` → `<body class="site home" data-theme="dark">`.

---

## 10. Markdown

### 10.1 Conversion

CommonMark, no extensions in v0.7.0 beyond §10.4 heading ids and the include-block rule below. Output filename swaps `.md` for `.html`. Layout rules then apply exactly as for an HTML page whose body is the converted output and whose head is synthesized from frontmatter.

**Include timing — conversion first.** In a `.md` page, includes resolve **after** conversion: include tags and SSI comments pass through the converter as raw HTML, then resolve normally (§5) on the converted output. The order is the point, twice over. First, the fragment's contents are spliced verbatim in every host — never run through the Markdown converter — so an HTML fragment is never mangled by blank-line or indentation rules, and a `.md` include target converts exactly once, on its own (§5.1 step 4). Second, include syntax inside a code fence or code span is escaped to text by conversion, so it is content, never a directive — a Markdown page can document `<include>` itself. Pre-conversion textual inlining (§2's order for HTML) would break both.

What survives conversion where is decided by CommonMark's raw-HTML rules, plus one converter extension so the taught form works: **a line beginning with `<include` starts an HTML block, exactly as if `include` were on CommonMark's block-tag (type 6) list**, ending at the next blank line. Consequences, normative: an `<include>` element or `<!--#include -->` comment starting a line is a block — it passes through outside any paragraph, so block-level fragment content splices clean, never `<p>`-wrapped; an include written inside a paragraph's text is inline raw HTML, and its contents splice inside that paragraph, where inline fragments belong.

### 10.2 Frontmatter

YAML between `---` fences at the very start of the file.

| Key | Behavior |
|---|---|
| `title` | The page's `<title>` (then §8 row 2). |
| `layout` | Layout selection (§6.1): a path ending `.html`, or `none`. |
| `class` | Class tokens added to the page's `<body>` (§9). |
| `lang`, `dir` | Set on `<html>` (§9). |
| a key named `og:…` | `<meta property="KEY" content="VALUE">` |
| any other key | `<meta name="KEY" content="VALUE">` |
| a list value | one `<meta>` per item, in order |

**A key's name decides its output; the YAML shape used to spell it does not.** A nested block is sugar for prefixed keys — `og:` with `image:` indented under it names the key `og:image`, identical in every respect to writing `og:image:` flat, and both emit `property="og:image"`. The same holds for any other prefix (`twitter:` written either way names `twitter:card`, which is not `og:` and so emits `name=`). Both spellings are valid YAML and both are supported deliberately: `og:image: /card.png` is what most authors and every frontmatter ecosystem write, and a spec that accepted it as a key while silently emitting `name=` would produce a meta tag that looks right, builds clean, and is ignored by every scraper — the failure class §14 exists to prevent.

Synthesized elements merge by §8 exactly as if the page had written them; their serialization is fixed: double-quoted attributes, `name`/`property` first, then `content` (`<meta name="description" content="…">`), and `<title>TEXT</title>`. Two consequences of "as if the page had written them", stated because implementations otherwise diverge: a present-but-empty `title:` counts as absent, so §10.3's `<h1>` fallback applies to it exactly as §8 row 2 treats an empty page `<title>`; and `class` takes a string — any other value is treated as absent rather than coerced. A `.md` file included as a fragment has its frontmatter stripped and **never validated** (§5.1 step 4): the data is provably unused, and a shared fragment must not make an unrelated page's build depend on the shape of metadata nobody reads. There are no other reserved keys: `date`, `tags`, `categories`, `draft`, `permalink`, `slug` have no behavior and become plain metas — `draft: true` publishes the page; a leading underscore is how a page is held back. The honest gap, stated: frontmatter cannot express `rel="canonical"`, `rel="preload"`, or JSON-LD — put those in the layout, or write the page in HTML.

**Value serialization.** VALUE is the value's text, by YAML form. A **plain scalar** serializes as its source text, exactly as written — `draft: true` → `content="true"`, `date: 2026-01-01` → `content="2026-01-01"`, `weight: 0.50` → `content="0.50"`: no type coercion ever rewrites a value (booleans don't normalize, dates don't reformat, numbers keep their zeros — the author's bytes, not YAML's data model). A **quoted scalar** serializes as its content with the quotes gone (`note: "Colons: fine"` → `content="Colons: fine"`); a **block scalar** (`|`, `>`) as the string YAML defines; an **empty value** as the empty string. The list rule composes with blocks: a list under `og:image` emits one `property="og:image"` meta per item, in order. What has no text form is a problem, located at the key (**P17**): a mapping nested below a key that already names one, or a list item that is itself a mapping or list. Because the two spellings name the same key, **eligibility is decided by the key's name, not by nesting depth**: a block under `og:image:` is P17 exactly as `og:` → `image:` → `url:` is, since the effective key `og:image` already carries its prefix and there is nothing left to flatten into. Counting recursion levels instead would let the flat spelling through and reject the block one, which would break the equivalence above. Inventing a serialization or dropping the value would each be a silent lie:

```
src/post.md:4: problem: frontmatter og:image is a nested block — frontmatter flattens one level
  fix: give og:image a single value (og:image: /assets/a.jpg) or a list of values
```

### 10.3 Title fallback

No frontmatter `title` → the text content of the first `<h1>` in the converted body (inline markup stripped: `# About *us*` → `About us`). Neither → no page title; the layout's stands alone.

### 10.4 Heading ids

Every converted heading (`h1`–`h6`) without an explicit `id` gets one derived from its text: lowercase; each run of whitespace becomes one hyphen; every remaining character that is not a letter, digit, or hyphen is dropped (Unicode letters and digits are kept); leading and trailing hyphens trimmed; a repeat within the page gets `-2`, `-3`, …. Fixtures: `Getting Started` → `getting-started`; `C++ & Rust!` → `c--rust` (the two space-hyphens survive; `+`, `&`, `!` drop — this matches GitHub's slugger); `Café menü` → `café-menü`; two `Setup` headings → `setup`, `setup-2`. HTML pages are never touched: unify does not rewrite headings the author wrote.

### 10.5 Two hard errors

- Frontmatter (`---` fence at byte 0) in an `.html` page: **problem** — `HTML pages have no frontmatter; use <head> (frontmatter here would render as visible text)`.
- A literal `<head>` element in a Markdown body: **problem** — `Markdown pages have no <head>; use frontmatter (this element would land in the body)`.

### 10.6 Fixture — Markdown end to end

`src/about.md` (with the C1 layout):
```markdown
---
description: Who we are
og:
  image: /assets/team.jpg
---

# About

Text here.

# About

More.
```

`dist/about.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>About — My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
    <meta name="description" content="Who we are">
    <meta property="og:image" content="/assets/team.jpg">
  </head>
  <body>
    <main>
      <h1 id="about">About</h1>
<p>Text here.</p>
<h1 id="about-2">About</h1>
<p>More.</p>
    </main>
  </body>
</html>
```

(Title from the first `<h1>` (§10.3); synthesized metas appended (§8 row 7, S9); the converted body is the default content — its line breaks are the converter's, shipped as written, and not significant between blocks (§3).)

### 10.7 The layout-less shell

A `.md` page that resolves to no layout (§6.1 steps 1 and 5) is emitted inside a **minimal synthesized shell**. The reason is stated because the alternative was considered: conversion output is a body fragment, and a fragment shipped as a page is not an HTML document — no doctype means quirks mode, and the synthesized head elements would have nowhere to land. The shell is exactly:

- the `<!doctype html>` doctype;
- `<html>`, carrying frontmatter `lang`/`dir` when present;
- `<head>`, containing `<meta charset="utf-8">` first (all source files are UTF-8 — the conventions above — so declaring it is fact, not invention), then the page's `<title>` when one exists (§10.2/§10.3; no `title` key and no `<h1>` means no title element), then the synthesized metas in frontmatter source order;
- `<body>`, carrying frontmatter `class` when present, whose content is the converted body.

Nothing else is synthesized — no viewport meta, no stylesheet: opting out of the layout is opting out of shared chrome, and unify does not invent content. Whitespace between the shell's elements is not normative (§3).

Fixture — `standalone.md`, with a site `_layout.html` present that the page opts out of:

```markdown
---
layout: none
lang: en
class: solo
description: Standalone page
---

# Standalone

No layout wanted.
```

`dist/standalone.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Standalone</title>
    <meta name="description" content="Standalone page">
  </head>
  <body class="solo">
    <h1 id="standalone">Standalone</h1>
<p>No layout wanted.</p>
  </body>
</html>
```

(Title from the first `<h1>`; `layout: none` is consumed, never a meta; the reserved keys landed on the shell's own root elements exactly where §10.2 sends them.)

---

## 11. URLs

### 11.1 Provenance rewriting

Applies to every URL in `href`, `src`, `srcset` (each URL in the comma-separated list, descriptors untouched), and `poster`, in the composed page — after includes and layouts, before §11.2/§11.3. Skipped entirely: URLs with a scheme or `//` prefix, `mailto:`/`tel:`/`data:`/`javascript:`, fragment-only (`#x`), and empty values. Never reached: `url()` inside `<style>` blocks or `style` attributes — a `url()` written in a layout or fragment must be root-relative or live in a stylesheet file (mirror copy keeps stylesheet-internal references working untouched).

Per URL `u` in an element whose provenance (§1) is file `A`:

- `u` starts with `/` → unchanged.
- `u` is relative and `A` is a **layout or include file** → resolved against `dirname(A)`, emitted root-relative: `/` + the normalized source-root-relative path.
- `u` is relative and `A` is the **page itself** → left exactly as written (the output file sits at the mirrored path, so it is already correct) — unless the page's output location moved (`--pretty-urls`, §11.2), in which case it is resolved against `dirname(A)` and emitted root-relative.

Fixture: `src/_includes/nav.html` contains `<img src="logo.png">` and `<a href="/about.html">`. Included (via the layout) into `src/deep/page.html`, the output contains `<img src="/_includes/logo.png">` and `<a href="/about.html">`. (And `/_includes/logo.png` is excluded by default, so the reference check then reports it — an image stranded in an underscore folder fails loudly, §12.)

### 11.2 `--pretty-urls`

**Files**: every page output `X.html` moves to `X/index.html`, except any `index.html` (already pretty) and the root `404.html` (hosts require that exact path). `about.md` → `about.html` → `about/index.html`.

**Links**: after §11.1, every internal URL that resolves to an emitted page's `.html` output is rewritten to the page's pretty URL — resolve first (against provenance), then transform, emit root-relative:

| Written (in a root-level page) | Emitted |
|---|---|
| `./about.html` | `/about/` |
| `/blog.html` | `/blog/` |
| `index.html` | `/` |
| `docs/guide.html` | `/docs/guide/` |
| `./contact.html?form=1` | `/contact/?form=1` |
| `/blog.html#latest` | `/blog/#latest` |
| `sub/index.html` | `/sub/` |
| `/404.html` | `/404.html` (never moved, never transformed) |

Preserved untouched: external URLs, `mailto:`/`tel:`/`data:`, fragment-only links, and URLs to non-page files (`/assets/doc.pdf`, `/style.css`). Query and fragment always survive transformation. In a **moved** page, every remaining relative URL (to assets etc.) is emitted root-relative per §11.1, so `![diagram](diagram.png)` beside a Markdown page keeps working.

### 11.3 `--base-url`

**One form: the site's whole address**, scheme and domain included (`https://example.com/repo/`). Its **path part** prefixes every root-relative URL in `href`/`src`/`srcset`/`poster` of emitted HTML, plus root-relative values in `<meta property="og:*">`/`<meta name="twitter:*">` `content` — one list, so no root-relative URL the output declares can dodge the prefix. Its **origin** is additionally prepended to the og:/twitter: `content` values and the `<link rel="canonical">` `href` — the elements crawlers require to be absolute. Absolutization is therefore always **origin + path prefix**: with `--base-url https://host/repo/`, an og:image of `/assets/x.jpg` emits `https://host/repo/assets/x.jpg`, never `https://host/assets/x.jpg` — origin-only absolutization would 404 for exactly the crawlers the rule exists for. Values that are not root-relative are untouched. Source files stay rooted at `/`; only output changes.

A bare path (`--base-url /repo-name/`) is a **usage error** (exit 2) naming the full form. It was accepted until 2026-08-13, prefixing links correctly while leaving og:/twitter:/canonical root-relative — which the rationale above makes unusable, since a crawler fetches those with no page address to resolve them against. Ratification made the cost measurable: seventeen of eighteen samples handed a full deploy address chose the bare path anyway, and five of five then published dead preview images with a green build and a report claiming the sharing requirement verified. A diagnostic was tried first (advisory A15, retired the same day it was added); deleting the weaker form is the repair that leaves nothing to warn about.

Order within the pipeline: §11.1 → §11.2 → §11.3.

---

## 12. The reference check (post-build, publish-blocking)

After the temporary tree is complete, every internal URL the output contains is checked against the emitted files — not only the ones rewriting touched:

- In every emitted HTML file: all `href`, `src`, `srcset`, `poster` values; `<link>` `href` for every rel; root-relative `content` values of `og:*`/`twitter:*` metas.
- In every emitted CSS file, every `<style>` block, and every `style` attribute of emitted HTML: `url(…)` tokens. (Rewriting deliberately never reaches these — §11.1 — but checking is not rewriting: the exemption is about not editing the author's CSS, not about not reading it, and a `url()` the author got wrong must fail here, not 404 quietly.)

A URL is internal when, after stripping the `--base-url` prefix — the path prefix, or the full base (origin + path) when a full URL was given, so values §11.3 absolutized stay checkable instead of masquerading as external — it is root-relative or relative (resolved against the containing output file's URL). Query and fragment are stripped; external/`mailto:`/`tel:`/`data:`/fragment-only URLs are skipped. A directory URL (trailing `/` or empty path) checks for `index.html` within it. A URL that resolves to no emitted file is a **problem** naming the source file, the reference, and the line where known — a renamed page, an asset stranded in an underscore folder, a hand-written pretty URL in a non-pretty build, and a path whose case doesn't match the file all fail here, loudly. (Case is compared exactly, byte for byte: a reference that only matches case-insensitively still fails — it would 404 on the Linux host.) `#fragment` targets are not validated against ids — that is a reader's judgment, not a build gate.

One absence is **not** reported: a URL that resolves to the output path of a **source page that exists but failed to compose**. That page emitted no file because of a problem of its own — already reported, and already blocking the publish — so a second diagnostic located at the *link* sends the author to a correctly-spelled path in the wrong file, and, diagnostics being path-ordered, usually prints above the one problem that matters. Measured on a twenty-page site with one page failing to compose: twenty-one problems printed, one of them real, the real one last. A reference to a target with no source file at all, and a reference to a source file that exists but is *excluded* (the stranded underscore asset above), are not this case and still fail here, loudly.

---

## 13. Output paths and collisions

| Case | Example | Severity |
|---|---|---|
| Two sources, one output path | `about.html` + `about.md` → `about.html` | **problem**, naming both sources |
| `--pretty-urls` move lands on another source's output | `about.html` → `about/index.html` while `about/index.md` exists | **problem**, naming both sources |
| Two outputs differing only by letter case | `About.html` + `about.html` | advisory A11 (they collide on case-insensitive hosts) |

Pages and assets cannot collide with each other by construction: `.html`/`.md` are always pages, everything else is always an asset, and mirror copy is path-preserving. Collisions are detected before any write; there is no last-write-wins anywhere in unify.

---

## 14. Diagnostics

### 14.1 Contract

Two severities exist: **problem** (blocks publish; exit 1) and **advisory** (never affects what is published; with `--strict`, affects the exit code). There is no third word — never "warning", "error:", or rule codes. Exit codes: `0` published (with `--dry-run`: would have); `1` problems found — nothing published, previous output untouched — **or**, under `--strict`, advisories alone, which change the exit code *without* changing what was published; `2` invalid usage or fatal environment error (unknown flag, missing source directory, the `--clean` containment refusal, a port already in use). The `--strict` distinction is deliberate and is stated the same way in product-spec §4: a stray `.psd` must never cost you a publish, so `--strict` gates CI without withholding the site.

Diagnostics go to stderr; the build summary and `--dry-run` list go to stdout; both ordered by path, then line — two runs over the same tree print the same bytes. **Internally a diagnostic's `file` is source-root-relative; it is made relative to the working directory once, immediately before printing.** Every example in this document shows the printed form (`src/about.html:12: …`), which is why the two look different — stated because two independent implementations each had to derive it, and a third should not have to. Modules that never see the working directory therefore emit root-relative paths and are correct to. Every diagnostic line begins `FILE:LINE: SEVERITY: ` (line omitted when unknown: `FILE: SEVERITY: `). That prefix and the severity token are stable contract; the message after them is prose and is not — the diagnostic examples throughout this document fix the prefix and the shape, and their message wording is illustrative. Continuation lines are indented two spaces: `in:` (the offending source text) and `fix:` (one edit per line; path-shaped messages always include `fix: check the path spelling and casing`). Cycle and depth messages print the full chain with ` → `. `DEBUG=1` adds stack traces.

Location attribution is fixed, not stylistic: a cycle or depth problem locates at the **outermost include site** — the file and line of the include element where expansion entered the chain; a collision problem at the **path-ordered first** of the colliding sources; a reference problem (§12) at the reference's **provenance file** (§1; for a `url()` in a CSS file, that file), at its line there when known; and every other located diagnostic — §6's layout selection, §7's composition, §8's charset advisory, §12's references — at the **provenance file** of the offending markup, at its line *in that file*. The examples throughout this document already follow these conventions; they are contract, so two implementations point the author at the same place.

That last clause has a consequence worth stating outright, because implementations reach it late: composition runs on include-inlined text (§2 step 2), so an offset in the text a composer holds is **not** a position in the file that text is attributed to — every line a fragment splices in above a fault shifts it, routinely past the end of the file the message names. A `<slot>` or a duplicate sink an include contributed is therefore reported **in the fragment that wrote it**, at its line there, never at the host's post-inlining line, which is a position no source file has and which a differently-implemented composer would number differently. Combined with deduplication below, one such fault in a fragment consumed by twenty pages is one diagnostic naming one line of one file.

**A line is omitted rather than guessed.** Where a position cannot be mapped back to a line of the named file, the `FILE: SEVERITY:` form of DIA-06 is required, not a plausible-looking number: a Markdown page converts before its includes inline (§10.1), so an offset attributed to a `.md` source indexes converted HTML and no line of the author's file corresponds to it. Printing the nearest number would be worse than printing none — it is checkable-looking and wrong.

Diagnostics are **deduplicated** before they are counted or printed: two diagnostics with the same file, line, severity, message, `in:` and `fix:` lines are one diagnostic, however many times the build encountered it. This follows from the attribution rule above rather than adding to it — a problem located at a shared include or layout is one problem at one line of one file, whatever number of pages consume it — and it is what keeps the printed count and the printed lines in agreement. Two faults that would print identically but are genuinely distinct — the same relative `url()` in shared chrome, which §11.1 does not rewrite, resolving against different consuming pages (§12) — are distinguished by their resolved targets and both printed.

### 14.2 Problems (closed list for v0.7.0)

The bold IDs are the stable identifiers used by `tests/conformance/rules.tsv` and by tests; list position is not meaningful.

1. **P01** — Include target missing, not `.html`/`.md`, or escaping the source root (§5.1)
2. **P02** — Include cycle / depth over 10 — chain printed (§5.1)
3. **P03** — `<include>` without `src`; `<include>` with non-whitespace content (§5.1)
4. **P04** — Layout reference not a `.html` path (bare name) (§6.1)
5. **P05** — Layout target missing or escaping the source root (§6.1)
6. **P15** — A layout declares `data-layout` — layout chaining is not supported in v0.7.0 (§6.2)
7. **P07** — `data-layout` on a non-root element (§6.3)
8. **P08** — `data-unify` attribute; `unify-` class token (§6.3)
9. **P09** — Unaddressed page content with no sink in a slotted layout (§7.4)
10. **P16** — A `<slot>` nested inside another slot's fallback content — slots do not nest (§7.1). Located at the **inner** slot, which is the one that cannot exist
11. **P10** — Frontmatter in an `.html` page (§10.5)
12. **P11** — Literal `<head>` in a Markdown body (§10.5)
13. **P12** — Output collision (§13)
14. **P13** — Broken internal reference (§12)
15. **P14** — Emitted `_`-prefixed page or `_`-directory path (§4.2)
16. **P17** — A frontmatter value with no text form: a mapping nested below a key that already names one, or a list item that is itself a mapping or list (§10.2)
17. **P18** — Frontmatter is not valid YAML (§10.2). Distinct from P17, which is about a value's *shape*: P18 is a parse failure, and its fix is different — repair the syntax, rather than flatten a structure
18. **P19** — A named `<slot>` inside the layout's default-content sink `<main>`, with no bare `<slot>` (§7.4). Located at the named slot
19. **P20** — A `<slot>` outside a layout's `<body>` — anywhere in a page, or in a layout's `<head>` (§7.1). Inert in both cases; the message names the spelling that belongs in that file (`slot=` on a real element for a page, the layout's `<body>` for a head slot). Was advisory A04 until 2026-08-13

### 14.3 Advisories (the closed catalogue — capped at twelve; at the cap, adding one means removing one)

Ten, two slots free. Two IDs left this catalogue on 2026-08-13 and neither was replaced: **A15** (an `og:` value left root-relative by a path-only `--base-url`) was added and retired the same day, because the form it warned about stopped existing (§11.3); **A04** became problem **P20**, because what it reported was never merely informative — the page it let through was wrong. Both are the outcome to prefer over a warning: delete the choice, or fail the build. A retired ID is never reused.

Same ID convention as §14.2.

1. **A01** — Void `<include>` used (builds identically; previews wrong in a browser)
2. **A02** — Fill names a slot the layout doesn't have (content stayed in the page flow) (§7.3)
3. **A03** — Top-level `<header>`/`<footer>` outside any slot in a composed page (§7.6)
5. **A13** — A duplicated construct of which only the first counts — a second bare `<slot>`, a repeated slot name, or a second `<main>` in a layout: the first won, and the message names the duplicated construct (§7.1)
6. **A08** — Page charset differs from the layout's (layout's kept) (§8 row 1)
7. **A09** — Working-format file emitted — extension list, closed: `.psd`, `.ai`, `.sketch`, `.fig`, `.xcf`
8. **A10** — A file used as a layout or include also ships as its own page (the non-underscored case)
9. **A11** — Output paths differing only by case (§13)
10. **A12** — Symlink resolving outside the source root (treated as absent) (§4.4)
11. **A14** — Known deployment file at the source root held back by the exclude set — names the file and the `--exclude` line that ships it; the recognized names are the implementation's maintained list, which may grow without a spec revision (§4.2)

Discipline (asserted by the E2E suite): an advisory that fires on a correct site is a bug in the advisory — `unify init && unify build --dry-run --strict` exits `0`. Advisories report what the build observed and what it did; they never instruct the author to restructure markup that composed correctly.

---

## 15. Transactional publish

`build` composes and copies into a temporary tree, runs every check, and only then touches the output directory: **zero problems → publish; any problem → the previous output is byte-for-byte untouched and the exit code is 1.** Publishing syncs the temporary tree into the output directory: files whose content is unchanged are not rewritten; files no longer produced are deleted; new and changed files land via temp-then-rename. `--clean` empties the output directory first — and refuses (exit 2) when the output directory **is, or contains,** the source root or the working directory. It does *not* refuse merely because the output sits inside them: `src/` and `dist/` as siblings under a project root is the layout §2 scaffolds and the one nearly every site uses, and `-s . -o dist` puts the output inside the source root by construction. What the guard exists to stop is `-o . --clean` deleting the project, and `-o ..` or `-o src` deleting the source — cases where emptying the output would destroy something the author wrote. `--dry-run` is the entire pipeline through step 9 with no writes at all, plus the report (§17).

---

## 16. Watch contract, `dev`, and error pages

`unify watch` and `unify dev` share one contract: saves are coalesced into one rebuild; a save landing mid-rebuild queues exactly one follow-up — no change is ever dropped; every rebuild is a **full** rebuild (no cache, no incremental state; watch output is always identical to a fresh `unify build`); writes are minimal and atomic (unchanged files untouched, temp-then-rename, precise deletions); `--clean` applies only at startup. While watching, a page that fails to build is emitted as a default error page carrying the located diagnostics, replaced by the next successful rebuild; `unify build` never emits error pages, and while watching, problems suspend the transactional gate only this far — error pages are the one thing a broken rebuild may write.

`unify dev` = watch + a static server on `localhost:<port>` (default 3000) serving the output directory with directory indexes and a 404 page, plus a reload event stream; the reload script is injected only into HTML responses **it serves** and never exists in the output directory. No proxying, HTTPS, middleware, or config — permanently.

---

## 17. `--dry-run` report

Stdout: one line naming the address the site is being built for, then one list ordered by output path regardless of verb, one line per action, three verbs:

```
serving from / — the domain root (no --base-url)
write dist/404.html (/404.html) ← 404.html (no layout)
write dist/about/index.html (/about/) ← about.md + _layout.html
copy dist/assets/style.css (/assets/style.css) ← assets/style.css
write dist/blog/post/index.html (/blog/post/) ← blog/post.html + blog/_layout.html
delete dist/stale.html
```

With `--base-url https://example.com/repo/` the first line reads `serving from https://example.com/repo/` and every parenthesized URL carries the path prefix (`/repo/about/`).

Every `write` names its inputs — the source page and the layout it resolved to (the one fact not readable from any single file). Every `write` and `copy` also names, in parentheses, **the URL that file answers to** once published; `delete` names neither, being a disk operation on a file the site no longer has. Diagnostics print to stderr exactly as a real build would. `unify build --dry-run --strict` is the one-line CI lint.

The address line and the URLs exist because the reference check (§12) validates against the output *tree*, which is correct and says nothing about where that tree will live: a site built for a subpath with no `--base-url` passes every check and 404s on every link once deployed. Ratification round 11 produced exactly that, with exit 0. The URL is also the one inference `--pretty-urls` forces on a reader of output paths — `dist/about/index.html` is served as `/about/` — so the report states it instead of leaving it to be derived.

The list is what the **pipeline produced** — every page that composed, whether or not the build would go on to publish it. `--dry-run` is the pipeline through step 9; publishing is step 10 and it never runs. Because a single problem anywhere blocks the whole site (§15), a list of `write` lines could otherwise imply writes that a real build would refuse, so the report **ends with one line stating the outcome**:

```
would publish 5 files to dist/
```
```
would publish nothing — 2 problems; dist/ would be left untouched
```

Keeping the list and naming the outcome are both required: suppressing the list on failure would make `--dry-run` useless for the case it is most needed in, and printing it without the outcome would misdescribe what a real build does.

---

## 18. `unify.yaml`

Optional, at the source root; never emitted. Keys are the long option names with the same meanings: `source`, `output`, `clean`, `exclude` (a list, replacing the default like the flag), `pretty-urls`, `base-url`, `strict`, `port`. CLI flags win on conflict. No behavior exists that only the file can express.

---

## 19. Scaffold contract (`unify init`)

Every template scaffolds into `src/` beside a `dist/`-free project root and exercises each primitive exactly once: one `<include>` (the nav), the automatic `_layout.html`, one named slot with a fallback (`footer`) plus one page that fills it, one `data-layout="none"` page (`404.html`), and the underscore (`_includes/`). The scaffolded layout declares `<meta charset="utf-8">` and carries a plain HTML comment above each slot naming its purpose (a convention, never a rule). The starter stylesheet includes `slot { display: contents }` — design-time preview only; built pages contain no `<slot>` elements. The blog template additionally ships `_scripts/gen-blog.mjs` (~40 lines, zero dependencies) writing `blog.html` and `feed.xml` into the source tree. `unify init && unify build --dry-run --strict` exits `0` — the suite asserts it.
