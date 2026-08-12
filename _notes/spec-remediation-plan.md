# Spec remediation plan — consolidated findings from the stress test and external review

**Date:** 2026-08-11
**Inputs:** [public-website-gap-analysis.md](public-website-gap-analysis.md) (S-findings), [spec-stress-test-ecosystem.md](spec-stress-test-ecosystem.md) (S-findings), and the external implementation-readiness review (R-findings, verdict: "approve the concept, reject this draft as implementation-ready").
**Posture:** the review's verdict is broadly correct and largely *compatible* with the spec's philosophy — most fixes are safety rules, edge determinism, and honest scoping, not feature growth. Three findings force genuine product decisions (dev server, launch positioning, transactional strictness); everything else has a resolution that preserves the four-primitive model.

---

## Findings register

| ID | Finding | Verdict |
|---|---|---|
| R1 | Default copy can publish `.env`/`.git`/project files; one `--exclude` drops `_*` | **Accept core; modify remedy** (hard-exclusion layer, keep replace semantics) |
| R2 | Area-inside-`<main>` conflicts with default-slot rule | **Accept — spec bug.** Fix with the pinned-areas rule |
| R3 | No per-page layout opt-out | **Accept** — `data-unify="none"` / `layout: none` |
| R4 | Source-preview promise internally contradictory (void include, polyfill scope/loading, `.md`, 200 lines) | **Accept** — demote source preview from MVP promise; re-scope polyfill (merges S-polyfill finding) |
| R5 | `--clean` hazards, output collisions, symlinks, non-transactional builds | **Accept** — safety semantics + transactional `build` |
| R6 | "Nothing to learn beyond HTML" is an overclaim | **Accept** — reposition (merges S-positioning) |
| R7 | No dev server will fare poorly with this audience; `bunx live-server` contradicts the binary install story | **Partially accept — Decision A.** Golden-path hint fix is unconditional |
| R8 | Blog/docs templates mismatch non-goals; narrow launch positioning | **Accept with the seam counter-proposal — Decision B** |
| R9 | "Realignment is small" is optimistic; user story and normative conformance doc must split | **Accept** — doc architecture change |
| S1 | Composition seam (filesystem-as-plugin-interface) is real but unnamed | Accept — seam contract paragraph |
| S2 | Blog RSS is not hand-maintainable; template should ship a generator | Accept — feeds R8 resolution |
| S3 | Markdown heading `id`s needed for the §8 docs ambition | Accept — **recommend promoting to MVP** |
| S4 | `--run` pre-build hook | Keep demand-gated (§6) |
| S5 | Polyfill can't do Markdown | Merged into R4 |
| S6 | Positioning vs. existing SSGs | Merged into R6 |

---

## Workstream A — Deploy safety (R1, R5)

The principle to add to the spec: **safe to deploy by default outranks convenient by default.** Concrete rules:

1. **Hard exclusions — a new layer, not part of `--exclude`.** Always excluded, not replaceable, invisible: VCS metadata (`.git/`, `.hg/`, `.svn/`), `node_modules/`, `.env` and `.env.*`, the output directory, `unify.yaml`. This is the same class as the existing "output directory is always excluded" sentence — extend it into a short named list. It is not security theater (no scanning, no gating); it is the footgun guard equivalent of temp-then-rename.
   - *Push-back on the review's remedy:* keep `--exclude` replace semantics (just ratified, standard CLI behavior). The "replacing drops `_*` and ships your layouts" hazard is already caught by an existing advisory ("a file used as a layout or include that also ships as its own page") — reference that advisory from the `--exclude` paragraph. The hard layer means replacing can never unship `.git`.
   - Dotfiles are **not** blanket-excluded: `.htaccess` and `.nojekyll` are legitimate ship-files for exactly this audience (SSI migration, GitHub Pages).
2. **`init` scaffolds into `src/`** (Decision C, recommended yes): safe by construction, costs one directory level in the golden path. **Keep** the `src/`-if-exists-else-`.` source default — flat hand-migrated sites (the SSI audience) must keep working with zero flags. When building from `.`, the build report prints what it's copying ("copied 47 files — run with --dry-run to review"); a count and a hint, not a heuristic.
3. **`--clean` guard:** refuse to clean when the output directory is, contains, or is an ancestor of the source root or CWD. One sentence, hard error.
4. **Collision matrix (new conformance-doc section):** `foo.md` + `foo.html` → same output = **problem**, both sources named. `--pretty-urls` move colliding with an existing `foo/index.html` = **problem**. Two outputs differing only by case = **advisory** (breaks case-insensitive checkouts/hosts), promoted by `--strict`. Symlinks: followed only while they resolve inside the source root; escaping symlinks are treated as absent, with an advisory (extends the existing invisible path-traversal safety).
5. **Transactional `build` (R5, accept):** analysis stays best-effort — every problem is still found and reported in one pass — but *publishing* gates on zero problems: build into a temp tree, atomically swap in only when clean. `watch` keeps the current contract (error pages in the browser, incremental honesty) — watch is the iteration mode, build is the publish mode. Decision D: whether a `--force` escape hatch ships day one or waits for demand (recommend: wait; CI parity already exists via exit codes).

