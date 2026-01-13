# Unify DOM Cascade - Draft Spec

**Status**: Draft
**vNext**: Item-level list/table diffs and form control merging.

---

## Goals & Principles

- **CSS-ish DX**: Think in _layers, scope, areas, specificity, source order_.
- **Conventions first**: Use semantic HTML + class names; avoid special syntax. Avoid the need for configuration files. Sane defaults are a must.
- **Minimal attributes**: Only for layout/component wiring.
- **Predictable**: Page content **replaces** host content; attributes merge only on the matched element.
- **Same behavior**: Design-time preview and build-time compile produce identical DOM.
- **Humans first**: The DX and UX should be a top priority.
- **Extensible**: It should be easy to build and distribute layouts and components. It should be easy to add 3rd layouts and components to a site.
- **Minimal Tooling**: Authoring with Unify should be able to be done easily just using browser dev tools.

---

## Mental Model

- **Layers**: `layout → components → page`. Later layers override earlier ones (like CSS `@layer`).
- **Scope (boundary)**: Each layout body or imported component root. Matching never crosses scopes.
- **Areas**: Public regions exposed by class selectors (e.g., `.unify-hero`). Areas are unique per scope and start with `unify-`.

- **Specificity**: Area class match > landmark fallback > ordered fill.
- **Source order**: Within a matched area, page child order becomes final order.

---

## Minimal Attribute Surface

- `data-unify="/layouts/site.html"` (on `<html>` or `<body>` of a page or layout) - triggers **layout mode** and chains parent layouts (outermost first).
- `data-unify="/components/card.html"` (on any other host element) - triggers **component mode** and inlines a component at this point.

**Details:**

- When `data-unify` is applied to `<html>` or `<body>`, Unify processes the file as a layout, chaining layouts as needed.
- When `data-unify` is applied to any other element, Unify processes it as a component import, inlining the referenced component at that location.

---

## Docs: Exposing Public Areas as CSS

Layout/component authors **publish public selectors** in a discoverable, inline `<style>` block.&#x20;

```html
<head>
  <style data-unify-docs="v1">
    /* Public areas: add these classes in a page to override content.
     Keep selectors low-specificity and unique per scope.

    Docs should contain all public areas and can optionally contain additional
    comments for other classes that can be applied to the host element to 
    modify the style of the imported HTML
  */

    /* Above-the-fold hero */
    .unify-hero {
    }
    /* Feature section under hero */
    .unify-features {
    }
    /* Global call-to-action */
    .unify-cta {
    }

    /* Optional variants/states */
    .is-inverted {
    }
    .is-compact {
    }
  </style>
</head>
```

**Guidelines**

- `data-unify-docs` attribute hint used to denote this style element holds guidance on usage. it does not require a value but can include a "v1" to denote version target
- **Prefix**: `unify-` for public _areas_ (e.g., `.unify-hero`), `.unify-menu-item-blog`
- **Uniqueness**: One area class instance per scope (prevents ambiguous matches).
- **Low specificity**: Prefer `section.unify-hero`; avoid combinators (`> + ~`), `:nth-*` chains.
- **Private vs Public**: Only selectors in the contract are public; everything else is private and may change.
- **Optional external**: You may keep the same content in `contract.css` too.
- **Build Removal**: All style blocks with a `data-unify-docs` attribute will be excluded from the build output

---

## Matching & Replacement (Deterministic Rules)

**Precedence within a scope**

1. **Area class match**: A page element with a public area class (e.g., `.unify-hero`) targets the single host element with the same class.
2. **Landmark fallback**: If no public areas are used, match by unique landmarks within the same sectioning root: `header`, `nav`, `main`, `aside`, `footer`.
3. **Ordered fill fallback**: If still unresolved, map `main > section` by index (1→1, 2→2, …); append extras.

**Replacement semantics (v1)**

