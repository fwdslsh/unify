# Salvage audit: superseded docs + shipped implementation, from an agent-authoring lens

**Date:** 2026-08-11
**Method:** two parallel deep audits — (a) the superseded docs (`dom-spec`, `app-spec`, `include-syntax`, `getting-started`, `cli-reference`, `docker-usage`, `cicd-workflows`) mined for authoring affordances still compatible with product-spec v2; (b) the shipped implementation exercised against `docs/authoring-rules.md`, with real builds. Spot-verified independently: the include loop, the dead layout resolver, the missing `example/` tree, the `unify-content` synthetic slot.
**Status:** findings only — nothing applied.

---

## A. Worth taking into the spec / rules doc

Ranked by value to an author (human or agent). Each survives §5's non-goals.

1. **HTML pages have no frontmatter; Markdown pages have no `<head>`.** (`app-spec.md:926,931,1011`) The two highest-frequency cross-generator reflexes: an agent trained on Jekyll/Astro writes `---\ntitle: X\n---` atop `.html`, and drops a literal `<head>` block into `.md` to get a meta tag. Under v2 both are *silently wrong* — the frontmatter renders as visible text, the head block lands in the body — and neither §3 nor `authoring-rules.md` says a word. The old spec made both hard errors. **This is the single largest silent-wrong-output gap in the current documentation.**

2. **Design-time vs build-time links.** (`app-spec.md:876-897, 914-917`) "Always link the real file (`about.html`); never hand-write `/about/`." An agent that knows the site ships with `--pretty-urls` will helpfully pre-write pretty hrefs, which are then *not* rewritten, break uncomposed preview, and break entirely if the flag is dropped. The preserved-link list (external, `mailto:`, `tel:`, assets, fragment-only, data URLs) plus the seven-row transformation table are ready-made conformance fixtures.

3. **The underscore worked example, with the `_dir/` exception.** (`app-spec.md:830-856`) Agents put fragments beside the pages that use them far more often than in `_includes/`. `blog/sidebar.html` ships as a broken standalone page; `blog/_sidebar.html` does not. Six lines of ✅/❌ makes it concrete, and states the exception (a file inside a `_` folder needs no underscore of its own) that v2 leaves inferable.

4. **Cycle and depth errors print the chain.** (`include-syntax.md:376-380`) `_layout.html → _includes/nav.html → _layout.html` is a one-edit fix; "circular include detected" is a graph the reader has to rebuild by hand. Pure message wording, no machinery.

5. **`<h1>` title fallback** (implementation, `markdown-processor.js:534-541`): a Markdown page with no frontmatter `title` uses its first `<h1>`. One sentence, removes the most common frontmatter chore, matches expectation. The one genuinely good idea the shipped code has that the spec lacks.

6. **Area naming: nouns, not layout mechanics.** (`dom-spec.md:371`) `unify-hero`/`unify-cta`/`unify-footer` are guessable by the next author; `unify-top`/`unify-col2`/`unify-slot1` are not, and they decay when the CSS changes. Must stay advice — as an advisory it is U003 in a costume.

7. **unify does not scope styles.** (`app-spec.md:1736`) "How do I stop this fragment's CSS leaking?" is the first question a fragment author asks and v2 answers it nowhere, so agents invent answers (inline `style=`, imagined build steps). The correct answer is a non-feature: use `@scope`, `@layer`, nesting, or a class prefix. Pairs with the v2 trap that `url()` inside `<style>`/`style=` is never rewritten.

8. **Error shape, including "check the path spelling and casing."** (`include-syntax.md:472-491`, `cli-reference.md:360-367`) §4 mandates the format in prose; this is it rendered as a template (`what` / `in: file:line` / short fix list). The casing line specifically: a case-mismatched include builds on macOS and 404s on the Linux host.

Also worth keeping from `cli-reference.md:227-233`: the exit-code split `0` success / `1` build error / `2` fatal or invalid usage — lets a caller distinguish "I mistyped a flag" from "my site has errors."

### Good idea, does not survive

- **`<style data-unify-docs>` contract blocks.** The *problem* is real and unsolved: nothing in a layout tells a reader what pages may replace, short of `grep -o 'unify-[a-z0-9-]*'`. Every container form fails §5 and drags U001/U004 behind it. The surviving residue is content, not container: **plain HTML comments above each area** (`<!-- Above-the-fold hero -->`), shown in `init`'s layout as a convention, never a rule. Note `--dry-run` already answers the half of discovery grep cannot: which layout a page resolved to.
- **Markdown `head:` schema** (`app-spec.md:936-1005`). Cut correctly by §3.4, but it leaves a real gap: a Markdown page cannot express `rel=canonical`, `rel=preload`, or JSON-LD at all. The honest answers ("put it in the layout" or "write the page in HTML") should be stated, or agents will invent `head:` blocks that become junk metas.

## B. A bug v2 created, surfaced by the old docs

