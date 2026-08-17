# Ratification round 1 — Haiku authoring from the rules alone

**Date:** 2026-08-12
**Protocol:** six agents (4 Haiku, 2 Sonnet), each in an isolated directory, given `docs/authoring-rules.md` (60 lines) verbatim inline plus a plain-English brief, and forbidden from reading anything outside their working directory or seeking other unify documentation. Task: a four-page bookshop site, shared header/footer, hero on the home page only, one page in Markdown.
**Bar:** Haiku consistently producing a spec-compliant site ratifies the spec and the agent instructions.
**Status:** 4/4 Haiku complete. Sonnet pending.

---

## Finding 1 — The title rule fails 3 of 4 (severity: high)

| Sample | Layout `<title>` | Verdict |
|---|---|---|
| haiku-1 | `Ravenswood Books` | ✗ emits `Home Ravenswood Books` |
| haiku-2 | `— Ravenswood Books` | ✓ (but reported inferring it) |
| haiku-3 | `Ravenswood Books` | ✗ |
| haiku-4 | `Ravenswood Books` | ✗ |

**Every page** wrote its own bare name correctly (`<title>Home</title>`). The page-side instruction lands perfectly. The **layout** side fails, and the cause is grammatical: the rule is written from the page's point of view —

> Your `<title>` joins the layout's, which carries the separator (`About` + `— My Site` → `About — My Site`); write only the page's name.

— so the agent authoring the layout is never *told* to do anything. It reads a description of a mechanism, then writes `<title>Ravenswood Books</title>` by reflex. haiku-2, the one success, said outright: *"the actual merging logic isn't fully specified — I had to infer it from the example."*

**Cascade.** haiku-3, having failed to see how an HTML page contributes a title, concluded the mechanism was Markdown-only and restructured the site around the imagined limitation: *"I worked around it by using Markdown for any page needing a custom title, and relied on the layout title for HTML-only pages."* A documentation ambiguity became an architectural decision.

**This is a doc bug, not a spec bug.** The layout-side separator was chosen deliberately (2026-08-11) over hardcoding ` — `, and the reasoning still holds. What is wrong is that the instruction is exemplary where it needs to be imperative.

## Finding 2 — A real contradiction, found by 3 of 4 (severity: high)

> "The layout owns `<head>` and declares `<meta charset>` — never write one in a page."

"one" is a pronoun with the wrong antecedent. It means *a charset*; it reads as *a `<head>`* — and so contradicts the rule six lines earlier requiring every file to be a complete `<!doctype html>` document. haiku-3 named it: *"Yet every page must be valid standalone HTML with `<head>`. This seems contradictory."* haiku-1 spent two passes resolving it. Both resolved it correctly in the end, but by guessing.

## Finding 3 — `<main>` unwrapping is under-specified (severity: medium)

Two of four flagged it. haiku-3 enumerated three readings before guessing right; haiku-1 called it "subtle… took re-reading". The phrase "Your own `<main>` wrapper is unwrapped" describes a state, not an operation.

## Finding 4 — The include placement list reads as exhaustive (severity: medium)

> "Works anywhere: `<head>`, other fragments, `.md` pages"

The list omits **layouts** — the single most common place an include actually goes. haiku-4: *"The rules show includes working in 'fragments' and `.md` pages, but layouts weren't explicitly listed."* It used one anyway, correctly, but on its own judgment. "Works anywhere" followed by a three-item list invites reading the list as the definition.

## Finding 5 — Path resolution is scoped to includes only (severity: low)

haiku-4: *"The rules discuss path resolution only in the context of includes. Not explicit whether this applies to all URLs/paths or just include `src` attributes."* It chose root-relative links inside an include and reasoned its way there, but the rule never states what happens to ordinary `href`s written inside a fragment that lands at varying depths.

## Finding 6 — Bare-slot vs `<main>` precedence reads densely (severity: low)

Two flagged the phrasing; both parsed it correctly. Wording, not substance.

## Non-findings (valid choices, not violations)

- **Whether to use `<include>` at all.** haiku-1 inlined header and footer directly in the layout and shipped no fragments. Entirely valid — a shared layout already makes chrome identical on every page — but it means the include primitive went unexercised in that sample.
- **Hero via named slot vs. page content.** haiku-4 used `<slot name="hero">`; haiku-1 and haiku-3 put the hero in the home page's ordinary content. Both correct.
- **`src/` or not.** haiku-4 authored at the working-dir root; the rest created `src/`. Both supported.
- **Explicit `data-layout` on a page that did not need it.** haiku-1 did this. Harmless, though it suggests "the page says nothing" did not fully land.

## Curiosity worth recording

haiku-1 reported that *"the rules mention `unify.config.yaml` in the config section"*. They do not — there is no config section and no such filename anywhere in the document. The model's prior supplied a config file it expected to exist and then reported having read about it. It correctly declined to create one, so no harm resulted, but it is evidence that a single negative mention ("no config key") does not fully suppress a strong ecosystem prior.

---

## Amendments for round 2

All are rewordings in place; the doc must stay at 60 lines for gate G10.

1. **Title — make the layout instruction imperative and show its literal value.** State that the layout's `<title>` *starts with* the separator, give the actual string, and show a page writing only its own name.
2. **Head — fix the antecedent.** Say plainly that pages have their own `<head>`, and that the layout is the only file declaring `<meta charset>`.
3. **`<main>` — state it as an operation:** a `<main>` you wrote is dropped and its children used.
4. **Includes — name layouts first** in the placement list.
5. **Slot precedence — "if it has one, otherwise…"** rather than the trailing conditional.

Deferred: path resolution beyond includes (Finding 5) needs a sentence the doc has no room for; candidate for displacing something in the Markdown block, which is the densest section and the least exercised by this task.
