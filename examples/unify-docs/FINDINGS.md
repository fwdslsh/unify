# What building this site found

Issue #51's premise: the website is the instrument, the friction is the deliverable. This is
the friction. Every claim was verified against a real build in this repository, with a
minimal reproduction where the behaviour was surprising.

---

## 1. Pages written into the `--generate` overlay get no layout — bug

**Severity: bug. It contradicts the documented contract, and it fails silently.**
**Status: fixed** — [#54](https://github.com/fwdslsh/unify/issues/54), PR #56. Resolution note at the end of this finding; the account below is left as it was written.

`docs/cli-reference.md` says of `--generate`:

> Files written into `generatedDir` join the build as an overlay — scanned, composed,
> checked, published, and colliding with a same-named source file exactly like any other
> page.

and product-spec §6.4 adds that "generated pages then follow the ordinary build contract."

They do not. **Layout discovery never reaches them.** The walk looks upward from the page's
own directory, which for a generated page is inside the temporary overlay directory, so it
never sees the source root's `_layout.html`. Every generated page publishes bare: no chrome,
no stylesheet link, no `<html lang>` — and **no diagnostic of any kind**. The build exits 0.

Minimal reproduction — one layout in `src/`, one hand-written page, two generated ones:

| Page | Origin | Chrome | `<html>` |
|---|---|---|---|
| `plain.md` | hand-written in `src/` | ✅ present | `<html lang="en">` |
| `atroot.md` | overlay root | ❌ absent | `<html>` |
| `sub/nested.md` | overlay subdirectory | ❌ absent | `<html>` |

So it is not about Markdown, and not about nesting: it is the overlay boundary.

**Workaround, verified:** name the layout explicitly. A `/`-rooted path resolves from the
source root and works from the overlay:

```yaml
layout: /_layout.html
```

This example does that on every generated page. Without it the site published twelve bare
documents and passed `build --dry-run --strict`.

**Why it matters more than it looks.** Automatic layout discovery is unify's headline
convention — "the page says nothing". A generated page is the one kind of page that cannot
use it, and the failure mode is a silently unstyled site rather than an error. Either
discovery should treat the overlay as part of the source tree, or a generated page with no
resolvable layout should be a diagnostic.

**A note on how this was found**, because it is instructive: the first symptom was
`unify audit` reporting `lang-missing` on all twelve pages, whose fix line reads *"set it on
the layout: `<html lang="en">`"* — advice the layout had already taken. That sent the
investigation toward a Markdown `lang` inheritance bug, which does not exist (`plain.md`
above inherits `lang` correctly). The audit finding was a true symptom of a different cause.
Worth knowing that `lang-missing` on a page that should have a layout means *"this page has
no layout"*, not *"your layout is missing lang"*.

**Resolution (PR #56).** Discovery was made to treat the overlay as part of the source tree —
the first of the two options above. §6.1 step 4's walk now climbs *virtual* directories and
consults both roots at each level, so a generated `docs/api.md` looks for `docs/_layout.html`
and then `_layout.html` exactly as a hand-written page in that position does. The
`layout: /_layout.html` line is gone from every page `gen.mjs` emits, and the dry-run report
now says `← generated + _layout.html` on all fourteen. Conformance spec §33.3 carries the
rule; `tests/fixtures/landmines/overlay-layout-discovery` is the fixture.

---

## 2. An `<include>` cannot resolve a file the generator wrote — same boundary

**Severity: worth a decision.**
**Status: fixed** — [#55](https://github.com/fwdslsh/unify/issues/55), PR #56. Resolution note at the end of this finding; the account below is left as it was written.

The sidebar was going to be generated, since its contents are derived from the docs list.
`gen.mjs` wrote `_includes/docnav.html` into the overlay and `_layout.html` included it:

```
src/_layout.html:16: problem: include not found: /_includes/docnav.html
```

Pages written into the overlay are scanned and published; a **fragment** written there is
invisible to `<include src>`, which resolves against the source root on disk. Same root cause
as finding 1 — the overlay is not unified with the source root for *resolution*, only for
*scanning* — but it surfaces as a clean error rather than silence, which is better.

The consequence is real: a generator can produce every page of a section and then cannot
produce the nav that links them.

**What this example does instead**, and it is a decent pattern: the sidebar is hand-authored
and `gen.mjs` *asserts it is complete*, failing the build with a fix line if a document is
missing from it. That recovers the guarantee generating it would have given — no unreachable
page — without writing into `src/`.

**Resolution (PR #56).** Include resolution was made to see the overlay — the first of the two
options above — and symmetrically: one namespace, so a hand-authored `_layout.html` finds a
fragment the generator wrote, and a generated page finds a fragment the author wrote, with a
relative path measured from the generated page's own place in the tree. The sidebar is
generated again, which was this script's original design; the hand-authored
`src/_includes/docnav.html` and the completeness assertion that stood in for it are both gone.
The pattern above stays worth knowing for anything a generator cannot see. Fixture:
`tests/fixtures/landmines/overlay-fragment-include`.

---

## 3. In HTML, a raw `<include>` inside `<pre><code>` is spliced — a docs-site trap

**Severity: minor, but sharp for anyone documenting unify.** Includes are textual and run
before parsing, so they are found inside `<pre>` too:

| Where | Result |
|---|---|
| Markdown fence | left alone, escaped ✅ |
| HTML `<pre><code>&lt;include …&gt;</code></pre>` (escaped) | left alone ✅ |
| HTML `<pre><code><include …></code></pre>` (raw) | **spliced** ❌ |

Consistent with the stated model, and the Markdown behaviour is exactly right. But the
practical rule — *show unify syntax in Markdown fences, or escape it in HTML* — is written
down nowhere, and a documentation site is precisely where it bites.

---

## 4. `docs/integrations.md` had two `<h1>` elements — real defect, fixed

```
docs/integrations.md: incomplete: the page emits 2 <h1> elements:
  "Integrating compiled components: the compile-to-asset patte…", "Four recipes"
```

`# Four recipes` at line 107 should have been `##`. **Fixed in this branch.** It was invisible
on GitHub, which renders both happily, and would have stayed invisible without a build that
cared.

Worth noting what did *not* happen: five documents contain more than one `^# ` line, but four
of those are inside code fences and audit correctly ignored them. It flagged exactly the one
real case — no false positives on a 344 KB corpus.

---

## 5. Things that worked better than expected

**The conformance spec renders at full size without complaint.** 344 KB, 33 `<h2>`s, deep
nesting, wide tables, HTML inside fences: no crash, no timeout, no mangling.

**Heading-slug ids make every section a deep link**, with nothing to configure — most of what
a documentation site needs from a Markdown pipeline.

**`unify audit --strict` is a genuinely good docs gate.** Missing description, duplicate
title, title/`<h1>` mismatch, orphan page, duplicate id — close to exactly the list of what
goes wrong on a docs site, and it found the one real defect in the tree.

**Advisories stayed quiet on a correct site.** Once the real problems were fixed,
`build --dry-run --strict` was clean with no advisory noise to suppress.

**The reference check earned its keep immediately.** Every cross-document link in `docs/`
points at a `.md` file that this site does not publish; the check refused the build until the
generator rewrote all of them. That is the failure mode of every hand-rolled docs pipeline,
caught before publish rather than by a reader.

---

## 6. One self-inflicted bug, recorded because the lesson generalises

The first link rewriter rewrote link syntax **inside code spans**, so a worked example in the
conformance spec — `` `![diagram](diagram.png)` `` — was published as
`![diagram](https://github.com/fwdslsh/unify/blob/main/diagram.png)`, corrupting the very
sentence that explains URL rewriting.

Not a unify bug; a generator bug. It is here because it is the characteristic hazard of
"derived content comes from a script you own": **your script is not covered by unify's
guarantees.** unify verified the emitted link resolved — it did, to a real GitHub URL — and
could not know the text was never meant to be a link. Fixed in `gen.mjs` by skipping fences
and code spans.

---

## Summary

| # | Finding | Kind | Action |
|---|---|---|---|
| 1 | Overlay pages get no layout, silently | **Bug** — contradicts the documented contract | **Fixed** — [#54](https://github.com/fwdslsh/unify/issues/54), PR #56 |
| 2 | Overlay fragments invisible to `<include>` | Design gap, same boundary | **Fixed** — [#55](https://github.com/fwdslsh/unify/issues/55), PR #56 |
| 3 | Raw `<include>` splices inside HTML `<pre>` | Doc gap | One line in the authoring rules |
| 4 | Two `<h1>` in `integrations.md` | Defect | **Fixed** |
| 5 | Scale, anchors, audit, advisories, reference check | Working well | — |
| 6 | Generator rewrote inside code spans | Example bug | **Fixed** |

Findings 1 and 2 are one issue wearing two hats: **the `--generate` overlay is part of the
scan but not part of the resolution namespace.** That single sentence is missing from the
documentation, and finding 1 argues it should be missing from the implementation instead.

**Resolved that way.** PR #56 unified the namespace rather than documenting the gap: the
overlay and the source tree are one path space, so layout discovery and `<include>` see
across the boundary in both directions. Conformance spec §33.3 now states the rule, its
precedence (the source tree wins a tie; nearest still wins the walk), and the two failures
its absence produced. This example is the proof — both workarounds below are gone from
`gen.mjs`, and the site builds and audits clean without them.