`dom-spec.md:137` deduped `link[rel=canonical]` and `link[rel=icon]` by `rel`. Under v2 §3.2 rule 3, only `<meta>` dedupes by `name`/`property` and only *exact-duplicate* stylesheet/script URLs dedupe by URL — so **a page declaring `<link rel="canonical">` gets it appended alongside the layout's, emitting two canonicals.** Same for `rel=icon`. Real silent-wrong output, created by v2's own rule. The dom-spec fix (a per-`rel` dedup table) fails the one-sentence test; the cheap form is an authoring rule ("if the layout declares canonical/icon, don't also declare one in a page"), with the mechanism decided in the conformance spec.

## C. Implementation reality check

§7 says the shipped tool and the spec "intentionally differ." The gap is much larger than the Fix list implies — **the §2 golden path cannot execute end to end today.** Verified by real builds:

- `unify init` downloads `fwdslsh/unify-templates` from GitHub and exits 1. Step 1 of the golden path scaffolds nothing.
- **Automatic `_layout.html` discovery does not exist.** `layout-resolver.js` is 412 of 465 lines commented out with zero importers (verified). Composition runs only when a `data-unify` attribute is present. Every page ships with no chrome, exit 0, `✅ Build completed successfully!`.
- **`unify-content` is the real, undocumented default slot** (`html-processor.js:891-910`, verified). Page content is wrapped in a synthetic `.unify-content` and **dropped** if the layout has no matching element. Measured: a page's `<h1>` and `<p>` vanished, replaced by the layout's placeholder text. This is worse than the spec's `<main>` rule because it fails closed by deleting content.
- `<title>` is **replaced, not joined** (`head-merger.js:56`) — the site name disappears from every page.
- Every non-stylesheet `<link>` plus `<base>` and `<noscript>` is deleted from composed pages (`html-processor.js:982-1031` has no `links` key) — favicon, canonical, manifest, RSS, preconnect all vanish.
- Inline markup inside an area override is reordered: text after a nested element is appended last. The spec's own footer example ships as `<p><a>email us</a>© My Site — </p>`.
- No URL rewriting at all (`link-normalizer.js` has no importer); relative `<include src>` resolves from the source root, not the including file; the void `<include>` form is left in output verbatim.
- Markdown `layout: /path.html` — the form the rules doc mandates — always fails and **aborts the whole build** mid-way, leaving a partial `dist/`.
- Output collisions are silent last-write-wins; `--pretty-urls` moves files without rewriting links.
- **A missing include hangs the build forever** (`html-processor.js:233-252`, verified): `while(true)` breaks only when no include tags remain, but a failed resolve leaves `content` unchanged, so the loop never terminates.
- The U001–U008 linter fires on a correct site (`⚠️ [LINT:U001] Missing documentation block`), and errors log to stderr while stdout says success and the process exits 0.
- `package.json` scripts point at `example/src`, which does not exist (verified).

### Worth keeping from the code

1. **`ssi-processor.js` path resolution is the only correct implementation of §3.1** (`:229` `file=` against the including file's dir, `:233` `virtual=` against the source root, `:154-160` located warning instead of a hang). Rebuild `<include>` on it rather than on the fileSystem-map guessing in `html-processor.js:70-134`.
2. **`HeadMerger._normalizeAssetPath`** (`head-merger.js:265-283`) already implements the amended "dedupe after URL resolution" rule — it just never runs on stylesheets, because `extractHeadData` routes them into an un-deduplicated array. Wiring, not design.
3. The `<h1>` title fallback (§A item 5).

Everything else is what §7 says it is: `unify-content`, short-name resolution, component-mode `data-unify`, and the linter are the exact features §5 refuses.

## D. Contamination — docs still teaching the wrong product

| File | Verdict | The worst of it |
|---|---|---|
| `getting-started.md` | **Banner, most urgent by blast radius** | A complete copy-pasteable wrong site: `data-unify-docs` blocks, `<div data-unify=…>` component imports (now an error), `head:` frontmatter that becomes junk metas, `unify serve`, `--fail-on security`, npm-first install |
| `app-spec.md` | **Banner** | `:110` is where the **slot fiction actually lives** (`<template data-slot>`); `:784` claims `.gitignore` is respected (v2: gitignored files **ship** — dangerous direction); `:1385` says fragments may contain `html`/`head`/`body` (false — inlining is textual); `:84/:983` "title: last wins" |
| `include-syntax.md` | **Banner, or delete** | No correct core — its thesis sentence inverts v2, `<include>` is never mentioned, component mode appears ~15 times. Salvage the SSI `file`/`virtual` examples and delete |
| `cli-reference.md` | **Banner** | Documents 12 flags that don't exist, omits every flag that does, `unify serve` as a command, `--dry-run` as glob classification |
| `dom-spec.md` | Banner present; add two lines | Banner doesn't disclaim `:136` "title: page wins" or `:137` per-`rel` head dedup |
| `docker-usage.md` | Minor corrections | `--layouts`/`--components` flags that never existed; `serve --host` |
| `cicd-workflows.md` | Fine | Repo CI only, no authoring claims |

`CLAUDE.md` is auto-loaded by every coding agent in this repo and still has three wrong lines: `:76` lists `landmark-matcher.js` as live, and `:26-39`/`:97-98` teach `unify serve --host`. Worth more than any docs edit.