- Keep the target host element's **tag** and **position**.
- **Merge attributes** on the matched element (host ← page):
  - Conflicts: **page wins** except for `id` (host id retained for stability; page id used only if host lacks one).
  - `class`: **union**; page classes appended.
  - Booleans: present if either side has them.
  - ARIA/for rewrites: If page references an id, it is rewritten to match the retained host id.
  - All attribute merge rules apply equally to HTML generated from Markdown sources.
- **Replace children** of the matched host with the page's children. No deep merge beyond the matched pair.

**Multiple page sources for one area**

- If a page supplies the _same_ area class multiple times, concatenate their **children** in page order into the single host area. Attribute merge uses a merge using last one wins by index of all matching elements with the page elements, starting with the host.

**Scoping**

- Matching is strictly local to each scope (layout body or imported component root). No cross-scope targeting; each scope is processed independently.

---

## Head & Assets

- `<title>`: page wins.
- `meta[name]`, `meta[property]`, `meta[http-equiv]`, `link[rel=canonical]`, `link[rel=icon]`: page overrides matching entries; keep non-conflicting. Deduplication is performed by these keys.
- **CSS order**: layout → components → page. (Mirrors CSS cascade: page last.)
- **JS**: External `src` deduped; inline scripts deduped by hash.
- If the source is Markdown, frontmatter is synthesized into head elements before merging, following the same precedence and deduplication rules.
- Page head content always takes precedence over layout/component head content for conflicting entries.

---

## Examples

### Replace a hero (no attributes anywhere)

**Layout**

```html
<main>
  <section class="unify-hero" data-some-attr="merged">
    <h1>Default</h1>
  </section>
  <section class="unify-features">...</section>
</main>
```

**Page**

```html
<section class="unify-hero">
  <h1>Product X</h1>
  <p>Now shipping</p>
</section>
```

**Output (Merged DOM)**

```html
<main>
  <section class="unify-hero" data-some-attr="merged">
    <h1>Product X</h1>
    <p>Now shipping</p>
  </section>
  <section class="unify-features">…</section>
</main>
```

_The `.unify-hero` element keeps its tag and attributes (including `data-some-attr="merged"`), merges any new attributes from the page (none in this case), and replaces its children with the page's content. Other layout elements remain unchanged._

**Result**: `.unify-hero` keeps its element; attributes merge; **children replaced**.

---

### Ordered fill fallback (no classes)

If no `.unify-*` classes are used:

- Page `main > section` #1 replaces host #1, #2 -> #2, etc.; extras append.

---

### Component composition (class-only)

**Host**

```html
<div data-unify="/components/card.html">
  <h3 class="unify-title">Starter</h3>
  <p class="unify-body">Best for trying things out.</p>
  <div class="unify-actions"><a class="btn">Get started</a></div>
</div>
```

**Component**

```html
<article class="card">
  <h3 class="unify-title">Title</h3>
  <p class="unify-body">Copy</p>
  <div class="unify-actions"><button>Buy</button></div>
</article>
```

**Output (Merged DOM)**

```html
<article class="card">
  <h3 class="unify-title">Starter</h3>
  <p class="unify-body">Best for trying things out.</p>
  <div class="unify-actions"><a class="btn">Get started</a></div>
</article>
```

**Result**: Each area class matches; attributes merge; children replaced.

---

### Nested layouts

```html
<!-- page.html -->
<body data-unify="/layouts/site.html">
  <main>
    <section class="unify-hero">Landing Page</section>
  </main>
</body>

<!-- /layouts/site.html -->
<body data-unify="/layouts/root.html">
  <header class="unify-header">…</header>
  <main>
    ...
    <section class="unify-hero">Example Hero</section>
    ...
  </main>
</body>
```

Resolution order: `root` → `site` → `page`. The final DOM is the outer layout with page merges applied.

---

## Linter Rule Set

**Rule codes & levels**

