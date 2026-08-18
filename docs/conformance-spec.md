# unify — Conformance Specification

**Status**: v0.7.0, normative
**Role**: The implementer-grade reference. `docs/product-spec.md` defines the product; this document defines the exact behavior, rule by rule. Every worked example in this document is a test fixture: an implementation conforms when it reproduces each example's output exactly — exact in element structure, tag names, attributes and their order, and text content — with only whitespace between block-level elements waived (§3; the comparator contract is `docs/testing-strategy.md` §2), and each diagnostic at the stated severity. Where this document and the product spec appear to differ, that is a defect in the document set to be fixed — neither may be silently reinterpreted.

Conventions: "problem" and "advisory" are the only two severities (§14). MUST-level language is implied throughout; nothing here is optional. All paths in examples are relative to the source root unless prefixed `src/` or `dist/` for clarity. All files are UTF-8.

---

## 1. Definitions

- **Source root**: the directory named by `--source` (default `src/` if it exists, else the working directory).
- **Page**: a file whose extension is exactly `.html` or `.md` — except a name ending `.fragment.html`, which is a **fragment**, not a page: it mirror-copies byte-for-byte (§4.4). No other extension is a page; `.htm` is not special and copies through like any asset.
- **Asset**: any non-page file. Assets are mirror-copied byte-for-byte to the same source-root-relative path.
- **Fragment**: any file referenced by an include; a name ending `.fragment.html` declares one in its filename, and additionally ships byte-for-byte at its own path (§4.4) — the two meanings are one: a balanced snippet that is not a document. **Layout**: any `.html` file referenced by layout selection (§6).
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

**Fragments: `*.fragment.html`.** A name ending `.fragment.html` opts an HTML file out of being a page (§1's definition): it mirror-copies like any asset — never composed, never rewritten, never moved by `--pretty-urls` — so a bare HTML snippet can be published at a URL, for `hx-get`/`fetch`, or for another system's embed. It is a *filename* convention because it has to be: a fragment has no `<html>`/`<body>` to carry `data-layout`, and unify's conventions already live in filenames (`_layout.html`, the underscore). Consequences, each deliberate:

- The same file is an ordinary include target (§5.1 — its extension is `.html`): `<include src="/panels/hours.fragment.html">` splices its contents into the consuming page's build, where nested includes resolve normally, while the shipped copy stays raw bytes. One file serves a build-time consumer and a runtime one.
- Its **insides are not reference-checked**: a URL written inside a fragment resolves at runtime against whichever page consumed it — a base the build cannot know — so checking it against the fragment's own path would be wrong in both directions. (Mirror-copied stylesheets stay checked, §12: CSS defines resolution against the stylesheet's own location, so there the check is sound.) References **to** a fragment from pages are checked like any emitted file, and a page's link to one is rewritten by §11 like any other URL — only the fragment's contents are the author's own.
- The underscore still wins: `_hours.fragment.html`, or a fragment under a `_` directory, never ships. Never-ship beats ship-verbatim, and the never-shipped list (§4.3) is untouched by this rule.
- P21's page-side message names this spelling as its second fix line (§7): a body-less `.html` is either an unfinished page or an intended fragment, and the diagnostic is where the author learns they can say which.

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

**The merge requires a `<body>` element on both sides.** C or L without one — a fragment, a bare `<main>`, a head-only shell with no body tag, an empty file — is a **problem (P21)** attributed to the file that lacks it, and the page is not built: the merge is undefined, and both previous behaviors were worse (a body-less L silently published its own text *as* the page, dropping C entirely at exit 0 — a §7.6 violation; a body-less C crashed with an unlocated internal error). One rule, two vantage-specific messages: C's names the complete-document shape to wrap the content in and the `.fragment.html` rename for the intended-partial case (§4.4); L's names the one-keystroke repair, because a layout with an *empty* `<body></body>` is the legitimate head-only pattern (§7.5) — the fault is only the element's absence. A resolved layout file that is empty is this problem, not a silent no-layout: `.md` conversion always synthesizes a body (§10.7), so P21's page side is reachable only from `.html` sources, and a page with no layout does not merge and is outside this rule.

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

**Fills** are then collected: every direct element child of C's body, **and every direct element child of the `<main>` that was just unwrapped, wherever it sat**, carrying a `slot` attribute with a non-empty value. (`slot=""` counts as absent.) The unwrap and the collection are one step, not two: a fill inside a `<main>` inside a wrapper `<div>` counts, because the `<main>` is the page's content region and the wrapper is styling. A `slot` attribute anywhere else — deeper than that, or inside a `<template>` — is the author's own markup and is never touched or reported: the parent of a fill is always `<body>` or that `<main>`, and neither can be a component the author is assigning light DOM to. Fill elements are removed from the default-content sequence wherever they sat; a wrapper they leave behind stays, possibly empty.

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

### 7.6 Stray chrome, and the content-loss law

When a page composes with a layout, a `<header>` or `<footer>` element that is not a fill is default content like any other element: it ships, in place, wherever §7.4 routes the default content, and **nothing is reported**.

This was advisory **A03** until it was retired. The advisory was the defect. §7.2 unwraps C's first `<main>` before the top-level scan, so a `<header>` written inside the page's own `<main>` — ordinary, correct HTML — was hoisted to top level by unify and then reported for being there, with composed output identical in structure to the source. Wrapping that same element in a meaningless `<div>` silenced the advisory and changed nothing else in the output, which is the tell: it was reporting tree position, not authorial error. And the repair it gestured at is a trap — against the idiomatic layout that wraps its slot in the matching landmark, `<footer slot="footer">` composes to a `<footer>` inside a `<footer>` at exit 0 with nothing reported, which is why the scaffold fills that slot with `<p slot="footer">`. `A03` is a retired ID. The misconception it was aimed at — that a page's `<header>` replaces the layout's — belongs in `authoring-rules.md`, in the file the author is editing.

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

Synthesized elements merge by §8 exactly as if the page had written them; their serialization is fixed: double-quoted attributes, `name`/`property` first, then `content` (`<meta name="description" content="…">`), and `<title>TEXT</title>`. Two consequences of "as if the page had written them", stated because implementations otherwise diverge: a present-but-empty `title:` counts as absent, so §10.3's `<h1>` fallback applies to it exactly as §8 row 2 treats an empty page `<title>`; and `class` takes a string — any other value is treated as absent rather than coerced. A `.md` file included as a fragment has its frontmatter stripped and **never validated** (§5.1 step 4): the data is provably unused, and a shared fragment must not make an unrelated page's build depend on the shape of metadata nobody reads. There are no other reserved keys: `date`, `tags`, `categories`, `draft`, `permalink`, `slug` have no behavior and become plain metas — `draft: true` publishes the page; a leading underscore is how a page is held back. The honest gap, stated: frontmatter cannot express `rel="canonical"`, `rel="preload"`, or JSON-LD. Preloads and JSON-LD are layout material; a canonical is not — it names one page's own address, a layout-supplied value stamps every page with the same URL (silently wrong on every page but one, and consequential: share crawlers consolidate by canonical), and a Markdown page cannot override it, because §8's replace rule needs an HTML head to carry the page's own tag. A page that needs a canonical is written in HTML, or does without.

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