## Workstream B — Composition semantics (R2, R3)

1. **The pinned-areas rule (R2).** New sentence in §3.2 rule 2: *"Area elements inside `<main>` are pinned: default content replaces only `<main>`'s unmarked children (inserted at the position of the first one removed); pinned areas stay in place and are still replaceable by rule 1."* This resolves the order conflict deterministically, keeps hero-inside-main (the semantic-HTML case the reviewer is right about), and is polyfill-cheap. Add conformance examples: hero-in-main with both an area override and default content; area-only page; default-only page.
2. **Layout opt-out (R3).** `data-unify="none"` on `<html>`/`<body>`, `layout: none` in frontmatter — the page is emitted as-is (includes still resolve). Covers 404s, landing pages, embeds, redirect stubs. One row in the §1 table, one line in §3.2. (The Databasin kiosk page is exactly this user.)
3. Every merge rule gains a **conformance example pair** (input page + layout → exact output) living in the conformance doc / test fixtures — the reviewer's "examples, not prose" demand, which workstream G houses.

## Workstream C — Preview honesty (R4 + S5)

1. **Demote source preview from the MVP promise.** §1 rule 2 becomes: source files are valid HTML you can open, lint, and edit anywhere; *composed* preview is the built site — `unify watch` + any static server over `dist/`. This is what §2's golden path already does; the spec stops promising more than the walkthrough delivers.
2. **Re-scope the polyfill (§6):** HTML composition only — Markdown pages and fragments require the build. Solves the 200-line credibility problem and the `.md`-via-static-server impossibility in one carve-out.
3. **Define polyfill loading now (design note, §6):** the author writes `<script src="/_unify/polyfill.js" data-unify-polyfill></script>` in the layout; the build drops elements marked `data-unify-*` exactly as it already drops `data-unify` attributes. Removing an authoring-time marker is not "unify injecting/removing the author's JS" — it's the existing attribute-cleanup family. No shipped dead script, no contradiction.
4. **Teach the paired form** `<include src="…"></include>` in all examples (Decision E, recommend yes — §2's sample currently uses the void form the same spec admits browsers mis-parse); void form stays supported and documented as equivalent at build time.

## Workstream D — Positioning and promise (R6, R8, S6)

1. **Rewrite the §1 claim.** Drop "nothing to configure and nothing to learn beyond HTML." Adopt the reviewer's honest framing, which is also the better pitch: **"HTML-native composition: no expression language, no client runtime."** The four-primitive table stays; frame it as "the entire authoring surface — learnable in five minutes," which is true.
2. **Launch positioning narrows to where the product is strong today:** brochure/portfolio sites, campaign/project sites, existing static HTML adopting shared chrome, and Apache SSI migration (the legacy alias is a deliberate migration affordance — say so). One added sentence: migration from existing SSGs is a non-goal; unify replaces copy-paste and SSI, not Hugo.
3. **Blogs and docs are not advertised as primary use cases at launch** (reviewer is right) — but they are not abandoned: the blog template ships `_scripts/gen-blog.mjs` (index + RSS generator, ~40 lines, zero deps, excluded by `_*`) as the flagship demonstration of the composition seam; the docs story waits for heading anchors (S3) plus a Pagefind recipe. Decision B is how loudly to tell the blog story at launch.

## Workstream E — The dev loop (R7) — the big decision

Unconditional fix regardless of the decision: **the golden path must not say `bunx`** — the headline install is a binary for people who've never heard of Bun, so the serve hint leads with VS Code Live Preview / any static server, and `watch` prints an adaptive suggestion.

Decision A, the real question — three positions:

- **A1. Hold the line** (current spec): watch + external server; dev server stays §6 #7. Purist, defensible for developers; weakest for the stated audience.
- **A2. Promote to top §6 candidate with a concrete trigger** ("first-run friction reports"), ship MVP without it. Preserves scope discipline; risks the first-impression window — the reviewer predicts `unify dev` is the first major request, and Eleventy/Hugo/Astro all onboard with one command.
- **A3. Concede now:** `unify dev` = watch + minimal static server + reload, in MVP. Honest cost: re-adds the very serve/SSE layer §7 just cut, +1 command, and weakens "serving is a solved problem" — but it is the single change most aligned with "front-end designers and hobbyists" actually succeeding in five minutes.

**Recommendation: A3, minimally.** For this audience, one-command onboarding is table stakes in 2026, and the §5 non-goal was written to avoid *re-solving serving for developers* — the audience it hurts is the audience the product is for. Keep the §5 spirit by scoping it hard: static files + reload, no proxy, no HTTPS, no plugins, delegation still documented for anyone with their own server. If that's unpalatable, A2 with the trigger written into §6.

## Workstream F — Ecosystem seam (S1–S4)

1. **Seam contract paragraph** (§4 or §5-adjacent): unify never writes source and never reads outside it; generated source files are first-class (layouts, head merge, reference check all apply); `_*` shelters tooling (`_scripts/`); `dist/` is safe for post-processors (atomic writes, skip-unchanged); builds are deterministic; *the plugin interface is the filesystem — there is no other one.*
2. **Amend §5's collections bullet** to name the sanctioned escape valve: a pre-build generator the author owns. Point at the blog template's script.
3. **Markdown heading `id`s → MVP** (S3, upgraded by R8's docs pressure): deterministic slugs from heading text, one sentence, no JS, no polyfill impact (polyfill no longer covers Markdown per Workstream C). Unlocks deep-linkable docs, which §8's success criterion requires.
4. **`--run <cmd>`** stays out; recorded in §6 as demand-gated. If A3 lands, note that `unify dev` re-running a generator is the likeliest shape of that demand.
5. Recipes doc (non-normative): Pagefind, Decap/Sveltia, watchexec/entr, lychee, minifier, deploy CLIs; plus the honest "what does not fit" list (per-page parameterization, i18n, bundlers).

## Workstream G — Document architecture and honesty (R9)

1. **Split the documents.** `product-spec.md` stays the ≤3-page vision/scope contract. A new **conformance spec** (rewriting `dom-spec.md` during the already-planned realignment) carries: the merge rules with edge determinism, the collision matrix, URL rewriting order, the watch contract, error taxonomy — each rule with input→output conformance examples that double as test fixtures (§7 Fix #7 already wants fixture sites; these are the same artifact). The README teaches; it is not the spec.
2. **Re-scope the one-sentence rule** so it stops being self-defeating: it governs *which authoring rules may exist* (the user-facing model), not how precisely their edges are specified for implementers. R2 proved four sentences underdetermine real inputs; the fix is precision in the conformance doc, not more concepts in the product.
3. **Drop "small" from §7's gap description** and add the new work: pinned-areas rule, layout opt-out, hard exclusions, clean guard, transactional build, collision matrix, heading IDs, seam paragraph, positioning rewrite, conformance-doc split, (A3: dev server). The reviewer's engine list — URL provenance, pretty-urls, collisions, reference check, atomic watching, transactional output — is real engineering and the spec should stop implying otherwise.

---

## Decisions needed (everything else can proceed)

- **A. Dev server:** hold (A1) / promoted candidate with trigger (A2) / minimal `unify dev` in MVP (A3). *Recommend A3.*
- **B. Launch templates & positioning:** narrow to default/basic/portfolio and soft-pedal blog+docs (reviewer), vs. ship the blog template as the seam showcase with the generator script (stress test). *Recommend: both — narrow the marketing, ship the blog template unadvertised as the seam demo; docs template waits for anchors + search recipe.*
- **C. `init` scaffolds `src/`:** *recommend yes*, keeping the `.` fallback + hard exclusions for flat sites.
- **D. Transactional build escape hatch:** ship `--force` day one vs. wait for demand. *Recommend wait.*
- **E. Examples teach paired `<include></include>`:** *recommend yes* (void stays supported).

## Suggested order of execution

1. §1/§5 positioning rewrite + preview honesty (C, D) — changes the promise before it changes the rules.
2. Composition fixes (B): pinned-areas rule, layout opt-out, conformance examples drafted inline for now.
3. Safety rules (A): hard exclusions, clean guard, transactional build, collision matrix.
4. Seam contract + §5 collections amendment + heading IDs into MVP surface (F).
5. §6 reordering per Decision A; §7 rewritten with the honest work plan (G3).
6. Split the conformance doc during realignment (G1) — the §3 edge rules and matrices migrate there.

Net effect on the product: the four primitives survive untouched; one primitive gains an opt-out; the CLI gains at most one command (A3) and zero new concepts; everything else is determinism, safety, and truthful marketing — which is the review's actual demand.