| Code | Rule                                                                                       | Level | Rationale / Autofix                                    |
| ---- | ------------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------ |
| U001 | `docs-present`: a \`style[data-unify-docs]\` element exists in host doc (Layout/Component) | warn  | Improves discoverability.                              |
| U002 | `area-unique-in-scope`: each `.unify-*` area appears **once per scope**                    | error | Prevents ambiguous matches.                            |
| U003 | `area-low-specificity`: contract selectors must be class or simple type+class              | warn  | Stable public API.                                     |
| U004 | `area-documented`: every `.unify-*` area used in DOM appears in the docs                   | warn  | Avoids hidden APIs. _(Autofix: append empty selector)_ |
| U005 | `docs-drift`: selectors in docs missing from DOM                                           | info  | Signals stale docs.                                    |
| U006 | `landmark-ambiguous`: multiple same landmarks in a sectioning root                         | warn  | Suggest adding area classes.                           |
| U008 | `ordered-fill-collision`: ordered fill used while public areas exist unused                | warn  | Nudge toward explicit areas.                           |
|      |                                                                                            |       |

**Example linter config**

```yaml
unify:
  contract_marker: "data-unify-docs"
  area_prefix: "unify-"
  item_prefix: "u-item-"
  rules:
    U001: warn
    U002: error
    U003: warn
    U004: warn
    U005: info
    U006: warn
    U008: warn
```

**CLI (example)**

```
unify lint src/**/*.html
```

- Non-zero exit if any **error** rules fire (e.g., U002).
- `unify fix` can auto-insert a minimal data-unify-docs block (for U001/U004).

---

## Accessibility & ID Handling

- **ID stability**: Keep host `id`; rewrite page references (`for`, `aria-*`) to point to the retained ID if needed.
- **Landmarks encouraged**: Use `header/nav/main/aside/footer` for zero-attribute pages and better AT navigation.
- **Warnings**: Flag multiple `main` in same sectioning root unless intentional and documented via areas.

### Example: ID Stability and Landmark Usage

#### Layout (host)

```html
<main>
  <form id="signup-form">
    <label for="signup-email">Email</label>
    <input id="signup-email" name="email" />
    <button>Sign Up</button>
  </form>
</main>
```

#### Page (override)

```html
<form id="custom-form">
  <label for="custom-email">Your Email</label>
  <input id="custom-email" name="email" />
  <button>Join</button>
</form>
```

#### Merged Output

```html
<main>
  <form id="signup-form">
    <label for="signup-email">Your Email</label>
    <input id="signup-email" name="email" />
    <button>Join</button>
  </form>
</main>
```

The host's id="signup-form" and id="signup-email" are retained for stability.
The page's references (for="custom-email") are rewritten to match the retained host IDs (for="signup-email").

Why not let the page override IDs?
Risk of broken references: Page authors may not know all the places an ID is referenced in a layout/component, especially with third-party code.
Unintentional collisions: Allowing page IDs to win could introduce duplicate IDs, breaking forms, navigation, and accessibility.
Spec consistency: While most attributes are merged with “page wins,” IDs are special because they are global and referenced by other attributes.
How does Unify help site authors?
Automatic reference rewriting: If a page references an ID (e.g., <label for="custom-email">), Unify rewrites it to match the retained host ID (signup-email), so authors don’t have to worry about collisions or broken links.
Safe extensibility: Site authors can use area classes and other attributes to override content and styling, but IDs are managed to keep the DOM valid and accessible.

---

## Authoring Quick-Start

**Layout/Component Authors**

1. Place **public area classes** on the exact elements you want overridden (e.g., `section.unify-hero`).
2. Keep them **unique per scope** and **low specificity**.
3. Document public selectors in an inline `<style data-unify-docs>` element.
4. Prefer landmarks so bare pages still “just work.”

**Page Authors**

1. Write semantic HTML first; landmarks/ordered fill often suffice.
2. For precise placement, add the **same public area class** as the layout/component.
3. Trust the cascade: page layer replaces content; attributes merge only on the matched element.

**Naming conventions**

- Areas: `.unify-hero`, `.unify-features`, `.unify-cta` (nouns, not layout mechanics).

---

## Merge Algorithm (Pseudocode)

```pseudo
for each scope S in layer order (outermost layout → nested → component → page):
  P_areas = page elements in S with class .unify-* (excluding .u-item-*)
  if P_areas not empty:
    for each unique area class A in document order:
      H = the single host element in S with class A
      if H not found or multiple found:
        warn(U002) and continue
      P_matches = all page elements in S with class A (keep order)
      // Attribute merge: last page match wins
      attrs(H) = merge_attrs(H, attrs(P_matches.last))
      // Content replace: concat page children in order
      H.children = concat_children(P_matches)
  else:
    if unique landmarks exist in S:
      replace landmark contents per rules
    else:
      ordered_fill(main > section)