Applies to every URL in `href`, `src`, `srcset` (each URL in the comma-separated list, descriptors untouched), and `poster`, in the composed page — after includes and layouts, before §11.2/§11.3. Skipped entirely: URLs with a scheme or `//` prefix, `mailto:`/`tel:`/`data:`/`javascript:`, fragment-only (`#x`), and empty values. Never reached: `url()` inside `<style>` blocks or `style` attributes — those values ship as written (§12 still checks them against the output tree). The consequence under §11.3 is stated here because the old advice in this sentence was itself the trap: a root-relative `url()` never receives the base's path prefix, so it resolves in the output tree (and passes §12) while 404ing at any subdirectory deploy address. A `url()` therefore belongs in a stylesheet file, written **relative to that file** — mirror copy keeps stylesheet-internal references working at every deploy address — and the same is true of any URL inside JavaScript, which no build step reads.

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

**A reference is the attribute's VALUE, not its bytes.** Character references resolve first: `href="/a&amp;b.html"` is the correct HTML spelling for a file named `a&b.html`, and that is the URL a browser fetches. Reading the bytes instead failed a correctly-written page to publish, with a diagnostic quoting a spelling that was right — present since v0.7.0. The obligation runs both ways: a URL unify *writes* into an attribute is escaped for the same reason a URL it *reads* is decoded (§22.2), and the two are one rule rather than two conventions that happen to agree.

**A reference is percent-decoded, per segment, before it is matched.** §20.5 makes `/two%20words.html` the address a file named `two words.html` answers to — that is what the sitemap publishes, what `--dry-run` prints, and what a browser sends — so a link written that way must resolve. Both spellings name the same file and both pass; neither is rewritten into the other, because the author's bytes are theirs.

Decoding follows [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986)'s own division rather than a local rule: a percent-encoded **unreserved** character is equivalent to the character itself, so `%2E` is `.` and `%41` is `A` and both decode; a **reserved delimiter** left encoded is deliberately not a delimiter. `/a%2Fb.html` therefore names one segment whose name contains a slash — something no filesystem holds — so it matches nothing, **always**, including when a file is literally named `a%2Fb.html`: that file's own address is `/a%252Fb.html`, and letting the impossible spelling match it would publish a link that 404s. Decoding it into a separator instead would silently resolve it to `a/b.html`, a different file, and under `--pretty-urls` would rewrite the author's link to an address naming that different file. `%5C` is not treated this way — a backslash is a legal POSIX filename character, so `a\b.html` is a real file whose published address is `/a%5Cb.html`, and refusing to decode it would make the site's own address unresolvable. A malformed escape leaves its segment as written rather than failing the build with a parse error.

Without this rule the build contradicts itself: it advertises an address in a standards artifact and then refuses to let the author link to it. That was true for one commit, and it is the reason the rule is stated here rather than left to each consumer.

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
20. **P21** — A page or layout with no `<body>` element where a merge requires one (§7). Attributed to the file that lacks it, file-level (there is no line to point at); the fix lines are spelled for that file's kind — for a page, the complete-document shape and the `.fragment.html` rename (§4.4), because a body-less `.html` is either an unfinished page or an intended partial; for a layout, `<body></body>` (the §7.5 head-only pattern)
21. **P22** — A generated discovery artifact's output path is already occupied by a file the site emits from source (§21.5). Located at the occupying source file. Generation is suppressed rather than overwriting, so the problem never costs the author their own file

### 14.3 Advisories (the closed catalogue — capped at twelve; at the cap, adding one means removing one)

Nine, three slots free. Three IDs have left this catalogue and none was replaced: **A15** (an `og:` value left root-relative by a path-only `--base-url`) was added and retired the same day, because the form it warned about stopped existing (§11.3); **A04** became problem **P20**, because what it reported was never merely informative — the page it let through was wrong; **A03** (a top-level `<header>`/`<footer>` outside any slot) was deleted, because the markup it fired on had composed exactly as its author drew it (§7.6). All three are the outcome to prefer over a warning that stays: delete the choice, fail the build, or delete the warning. A retired ID is never reused.

Same ID convention as §14.2.

1. **A01** — Void `<include>` used (builds identically; previews wrong in a browser)
2. **A02** — Fill names a slot the layout doesn't have (content stayed in the page flow) (§7.3)
5. **A13** — A duplicated construct of which only the first counts — a second bare `<slot>`, a repeated slot name, or a second `<main>` in a layout: the first won, and the message names the duplicated construct (§7.1)
6. **A08** — Page charset differs from the layout's (layout's kept) (§8 row 1)
7. **A09** — Working-format file emitted — extension list, closed: `.psd`, `.ai`, `.sketch`, `.fig`, `.xcf`
8. **A10** — A file used as a layout or include also ships as its own page (the non-underscored case)
9. **A11** — Output paths differing only by case (§13)
10. **A12** — Symlink resolving outside the source root (treated as absent) (§4.4)
11. **A14** — Known deployment file at the source root held back by the exclude set — names the file and the `--exclude` line that ships it; the recognized names are the implementation's maintained list, which may grow without a spec revision (§4.2)

Two operational tests fell out of A03's retirement. An advisory that a meaningless wrapper element switches off is reporting tree position, not authorial error. And an advisory whose only available repair edits a file the page does not own — a shared layout, a shared fragment — is instructing a restructure by another name, whatever its wording.

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

Every template scaffolds into `src/` beside a `dist/`-free project root and exercises each primitive exactly once: one `<include>` (the nav), the automatic `_layout.html`, one named slot with a fallback (`footer`) plus one page that fills it, one `data-layout="none"` page (`404.html`), and the underscore (`_includes/`). The scaffolded layout declares `<meta charset="utf-8">` and carries a plain HTML comment above each slot naming its purpose (a convention, never a rule). The starter stylesheet includes `slot { display: contents }` — design-time preview only; built pages contain no `<slot>` elements. `unify init && unify build --dry-run --strict` exits `0` — the suite asserts it.

