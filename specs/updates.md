
# How the App-Spec Should Reference the DOM Cascade Spec

## 1) Scope & Roles (front-matter of app-spec)

**Add a short “Spec Roles” block** explaining the split:

> **Spec Roles**
>
> * **DOM Cascade (v1)** — *Normative* definition of composition behavior: layers, scopes, matching, replacement, attribute/head merge, and linter rules.
> * **App Spec (v0)** — *Normative* definition of CLI, build pipeline, file layout, config, plugin points, design-time runner, and tooling UX.
>
> **Single-source rule:** Any behavior that affects DOM merging MUST conform to **DOM Cascade v1**.

## 2) Conformance Wording (use RFC 2119 terms)

Add a dedicated **Conformance** section early in app-spec:

> **Conformance to DOM Cascade**
> The Unify compiler and design-time runner **MUST** implement the algorithm and semantics defined in **DOM Cascade v1** (sections: Layers & Scopes, Matching & Replacement, Head & Assets, Accessibility & IDs). In case of conflict, the DOM Cascade is the source of truth for DOM behavior.

## 3) Terminology & Glossary

In app-spec **Terminology**, **import** the key terms from DOM Cascade instead of redefining them:

* Reference: *Area*, *Scope/Boundary*, *Layer order*, *Public contract*, *Ordered fill*, *Landmark fallback*, *Contract block* (`<style data-unify-docs>`).
* Add: “App-spec reuses these terms by reference; definitions are normative in DOM Cascade v1.”

## 4) Authoring Model (what authors write)

In “Authoring” / “Authoring Surface” add a **tight pointer** to the DOM Cascade minimal surface:

> **Composition Surface (normative)**
>
> * `data-u-layout` (on `<body>`) and `data-u-import` (on any host element).
> * Public areas exposed via class selectors (e.g., `.ua-hero`) and documented in `<style data-unify-docs>` blocks.
>   See **DOM Cascade v1 § Minimal Attribute Surface, Public Areas & Docs**.

Provide a **small table** (kept in app-spec) with just the names and links; all behavior links to DOM Cascade.

## 5) Composition Engine (the core “how it builds” section)

Replace any algorithmic prose with a **normative incorporation clause**:

> **Normative Incorporation**
> The Unify composition engine **MUST** execute the **DOM Cascade v1** algorithm exactly (matching precedence, replacement semantics, attribute merge, scoping).
>
> * Matching order: **Area** → **Landmark** → **Ordered fill**.
> * Replacement: keep host element; replace children; merge attributes (page wins; class union; host `id` stability with reference rewrite).
> * Head merge and asset ordering per DOM Cascade v1.
>   The app-spec does not restate these rules.

## 6) Design-Time Runner (preview)

Make parity explicit:

> **Design-Time Parity**
> The browser runner **MUST** produce DOM identical to the build output by executing **DOM Cascade v1**. Hot reload, dependency tracking, and error surfacing are app-spec concerns; **DOM differences are not allowed**.

## 7) Linting & Diagnostics

In the app-spec’s “Linting” section, import the rule IDs and severities:

> **Rule Set**
> The linter **MUST** implement DOM Cascade rules **U001, U002, U003, U004, U005, U006, U008** with the default severities specified in DOM Cascade v1. The app-spec defines CLI behavior, configuration keys, and CI exit codes; rule semantics are owned by DOM Cascade.

Include a tiny table mapping **rule → CLI exit behavior** (e.g., any `error` ⇒ non-zero).

## 8) Configuration (unify.config.\*)

Add a top-level field to lock the cascade version and default lints:

```yaml
unify:
  dom_cascade:
    version: "1.0"     # MUST match a supported DOM Cascade major.minor
    area_prefix: "unify-" # default; tooling MAY allow override
  lint:
    U001: warn
    U002: error
    U003: warn
    U004: warn
    U005: info
    U006: warn
    U008: warn
```

Note: app-spec owns the config schema; **behavior still lives in DOM Cascade**.

## 9) CLI & Tooling UX

* **`unify build`** — MUST run DOM Cascade v1.
* **`unify preview`** — MUST run DOM Cascade v1 in-browser.
* **`unify lint`** — MUST implement the rule set from DOM Cascade v1; app-spec defines output format, colors, and machine-readable JSON.
* **`unify fix`** — MAY implement autofixes allowed by DOM Cascade (e.g., insert empty `data-unify-docs` selectors).

## 10) Error Messaging & DX

* App-spec defines **error shapes** (code, message, location, snippet).
* DOM Cascade defines **what constitutes** an error/warn/info (e.g., U002 area not unique).
* Recommendation: stable machine codes `U00x` (from DOM Cascade) and `A00x` (app-spec operational errors).

## 11) Examples & Tutorials

Keep examples in app-spec **light** and **non-normative**; each example should link to the corresponding DOM Cascade section that governs behavior. Add a note: “Examples illustrate, they don’t define behavior.”

## 12) Versioning Policy (inter-spec)

Add a small policy block:

> **Inter-Spec Versioning**
>
> * App-spec v0 targets **DOM Cascade v1.x**.
> * App-spec **MUST NOT** redefine cascade behavior; updates to cascade require bumping `dom_cascade.version`.
> * Patch/minor of DOM Cascade **MUST NOT** change normative behavior; major indicates breaking changes.

## 13) Plugin & Extensibility

* App-spec owns **hooks** (pre/post build, asset pipeline, import resolvers).
* Plugins **MUST NOT** alter DOM merge semantics; they may only **supply inputs** (HTML) or **post-process outputs** (HTML/CSS/JS) outside the merge core.

## 14) Accessibility Requirements

Point to DOM Cascade’s **ID stability & reference rewrite** as normative. App-spec can add additional a11y checks (e.g., multiple `main` detection UX), but must not contradict DOM Cascade.

---

## Ready-to-Paste Paragraphs

**Front-matter “Normative Reference”**

> This document is a companion to **Unify DOM Cascade v1**. All DOM composition behavior is **normatively defined** in the DOM Cascade. This document references those rules and defines CLI, configuration, tooling, and UX around them.

**Composition Engine**

> The composition engine **MUST** implement **DOM Cascade v1** without modification (layers, scopes, matching precedence, replacement, attribute/head merge). Any divergence is non-conformant.

**Design-Time Parity**

> The design-time runner **MUST** yield DOM identical to the build output as defined by **DOM Cascade v1**.

**Linting**

> Lint rule semantics (U001…U008) are owned by **DOM Cascade v1**. This document defines CLI UX, output formats, severities, and CI behavior.

---

## Editorial Checklist (for your PR)

* [ ] Add “Spec Roles,” “Conformance,” and “Normative Reference” blocks.
* [ ] Replace any restated merge/matching prose with a short pointer to DOM Cascade v1.
* [ ] Add `dom_cascade.version` to config; document default linter severities.
* [ ] Ensure CLI sections (`build`, `preview`, `lint`, `fix`) explicitly say “executes DOM Cascade v1.”
* [ ] Add link targets for **DOM Cascade v1** sections (Layers, Scopes, Matching, Replacement, Head, Linter).
* [ ] Align examples with area-based authoring and `<style data-unify-docs>` blocks.
* [ ] Add inter-spec versioning policy.
* [ ] Add testing note: “App conformance tests MUST pass DOM Cascade v1 test checklist.”

---

If you want, I can draft the exact text inserts for each app-spec section (with headings you already use) so you can paste them verbatim.