```

---

## Glossary

**Area (public area)** - A region exposed by a layout/component via a class like `.unify-hero`. Exactly one instance per scope.\
**Area class** - Low-specificity public selector identifying an area.\
**Area uniqueness** - Each area class appears once per scope to avoid ambiguous matches.\
**Asset order** - CSS/JS load order: layout → components → page.\
**Boundary / Scope** - The current layout body or imported component root; matching is local.\
**Build-time** - CLI compile that resolves layouts/imports, performs matching/merging, and emits final HTML.\
**Cascade (layer order)** - Authoring layers overriding in order: layout → components → page.\
**Component** - Reusable HTML fragment imported into hosts; exposes areas.\
**Component import** - Inlining a component via `data-unify`.\
**Contract** - Documented set of public selectors (areas; items in vNext).\
**Contract block** - Inline `<style>` marked data-unify-docs listing public selectors and descriptions.\
**Contract drift** - Mismatch between contract and DOM; flagged by linter.\
**Design-time runner** - In-browser preview performing the same algorithm with hot reload.\
**Fallbacks** - Landmark and ordered fill behavior when no areas are used.\
**Head merging** - Deterministic `<head>` rules (page `title` wins; page overrides matching `meta`/links).\
**Landmark fallback** - Matching by unique `header/nav/main/aside/footer` within a sectioning root.\
**Linter** - Rules enforcing DX conventions (uniqueness, low specificity, etc.).\
**Merge (replacement) semantics** - Keep host tag; merge attrs on matched element; replace children with page content.\
**Ordered fill** - Map `main > section` by index when no areas are used.\
**Page** - Source HTML providing content to override areas in the selected layout and nested components.\
**Private selector/class** - Not listed in contract; not stable API.\
**Public selector/class** - Listed in contract; stable API.\
**Replace-by-default** - Core behavior described above.\
**Sectioning root/content** - HTML semantics guiding landmark matching and fallback.\
**Semantic HTML** - Using native landmarks and sectioning elements.\
**Variant/state class** - Documented classes like `.is-inverted` to toggle supported variations.

---

## Versioning & Compatibility

- **Contract stability**: Treat public selectors as semver-guarded API. Changing them is a breaking change.
- **Back-compat**: Leave deprecated selectors in the contract during a transition period; mark with comments.
- **Linter config**: Keep rule severities in repo to standardize CI behavior.

---

## Test Checklist

- Area class match replaces children; merges attrs; page wins conflicts.
- Duplicate area in scope → U002 error.
- Landmarks: single `header/nav/main/footer` per sectioning root; ambiguous → U006 warn.
- Ordered fill: `main > section` maps index-wise; extras append.
- Head merging rules honored; CSS order is layout→components→page.
- `data-unify` chaining resolves outermost-first for layouts; imports resolve depth-first within scope for components.
- Scoping respected: no cross-instance matches.
- Contract block present (U001); DOM areas all documented (U004); no drift (U005 info only).

---

## Future Considerations

### Collections, Tables, Forms

- **Collections (lists/menus/grids)**: Matching a container area (e.g., `.unify-main-nav`) replaces the container's **children** wholesale with the page's children. No per-item diff.
- **Tables**: Replacing a `.unify-table` area replaces all rows.
- **Forms**: Replacing a form area replaces all controls; no `name`-based merging.

> NOTE: May consider adding deep merge to the spec to support list/form items as Unify targets
