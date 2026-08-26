# unify — Conformance Specification

**Status**: normative
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
2. The resolved path must lie inside the source root — under `--generate`, inside the §33.3 **namespace**, where the source root and the generated overlay share one path space and the source tree wins a tie. Escaping it (`../…`) is a problem (same shape as not-found; traversal safety is internal and always on).
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

6. An `<include>` without `src` is a problem. An `<include>` with non-whitespace content between its tags is **not** this section's business: it is a slotted include (§32), resolved by parsing rather than splicing, and its own problems live there. Everything in this section is about the empty form, which is unchanged. The shape this section once refused outright is now the one §32 gives a meaning — and it still refuses every target that cannot take content:

```
src/index.html:9: problem: <include> with content: _includes/card.html is not a .fragment.html
  in: <include src="/_includes/card.html"><h3>My title</h3></include>
  fix: an include may carry content only when its target is a fragment with slots
  fix: rename it _includes/card.fragment.html, or empty the include
```

7. The void form (no closing tag) builds identically and carries advisory A01 (§14.3).
8. **Code samples are not directives.** Both spellings are **inert** wherever they sit textually inside a `<pre>` or `<code>` element: between an opening `<pre`/`<code` tag and its matching close, with one nesting depth counted across both names (so `<pre><code>…</code></pre>` is a single region), case-insensitive, an unclosed opener protecting to the end of the text, and a self-closed `<pre/>` opening nothing. An inert occurrence ships byte-for-byte as authored and produces **no diagnostic** — not P01's not-found (its target may not exist; it is a sample), not A01's void-include. The regions are computed on the same raw text the scan reads, before any parsing — textual, like the splice itself — so the rule applies identically in an HTML host and in a Markdown page's converted HTML (where fenced code was already entity-escaped and never matched; this rule additionally covers raw HTML `<pre>`/`<code>` written in Markdown). Exactly `pre` and `code`, no other elements: `<script>`, `<style>`, and `<textarea>` are unchanged. A page that wants the syntax *displayed* still writes the escaped form (`&lt;include`), since a browser parses a raw `<include>` inside `<pre>` as an empty element; what this rule guarantees is that unify never splices content into the middle of an example. Downstream, an `<include>` element that reaches emitted output is by definition inert (a live one was spliced away before emit), so the sample stays byte-for-byte all the way through: **§11 never rewrites its `src`** and **§12 never reads a reference from it** — its target may name a never-emitted or nonexistent path, because it is a sample, not a link.

Inlining is textual and happens before parsing, so an include may appear anywhere outside item 8's inert regions — `<head>` included — and a fragment's top-level elements become the host's (a fragment included at body top level may therefore carry `slot=` fills, and a fragment included in a layout body may contribute `<slot>` elements; both are consequences of this ordering, not extra rules). In a Markdown page the same textual inlining runs on the converted HTML (§10.1); the timing is the only difference.

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
4. Walk from the page's directory up to the source root; the first `_layout.html` found applies. (Discovery is by name; the file's excluded status is irrelevant.) Under `--generate` the walk climbs **virtual** directories and consults both roots at each level (§33.3), so a generated page discovers a layout exactly as a hand-written page in the same position does.
5. Otherwise: no layout; the page is emitted as-is.

An explicit V other than `none` must be a path ending in `.html`: `/`-prefixed resolves from the source root — the §33.3 namespace root under `--generate` — anything else relative to the declaring file. A value without a `.html` extension is a problem (before any existence check):

```
src/about.md:2: problem: layout is not a path: "default"
  fix: layouts are paths — write layout: /_layout.html (or a relative path ending in .html)
```

A path that resolves to no file, or escapes the source root, is a problem with the include-not-found shape (§5.1 step 3), including the casing line.

Layout-less emission, both routes (step 1's opt-out and step 5's nothing-found): an `.html` page is emitted from its own text (§3); a `.md` page is emitted inside the minimal synthesized shell of §10.7.

### 6.2 No chaining

Layout chaining is not part of the composition model. **A layout that itself declares `data-layout` — any value, including `"none"` — is a problem (P15)**, located, naming the layout file and stating plainly that chaining is not supported; it is never a silent no-op:

```
src/blog/_layout.html:6: problem: this layout declares data-layout — layout chaining is not supported
  fix: make blog/_layout.html a complete standalone layout, or delete it so pages use /_layout.html
```

A section that wants its own chrome writes a complete `_layout.html` in its directory — the discovery walk (§6.1 step 4) already scopes it to that section. Chaining is a recorded future candidate (product spec §6) and returns only on demonstrated demand.

### 6.3 Misplacement and migration (problems)

- `data-layout` on any element other than `<html>`/`<body>`: problem naming `<include src="…">` as the replacement — `data-layout` is never a component import.
- Any `data-unify` attribute, any `data-slot` attribute, and any class token beginning `unify-`, anywhere in any source file — **excluded files included**: excluded files are build material (§1) and are scanned like everything else; only the never-shipped list (§4.3) escapes scanning. A retired spelling in an excluded fragment or draft would otherwise sit silently meaning something else until the day the file is included or published. `data-unify` is a retired spelling, `data-slot` is the retired fill spelling, and `unify-*` is the retired area-class vocabulary; each is a problem naming the supported replacement — `data-layout`, `slot=`, and `<slot name>`/`slot=` —
- **P08 is inert inside code**, so a page can document the vocabulary it is telling you not to use. A retired spelling is a problem where it is *markup* and never where it is a *sample*. In HTML that means inside `<pre>` or `<code>` — the same textual region §5.1 item 8 already makes inert for `<include>`, so both checks agree about what a code sample is. In Markdown, where this check reads raw source before conversion, it means the three forms the language has: a fenced block (backticks or tildes, closed by a run of the same character at least as long as the opener), an indented block, and an inline span (closed by a backtick run of equal length). HTML's rule applies inside Markdown too, since a Markdown file may carry raw HTML. The CommonMark reading is deliberate rather than loose, because every byte marked inert is a byte this check stops protecting: an indented run counts only after a blank line — CommonMark forbids an indented code block from interrupting a paragraph — so an indented *continuation* line is still markup, and a retired spelling in it is still reported.
`data-slot` earns its place here for the same reason the other two do, and more sharply: it is inert in the current model, so a page carrying it composed at exit 0 with the fill silently dropped. The worst observed case was a shared layout whose `<title>` carried the retired attribute, which left every page on a production site emitting the layout's default title with no diagnostic of any kind. That case looked like this in the layout it was found in — `<title data-slot="title">— Ashgrove</title>` — and this sentence can now spell it out, which it could not before: P08 is inert inside code (below).

```
src/index.html:2: problem: data-unify is a retired spelling
  fix: write data-layout="/path.html" (or data-layout="none") on <html> or <body>
src/_layout.html:14: problem: class "unify-footer" is retired area vocabulary
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
src/blog/_layout.html:4: problem: this layout declares data-layout — layout chaining is not supported
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

markdown-it's default feature set — CommonMark plus the two grammars that preset adds, **GFM pipe tables and strikethrough** — beyond §10.4 heading ids and the include-block rule below. The engine is used in its own default configuration rather than a narrowed one: a pipe table publishing as a paragraph of literal `| Flag | Meaning |` text is how unify's own documentation site came to ship 247 such rows and not one `<table>`, and a file that renders correctly in a repository should not look broken once unify publishes it. `linkify` and `typographer` are markdown-it *options* rather than rules and remain off, so no address or quotation mark is rewritten unless asked for; those options and markdown-it's plugin interface are where per-site Markdown configuration would go if it is wanted, which §18's saved-CLI-flags rule does not currently provide. Output filename swaps `.md` for `.html`. Layout rules then apply exactly as for an HTML page whose body is the converted output and whose head is synthesized from frontmatter.

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

Synthesized elements merge by §8 exactly as if the page had written them; their serialization is fixed: double-quoted attributes, `name`/`property` first, then `content` (`<meta name="description" content="…">`), and `<title>TEXT</title>`. Two consequences of "as if the page had written them", stated because implementations otherwise diverge: a present-but-empty `title:` counts as absent, so §10.3's `<h1>` fallback applies to it exactly as §8 row 2 treats an empty page `<title>`; and `class` takes a string — any other value is treated as absent rather than coerced. A `.md` file included as a fragment has its frontmatter stripped and **never validated** (§5.1 step 4): the data is provably unused, and a shared fragment must not make an unrelated page's build depend on the shape of metadata nobody reads. One further key is reserved, and only for the value it may take: `schema` becomes `<meta name="schema">` exactly as this table says, and §26.4 restricts its value to the three types unify generates. `date` and `lastmod` become plain metas that §20.3 then reads (§28.3). `tags` and `categories` become plain metas that create no collection, and unify reports nothing about them (§28.2). `draft`, `permalink`, and `slug` are **P24** (§28.1): each is another generator's key, and a `<meta>` that looks like it worked is the failure §14 exists to forbid — a leading underscore is how a page is held back, and a source path is how a page is addressed. A `date` a consumer can use is `date`'s own doing rather than this table's: §20.10 reads the emitted meta and accepts it only as W3C-DTF. The honest gap, stated: frontmatter cannot express `rel="canonical"`, `rel="preload"`, or JSON-LD. Preloads and JSON-LD are layout material; a canonical is not — it names one page's own address, a layout-supplied value stamps every page with the same URL (silently wrong on every page but one, and consequential: share crawlers consolidate by canonical), and a Markdown page cannot override it, because §8's replace rule needs an HTML head to carry the page's own tag. A page that needs a canonical is written in HTML, or does without.

**Value serialization.** VALUE is the value's text, by YAML form. A **plain scalar** serializes as its source text, exactly as written — `featured: true` → `content="true"`, `date: 2026-01-01` → `content="2026-01-01"`, `weight: 0.50` → `content="0.50"`: no type coercion ever rewrites a value (booleans don't normalize, dates don't reformat, numbers keep their zeros — the author's bytes, not YAML's data model). A **quoted scalar** serializes as its content with the quotes gone (`note: "Colons: fine"` → `content="Colons: fine"`); a **block scalar** (`|`, `>`) as the string YAML defines; an **empty value** as the empty string. The list rule composes with blocks: a list under `og:image` emits one `property="og:image"` meta per item, in order. What has no text form is a problem, located at the key (**P17**): a mapping nested below a key that already names one, or a list item that is itself a mapping or list. Because the two spellings name the same key, **eligibility is decided by the key's name, not by nesting depth**: a block under `og:image:` is P17 exactly as `og:` → `image:` → `url:` is, since the effective key `og:image` already carries its prefix and there is nothing left to flatten into. Counting recursion levels instead would let the flat spelling through and reject the block one, which would break the equivalence above. Inventing a serialization or dropping the value would each be a silent lie:

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

Applies to every URL in `href`, `src`, `srcset` (each URL in the comma-separated list, descriptors untouched), `poster`, the `content` of the **URL-valued `og:`/`twitter:` metas** §12 names, and the **URL part of a `<meta http-equiv="refresh">` `content`** — §12 states the grammar that decides where that part begins and ends, and both sections read it from there — in the composed page — after includes and layouts, before §11.2/§11.3. Skipped entirely: URLs with a scheme or `//` prefix, `mailto:`/`tel:`/`data:`/`javascript:`, fragment-only (`#x`), and empty values. Never reached: `url()` inside `<style>` blocks or `style` attributes — those values ship as written (§12 still checks them against the output tree). The consequence under §11.3 is stated here because the old advice in this sentence was itself the trap: a root-relative `url()` never receives the base's path prefix, so it resolves in the output tree (and passes §12) while 404ing at any subdirectory deploy address. A `url()` therefore belongs in a stylesheet file, written **relative to that file** — mirror copy keeps stylesheet-internal references working at every deploy address — and the same is true of any URL inside JavaScript, which no build step reads.

The same holds, for the same reason and one more, inside a `<script type="application/ld+json">` block: **§11 never rewrites a URL in structured data, in any of its three phases.** Doing so would mean deciding which JSON strings are URLs *while editing them*. §12 makes that decision below, and makes it by naming the URL-valued properties rather than by inspecting strings — the only form of that decision safe enough to sit in the publish path, as the bullet's own history records: the shape test it replaced blocked the publish of four conforming shapes, and "a visible problem the author can answer" is not an answer when the only edit available is to rewrite correct structured data. A wrong rewrite is worse still, and differently: it silently republishes the author's own claim as a different one, with no diagnostic anywhere. So a root-relative value in a JSON-LD block inherits exactly the consequence this paragraph already names for `url()`: it resolves in the output tree, passes §12, and at a subdirectory deploy address names the origin's root rather than the site's. That is not left silent — §24.4's `jsonld-url-unprefixed` reports it once the site has told unify its address — and it is a finding rather than a problem because the identical value is correct at a root deploy, which is a difference no build can see without `--base-url`.

Per URL `u` in an element whose provenance (§1) is file `A`:

- `u` starts with `/` → unchanged.
- `u` is relative and `A` is a **layout or include file** → resolved against `dirname(A)`, emitted root-relative: `/` + the normalized source-root-relative path.
- `u` is relative and `A` is the **page itself** → left exactly as written (the output file sits at the mirrored path, so it is already correct) — unless the page's output location moved (`--pretty-urls`, §11.2), in which case it is resolved against `dirname(A)` and emitted root-relative.

A refresh URL is on that list for the reason the metas are: it is an address in an attribute unify parses, so provenance governs it exactly as it governs the `<a href>` beside it. A `_layout.html` declaring `content="0; url=target.html"` means the target beside **the layout**; left alone, the value resolves against each consuming page instead — `/target.html` from the root, `/deep/target.html` from `deep/` — so one authored redirect sent readers to two different pages, and because both of those files existed, no check anywhere could see the difference. §11.2 and §11.3 follow for the same reason: under `--pretty-urls` a redirect to `/about.html` names a file the build did not emit, and under a subpath `--base-url` a root-relative redirect leaves the site. The **origin** is never prepended — a redirect is fetched by the browser that already has the page, like an `href` and unlike a canonical (§11.3).

Fixture: `src/_includes/nav.html` contains `<img src="logo.png">` and `<a href="/about.html">`. Included (via the layout) into `src/deep/page.html`, the output contains `<img src="/_includes/logo.png">` and `<a href="/about.html">`. (And `/_includes/logo.png` is excluded by default, so the reference check then reports it — an image stranded in an underscore folder fails loudly, §12.)

### 11.2 `--pretty-urls`

**Files**: every page output `X.html` moves to `X/index.html`, except any `index.html` (already pretty) and the root `404.html` (hosts require that exact path). `about.md` → `about.html` → `about/index.html`.

**Links**: after §11.1, every internal URL in `href`/`src`/`srcset`/`poster`, the `content` of the **URL-valued `og:`/`twitter:` metas** §11.1/§12 name, and a `<meta http-equiv="refresh">` URL — one closed list, the same one §11.1 and §12 already read (§11.3 additionally prefixes every `og:*`/`twitter:*` meta, a wider set — see §11.3) — that resolves to an emitted page's `.html` output is rewritten to the page's pretty URL — resolve first (against provenance), then transform, emit root-relative:

| Written (in a root-level page) | Emitted |
|---|---|
| `./about.html` | `/about/` |
| `/blog.html` | `/blog/` |
| `index.html` | `/` |
| `docs/guide.html` | `/docs/guide/` |
| `./contact.html?form=1` | `/contact/?form=1` |
| `/blog.html#latest` | `/blog/#latest` |
| `sub/index.html` | `/sub/` |
| `/about` | `/about/` (extensionless) |
| `/sub` | `/sub/` (extensionless, naming `sub/index.html`) |
| `/404.html` | `/404.html` (never moved, never transformed) |

**The extensionless spelling names a page too.** `--pretty-urls` publishes `about.html` at `/about/`, so `/about` is the URL the flag exists to produce and the one an author reaches for; it is resolved against the emitted page set exactly as `/about.html` is, and emits the same `/about/`. A URL with no trailing slash and no `.html` is tried first as `X.html` and then as `X/index.html`; if neither is an emitted page it is preserved untouched, and §12 reports it unchanged, so a genuine typo still fails loudly. The two candidates can never both be pages in a build that publishes — `about.html` and `about/index.html` both move to `about/index.html` under this flag, which is a §13 collision that blocks the build before any link is resolved.

This was not so until 2026-08-24: the rewrite was keyed on the `.html` output alone, so `/about` reached §12 unrewritten and failed as an unresolvable reference. The cost was measured on a real site — 198 problems across 39 files on fwdslsh.dev, every one of them a link spelled the way `--pretty-urls` advertises — and the inconsistency ran inside unify itself, because `unify dev` already served `/about` by falling through a directory request to its `index.html`, as every static host does. The flag rejected at build time the spelling its own server answered.

Preserved untouched: external URLs, `mailto:`/`tel:`/`data:`, fragment-only links, and URLs to non-page files (`/assets/doc.pdf`, `/style.css`) — the same test that leaves an asset `href` alone leaves an asset-targeting `og:image`/`twitter:image` alone too, since both are decided by the one page-vs-asset lookup stated above (the extensionless-resolution paragraph). Query and fragment always survive transformation. In a **moved** page, every remaining relative URL (to assets etc.) is emitted root-relative per §11.1, so `![diagram](diagram.png)` beside a Markdown page keeps working. A `<meta http-equiv="refresh">` URL is transformed like a link, because it is one: a redirect to `/about.html` in a build that emits `about/index.html` names nothing. A page-targeting `og:url`/`og:image`/`twitter:image` naming an emitted page in its plain `.html` spelling comes out in the directory spelling exactly as an `href` to the same target does — until 2026-08-26 this meta list was read by §11.1/§12 but not §11.2, so a page authoring `og:url` beside a matching `<a href>` had its anchor rewritten while the meta, naming the identical `.html` spelling, failed §12's reference check.

### 11.3 `--base-url`

The metas were added to that list once §12 began checking their relative spellings. §11.3 has always treated these values as URLs; §11.1 declining to re-root them was an asymmetry with a cost that only became visible then. A layout declaring `og:image` as `card.png` emits a value that resolves against each *page* — `/blog/card.png` for an asset at `/card.png` — so the build wrote a URL it could see was wrong and then blocked on it under "check the path spelling", with the spelling already right. Provenance rewriting fixes it at the source, exactly as it does for an `<img src>` in the same layout.

**One form: the site's whole address**, scheme and domain included (`https://example.com/repo/`). Its **path part** prefixes every root-relative URL in `href`/`src`/`srcset`/`poster` of emitted HTML and the root-relative URL part of a `<meta http-equiv="refresh">` `content`, plus root-relative values in `<meta property="og:*">`/`<meta name="twitter:*">` `content` — one list, so no root-relative URL the output declares can dodge the prefix. **Root-relative means one leading slash.** `//cdn.example.com/card.png` is protocol-relative — an absolute URL borrowing the page's scheme — and §11.1 has always skipped it with the other absolute forms; this section's own test was `startsWith("/")`, true of both, so it emitted `https://example.com//cdn.example.com/card.png` and shipped the author's URL rewritten into a different, broken one. A CDN-hosted `og:image` and an authored protocol-relative canonical are both ordinary, and both were corrupted while the `<img src>` beside them was correctly left alone. Its **origin** is additionally prepended to the og:/twitter: `content` values and the `<link rel="canonical">` `href` — the elements crawlers require to be absolute. Absolutization is therefore always **origin + path prefix**: with `--base-url https://host/repo/`, an og:image of `/assets/x.jpg` emits `https://host/repo/assets/x.jpg`, never `https://host/assets/x.jpg` — origin-only absolutization would 404 for exactly the crawlers the rule exists for. Values that are not root-relative are untouched. Source files stay rooted at `/`; only output changes.

A bare path (`--base-url /repo-name/`) is a **usage error** (exit 2) naming the full form. It was accepted until 2026-08-13, prefixing links correctly while leaving og:/twitter:/canonical root-relative — which the rationale above makes unusable, since a crawler fetches those with no page address to resolve them against. Ratification made the cost measurable: seventeen of eighteen samples handed a full deploy address chose the bare path anyway, and five of five then published dead preview images with a green build and a report claiming the sharing requirement verified. A diagnostic was tried first (advisory A15, retired the same day it was added); deleting the weaker form is the repair that leaves nothing to warn about.

Order within the pipeline: §11.1 → §11.2 → §11.3.

---

## 12. The reference check (post-build, publish-blocking)

After the temporary tree is complete, every internal URL the output contains is checked against the emitted files — not only the ones rewriting touched:

- In every emitted HTML file: all `href`, `src`, `srcset`, `poster` values; `<link>` `href` for every rel; the `content` of the **URL-valued** `og:`/`twitter:` metas — `og:url`, `og:image`, `og:audio`, `og:video`, `twitter:image`, `twitter:player`, and their `:url`/`:secure_url`/`:src`/`:stream` forms — in every spelling, root-relative, relative, or absolute.

  The scope is a closed list of *properties* rather than a test on the *value* for a reason this document got wrong for its whole life. It cannot be every `og:`/`twitter:` meta, because `og:site_name` is "Meridian Coffee" and `twitter:card` is "summary", and checking those as relative references would fail every correct site that has one. It was therefore written as a test on the value — root-relative or `http(s):` — which checked the two spellings an author is least likely to get wrong and never checked the third. A **relative** `og:image` naming no file was collected by nothing and reported by nothing, and §24.4 went on to drop its own `image-missing-target` finding on the stated grounds that this rule already covered it. Naming the properties makes the *kind* of the value the criterion, so every spelling of a URL is checked and no prose ever is.

  The `og:`/`twitter:` prefix is the boundary, and it is chosen. Open Graph's **vertical** namespaces — `article:author`, `music:album`, `video:actor`, `book:author`, `profile:username` — are URL-valued and are not checked, because §12's scope has always read "og:/twitter: metas" and widening to a second family is its own decision rather than a detail of this one.