The blog template additionally ships the generator seam worked end-to-end, because a generator is the most universal thing authors build on top of unify and the scaffold is where its habits are taught (working code teaches shapes prose cannot — and mis-teaches them just as efficiently). `_scripts/gen.mjs` (zero dependencies, one `node:` import; its opening comment names the authoring rules' own run-it-yourself literal, `node _scripts/gen.mjs && unify build` — the scaffold and the doc must agree, because a single shown literal is a copied literal) reads `posts/*.md` and `_data/authors.json` and writes `blog.html` and `feed.xml` into the source tree, each carrying the marker `generated by _scripts/gen.mjs — edit the data, not this file`. Both ship pre-generated and byte-identical to a fresh run of the script, so the SCF-04 guarantee holds with no intervening step and rerunning the script changes nothing. The authors file holds a private field (`email`) beside the public ones, and the generator names the fields it emits rather than spreading the record, so the private field appears in no generated file and nowhere in built output: the underscore keeps the *file* out of `dist/`, but only the generator can keep a *field* out of a page it writes — once a script copies one in, that page is ordinary content and no diagnostic can exist.

---

## 20. The final-output page manifest

Between §11's URL phases and §12's reference check, unify derives exactly one **page record** for every page that composed. The manifest is the build's single semantic reading of the site it is about to publish: sitemap generation, canonical completion, robots consistency, structured-data checks, feeds, search output, and every audit finding read it, and none of them re-parses a page or re-decides a value. Adding a second extractor, or letting one consumer pick a different winner than another, is a defect in this section rather than in the consumer.

The manifest is an **implementation boundary**. No command writes it, no authoring rule mentions it, and product-spec §6.2 states plainly that it is not a new file format authors must learn. Nothing in this section changes what a v0.7 build emits, reports, or exits with: deriving the manifest is pure observation.

### 20.1 Membership

One record per **composed page** — exactly the set §12 checks and §15 publishes as HTML. Assets, `.fragment.html` files (§4.4/EXC-12), excluded sources, and pages that failed to compose have no record. Membership is decided before any field is read, so a page carrying no metadata at all still has a complete record. Records are ordered by output path, and that order is the manifest's iteration order for every consumer.

### 20.2 Extraction source

Every field is read from the page's **emitted text**: the exact bytes §15 would publish, after includes (§5), Markdown conversion (§10), composition (§7–§9), and all three URL phases (§11). Frontmatter, layout files, and include sources are never consulted again. A Markdown page's `title` reaches the manifest only because §10.2 put it in the emitted `<head>`; a layout-supplied `<meta name="description">` is read from each page that shipped it, once per page. That is what makes HTML and Markdown equal citizens here and keeps the manifest honest about what a crawler will actually see.

`<template>` contents are not scanned, matching §7.1's rule for slots: markup inside a template is inert in the shipped page, so it declares nothing.

Extraction never fails a build and never publishes anything. A page whose emitted text carries no title, no headings, and no links produces a complete record whose fields are `null` or empty. §14's two severities and the exit-code contract are untouched by this section.

### 20.3 Fields

Every record carries every field. A field with nothing to read is `null` (scalars) or `[]` (lists).

| Field | Type | Read from the emitted document |
|---|---|---|
| `sourcePath` | string | the source-root-relative path of the page that composed |
| `outputPath` | string | the output-root-relative path §13 resolved |
| `path` | string | §20.5 — the site-root-relative address this output path answers to |
| `url` | string\|null | §20.5 — the absolute public URL, or `null` with no `--base-url` |
| `title` | string\|null | `<title>` text content, whitespace-collapsed and trimmed; empty is `null` |
| `description` | string\|null | `<meta name="description">` `content`, trimmed; empty is `null` |
| `lang` | string\|null | the `lang` attribute of `<html>`, trimmed; empty is `null` |
| `canonical` | string\|null | `<link rel="canonical">` `href`, with character references resolved and nothing else changed — no normalization, no re-encoding |
| `robots` | object | §20.6 — `{raw, directives, indexable, followable}` |
| `h1` | string\|null | text content of the first `<h1>`, whitespace-collapsed and trimmed; empty is `null` |
| `headings` | array | every `h1`–`h6` in document order: `{level, text, id}`; `id` is `null` when unset |
| `text` | string | §20.7 — the page's visible main text |
| `image` | object\|null | `{url, width, height}` from `og:image`, else `twitter:image`; `width`/`height` come from `og:image:width`/`og:image:height` and are read **only when the url came from `og:image`**, `null` otherwise or when the value is not an integer |
| `author` | string\|null | `<meta name="author">` `content`, trimmed |
| `datePublished` | object\|null | §20.10 — `{raw, iso}` from `<meta property="article:published_time">` or `<meta name="date">` |
| `dateModified` | object\|null | §20.10 — `{raw, iso}` from `<meta property="article:modified_time">` or `<meta name="lastmod">` |
| `schemaType` | string\|null | §20.8 — the declared structured-data type |
| `jsonLd` | array | §20.8 — one entry per `<script type="application/ld+json">`, in document order |
| `ids` | string[] | every `id` attribute in the emitted document, in document order, repeats included |
| `linksOut` | string[] | §20.9 — output paths of internal pages this page links to, deduplicated, sorted |
| `fragmentLinks` | array | §20.9 — `{target, id}` for each internal link carrying a fragment; `target` is the output path, `id` the fragment without `#` |
| `linksIn` | string[] | §20.9 — output paths of internal pages that link to this one, deduplicated, sorted |
| `conflicts` | array | §20.4 — `{field, kept, discarded}`, ordered by field name |

**Text content** everywhere in this table means the concatenated character data of the element and its descendants, with `<script>`, `<style>`, `<template>`, and `<noscript>` subtrees omitted, each run of ASCII whitespace collapsed to one space, and the result trimmed. Comments contribute nothing.

**Character references are resolved.** "Character data" means the text a reader sees, not the markup that encodes it: `C++ &amp; Rust!` in the emitted document is `C++ & Rust!` in the record. This is not an edge case — §10.1's Markdown converter escapes `&`, `<`, `>`, and `"` on every page it writes, so an unresolved field would make the *default* authoring path produce text no reader ever sees, no search index could match, and any consumer that escapes on output would double-escape into `&amp;amp;`. Resolution covers the numeric forms (`&#8212;`, `&#x2014;`) and the named references of HTML 4.01's three entity sets — Latin-1, symbols/mathematical/Greek, and special — which is a closed, citable list rather than an implementation's habit. A reference outside that set, or malformed, is left exactly as written: unrecognised markup is not silently deleted. The same resolution applies to values read from attributes (`description`, `author`, `canonical`, `image`, the dates), because an attribute carries character references too.

Resolution happens **only here**. §3's splice engine and every module it feeds must keep treating source bytes as bytes — the manifest is a reading of the output, not another pass over it.

Element boundaries participate: **entering and leaving** an element each contribute one space unless it is one of the closed set of **inline** elements below, whose boundaries contribute nothing. Both halves are needed. Leaving alone leaves `<div>Intro<p>Para</p></div>` reading as `IntroPara`; without the rule at all `<p>Kept</p><p>Also kept</p>` reads as `KeptAlso kept`; and with an unconditional space `Hello <em>world</em>!` reads as `Hello world !`. Since runs of whitespace collapse and the result is trimmed, the doubled separator between two adjacent blocks costs nothing. The list is closed and stated rather than derived, so two consumers cannot tokenize the same page differently:

```
a abbr b bdi bdo cite code data dfn em i img kbd mark q rp rt ruby
s samp small span strong sub sup time u var wbr
```

`<br>` is deliberately *not* inline here: it separates lines, so it separates words.

Collapsing covers **ASCII** whitespace only. A decoded `&nbsp;` is U+00A0, a character the author chose because it forbids a line break, and rewriting it to U+0020 would be an edit to their content — the same verbatim discipline `iso` and `canonical` follow. This pushes a real cost onto consumers that tokenize: a client-side search comparing a typed `New York` against an indexed `New\u00A0York` misses, and duplicate-content detection reads two otherwise identical pages as different. Any projection of this field that is searched or compared must fold U+00A0 and the other Unicode space separators **at index time**, and say so where it is specified. Folding them here instead would put one consumer's normalization into the shared record, where every other consumer inherits it silently.

### 20.4 Determinism and conflicts

Several fields are single-valued while the emitted document may declare them more than once. For each such field the manifest keeps **the first accepted declaration in document order** and records nothing further when the repeats agree.

When two or more accepted declarations exist and their values **differ**, the manifest keeps the first and appends one `conflicts` entry naming the field, the kept value, and every discarded value in document order. Identical repeats lose nothing and so are not conflicts. A conflict entry is **data on the record, not a diagnostic**: §14.2's problem list and §14.3's advisory catalogue are both closed, ordinary `build` is not the place to reject content quality (product-spec §6.1), and the evaluation command of product-spec §6.3.4 is what renders these to a human. The rule is total — the fields subject to it are `title`, `description`, `lang`, `canonical`, `robots`, `image`, `author`, `datePublished`, `dateModified`, and `schemaType` — and no consumer may re-decide a winner.

`headings`, `jsonLd`, `linksOut`, and `linksIn` are multi-valued by definition and never produce conflicts.

`image` is the one field whose accepted declarations are **ranked rather than ordered**: `og:image` is the representative image whenever the document declares one, and `twitter:image` is consulted only in its absence (§20.3). The conflict rule applies within the winning spelling — two differing `og:image` values conflict, as do two differing `twitter:image` values on a page with no `og:image` — and a `twitter:image` that merely differs from a present `og:image` is not a conflict, because it is not a competing answer to the same question. Stated here because §20.4 calls itself total, and a rule that is total needs its one exception named rather than inferred.

### 20.5 Public URLs

`path` is the address the output path answers to, computed by the **same function §17's dry-run report already uses** to print it — one interpretation, so a URL a consumer emits and a URL the report shows can never disagree. A trailing `index.html` segment is dropped: `about.html` → `/about.html`, `about/index.html` → `/about/`, `index.html` → `/`. With `--base-url https://example.com/repo/` the path prefix is applied: `/repo/about/`.

Each segment derived from an output path is **percent-encoded**, because a filesystem name is not a URI and the manifest's job is to say what a page answers to: `two words.html` → `/two%20words.html`, `a&b.html` → `/a%26b.html`, `caf%C3%A9.html` for a UTF-8 `café.html`. A literal `%` encodes to `%25`, so the transform is total and never double-encodes. The path prefix supplied by `--base-url` is **not** re-encoded — the author wrote it as a URL already, and re-encoding it would corrupt a prefix that legitimately contains an escape.

The line this draws, once, for the whole build: **a URL unify constructs is percent-encoded; a URL the author wrote is preserved.** `urlForOutputPath`, the `--dry-run` address, §11.1's re-rooted URLs, §11.2's directory form, and every projection of this manifest are constructions and are encoded. A URL the author wrote in the page that ships it, on a page that did not move, is preserved untouched (§11.1's URL-06 branch). §11.2 is the stated exception: it *replaces* an authored URL with a constructed one by design, which is what `--pretty-urls` is, so its output is encoded like any other construction. §12 percent-decodes before matching, so both spellings of the same file resolve and neither is rewritten into the other.

One visible consequence, stated so it is not later read as drift: in a build without `--pretty-urls` an emitted page can carry `href="/two words.html"` — the author's own bytes, preserved — while the sitemap and the `--dry-run` report say `/two%20words.html` for that same target. Both name the file, both resolve, and neither is wrong. The difference is the line above doing exactly what it says, not two components disagreeing.

`url` is `base.origin + path` when `--base-url` was supplied, and `null` otherwise. unify does not know a site's public address unless it is told, and a feature that needs an absolute URL must therefore say so rather than invent an origin. Because §11.3 makes a bare-path `--base-url` a usage error, `url` is either a complete absolute URL or `null` — never a half-built one.

### 20.6 Robots directives

`robots.raw` is the `content` of `<meta name="robots">`, trimmed, or `null`. `robots.directives` is that value split on commas, each token trimmed and lowercased, empty tokens dropped. `indexable` is `false` when the directives contain `noindex` or `none`, `true` otherwise; `followable` is `false` when they contain `nofollow` or `none`, `true` otherwise. Unknown directives are preserved in `directives` and change nothing else.

A crawler-specific meta (`<meta name="googlebot">`) is **not** read: unify does not model one search engine's policy. `robots.txt` is **never** read into a page record — a disallowed path is not a `noindex` page, and conflating the two is the single most common piece of SEO folklore this specification refuses (product-spec §6.7).

### 20.7 Visible main text

`text` is the text content (§20.3) of the emitted document's first `<main>` element, or of `<body>` when the document has none, or of the whole document when it has neither. It is the text a reader sees, computed once, so that duplicate-content detection, the search projection, and any excerpt read the same characters.

### 20.8 Structured data

`jsonLd` holds one entry per `<script type="application/ld+json">` in the emitted document, in document order: `{raw, data, error}`. `raw` is the script's text content verbatim. `data` is the parsed JSON value, or `null` when parsing failed; `error` is the parser's message in that case, `null` otherwise. Parsing never throws and never fails a build — §20.2's rule holds and product-spec §6.3.6 owns what is done with an invalid block.

`schemaType` is the first accepted declaration in document order among: a `<meta name="schema">` `content` value, and the `@type` of a parsed JSON-LD entry whose `data` is a single object with a string `@type`. An array, a `@graph`, a missing `@type`, or a non-string `@type` declares nothing here — bounded reading rather than a guess.

### 20.9 The internal link graph

`linksOut` holds the output paths of the pages this page links to. A link participates when it is an `<a href>` in the emitted document whose value, after `--base-url` stripping (§12's own rule, reused), resolves to an output path that has a page record. Fragment-only, external, `mailto:`, `tel:`, and `data:` URLs never participate, and a link to a non-page asset never participates; the query and fragment of a participating URL are discarded before matching. A page linking to itself records itself. Values are deduplicated and sorted.

`fragmentLinks` records the same links again, keeping the fragment §12 discards: `{target, id}` per internal link that carries one. §12 deliberately does not validate fragments (REF-06) because a missing one is a reader's judgement rather than a build gate — but it is a *checkable* judgement, so the manifest carries the pairs and the evaluation command decides. `ids` is the other half: every `id` in the emitted document, in document order and with repeats kept, so that both "this fragment names nothing" and "this page declares one id twice" are answerable from the record rather than by re-parsing.

A `<noscript>` link participates even though `<noscript>` text does not reach `text` (§20.3). The two sections are asking different questions: `text` is what a reader sees, and a `noscript` block is by definition what they do not; `linksOut` is which pages this page can be reached from, and a `noscript` link is a real navigation for the readers it is written for. Named here so the asymmetry reads as a decision rather than an oversight.

`linksIn` is the exact reverse relation, computed after every record exists: `B` is in `A.linksIn` if and only if `A` is in `B.linksOut`. Deduplicated and sorted. Orphan detection (product-spec §6.3.4) is `linksIn.length === 0`, which is why the relation is built here once rather than by the consumer.

### 20.10 Dates: `raw` and `iso`

A date field is `{raw, iso}` precisely so the two questions never collapse into one. `raw` is the value exactly as the document declared it, so nothing an author wrote is lost. `iso` is that value **only when it is a well-formed [W3C-DTF](https://www.w3.org/TR/NOTE-datetime) date or date-time**, and `null` otherwise; it is the field every consumer that emits a date must read, and `raw` is never emitted anywhere.

The accepted grammar is W3C-DTF's, no more:

```
YYYY-MM-DD
YYYY-MM-DDThh:mmTZD
YYYY-MM-DDThh:mm:ssTZD
YYYY-MM-DDThh:mm:ss.sTZD          TZD = Z | +hh:mm | -hh:mm
```

The literal `T` is required — `2026-01-02 03:04:05` is not W3C-DTF, and a space-separated value emitted verbatim into a sitemap `<lastmod>` or a JSON-LD `dateModified` is invalid where it lands. A time-zone designator is required whenever a time is present, since a local time with no offset names no instant. The date must be a real calendar day (`2026-02-30` and `2025-02-29` are not), the clock must be a real time of day (`24:00` and `23:60` are not), and the offset must be one that exists (`±14:00` is the outer bound). `iso` is the accepted value verbatim, not a normalization: unify does not rewrite `+00:00` to `Z` or pad a fractional second, because reformatting an author's timestamp is an edit to their content.

No date is ever derived. The build clock, the filesystem's mtime, the filename, and Git history are not consulted by this section or by anything reading it — product-spec §6.1's no-invented-claims constraint, in the one place it is most tempting to break.

---

## 21. Sitemap generation

The first projection of §20. Everything here reads page records; nothing here re-reads a page.

### 21.1 Activation

A sitemap is generated when, and only when, `--base-url` supplied the site's public address. Without it the manifest's `url` is `null` (§20.5) and unify does not know what to write in a `<loc>` — a sitemap of root-relative paths is invalid per the Sitemaps protocol, and inventing an origin is the class of guess product-spec §6.1 forbids. A build with no `--base-url` therefore emits no sitemap and reports nothing about it; this is the v0.7 golden path, unchanged.

Generation is additive: it writes one new file (or, at protocol scale, a small set), changes no authored content, appears in `--dry-run` like any other write, and participates in §15's transactional publish. `--base-url` is the whole opt-in — there is no separate flag, because a site that has told unify its public address has told it everything the sitemap needs.

**Activation governs this entire section, §21.6's verification included.** Without `--base-url` a site's `sitemap.xml` is an ordinary asset: it mirror-copies byte-for-byte (§4.4) and unify says nothing about its contents, exactly as in v0.7. This is not a gap left for later — it is what "the v0.7 golden path, unchanged" costs to mean. A site that shipped an authored sitemap with a stale entry built clean before this section existed and must keep building clean after it, because nothing the author did changed and no flag opted them in. It is also the only coherent reading: a `<loc>` is an absolute URL by protocol, and deciding whether one points inside *this* site requires knowing the site's address.

### 21.2 Membership

A page record is included when **all** of the following hold. The list is closed; nothing else affects membership.

1. It has a record at all (§20.1) — so assets, `.fragment.html` files, excluded sources, and pages that failed to compose are already out.
2. `robots.indexable` is `true` (§20.6). A `noindex` or `none` page is excluded: listing a page the author told crawlers to drop is a contradiction the sitemap should not publish.
3. Its output path is not `404.html`. An error document is not a destination.
4. It is **self-canonical**: it either declares no canonical, or declares one that resolves to its own output path. A canonical naming another page means the author consolidated this URL into that one, and a sitemap entry would ask crawlers to undo that. Resolution reuses §12's own rule (base-URL stripping, then relative/root-relative resolution, then directory URLs to `index.html`) so "which page does this URL name" has one answer across the build. A canonical that resolves to nothing internal — an external URL, or a path the site does not emit — is likewise not this page, so the page is excluded.

Membership is evaluated per record in manifest order (§20.1), and that order is the order entries appear in the file. No sorting, shuffling, or grouping: two builds of the same tree produce byte-identical sitemaps.

### 21.3 Entry contents

Each included record contributes one `<url>` element:

- `<loc>` is `record.url` — the absolute public URL §20.5 already computed, so a URL in the sitemap and a URL in the `--dry-run` report are the same string by construction. Two escapings apply and neither substitutes for the other: §20.5 has already **percent-encoded** the path so the value is a legal URI (a source file named `two words.html` answers to `/two%20words.html`, never to a URL with a raw space in it), and the value is then **XML-escaped** (`&`, `<`, `>`, `"`, `'`) so the document is well-formed. The Sitemaps protocol requires both.
- `<lastmod>` is emitted **only** when `record.dateModified.iso` is non-null — an authored, well-formed W3C date. A page with no authored modification date gets no `<lastmod>`. The build clock, the filesystem's mtime, the filename, and Git history are not fallbacks: a fabricated `lastmod` is a claim about the world, and it is the specific fabrication crawler guidance punishes. `datePublished` is not a fallback either; the element is named for the last modification and reads the value authored under that name.

No `<changefreq>` and no `<priority>`. Both are author guesses that unify cannot derive from the page, and current primary crawler guidance ignores them; emitting a constant for every page would be noise with the shape of information.

### 21.4 Serialization and protocol limits

The document is a `urlset` in the `http://www.sitemaps.org/schemas/sitemap/0.9` namespace, UTF-8, one element per line, newline-terminated. Byte-identical across runs of the same input.

The Sitemaps protocol caps one file at **50,000 URLs** and **50 MiB** uncompressed. When the entry set exceeds either cap, unify emits a **sitemap index** at `sitemap.xml` naming parts `sitemap-1.xml`, `sitemap-2.xml`, … Parts are filled in manifest order to the first cap reached, so the split points are a function of the input alone. The index's `<loc>` values are the parts' own absolute public URLs; the index carries no `<lastmod>`, for the same reason entries do not invent one. A site under both caps gets exactly one file, `sitemap.xml`, and no index.

### 21.5 Authored sitemaps and generated-path collisions

If the site already emits `sitemap.xml` from its own source, **generation is suppressed entirely** and the authored file ships byte-for-byte. The author's file is the site's sitemap; unify neither overwrites it nor merges into it. Its internal `<loc>` values are checked exactly as generated ones are (§21.6).

If generation proceeds and a path it would write is already occupied by a file the site emits from source, that is **P22**, located at the occupying source file, and generation is suppressed — the problem blocks publish (§15) without ever costing the author a file. In practice this reaches only the split parts, since an authored `sitemap.xml` suppresses generation before any path is claimed.

### 21.6 `<loc>` verification

Every `<loc>` in an emitted sitemap — generated or authored — whose value names a location inside this site must resolve to a file the site emits. "Inside this site" means the value, after `--base-url` stripping (§12's rule), is root-relative or relative; a URL on another origin is not checkable offline and is skipped, because network access is an explicit audit operation and never a build dependency (product-spec §6.1). A `<loc>` that does not resolve is **P13**, the same broken-internal-reference problem §12 raises for a page, located at the sitemap file.

**The document is parsed, not scanned for a tag's spelling.** Three consequences, each a real form a sitemap takes and each a wrong answer if the text is pattern-matched instead:

- A `<loc>` inside an **XML comment** declares nothing, exactly as §20.3 says comments contribute no text. Treating a commented-out entry as live turns a valid site into a publish-blocking false problem — the worst failure available to a check whose job is to be trusted.
- A `<loc>` whose value is wrapped in **CDATA** carries the value, not the wrapper. Real generators emit `<loc><![CDATA[https://…]]></loc>`, and reading the brackets as part of a URL fails a site for being written in legal XML.
- A **namespace-prefixed** element (`<sm:loc>` under `xmlns:sm=…`) is a `loc`. Missing it is the more dangerous direction: the check passes and the broken URL ships, which is the silent failure this specification exists to prevent.

Scope is the output-root `sitemap.xml` plus any part `sitemap-N.xml` generation produced. A sitemap elsewhere in the tree (`blog/sitemap.xml`) is an ordinary asset — §21.5 scopes the whole feature to the output root, and a file unify would never generate is a file it does not interpret.

For generated sitemaps this check can only pass — every `<loc>` came from a record whose output path exists. It runs anyway, and that is the point: it is the executable form of the claim that the sitemap and the published tree agree, so a future change that lets the two drift fails here instead of at a crawler.

---

## 22. Canonical completion

The second projection of §20, and the first that writes into a page rather than beside it.

### 22.1 Activation

`--canonical auto`, or the identical `canonical: auto` in `unify.yaml`. `auto` is the only accepted value; anything else is a usage error naming it, so a future mode cannot be silently misspelled into today's behaviour. Without the option nothing in this section runs, no page changes, and nothing is reported — the v0.7 golden path.

**`--canonical auto` requires `--base-url`**, and the combination is checked as a usage error (exit 2) rather than degrading. A canonical must be an absolute URL: that is why §11.3 absolutizes authored ones, and why a path-only base URL is itself a usage error. Without a public address §20.5 makes `url` null, so there is nothing truthful to write — and writing a root-relative canonical, or writing nothing while the flag says otherwise, are both worse than saying so.

### 22.2 What is added, and where

For every page record that §22.4 includes, a canonical link is inserted **at the end of the emitted `<head>`**, immediately before `</head>`:

```html
<link rel="canonical" href="https://example.com/about.html">
```

`href` is `record.url` — the same absolute URL §20.5 computes, the `--dry-run` report prints, and §21.3 writes into `<loc>`. Serialization is fixed, matching §10.2's rule for synthesized elements: double-quoted attributes, `rel` before `href`. The insertion reuses the whitespace immediately preceding `</head>`, so the element lands at that tag's own indentation and the rest of the document is byte-identical (§3's preservation rule).

`href` is HTML-escaped. §20.5 deliberately leaves the `--base-url` path prefix un-re-encoded, so `record.url` may legitimately contain `&` — and an unescaped `&copy;` in an attribute is a character reference, which §20.3 says the manifest resolves. Emitted raw, the page came back declaring a canonical of a *different* URL, §21.2's self-canonical test then failed, and the page vanished from the sitemap of the very build whose flag exists to help crawlers find it. §21.3 XML-escapes for exactly this reason; this is the same obligation one document type over, and §12's decode-on-read is its other half.

A page whose emitted document has no `<head>`, or whose `<head>` is left unclosed, gets nothing — there is no insertion point, and synthesizing one would be a structural change this section does not make.

### 22.3 Authored canonicals always win

A page that declares any `rel="canonical"` is left exactly as written. That holds when it declares several (§20.4 keeps the first and records the conflict), when its canonical names another page, and when its canonical names nothing this site emits. Completion means *filling a gap*, never adjudicating a value the author chose.

### 22.4 Membership is §21.2's, unchanged

A page is completed when §21.2's sitemap membership holds — it has a record, is `indexable`, is not `404.html`, and is self-canonical — and it authors no canonical. The predicate is shared, not merely similar, for two reasons beyond tidiness:

- **`404.html`** is excluded for a stronger reason here than in §21.2. An error document is served *at whatever URL was missing*, so a canonical naming `/404.html` is not merely useless — it is an actively false claim about every address it appears at.
- **A `noindex` page** is excluded as the conservative default: write less where the author has said less. Note precisely what this is not — a completed canonical always names the page's **own** URL, so on a `noindex` page it would be redundant rather than contradictory. The contradiction product-spec §6.3.2 names is the *cross*-canonical shape, a page marked `noindex` whose canonical points elsewhere, and completion cannot produce that. §22.3 leaves the author's own escape hatch open: write the canonical and it is kept.
- **A page consolidated onto another** already has the canonical it wants — which is also why it left the sitemap. This clause does no work in the completion direction, because a page with any authored canonical is already excluded by §22.3; it is inherited with the predicate rather than needed by it.

### 22.5 What this section reports, and what it deliberately does not

A canonical — authored or completed — that names a location this site does not emit is already **P13**. §12 checks `link href` for every `rel`, so no new rule is needed and none is added; the case is pinned two-sided.

Multiple canonicals, a canonical on a `noindex` page, and disagreement between a canonical and the sitemap are content-quality judgements. Product-spec §6.3.4 assigns them to `unify audit`, and §6.1 states that ordinary `build` does not reject subjective findings. §20.4 already records the multiple-canonical case as data on the record, which is what the evaluation command will read. Adding any of them here would put a judgement in the publish path that the product contract puts outside it.

---

## 23. Robots consistency

unify never writes a `robots.txt` and never decides what a site should block. This section validates the one thing in an authored file that is a **reference** — a URL that must fetch — and deliberately validates nothing else.

### 23.1 Scope

The output-root `robots.txt`, when the site emits one from its own source. A `robots.txt` anywhere else in the tree is an ordinary mirror-copied asset: the Robots Exclusion Protocol only gives the root file meaning, and a file unify would never interpret is a file it does not interpret. Nothing here generates, rewrites, or reorders a byte of it — the author's policy ships exactly as written.

Activation follows §21.1: these checks run when `--base-url` supplied the site's public address, for the same reason. A `Sitemap:` value is an absolute URL by [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) §2.2.3, and deciding whether one points inside *this* site is not answerable without knowing the site's address.

### 23.2 Records

The file is read as RFC 9309 records: a line is a comment (`#`), blank, or `field: value`. Field names are case-insensitive. Everything the parser cannot make sense of is carried through untouched — §23.4 says why that is not an error.

### 23.3 `Sitemap:` is a reference

A `Sitemap:` value naming a location this site emits must resolve to a file the site emits, or it is **P13**, the same broken-reference problem §12 raises for a page and §21.6 for a `<loc>`, located at the source `robots.txt`. "Naming a location this site emits" is §12's own test, reused: strip the `--base-url` prefix, and a value that is left root-relative or relative is internal. A value on another origin is skipped — verifying it needs the network, and network access is an explicit audit operation, never a build dependency.

This is the one check because it is the one **reference**. A `Sitemap:` line is a promise that a crawler can fetch that URL; a promise the site itself breaks is a fault unify can see without judging anything.

### 23.4 What is deliberately not checked

- **`Disallow` and `Allow` values are patterns, not references.** `Disallow: /admin/` on a site with no `/admin/` is ordinary and defensive — blocking a path that does not exist yet is exactly what an author should do. Checking them would be inventing the policy product-spec §6.3.3 forbids: "unify never decides what an author should block."
- **A malformed line is not a build problem.** RFC 9309 §2.2.1 states that crawlers **must** ignore lines they cannot parse, so an unparseable line is *defined* to be inert. Failing a publish over one would contradict the standard the check exists to serve.
- **An unknown field is not an error.** The same section requires crawlers to ignore fields they do not recognise, which is what makes the format extensible.
- **A missing `Sitemap:` line is not an error, even when unify generated a sitemap.** Declaring one is the author's choice; a tool that required it would be deciding policy in the other direction.
- **A page's own `noindex` versus what a sitemap lists** is a contradiction between two authored things, not a broken reference. Product-spec §6.3.4 assigns robots conflicts to `unify audit`, and §6.1 keeps subjective findings out of the publish path; §20.6 already records each page's directives as the data that command will read.

Everything in this list is reportable — by the evaluation command, which is where a judgement belongs. None of it blocks a build.

---

## 24. `unify audit` — evaluation

`build` decides whether a site can be published. `audit` decides nothing: it reads the prospective final output and reports what it observes. The two are kept apart deliberately — product-spec §6.1 states that ordinary `build` does not reject subjective content-quality findings, and §6.3.4 assigns those findings to this command instead.

### 24.1 What the command runs

`unify audit` runs **the whole pipeline** — §5 through §13, plus §21's generation and §22's completion when their flags are set — and then evaluates the §20 manifest. It does not publish, and it prints no `--dry-run` report; the report it prints is the finding list.

Running the real pipeline rather than a cheaper approximation is the point. Every finding below is a fact about *emitted bytes*: a title that a layout supplied, a fragment link that §11.2 rewrote, a canonical §22 completed, a URL §21 put in a sitemap. An evaluator that read source files would be a second interpretation of the site, which is exactly what product-spec §6.2 exists to prevent.

### 24.2 Read-only

`audit` writes nothing, anywhere. It never creates, cleans, or touches the output directory, and it never consults it: §17's delete plan is the one pipeline step that reads `dist/`, and it belongs to `--dry-run`, not here.

Two flags describe writing, so `audit` refuses them rather than accepting them inertly: `--clean` and `--dry-run` are usage errors (exit 2) naming the reason. An accepted flag that does nothing is the silent failure §14 exists to forbid — `--clean` especially, where a reader could reasonably believe output was emptied.

### 24.3 Findings are not diagnostics

A finding is not a `problem` and not an `advisory`. It has its own record shape, its own two severities, and its own effect on the exit code, because it answers a different question: §14's diagnostics say whether the build is sound, and a finding says whether the site is complete.

| | severity means | blocks publish |
|---|---|---|
| `broken` | the output contradicts itself, or the standard it claims to follow. A fragment naming no id, a duplicated id, JSON-LD that does not parse. Wrong regardless of what the author intended. | never |
| `incomplete` | something is absent or inconsistent that an author may have chosen. A missing description, an orphan page, two pages sharing a title. | never |

Neither severity ever blocks a publish, because `audit` never publishes and `build` never audits. The severity distinction is objective — *is this wrong, or is this merely absent* — and carries no claim about importance.

### 24.4 The catalogue

Every finding is a predicate over the §20 manifest. `record` is the page being evaluated; "another page" always means another record in the same manifest.

| id | severity | fires when |
|---|---|---|
| `title-missing` | incomplete | `title` is null |
| `title-duplicate` | incomplete | another page's `title` is identical after case folding and whitespace collapse |
| `description-missing` | incomplete | `description` is null |
| `description-duplicate` | incomplete | another page's `description` is identical after case folding and whitespace collapse |
| `h1-missing` | incomplete | the page emits no `h1` |
| `h1-multiple` | incomplete | the page emits more than one `h1` |
| `title-h1-mismatch` | incomplete | the page has a `title` and exactly one `h1`, and neither string contains the other after case folding and whitespace collapse |
| `lang-missing` | incomplete | `lang` is null |
| `page-orphan` | incomplete | `linksIn` is empty and the output path is neither `index.html` nor `404.html` |
| `id-duplicate` | broken | an id appears more than once in `ids`; one finding per repeated id, in sorted order |
| `fragment-missing` | broken | a `fragmentLinks` entry names a page in this manifest whose `ids` does not contain the id |
| `jsonld-invalid` | broken | a `jsonLd` entry has a non-null `error` |
| `schema-incomplete` | incomplete | `schemaType` is `Article` or `BlogPosting` and `title` is null, or `datePublished` is null or has a null `iso` |
| `image-missing-dimensions` | incomplete | `image` is present and either `width` or `height` is null |
| `canonical-noindex` | broken | the page is not `indexable` and its canonical names somewhere else — §21.2's own self-canonical test, negated |
| `sitemap-noindex` | broken | a sitemap emitted by this build lists the page and the page is not `indexable` |
| `sitemap-canonical-disagree` | broken | a sitemap lists the page and its canonical names somewhere else — the same test, not §21.2's membership predicate |
| `text-duplicate` | incomplete | another page's `text` is byte-identical and non-empty |

Three of these are narrower than the plain-language name suggests, and each narrowing has a reason rather than a preference:

- **Duplicate means identical.** Product-spec §6.3.4 says "substantially duplicated page text"; this spec says *identical*, and titles and descriptions fold case and collapse whitespace before comparing because those two differences are never authorial intent. Anything looser needs a similarity threshold, and a threshold is a number nobody can defend to an author whose two pages fell either side of it. §6.1 forbids failing content on arbitrary rules; an arbitrary rule is no better for being a float.
- **Title/heading mismatch is containment.** §8 row 2 *prepends* a page title to the layout's, so `About — Example Site` legitimately contains the `h1` `About`. Containment in either direction is therefore the whole test. A distance score would be the same undefendable number in another costume.
- **Nothing counts characters.** A short title is not a finding, a long description is not a finding, and neither is an empty one *for its length*. §6.7 names fixed title lengths specifically as a myth that must not become a product rule merely because SEO advice repeats it. Absence is checkable; length is opinion.

Three more absences are deliberate.

- **A canonical naming its own page is not `canonical-noindex`.** On a `noindex` page that is redundant, not contradictory, and §22.4 declines to complete one there for the same reason. The contradiction product-spec §6.3.2 names is the *cross*-canonical shape.

  Both findings that turn on this ask §21.2's `isSelfCanonical` **directly**. Neither may ask it by negating §21.2's *membership* predicate, which is a broader question a `noindex` page fails for an unrelated reason: doing so reports a self-canonical page for "disagreeing" with a sitemap and quotes its own URL as the evidence. A canonical this build cannot resolve — another origin, a `mailto:`, an empty value — is not self-canonical, because it names something unify cannot confirm is this page.
- **A canonical naming a location the site does not emit is P13, not a finding.** §12 checks `link href` for every `rel`, so the build already refuses to publish it (§22.5).
- **A share image naming a location the site does not emit is P13 too.** Product-spec §6.3.4 lists "missing social-image targets" among the findings this command should carry, and the intent is met — but it is met by v0.7.0's §12, which has always checked `content` on every `og:`/`twitter:` meta. Reporting it here as well would answer one question with two mechanisms, which is precisely what §6.1's single-interpretation constraint forbids, and it would answer it *worse*: a finding reports, while P13 blocks the publish. `image-missing-dimensions` remains a finding because a missing dimension is not a broken reference — nothing to resolve, nothing for §12 to check. An image on **another origin** is skipped by §12 and unreachable here, because verifying it needs the network; that is `audit --external`, never a build dependency (§6.1).

### 24.5 The report

Findings print to stdout, one finding as two lines:

```
<source path>: <severity>: <evidence> [<id>]
  fix: <one concrete action>
```

followed by a count line: `audit: N broken, M incomplete`, or `audit: nothing to report` when there are none. Evidence quotes the output — the title that repeats, the id that collides, the sitemap that lists the page — so a reader can act without re-deriving what the command saw. The fix names one action.

Ordering is by source path, then by finding id: deterministic, and stable across runs of an unchanged site, for the same reason §14.1 orders diagnostics.

The report never contains a score, a grade, a percentage, a ranking, a keyword count, or a character count. This is a rule about the *output*, not only about the checks: a command that computed no score but printed "12 issues — 78% healthy" would be assigning one.

Diagnostics keep their own stream. §14's problems and advisories print to stderr during an `audit` exactly as they do during a `build`, because the pipeline that produced them is the same pipeline.

### 24.6 Exit codes

| condition | exit |
|---|---|
| invalid usage | 2 |
| the pipeline raised a problem | 1 |
| findings, without `--strict` | 0 |
| any finding, with `--strict` | 1 |

`--strict` is the opt-in CI gate product-spec §6.3.4 describes, and it gates on **any** finding, of either severity. The flag keeps its §14.1 meaning as well — advisories still count — because it means one thing everywhere: *hold this build to the stricter standard*.

A pipeline problem exits 1 whether or not `--strict` is set, and whether or not there are findings. Evaluating output that cannot be built is meaningless, and the findings printed alongside it describe a site that would never ship.

### 24.7 What `build` does with all of this

Nothing. `build` derives the manifest (§20.2 — it must, or the invariant that deriving it changes nothing would only be tested on the pages a discovery feature happens to touch), and never calls the evaluator. No finding in this section can affect a build's output, its diagnostics, or its exit code.