- In every emitted HTML file: **the URL part of a `<meta http-equiv="refresh">` `content`**. The accepted grammar is bounded, and it is stated here rather than in §20.11 because both sections read it and a second reading would let the checker and the manifest disagree about one page's redirect: optional whitespace; one or more ASCII digits (the delay — a fractional part is skipped rather than read); optional whitespace; then, when anything follows, a `;` or `,`; optional whitespace; the keyword `url` in any ASCII case; optional whitespace; `=`; optional whitespace; and the URL. The URL may be wrapped in matching `"` or `'`, which are not part of it; unquoted, it ends at the first whitespace. A value with **no leading digits** declares no refresh and is not read at all. A value whose second part does **not** begin with `url` declares a refresh whose target this specification does not read: nothing is checked, and §20.11 records no target. That is deliberate — browsers accept spellings beyond this grammar, and a publish-blocking problem raised on a URL unify guessed at is worse than a redirect it declined to check. The delay never enters the test: `content="600; url=/gone.html"` names a file that must exist exactly as `content="0; …"` does. The reference is located at the **URL's own offset inside the attribute value**, like every other attribute reference, so §14.1's provenance mapping lands inside the text that actually wrote the URL. One `content` attribute has one reader: an element that also declares a URL-valued `og:`/`twitter:` key spells two readings of one value, and the metas' reading — which predates this one — keeps it, so no phase can rewrite one attribute twice.

- In every emitted HTML file: inside every `<script type="application/ld+json">` block that parses, **the string value of a URL-valued property, at any depth**, when that value is **root-relative** — one leading slash. The properties are a closed list: **`url`, `logo`, `image`, `thumbnailUrl`, `contentUrl`**. A property carries through arrays and applies at any depth, because that is how the vocabulary spells multiple values and nested entities: `"image": ["/a.png", "/b.png"]` is two references, and `"publisher": {"logo": "/img/logo.png"}` is one.

  The criterion is the **property**, never the value's shape — the same repair as the `og:`/`twitter:` scope one bullet above, for the same reason, and it is written out twice because this bullet reintroduced that mistake one bullet after the paragraph documenting it. Shape does not answer §12's question. A shape test decides whether a string *looks like a path*; what makes a value checkable is whether it is a **locator**, and in structured data most root-relative strings are not. Four conforming shapes, all of them ordinary, blocked the publish under the shape rule and left `dist/` at the previous build:

  - `"target": {"@type": "EntryPoint", "urlTemplate": "/search?q={search_term_string}"}` — Google's sitelinks-search-box shape, verbatim. `urlTemplate` holds an [RFC 6570](https://www.rfc-editor.org/rfc/rfc6570) URI **template**; expanding it is the consumer's job, and no file answers the unexpanded string.
  - `"@id": "/#website"` — a node identifier, which on a site with no root `index.html` names nothing and is not meant to.
  - `"identifier": "/ISBN/9780000000000"` — an identifier in a slash-shaped scheme; `identifier`'s range is `Text` as readily as `URL`.
  - `"softwareRequirements": "/usr/bin/node"` — a path on a machine that is not this one.

  Each printed `does not resolve to any emitted file` under `fix: check the path spelling and casing`, wrong on both counts: the spelling was right, and the path was never meant to exist. The author's only available answer was to rewrite conforming structured data.

  The two arguments the shape rule rested on do not survive those four. "A key allowlist is a claim about a vocabulary this build does not read" — naming five terms is a far *smaller* claim than the shape rule's own, which was that every root-relative string anywhere in that unread vocabulary is an address on this site. "Shape is decidable from the document in hand" — decidable, but not the question asked.

  The list is **closed, short, and biased toward omission**: a missing entry costs a missed check, a wrong entry costs the blocked publish of correct markup, and those are not the same price. Every entry is a schema.org property whose value, **as the vocabulary is used in practice**, is the address of a file this site emits. That is a claim about each of the five, and deliberately not a claim about the class: these are not *every* property that fits the description, and the bias stated in the previous sentence is exactly the licence not to be exhaustive. `mainEntityOfPage`, `significantLink`, `relatedLink` and `acquireLicensePage` all fit it and are absent, and so — the commonest site-local URL in real structured data — is the `item` of a breadcrumb `ListItem`. Each absence costs a missed check and nothing else: a page whose `item`, `mainEntityOfPage`, `significantLink`, `relatedLink`, `acquireLicensePage`, `license`, `downloadUrl` and `embedUrl` every one name a deleted file builds and publishes, exit 0.

  Deliberately absent, with the reason each is a different kind of absence: `sameAs`, which by definition names *another* site; `embedUrl` and `downloadUrl`, URL-valued but rarely site-local; the vertical namespaces, on the boundary rule stated one bullet above; and the four just listed, on frequency alone — common enough to write, not common enough that adding four more names to a list this section cannot verify against the vocabulary is worth the blocking direction. `item` is the closest call, and it is left off on this bullet's own `@id` reasoning rather than on frequency: `item` names an **entity** rather than a URL, so a string there is that entity's identifier standing in for the entity — which is `@id` in another spelling, excluded by name in the next sentence. A `ListItem` that nests the object instead needs nothing added: the depth rule already checks that object's own `url`. `@id`, `@type` and `identifier` are excluded **by omission from the list** — nothing is read under a key the list does not name, so the mechanism is the same one that leaves `mainEntityOfPage` unchecked, and the reason is that the first two are JSON-LD keywords rather than schema.org terms while the last identifies rather than locates. `@context` is excluded by omission **and additionally by name**, which is a stronger exclusion with a different failure mode: a key absent from the list is skipped as a *property*, while `@context` is skipped as a *subtree* — see the walk rule below. The distinction matters because it is where the two mechanisms would diverge: adding a name to the list can only ever start a check, but the `@context` skip stops one from descending, and only the second is capable of hiding data. A value containing `{` or `}` is a URI template and is never a reference, whichever property carries it.

  `@context` is excluded twice over, and the second exclusion is normative rather than a matter of the list: it is not a checkable property, **and its value is not data** — see the walk rule below. What remains is a document that *renames* a term, since unify expands no context, and that residual points **both** ways rather than only the safe one. A context mapping some other name onto schema.org's `logo` hides a checkable value: a missed check, the direction this list is deliberately wrong in. A context repointing the name `logo` itself at something that is not an address makes the one check unify does make the wrong one — the blocking direction, and the only route left to it. It is left standing because the alternative is term expansion in the publish path, and because a schema.org term name redefined to a non-URL meaning *on a page that also writes a root-relative value under it* is not a shape that has been observed. The `@context` value itself is such a shape, and it was observed: `{"@context": {"@vocab": "https://example.org/v#", "url": "/vocab#url", "image": "/vocab#image"}, "@type": "Thing"}` — an ordinary inline context defining what this document's `url` and `image` keys mean — printed two `does not resolve to any emitted file` problems under `fix: check the path spelling and casing` and left `dist/` at the previous build, which is this bullet's own category error committed inside the repair for it.

  **Root-relative**, the second condition, is about resolvability rather than about shape carrying the whole claim. A **relative** IRI in JSON-LD resolves against `@base` or the document's own address — the first unread here, the second moved by `--pretty-urls` — so checking one would mean guessing the base the author meant. An **absolute** one is skipped for the reason the vertical namespaces are: a spelling this section has never checked is its own decision, not a detail of this repair. §24.4's `jsonld-url-unprefixed` reads exactly these values from the same reader, so the two cannot disagree about what a reference is.

  It stays **publish-blocking** (P13), and the property list is what makes that defensible again. Under the shape rule, "is this string a locator?" was a judgement the build made about the author's data — and product-spec §6.1 keeps a judgement about intent out of the publish path, the same rule §22.5 and §23.4 cite. Under a property list it is a fact about a named term: `logo` holds a URL because the vocabulary says so, so a `logo` naming no emitted file is a broken internal reference in precisely the sense §12 exists for, and is the same fault as the `og:image` naming nothing, which P13 has always covered. Demoting it to a §24 finding would answer one question with two mechanisms of different strength, and would let one missing file block the publish or not depending on which tag described it.

  The block is read as **JSON, not scanned as text**: a key selects a value and is never itself a reference, **the value of a `@context` key is skipped whole at any depth** — it is a term definition, so every string beneath it is an IRI that gives a key its meaning rather than an address on this site, and a term may be defined by an object as readily as by a string — and a block that does not parse is skipped entirely — §24.4's `jsonld-invalid` is what reports that, and hunting for URLs inside broken JSON would report one fault twice, the second time under a message about path spelling. A block inside a `<template>` is not read at all (§20.2). **The diagnostic is located at the `<script>` element**, and deliberately no more precisely: a position inside the JSON is not a position in the author's source once the block arrived through an include, and §14.1 omits precision rather than inventing it. Because §11 never rewrites these values (§11.1), a root-relative `"url": "/about.html"` in a JSON-LD block fails here in a `--pretty-urls` build — correctly: the emitted structured data names an address the site does not serve.

- In every emitted CSS file, every `<style>` block, and every `style` attribute of emitted HTML: `url(…)` tokens. (Rewriting deliberately never reaches these — §11.1 — but checking is not rewriting: the exemption is about not editing the author's CSS, not about not reading it, and a `url()` the author got wrong must fail here, not 404 quietly.)

A URL is internal when, after stripping the `--base-url` prefix — the path prefix, or the full base (origin + path) when a full URL was given, so values §11.3 absolutized stay checkable instead of masquerading as external — it is root-relative or relative

**An absolute or protocol-relative URL is parsed, never string-matched**, because comparing it to the base as text was wrong three ways at once and each one blocked the publish of a legal site. Without an **authority boundary**, any host whose name merely begins with the base origin read as an internal path: a site at `example.com` could not link to `example.community`, `example.company`, or an attacker's `example.com.evil.test`, each becoming a **P13** quoting a fragment of the *host* as a path the author had mistyped. Without **host equivalence**, `https://EXAMPLE.com:443/about.html` — the same URL by [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) §6.2.2.1 and §6.2.3 — reported a path spelled `:443/about.html`, a string in no file. And the two sides sat in **different encoding spaces**: `--base-url` stores its path prefix as `URL.pathname` gives it, percent-encoded, while the authored value carries whatever the author typed, so deploying under `https://example.com/café/` failed to strip its own prefix and reported every page of an ordinary two-page site. `URL.pathname` answers all three at once, and it is the reason this is a parse rather than a comparison

 (resolved against the containing output file's URL). Query and fragment are stripped; external/`mailto:`/`tel:`/`data:`/fragment-only URLs are skipped. A directory URL (trailing `/` or empty path) checks for `index.html` within it. A URL that resolves to no emitted file is a **problem** naming the source file, the reference, and the line where known — a renamed page, an asset stranded in an underscore folder, a hand-written pretty URL in a non-pretty build, and a path whose case doesn't match the file all fail here, loudly. (Case is compared exactly, byte for byte: a reference that only matches case-insensitively still fails — it would 404 on the Linux host.)

A `url(...)` in any CSS unify emits is a reference, and so is an `@import` naming its target as a bare string — `@import "/base.css"`. The two spellings of one at-rule were not treated alike: `@import url("…")` was already a `url()` and checked, while the bare form, which is the commoner one in hand-written CSS, was not, so a stylesheet importing a stylesheet that does not exist published green while the identical mistake in a `url()` one line down blocked the build.

One unresolved target earns a second fix line: a reference to exactly `feed.xml`, `sitemap.xml`, `assets/unify/catalog.json`, or `assets/unify/search-corpus.json`, in a build that did not emit it. For that author the standing fix line is wrong on both counts — the spelling is right, and no source file is missing — because the name belongs to a file *this build generates under other conditions*, and the second line states the condition: `--base-url` for the sitemap; `--catalog`/`--search-corpus` for the catalog and the search corpus, each stating its own flag independently of the other (§30.1); and for the feed, whichever actually failed — no `--base-url`, no page declaring `schema: Article`/`BlogPosting`, or no declared date carrying a time of day (each day-only date already reported as A17). Ratification round 27 is the evidence: two of five authors hit this exact P13 mid-iteration and, told to check a spelling that was correct, one shipped `../feed.xml` and the other invented a build-twice model. The line names only the four generated paths §21/§29/§30 own, appears only when the file was not emitted, and changes nothing about what resolves — an authored or generated file at that path has always satisfied the check. `#fragment` targets are not validated against ids — that is a reader's judgment, not a build gate.

One absence is **not** reported: a URL that resolves to the output path of a **source page that exists but failed to compose**. That page emitted no file because of a problem of its own — already reported, and already blocking the publish — so a second diagnostic located at the *link* sends the author to a correctly-spelled path in the wrong file, and, diagnostics being path-ordered, usually prints above the one problem that matters. Measured on a twenty-page site with one page failing to compose: twenty-one problems printed, one of them real, the real one last. A reference to a target with no source file at all, and a reference to a source file that exists but is *excluded* (the stranded underscore asset above), are not this case and still fail here, loudly.

**A reference is the attribute's VALUE, not its bytes.** Character references resolve first: `href="/a&amp;b.html"` is the correct HTML spelling for a file named `a&b.html`, and that is the URL a browser fetches. Reading the bytes instead failed a correctly-written page to publish, with a diagnostic quoting a spelling that was right — a defect the earlier codebase carried from the beginning. The obligation runs both ways: a URL unify *writes* into an attribute is escaped for the same reason a URL it *reads* is decoded (§22.2), and the two are one rule rather than two conventions that happen to agree.

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
| Two outputs one folding host sees as one name, where the folding is not case alone | `café.html` written NFC + `café.html` written NFD | advisory A16 (a host that folds form and case together sees one file) |

Pages and assets cannot collide with each other by construction: `.html`/`.md` are always pages, everything else is always an asset, and mirror copy is path-preserving. Collisions are detected before any write; there is no last-write-wins anywhere in unify.

**The table is closed, and this is the argument that closes it.** A collision is two distinct emitted output paths answering to one public address, and exactly two stages can produce one. The first is unify's own address function, and it produces none: §20.5 drops a trailing `index.html` segment and percent-encodes the rest, and both steps are injective — `encodeURIComponent` escapes `%` itself, so decoding inverts it and distinct names give distinct escapes, and `about/index.html` is the only output path that can yield `about/`, an output path being a file and never ending in `/`. Percent-encoding therefore adds no row here, and neither does the trailing slash: `/about.html` and `/about/` are two addresses, and a `--pretty-urls` move that lands two sources on one file is already row two. The second stage is the **host**, whose storage layer folds names before it answers for them, and the two ordinary foldings are letter case and Unicode normalization form — rows three and four. A host that additionally strips a `.html` extension, so that `/about.html` and `/about/` become one address, is a host *feature* rather than a folding of names: it is invisible in the output tree, and choosing it site-wide is precisely what `--pretty-urls` is (§25.3).

**A11 and A16 are one question asked twice, and each says only what is true of what it names.** That is the guarantee. It has been stated twice before in stronger forms — "no pair of paths is ever named by both", then "no pair ever draws the wrong one" — and both were false; the counterexamples are kept below because each names a folding that does not do what its name suggests, and because the third attempt should be the one that survives being read against its own worked example.

A11's key is the output path case-folded; A16's is the output path in NFC, *then* case-folded, because the most common normalizing host folds both at once — `CAFÉ.html` written NFC beside `café.html` written NFD is one file on macOS, and a key that folded only the form would leave that pair reported by neither advisory. A16's key is therefore the coarser, and its group *contains* A11's whenever a name appears in both a second case and a second form.

Two rules keep each pair with the advisory whose host behaviour explains it, and **both are about NFC rather than about case**, because NFC never changes case and is therefore the only one of the two foldings that can tell the questions apart:

- **A11 names one representative per NFC form**, and is not printed when that leaves nothing to name. "Equal after lowercasing" is not "differs only by case": `toLowerCase` also collapses the canonical singletons — U+212A KELVIN SIGN → `k`, U+2126 OHM SIGN → `ω`, U+212B ANGSTROM SIGN → `å`. `Kilo.html` spelled with U+212A and `Kilo.html` spelled with ASCII `K` are one A11 group by that test, and A11 said of them "Kilo.html and Kilo.html differ only by letter case" — two strings that render identically, both capital K, naming no edit the author could make. Their NFC forms are equal, which makes them one name in two forms: row 4 of the table above, and A16's.
- **A16 skips a group only when it is A11's entirely** — every member the same after case folding *and* every member a distinct NFC form. Either half alone is wrong in a way that ships. Skipping on "the lowercase forms are identical" hands the Kelvin pair to A11. Skipping on "the NFC forms are distinct" hands the macOS pair to nobody, because that pair differs in both case and form and satisfies neither half.

What A16 then quotes is **every distinct spelling in its group**, escaped — and what it *says* about them is the folding that merges them, not a relationship between each pair. That distinction is the guarantee doing its work. A16's group is exactly the set a host folding case and form together sees as one file, so "these are one file there" is true of every member; "these differ by normalization form" is not, and was the claim until a three-spelling group showed why. `Kilo.html`, `kilo.html`, and `Kilo.html` spelled with U+212A are one group: the first two are pure ASCII with no normalization relationship to anything, and A16's sentence asserted one about them.

There is no key that both names two spellings differing only by form when they also share a case fold, and hides a case pair sitting inside a larger group: the two demands are opposite, one needing the raw bytes kept and the other needing them folded away. So a name that collides in *both* ways is named by both advisories — A11 saying it differs by case, A16 saying a normalizing host merges it with the rest — and each sentence is true of what it names. What never happens is the wrong sentence: **A11 names only pairs that differ by case**, because its group is one case-folded class and its representatives are one per NFC form, so any two it names fold together and differ in NFC. A16 makes no per-pair claim at all.

Both messages escape non-ASCII for the reason the Kelvin pair demonstrates: a sentence quoting two strings a reader cannot tell apart names no edit. Control characters are escaped with them — §14.1 fixes a diagnostic at one line, and a path containing a newline would otherwise break it. Both are advisories rather than problems for the same reason: both files ship, both are reachable on the machine the author built on, and a build cannot know where the site will be served from. Both range over **output paths**, so a pair of assets collides exactly as a pair of pages does.

A16 quotes its paths with every non-ASCII code point escaped, and every ASCII control character with them — `caf\u{00e9}.html and cafe\u{0301}.html` — because the two print identically in a terminal. That is the entire hazard, and an advisory that quoted the same-looking string twice would name no edit the author could make. The diagnostic's own `FILE:` locator stays the real path, so an editor can open it.

Three files make the split concrete. `CAFÉ.html` (NFC), `café.html` (NFC) and `café.html` (NFD) are one file on macOS, and they draw exactly two advisories, both located at the path-ordered first source. A11 says `CAF\u{00c9}.html and caf\u{00e9}.html differ only by letter case`, naming the pair a case-insensitive host folds and nothing else — the NFD spelling is not in its sentence, because that spelling does not differ from either of the others by case alone. A16 says `CAF\u{00c9}.html and cafe\u{0301}.html, caf\u{00e9}.html are one name on a host that normalizes Unicode — macOS folds form and case together, so these are one file there`, naming every distinct spelling, because on a normalizing host all three are one file and a sentence that omitted one would leave a rename that does not resolve the collision. So the two NFC spellings appear in both sentences: that name collides for two reasons, and each sentence names the host behaviour that explains its own. A16's sentence is about the group and asserts nothing about any pair inside it, which is what lets it stay true when the group holds a pure case pair; A11's is about a pair, and is only ever printed for pairs that differ by case.

Both advisories name each path once. The located path opens the sentence and never reappears in the list that follows — when two sources produce one output path (row one's problem) that path is in the group twice, and quoting it on both sides would read as a rename of a file to its own name.

A reference *written* in the other form is not this rule and is not softened by it: `href="/café.html"` in NFC naming a file written NFD resolves to no emitted file and stays **P13** (§12, §25.3). A16 reports the files; §12 keeps reporting the link.

---

## 14. Diagnostics

### 14.1 Contract

Two severities exist: **problem** (blocks publish; exit 1) and **advisory** (never affects what is published; with `--strict`, affects the exit code). There is no third word — never "warning", "error:", or rule codes. Exit codes: `0` published (with `--dry-run`: would have); `1` problems found — nothing published, previous output untouched — **or**, under `--strict`, advisories alone, which change the exit code *without* changing what was published; `2` invalid usage or fatal environment error (unknown flag, missing source directory, the `--clean` containment refusal, a port already in use). The `--strict` distinction is deliberate and is stated the same way in product-spec §4: a stray `.psd` must never cost you a publish, so `--strict` gates CI without withholding the site.

Diagnostics go to stderr; the build summary and `--dry-run` list go to stdout; both ordered by path, then line — two runs over the same tree print the same bytes. **Internally a diagnostic's `file` is source-root-relative; it is made relative to the working directory once, immediately before printing.** Every example in this document shows the printed form (`src/about.html:12: …`), which is why the two look different — stated because two independent implementations each had to derive it, and a third should not have to. Modules that never see the working directory therefore emit root-relative paths and are correct to. Every diagnostic line begins `FILE:LINE: SEVERITY: ` (line omitted when unknown: `FILE: SEVERITY: `). That prefix and the severity token are stable contract; the message after them is prose and is not — the diagnostic examples throughout this document fix the prefix and the shape, and their message wording is illustrative. Continuation lines are indented two spaces: `in:` (the offending source text) and `fix:` (one edit per line; path-shaped messages always include `fix: check the path spelling and casing`). Cycle and depth messages print the full chain with ` → `. `DEBUG=1` adds stack traces.

Location attribution is fixed, not stylistic: a cycle or depth problem locates at the **outermost include site** — the file and line of the include element where expansion entered the chain; a collision problem at the **path-ordered first** of the colliding sources; a reference problem (§12) at the reference's **provenance file** (§1; for a `url()` in a CSS file, that file), at its line there when known; and every other located diagnostic — §6's layout selection, §7's composition, §8's charset advisory, §12's references — at the **provenance file** of the offending markup, at its line *in that file*. The examples throughout this document already follow these conventions; they are contract, so two implementations point the author at the same place.

That last clause has a consequence worth stating outright, because implementations reach it late: composition runs on include-inlined text (§2 step 2), so an offset in the text a composer holds is **not** a position in the file that text is attributed to — every line a fragment splices in above a fault shifts it, routinely past the end of the file the message names. A `<slot>` or a duplicate sink an include contributed is therefore reported **in the fragment that wrote it**, at its line there, never at the host's post-inlining line, which is a position no source file has and which a differently-implemented composer would number differently. Combined with deduplication below, one such fault in a fragment consumed by twenty pages is one diagnostic naming one line of one file.

**A line is omitted rather than guessed.** Where a position cannot be mapped back to a line of the named file, the `FILE: SEVERITY:` form of DIA-06 is required, not a plausible-looking number: a Markdown page converts before its includes inline (§10.1), so an offset attributed to a `.md` source indexes converted HTML and no line of the author's file corresponds to it. Printing the nearest number would be worse than printing none — it is checkable-looking and wrong. The rule covers arithmetic as well as guesswork: a build that inserts whole lines into a page after composition (§22, §26) must number a later offset against the text those insertions were measured in, or every line the insertion added is added to the number and the diagnostic prints a line the file cannot hold. And where the offending markup is a **generated** element — one no source file wrote — §26.7 fixes both halves: the file is the page the element was generated for, and there is no line.

Diagnostics are **deduplicated** before they are counted or printed: two diagnostics with the same file, line, severity, message, `in:` and `fix:` lines are one diagnostic, however many times the build encountered it. This follows from the attribution rule above rather than adding to it — a problem located at a shared include or layout is one problem at one line of one file, whatever number of pages consume it — and it is what keeps the printed count and the printed lines in agreement. Two faults that would print identically but are genuinely distinct — the same relative `url()` in shared chrome, which §11.1 does not rewrite, resolving against different consuming pages (§12) — are distinguished by their resolved targets and both printed.

### 14.2 Problems (the closed list)

The bold IDs are the stable identifiers used by `tests/conformance/rules.tsv` and by tests; list position is not meaningful.

1. **P01** — Include target missing, not `.html`/`.md`, or escaping the source root (§5.1)
2. **P02** — Include cycle / depth over 10 — chain printed (§5.1)
3. **P03** — `<include>` without `src`; `<include>` with non-whitespace content (§5.1)
4. **P04** — Layout reference not a `.html` path (bare name) (§6.1)
5. **P05** — Layout target missing or escaping the source root (§6.1)
6. **P15** — A layout declares `data-layout` — layout chaining is not supported (§6.2)
7. **P07** — `data-layout` on a non-root element (§6.3)
8. **P08** — `data-unify` attribute; `data-slot` attribute; `unify-` class token (§6.3)
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
23. **P24** — A Markdown page's frontmatter carrying `draft`, `permalink`, or `slug` (§28.1). Located at the key. Each is another generator's key that unify does not honour, and §10.2 would otherwise turn it into a `<meta>` that looks like it worked; the message names the unify mechanism that does the thing the author was reaching for. The key is the problem whatever its value, and the scope is frontmatter only — no generator reads `<meta name="draft">`, so an HTML author writing one is writing an ordinary meta about their own content
23. **P25** — A non-empty `<include>` whose target is not a `.fragment.html` (§32.2). Located at the include element and naming the target
24. **P26** — A non-empty `<include>` whose target is a `.fragment.html` declaring no `<slot>` (§32.2). Located at the include element and naming the fragment; the content would be dropped, which the content-loss law never permits
25. **P27** — A `<head>`, `<html>`, or `<body>` element inside a fragment reached by a non-empty `<include>` (§32.3). Located at that element. A fragment contributes no head and no root attributes, so the element would land in the body and do nothing — §10.5's shape, one file type over
26. **P28** — A fill inside a non-empty `<include>` naming a slot its target does not declare (§32.3). A **problem** rather than §7.3's advisory A02, because a fragment has no flow for unaddressed content to stay in: the include element is replaced entirely, so the content is dropped
27. **P29** — A `--generate` script that threw (§33.2). Located at the generator's path, carrying the thrown message and, under `DEBUG=1`, the stack. The build stops before the scan, because a partial overlay is a site nobody described
22. **P23** — A `schema` declaration naming a type unify does not generate (§26.4). Located at the declaration — the frontmatter key for a Markdown page, the `<meta name="schema">` element for an HTML one. Case-sensitive, because `article` is not a schema.org type and a declaration that generated nothing in silence is what §14 exists to forbid; the message names the three accepted spellings and the `<script type="application/ld+json">` that carries any other vocabulary

### 14.3 Advisories (the closed catalogue — capped at twelve; at the cap, adding one means removing one)

Eleven, one slot free. Three IDs have left this catalogue and none was replaced: **A15** (an `og:` value left root-relative by a path-only `--base-url`) was added and retired the same day, because the form it warned about stopped existing (§11.3); **A04** became problem **P20**, because what it reported was never merely informative — the page it let through was wrong; **A03** (a top-level `<header>`/`<footer>` outside any slot) was deleted, because the markup it fired on had composed exactly as its author drew it (§7.6). All three are the outcome to prefer over a warning that stays: delete the choice, fail the build, or delete the warning. A retired ID is never reused.

Same ID convention as §14.2.

1. **A01** — Void `<include>` used (builds identically; previews wrong in a browser)
2. **A02** — Fill names a slot the layout doesn't have (content stayed in the page flow) (§7.3)
5. **A13** — A duplicated construct of which only the first counts — a second bare `<slot>`, a repeated slot name, or a second `<main>` in a layout: the first won, and the message names the duplicated construct (§7.1)
6. **A08** — Page charset differs from the layout's (layout's kept) (§8 row 1)
7. **A09** — Working-format file emitted — extension list, closed: `.psd`, `.ai`, `.sketch`, `.fig`, `.xcf`
8. **A10** — A file used as a layout or include also ships as its own page (the non-underscored case)
9. **A11** — Output paths differing only by case; the group is one case-folded form but the sentence names one representative per NFC form, escaped, and is not printed when that leaves nothing to name — so a pair `toLowerCase` merges only because it collapsed a canonical singleton (U+212A KELVIN SIGN, U+2126 OHM SIGN, U+212B ANGSTROM SIGN) is A16's, not this one's (§13)
10. **A16** — Output paths a host folding Unicode normalization form *and* letter case together sees as one file; the key is NFC then case-folded for that reason, a group that is A11's entirely (same case fold *and* all NFC forms distinct) is skipped, and the message quotes every distinct spelling, escaped, and says only what is true of the whole group — that such a host merges them — rather than asserting a form relationship between any two (§13)
11. **A12** — Symlink resolving outside the source root (treated as absent) (§4.4)
12. **A17** — A page declaring `Article`/`BlogPosting` whose `datePublished` names a day rather than an instant, so it is not an entry in the generated feed (§29.3). Atom requires a full date-time with an offset ([RFC 4287](https://www.rfc-editor.org/rfc/rfc4287) §3.3), and the two ways to manufacture one — midnight UTC, or the build clock — are respectively wrong for every reader west of Greenwich and forbidden outright by §20.10. It reports what the build did and names the spelling that would work
13. **A14** — Known deployment file at the source root held back by the exclude set — names the file and the `--exclude` line that ships it; the recognized names are the implementation's maintained list, which may grow without a spec revision (§4.2)

Two operational tests fell out of A03's retirement. An advisory that a meaningless wrapper element switches off is reporting tree position, not authorial error. And an advisory whose only available repair edits a file the page does not own — a shared layout, a shared fragment — is instructing a restructure by another name, whatever its wording.

Discipline (asserted by the E2E suite): an advisory that fires on a correct site is a bug in the advisory — `unify init && unify build --dry-run --strict` exits `0`. Advisories report what the build observed and what it did; they never instruct the author to restructure markup that composed correctly.

---

## 15. Transactional publish

`build` composes and copies into a temporary tree, runs every check, and only then touches the output directory: **zero problems → publish; any problem → the previous output is byte-for-byte untouched and the exit code is 1.** Publishing syncs the temporary tree into the output directory: files whose content is unchanged are not rewritten; files no longer produced are deleted; new and changed files land via temp-then-rename. `--clean` empties the output directory first — and refuses (exit 2) when the output directory **is, or contains,** the source root or the working directory. It does *not* refuse merely because the output sits inside them: `src/` and `dist/` as siblings under a project root is the layout §2 scaffolds and the one nearly every site uses, and `-s . -o dist` puts the output inside the source root by construction. What the guard exists to stop is `-o . --clean` deleting the project, and `-o ..` or `-o src` deleting the source — cases where emptying the output would destroy something the author wrote. `--dry-run` is the entire pipeline through step 9 with no writes at all, plus the report (§17).

---

## 16. Watch contract, `dev`, and error pages

`unify watch` and `unify dev` share one contract: saves are coalesced into one rebuild; a save landing mid-rebuild queues exactly one follow-up — no change is ever dropped; every rebuild is a **full** rebuild (no cache, no incremental state; watch output is always identical to a fresh `unify build`); writes are minimal and atomic (unchanged files untouched, temp-then-rename, precise deletions); `--clean` applies only at startup. While watching, a page that fails to build is emitted as a default error page carrying the located diagnostics, replaced by the next successful rebuild; `unify build` never emits error pages, and while watching, problems suspend the transactional gate only this far — error pages are the one thing a broken rebuild may write.

`unify dev` = watch + a static server on `localhost:<port>` (default 3000) serving the output directory with directory indexes and a 404 page, plus a reload event stream; the reload script is injected only into HTML responses **it serves** and never exists in the output directory. It answers one path that is not a file: `/_unify/`, the local audit view (§27), assembled in memory from the same manifest and findings the command line reads and written to the output directory never. No proxying, HTTPS, middleware, or config — permanently.

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

Optional, at the source root; never emitted. Keys are the long option names with the same meanings: `source`, `output`, `clean`, `exclude` (a list, replacing the default like the flag), `pretty-urls`, `base-url`, `canonical`, `feed-full`, `catalog`, `search-corpus`, `strict`, `port`, `generate`. CLI flags win on conflict. No behavior exists that only the file can express.

**On the command line, a single-value option may be given once.** `exclude` is the one list — repeating it accumulates, which is what it is for — and repeating a boolean flag asks for the same thing twice and is fine. Repeating anything that carries a value (`-o dist -o other`, two `--generate` paths) is a **usage error** (exit 2). It used to keep the last one and discard the rest in silence, which published to a directory the author did not name and ran a generator instead of the one they asked for, both at exit 0: an instruction dropped without a word, which is the failure §7.6 refuses everywhere the author's content is concerned and the CLI boundary had no equivalent of.

The set is the flags that describe the *site*, not one run of the tool: `--dry-run`, `--format`, and `--external` describe what a single invocation should do and are not saveable — a config file that could turn every future `audit` into a network operation, or silently reshape its output, would be behavior only the file expresses in practice, which is what the sentence above exists to prevent.

---

## 19. Scaffold contract (`unify init`)

A template is the first unify anyone reads, and product-spec §6.7 states the consequence plainly: working code teaches shapes prose cannot, *and mis-teaches them just as efficiently*. Everything below follows from that. A scaffold is not a demo — it is the reference site, and it is held to the standard the tool asks of everyone else.

### 19.1 The primitive set

Every template scaffolds into `src/` beside a `dist/`-free project root and exercises each primitive exactly once: one `<include>` (the nav), the automatic `_layout.html`, one named slot with a fallback (`footer`) plus one page that fills it, one `data-layout="none"` page (`404.html`), and the underscore (`_includes/`). The scaffolded layout declares `<meta charset="utf-8">` and carries a plain HTML comment above each slot naming its purpose (a convention, never a rule). The starter stylesheet includes `slot { display: contents }` — design-time preview only; built pages contain no `<slot>` elements.

### 19.2 The discovery set

Product-spec §6.3.7 requires every template to ship "semantic visible content, unique titles and descriptions, canonical/social metadata, representative-image dimensions, appropriate authored or bounded JSON-LD, `robots.txt`, a clean audit, and deployment recipes". Stated as the properties a build can check:

1. **`<html lang>`** on every emitted page. It comes from the layout, so one attribute covers a whole template — which is exactly why its absence was invisible: no page was missing anything a reader of that page could see.
2. **A `<title>` and a `<meta name="description">` per page, both unique across the template**, and each title containing or contained by its page's single `<h1>` (§24.4's containment rule). The layout supplies the suffix and the page supplies its own name (§8 row 2).
3. **One `<h1>` per page**, naming what is on it.
4. **`og:title`, `og:description`, `og:type`, and `og:image`** with **`og:image:width` and `og:image:height`** whose values are the shipped file's real pixel dimensions. A declared dimension that does not match the file would be the invented claim product-spec §6.1 forbids, in the one place nothing would ever catch it.
5. **`robots.txt`** at the source root — a minimal, honest one. unify never decides what a site should block (§23), so a scaffolded file blocks nothing and exists to be edited. It carries no `Sitemap:` line unless the template also ships a sitemap: §23.3 exempts the two generated names without `--base-url`, and `audit` then reports the exemption (`robots-sitemap-missing`), which would put a finding in a fresh scaffold.
6. **Structured data**, by whichever of §26's two routes fits: `schema:` (or `<meta name="schema">`) where the page is a `WebPage`, `Article`, or `BlogPosting`, and a hand-written `<script type="application/ld+json">` for any other vocabulary. A template that declares `Article` or `BlogPosting` ships an authored, well-formed `date` — §24.4's `schema-incomplete` fires without one, and §20.10 will not invent it.
7. **No canonical.** A canonical is one page's own absolute address (§22.1), which a scaffold cannot know; writing a placeholder domain into one would be a false claim on every page that shipped it. Templates teach `--base-url … --canonical auto` in their `AGENTS.md` and `DEPLOY.md` instead, which is where the address actually lives.

### 19.3 The two guarantees

```
unify init && unify build --dry-run --strict     exits 0
unify init && unify audit --strict               exits 0
```

The first has always held: an advisory that fires on a correct site is a bug in the advisory (§14.3). The second is the stronger of the two, because `audit --strict` gates on **any** finding of either severity (§24.6) — so a scaffold passes only when it has a title, a description, a heading, a language, a share image with dimensions, no orphan page, no duplicate id, and no contradiction anywhere in it.

Until this section required it, every template shipped between seven and thirteen `incomplete` findings — all of them `lang-missing` and `description-missing`, and all of them real. The command that exists to tell authors their site is incomplete could not be run on the site unify itself writes, which is the same shape as a linter whose own configuration fails it: not a false finding, and not a reason to soften the gate, but a gap in the reference material that made the gate impossible to adopt on day one.

Both guarantees are asserted per template by the suite, for the whole set, without `--base-url` — the state a scaffold is in one second after it is created.

### 19.4 Files outside `src/`

Two files are scaffolded at the **project root**, deliberately outside the source root so that neither can publish (§4.2's underscore rule is for files inside it; these are simply not in it):

- **`AGENTS.md`** — product-spec §6.7 requires it of every template, and requires it to be repository-local guidance rather than optional marketing. It repeats only the high-conflict rules: layouts are paths; source links name real `.html` files; `--base-url` is a complete public URL; a leading underscore excludes source; `draft`, `permalink`, and `slug` are not silently honored; an empty `<include>` performs verbatim inclusion; structured data uses visible explicit facts; and `unify audit` plus `--dry-run` are the pre-publish checks. It states no behavior the author-facing documents — the README, `docs/authoring-rules.md`, `docs/getting-started.md`, `docs/cli-reference.md` — do not state (product-spec §6.7: no behavior may be documented *only* in the agent guide): **one rule set, three audiences**, never a tool-specific variant.
- **`DEPLOY.md`** — the deployment recipe, ending in the two commands that carry the site's address, since §19.2's items 4 and 7 both defer to it.

**Where "project root" is** has one answer and it is not a guess: these files are written to the **working directory the command ran in**. In the fresh-project case that directory *is* the project root and `init` creates `src/` beneath it (product-spec §2's `my-site/`), so the two land side by side. Where `--source` names a directory explicitly, unify does not infer a project root from it — walking to a parent would write outside the tree the author named, which is the one thing a scaffolding command must never do. They land where the author was standing, which is a place they chose.

**And where the two coincide, `init` refuses (exit 2) rather than scaffold.** The placement rule above and the "neither can publish" property above it are jointly unsatisfiable for exactly one shape of invocation: one where the working directory is, or is inside, the source root — `--source .`, or `--source ..` from a subdirectory. There the pair lands inside the tree the build scans, carries no underscore (§4.2), and is not on §4.3's never-shipped list, so `AGENTS.md` and `DEPLOY.md` compose as ordinary Markdown pages and publish. That is not a tolerable outcome to document and move on from: product-spec §6.7 requires the agent guide to sit "outside `src/` so it cannot publish", and the scaffold that shipped it would fail §19.3's second guarantee — `unify audit --strict` reporting `description-missing` and `page-orphan` on two files unify itself wrote, which is precisely the "linter whose own configuration fails it" shape §19.3 exists to end. So the refusal is the resolution: `init` writes **nothing** and names the collision, in §14.1's shape, with the two repairs that are actually available —

```
init refused: the project root and the source root are the same directory,
  so AGENTS.md and DEPLOY.md would publish as pages
  fix: run unify init from the parent directory, or pass --source with a subdirectory such as --source src
```

Refusing is available to a scaffolding command in a way that no other repair is. Inferring a parent is the one thing §19.4 has already ruled out; renaming the files defeats their purpose (an agent looks for `AGENTS.md` by that name); and adding them to §4.3 would make `AGENTS.md` unpublishable on every site, when it is a legitimate page on somebody else's. The refusal costs one layout — a source root that is also the project root, scaffolded by `init` — and `unify build --source .` on a tree the author arranged that way is untouched, because this rule is `init`'s alone.

Both files participate in the existing refusal too: `init` writes nothing when any file it would create already exists. **"Writes nothing" is checked before the first write, and over directories as well as files**: a template's write paths imply the directories above them, so a path where an intermediate directory already exists *as a plain file* — `src/posts` as a file, in a template that needs it as a directory — is part of the same check and names the same refusal. Discovering it at `mkdir` time instead leaves a half-written scaffold that the file-level refusal then declines to complete forever, which is the one outcome the sentence promises cannot happen.

### 19.5 A template file may be bytes

A template is a map of source-root-relative path to content, and content is a string **or** raw bytes. Bytes exist for exactly one reason: §19.2's item 4 requires a real share image with real dimensions, and every raster format is binary. An SVG would keep the map textual and would not do the job — the social crawlers `og:image` exists for do not render SVG, so a template that shipped one would teach a tag that silently fails at the only moment it matters.

The constraint that shaped `src/templates/**` is unchanged and is what this must not break: **nothing there reads the filesystem.** `bun build --compile` bundles by tracing `import`, and a single-file executable has no sibling directory to read, so every byte a template ships is data reachable by static import — a base64 literal decoded at scaffold time, never a file read relative to `import.meta.url`. The scaffolded image is a few hundred bytes; a template that wanted a photograph would be teaching the wrong thing anyway.

### 19.6 The blog template's generator seam

The blog template additionally ships the generator seam worked end-to-end, because a generator is the most universal thing authors build on top of unify and the scaffold is where its habits are taught. `_scripts/gen.mjs` (zero dependencies, one `node:` import; its opening comment names the authoring rules' own run-it-yourself literal, `node _scripts/gen.mjs && unify build` — the scaffold and the doc must agree, because a single shown literal is a copied literal) reads `posts/*.md` and `_data/authors.json` and writes `blog.html` and `feed.xml` into the source tree, each carrying the marker `generated by _scripts/gen.mjs — edit the data, not this file`. Both ship pre-generated and byte-identical to a fresh run of the script, so the §19.3 guarantees hold with no intervening step and rerunning the script changes nothing. The authors file holds a private field (`email`) beside the public ones, and the generator names the fields it emits rather than spreading the record, so the private field appears in no generated file and nowhere in built output: the underscore keeps the *file* out of `dist/`, but only the generator can keep a *field* out of a page it writes — once a script copies one in, that page is ordinary content and no diagnostic can exist.

### 19.7 What a template must not do

- **Never make an invented placeholder look publishable** (product-spec §6.7). Business identity, author names, dates, prices, ratings, and addresses are conspicuous placeholders, and a reader must not be able to mistake one for a fact. A template that shipped a plausible-looking street address would be teaching authors to publish one.
- **Never introduce a unify-only content schema.** Templates teach the platform's artifacts — `og:`, JSON-LD, `robots.txt`, `sitemap.xml` — in the platform's own vocabulary. The single unify-specific token a template may carry beyond §19.1's primitives is `schema:`, and §26.4 is where that is argued.
- **Never ship a file the site does not use**, and never a reference it does not emit. Both are already build problems (A10, P13); stating it here is about the direction a template is written in, not about a check.

---

## 20. The final document model

Between §11's URL phases and §12's reference check, unify derives exactly one **`BuildDocument`** for every page that composed. The model is a thin envelope around a **structural projection of the emitted HTML**, split into three parts that stay three modules rather than one: a bounded, publishable `DocumentSnapshot`; a heavier, build-only `DocumentAnalysis`; and a shared **selector layer** that every built-in consumer reads through instead of inventing its own second reading. The manifest — `documents`, plus `byOutputPath` and `byPublicPath` lookups over them — is the build's single semantic reading of the site it is about to publish: sitemap generation, canonical completion, robots consistency, structured-data checks, feeds, and every audit finding read it, and none of them re-parses a page or re-decides a value. Adding a second extractor, or letting one consumer pick a different winner than another, is a defect in this section rather than in the consumer.

The manifest is an **implementation boundary**. No command writes it, no authoring rule mentions it, and product-spec §6.2 states plainly that it is not a new file format authors must learn. Nothing in this section changes what a build emits, reports, or exits with: deriving it is pure observation.

**The rule that governs every module in this section, stated once:** extract the document once, interpret it centrally, project it many times. `document.js` extracts; `document-selectors.js` interprets; `manifest.js`, `sitemap.js`, `feed.js`, `canonical.js`, `structured-data.js`, `audit.js`, and the rest project. A fact about a page is computed by a selector on demand from the snapshot/analysis it is given, never re-derived by a consumer and never written back onto the envelope as a new stored field — doing the latter would simply rebuild the 0.8 model's denormalization under a new name (release-brief §14.1).

### 20.1 Membership

One `BuildDocument` per **composed page** — exactly the set §12 checks and §15 publishes as HTML. Assets, `.fragment.html` files (§4.4/EXC-12), excluded sources, and pages that failed to compose have no document. Membership is decided before any field is read, so a page carrying no metadata at all still has a complete document. `documents` is ordered by output path, and that order is the manifest's iteration order for every consumer.

### 20.2 Extraction source

Every field is read from the page's **emitted text**: the exact bytes §15 would publish, after includes (§5), Markdown conversion (§10), composition (§7–§9), and all three URL phases (§11). The exception is named and closed at two fields — `source.generated` and `source.layout`, which are provenance and are argued in §20.4. Frontmatter, layout files, and include sources are never consulted again. A Markdown page's title reaches the model only because §10.2 put it in the emitted `<head>`; a layout-supplied `<meta name="description">` is read from each page that shipped it, once per page. That is what makes HTML and Markdown equal citizens here and keeps the model honest about what a crawler will actually see.

`<template>` contents are not scanned, matching §7.1's rule for slots: markup inside a template is inert in the shipped page, so it declares nothing.

Extraction never fails a build and never publishes anything. A page whose emitted text carries no title, no headings, and no links produces a complete document whose fields are `null` or empty. §14's two severities and the exit-code contract are untouched by this section.

### 20.3 The `DocumentSnapshot`: shape and normalization

`extractDocument(html, {path, url})` (`src/core/document.js`) makes one document-order pass over the parsed tree and returns `{document, analysis}`. `document` is the `DocumentSnapshot` — small, bounded, and safe to publish as-is (it is what `unify audit --format json` serializes whole, §31.1):

| Field | Type | Content |
|---|---|---|
| `path` | string\|null | passthrough — the site-root-relative address §20.5 computes for this page, supplied by the caller |
| `url` | string\|null | passthrough — the absolute public URL §20.5 computes, or `null` with no `--base-url` |
| `html.attributes` | object | the first `<html>` element's attributes (§20.3's attribute-reading rule, below); `{}` when the document has none |
| `head.title` | string\|null | the first accepted `<title>` element's text content, whitespace-collapsed and trimmed; empty is `null` |
| `head.meta` | object[] | every head-scoped `<meta>`'s attributes, in document order |
| `head.link` | object[] | every head-scoped `<link>`'s attributes, in document order |
| `head.base` | object[] | every head-scoped `<base>`'s attributes, in document order |
| `body.attributes` | object | the first `<body>` element's attributes; `{}` when the document has none |
| `body.headings` | `{level, id, text}[]` | every `h1`–`h6` **inside the heading scope** (below), in document order; `id` is `null` when unset |

**Attribute reading.** One element's attributes become a plain object: names lowercased, values with character references decoded and **nothing else changed — no trimming, no coercion**. A bare attribute (`disabled`, no `=`) reads as `""`. When a name repeats on one element, the first occurrence wins, HTML's own rule for a duplicated attribute. A selector that needs an emptiness test — "did this page declare a title", "is this href non-blank" — trims and tests for `""` itself, at the point it interprets the value (§20.4); the snapshot never does this trimming on the consumer's behalf, because a stored `""` and a stored `"  "` are not the same fact and only the reader knows whether the difference matters to the question being asked.

**Head scoping keeps this section's own rule**: metadata elements (`<title>`, `<meta>`, `<link>`, `<base>`) are read from `<head>`; a document with no `<head>` element is read whole, because unify's parser does not implement HTML tree construction and cannot say where a browser's implied head boundary would fall. The rule exists because a page whose `<head>` held only `<meta charset>`, with its title and description written into the body instead, used to report both fields present under a document-wide reading — so `title-missing`/`description-missing` stayed silent while `title-h1-mismatch` fired on the inert title. A `<title>` or `<meta name="description">` in `<body>` is inert — no browser shows it, no crawler indexes it — and §8 never put it there; the author did. An element of these four kinds emitted outside the head — on a document that HAS a head — declares nothing to the snapshot; the subset §24.4's `metadata-in-body` names (`<title>`, `<base>`, `<meta charset>`, `<link rel="canonical">`, and a `<meta>` carrying one of the same closed set of `name`/`property` values §24.4 lists) is additionally recorded in `analysis.strayMetadata`, and everything else outside the head is simply not read.

**Heading scope is the first `<main>` element, else `<body>`, else the whole document outside `<head>`** (§20.7 reuses the identical scope for `analysis.visibleText`, computed in the same pass, and states why the last fallback excludes the head). **This is a 0.9 decision, changed from 0.8's document-wide reading**, and the reason is what document-wide cost: a layout's chrome routinely carries its own `<h1>` — a site name in a `<header>`, a "Skip to content" landmark — and reading headings document-wide made that chrome's heading indistinguishable from the page's own. `main`-scoping headings is the same bound §20.7 already draws for visible text, applied to the one field §24.4's `h1-missing`/`h1-multiple`/`title-h1-mismatch` inherit their scope from: a chrome `<h1>` outside `<main>` no longer counts as the page's own heading, stated here because §24.4 changes no rule of its own to inherit it — the change is entirely in what this snapshot collects.

**Text content** everywhere in this section means the concatenated character data of an element and its descendants, with `<script>`, `<style>`, `<template>`, and `<noscript>` subtrees omitted, each run of ASCII whitespace collapsed to one space, and the result trimmed. Comments contribute nothing.

**Character references are resolved.** "Character data" means the text a reader sees, not the markup that encodes it: `C++ &amp; Rust!` in the emitted document is `C++ & Rust!` in the snapshot. This is not an edge case — §10.1's Markdown converter escapes `&`, `<`, `>`, and `"` on every page it writes, so an unresolved field would make the *default* authoring path produce text no reader ever sees, no search consumer could match, and any consumer that escapes on output would double-escape into `&amp;amp;`. Resolution covers the numeric forms (`&#8212;`, `&#x2014;`) and the named references of HTML 4.01's three entity sets — Latin-1, symbols/mathematical/Greek, and special — a closed, citable list rather than an implementation's habit. A reference outside that set, or malformed, is left exactly as written: unrecognised markup is not silently deleted. The same resolution applies to values read from attributes, because an attribute carries character references too.

Resolution happens **only here**. §3's splice engine and every module it feeds must keep treating source bytes as bytes — extraction is a reading of the output, not another pass over it.

Element boundaries participate: **entering and leaving** an element each contribute one space unless it is one of the closed set of **inline** elements below, whose boundaries contribute nothing. Both halves are needed. Leaving alone leaves `<div>Intro<p>Para</p></div>` reading as `IntroPara`; without the rule at all `<p>Kept</p><p>Also kept</p>` reads as `KeptAlso kept`; and with an unconditional space `Hello <em>world</em>!` reads as `Hello world !`. Since runs of whitespace collapse and the result is trimmed, the doubled separator between two adjacent blocks costs nothing. The list is closed and stated rather than derived, so two consumers cannot tokenize the same page differently:

```
a abbr b bdi bdo cite code data dfn em i img kbd mark q rp rt ruby
s samp small span strong sub sup time u var wbr
```

`<br>` is deliberately *not* inline here: it separates lines, so it separates words.

Collapsing covers **ASCII** whitespace only. A decoded `&nbsp;` is U+00A0, a character the author chose because it forbids a line break, and rewriting it to U+0020 would be an edit to their content — the same verbatim discipline `iso` and `canonical` follow. This pushes a real cost onto consumers that tokenize: a client-side search comparing a typed `New York` against an indexed `New York` misses, and duplicate-content detection reads two otherwise identical pages as different. Any projection of this field that is searched or compared must fold U+00A0 and the other Unicode space separators **at index time**, and say so where it is specified. Folding them here instead would put one consumer's normalization into the shared snapshot, where every other consumer inherits it silently.

**`DocumentAnalysis`** is the other half of `extractDocument`'s return value: heavier, build-only, and never serialized into a public artifact by default (§31.1 states the audit-JSON exception explicitly does not apply to it).

| Field | Type | Content |
|---|---|---|
| `visibleText` | string | §20.7 — the page's visible main text |
| `ids` | string[] | every `id` attribute in the emitted document, document order, repeats included |
| `titleTexts` | string[] | every accepted `<title>` element's text, in document order — carries the repeats `head.title` collapses to a first-wins scalar, so `metadataConflicts` (§20.4) can still compute a `title` conflict |
| `langTexts` | string[] | every `<html>` element's non-empty `lang`, document-wide, in document order — carries the same repeats one layer down, for `langOf` and `metadataConflicts` (§20.4) |
| `jsonLd` | `{raw, data, error}[]` | §20.8 — one entry per `<script type="application/ld+json">`, in document order |
| `strayMetadata` | `{tag, key}[]` | §24.4's `metadata-in-body` closed set of elements found outside `<head>` on a document that has one |
| `linksOut` | string[] | §20.9 — deduplicated, sorted output paths of internal pages this page links to |
| `linksIn` | string[] | §20.9 — the exact reverse relation, deduplicated and sorted |
| `fragmentLinks` | `{target, id}[]` | §20.9 |
| `refresh` | `{raw, seconds, url, target}`\|null | §20.11 |

`extractDocument` itself returns the *per-document* half of this table — `visibleText`, `ids`, `titleTexts`, `langTexts`, `jsonLd`, `strayMetadata`, plus an unresolved `rawHrefs` (every `<a href>` value, document order) and an unresolved `refresh` reading. `linksOut`, `linksIn`, and `fragmentLinks` do not exist yet at that point — they are relations over the *whole manifest*, resolvable only once every document does — so `manifest.js`'s own second pass consumes `rawHrefs` into them and resolves `refresh.target`, exactly as `_hrefs`/`_refresh` were consumed and deleted in the 0.8 model. `rawHrefs` never survives onto the final envelope.

### 20.4 The `BuildDocument` envelope and the selector layer

```js
BuildDocument = {
  source: { path, generated, layout },
  outputPath,
  document,   // DocumentSnapshot
  analysis,   // DocumentAnalysis
}
```

**Two fields are provenance rather than a reading of the emitted text**, and they are the whole of §20.2's exception: `source.generated`, which names the tree the page came from, and `source.layout`, which names the layout it composed with. Neither is recoverable from the bytes §20.2 reads — composition consumes `data-layout` (§6.4) and a layout leaves no marker of its own in what it produced, while the `--generate` overlay is scanned exactly as the source tree is (§33.3) — so a consumer that needs either fact has only two alternatives, and both have shipped and been wrong. It can re-derive the fact, which is a second reading of a question the build already answered and free to disagree with the first; or it can reason without it and state something untrue. `source.generated` was added when `unify audit` located a generated page at a source path the author could not open, under a fix line telling them to rename a file they never wrote. `source.layout` was added when `lang-missing` told an author to set `lang` on the layout — on a page that had resolved **no layout at all**, so the advice named either a file that was already correct or no file at all. §24 is where both facts are spent: a fix line is a sentence about what the author should edit next, and it cannot name a file that the reader can open — nor decline to name one that does not exist — without them.

These are the only two, and the boundary is deliberate. Provenance is admitted here when a **finding cannot be phrased truthfully without it**, never as a general record of how a page was built: the source of each field, the includes it inlined, the frontmatter it declared, and the layout's own text all stay out, because §20.2's rule — that the model is a reading of what a consumer receives — is what keeps every other field honest about what a crawler will actually see. §17's report prints these same two facts (`← page + layout`, `← page (no layout)`, `← generated`) from the same values, so the envelope and the report cannot drift.

**The selector layer** (`src/core/document-selectors.js`) is the one interpretation of a `{document, analysis, outputPath?}` envelope every built-in consumer reads through: `titleOf`, `langOf`, `metaValues`, `linksWithRel`, `descriptionOf`, `authorOf`, `canonicalOf`, `robotsPolicyOf`, `refreshOf`, `publicationDatesOf`, `preferredImageOf`, `declaredTypes`, `metadataConflicts`, `isPublicDestination`, and the four-state `classifyCanonicalValue`/`classifyCanonical` (§21.2). (`propertyValues` — the `property`-axis counterpart of `metaValues` — is exported from the same module for a future built-in that needs an unranked list of one `property`'s repeats, but has no built-in caller yet; it is exercised only by this module's own unit tests.) A selector *computes* an answer; it never persists that answer back onto the envelope as a new stored field — doing so would recreate the 0.8 `PageRecord` under a new name (release-brief §14.1). Where §20.3's table stores a value once (`head.title`, `body.headings`), a selector reads it as-is; where a field would otherwise need to exist only for one consumer's convenience, the selector computes it on demand instead.

**First-wins, everywhere but two.** Several facts are single-valued while the emitted document may declare them more than once — a title, a description, a canonical, a declared date. For each, the reading selector keeps **the first accepted declaration in document order** and the model records nothing further when the repeats agree. Two named exceptions replace that document-order race: `robots` (§20.6), where a crawler applies the *union* of every `<meta name="robots">` a page emits, so `robotsPolicyOf` reads all of them rather than the first; and the image, argued next.

**One meta plays one role** (the `metaRole` chain). `publicationDatesOf` and `preferredImageOf` both read across two spellings of one fact — `name="date"`/`property="article:published_time"` for a published date, `property="og:image"`/`name="twitter:image"` for an image — and a `<meta>` that could match more than one spelling by accident (a contrived `<meta name="description" property="og:image" content="…">`) is assigned to exactly one role by one fixed, exclusive chain: every `name` branch (`description`, `author`, `robots`, `schema`, `date`, `lastmod`, `twitter:image`) is checked before every `property` branch (`article:published_time`, `article:modified_time`, `og:image`, `og:image:width`, `og:image:height`), first match wins, in that order. A tag that carries both a matched `name` and a matched `property` therefore plays only its `name` role. This is `manifest.js`'s own single-pass extraction, ported rather than re-derived, and it is stated here because it is the rule that keeps two selectors reading one meta from silently disagreeing about which fact it declares.

**`og:image` and `twitter:image` are RANKED spellings, not a document-order race, and this is the image's second exception to first-wins.** `preferredImageOf` prefers `og:image` over `twitter:image` regardless of which appears first in the document — a `twitter:image` earlier in the head does not win against a later `og:image` — with first-wins applied *within* whichever spelling supplied the url (`fromOg` records which). Dimensions (`og:image:width`/`og:image:height`) are read only when the url came from `og:image`: they describe that image, and attaching them to a `twitter:image` would report a size the page never claimed for that file, so `preferredImageOf` on a twitter-only image always returns `width: null, height: null`.

**Conflicts are computed, not stored.** The 0.8 model kept a `conflicts` array on the record; 0.9 has no such field. `metadataConflicts(doc)` computes `[{field, kept, discarded}]` on demand, for exactly the four fields whose own defining standard says a page may declare **at most once**: `canonical` (from `head.link`), `description` (from `head.meta`), `title` (from `analysis.titleTexts`), `lang` (from `analysis.langTexts` — not `langOf`, because a snapshot's `html.attributes` keeps only the *first* `<html>` element while `langTexts` keeps every one, document-wide; a second `<html>` element, reachable through a textual `<include>` of a full document, is invisible to `langOf` but not to a conflict check). For each field the first accepted declaration is kept; when two or more differ, one entry names the field, the value kept, and every discarded value in document order; identical repeats lose nothing and are not a conflict. Ordered by field name. §24.4's `metadata-conflict` renders exactly this list — the reasoning for why it is these four fields and no others, and not `image`, the declared structured-data type, `author`, `robots`, or the two dates, is unchanged from 0.8 and stated at that finding's own definition.

`langOf(doc)` itself reads `analysis.langTexts[0]` — the first *non-empty* `lang` across every `<html>` element, document-wide — rather than `document.html.attributes.lang`. The two usually agree, because `html.attributes` already comes from the first `<html>` element found. They diverge only on the same degenerate multi-`<html>` document `metadataConflicts` above accounts for: reading `langTexts[0]` reproduces the 0.8 record's exact `lang` behavior on that shape rather than a lookalike that answers a narrower question.

**Attribute-value comparisons are on the decoded value.** Because §20.3's attribute reading decodes character references before a selector ever sees a value, `metaValues(doc, "description")` matches a literal `name="descri&#112;tion"` the same way it matches `name="description"` — the comparison happens after decoding, on the value an author would recognise, never on the raw bytes.

### 20.5 Public URLs

`path` is the address the output path answers to, computed by the **same function §17's dry-run report already uses** to print it — one interpretation, so a URL a consumer emits and a URL the report shows can never disagree. A trailing `index.html` segment is dropped: `about.html` → `/about.html`, `about/index.html` → `/about/`, `index.html` → `/`. With `--base-url https://example.com/repo/` the path prefix is applied: `/repo/about/`.

Each segment derived from an output path is **percent-encoded**, because a filesystem name is not a URI and the model's job is to say what a page answers to: `two words.html` → `/two%20words.html`, `a&b.html` → `/a%26b.html`, `caf%C3%A9.html` for a UTF-8 `café.html`. A literal `%` encodes to `%25`, so the transform is total and never double-encodes. The path prefix supplied by `--base-url` is **not** re-encoded — the author wrote it as a URL already, and re-encoding it would corrupt a prefix that legitimately contains an escape.

The line this draws, once, for the whole build: **a URL unify constructs is percent-encoded; a URL the author wrote is preserved.** `urlForOutputPath`, the `--dry-run` address, §11.1's re-rooted URLs, §11.2's directory form, and every projection of this model are constructions and are encoded. A URL the author wrote in the page that ships it, on a page that did not move, is preserved untouched (§11.1's URL-06 branch). §11.2 is the stated exception: it *replaces* an authored URL with a constructed one by design, which is what `--pretty-urls` is, so its output is encoded like any other construction. §12 percent-decodes before matching, so both spellings of the same file resolve and neither is rewritten into the other.

One visible consequence, stated so it is not later read as drift: in a build without `--pretty-urls` an emitted page can carry `href="/two words.html"` — the author's own bytes, preserved — while the sitemap and the `--dry-run` report say `/two%20words.html` for that same target. Both name the file, both resolve, and neither is wrong. The difference is the line above doing exactly what it says, not two components disagreeing.

`document.url` is `base.origin + document.path` when `--base-url` was supplied, and `null` otherwise. unify does not know a site's public address unless it is told, and a feature that needs an absolute URL must therefore say so rather than invent an origin. Because §11.3 makes a bare-path `--base-url` a usage error, `document.url` is either a complete absolute URL or `null` — never a half-built one.

### 20.6 Robots directives

`robotsPolicyOf(doc)` reads **every `<meta name="robots">` the page emits, not the first.** A crawler applies the union of the directives it finds, and splitting `noindex, nofollow` across two tags is a documented spelling of one policy — so this is the one field §20.4's first-wins rule must not govern. Keeping only the first left `indexable` true on a page whose second tag said `noindex`, and §21.2's noindex clause — the clause that exists to stop exactly this — never fired: the generated sitemap advertised a page telling crawlers not to index it. `robots` is correspondingly absent from `metadataConflicts` (§20.4) and from §24.4's `metadata-conflict`, because there is no contradiction to record.

The result is `{raw, directives, indexable, followable}`: `raw` is the `content` of every such meta, each trimmed, joined with `", "` in document order, or `null` when the page emits none — the report has to be able to quote what the page actually says. `directives` is that value split on commas, each token trimmed and lowercased, empty tokens dropped. `indexable` is `false` when the directives contain `noindex` or `none`, `true` otherwise; `followable` is `false` when they contain `nofollow` or `none`, `true` otherwise. Unknown directives are preserved in `directives` and change nothing else.

A crawler-specific meta (`<meta name="googlebot">`) is **not** read: unify does not model one search engine's policy. `robots.txt` is **never** read into a document's reading — a disallowed path is not a `noindex` page, and conflating the two is the single most common piece of SEO folklore this specification refuses (product-spec §6.7).

### 20.7 Visible main text

`analysis.visibleText` is the text content (§20.3) of the emitted document's first `<main>` element, or of `<body>` when the document has none, or of the whole document outside `<head>` when it has neither — the identical scope §20.3 gives `body.headings`, computed in the same pass over the same resolved subtree. The `<head>` exclusion on that last fallback matters because HTML5 makes the `<body>` start tag omissible: a document with no `<main>` and no explicit `<body>` element is still legal authored markup, and without the exclusion its `<title>` and other head-only text would count as page body text. It is the text a reader sees, computed once, so that duplicate-content detection and any excerpt read the same characters.

### 20.8 Structured data

`analysis.jsonLd` holds one entry per `<script type="application/ld+json">` in the emitted document, in document order: `{raw, data, error}`. `raw` is the script's text content verbatim. `data` is the parsed JSON value, or `null` when parsing failed; `error` is the parser's message in that case, `null` otherwise. Parsing never throws and never fails a build — §20.2's rule holds and product-spec §6.3.6 owns what is done with an invalid block.

`declaredTypes(doc)` is the 0.9 replacement for the 0.8 model's single scalar `schemaType`. It returns **every** accepted structured-data declaration, in this order: non-empty `<meta name="schema">` contents in head order, **then** the `@type` of every `analysis.jsonLd` entry (document order) whose `data` is a single object with a string `@type` — bounded reading, unchanged: an array, a `@graph`, a missing `@type`, or a non-string `@type` declares nothing.

**Ordering note (0.9 decision).** The retired `schemaType` interleaved the two sources by document position and kept only the first declaration overall; `declaredTypes` lists every meta declaration before every JSON-LD one, and returns the whole list rather than one winner. No 0.9 consumer depends on a single winner: feed membership and `schema-incomplete` (§24.4) test **inclusion** — `declaredTypes(doc).some(t => t === "Article" || t === "BlogPosting")` — so a page whose JSON-LD declares `WebPage` first and `Article` second is a candidate under 0.9 where it was not under 0.8 (§29 states this widening at feed membership, its own consumer). The one place that does read a single entry is §26.5's generation activation, which reads `declaredTypes(doc)[0]` only after confirming `analysis.jsonLd` is empty — at that point the list is meta-only by construction, so "first" and "only surviving source" coincide and there is still no second reading of "which declaration is the type".

### 20.9 The internal link graph

`analysis.linksOut` holds the output paths of the pages this page links to. A link participates when it is an `<a href>` in the emitted document whose value, after `--base-url` stripping (§12's own rule, reused), resolves to an output path that has a document. Fragment-only, external, `mailto:`, `tel:`, and `data:` URLs never participate, and a link to a non-page asset never participates; the query and fragment of a participating URL are discarded before matching. A page linking to itself records itself. Values are deduplicated and sorted.

`analysis.fragmentLinks` records the same links again, keeping the fragment §12 discards: `{target, id}` per internal link that carries one. §12 deliberately does not validate fragments (REF-06) because a missing one is a reader's judgement rather than a build gate — but it is a *checkable* judgement, so the model carries the pairs and the evaluation command decides. `analysis.ids` is the other half: every `id` in the emitted document, in document order and with repeats kept, so that both "this fragment names nothing" and "this page declares one id twice" are answerable without re-parsing.

A `<noscript>` link participates even though `<noscript>` text does not reach `visibleText` (§20.3). The two sections are asking different questions: `visibleText` is what a reader sees, and a `noscript` block is by definition what they do not; `linksOut` is which pages this page can be reached from, and a `noscript` link is a real navigation for the readers it is written for. Named here so the asymmetry reads as a decision rather than an oversight.

`analysis.linksIn` is the exact reverse relation, computed after every document exists: `B` is in `A.analysis.linksIn` if and only if `A` is in `B.analysis.linksOut`. Deduplicated and sorted. Orphan detection (product-spec §6.3.4) is `linksIn.length === 0`, which is why the relation is built once in `manifest.js`'s second pass rather than by the consumer.

### 20.10 Dates: `raw` and `iso`

`publicationDatesOf(doc)` returns `{published, modified}`, each `{raw, iso}` or `null`, precisely so the two questions never collapse into one: `raw` is the value exactly as the document declared it, so nothing an author wrote is lost, and `iso` is that value **only when it is a well-formed [W3C-DTF](https://www.w3.org/TR/NOTE-datetime) date or date-time**, `null` otherwise. `iso` is the field every consumer that emits a date reads, and `raw` is never emitted anywhere. `published` reads `<meta name="date">` and `<meta property="article:published_time">`; `modified` reads `<meta name="lastmod">` and `<meta property="article:modified_time">` — first accepted declaration across both spellings, per §20.4's `metaRole` chain.

The accepted grammar is W3C-DTF's, no more:

```
YYYY-MM-DD
YYYY-MM-DDThh:mmTZD
YYYY-MM-DDThh:mm:ssTZD
YYYY-MM-DDThh:mm:ss.sTZD          TZD = Z | +hh:mm | -hh:mm
```

The literal `T` is required — `2026-01-02 03:04:05` is not W3C-DTF, and a space-separated value emitted verbatim into a sitemap `<lastmod>` or a JSON-LD `dateModified` is invalid where it lands. A time-zone designator is required whenever a time is present, since a local time with no offset names no instant. The date must be a real calendar day (`2026-02-30` and `2025-02-29` are not), the clock must be a real time of day (`24:00` and `23:60` are not), and the offset must be one that exists (`±14:00` is the outer bound). `iso` is the accepted value verbatim, not a normalization: unify does not rewrite `+00:00` to `Z` or pad a fractional second, because reformatting an author's timestamp is an edit to their content.

No date is ever derived. The build clock, the filesystem's mtime, the filename, and Git history are not consulted by this section or by anything reading it — product-spec §6.1's no-invented-claims constraint, in the one place it is most tempting to break.

### 20.11 Meta refresh

`analysis.refresh` is `{raw, seconds, url, target}` read from the **first** `<meta http-equiv="refresh">` the document emits whose `content` declares a refresh at all (§20.4's first-wins rule, unchanged), or `null` when it emits none. `raw` is the `content` value exactly as emitted, so the report can quote what the page says. `seconds` and `url` are **§12's grammar, unread here a second time** — the same reading, so a redirect the build checked and a redirect the evaluator reports can never be two different URLs. `url` is `null` when the value carries no readable URL part, and a `content` with no leading digits declares no refresh, so it is not this field's first declaration either.

`target` is the output path of the page the redirect names, when it names one in this manifest, and `null` otherwise:

- **no second part at all** (`content="5"`) — the value names *this page*, so `target` is the document's own output path;
- **a URL that resolves** — §12's own resolution, after `--base-url` stripping — to a document in this manifest: that document's output path;
- **everything else** — `null`: an external URL, a URL naming an asset or a file with no document, and a second part §12's grammar does not read. The last is deliberately **not** folded into "this page": `content="0; /gone.html"` declares a redirect *somewhere*, and calling it a self-redirect would make §24.4 report a loop the page does not contain.

**`refresh` is not head-scoped**, and this is the one field in §20 whose placement is a judgement rather than a definition. The other unscoped fields are unscoped because the head is not where they live; this one is unscoped because of what each direction loses. Head-scoped, a redirect written outside the head is invisible to §24 — no loop found, nothing said, and a redirect nobody checked is the silent failure §12 and §24 exist to remove. Document-wide, the cost is bounded in a way the other direction's is not: the model records a directive the page declares, and if some consumer ignores it where it sits, §24 still reports a fault whose repair — correct the target, or delete the redirect — is the right edit either way. §20.3 already takes that side once, in the no-`<head>` rule: where the two errors are not symmetric, the bounded reading is the one that reports rather than hides.

`refresh` is `DocumentAnalysis`'s own field rather than a selector's computation, unlike every other §20.10/§20.6-style reading, because `target` needs the whole manifest to resolve (§20.9's own second-pass reason) and cannot be computed lazily per call the way `publicationDatesOf` or `robotsPolicyOf` can. `refreshOf(doc)` exists in the selector layer as a one-line accessor (`doc.analysis.refresh`) purely so a consumer never has to know which half of the model a fact lives in.

---

## 21. Sitemap generation

The first projection of §20. Everything here reads `BuildDocument`s through the shared selectors; nothing here re-reads a page.

### 21.1 Activation

A sitemap is generated when, and only when, `--base-url` supplied the site's public address. Without it every document's `url` is `null` (§20.5) and unify does not know what to write in a `<loc>` — a sitemap of root-relative paths is invalid per the Sitemaps protocol, and inventing an origin is the class of guess product-spec §6.1 forbids. A build with no `--base-url` therefore emits no sitemap and reports nothing about it; this is the golden path, unchanged.

Generation is additive: it writes one new file (or, at protocol scale, a small set), changes no authored content, appears in `--dry-run` like any other write, and participates in §15's transactional publish. `--base-url` is the whole opt-in — there is no separate flag, because a site that has told unify its public address has told it everything the sitemap needs.

**Activation governs this entire section, §21.6's verification included.** Without `--base-url` a site's `sitemap.xml` is an ordinary asset: it mirror-copies byte-for-byte (§4.4) and unify says nothing about its contents, exactly as it always has. This is not a gap left for later — it is what "the golden path, unchanged" costs to mean. A site that shipped an authored sitemap with a stale entry built clean before this section existed and must keep building clean after it, because nothing the author did changed and no flag opted them in. It is also the only coherent reading: a `<loc>` is an absolute URL by protocol, and deciding whether one points inside *this* site requires knowing the site's address.

### 21.2 Membership

A document is included exactly when the shared **`isPublicDestination(doc, base)`** selector (§20.4) answers `true`. That selector is **all** of the following, and this is where the closed list it computes still lives — this subsection owns the definition even though `sitemap.js` and §30's catalog and search corpus both call the one function directly, and `feed.js` builds its own membership (§29.4) from the same underlying selectors rather than a second reading of any one of these four conditions:

1. It has a document at all (§20.1) — so assets, `.fragment.html` files, excluded sources, and pages that failed to compose are already out.
2. `robotsPolicyOf(doc).indexable` is `true` (§20.6). A `noindex` or `none` page is excluded: listing a page the author told crawlers to drop is a contradiction the sitemap should not publish.
3. Its output path is not `404.html`. An error document is not a destination.
4. It is **self-canonical**: `classifyCanonicalValue(canonicalOf(doc), doc.outputPath, base)` (§20.4) answers `none` or `self`. A canonical naming another page means the author consolidated this URL into that one, and a sitemap entry would ask crawlers to undo that. Resolution reuses §12's own rule (base-URL stripping, then relative/root-relative resolution, then directory URLs to `index.html`) so "which page does this URL name" has one answer across the build. A canonical that resolves to nothing internal — an external URL, or a path the site does not emit — is likewise not this page, so the page is excluded.

Membership is evaluated per document in manifest order (§20.1), and that order is the order entries appear in the file. No sorting, shuffling, or grouping: two builds of the same tree produce byte-identical sitemaps.

### 21.3 Entry contents

Each included document contributes one `<url>` element:

- `<loc>` is `document.url` — the absolute public URL §20.5 already computed, so a URL in the sitemap and a URL in the `--dry-run` report are the same string by construction. Two escapings apply and neither substitutes for the other: §20.5 has already **percent-encoded** the path so the value is a legal URI (a source file named `two words.html` answers to `/two%20words.html`, never to a URL with a raw space in it), and the value is then **XML-escaped** (`&`, `<`, `>`, `"`, `'`) so the document is well-formed. The Sitemaps protocol requires both.
- `<lastmod>` is emitted **only** when `publicationDatesOf(doc).modified.iso` is non-null — an authored, well-formed W3C date. A page with no authored modification date gets no `<lastmod>`. The build clock, the filesystem's mtime, the filename, and Git history are not fallbacks: a fabricated `lastmod` is a claim about the world, and it is the specific fabrication crawler guidance punishes. `datePublished` is not a fallback either; the element is named for the last modification and reads the value authored under that name.

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

For generated sitemaps this check can only pass — every `<loc>` came from a document whose output path exists. It runs anyway, and that is the point: it is the executable form of the claim that the sitemap and the published tree agree, so a future change that lets the two drift fails here instead of at a crawler.

---

## 22. Canonical completion

The second projection of §20, and the first that writes into a page rather than beside it.

### 22.1 Activation

`--canonical auto`, or the identical `canonical: auto` in `unify.yaml`. `auto` is the only accepted value; anything else is a usage error naming it, so a future mode cannot be silently misspelled into today's behaviour. Without the option nothing in this section runs, no page changes, and nothing is reported — the golden path.

**`--canonical auto` requires `--base-url`**, and the combination is checked as a usage error (exit 2) rather than degrading. A canonical must be an absolute URL: that is why §11.3 absolutizes authored ones, and why a path-only base URL is itself a usage error. Without a public address §20.5 makes `document.url` null, so there is nothing truthful to write — and writing a root-relative canonical, or writing nothing while the flag says otherwise, are both worse than saying so.

### 22.2 What is added, and where

For every document that §22.4 includes, a canonical link is inserted **at the end of the emitted `<head>`**, immediately before `</head>`:

```html
<link rel="canonical" href="https://example.com/about.html">
```

`href` is `document.url` — the same absolute URL §20.5 computes, the `--dry-run` report prints, and §21.3 writes into `<loc>`. Serialization is fixed, matching §10.2's rule for synthesized elements: double-quoted attributes, `rel` before `href`. The insertion reuses the whitespace immediately preceding `</head>`, so the element lands at that tag's own indentation and the rest of the document is byte-identical (§3's preservation rule).

`href` is HTML-escaped. §20.5 deliberately leaves the `--base-url` path prefix un-re-encoded, so `document.url` may legitimately contain `&` — and an unescaped `&copy;` in an attribute is a character reference, which §20.3 says the snapshot resolves. Emitted raw, the page came back declaring a canonical of a *different* URL, §21.2's self-canonical test then failed, and the page vanished from the sitemap of the very build whose flag exists to help crawlers find it. §21.3 XML-escapes for exactly this reason; this is the same obligation one document type over, and §12's decode-on-read is its other half.

A page whose emitted document has no `<head>`, or whose `<head>` is left unclosed, gets nothing — there is no insertion point, and synthesizing one would be a structural change this section does not make.

### 22.3 Authored canonicals always win

"Declares a canonical" is a question about the **head**, for §20.3's reason: a `<link rel="canonical">` in `<body>` is not a declaration, because nothing reads it there. Treating one as a declaration suppressed completion on a page that then shipped with no effective canonical at all — the flag's whole job, silently not done. A canonical inside a `<template>` was never a declaration either, and still is not (§7: template contents are never touched).

A page that declares any `rel="canonical"` **in its head** is left exactly as written. That holds when it declares several (`canonicalOf` keeps the first, and `metadataConflicts`, §20.4, computes the conflict on demand), when its canonical names another page, and when its canonical names nothing this site emits. Completion means *filling a gap*, never adjudicating a value the author chose.

### 22.4 Membership is §21.2's, unchanged

A page is completed when §21.2's sitemap membership holds — `isPublicDestination(doc, base)` is `true` — and it authors no canonical. The predicate is shared, not merely similar, for two reasons beyond tidiness:

- **`404.html`** is excluded for a stronger reason here than in §21.2. An error document is served *at whatever URL was missing*, so a canonical naming `/404.html` is not merely useless — it is an actively false claim about every address it appears at.
- **A `noindex` page** is excluded as the conservative default: write less where the author has said less. Note precisely what this is not — a completed canonical always names the page's **own** URL, so on a `noindex` page it would be redundant rather than contradictory. The contradiction product-spec §6.3.2 names is the *cross*-canonical shape, a page marked `noindex` whose canonical points elsewhere, and completion cannot produce that. §22.3 leaves the author's own escape hatch open: write the canonical and it is kept.
- **A page consolidated onto another** already has the canonical it wants — which is also why it left the sitemap. This clause does no work in the completion direction, because a page with any authored canonical is already excluded by §22.3; it is inherited with the predicate rather than needed by it.

### 22.5 What this section reports, and what it deliberately does not

A canonical — authored or completed — that names a location this site does not emit is already **P13**. §12 checks `link href` for every `rel`, so no new rule is needed and none is added; the case is pinned two-sided.

Multiple canonicals, a canonical on a `noindex` page, and disagreement between a canonical and the sitemap are content-quality judgements. Product-spec §6.3.4 assigns them to `unify audit`, and §6.1 states that ordinary `build` does not reject subjective findings. `metadataConflicts` (§20.4) already computes the multiple-canonical case on demand, which is what the evaluation command will read. Adding any of them here would put a judgement in the publish path that the product contract puts outside it.

---

## 23. Robots consistency

unify never writes a `robots.txt` and never decides what a site should block. This section validates the one thing in an authored file that is a **reference** — a URL that must fetch — and deliberately validates nothing else.

### 23.1 Scope

The output-root `robots.txt`, when the site emits one from its own source. A `robots.txt` anywhere else in the tree is an ordinary mirror-copied asset: [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) §2.3 fetches the file from one place — `/robots.txt` at the origin — so a copy in `blog/` is a file no crawler asks for, and a file unify would never interpret is a file it does not interpret. Nothing here generates, rewrites, or reorders a byte of it: the author's policy ships exactly as written.

**Under a subpath `--base-url` the file is checked but not served.** `--base-url https://example.com/repo/` puts the output root at `/repo/`, so the emitted file answers to `/repo/robots.txt`, which no crawler fetches. §23 checks it anyway, and deliberately: the file is still what the author wrote, still what they will move or symlink to the origin root, and a `Sitemap:` line that names nothing is wrong wherever it is served from. What unify must not do is *invent* the deployment — it does not warn that the file is at the wrong address, because it cannot know whether the subpath is the whole site or one deploy of it.

**These checks are not gated on `--base-url`.** §21.1 gates its section because a `<loc>` is absolute by protocol, so classifying one genuinely needs the site's address. That premise does not carry here: `Sitemap: /sitemap.xml` is internal by inspection, with no address required. An earlier version of this section borrowed §21.1's conclusion without its premise, and the result was an asymmetry inside a single build — §12 blocked the publish for `<a href="/gone.html">` while the identically-shaped `Sitemap: /gone.xml` beside it stayed silent, in exactly the configuration where a broken sitemap declaration is most likely, since a site with no `--base-url` has no generated `sitemap.xml` for the line to name. `--base-url` governs only the stripping step of §23.3's internal test, exactly as it does in §12.

### 23.2 Records

The file is read as RFC 9309 records: a line is a comment (`#`), blank, or `field: value`. Field names are case-insensitive. Everything the parser cannot make sense of is carried through untouched — §23.4 says why that is not an error.

### 23.3 `Sitemap:` is a reference

The `Sitemap` line is defined by the [Sitemaps protocol](https://www.sitemaps.org/protocol.html), not by RFC 9309 — which mentions it only as its example of a record outside the protocol (§2.2.4) — and it is the Sitemaps protocol that asks for a full URL there. unify does not require one: a value naming a location this site emits, in any spelling §12 accepts, is checked the same way.

A `Sitemap:` value naming a location this site emits must resolve to a file the site emits, or it is **P13**, the same broken-reference problem §12 raises for a page and §21.6 for a `<loc>`, located at the source `robots.txt`. "Naming a location this site emits" is §12's own test, reused: strip the `--base-url` prefix, and a value that is left root-relative or relative is internal. A value on another origin is skipped — verifying it needs the network, and network access is an explicit audit operation, never a build dependency.

This is the one check because it is the one **reference**. A `Sitemap:` line is a promise that a crawler can fetch that URL; a promise the site itself breaks is a fault unify can see without judging anything.

**One exemption, and it is the cost of §23.1's ungating.** §21.1 generates a sitemap only when `--base-url` supplies the site's address, so without that flag a value naming `sitemap.xml` (or a `sitemap-N.xml` the split produces) names a file *this build was not asked to write*. That is not a broken reference: the author's line is right for the deployed site, and nothing they wrote changed. It is skipped when `--base-url` is absent, for the same reason §21.1 gates generation — a flag the author did not set must not turn their correct site into a failing one. Without the exemption an ordinary `unify build`, and every `unify dev` preview, refused to publish a site whose `--base-url` build was clean, under a fix line pointing at a spelling that was already right.

The exemption's stated limit: a site that never uses `--base-url` and declares `Sitemap: /sitemap.xml` is promising a file it will never have. That is the deliberate trade — silence *in the publish path* for the site that is right at its deploy address, over a block for the site that is wrong everywhere — because the second case is a judgement about intent, which §6.1 keeps out of the publish path. It is not silence everywhere: §24.4's `robots-sitemap-missing` reports exactly the lines this branch skips, in the command §23.4 assigns every judgement about intent to. The evaluator is handed those values **by the branch that skipped them**, never by a second reading of `robots.txt` — the exemption and the finding are two sides of one decision, and a second parser could disagree with the first about which lines it took, in the one place where a disagreement means a line is examined by neither.

### 23.4 What is deliberately not checked

- **`Disallow` and `Allow` values are patterns, not references.** `Disallow: /admin/` on a site with no `/admin/` is ordinary and defensive — blocking a path that does not exist yet is exactly what an author should do. Checking them would be inventing the policy product-spec §6.3.3 forbids: "unify never decides what an author should block."
- **A malformed line is not a build problem.** RFC 9309 §2.3.1.5 (Parsing Errors) requires crawlers to try to parse every line and to **use the parseable rules** — an unparseable line does not invalidate the file or the lines around it. Failing a publish over one would contradict the standard the check exists to serve.
- **An unknown field is not an error.** RFC 9309 §2.2.4 (Other Records) *permits* crawlers to interpret records that are not part of the protocol, and names sitemaps as its example. The permission is what makes the format extensible, and it runs both ways: unify may read the `Sitemap` line precisely because §2.2.4 allows it, and must not reject a field it does not recognise, because another consumer may be the one reading it.
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

`audit` writes nothing into the source tree or the output directory. It never creates, cleans, or touches the output directory, and it never consults it: §17's delete plan is the one pipeline step that reads `dist/`, and it belongs to `--dry-run`, not here. (With `--generate`, the seam's own temporary state — the overlay directory and `generator-context.json`, §33.2/§33.3 — is written under the OS temp directory and removed with the rest of the build's generator state; that is outside both trees this guarantee is about, not an exception to it.)

Two flags describe writing, so `audit` refuses them rather than accepting them inertly: `--clean` and `--dry-run` are usage errors (exit 2) naming the reason. An accepted flag that does nothing is the silent failure §14 exists to forbid — `--clean` especially, where a reader could reasonably believe output was emptied.

### 24.3 Findings are not diagnostics

A finding is not a `problem` and not an `advisory`. It has its own record shape, its own two severities, and its own effect on the exit code, because it answers a different question: §14's diagnostics say whether the build is sound, and a finding says whether the site is complete.

| | severity means | blocks publish |
|---|---|---|
| `broken` | the output contradicts itself, or the standard it claims to follow. A fragment naming no id, a duplicated id, JSON-LD that does not parse. Wrong regardless of what the author intended. | never |
| `incomplete` | something is absent or inconsistent that an author may have chosen. A missing description, an orphan page, two pages sharing a title. | never |

Neither severity ever blocks a publish, because `audit` never publishes and `build` never audits. The severity distinction is objective — *is this wrong, or is this merely absent* — and carries no claim about importance.

### 24.4 The catalogue

Every finding but the last is a predicate over the §20 model — the snapshot, the analysis, and the selectors read over both. `doc` is the document being evaluated; "another page" always means another document in the same manifest. `robots-sitemap-missing` is the one finding about a file that is not a page: it is located at the source `robots.txt`, carries no `url`, and reads no document.

| id | severity | fires when |
|---|---|---|
| `title-missing` | incomplete | `titleOf(doc)` is null |
| `title-duplicate` | incomplete | another page's `titleOf` is identical after case folding and whitespace collapse |
| `description-missing` | incomplete | `descriptionOf(doc)` is null |
| `description-duplicate` | incomplete | another page's `descriptionOf` is identical after case folding and whitespace collapse |
| `h1-missing` | incomplete | the page's `document.body.headings` (§20.3's heading scope) contains no level-1 entry |
| `h1-multiple` | incomplete | `document.body.headings` contains more than one level-1 entry |
| `title-h1-mismatch` | incomplete | the page has a title and exactly one level-1 heading, and neither string contains the other after case folding and whitespace collapse |
| `lang-missing` | incomplete | `langOf(doc)` is null |
| `page-orphan` | incomplete | `analysis.linksIn` is empty and the output path is neither `index.html` nor `404.html` |
| `id-duplicate` | broken | an id appears more than once in `analysis.ids`; one finding per repeated id, in sorted order |
| `fragment-missing` | broken | an `analysis.fragmentLinks` entry names a page in this manifest whose `analysis.ids` does not contain the id |
| `jsonld-invalid` | broken | an `analysis.jsonLd` entry has a non-null `error` |
| `schema-incomplete` | incomplete | `declaredTypes(doc)` includes `Article` or `BlogPosting`, and `titleOf(doc)` is null, or `publicationDatesOf(doc).published` is null or has a null `iso` |
| `image-missing-dimensions` | incomplete | `preferredImageOf(doc)` is present and either `width` or `height` is null |
| `canonical-noindex` | broken | `robotsPolicyOf(doc).indexable` is false and `classifyCanonical(doc, base)` answers `elsewhere` |
| `sitemap-noindex` | broken | a sitemap emitted by this build lists the page and `robotsPolicyOf(doc).indexable` is false |
| `sitemap-canonical-disagree` | broken | a sitemap lists the page and `classifyCanonical(doc, base)` answers `elsewhere` |
| `canonical-scheme-mismatch` | broken | `--base-url` is set, `classifyCanonical(doc, base)` answers `self`, and the canonical's scheme and the site address's scheme are both `http`/`https` and differ |
| `text-duplicate` | incomplete | another page's `analysis.visibleText` is identical, after folding Unicode space separators, and non-empty |
| `metadata-in-body` | broken | the page has a `<head>`, and a document-metadata element is emitted outside it (`analysis.strayMetadata`) |
| `metadata-conflict` | broken | `metadataConflicts(doc)` (§20.4) is non-empty — the page declares two or more differing values for a field that may be declared **once**; one finding per entry |
| `redirect-loop` | broken | `analysis.refresh` names a target, every redirect on the chain from it is immediate (`seconds` is `0`), and the chain returns to this page |
| `jsonld-url-unprefixed` | broken | `--base-url` supplies a path prefix other than `/`, and a §12 JSON-LD reference on the page — the root-relative value of a URL-valued property, read by §12's own reader — does not already begin with that prefix — one finding per distinct value, in sorted order |
| `robots-sitemap-missing` | incomplete | §23.3 exempted a `Sitemap:` value in the emitted `robots.txt` — it names `sitemap.xml`, or a `sitemap-N.xml`, that this build, having no `--base-url`, did not write. One finding per exempted line, in the file's own line order |

`h1-missing`, `h1-multiple`, and `title-h1-mismatch` inherit **§20.3's 0.9 heading scope** — the first `<main>`, else `<body>`, else the document — without a rule of their own: they read `document.body.headings` as extracted, so a chrome `<h1>` a layout writes outside `<main>` no longer counts as the page's own heading, and no longer masks a page that has none of its own. §20.3 states the change and its rationale; this is the row it was written for.

`metadata-conflict` is what §20.4 and §22.5 both promise this command will render. `metadataConflicts(doc)` keeps the first of two differing declarations and computes the loser precisely so that a human can be told; §22.5 assigns "multiple canonicals" here by name, and product-spec §6.3.2 requires them reported. Before that selector existed the data was nowhere at all, so a page shipping two contradictory canonicals and two contradictory descriptions was silent in `build` *and* in `audit` — the one shape where both commands agreed to say nothing about a page that contradicts itself. It is `broken` because a page declaring two answers to one question has given consumers no answer.

  It renders a **closed subset** of the fields a selector could compute a conflict for: `canonical`, `title`, `description`, `lang` — exactly the fields whose own specification says *at most one per document*, and exactly the four `metadataConflicts` (§20.4) computes. That line, and not a judgement about which fields matter, is what can be defended to an author whose markup was called broken. `author` is excluded because the HTML spec defines the name as "one of the page's authors"; `robots` because crawlers read the union across every such meta (§20.6), so there is no conflict left to report; the declared structured-data type because §20.8's `declaredTypes` is a membership list with no single winner to contradict; and the two dates because `article:published_time` beside `<meta name="date">` names one instant at two granularities, and telling that author to keep one drops the property crawlers read. A field whose own repeats are how a standard spells a plural — several `og:image` declarations are how the Open Graph protocol spells an array, and a second `<script type="application/ld+json">` with a different `@type` is recommended practice rather than a contradiction — is correct markup, and reporting it as `broken` told an author to delete valid tags.

`metadata-in-body` names a closed set of elements — `<title>`, `<base>`, `<meta charset>`, `<link rel="canonical">`, and `<meta>` carrying `name="description"`, `name="robots"`, `name="schema"`, `property="og:*"`, or `name="twitter:*"` — because those are exactly the elements whose only valid position is the head and whose presence elsewhere therefore says nothing to anyone. `name="schema"` joins them from §26.4 with its own reading of "says nothing to anyone": it is unify's own key rather than a standard one, read with the head by §20.3, so a body-placed declaration reaches neither a consumer nor §26.6's generator — and its evidence says that rather than quoting a browser and a crawler that never read the key anywhere. It is `broken` rather than `incomplete` for the reason §24.3 gives: the document declares something at a position where the standard defines it to have no effect, which is wrong whatever the author intended. Elements that are legal in the body are never reported: `<link rel="stylesheet">`, `<link rel="preload">`, `<meta itemprop>`, and `<script type="application/ld+json">` all do their job there. Neither is anything inside a `<template>`, which §7 never touches.

`redirect-loop` turns on `seconds === 0`, and that is not the kind of number the third narrowing below forbids. Zero is the *absence* of a delay, not a small amount of one: a chain of immediate refreshes never presents a readable page to anybody, while a delayed chain is an ordinary pattern — a kiosk rotating three pages, a page that re-reads itself every thirty seconds — and reporting those would be calling a feature a fault. A page whose `content` is `"0"` alone is in scope: it names itself (§20.11) with no delay, which is the same loop written shorter. Every page on the cycle reports its own finding, as `text-duplicate` does for every page in a duplicate group — each of them is unreachable, and the chain printed from a page is the one its author will actually follow. A page whose refresh target unify cannot resolve, or whose second part §12's grammar does not read, is never on a chain: this finding accuses only where §20.11 has an answer.

`jsonld-url-unprefixed` is where §11.1's `url()` paragraph lands for structured data, and it is a finding rather than a problem for two reasons that both hold at once. The value **resolves** — §12 checked it against the output tree and it named a file — so nothing in the published bytes is broken; what is wrong is the address they will be served from. And the same value is **correct at a root deploy**: only a path prefix other than `/` makes it wrong, so without `--base-url` there is nothing to say, exactly as in §21.1. A value that already begins with the prefix is never reported — an author who wrote `/repo/img/logo.png` did by hand what §11.3 does for an `href`, and it is right at the address they named. The values are §12's own — the root-relative value of a URL-valued property, read by the same reader — so every value this finding names is one the reference check accepted as a locator, never a string that merely looked like a path. It is `broken` rather than `incomplete` because a page's structured data naming an address the site does not serve, at the address the site says it lives at, is a contradiction between two things one build emitted, which is §24.3's own definition.

`robots-sitemap-missing` is §23.3's residual, and it is wired the way it is on purpose: the finding fires on exactly the lines the build check **declined**, handed to the evaluator by the branch that declined them. It is not a second reading of `robots.txt`, and not a re-test of the exemption's own condition. The *base-prefix strip* exclusion below records what a second interpretation of a URL question already answered elsewhere costs: the two readings agree on every ordinary spelling and part on exactly the inputs that decide the answer. Two readers here would agree on `/sitemap.xml` and diverge on the first value one of them resolved differently — and a line the check skipped and the evaluator also skipped is a promise examined by nobody, which is the shape §24.4 has already terminated in once.

It is `incomplete` rather than `broken` because the author's line is not wrong. §23.3's exemption exists precisely because that line is right for the deployed site; what is absent is a sitemap **this run** was not asked to generate, and the same audit under `--base-url` emits the file, resolves the line, and reports nothing. Calling markup `broken` that a command-line flag repairs is the mistake this catalogue has made against itself twice — `metadata-conflict` rendered over §20.4's whole array, and `image-missing-dimensions` naming an `og:` tag on a page that declared none — and both times the finding told an author to change something correct. The evidence therefore quotes the authored spelling, for §23.1's reason: not one byte of this file is rewritten, so the resolved form is a string that appears nowhere the author can grep.

Two neighbouring shapes stay out, for §12's reason rather than a preference. A `Sitemap:` naming anything else the site does not emit — `/feeds/all.xml`, or `/SITEMAP.XML`, which the exemption is deliberately case-sensitive about — is **P13** already: the stronger answer, and §24.6 exits 1 on it whether or not a finding joined it. And an **absolute** `Sitemap:` value with no `--base-url` is skipped here exactly as §23.3 skips it: unify does not know the site's address, so it cannot say the URL names this site's sitemap at all. That is the same narrowing the two canonical findings take without an address, for the same reason — saying nothing is the only honest answer when unify does not know where the site lives.

**Five more findings belong to this catalogue and are specified in §26.3**, because their subject is one artifact and splitting its rules across two sections is how a reader ends up deriving them from the code: `jsonld-headline-mismatch` (incomplete), `jsonld-url-mismatch`, `jsonld-lang-mismatch`, `jsonld-entity-conflict`, and `date-unusable` (all `broken`). They are predicates over the §20 manifest like every row above, they print in §24.5's format, and `build` consults them exactly as much as it consults these — not at all (§24.7).

Three of these are narrower than the plain-language name suggests, and each narrowing has a reason rather than a preference:

- **Duplicate means identical.** Product-spec §6.3.4 says "substantially duplicated page text"; this spec says *identical*, and titles and descriptions fold case and collapse whitespace before comparing because those two differences are never authorial intent. Anything looser needs a similarity threshold, and a threshold is a number nobody can defend to an author whose two pages fell either side of it. §6.1 forbids failing content on arbitrary rules; an arbitrary rule is no better for being a float.
- **Title/heading mismatch is containment.** §8 row 2 *prepends* a page title to the layout's, so `About — Example Site` legitimately contains the `h1` `About`. Containment in either direction is therefore the whole test. A distance score would be the same undefendable number in another costume.
- **Nothing counts characters.** A short title is not a finding, a long description is not a finding, and neither is an empty one *for its length*. §6.7 names fixed title lengths specifically as a myth that must not become a product rule merely because SEO advice repeats it. Absence is checkable; length is opinion.

Three more absences are deliberate.

- **A canonical naming its own page is not `canonical-noindex`.** On a `noindex` page that is redundant, not contradictory, and §22.4 declines to complete one there for the same reason. The contradiction product-spec §6.3.2 names is the *cross*-canonical shape.

  Both findings that turn on this read §21.2's `classifyCanonical` — *which page does this canonical name?* — and fire only on a resolved answer that is a different page. Two other readings of the question have each produced a finding whose evidence quoted the page's own URL back at it, and both are excluded by construction:

  - **Not by negating §21.2's *membership* predicate.** Membership is a broader question that a `noindex` page fails for an unrelated reason, so a self-canonical `noindex` page listed in a sitemap was reported as "disagreeing" with it.
  - **Not by asking whether a base-prefix strip happened.** "Another site" is a question about the *host*, and `stripBaseUrl` matches `--base-url`'s origin as bytes — so every spelling of this site's own address that is not byte-identical survives it. `HTTPS://EXAMPLE.COM/x`, `https://EXAMPLE.com/x`, `//example.com/x` and `http://example.com/x` are the same page as `https://example.com/x` ([RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) §6.2.2.1: scheme and host are case-insensitive), and all four were reported as consolidating elsewhere. Hosts are compared as hosts. The scheme is deliberately not part of the comparison: `http:` against `https:` on one host is a deployment detail, and "this page nominates a replacement" is not a true thing to say about it. That exclusion is correct and stays; what it costs is paid separately, by `canonical-scheme-mismatch` below.
  - **Not by treating *unresolvable* as "somewhere else".** A `mailto:`, an empty value, or an absolute URL with no `--base-url` to compare against names something this build cannot confirm either way. Membership reads that as "not self-canonical", which is the conservative direction *there* — do not list a page unless its canonical demonstrably names it. For a finding the conservative direction is the opposite, and folding the two together meant that on the default golden path, where no `--base-url` is set and every absolute canonical is therefore unresolvable, a page whose canonical named itself was reported as nominating a replacement.
  - **And not by folding "another origin" into "unresolvable" either.** Once `--base-url` supplies the site's address, a canonical that survives base-stripping with an `http(s):` or protocol-relative origin intact is on a *different* site, visibly. Losing that case cost the pairing product-spec §6.3.2 names first: a `noindex` page consolidating onto a syndication partner, and a sitemap advertising a URL whose canonical points off-site. The repair for the previous paragraph silently created this one, which is why `classifyCanonical` answers with four states rather than a boolean either reading could hide in.

  The consequence is that both findings are narrower without `--base-url`: a root-relative canonical still resolves and an off-origin one is still visible against a known address, but an absolute canonical with no address to compare it to says nothing, because unify does not know where the site lives.
- **A canonical naming a location the site does not emit is P13, not a finding.** §12 checks `link href` for every `rel`, so the build already refuses to publish it (§22.5).
- **A share image naming a location the site does not emit is P13 too.** Product-spec §6.3.4 lists "missing social-image targets" among the findings this command should carry, and the intent is met by §12 — which blocks the publish rather than reporting, the stronger of the two answers, and keeps the question to one mechanism as §6.1 requires.

  This absence was first written on a false premise, and the premise is recorded because it is the more useful half. §12 was described here as having "always checked `content` on every `og:`/`twitter:` meta"; it had not. Its scope was a test on the *value* — root-relative or absolute — so a **relative** `og:image` naming nothing was checked by neither command: `build` never collected it, and `audit` had dropped the finding on the grounds that `build` covered it. A chain of two correct-sounding steps terminated in nobody. The repair was to make §12's premise true rather than to add a second mechanism, because the finding would have been the weaker answer to a question §12 can settle.

  `image-missing-dimensions` remains a finding because a missing dimension is not a broken reference — nothing to resolve, nothing for §12 to check. An image on **another origin** is skipped by §12 and unreachable here, because verifying it needs the network; that is `audit --external`, never a build dependency (§6.1).

**`canonical-scheme-mismatch` is the other half of that exclusion.** A canonical is a request to consolidate on *exactly* the URL it names, so a site served over `https` whose pages still declare `http://` canonicals is asking crawlers to consolidate onto the address it migrated off — the commonest single artifact of an HTTPS migration, and one that nothing in this build observed. §12 does not see it: `stripBaseUrl` compares **hosts**, so `http://example.com/about.html` on a site at `https://example.com/` is checked as the path `/about.html`, resolves, and passes. §21.2 does not see it either, by the design directly above — the page is self-canonical, so this fault never costs it a place in the generated sitemap, and §22 would have written the site's own address there had the page authored no canonical at all. Both are right and neither changes: the scheme is a separate fact, so it is a separate finding.

It fires only where unify can name both schemes and both are the web's:

- **`--base-url` must be set.** Without the site's address there is no scheme to compare against, and §20.5 makes `url` null. It is the fifth of this catalogue's findings that says less without an address, and the fourth of those silenced outright: `canonical-noindex` narrows (an absolute canonical no longer resolves), `sitemap-noindex` and `sitemap-canonical-disagree` have no listing to compare a page against at all, because §21.1 gates every reading of a sitemap on the same flag, `jsonld-url-unprefixed` has no prefix to test against, and this one has no scheme. Each for the same reason: saying nothing is the only honest answer when unify does not know where the site lives.
- **The canonical must resolve to *this page's own output path*** — `classifyCanonical` must answer `self`. That is the guarantee stated as the predicate computes it: §12's base stripping, then §12's resolution, against the page's output path. So this finding never re-derives "is this URL on this site?": the answer it reads is §12's, through §21.2, unchanged. It also means this finding never co-occurs with the other two for one canonical: they require `elsewhere` and it requires `self`, and one canonical has one answer. That is the whole of the guarantee, and deliberately not a partition — `canonical-noindex` and `sitemap-canonical-disagree` share the `elsewhere` branch, so a `noindex` page listed in a sitemap whose canonical names another page of the site collects both, and `sitemap-noindex` beside them. That is three true sentences about three different contradictions, which is the right outcome; what would be wrong is one page being told its canonical both names this page and does not. A canonical on another host is another site's business, and one naming a different page of this site has already been reported by the other two, where the scheme is the smaller of the two faults.
- **Both schemes must be `http` or `https`, and they must differ.** A canonical with no scheme of its own declares nothing to compare: a relative one carries none, a root-relative one is absolutized by §11.3 with the base's *own* origin and therefore cannot mismatch, and a protocol-relative `//example.com/about.html` **borrows the page's scheme** and is right at either address. A scheme unify cannot compare says nothing either — an `ftp:` or `mailto:` canonical, a value no URL parser accepts, or a `--base-url` that is itself neither `http` nor `https` (the flag requires a scheme with a host, not one of these two) leaves no basis for calling either side wrong.

Under a **subpath** `--base-url` the `self` entry condition above is a shade weaker than "names this page's address", and the gap is recorded here because this is the first rule to turn a `self` answer into an accusation — §21.2 reads the same answer only to decide whether to list a page. `stripBaseUrl` returns an on-host absolute URL's path unchanged when it does not carry the base's path prefix, so on a site deployed at `https://example.com/repo/` the canonical `http://example.com/team.html` — an address above this site's own root — strips to `/team.html`, resolves to the page's output path, and classifies `self`. The finding then reports the scheme, which is one of that value's two faults. That is `stripBaseUrl`'s resolution semantics, which §12 has always had and which this section does not change; anyone changing it changes what this finding fires on.

The two schemes are **parsed, never matched as text**, for §12's own reason one document over: [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) §3.1 makes a scheme case-insensitive, so `HTTP://EXAMPLE.COM/about.html` is an `http:` URL, and so is `http://example.com:80/about.html`.

The direction is **disagreement, not preference**. An `https:` canonical under an `http:` `--base-url` is the same finding: unify does not decide which scheme a site should be served over, it observes that the page and the address the author supplied name different ones. Deciding would be the judgement product-spec §6.1 keeps out of this command as firmly as out of `build`.

It is `broken` rather than `incomplete` because the contradiction is in the emitted bytes, and it needs no second artifact to show it: this build publishes the page at `https://example.com/about.html` — `document.url`, the address the evidence quotes — while the document served there nominates `http://example.com/about.html` as the URL to consolidate on. One build, two addresses for one page, and no intent makes both right. The generated sitemap makes the same disagreement visible for the pages it lists, but the finding does not rest on being listed: a `noindex` page and `404.html` fire it too, and §21.2's membership excludes both. That is `sitemap-canonical-disagree`'s contradiction one component over — the page against its own address rather than against a sitemap entry.

The evidence quotes both URLs, and the fix names `document.url` (§20.5) — the address this build gives the page, and exactly what §22 would have written had the page authored no canonical. `--canonical auto` is deliberately not offered as the fix: §22.3 leaves an authored canonical exactly as written, so the flag would change nothing (§24.5).

### 24.5 The report

Findings print to stdout, one finding as two lines:

```
<source path>: <severity>: <evidence> [<id>]
  fix: <one concrete action>
```

followed by a count line: `audit: N broken, M incomplete`, or `audit: nothing to report` when there are none. Evidence quotes the output — the title that repeats, the id that collides, the sitemap that lists the page — so a reader can act without re-deriving what the command saw. The fix names one action.

Ordering is by source path, then by finding id, and the sort is **stable**: deterministic, and stable across runs of an unchanged site, for the same reason §14.1 orders diagnostics. Two keys are not total — several findings fire more than once on one page (`id-duplicate` per repeated id, `date-unusable` per field, `robots-sitemap-missing` per line, `external-unreachable` per URL) — and that is deliberate, because **each producer owns the order of its own ties**. Those orders carry meaning this sort must not overwrite: §26.3 puts `datePublished` before `dateModified`, and §24.4 keeps `robots-sitemap-missing` in the file's own line order. A third key was tried, on `evidence`, to make the order total. It reversed both of those rules on its first run — alphabetically `dateModified` precedes `datePublished` and `/sitemap-2.xml` precedes `/sitemap.xml` — which is the argument against it, stated here so it is not tried again. Where a producer has no order of its own, the fix belongs in the producer: `external-unreachable` sorts by URL before building a finding, because what it inherited otherwise was the order the network answered in.

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

**`build` here is the command, not the pipeline.** §27's local audit view is assembled from findings over the rebuild `unify dev` just ran, and that rebuild runs this same pipeline — the other reading makes §27.3 unimplementable, since a view forbidden to re-read the site can only be handed findings by the run that produced the manifest. What this section forbids is a finding *changing a build*, and that holds of `dev` too: with the view attached, its rebuild writes the same bytes, prints the same diagnostics, and returns the same exit code as without. `unify build` and `unify watch` never evaluate at all, which is the stronger statement and the literal one.

---

## 25. Final-output verification: the routing map

Product-spec §6.3.5 names six parts of "final-output verification" plus a clause about generated artifacts, and §6.3.4 names the audit findings — and **the two lists overlap**: fragment identifiers and duplicate IDs appear in both. This specification resolved that overlap part by part, across seven different sections, and until this one existed the resolution was written down nowhere a reader could find it. The same question was then asked twice by two separate reviews and answered both times by re-deriving it from the code.

This section decides almost nothing of its own. It is a **map**: one row per §6.3.5 part, naming where the decision already lives and what kind of decision it is. Every row points at a rule stated elsewhere in this document. Its own normative content is only what a map can carry that its destinations cannot: the **boundary** between §12 and §24.4 (§25.2), and the list of things §6.3.5 asks for that are deliberately **not** done (§25.3). A map that quietly omitted an item would be worse than no map, so §25.3 states the omissions in full rather than leaving them as gaps between rows.

### 25.1 The map

| §6.3.5 part | Decided in | As what |
|---|---|---|
| Fragment identifiers | §24.4 `fragment-missing` | A `broken` **finding**. §12 strips the fragment before matching (REF-06) and never validates it; §20.9 carries the `fragmentLinks` pairs beside `ids` so the finding is answerable from the manifest. A link whose **path** is broken is still P13, fragment or no fragment (§25.2). |
| Duplicate IDs | §24.4 `id-duplicate` | A `broken` **finding**, one per repeated id in sorted order, located at the page that declares them — never at a page that links to them. §20.3's `ids` keeps repeats for exactly this. Not a §13 collision (that section is about output paths) and not a §12 reference. |
| Normalized public-URL collisions | §13 | **P12** for one output path from two sources, **A11** for a case-only difference, **A16** for a Unicode-normalization-form difference. §13 carries the argument that those three close the set. A reference written in the other form stays P13 (§25.3). |
| Metadata placement | §20.3 and §24.4 `metadata-in-body` | Two decisions in two registers, deliberately. §20.3 declines to **read** document metadata outside `<head>`, so the fields it would have supplied are correctly reported missing; §24.4 **reports** each element it declined to read, as `broken`. `build` reports nothing about it, and unify never moves the element — the emitted bytes are the author's. |
| Redirects | §11.1 (URL-13), §12 (REF-09), §20.11, §24.4 `redirect-loop` | The one redirect unify emits is a `<meta http-equiv="refresh">` in an authored page, and it is treated as a URL everywhere a URL is treated: re-rooted against its provenance file, rewritten by `--pretty-urls` and `--base-url`, **P13** when it names nothing emitted, recorded as `refresh`, and reported as `redirect-loop` when a cycle of immediate refreshes closes. A **host** redirect file is not a redirect unify understands (§25.3). |
| URLs emitted into a sitemap | §21.6 | **P13**, located at the sitemap, for a generated or an authored one alike — under `--base-url` only, because §21.1's activation governs the whole section. |
| URLs emitted into JSON-LD | §12 (REF-10) and §24.4 `jsonld-url-unprefixed` | **P13** for a root-relative value of a URL-valued property (`url`, `logo`, `image`, `thumbnailUrl`, `contentUrl`) naming nothing emitted, located at the `<script>` element; the criterion is §12's closed property list, never the value's shape. The residual §11's non-rewriting leaves — a value that resolves in the tree but names the origin's root at a subpath deploy address — is AUD-14's finding. |
| Generated artifacts in the transaction and in `--dry-run` | §21.1, §15, §17 | **True by construction, not by a check** (SIT-01). A generated artifact is written into the temporary tree like every other file, so §15 publishes it only when the whole build has zero problems — one broken link on one page leaves the previous output, sitemap included, byte-for-byte untouched — and §17 lists it with the same address column every other row has and a `← generated` origin in place of a source file. |

### 25.2 Why fragments and duplicate IDs are findings, not reference-check extensions

§6.3.5's own wording is "extend the existing reference check", and taking it literally is the reading this document rejects. The reason is in what the two mechanisms mean.

**A broken fragment is not a 404.** The page loads, the reader arrives, and the only thing that failed is the scroll position the link promised. §12 exists to stop the build publishing an address that fetches nothing; a fragment that names no id fetches the page perfectly well. Making it publish-blocking would mean a site that has always built clean stops publishing over a link that still works — the exact shape of failure §14.1's severity split exists to prevent, and the reason `--strict` moves the exit code without withholding the site. §12 has said so in one clause all along: "`#fragment` targets are not validated against ids — that is a reader's judgment, not a build gate" (REF-06).

But it is a *checkable* judgment, and §20.9 says so in the same breath: the manifest carries `fragmentLinks` beside `ids` precisely so the question is answerable from the manifest itself rather than by re-parsing. That is what a finding is for — §24.3's `broken` means "the output contradicts itself, wrong regardless of what the author intended", which is exactly right for a link naming an id that is not there, and it blocks nothing.

**A duplicate id is the same shape one layer in.** The document is wrong — HTML requires an id to be unique, and every link to a repeated one is ambiguous — but nothing 404s and no address is unreachable. It is not a §13 collision either: §13 ranges over output paths, and two ids inside one page produce one file at one address.

The boundary stays where §12 already draws it, and it is sharp in both directions.

- A link whose **path** resolves to nothing is **P13** whether or not it carries a fragment: `/gone.html#x` is a broken link, and the fragment is not what is wrong with it.
- A link whose path resolves and whose **fragment** does not is a finding, and the page publishes.
- A link naming an id that a page declares *twice* draws only that page's `id-duplicate` — not a second finding at the link, and not a P13 — because `fragment-missing` asks whether the id is present, and it is. The fault is one fault, reported once, at the file that can fix it.

### 25.3 What §6.3.5 asks for that is deliberately not done

**A host's redirect file is source, not a redirect.** unify emits no redirect artifact of its own beyond the authored `<meta http-equiv="refresh">` §25.1 routes, and it understands no host redirect syntax. `_redirects` and `_routes.json` at the source root are held back by the default exclude set and draw advisory **A14**, naming the `--exclude` line that would ship them; ship them and they mirror-copy byte-for-byte (§4.4), and their contents are never parsed, so a target inside one that names no emitted file is **not** P13. That last point is the decision, not an accident. The file's syntax belongs to Netlify, to Cloudflare Pages, to whoever will serve the site — each with its own splat, placeholder, status-code, proxy and country-condition grammar, none of which unify writes and none of which it can adjudicate. Reading a redirect target as a reference would fail correct files and would still miss the ones that matter. Inferring a redirect *rule* from the source tree would be the invented claim product-spec §6.1 forbids, in the one place a build has no evidence at all.

**A cross-normalization reference is P13, and stays P13.** A link written `/café.html` in NFC to a file named in NFD resolves to no emitted file and blocks the publish (§12, byte-exact after percent-decoding). Normalizing either side before matching would make the build accept a link that the deploy host may or may not serve, which is the direction §12 never takes: its case rule already refuses the same leniency for the same reason. A16 reports the *files*; §12 keeps reporting the *link*, and the two never trade places.

**A host that strips extensions is not a collision.** Two output paths `about.html` and `about/index.html` answer to `/about.html` and `/about/` — two addresses, and unify emits both. A host configured to serve `about.html` at `/about` as well makes `/about` ambiguous, but that is a property of the deployment, invisible in the output tree, and choosing it site-wide is precisely what `--pretty-urls` is — under which the pair is already **P12** (§13, row two). unify does not guess a host's routing table.

**Nothing here reaches the network.** An external URL, an off-origin share image, an off-origin `<loc>`: all skipped, by §12, §21.6, and §24.4 alike. Product-spec §6.5.3's `audit --external` is where that lives, and it is never a build dependency (§6.1).

---

## 26. Structured data: validation and bounded generation

Product-spec §6.3.6, and the two halves are deliberately unequal in size: unify **validates** structured data at length and **generates** almost none of it.

### 26.1 What already owns which half

Nothing in this section re-reads a page. Four rules were in place before it existed, and it adds to them rather than restating them:

| question | owner |
|---|---|
| does an authored block parse? | §20.8's `analysis.jsonLd` holds `{raw, data, error}`; §24.4's `jsonld-invalid` reports the failure |
| do its URLs name files this site emits? | §12's closed property list; **P13**, publish-blocking |
| are those URLs right at the deploy address? | §24.4's `jsonld-url-unprefixed` |
| what type(s) does the page declare? | §20.8's `declaredTypes(doc)` |

What this section adds is findings that compare a block against **the page it is on** (§26.3, read as §26.2 bounds it), and one bounded generator (§26.4–§26.8).

### 26.2 Reading a block: the subject object

Every comparison below reads the **subject object** of a JSON-LD entry: its `data`, when `data` is a single object — not an array, not a `{"@graph": […]}` wrapper — and only that object's own **string-valued** properties. This is §20.8's bounded reading, unchanged, applied to one more question, and the reason is the same: an array and a `@graph` are several entities, and deciding which of them is *this page* is a judgement, not a reading.

The cost is stated rather than hidden. `@graph` is how several widely-deployed CMS plugins emit structured data, so on those pages every **comparison** in §26.3 is silent — the four findings that read a block. The fifth, `date-unusable`, reads no JSON-LD at all (§26.3): it compares `publicationDatesOf(doc)`'s own `published`/`modified` against nothing, so a `@graph` page whose `date:` is malformed is reported exactly as any other page is. The sentence is narrowed to the comparisons deliberately, because the wider claim contradicts §26.3's own catalogue row and a reader has to be able to tell which one the build implements: it is the row. That is the conservative direction — §24.3's severities are claims about a document, and a claim about the wrong node of a graph is worse than no claim. A later revision that wants those pages must first say **which** node is the page, in this section, with the rule written down; until then it says nothing and this paragraph records why.

### 26.3 Validation findings

These join §24.4's catalogue and obey every rule of it: they are predicates over the §20 manifest, they print in §24.5's format, they never block a publish, and `build` never consults them (§24.7).

| id | severity | fires when |
|---|---|---|
| `jsonld-headline-mismatch` | incomplete | a subject object's `@type` is `Article` or `BlogPosting` and it declares a string `headline`, the page emits exactly one `h1`, and neither string contains the other after case folding and whitespace collapse |
| `jsonld-url-mismatch` | broken | a subject object declares a string `url`, the page declares a `canonical`, both resolve — by §12's own reader — to an output path this manifest holds, and the two paths differ |
| `jsonld-lang-mismatch` | broken | a subject object declares a string `inLanguage`, the page declares `lang`, and the two **primary language subtags** differ after case folding |
| `jsonld-entity-conflict` | broken | two subject objects on one page declare the same string `@id` and different string `@type` values; one finding per `@id`, in sorted order |
| `date-unusable` | broken | `datePublished` or `dateModified` has a non-null `raw` and a null `iso`; one finding per field, `datePublished` first |

`jsonld-headline-mismatch` is product-spec §6.3.6's "compare factual fields with visible content where the relationship is unambiguous", and the `h1` is the visible content — the one string on the page that is *definitionally* the same fact a `headline` states. The comparison is **containment in either direction**, for §24.4's own reason: §8 row 2 prepends a page title to the layout's, so the strings a correct site produces are routinely nested rather than equal, and anything looser is a similarity threshold nobody can defend to the author whose two strings fell either side of it. It requires **exactly one** `h1` for the reason `title-h1-mismatch` does: with none there is nothing visible to compare, and with several there is no answer to *which* one, only a choice. It is `incomplete` rather than `broken` because a headline that restates the heading differently is a decision an author may have made; `title-h1-mismatch` is the same shape and the same severity. The row has **no exception for a block §26.6 generated**, and §26.7 records why: a generated `headline` is `titleOf(doc)`, so such a page collects this finding beside `title-h1-mismatch`, and the alternative — a finding that reads which bytes this build wrote rather than what the document says — is what §24.4's own "predicate over the §20 manifest" rules out.

`jsonld-url-mismatch` is the page telling a consumer two different things about its own address: `<link rel="canonical">` names one page and the structured data names another. Both are read through **one** resolver — §12's base stripping, then §12's resolution, then directory URLs to `index.html` — which is the same rule §21.2, §22.4, and `canonical-scheme-mismatch` read, so "which page does this URL name" keeps one answer across the whole build. It fires only when **both** resolve: a `url` naming another origin is that site's business, and one naming a location this site does not emit is already **P13** through §12's closed property list, which is the stronger answer and the one mechanism (§24.4's own precedent for the share image). `broken`, because two addresses for one page in bytes one build emitted is §24.3's definition.

`jsonld-lang-mismatch` compares only the **primary subtag**, case-insensitively, and both halves are load-bearing. [BCP 47](https://www.rfc-editor.org/rfc/bcp47) §2.1.1 makes language tags case-insensitive, so `EN-us` and `en-US` are one tag and a byte comparison would accuse a correct page. And `en` beside `en-GB` is a **refinement** rather than a contradiction — one says English, the other says which English — so comparing whole tags would accuse the commonest correct pairing there is. What is left, `en` against `fr`, is one document answering one question twice with two answers, which is `broken` for `metadata-conflict`'s reason.

`jsonld-entity-conflict` is product-spec §6.3.6's "contradictory entities", at the one shape where the contradiction is unarguable: two blocks naming **one** entity by `@id` and classing it two ways. §24.4 already records that a second `ld+json` block with a *different* `@type` is recommended practice rather than a fault — a `WebPage` beside an `Organization` is two entities — so the `@id` is exactly what separates the two cases, and this finding fires on nothing that lacks one.

`date-unusable` is the one finding here that reads no JSON-LD. §20.10 splits a date into `{raw, iso}` so that "what did the author write" and "what can anything emit" never collapse; a `publicationDatesOf(doc)` field where `raw` is present and `iso` is null is a page that declared a date **no consumer can use** — not §21.3's `<lastmod>`, not §26.6's `datePublished`, not a crawler. Before this finding existed that value was dropped in silence by every one of them, which is the failure class §14 exists to forbid, moved one register over. It is `broken` because a value that does not conform to the format its field is defined in is wrong regardless of intent (§24.3), and the evidence quotes `raw` — the author's own bytes, the only string they can grep for. Product-spec §6.7 names "inferred or malformed dates" among the cases a diagnostic must cover; this is the malformed half, and the inferred half is §20.10's rule that no date is ever derived.

**One comparison is deliberately not made.** A JSON-LD `datePublished` beside the page's own `<meta property="article:published_time">` is *not* compared, and the reason is §24.4's, verbatim in another costume: the two name one instant at two granularities. `2026-01-02` and `2026-01-02T09:30:00Z` are not a contradiction, and separating the pairs that are from the pairs that are not needs a rule about time zones and about how much of a day a bare date covers — a judgement, in a section whose whole discipline is that it makes none. §24.4 excluded the same pair from `metadata-conflict` for the same reason, and excluding it here keeps one answer rather than two.

Three more comparisons stay out, each for a reason of its own. A JSON-LD `image` beside `og:image` is two share images, and a page may legitimately want different ones — the crawler and the social scraper are different consumers. A JSON-LD `description` beside the meta is the same: a `description` written for a search snippet and one written for a rich result are both the author's. And `name` beside `<title>` is `title-h1-mismatch`'s question with a third string added, which would make one page's title reconcilable against two things at once.

### 26.4 Generation: the declaration

A page asks for a generated block by declaring a type unify generates:

```html
<meta name="schema" content="Article">
```

or, from Markdown frontmatter, `schema: Article` — §10.2's ordinary meta synthesis, no new key mechanism. The two spellings are the same declaration and produce identical output, and a layout may carry it for a whole section. There is one extraction path (§20.8's `declaredTypes`) and one generator.

The accepted values are exactly **`WebPage`**, **`Article`**, **`BlogPosting`**, **case-sensitively**. Anything else is **P23**, located at the declaration — the frontmatter key for a Markdown page, the element for an HTML one, at its line in that file when §14.1 can name one:

```
src/post.md: problem: schema is "article" — unify generates WebPage, Article, or BlogPosting, spelled exactly
  fix: write schema: Article, or write the block yourself in a <script type="application/ld+json">
```

Case-sensitivity is not fussiness: `article` is not a schema.org type, and a declaration that silently generated nothing would be the failure class §14 exists to forbid. Nor is the closed list a claim that other types do not matter — a page needing `Product`, `Recipe`, `LocalBusiness`, or any other vocabulary writes its own `<script type="application/ld+json">`, which is product-spec §6.3.6's own instruction and which also switches generation off (§26.5), so the two never fight.

`name="schema"` is **unify's own key**, introduced by §20.8 and defined by no standard, so constraining its values constrains unify's vocabulary rather than the author's HTML.

**It also ships**, and that is worth stating outright because three documents claimed it could not. "Built output contains no tool vocabulary at all" was true of the composition core alone — `<slot>`, `slot=`, `data-layout` and `<include>` are all consumed by composition — and this key is the first exception. It is not an oversight and it is not removable: unify does not edit an author's markup, so an HTML page's `<meta name="schema">` is theirs and stays; and §20.8 reads the declaration *from the emitted document*, which is the whole reason a Markdown page and an HTML page declare a type the same way. Consuming the frontmatter key the way §10.2 consumes `title` or `lang` would give Markdown its own extraction path and break that equality — one more spelling for one more reader to learn, which §20.2's equal-citizen rule exists to prevent. So the honest statement, and the one those documents now carry, is that built pages contain no `<slot>`, no `data-layout` and no injected script, and that the one token which survives is this meta, on a page that asked for a block. §20.8's `declaredTypes` stays as general as it was: it also reads a JSON-LD `@type`, which is unrestricted, so a page declaring `Product` in a block it wrote itself has `Product` among its declared types, and `schema-incomplete` still reads it there.

**The declaration is read with the head**, exactly as §20.3 reads it, and P23's scope is that scope — a `<meta name="schema">` emitted in `<body>` declares no type, generates nothing, and is not P23, because diagnosing a declaration §20.8 never accepted would be a problem raised against markup that changes nothing. What it *is* instead is §24.4's `metadata-in-body`, whose closed set names `schema` for this reason: unify's own key, read with the head, so outside it the declaration reaches neither a consumer nor this section's generator. Without that row the one key whose whole purpose is to switch generation on would be the only head-only meta whose misplacement nothing reports — no block, no problem, no finding — which is the silence the case-sensitivity argument above refuses one line earlier.

### 26.5 Generation: activation

A block is generated for a page when **all three** hold:

1. `declaredTypes(doc)[0]` is one of the three accepted values.
2. `analysis.jsonLd` is **empty** — the page emits no `<script type="application/ld+json">` anywhere in the document.
3. The emitted document has a `<head>` with a closing tag.

Condition 2 is **authored JSON-LD always wins**, §22.3's rule one artifact over: generation fills a gap and never adjudicates a value the author chose. It is deliberately not head-scoped, because §20.8 is not and §24.4's `metadata-in-body` says outright that `ld+json` does its job in the body — a page that wrote its block after its content wrote a block. Contents of a `<template>` are not a declaration, here as everywhere (§7, §20.2).

Conditions 1 and 2 together mean the declaration that reaches the generator is always a **meta**: under (2) no JSON-LD entry survives to contribute a declaration, so `declaredTypes(doc)` reduces to the meta-declared types alone (§20.8's own ordering — every meta before every JSON-LD entry), and its first entry is unambiguous.

Condition 3 is §22.2's rule: with no closing `</head>` there is no insertion point, and synthesizing one would be a structural change this section does not make.

There is **no flag**. The declaration is the whole opt-in, and a site that writes none is the golden path, unchanged.

### 26.6 What is generated

One `<script type="application/ld+json">` inserted **at the end of the emitted `<head>`, immediately before `</head>`**, reusing the whitespace that precedes that tag so the element lands at its indentation and the rest of the document is byte-identical (§3, §22.2). Every line of the element carries that same indentation.

The object's properties, in this order, every one of them omitted when its source is absent:

| property | value | omitted when |
|---|---|---|
| `@context` | the string `https://schema.org` | never |
| `@type` | the declared value | never |
| `name` (`WebPage`) / `headline` (`Article`, `BlogPosting`) | `titleOf(doc)` | `title` is null |
| `description` | `descriptionOf(doc)` | `description` is null |
| `url` | `canonicalOf(doc)`, else `document.url` | both are null |
| `image` | `preferredImageOf(doc).url` | `image` is null |
| `author` | `authorOf(doc)` — **a string** | `author` is null |
| `datePublished` | `publicationDatesOf(doc).published.iso` | the field is null, or its `iso` is |
| `dateModified` | `publicationDatesOf(doc).modified.iso` | the field is null, or its `iso` is |
| `inLanguage` | `langOf(doc)` | `lang` is null |

Product-spec §6.3.6 names the two date sources as the frontmatter keys `date` and `lastmod`, and the chain that connects them to this table runs entirely through rules that already exist: §10.2 emits `<meta name="date">` and `<meta name="lastmod">`, `publicationDatesOf` reads those into `published`/`modified` (alongside `article:published_time`/`article:modified_time`, which an HTML page is likelier to write, per §20.4's `metaRole` chain), and §20.10 decides whether either has an `iso`. This section adds no mapping of its own, which is why an HTML page needs no frontmatter to generate the same block.

Every value comes from a **selector over the final document** (§20), never frontmatter. That is §20.2's equal-citizen rule doing its work: a layout-supplied description is used, an HTML page generates exactly what a Markdown page with the same emitted head generates, and character references are already resolved (§20.3) so the JSON carries the text a reader sees.

Four of these choices are not arbitrary and are argued rather than asserted:

- **`headline` for an article, `name` for a page.** schema.org gives `Article` and `BlogPosting` a `headline`, and it is the property Google's own Article documentation reads; `WebPage` has no `headline`, and `name` is the property it does have. Emitting `name` on an article would be valid and unread; emitting `headline` on a `WebPage` would be a property its type does not define.

  Either one carries the **merged** title, suffix and all — §8 row 2 prepends the page's own `<title>` to the layout's, so a page titled `Shipping in public` under a layout titled `— Example` generates `"headline": "Shipping in public — Example"`. That reads as a defect and is not one, for a reason worth stating where a reader meets the output: the separator lives in the layout (§8), unify never learns which bytes of a title are the site's name, and cutting at the first `—`, `|`, or `·` would be a guess about the author's punctuation that is wrong the first time a headline contains one. `titleOf(doc)` is what the document declares to every other consumer — the browser tab, the search snippet, the `og:title` a page derives from it — so the block declares the same string rather than a private second reading of it. §26.3's containment test is chosen to make that harmless: a merged title contains its own `h1` by construction, so the generated block never draws `jsonld-headline-mismatch` for the suffix alone. A page that wants a bare headline writes its own block, which is §26.5's condition 2.
- **`author` is a plain string, not a `Person`.** `<meta name="author">` declares, in the HTML specification's own words, the name of one of the page's authors — a name, and nothing about what kind of thing bears it. Writing `{"@type": "Person", "name": …}` would assert that the author is a person, which is an invented claim and which product-spec §6.1 forbids in exactly these words. A publication whose author is an organization would be misdescribed by a build that never asked. A page that needs a typed author writes its own block (§26.5's condition 2), which is the escape hatch §22.3 has for the same class of decision.
- **`url` is the final canonical**, which is why §26.7 orders this after §22: a page whose canonical `--canonical auto` supplied must generate *that* URL, not a second opinion about its address. Where the page declares no canonical and no address is known, both sources are null and the property is omitted rather than guessed.
- **A date is emitted only from `iso`.** `raw` is never emitted anywhere (§20.10), so a page whose `date:` is not W3C-DTF generates no `datePublished` — and says so, through `date-unusable` (§26.3), rather than emitting a value that is invalid where it lands.

**Serialization is fixed**, so two builds of one tree produce identical bytes: two-space indentation, properties in the table's order, and every `<` in the serialized JSON written as `\u003c`. That last is not decoration — a description containing `</script>` would otherwise end the element early and put the rest of the JSON into the document as text. `\u003c` is a JSON string escape, so the block a consumer parses is unchanged.

### 26.7 Ordering, and what checks the result

Generation runs **after §22's canonical completion and before §20's final manifest**, for the reason §22 runs where it does: the manifest reads emitted bytes (§20.2), so anything that writes into a page must have written before the reading that every consumer shares. A build with both features derives the manifest three times — once to decide completion, once to decide generation against the completed text, once as the manifest — and §20.2's "deriving it changes nothing" is exactly what makes that safe rather than a smell.

§12 then checks the generated block like any other, and here it **can only fail where the page's own value already failed**: `url` is the canonical §12 already checks as a `link href`, and `image` is the `og:image` value §12 already checks as a URL-valued meta, so the block carries no reference the page did not already carry. It runs anyway, for §21.6's reason — it is the executable form of the claim that a generated block and the published tree agree, so a change that lets them drift fails in the suite rather than at a crawler.

**Where that residual is located** is stated here rather than left to a reader of an implementation, because §1's provenance rule — *the source file whose text contained an element's start tag* — has no answer for an element no file wrote. A reference §12 finds inside a generated block is located at **the page the block was generated for**, and **without a line**: that page's output is what carries the block, and §14.1 omits a line rather than guessing one no file holds. The alternative — locating it where the insertion happened, at whichever file contributed the `</head>` the block was spliced before — is the same guess one field over, and it is checkable and wrong in the same way: for a Markdown page under a layout it names the layout, and for a layout that includes its head chrome it names the fragment, neither of which contains the reference. So a page whose `og:image` names nothing gets its own diagnostic at the declaration and a second, line-less one at the page; where the authored declaration is itself line-less — a Markdown page, §10.1 — §14.1's deduplication makes the two one. Nothing here decides publication: the authored fault blocks it either way.

`--dry-run` names the work, beside §22's own line (§17):

```
structured data: 3 pages would gain a JSON-LD block
```

The block participates in §15's transactional publish because it is part of a page's bytes: a problem anywhere leaves the previous output untouched, generated block and all.

`unify audit` runs this exactly as `build` does — §26 has no flag to be set, so §24.1's "the whole pipeline" includes it — and then evaluates the result. A generated block is therefore visible to §26.3's own findings, and **two of the comparisons it can reach are silent by construction**: `jsonld-url-mismatch` compares the block's `url` against `canonicalOf(doc)`, which is where §26.6 took it from, and `jsonld-lang-mismatch` compares its `inLanguage` against `langOf(doc)`, likewise. `jsonld-entity-conflict` needs an `@id`, which §26.8 never emits, and there is one block by §26.5's condition 2.

`jsonld-headline-mismatch` is the one that is **not**, and the exception is written down rather than papered over: §26.6 takes `headline` from `titleOf(doc)`, while §26.3 compares it against the page's single `h1`. A page whose title and heading disagree therefore collects that finding beside `title-h1-mismatch` — two true sentences about one disagreement, in two vocabularies, with one repair, which is the shape §24.4 already accepts where two findings share a cause. Teaching the finding to skip a block *this build generated* is the alternative, and it is refused for §24.4's own reason: every finding is a predicate over the §20 manifest, the manifest is a reading of the emitted bytes (§20.2), and those bytes carry no record of who wrote them — a page that authored by hand exactly the block unify would have generated must audit identically, or `audit` is reporting on provenance rather than on the document a consumer receives.

### 26.8 What is never generated

The list is closed, and each absence is the same rule: unify emits what the page declared and nothing it would have to decide.

No `publisher` — it names an entity the page did not declare. No `mainEntityOfPage` and no `@id` — both are identity, and §12's own property list excludes them for that reason. No `articleBody`, `wordCount`, or `keywords` derived from `analysis.visibleText` — that is generated prose and a keyword count, two things product-spec §6.1 forbids by name. No `isPartOf`, `breadcrumb`, or `speakable` — each needs a structure of the site that unify has as links, not as claims. No image `width`/`height` inside the block, even when `preferredImageOf(doc)` carries them: they belong to the `og:image` declaration that supplied the URL, and `image-missing-dimensions` already reports their absence there. And no date from any source but an authored, well-formed one — not the build clock, not the filesystem, not the filename, not Git (§20.10).

---

## 27. The local audit view (`/_unify/`)

Product-spec §6.3.8. `unify dev` serves one extra page: a report of what §20 read and what §24 found, for the site currently in the output directory. It exists because `unify audit`'s stdout is a list and a site is a graph — the same findings, arranged by page, with the page's own document beside them, answer "what is wrong with *this* page" in one look.

### 27.1 It is served, never published

The report is assembled in memory and returned by the development server. **Nothing is written to the output directory**, no file is created for it, and `unify build`, `unify watch`, and `unify audit` neither produce nor mention it. It is not in the `--dry-run` list, because `--dry-run` lists what a build would write and this is not that.

Published pages are untouched: §16's reload script is injected into HTML the server *serves* and has never existed in the output directory, and this section adds nothing to that. A page fetched from `dist/` by any other means — a deploy, a `curl`, a second server — is byte-identical whether or not `dev` ever ran.

### 27.2 The path is reserved by a rule that already exists

`/_unify/` and every path beneath it belong to the server. The reservation costs nothing to enforce and nothing to explain, because §4.2 already forbids the collision *there*: a source path with a leading underscore is excluded, and an emitted `_`-prefixed page or `_`-prefixed directory segment is **P14** — and every path under `dist/_unify/` carries one. A site therefore cannot emit `dist/_unify/anything`, so nothing this report shadows below its own path is a file the site was able to publish.

That is the whole reason the name has an underscore. A reserved path that could shadow an author's file would be a new rule; this one is the underscore convention, read from the URL side.

Exactly one path serves the report: `/_unify/`. A request to `/_unify` (no trailing slash) redirects to it, as any directory would, and any other path beneath it is a 404 from the server itself — the reservation is a promise about who answers, not an invitation to guess sub-pages.

**One output path is not held back, and the redirect above answers it anyway.** §4.2's guard deliberately spares root-level `_`-prefixed **non-page** files — that is the Netlify seam, the reason `_headers` and `_redirects` can ship — so a source root holding a file named exactly `_unify`, built with an exclude set that spares it (`--exclude '_*.html' --exclude '_*.md'`), emits `dist/_unify` with no diagnostic, and `unify dev` answers `/_unify` with the redirect above regardless of what is on disk. That one file is therefore unreachable through the development server while every static host serves it. It is stated rather than repaired, and the paragraph above is stated as the narrower claim it can support, because the alternative is worse than the gap: an "is there a real file at this path?" branch in the server would make who answers depend on the output directory's contents — a second rule to learn, in the one place it would almost never take its other branch, and one that could hide the report from the author who needs it. `dev` is not the deploy; a site that needs that byte served locally renames the file, and `unify build` ships it either way.

### 27.3 What it shows

The report is assembled from the **same two sources the command line uses, and no third**: the §20 manifest of the build that just ran, and §24's finding list over it. It re-derives nothing and re-parses nothing, so a page reported here and the same page reported by `unify audit` cannot disagree — that is product-spec §6.2's rule, and a second reading of the site inside a development server would be the least-observed place to break it.

It carries, in this order:

1. **A summary line** — the counts `unify audit` prints, and the address the build assumed (§17's first line), so a report read at a glance says which build it describes.
2. **The findings, grouped by page**, each with its severity, its evidence, its fix, and its stable id — §24.5's four fields, rearranged rather than reworded. Grouping is by the finding's own location, which is a page for every finding but one: §24.4's `robots-sitemap-missing` is located at the source `robots.txt` and reads no document, so it groups under that file with no document beside it. Walking the documents and collecting each one's findings would drop it, and §27.5 forbids exactly that — a finding `unify audit` prints and this view does not is the disagreement that section calls a defect, in its most literal form.
3. **Every page's own document**, including pages with no findings: output path, public URL, title, description, language, canonical, the heading outline, `linksIn`/`linksOut` counts, and whether it is indexable. A page nothing is wrong with is the useful half of the answer to "did my metadata land".
4. **The build's diagnostics** — §14's problems and advisories for the current build, verbatim. A rebuild that failed leaves the previous `dist/` in place (§15), so without this the report would describe a site the browser is no longer being served.

There is no score, no grade, no percentage, and no character count, for §24.5's reason: that rule is about the *output*, and a page is output.

### 27.4 It follows the rebuild

The report is regenerated by the same rebuild that regenerates the site, and the reload stream that refreshes a page refreshes it too. A report open in a browser while a file is saved shows the new build, or shows why there is no new build.

A request that arrives before any build has completed is answered — with the report of the last build that did, or with a page saying no build has completed yet. The server never blocks on a rebuild and never serves a report assembled from a half-finished one.

### 27.5 What it is not

- **Not a second audit.** No finding exists that only this view can raise, and no finding it shows is absent from `unify audit`. If the two ever disagree, this section is the defect.
- **Not configurable.** No flag turns it on or off, no flag moves it, and `--port` is the only thing about the server anyone chooses (§16).
- **Not an API.** The report is HTML for a person. Machine-readable findings are `unify audit --format json` (§6.5.3), which is a different artifact with a `schemaVersion` and stable identifiers; this page promises neither.
- **Not served by anything else.** `unify watch` has no server. `unify build` writes files. Only `unify dev` answers `/_unify/`.

---

## 28. Counter-prior frontmatter

Product-spec §6.3.9, and its own sentence states the purpose exactly: these diagnostics "exist to prevent confident cross-generator assumptions from publishing or addressing the wrong page, not to reserve ordinary metadata names without cause."

Every key here is one that another static-site generator honours. A page carrying it was written by someone — or by a model — who believed unify would honour it too, and §10.2's rule turns it into a `<meta>` that looks like it worked. That is the exact shape §14 exists to forbid, arriving through the door of a key unify never claimed.

### 28.1 The three that are problems

In a Markdown page's frontmatter, `draft`, `permalink`, and `slug` are **P24**, located at the key. Each message names the unify mechanism that does the thing the author was reaching for:

```
src/post.md:3: problem: draft has no meaning in unify — the page publishes
  fix: rename the source to _post.md; a leading underscore keeps a file out of the output
```
```
src/post.md:4: problem: permalink has no meaning in unify — this page's address is its source path
  fix: rename or move the source file to choose its address, or use --pretty-urls site-wide
```
```
src/post.md:5: problem: slug has no meaning in unify — this page's address is its source path
  fix: rename the source file to change the last segment of its address
```

They are **problems rather than advisories** because each one, believed, publishes or addresses the wrong page — the two outcomes §15's transactional gate exists to prevent. `draft: true` is the sharpest: the author's intent is that this page *not* be published, and unify publishes it. That is the content-loss law's mirror image, and worse in one respect, since a dropped page is visible in the output listing and an unintended one is not.

**The key is the problem, whatever its value.** `draft: false` produces no wrong outcome today, and reporting it still earns its place: the belief it expresses is that unify has a draft mechanism, and a diagnostic that waits for the value to become dangerous is a diagnostic that fires after the mistake has shipped. One rule, one message, no value parsing.

**Which key a spelling names is §10.2's question, not this section's.** A key's name decides what it means and the YAML shape used to spell it does not, so a *mapping* under `draft:` names `draft:<child>` and is not this key — exactly as `og:` over an indented `draft:` names `og:draft` and is not this key either. The two directions are one rule read from its two ends, and the rule is §10.2's stated equivalence: `draft:nested: yes` flat and `draft:` over an indented `nested: yes` are "identical in every respect", so a P24 that fired on one spelling and not the other would break the equivalence §10.2 asserts. That is not a value exemption to the paragraph above: a scalar, an empty value, and a list each still name the bare key and each still emits `<meta name="draft">`, so all three are P24, and only the one shape that *renames* the key is not.

**Scope is frontmatter, and only frontmatter.** The prior is a *frontmatter* prior: no generator reads `<meta name="draft">`, and an HTML author who writes one is writing an ordinary meta about their own content. This is the deliberate opposite of §26.4's P23, which checks the emitted `<meta name="schema">` so that HTML and Markdown declare a type the same way. The difference is the subject: `schema` is unify's own key and must mean one thing in both spellings; `draft` is another tool's key, and only one of the two spellings carries the mistaken belief.

A `.md` file included as a fragment has its frontmatter stripped and never validated (§5.1 step 4), here as everywhere: the data is provably unused, and a shared fragment must not make an unrelated page's build depend on metadata nobody reads.

### 28.2 `tags` and `categories`: ordinary metadata, not a reservation

`tags` and `categories` are not addressed to the build at all — they describe content, and a site may legitimately emit them for a consumer unify knows nothing about. **0.9 reports nothing about them, by design.** The 0.8 model gave them a closed-set field of their own (`taxonomyKeys`) purely so an `audit` finding (`taxonomy-inert`) could tell an author that a `tags:` key builds no index, archive, feed, or route. That finding, its stored field, and the extraction path that fed it are gone in 0.9, and the removal is a considered decision rather than an oversight: product-spec §6.3.9 already states that these diagnostics exist "to prevent confident cross-generator assumptions from publishing or addressing the wrong page, not to reserve ordinary metadata names without cause," and `tags`/`categories` never carried the cross-generator failure mode §28.1's three keys do. Nothing in unify's own vocabulary claims `tags`, no fix line ever told an author to rename or move anything, and the finding's entire content was "this key does less than some other tool's key of the same name might" — the unbounded-reservation posture product-spec §6.3.9 itself refuses, applied by the finding to the one pair of keys where it had nothing else to say.

So `tags:` and `categories:` synthesize to `<meta name="tags" content="…">`/`<meta name="categories" content="…">` exactly as any other scalar or list frontmatter key does (§10.2), an HTML author may write the identical metas by hand, and **`unify audit` says nothing about either, in the head or the body.** Not `metadata-in-body` either: that closed set exists for elements whose misplacement *changes an outcome* — `schema` switches §26.6's generator off in silence, `description` and the rest are declarations a consumer reads only in the head — and a body-placed `tags` changes nothing anywhere, so there is no outcome to protect and no second position for a belief to fail in. `date`/`lastmod` are §28.3's counterexample that keeps this section honest by being read; `tags`/`categories` are the counterexample that keeps it honest by staying inert on purpose, in both positions, with no diagnostic marking either one.

This subsection's own inventory row (**CPR-02**) pins the absence rather than a rule: a page declaring `tags:`/`categories:`, or writing the equivalent `<meta>` by hand, builds and audits identically to one that declares neither.

**Product-spec §6.3.9 and §4 state the same 0.9 reading.** §6.3.9's own closing sentence, quoted above, is what licenses the removal — it is not a second normative source this section must satisfy, and product-spec's frontmatter paragraph (§4) and its counter-prior-diagnostics list (§6.3.9) both now say the same thing this section does: ordinary metadata, reported by nothing.

### 28.3 What stays exactly as it was

Product-spec §6.3.9 closes by requiring four existing diagnostics to remain mandatory, and none of them changes here: a bare layout name is **P04** (§6.1); a path-only `--base-url` is a usage error (§11.3); a hand-written pretty URL is **P13** (§12), and `--pretty-urls` does not switch that check off — a link to `/guides/` that names no emitted page is P13 in both modes; and a non-empty `<include>` still blocks the build — as **P25**/**P26** since §32 gave it a meaning, rather than P03. What §6.3.9 requires is that it not become a silent no-op, and it has not: §32.2 refuses every target that cannot take content, and names both the include and the fragment.

That third clause is stated as *the check is not switched off* rather than by the obvious example, because the obvious example is not true of the flag, and the correction is the more useful half. A link to `/about/` on a site whose source holds `about.html` is P13 without `--pretty-urls` and **resolves** with it: §11.2 emits `about/index.html` under the flag and rewrites the author's own `/about.html` links to that same address, so "a site that emits `about.html`" is exactly the antecedent the flag removes. What holds in both modes is §11.2's own rule and the reason §12 checks the output tree: link the real file and let the flag do the rewriting, because a directory URL naming no emitted page is P13 either way, and the one that *does* name a page under the flag is the one the flag would have written for you.

And `date` and `lastmod` stay ordinary metadata keys with no diagnostic of their own. They are the counterexample that keeps this section honest: they *are* read — §20.3 maps them onto `datePublished`/`dateModified` and §26.6 emits them — so they belong to a mechanism unify has rather than one it lacks. A malformed one is `date-unusable` (§26.3), which is a statement about the value, not about the key.

---

## 29. Feed generation

Product-spec §6.5.1. The manifest's third projection, and the first whose membership an author states in the page rather than in a flag.

### 29.1 Activation, and why there is no collection

A feed is written when **`--base-url` is set** and **at least one page is an entry** by §29.4. Those two conditions are the whole opt-in.

The second is deliberately membership rather than declaration, and the difference is not pedantry. An earlier draft activated on any page whose declared type was `Article` or `BlogPosting`, which made a feed with **zero entries** reachable — a lone candidate excluded by §29.3's date rule is exactly that shape, and it is A17's own worked example. Such a document cannot be valid: [RFC 4287](https://www.rfc-editor.org/rfc/rfc4287) §4.1.1 requires `atom:updated` on every feed, §29.5 defines it as the newest entry's, and there is no newest entry. The only two ways out were to emit an invalid feed or to invent an instant, and §6.1 forbids the second. Writing no file is the third, and it is the honest one: a site whose only article is dated wrong gets A17 telling it so, and no feed until a real entry exists. `--base-url` for §21.1's reason — an entry carries absolute URLs and a stable id, and inventing an origin is the guess product-spec §6.1 forbids — and the type declaration because that is what product-spec §6.5.1 means by *explicitly declaring*: the page says what it is, and the feed is a consequence.

That is deliberately **not a collection**. There is no query, no directory convention, no `posts/` folder, no ordering key, and no way to ask for a feed of some pages and not others. §6.6 rejects a collections DSL by name, and this section is what the rejection costs and what it buys: it costs scoped feeds, and it buys a membership rule an author can check by reading one page. Scoped feeds wait for demonstrated demand (§6.5.1); until then, a site that needs two feeds writes the second one with a generator (§19.6) and unify ships it byte-for-byte.

### 29.2 Atom, and why not RSS

The document is **[Atom](https://www.rfc-editor.org/rfc/rfc4287)**, at output-root `feed.xml`. The choice is forced by §20.10 rather than preferred: RSS 2.0's `pubDate` is an [RFC 822](https://www.rfc-editor.org/rfc/rfc822) date, so emitting one would mean *reformatting* the author's timestamp into another calendar vocabulary — the edit §20.10 refuses in the sentence that declines to rewrite `+00:00` to `Z`. Atom's date construct is [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339), and W3C-DTF is a profile of RFC 3339, so an `iso` value §20.10 accepted with a time is already a conforming Atom date and is emitted verbatim.

### 29.3 An entry needs an instant, and a date is not one

RFC 4287 §4.1.2 makes `atom:updated` **required** on every entry, and §3.3 makes it a full date-time with a time-zone offset. A `date: 2026-01-02` names a day, not an instant, and there is no honest way to turn one into the other:

- Emitting `2026-01-02T00:00:00Z` invents midnight UTC, which a reader west of Greenwich renders as **1 January** — a feed telling the world the wrong publication date, from a value the author wrote correctly.
- Using the build clock, the filesystem, or Git is the invention product-spec §6.1 forbids by name and §20.10 forbids again.

So a page whose `datePublished` has no time is **not an entry**, and the build says so — advisory **A17**, naming the page, the value it wrote, and the spelling that would work:

```
src/posts/hello.md: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
  fix: write date: 2026-01-02T09:00:00Z — a feed entry's timestamp needs a time and a time zone
```

An advisory rather than a finding because it reports **what this build did** (§14.3): a page the author declared an `Article` is absent from the feed this build wrote, which is a fact about the emitted tree and belongs beside the other things `build` says. It never blocks a publish. It is the eleventh of twelve.

A page with **no `datePublished` at all** draws nothing here — `schema-incomplete` (§24.4) already reports an `Article` with no date, and one question keeps one owner.

### 29.4 Membership

A page is an entry when all of:

1. It has a document and `declaredTypes(doc)` (§20.8) **includes** `Article` or `BlogPosting` — any declared type qualifies, not only the first.
2. It is `indexable` (§20.6). A page telling crawlers to drop it does not belong in a syndication feed either.
3. It is **self-canonical**, by §21.2's own `classifyCanonical` — the shared reader, so "which page does this URL name" keeps one answer.
4. `publicationDatesOf(doc).published` has a non-null `iso` **carrying a time** (§29.3).

**Condition 1 is a 0.9 widening.** The retired `schemaType` field was a single scalar — the first accepted declaration a page made, meta-before-JSON-LD (§20.8's ordering) — so a page whose JSON-LD declared `WebPage` first and `Article` second was never a candidate; the second, correct declaration was simply invisible to membership. `declaredTypes(doc)` returns every accepted declaration, and condition 1 tests inclusion over the whole list: a page carrying an `Organization` block alongside separate `Article` JSON-LD, or one whose blocks declare `WebPage` before `Article`, is a candidate under 0.9. The reasoning is stated once, at the selector that makes it possible (§20.8), and repeated here because this is the consumer it changes the observable behavior of — carrying `Organization` and `Article` JSON-LD together is routine (a page is both a piece of content and part of a publisher's organization graph), and the 0.8 reading silently dropped such a page from its own feed whenever the `Organization` block happened to come first.

Entries are ordered by `datePublished` **descending**, ties broken by output path ascending, so two builds of one tree produce byte-identical bytes. That is the one ordering this document invents, and it is the one every feed reader assumes; the tie-break exists so the assumption never costs determinism.

### 29.5 The document

| element | value |
|---|---|
| `<feed xmlns>` | `http://www.w3.org/2005/Atom` |
| `<id>` (feed) | the site's own address — `--base-url`, exactly as given |
| `<title>` (feed) | the `<title>` of the page at the site root (`index.html`), else the site's host |
| `<updated>` (feed) | the newest entry's `<updated>` — which always exists, because §29.1 writes no feed without one |
| `<link rel="self">` | the feed's own absolute URL |
| `<link rel="alternate">` | the site's own address |
| `<entry><id>` | the entry's **canonical** URL — `canonicalOf(doc)` if the page declares one, else `document.url` |
| `<entry><title>` | `titleOf(doc)` |
| `<entry><link rel="alternate">` | the same URL as `<id>` |
| `<entry><updated>` | `modified.iso` when it carries a time, else `published.iso` (`publicationDatesOf(doc)`) |
| `<entry><published>` | `published.iso` |
| `<entry><summary type="text">` | `descriptionOf(doc)`, omitted when null |
| `<entry><author><name>` | `authorOf(doc)`, omitted when null |
| `<entry><content type="html">` | only under `--feed-full` (§29.6) |

`<id>` is the canonical because an id must be **stable** (RFC 4287 §4.2.6) and a canonical is the author's own statement of this page's permanent address; deriving one from a path would change the moment a file moved, which is precisely what a canonical exists to prevent. Every URL is percent-encoded by §20.5 and then XML-escaped, both, for §21.3's reason.

`<updated>` prefers `dateModified` because Atom defines it as the last significant modification; a page that has never been modified reports its publication instant, which is the truthful reading of "last modified" for such a page.

### 29.6 `--feed-full`

`--feed-full` puts each entry's rendered body into `<content type="html">`. Product-spec §6.5.1 requires full-content inclusion to be **an explicit option** and this is it; without the flag every entry carries `<summary>` and no content.

The content is the emitted `<main>`'s inner HTML — the same subtree §20.7 reads `text` from, taken as markup rather than as text — with **every `href` and `src` resolved to an absolute URL against the entry's own address**.

That resolution is not decoration, and the sentence it replaces was wrong. This section used to say URLs could be left exactly as emitted, on the premise that `--base-url` had already made them absolute. It has not: §11.3 prepends the base's **path prefix** to a root-relative `href`/`src` and sends the **origin** only to `og:`/`twitter:` and `canonical`, while §11.1 leaves a page's own *relative* URL untouched when the page did not move. A feed reader resolves what it is given against **the feed's** address, not the page's, so an entry for `blog/post.html` carrying `href="sibling.html"` sent readers to `/sibling.html` — a file one directory up from the real one — and an entry under a subpath deploy carried `/repo/pic.png` rather than `https://example.com/repo/pic.png`. Both are links a reader cannot follow, on the ordinary shape of a blog.

The entry already knows its own absolute address: §29.5 puts it in `<id>`. Resolving against it is §11's rule applied once more with that address as the base, which is why no new interpretation of a URL enters the product here.

The flag is a usage error without `--base-url`, for the same reason `--canonical auto` is (§22.1): it describes something the build will not do.

### 29.7 References, collisions, and the report

Every URL the feed emits is checked exactly as §21.6 checks a sitemap's: a `<link href>` or `<id>` naming a location inside this site must resolve to a file the site emits, or it is **P13** located at the feed. For a generated feed this can only pass, and the reason is §29.4's third condition rather than an appeal to provenance: an entry's `<id>` is its canonical, and `classifyCanonical` answers `self` — the membership test — only for a canonical that **resolves to this page's own output path**. A canonical naming nothing this site emits classifies as `unknown` or `elsewhere`, so that page is not an entry and its unresolvable value never reaches the feed to be reported a second time. It is already **P13** at the page (§22.5), which is where the author can fix it, and one fault stays one diagnostic. The check runs anyway for §21.6's reason.

Under `--feed-full`, the entry bodies carry the page's own references, and those are §12's already: the same bytes were checked in the page. Nothing is checked twice and nothing is checked in a second way.

An authored `feed.xml` **suppresses generation entirely** (§21.5's rule, unchanged): the author's file is the site's feed, ships byte-for-byte, and has its internal URLs checked exactly as a generated one does.

**Activation governs this entire section, that verification included** — §21.1's rule, and stated here because a reader cannot otherwise tell design from oversight. Without `--base-url` a site's `feed.xml` is an ordinary asset: it mirror-copies byte-for-byte (§4.4) and unify says nothing about its contents, so a broken root-relative reference inside an authored one publishes clean. That is what "the golden path, unchanged" costs to mean: a site that shipped a hand-written feed built clean before this section existed and must keep building clean after it, because nothing the author did changed and no flag opted them in.

**A17 is suppressed with generation, and for a sharper reason.** The advisory's own sentence is *this page is not in `feed.xml`* — a claim about a file unify wrote. Where the author supplies the feed, unify has no idea whether the page is in it; their generator put there whatever it put there. Raising A17 then would be asserting something unify cannot know, which is the invented claim §6.1 forbids, in the one register that looks harmless. That is not a corner case — the `blog` template's generator writes its own `feed.xml` (§19.6), so the scaffold that teaches feeds is also the fixture that proves the suppression.

`--dry-run` lists the generated file like any other write, and §15 publishes it only when the whole build has zero problems.

---

## 30. The catalog and the search corpus

Product-spec §6.5.2 names both artifacts; this section is the normative reference for their shapes. Two independent JSON artifacts under `assets/unify/`: a compact, HTML-shaped structural projection of every public page (`catalog.json`) for browse/filter/TOC/metadata-driven UI, and a minimal full-text projection (`search-corpus.json`) that a client-side search implementation indexes however it chooses. Both are projections of §20's `BuildDocument` and nothing here reads a page — the rule §20 states once, applied twice.

### 30.1 Activation, output paths, and independence

`--catalog` writes `assets/unify/catalog.json`; `--search-corpus` writes `assets/unify/search-corpus.json`. Each is a flag rather than a consequence, for the same reason the retired `--search-index` was one: nothing about a page declares "catalog me" or "index me", and inventing such a declaration would be the unify-only content schema product-spec §6.3.7 forbids templates from teaching. **Neither flag implies the other** — a consumer that wants only full-text search data is never forced to also ship the catalog, and a browse/filter UI that never searches body text never pays for the corpus it does not read. A site wanting a full client-side search UI passes both.

Both paths sit under `assets/unify/` rather than the output root, a location decision stated once for both files: this directory groups unify-generated, machine-consumed runtime assets away from navigable site pages, keeps the output root free of files a browsing reader would stumble into, and needs no dot-directory or `/.well-known/` behavior a host might not serve. **Only the two exact paths above are reserved — `assets/unify/` itself is not**, and a source tree is free to keep its own files anywhere else under that name.

Neither flag is gated on `--base-url`. `document.path`/`document.url` already answer correctly with no base URL — root-relative and `null` respectively (§20.5) — so requiring `--base-url` would make either flag useless for the local-preview case it is most used in.

### 30.2 The catalog schema

```json
{
  "schemaVersion": 1,
  "baseUrl": "https://example.com/",
  "pages": [
    {
      "path": "/posts/unify-and-htmx/",
      "url": "https://example.com/posts/unify-and-htmx/",
      "html": { "attributes": { "lang": "en" } },
      "head": {
        "title": "Unify and HTMX",
        "meta": [
          { "name": "description", "content": "A practical static-site architecture." },
          { "name": "tags", "content": "unify" },
          { "name": "tags", "content": "htmx" },
          { "property": "article:published_time", "content": "2026-08-25T09:00:00-05:00" }
        ],
        "link": [{ "rel": "canonical", "href": "https://example.com/posts/unify-and-htmx/" }],
        "base": []
      },
      "body": {
        "attributes": { "class": "post" },
        "headings": [{ "level": 1, "id": "unify-and-htmx", "text": "Unify and HTMX" }]
      }
    }
  ]
}
```

Top-level keys are `schemaVersion`, `baseUrl`, `pages`, in that order. `baseUrl` is `${base.origin}${base.pathPrefix}` — `null` without the flag — the identical construction `unify audit --format json`'s own `baseUrl` field uses (§31.1, `buildReport`). This is deliberate, not an oversight: every `url` in this same document is built from that same normalized value (§20.5), so a consumer resolving `new URL(page.path, catalog.baseUrl)` recovers the site's real address, path prefix included, and the two machine surfaces answer "what address is this site built for" identically for one build. `pages` is filtered to §30.4's shared membership and left in manifest order (§20.1); nothing here sorts.

A page's keys, in order, are `path`, `url`, `html`, `head`, `body` — and this is not a shape invented for the catalog. It is `document` itself, the `DocumentSnapshot` §20.3 already defines and §31.1 already serializes whole inside `unify audit --format json`'s own `document` field: `catalogEntry` spreads `doc.document` into a fresh object rather than hand-copying named fields, so nothing is extracted, filtered, or promoted — a field `document.js` adds to the snapshot later reaches both surfaces without either one being edited. That is deliberate — an audit page's `document` and one catalog entry cannot drift into two readings of one page, because the entry is a shallow copy of the very same object, produced by the same single extraction pass (§20.2).

The bound this buys is stated once, entirely in §20.3's own terms:

- `html.attributes` — the emitted `<html>`'s attributes, arbitrary `data-*` included.
- `head.title`, `head.meta`, `head.link`, `head.base` — bounded head data only. No `<style>` contents, no script bodies, no raw head HTML. Arbitrary metadata vocabulary, repeated values, declaration order, and the `name`/`property` distinction all survive untouched (release-brief §12, replacing the retired taxonomy concepts): a page with `tags:` written twice in frontmatter keeps two `meta` entries here, in the order the author wrote them.
- `body.attributes`, `body.headings` — body attributes, and the flat, main-scoped heading sequence §20.3 already defines. No hierarchy is constructed; a consumer building a nested table of contents does so from `level` itself.

**No body text, ever, in this file.** `analysis.visibleText` lives on `DocumentAnalysis`, the private half of extraction, and `catalogEntry` never reads it — that is `search-corpus.json`'s field, not this one's, so a long article's body grows the corpus and leaves the catalog entry's size unchanged beyond its own head data and headings. **No JSON-LD script bodies either.** `analysis.jsonLd` stays private for the same reason: a structured-data block can itself carry an entire article body or a product dataset, and copying it into a file meant to stay one bounded record per page would defeat the reason the catalog exists. `declaredTypes(doc)` (§20.8) remains the selector a consumer of `analysis` builds a structured-data reading from; the catalog does not attempt to save that consumer the trouble.

`schemaVersion` is `1` — a consumer's refusal signal rather than a build number, independent of the corpus's own (§30.3, versioning rule stated once at §30.7). Within version 1, only additive optional fields may be added; a change to an existing field's meaning is what earns a `2`.

### 30.3 The search corpus schema

```json
{
  "schemaVersion": 1,
  "pages": [
    { "path": "/posts/unify-and-htmx/", "text": "Unify and HTMX A practical static-site architecture…" }
  ]
}
```

Top-level keys are `schemaVersion`, `pages`. A page's keys are `path`, `text`, and **nothing else** — no `url`, no `title`, no `description`, no `headings`, no metadata, no canonical. Every one of those already lives in `catalog.json`, and duplicating any here would give a consumer two answers to the same question about one page. `path` is the join key, and it is the join key deliberately — the one field the two files share verbatim: a consumer builds `new Map(catalog.pages.map(p => [p.path, p]))` once and looks a search hit's `path` up in it to recover everything else about that page.

`text` is `analysis.visibleText` (§20.7), folded by §30.5 below. `pages` is filtered to the identical §30.4 membership predicate `catalog.json` uses and left in manifest order — a client zipping the two files by `path` never has to reconcile two membership answers, because there is only one.

`schemaVersion` is `1`, independent of the catalog's own (release-brief §27): a change to one file's meaning never forces the other to bump.

### 30.4 Shared membership

Both files use the identical **`isPublicDestination(doc, base)`** selector §21.2 defines and owns: the document exists, is indexable (`robotsPolicyOf(doc).indexable`), its output path is not `404.html`, and it is self-canonical. A page the author marked `noindex`, or consolidated onto another page by its own canonical, is absent from both files for the reason §21.2 already states for the sitemap — a `noindex` page returning through a site-search box is the same contradiction as one returning through a crawler's index.

Reusing the sitemap's own predicate, rather than a second reading of "which pages does this site publish", is why the catalog and the corpus cannot describe two different page sets from one build: `sitemap.js`, `catalog.js`, and `search-corpus.js` all call the one function, and none of them reimplements it.

### 30.5 Text folding

`search-corpus.json`'s `text` is where §20.3's own deferred obligation is discharged for the *indexing* consumer it names: §20.3 keeps a decoded U+00A0 in `analysis.visibleText` because the author chose a character that forbids a line break, and states that *any projection of this field that is searched or compared must fold U+00A0 and the other Unicode space separators at index time, and say so where it is specified*. This is that place for the corpus — the catalog carries no free text, so it has no obligation to discharge. It is not the only consumer §20.3 names: §24.4's `text-duplicate` finding *compares* `analysis.visibleText` between pages rather than indexing it, and folds separately for that comparison (`audit.js`'s own `foldSpaces`, stated at its call site) — a second, independent discharge of the same obligation, for a different reader, that this section does not restate.

Every Unicode space separator — U+00A0, U+2000–U+200A, U+202F, U+205F, U+3000 — becomes U+0020, the runs folding can create collapse, and the result is trimmed. A reader typing `New York` with an ordinary space finds a page that wrote it with U+00A0, which they could not match against the unfolded field. (`text-duplicate`'s own fold is wider — collapsing every character JavaScript's `\s` treats as whitespace, not just this closed set — because its job is deciding whether two pages read as the same text, not indexing one for a search box; the two folds are not required to agree, and neither is a normative reading of the other.)

Nothing else is folded: no case folding, no stemming, no stop-word removal, no truncation, no character count. Those are a search engine's decisions, and unify ships no search runtime (product-spec §6.5.2).

### 30.6 Authored files, collisions, and publish

An authored file at exactly `assets/unify/catalog.json` or `assets/unify/search-corpus.json` **suppresses generation of that file entirely**, the same author-wins rule an authored `sitemap.xml`/`feed.xml` follow (§21.5): the author's file is the site's catalog or corpus, ships byte-for-byte, and unify neither overwrites it nor merges into it. Suppression is checked before either projection is computed, so an authored file costs nothing to detect. `--dry-run` shows it as an ordinary copy from source, with no generated row for the path it occupies.

**Neither file can raise P22.** P22 exists for a generated path a *split* can still produce after its own primary file is suppressed — `sitemap.xml`'s numbered parts are that case (§21.5). `catalog.json` and `search-corpus.json` each fix exactly one location, unconditionally, with no size cap and no split: by the time either generator runs, the suppression check above has already proven its one path absent from the tree's own emitted files, so there is no second path left for either to collide on. This corrects, rather than restates, the retired search manifest's own §30.4, which claimed a P22 that this path shape could never actually produce.

Unlike every earlier generated file, both paths sit under a directory rather than the output root — the one new failure shape this introduces is an authored file occupying `assets` or `assets/unify` itself (an ordinary asset with no extension, say), which the generated file needs as a directory. That is a located problem, named at the occupying source file and the generated path it blocks, checked before either generator runs — never a raw filesystem error surfacing during publish.

Once generated, both files join the temporary tree exactly like any other write, and need **no special-casing** to do so. They become checkable reference *targets* for free: §12's `emittedPaths` is built from every file the finished temp tree holds, generated and authored alike, so a page's own `<a href="/assets/unify/catalog.json">` resolves the same way a link to any other emitted file does. Neither file is itself scanned as a *source* of references — §12 scans `.html` and `.css` output, and JSON carries no `href`/`url()` syntax for it to find, so there is nothing inside either file for a reference checker to look for. And neither gets a dedicated internal-value check the way an authored `sitemap.xml`/`feed.xml` does (§21.6/§29.7): a *generated* file's `path`/`url` values are already correct by construction (§20.5), so such a check would find nothing, and an *authored* file is held to no such guarantee — unify makes no built-in use of a catalog or corpus's own contents the way §21.6 consumes a sitemap's `<loc>` to verify crawler-facing correctness, so there is no reader inside unify for a wrong value to mislead. Both files participate in §15's transactional publish and a watch rebuild's full-rebuild rule (§16) exactly as any other generated write does.

### 30.7 Determinism and versioning

Both files are two-space-indented JSON with a trailing newline. `pages` is manifest order (§20.1) in both — the build's own output-path order, not a sort either file introduces. Head arrays (`meta`, `link`, `base`) and heading arrays keep the document order §20.3 already fixed. No timestamp, build id, random value, or filesystem/Git-derived data ever reaches either file (product-spec §6.1). The result: the same final page bytes and the same build settings produce byte-identical `catalog.json` and `search-corpus.json` across repeated builds of one tree.

`schemaVersion: 1` is an independent contract per file (§30.2/§30.3), and the versioning rule itself is stated once here: within version 1, only additive optional fields may be added to either file; a change to an existing field's meaning, or its removal, requires that file's own version to increment. A version bump to one file never requires or implies one to the other, and neither is tied to unify's own package version.

---

## 31. Machine-readable and networked evaluation

Product-spec §6.5.3. Two flags on `unify audit`, and the rule that keeps them from becoming a plugin API: neither adds an analysis path. `--format json` re-serializes what §24 already found, and `--external` adds one class of check that cannot run offline.

### 31.1 `unify audit --format json`

`--format json` replaces §24.5's human report on stdout with one JSON document. `--format human` is the default and names the existing behaviour. Any other value is a usage error naming both.

```json
{
  "schemaVersion": 1,
  "baseUrl": "https://example.com/",
  "summary": { "broken": 1, "incomplete": 3, "problems": 0, "advisories": 2 },
  "pages": [
    {
      "source": "about.html",
      "generated": false,
      "outputPath": "about.html",
      "document": {
        "path": "/about.html",
        "url": "https://example.com/about.html",
        "html": { "attributes": { "lang": "en" } },
        "head": { "title": null, "meta": [], "link": [], "base": [] },
        "body": { "attributes": {}, "headings": [] }
      }
    }
  ],
  "findings": [
    {
      "id": "title-missing",
      "severity": "incomplete",
      "file": "src/about.html",
      "generated": false,
      "outputPath": "about.html",
      "url": "https://example.com/about.html",
      "evidence": "the emitted <head> declares no <title>",
      "fix": "add a <title> to the page, or to its layout for a site-wide suffix",
      "fingerprint": "b21c0f…"
    }
  ]
}
```

`pages` holds one entry per `BuildDocument` (§20) in manifest order, each reduced to this section's own **audit page shape** — `{source, generated, outputPath, document}` — rather than the whole envelope: `source` is `doc.source.path`, `generated` is `doc.source.generated`, `outputPath` is `doc.outputPath`, and `document` is the `DocumentSnapshot` (§20.3) **serialized whole**, in its own key order (`path`, `url`, `html`, `head`, `body`). `doc.source.layout` stays internal to audit's own fix lines and is **not** in this object — layout provenance is spent, not reported. The private `analysis` half (visible text, ids, JSON-LD, the link graph, `strayMetadata`, `refresh`) is **never serialized here**: §22 of the release brief states the rule outright — findings already carry the diagnostic facts external automation normally needs, so this is a build artifact's page shape, not a mirror of the internal envelope. `findings` is §24.5's order — source path, then finding id, then evidence — so the two formats list the same things in the same sequence. `baseUrl` is the address the build assumed, `null` without the flag.

**This is a declared, incompatible break with the 0.8 machine schema**, and `schemaVersion` stays `1` deliberately — 0.9 is a clean break rather than a migration, so there is no `2` to reach for and no compatibility shim translating one page shape into the other. A consumer built against the 0.8 `pages` shape (a flat object with `title`, `description`, `canonical`, `headings`, `text`, `linksOut`, `conflicts`, `taxonomyKeys`, and the rest as top-level page fields) must be rewritten against this one; nothing in this release reads the old shape or accepts it as an input.

`generated` is `true` when the page came from the `--generate` overlay rather than the source tree (§33.4). It travels as its own key on the finding, exactly as on the page object, because `file`/`source` must stay a plain path for the consumers that resolve it, while a consumer rendering its own report needs the same fact the human report shows: a generated page's `file` names no file the author can open, so a report that did not say so would send a reader looking through `src/` for something that was never there.

§14's problems and advisories still print to **stderr** as prose (§24.5), and `summary` counts them so a JSON consumer knows they happened. Putting them in the document would make this a second diagnostic channel, and §14.1's contract is that there is one.

Exit codes are §24.6's, unchanged. A format flag that changed an exit code would be a second policy.

### 31.2 The fingerprint

Each finding carries a **stable fingerprint**: a hex digest over the finding's `id`, its source `file`, and the one datum that distinguishes it from its siblings on the same page — the repeated id for `id-duplicate`, the field name for `metadata-conflict`, the unprefixed value for `jsonld-url-unprefixed`, the empty string where a finding can occur only once per page.

It deliberately excludes **line numbers, evidence text, and fix text**. A fingerprint exists so a CI system can say *this is the same finding I saw last week*, and a fault that survives an unrelated edit above it must keep its identity through the line shift. Evidence and fix are prose (§14.1) and may be reworded without the fault changing; hashing them would silently retire every suppression the day a message improved.

Two findings with one fingerprint are the same fault. The digest is over a canonical joining of those three fields with a separator that cannot occur in any of them, so no combination of values can collide by concatenation.

### 31.3 `unify audit --external`

`--external` fetches every off-origin URL the site emits and reports the ones that do not resolve. It is the **only** unify operation that touches the network, and it exists as a flag precisely so that "unify builds are offline and deterministic" stays true without qualification (§6.1).

**Scope is exactly §12's reference set, restricted to the values §12 skipped for being on another origin** — and that is one rule rather than a list, deliberately. §12 already answers "what is a reference in this document": `href` and `src`, `srcset` entries, `poster`, the `og:`/`twitter:` values, a `<meta http-equiv="refresh">` target, JSON-LD's URL-valued properties, and `url()` in a stylesheet, a `<style>` block, or a `style` attribute. `--external` asks the same question of the same reader and keeps the off-origin half.

An earlier draft of this section enumerated four of those and called the list closed. That was a second interpretation of "reference" living inside one product, which is the defect §12's own one-reader discipline exists to prevent — and it was the *worse* of the two, because an off-origin `poster` or a `url()` naming a stylesheet's missing background is exactly the kind of thing a link checker is for. The enumeration is gone; the reader is shared.

`Disallow:` patterns are still not fetched, and that needs no exception: §23.4 says they are patterns rather than URLs, so §12 never collected them and neither does this.

Only `http:` and `https:` are fetched. `fetch` speaks those two, and handed anything else it rejects **locally** — which was being reported as the far end failing to answer, accusing a third party of being unreachable over a scheme unify never dialled. An off-origin reference on another scheme is outside this flag's scope, which is a smaller and truer claim than a finding about it.

Evidence is unify's own sentence rather than the runtime's. A thrown fetch error carries an implementation string, and §24.5 makes evidence contract that a reader and a diff both depend on; quoting it verbatim put one runtime version's wording into every report and would have changed it under an upgrade that touched no unify code.

Requests are `HEAD`, falling back to `GET` on 405; each URL is fetched **once** per run however many pages reference it; redirects are followed to a cap of five; the timeout is ten seconds. Concurrency is bounded, and the order of the report is not the order of the responses — findings sort by §24.5's rule like every other, so two runs over one tree print the same bytes whatever the network did.

| id | severity | fires when |
|---|---|---|
| `external-unreachable` | incomplete | the request failed, timed out, or answered 4xx/5xx; one finding per distinct URL, located at the first page referencing it in manifest order |

`incomplete` rather than `broken`, and the reason is the whole shape of this flag: **the answer is about someone else's server at one moment**, not about this site's output. A link that 503s during a deploy is not wrong markup, and a `broken` verdict — the word §24.3 reserves for output that contradicts itself — would be unearned. It is also why this is not, and must never become, a build check: a transient failure on another host must never withhold a publish.

**Every failure is a finding, including all of them.** An earlier draft said a run that could not reach the network at all should report that once as a usage error rather than emitting a finding per URL. That rule is deleted, because it cannot be implemented honestly and because implementing it approximately was worse than not having it.

Nothing available to a build distinguishes "this machine has no network" from "the one host this site links to is down": the only test that could is a request to some third party unify chose, which is precisely the kind of call this product does not make. Approximating it as *every probe failed to connect* made the commonest shape wrong — a site with a single off-origin link, which is most sites. The identical dead link then reported as `external-unreachable` and exit 0 when some other URL on the page happened to answer, and as a usage error and exit 2 when it did not. One fault, two answers, decided by an unrelated page.

The table above already says what a failed request is, and it says it without reference to how many others failed. A machine with no network gets one finding per off-origin URL, which is true, ordered, and exits 0 — and §24.6's exit table is left alone, as §31.1 requires.

### 31.4 SARIF

Product-spec §6.5.3 permits a SARIF serializer **only if it is a mechanical view of the same findings rather than another analysis path**. `--format sarif` is exactly that: the same finding list §31.1 serializes, mapped field for field into SARIF 2.1.0 — `id` to `ruleId`, `file` to the artifact location, `evidence` to the message, `fingerprint` to `partialFingerprints`, and severity to `level` (`broken` to `error`, `incomplete` to `warning`, both of which are SARIF levels and neither of which changes an exit code).

Nothing is computed for SARIF that is not computed for `--format json`. If a future field ever needs a SARIF-only derivation, that is the signal this serializer has become an analysis path and must be removed rather than extended.

The `fix` string is carried in `properties`, **not** in SARIF's own `fixes` array, and the reason is this section's rule enforcing itself. SARIF 2.1.0 makes `artifactChanges` required on every fix object; unify's fix is a sentence rather than a patch, so it has nothing to put there, and a `fixes` array without it made every emitted document invalid against the schema — rejected by validators and by the code-scanning ingests this format exists for. `fix` is also not one of the five mappings above. Both facts point the same way: a field that needs a SARIF-only shape does not belong in the mapping, and `properties` is where the same string survives without the document claiming a structure it cannot honour.

---

## 32. Slotted includes

Product-spec §6.4.1, and its own framing is the constraint: recover the useful part of the previous implementation's customizable fragments **without** reviving area matching or a component DSL. The recovery adds no new vocabulary at all — an include's content fills a fragment's slots by exactly the rules §7 already gives a page filling a layout's.

### 32.1 The two kinds of include

§5's include is unchanged for the case it already served, and the two are told apart by one byte of the author's own markup:

- **An empty `<include src="…"></include>` is verbatim, textual, and pre-parse** — §5.1 in full, unaltered. Whitespace between the tags is still emptiness. This is the include every existing site uses and nothing about it moves.
- **A non-empty `<include>`** — one carrying any non-whitespace content — is a **composition**: the target is parsed, the include's children are parsed, and the two are merged by §7's slot rules. It was **P03** before this section existed; §5.1's sixth rule now defers to this section, and P03 keeps only its other half (an `<include>` without `src`).

That split is why the feature costs one sentence rather than a mode: an author who never writes content between the tags never meets it, and an author who does has already learned the rule from layouts.

### 32.2 The target must be a fragment that declares slots

A non-empty include is valid only when its target is a **`*.fragment.html`** (§4.4) **whose markup contains at least one `<slot>`**. Both halves are required and each has its own problem:

- **P25** — a non-empty include whose target is not a `.fragment.html`. A page or a layout is a complete document; splicing content into one has no meaning, and the two things it might have meant — into its `<main>`, or into its body — are what layouts are for.
- **P26** — a non-empty include whose target *is* a `.fragment.html` but declares no `<slot>`. The content has nowhere to go, and dropping it is the content-loss law's own case.

Both are located at the **include element**, in the file that wrote it, which is where the author can act (§14.1's provenance rule, unchanged). Both name the fragment as well as the include, because the fix is as likely to be in one file as the other.

### 32.3 The merge is §7's, with two subtractions

The include's children are merged into the parsed fragment exactly as a page's body is merged into a layout's (§7.1–§7.3):

- A child carrying `slot="name"` **replaces** `<slot name="name">`, tag and all; the consumed `slot` attribute is removed; an unfilled slot is replaced by its own children (fallback).
- Everything else replaces the bare `<slot>`.
- Slots do not nest (**P16**), slots inside `<template>` are never touched, and a repeated slot name draws **A13** — the same rules, from the same code, reported the same way.

Two things a layout does are **not** done here, and both follow from what a fragment is:

- **No head merge.** A `.fragment.html` is a bare snippet (§4.4); it contributes no `<title>`, no `<meta>`, no `<link>`.
- **No root attributes.** §9 ranges over `<html>` and `<body>`, and a fragment has neither.

A `<head>`, `<html>`, or `<body>` element inside a fragment reached by a non-empty include is **P27**, located at that element — the same shape as §10.5's "a literal `<head>` in a Markdown body", and for the same reason: it would land in the body and do nothing.

**A fill that addresses nothing is P28**, not an advisory. §7.3's A02 is an advisory precisely because a page's unmatched fill *stays in the page flow* — nothing is lost. A fragment has no flow: it replaces the include element entirely, so an unmatched fill is content the author wrote and the build dropped. That is the one case the content-loss law never permits, whatever the neighbouring rule does.

### 32.4 One fragment, both roles

A `.fragment.html` containing `<slot>` already has a meaning under §5, and it is not this one. An empty include is a verbatim splice, so the fragment's `<slot>` elements land in the host's text and are consumed by whatever composes *it* — in a layout, they become that layout's slots, filled by the page. `src/core/includes.js` says as much in its own opening comment, and it stays true.

So the same fragment answers to both: **an empty include passes its slots through, a non-empty include consumes them.** That is not an ambiguity; it is §32.1's split read from the fragment's side, and it is what lets one shared fragment be a layout's chrome in one file and a filled component in another without being written twice. What an author must not expect is for a fragment to do both *at once* — a non-empty include consumes every slot in its target, so none is left for the host, and an unfilled one shows its fallback (§32.3) rather than travelling outward.

### 32.5 Fill scope is lexical

Content written inside an `<include>` fills slots **in that include's own target and nowhere else**. If the fragment itself contains an `<include>`, that inner include resolves by its own rules against its own content — the outer include's children are not visible to it, and an unfilled slot in the inner fragment shows its own fallback rather than reaching outward.

The alternative — letting a fill travel down a chain until something matches — is action at a distance: adding a slot to a deeply nested fragment would silently change what an unrelated page renders. Lexical scope means the fill and the slot it fills are always in two files an author can open side by side.

Cycles remain **P02** exactly as in §5.1, counted the same way, printed with the same chain.

### 32.6 Order, and what this changes about §2

§2 step 2 loads and inlines includes before parsing, and that stays true of empty includes. A non-empty include is resolved in the same pass and at the same moment, but by parsing rather than splicing — so the *timing* is unchanged and only the *operation* differs. Everything downstream — layout resolution, composition, URL rewriting, the manifest — sees one text and cannot tell which kind of include produced it.

For a Markdown page, §10.1's ordering is unchanged: conversion first, then includes. A non-empty include written in Markdown must therefore be an HTML block, which §10.1's converter extension already makes it.

### 32.7 What this is not, and the condition on shipping it

No props. No attributes passed to a fragment. No expressions, loops, conditionals, or implicit data. No attribute merging on the include element or anywhere else. No style scoping. A fragment cannot read the page that included it, and a page cannot read the fragment. The complete authoring rule is: **an include may carry content when its target is a fragment with slots, and that content fills them the way a page fills a layout's.**

Product-spec §6.4.1 makes shipping conditional on that rule still fitting comfortably on the authoring-rules page. The mechanical half of the condition is enforced rather than asserted: `docs/authoring-rules.md` stays within its line budget and `tests/unit/docs-sync.test.js` fails if it does not. The empirical half is **met**: ratification round 26 briefed six isolated samples (five Haiku, one Sonnet control) to build a site carrying the same panel in ten places with different words in every one, and the border changeable in one file. All six reached for a slotted include unprompted, all six built clean under `--dry-run --strict`, no fallback and no `<slot>` reached any output, and the mechanism worked from Markdown pages as well as HTML. `docs/ratification.md` records the round, including the two documentation defects it found — neither of them in this rule.

---

## 33. `--generate <path>`

Product-spec §6.4.2. One author-owned JavaScript file runs before the scan, and everything it writes into one supplied directory joins the build as an overlay. It replaces nothing in the pipeline and adds no API to learn.

### 33.1 What it is, and what it deliberately is not

`--generate _scripts/gen.mjs` names **a file in the source tree**, not a command. It is not `--run "<shell>"`, and the difference is the whole posture of the flag: a path is a thing the author wrote and can read, a shell string is a place arbitrary programs get spelled. There is no shell, no argument list, no environment plumbing, and no way to express "and then run this other thing".

The path is resolved against the source root and must stay inside it (§4.3's containment rule, the same one includes and layouts obey); a path escaping the source root is a usage error. It is saved in `unify.yaml` like any other long option (§18), and it applies to `build`, `watch`, `dev`, and `audit` — the four commands that scan the source tree.

### 33.2 The contract, entire

```
process.argv[2] = the absolute path of the source root
process.argv[3] = the absolute path of the generated directory
process.argv[4] = the absolute path of generator-context.json
```

`argv[4]` is additive. It was not part of the original two-argument contract, and it does not change what `argv[2]`/`argv[3]` are or where they sit: a generator written against the two-argument contract — one that reads only those two positions and never looks past them — keeps working exactly as it did before this argument existed. Nothing about the seam becomes mandatory ceremony by its addition.

Otherwise the interface is unchanged. There is no unify module to import, no object passed in, no return value read, and no callback. The generator writes files into `process.argv[3]`, may read `process.argv[4]`, and returns; anything it writes anywhere else is its own business and unify neither collects nor notices it (§33.6).

The working directory is the **source root**, so `./_data/authors.json` in a generator means what an author reading the source tree would expect.

**The runtime is unify's own.** A compiled single-file executable carries it, which is the point product-spec §6.4.2 makes about removing the second runtime: an author with `unify` on their PATH and no Node installation can run a generator.

**The generator runs as a subprocess of that executable**, not inside the build's own process. Its stdout is passed through, so a generator that logs its progress still does; its exit status is the whole of what unify reads back. Three consequences follow, normative rather than incidental:

- **A generator that calls `process.exit()` ends its own process**, and a non-zero status is P29. unify does not sandbox arbitrary JavaScript and does not claim to (§6.7); what it does guarantee is that the build does not carry on as though nothing happened.
- **A generator that throws is P29**, located at the generator's path, carrying the generator's own message — the runtime's presentation of a thrown error surrounds that message with a code frame, a caret and stack frames, and the message is what must reach the author, not the tail of the trace. Under `DEBUG=1` the whole of stderr is passed through as well. The build stops before scanning, because a partial overlay is a site nobody described.
- **Every rebuild re-runs it.** Watch mode is full rebuilds only (§16), and a module cache that returned the first build's copy would make every rebuild after the first silently skip the generator — the site would go stale while the build reported success. A new process has no module cache to consult, so the requirement holds structurally. It cannot be met by loading the generator in-process behind a cache-busting query string: a runtime is free to ignore the query when caching a file URL, and Bun does, which makes that spelling a no-op that reports success.

The subprocess is therefore part of the contract and not an implementation detail. An implementation that loads the generator in-process satisfies none of the three: it hands `process.exit()` the build's own exit code, it has no separate stderr to locate P29 from, and it must invent a cache defeat that the runtime is entitled to ignore.

**`generator-context.json`, the file `process.argv[4]` names, is a versioned, read-only snapshot of the handful of build facts unify is willing to publish as a stable machine contract.** unify writes it once per generator run — before invoking the generator, alongside (never inside) the generated directory `argv[3]` names — and it is exactly this shape, key order included, serialized the same way `catalog.json`/`search-corpus.json` are (§30.7): two-space-indented JSON with a trailing newline:

```json
{
  "schemaVersion": 1,
  "unifyVersion": "0.9.0",
  "command": "build",
  "paths": {
    "sourceRoot": "/project/src",
    "generatedRoot": "/tmp/unify-generated-abc123/overlay",
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

| Field | Type | Content |
|---|---|---|
| `schemaVersion` | number | `1`. See the versioning rule below |
| `unifyVersion` | string | the running unify's own version (`package.json`'s `version`, the same source `--version` reads) — accurate under `bun`, `node`, and the compiled binary alike |
| `command` | `"build"` \| `"dev"` \| `"watch"` \| `"audit"` | the subcommand actually running this build or rebuild — `audit` runs generators too (§24.2) |
| `paths.sourceRoot` | string | absolute path, identical to `argv[2]` |
| `paths.generatedRoot` | string | absolute path, identical to `argv[3]` |
| `paths.outputRoot` | string | absolute path of this build's output directory |
| `site.baseUrl` | string \| null | `--base-url`'s effective value, `${base.origin}${base.pathPrefix}` (§11.3) — the identical construction `catalog.json` (§30) and `audit --format json` (§31.1) already use — or `null` when the flag was not given. Never the raw flag string |
| `site.prettyUrls` | boolean | whether `--pretty-urls` (§11.2) is in effect |
| `site.canonical` | `"auto"` \| null | `--canonical auto`'s value, or `null` |
| `outputs.catalog` | string \| null | `assets/unify/catalog.json`, output-root-relative, when `--catalog` is set; `null` otherwise |
| `outputs.searchCorpus` | string \| null | `assets/unify/search-corpus.json`, output-root-relative, when `--search-corpus` is set; `null` otherwise |

**Versioning.** The context carries its own `schemaVersion`, independent of `unifyVersion`, starting at `1`, and the rule is the same one §30.7 states for `catalog.json`/`search-corpus.json`: within version 1, only additive optional fields may be added; a change to an existing field's meaning or shape — including widening `command`'s closed set with a new value, or changing `site.baseUrl` from a string to an object — requires `schemaVersion` to increment. A generator reading `schemaVersion 1` today keeps reading a valid `schemaVersion 1` document as this contract grows only by new fields, the same guarantee `argv[2]`/`argv[3]` already make for a generator that predates `argv[4]` entirely.

**Lifecycle.** The context file is temporary build state, not a build artifact: it lives in the same per-build temporary location as the generated directory, is a read-only input as far as the generator is concerned (unify never reads it back), and is deleted with the rest of the build's generator state — on a successful run, on a P29 failure, and on every path in between — never surviving to be published, never appearing in `dist/` or in a `--dry-run` row (it is written *beside* the generated directory, never inside it — §33.3's scan, and therefore its origin marking, only ever sees what `argv[3]` names; a non-page file written *inside* the overlay, by contrast, would mirror-copy into `dist/` and get a `← generated` row like any other generated asset). §16's full-rebuilds-only rule gives a fresh context, matching a fresh overlay, on every rebuild for free — the same file at the same relative position, its `paths.generatedRoot` and effective `site`/`outputs` values current as of that rebuild's own settings, never a stale copy from an earlier one.

**The boundary is the same one §33.6 restates for the seam as a whole, sharpened for this one file: stable machine-contract fields only.** The table above is the complete set unify is willing to promise; nothing else about a running build is exposed through it. No environment variables, no secrets, no reporter or parser object, no internal callback, no mutable build state, no intermediate page collection, and no internal option name that isn't one of these fields' own — the context is built from exactly the parameters above, never from a serialized `settings` object, so nothing about unify's own internals can leak through by accident as the CLI's option surface grows. Most pointedly, **no manifest field appears here, because at the point this file is written the manifest does not exist yet**: §33.5's ordering is unchanged by this file's addition — the generator, and therefore the context it reads, still runs before §2 step 1, the scan, so there is no composed page, no `BuildDocument`, no catalog or search-corpus *content* (only the two output-root-relative *paths* those artifacts will land at, which are computable from flags alone) for this file to describe.

### 33.3 The overlay

The generated directory is a **fresh, empty directory outside the source tree**, created per build and removed after it. Two properties follow, and both are why it is not simply a folder under `src/`:

- **`src/` is never mutated.** The supported workflow does not edit the author's tree, so `audit` stays read-only (§24.2) and a failed build leaves nothing behind to clean up.
- **The watcher cannot see it.** §16 coalesces saves into rebuilds; a generator writing into a watched directory would trigger the rebuild that runs the generator that writes into the watched directory. Putting the directory outside the source tree makes that loop structurally impossible rather than filtered — the distinction §5's own history recommends.

Files in the generated directory are scanned **exactly as source files are**: `.html`/`.md` are pages, everything else mirror-copies, a leading underscore excludes, `.fragment.html` opts out. `--dry-run` marks a generated row's origin (`← generated`), which is the one place the difference is visible — and it must be visible there, because a file in `dist/` with no source file behind it is otherwise unexplainable.

**The resolution namespace.** The two directories are **one path space**. Every scanned file, from either tree, is named by its path *relative to the root it was found under* — `docs/api.md`, whether an author wrote it in `src/docs/` or a generator wrote it into the overlay. That name is the file's **virtual path**, and it is the path every rule in §4 through §13 operates on: what `<include src="/…">` names, what §6.1 step 4's walk climbs, what §13 keys a collision on, and what §14.1 prints as a diagnostic's `file`. So "a generated page resolves layouts, includes and URLs by the same rules, and §4 through §13 do not know the difference" is a statement about *paths*, and this is what makes it true.

Resolution therefore happens in the virtual path space, and only afterwards asks which directory holds the file:

- **§6.1 step 4, the discovery walk**, climbs virtual directories from the page's own up to the root, taking the first `_layout.html` that *any* root holds at each level. A generated `docs/api.md` looks for `docs/_layout.html`, then `_layout.html`, and finds the source tree's, the overlay's, or neither — exactly as a hand-written `docs/api.md` in the same position would.
- **§5.1 steps 1–2 and §6.1 steps 2–3, the written paths**, resolve the same way: a `/`-rooted value names a virtual path from the namespace root; a relative one is measured from the declaring file's own **virtual** directory. `<include src="/_includes/nav.html">` in a hand-authored layout finds the fragment a generator wrote, and `<include src="./sibling.html">` in a generated page finds the file an author wrote. "Must lie inside the source root" (§5.1 step 2) is read as *inside the namespace*: a path climbing above the root is still the escape it always was, reported with the not-found shape.

**Precedence is the source tree.** Where one virtual path could be satisfied from both directories, the file in the **source tree** is the one resolved. For any path that *publishes* the question never arises — §33.4's P12 refuses the build before composition could depend on the answer. It arises only for paths that never publish, an underscore-excluded fragment or a `_layout.html`, and there the author's own file must win: a generator able to shadow a file the author wrote would be exactly the silent overwrite §13 exists to forbid. Nearest still beats precedence inside the walk, because the namespace merges **one directory at a time, not one tree at a time** — a `docs/_layout.html` a generator wrote is nearer to `docs/api.md` than the source root's `_layout.html`, and is the one that page gets.

Worked, with `--generate _scripts/gen.mjs` writing the three overlay files:

```
src/_layout.html            <include src="/_includes/nav.html">, <main>
src/_includes/head.html     hand-authored fragment
src/index.html
overlay/_includes/nav.html  written by the generator
overlay/docs/_layout.html   written by the generator
overlay/docs/api.md         written by the generator, declares no layout
```

| Resolution | Answer | Why |
|---|---|---|
| `docs/api.md`'s layout | `docs/_layout.html` (generated) | the walk's first level, `docs/`, and the overlay holds it |
| `index.html`'s layout | `_layout.html` (source) | the walk reaches the root; the overlay has none there |
| `/_includes/nav.html` from `src/_layout.html` | the generated fragment | one namespace: the source tree does not hold this path |
| `/_includes/head.html` from `docs/api.md` | the source fragment | same namespace, read the other way |
| `./api.md` from `overlay/docs/_layout.html` | `docs/api.md` | relative to the declaring file's *virtual* directory, `docs/` |

An implementation that joins the overlay to the scan but not to this namespace produces two failures that look unrelated and are one: a generated page discovers no layout and publishes **bare, with no diagnostic and exit 0** (the content-loss law's worst shape — §14 exists to forbid it), and a generated fragment is invisible to `<include>`, so a generator can produce every page of a section and then not the nav that links them.

### 33.4 Collisions between the two trees

A relative path present in **both** the source tree and the generated directory is **P12** (§13), naming both — the source file by its source path, the generated one as generated. Neither wins: last-write-wins is what §13 exists to forbid, and picking the source would make a generator's output vanish silently while picking the generated one would overwrite a file the author wrote.

An author who wants a generator to *replace* a page deletes the page. An author who wants a generator to *fill in* a page writes it as a fragment and includes it.

### 33.5 Ordering

The generator runs **before §2 step 1**, the scan. It therefore sees the source tree as it is on disk and nothing else: no manifest, no composed pages, no output. That is deliberate, and it is the boundary that keeps this a seam rather than a plugin API — a generator cannot observe unify's intermediate state, so no future change to that state can break one.

The consequence an author must know, and which the recipes state: a generator that wants to list pages reads the **source** files, exactly as it would if run by hand before `unify build`. That is what the `blog` template's `_scripts/gen.mjs` already does (§19.6), which is why that scaffold is this flag's fixture as well as its documentation.

### 33.6 The boundary, stated because it cannot be enforced

unify runs the file the author named. It does not sandbox it, does not restrict what it may read or write, and does not audit its output for anything the ordinary build would not audit. A generator that writes outside the supplied directory, deletes files, or reaches the network is doing something unify neither prevents nor endorses — product-spec §6.1 keeps *unify's own* build offline and deterministic, and §6.7 says plainly that unify documents this boundary rather than claiming to police it.

Two things unify does guarantee, and they are what make the seam safe to use rather than safe to trust. **Nothing the generator produces bypasses a check**: a generated page is checked, its references are checked, its output path collides like any other, and it publishes only inside §15's transaction. And **a generator's failure is a build failure**: P29 stops the build before the scan, so a site is never published from a half-written overlay.
