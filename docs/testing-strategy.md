# unify — Testing Strategy

**Status**: v0.7.0, normative for the test suite
**Role**: This document is the testing contract. It defines what "fully and correctly implemented" means as a set of machine-checkable conditions, and it exists because the previous suite proved that green checkmarks and a working product are independent variables unless something mechanical ties them together. Companion: `docs/migration-plan.md` (how we get from the v0.6 suite to this one). The rule inventory lives at `tests/conformance/rules.tsv`; the gates are `tests/conformance/check-traceability.mjs` and `tests/conformance/check-suite-hygiene.mjs` — both runnable today.

---

## 1. Root-cause analysis: 93% coverage on a product that did not work

v0.6.6 shipped with 240 files under `tests/` (62 test files) and a reported 93%+ coverage while: `unify init` exited 1 and scaffolded nothing; automatic layout discovery did not exist; a page's content was silently deleted when the layout lacked the expected element while the build printed `✅ Build completed successfully!`; `<title>` was replaced instead of merged; non-stylesheet `<link>` elements were stripped; `--pretty-urls` moved files without rewriting links; a missing `<include>` hung the build forever; a missing SSI include shipped the raw directive with exit 0.

All of these were re-verified while writing this document (2026-08-11, this machine). None of them is subtle. The suite could not see any of them, for five identifiable mechanisms. Every design decision in §2–§6 traces back to one of these.

### M1 — The suite tested functions, not the product

Exactly **one** of 62 test files invoked the real CLI: `tests/integration/fixtures-integration.test.js`. Everything else imported internal classes and asserted on their return values. `tests/unit/cli/commands/build-command.test.js` opens with twelve assertions of the form `expect(buildCommand.areaMatcher).toBeDefined()` — constructor property checks. `unify init`, the first command every user runs, had **zero** test files; it could exit 1 forever without a single red mark. When the object under test is a function, a broken product with working functions is green.

### M2 — The one real test had its assertion commented out

`fixtures-integration.test.js` did build fixtures through the CLI and did compare against expected output — and then, at line 374–375:

```js
// For now, don't fail the test - just document the differences
// expect(comparison.valid).toBe(true);
```

The only end-to-end output comparison in the entire suite printed a warning and passed. The same file weakened its content expectations to match the broken implementation, with comments narrating the surrender: `// Note: Third element may not be fully implemented yet`, `// Note: Full ID rewriting not yet implemented`, `// Note: Component scoping may not be fully implemented yet`. When implementation and test disagreed, the **test** was edited. A fixture tree with expected outputs existed (`tests/fixtures/full-site/expected/`) that no test read at all; it was deleted with the legacy suite.

### M3 — The suite ratified bugs as contracts

`tests/unit/core/cascade/head-merger-fixes.test.js` asserts `expect(merged.title).toBe('Page Title Wins')` — the title-replacement behavior that loses the site name on every page was written down as the *expected* behavior, named approvingly in the test data, and locked in. `tests/integration/build-success-validation.test.js:116–120` asserts that a build with a broken image reference **succeeds** (`expect(result.success).toBe(true)` alongside `expect(result.warnings[0]).toContain('missing-image.jpg')`). Silent failure wasn't missed by the suite; it was *specified* by the suite. There was no external authority (a spec with rule identity) that a test could be checked against, so "what the code does" became the oracle.

### M4 — Coverage measured execution, not verification

Five test files carry "coverage" in their names (`html-processor-coverage.test.js`, `html-processor-focused-coverage.test.js`, `security-scanner-branch-coverage.test.js`, `short-name-resolver-coverage.test.js`, `markdown-processor-yaml-coverage.test.js`) — tests written to make a number go up. The unit suites contain 322 assertions of the form `toBeDefined()` / `toBeTruthy()` / `not.toThrow()`: assertions that execute code and verify nothing about its output. Coverage counts lines *entered*; a test that calls `processLayout()` and asserts the result is an object covers every line of a wrong answer. And the inverse hole: `src/core/layout-resolver.js` — automatic layout discovery, the product's marquee convention — is 464 lines, 412 of them commented out, with **zero importers**. A file nothing imports never enters the coverage denominator, so deleting a feature's wiring *raised* the metric. Coverage can neither see wrong output nor missing features. It measured the suite's enthusiasm, not the product's correctness.

### M5 — Comparisons were normalized until they couldn't fail

The one output comparison that existed ran both sides through `normalizeHtml()` — `replace(/\s+/g, ' ')`, collapse everything — before comparing. Collapsing *all* whitespace erases differences inside text content, attribute values, and `<pre>` blocks — real bug classes for a composition engine — and it was applied ad hoc, per test, wherever an assertion was inconvenient. Weak comparators are how "close enough" ships. The v0.7.0 countermeasure is not "never normalize" — it is **one narrow, stated comparator** (§2), implemented once in the harness: normalization is confined to the single difference class the spec itself declares non-normative (whitespace between block-level elements, conformance spec §3), and every other normalization, anywhere, fails hygiene rule H5.

**Summary of the disease**: no single observable-product oracle, no external rule authority, a metric that rewards execution over verification, and a cultural pattern of weakening tests to match code. Every one of these has a mechanical countermeasure below; none of the countermeasures is a policy or a promise.

---

## 2. The tier model

Observable build output is the primary object of testing. Tiers are numbered by authority: when two tiers disagree, the lower number wins, and the higher tier is what gets fixed.

### Tier 0 — Golden path E2E (the product works)

Drives the **installed entrypoint** (`bun src/cli.js`, and the compiled binary in the release job) exactly as a user would, with subprocess spawns, real temp directories, a hard timeout on every invocation (a hang is a failure — M-item: the v0.6 missing-include hang), and no imports from `src/**`:

- For each of the five `init` templates: `unify init <t>` exits 0; the scaffold matches the §19 contract (each primitive exactly once, checked structurally); `unify build --dry-run --strict` exits **0** (SCF-04/DIA-10 — the advisory-discipline assertion); `unify build` publishes; every internal link in the output resolves.
- `unify dev` smoke: serves the output on the chosen port, injects reload only into served HTML, `dist/` contains no reload script, an edit triggers a reload event, ctrl-c exits clean.
- The product-spec §2 walkthrough site is built verbatim and its stated output asserted.

*Proves*: the five-minute site is real; the commands users type work end to end.
*Cannot prove*: rule-by-rule correctness — a golden path can be green while an edge rule is wrong. That is Tier 1's job.

### Tier 1 — Conformance fixtures (the spec is implemented)

The heart of the suite. A **generic harness** (one file, ~200 lines) iterates fixture manifests; a fixture case is: a source tree, flags, and a declared outcome — expected output tree (tree-exact per the comparator below, bidirectional), expected diagnostics (exhaustive), expected exit code, expected publish state. The harness spawns the CLI; there is no per-case test code to weaken. Three sets ship today:

- `tests/conformance/spec-fixtures/` — the conformance spec's worked examples, transcribed verbatim. The spec's own sentence is the assertion: *an implementation conforms when it reproduces each example's output exactly in structure, attributes, and text content, with only inter-block whitespace waived.* Ten of the thirteen FIX rows are checked in here; FIX-06, FIX-10, and FIX-14 are realized as the landmines `misaddressed-fill`, `slot-in-template`, and `layout-declares-layout`.
- `tests/fixtures/kitchen-sink/` — one realistic site (Meridian Coffee Roasters: a site layout plus a standalone section layout, both slot kinds, includes in five positions, Markdown with the full frontmatter surface, every head-merge row, three URL flag profiles, the underscore ecology, mirror-copied binaries) built under **four profiles** (default / `--pretty-urls --base-url https://…/coffee/` / `--base-url https://…/` / `--strict`), each with an expected tree or declared publish-block. Realism is the point: rules interact here (an include contributing head elements that then merge; include-authored URL provenance inside a section layout) the way they never do in one-rule micro-fixtures.
- `tests/fixtures/landmines/` + `runtime-cases.mjs` — the checked-in and runtime-built adversarial cases; every problem and advisory in the closed catalogues (20 problems, 9 advisories) fires at least once at its declared location and severity, every "builds clean" edge is pinned, the include depth-cap fenceposts (10 passes, 11 fails) are nailed down, and `diagnosticsExhaustive` means an *undeclared* diagnostic anywhere is itself a failure — the closed catalogue is enforced closed.

*Proves*: each normative rule, including exact output and exact diagnostics, against the real CLI.
*Cannot prove*: time-dependent behavior (watch), long-running processes (dev), or that the rules compose over arbitrary sites — Tiers 0 and 2 and the property harness cover those.

### Tier 2 — Engine-contract tests (the operational promises)

Targeted behavior tests, still through the CLI, still mock-free, for the contracts a static fixture can't express: transactional publish sync (unchanged files keep inodes/mtimes, stale outputs deleted, temp-then-rename — PUB-02), `--dry-run` writes nothing and reports each page's inputs (PUB-04, DRY-01..03), watch coalescing / watch-output ≡ fresh-build equivalence over a scripted edit sequence (WCH-01..04), dev server injection scoping (WCH-05..06), `unify.yaml` precedence (CFG-01..03), exit-code taxonomy including exit 2 cases (DIA-04), determinism (two runs → identical bytes on stdout, stderr, and tree — DIA-05), `DEBUG=1` (DIA-09).

### Tier 3 — Unit tests (developer scaffolding, zero authority)

Unit tests on pure internals (the slugger, the glob matcher, splice-span arithmetic) are welcome for development speed and may use whatever test doubles they like — but they carry **no conformance authority**: they cannot declare rule coverage (`covers()` is rejected outside `tests/conformance` + `tests/e2e` by the hygiene gate), they don't gate release, and when a unit test disagrees with a fixture, the unit test is wrong by definition. This inverts v0.6, where unit tests were the majority authority (M1) and ratified bugs (M3).

**Comparator discipline (all tiers)**: tree comparison is bidirectional (an extra emitted file fails, a missing file fails) and goes through exactly one comparator, implemented once in the harness (`tests/conformance/compare.mjs`). Its contract, in full: **non-HTML files are compared byte-for-byte. HTML files are parsed and compared exactly on the file set, the doctype, element structure, tag names, attributes (names, values, and order), comments, and text content — with precisely one normalization: a text node consisting entirely of whitespace, whose parent is not `<pre>`, `<textarea>`, `<script>`, or `<style>`, is dropped from both sides before comparison.** That is the conformance spec §3 waiver ("whitespace between block-level elements is not normative") and nothing more. A text node containing any non-whitespace is compared byte-for-byte, including its internal and surrounding whitespace — whitespace inside text-bearing content *is* significant. One blind spot, named rather than hidden: the comparator cannot tell a block gap from an inline gap without a tag taxonomy, so a whitespace-only text node between inline siblings (`<a>x</a> <a>y</a>`) is also normalized; where an inline gap is itself the thing under test, the fixture must make it text content (give the siblings a text-bearing parent with surrounding text). Trimming, entity folding, attribute reordering, tag-case folding, and any other normalization are forbidden; ad-hoc normalization anywhere else in a behavior test fails hygiene rule H5 (the M5 countermeasure, narrowed and stated rather than absolute). Diagnostics are parsed on the stable `FILE:LINE: SEVERITY: ` prefix; message prose beyond declared substrings is not asserted (the spec says prose is not contract — tests must not fossilize it). stdout/stderr comparisons (DIA-05, G6) remain byte-exact: determinism of one implementation is a byte-level claim even though cross-checking output trees against fixtures is not.

---

## 3. Spec-rule traceability, mechanically enforced

This is the mechanism that makes "fully implemented" a measurable claim.

### 3.1 The rule inventory

`tests/conformance/rules.tsv` — one row per normative claim in `docs/conformance-spec.md`, extracted section by section. It held **202 rows** (199 gated + 3 structural) at v0.7.0 and grows with the spec; the checker prints the current count, which is the number to trust. IDs are stable, never reused, and namespaced by area, reusing the spec's own labels wherever the spec numbers things. Retired IDs stay retired: `LAY-06`–`LAY-08`, `HED-08`, `P06`, and `FIX-08` died with layout chaining; `A05`–`A07` were merged into `A13` (the duplicated-construct advisory); `A03`, `A04`, and `A15` were retired by the ratification rounds (A04 became problem P20); no test may reference them.

| Prefix | Source |
|---|---|
| `PIP-*` | §2 pipeline order & best-effort |
| `S01–S12`, `SHL-01` | §3 splice rules + shell rule |
| `EXC-*` | §4 classification/exclusion/never-shipped/copy |
| `INC-*` | §5 includes |
| `LAY-*` | §6 layout resolution (incl. the no-chaining problem) |
| `MRG-*` | §7 composition (incl. the no-nested-slots problem) |
| `HED-01–07` | §8 head-merge table rows |
| `ATT-*` | §9 root attributes |
| `MD-*` | §10 Markdown |
| `URL-*` | §11 URL phases |
| `REF-*` | §12 reference check |
| `COL-*` | §13 collisions |
| `DIA-*` | §14 diagnostics contract |
| `P01–P21` (P06 retired) | §14.2 closed problem list |
| `A01–A14` (A05–A07 merged into A13; A03, A04, A15 retired) | §14.3 closed advisory catalogue |
| `PUB-*` | §15 transactional publish |
| `WCH-*` | §16 watch/dev |
| `DRY-*` | §17 dry-run report |
| `CFG-*` | §18 unify.yaml |
| `SCF-*` | §19 scaffold contract |
| `FIX-01–14` (FIX-08 retired) | the spec's worked examples |
| `MAN-*` | §20 the final-output page manifest |
| `SIT-*` | §21 sitemap generation |

Counts are deliberately absent: this table drifted twice in three commits while the checker's own printed totals stayed correct by construction. `check-traceability.mjs` prints the current inventory size, the covered count, and the gap list on every run — that output is the number to quote, and it cannot go stale.

A row's `testkind` is `fixture`, `targeted`, `e2e`, or `structural`. The three `structural` rows (MRG-18 the content-loss law, COL-04 no-last-write-wins, WCH-07 the closed dev scope) are invariants asserted *by the shape of the whole suite* (exhaustive diagnostics + full expected trees + closed CLI test) rather than by one test; they are exempt from the per-rule gate and documented as such in the TSV.

### 3.2 How tests declare coverage

Two declaration channels, both machine-read:

1. **Fixture manifests** (`manifest.json` per set): each case carries `"rules": ["S03", "MRG-09", …]`. Because the harness *iterates the manifest*, a manifest row **is** a test — declaring without running is impossible by construction.
2. **`covers()` in targeted/E2E tests**: behavior tests call `covers("WCH-02", "PUB-02")` (a helper exported by the harness) inside the test body. The call does two things: it records the declaration for the static check, and **at runtime it appends `{rule, test, status}` to the conformance ledger** (`.conformance-ledger.jsonl`) when the surrounding test passes.

### 3.3 The gap check

`tests/conformance/check-traceability.mjs`, two modes, both exit 1 on failure:

- **`--static`** (no ledger needed): unions manifest rules + `covers()`/`@covers` declarations, diffs against the inventory. Any gated rule with no declaration → fail, listed by ID. Any declared ID not in the inventory → fail (typos; rules retired from the spec but still claimed).
- **`--runtime <ledger>`** (the release-gate mode): diffs the inventory against rules **recorded by tests that actually executed and passed** in this CI run. This closes the skip hole mechanically: a `test.skip` records nothing, so its rules go uncovered and CI fails — a skipped test cannot silently keep its checkmark. CI order: `bun test && bun tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl`.

- **Spec→inventory sync** (both modes): the checker parses the conformance spec's countable structures — the `**S<n> —**` bullets (12), the §14.2 numbered problems (20), the §14.3 numbered advisories (9), the §8 table body rows (7) — and fails on any drift from the inventory, so an edit that adds an S13 or a fifteenth problem breaks CI until `rules.tsv` (and therefore a test) catches up. Prose rules can't be machine-extracted; for them the sync check enforces the weaker invariant that every spec section has inventory rows, and the human review rule is: **a PR touching `docs/conformance-spec.md` must touch `rules.tsv` in the same commit or say why in the PR description**. That last clause is the one non-automated step in this section, named honestly.

**Status at v0.7.0 (2026-08-13, `--static`)**: 202 rules (199 gated, 3 structural); **every gated rule covered** — `baseline.txt` empty, so the phase gate and the release semantics were the same check. All thirteen FIX rows realized, the §7 spec-bug set (B1–B7) and the four pinned readings closed.

**During v0.8.x**, `baseline.txt` is non-empty again. Conformance-spec §20 (the final-output page manifest) is an *implementation boundary*: product-spec §6.2 forbids exposing it as an author-facing format, so a rule about it can be specified before any CLI surface exists for a behavior test to observe. Those rows are baselined rather than claimed, and each is closed by the consumer that makes its field observable — the sitemap closed MAN-01/05/06 in the commit that landed it. Baselining is the honest record of "specified, not yet observable"; claiming coverage from a Tier-3 unit test would not be, since §3.2's declaration channels deliberately read only `tests/conformance` and `tests/e2e`.

The release semantics are unchanged and still blocking: `release.yml` runs `--runtime` with **no** baseline at tag time, so v0.8.0 cannot ship until the file is empty again. The checker's output is the authoritative gap list at any moment (see `docs/cicd-workflows.md` for which job means what).

### 3.4 Why declaration ≠ vacuous claiming

A declared rule could still be *weakly* tested (the ID is on a case that only brushes the rule). Three structural mitigations: fixture cases assert full expected trees and exhaustive diagnostics, so a fixture cannot assert "nothing" — there is no weak form of tree equality under the §2 comparator; the manifests carry `ruleNotes` naming which *branch* of a rule each case pins, and branch gaps found in review become new landmine cases (cheap: a directory and a manifest entry); and the two-sided landmine convention — every behavior has a firing case *and* an adjacent builds-clean case (`include-depth-10`/`-11`, `collision-pretty-landing`/`-noflag`, `working-format`/`-strict`) — kills tests that pass by matching everything.

---

## 4. The metric replacement

**The release metric is the conformance ledger, not coverage**: *every gated rule in `rules.tsv` recorded green, by tests that ran, against the real CLI, in this run* — plus the tree-exactness and exhaustive-diagnostic discipline that makes those recordings meaningful. This number has the property coverage lacked: it cannot be raised by executing more lines, deleting wiring (M4), or weakening assertions (M2); it can only be raised by making a spec rule demonstrably true.

**What replaces the dead-code blindness**: a reachability check — every file under `src/` must be reachable in the import graph from `src/cli.js`, or the build fails (`bun build --target=bun src/cli.js` + tree walk; release gate G8). `layout-resolver.js` — 464 lines, 412 commented, zero importers, invisible to coverage — becomes structurally impossible to ship.

**What coverage is still for**: a *diagnostic*, reported on every CI run, never a gate, never quoted in the README. Two legitimate uses: (a) inside a new core module during development, un-hit branches are cheap hints of missing landmines — the response is a new fixture, not a new unit test; (b) a *sudden drop* on a PR is a code-review signal that new code has no behavioral consequence the suite can see. Both uses feed Tier 1; neither blocks or green-lights anything. No threshold number exists in this strategy on purpose: any threshold reinstates the incentive that produced `html-processor-coverage.test.js`.

---

## 5. Anti-regression rules for the suite itself

Enforced by `tests/conformance/check-suite-hygiene.mjs` (in CI as gate G9), which greps behavior-test sources (`tests/conformance/**`, `tests/e2e/**`); each rule is the countermeasure to a v0.6 mechanism from §1:

- **H1 — No mocks in behavior tests.** `mock(`/`spyOn(`/`jest.fn` fail the gate there. Behavior tests exercise the real CLI on a real filesystem in a temp dir. (Counters M1. Unit tests under `tests/unit/` may mock freely — they have no authority to protect.)
- **H2 — No warn-instead-of-fail.** `console.warn` and commented-out expectations (`// expect(`) fail the gate — the literal pattern of fixtures-integration line 375. A behavior test has exactly two outcomes. (Counters M2.)
- **H3 — No `src/**` imports in behavior tests.** Behavior tests spawn the CLI; the harness holds the one entrypoint path. Internal imports are how function-level green detaches from product truth. (Counters M1/M3.)
- **H4 — No skipped tests holding rule declarations.** A file that both `test.skip`s and `covers()` fails the gate; the runtime ledger already un-credits skipped tests, this makes the intent unmissable at review time. (Counters M2's "temporarily disabled" gateway.)
- **H5 — No ad-hoc normalization.** All tree comparison goes through the single harness comparator (`tests/conformance/compare.mjs`), whose only normalization is the §2 contract — whitespace-only text nodes outside `<pre>`/`<textarea>`/`<script>`/`<style>`. `normalizeHtml`/`replace(/\s+/g` anywhere else in a behavior test fails the gate: v0.6 collapsed *all* whitespace, per test, wherever convenient. Narrow and stated, or nothing. (Counters M5.)

Process rules that cannot be fully mechanized, stated as review law with their partial mechanizations:

- **A bug fix arrives with its fixture.** The fixture must fail on the pre-fix commit and pass after. CI cannot verify the "fails before" half automatically; the PR template requires the fixture path and the reviewer checks it by `git stash`-ing the fix locally. What CI *does* verify: the fix PR touches `tests/fixtures/landmines/**` or `tests/conformance/**` whenever it touches `src/**` composition code (a path-based check; override requires the literal PR label `no-fixture-needed`, which is greppable and auditable).
- **Tests are never edited to match observed output.** When a fixture and the implementation disagree, the resolution order is: (1) the conformance spec is consulted; (2) if the spec agrees with the fixture, the implementation changes; (3) if the spec is ambiguous or wrong, the **spec** is amended first (with its sync-checked inventory row), and the fixture follows the amendment commit. An expected-tree edit in the same PR as an engine change is the highest-scrutiny diff in this repository — it is exactly how M2/M3 started.
- **Fixture-generation scripts are forbidden from reading build output.** Expected trees are written by humans reasoning from the spec (or transcribed verbatim from it), never captured from a run — a captured expectation is M3 with better tooling. (One-time exception during Phase 2 bring-up: a `--bless` mode may *propose* trees for human line-by-line review, but a blessed tree lands in the same commit as reviewer sign-off in the PR description, and `--bless` is deleted at Phase 3.)

---

## 6. Release gates for v0.7.0

The release ships when a clean CI run on the release commit satisfies **all** of the following. Each is a command with an exit code; no gate is a judgment call:

| # | Gate | Check |
|---|---|---|
| G1 | Suite green | `bun test` exits 0 (includes Tiers 0–3; every behavior test under its hard timeout) |
| G2 | Traceability | `check-traceability.mjs --runtime .conformance-ledger.jsonl` exits 0: every gated rule recorded by passing tests; zero unknown IDs; spec↔inventory sync clean |
| G3 | Kitchen sink | all four kitchen-sink profiles tree-exact (§2 comparator) / publish-state-exact |
| G4 | Landmines | every declared diagnostic fires with declared severity/location; zero undeclared diagnostics suite-wide; both publish-block sentinels byte-untouched |
| G5 | Golden path | all five `init` templates: scaffold → `build --dry-run --strict` exit 0 → `build` → reference-clean output; dev smoke passes |
| G6 | Determinism | two consecutive builds of kitchen-sink: identical output trees, identical stdout bytes, identical stderr bytes |
| G7 | Watch equivalence | scripted edit sequence under `watch` yields a tree byte-identical to a fresh `build`; a no-op save rewrites nothing (mtime check) |
| G8 | No dead modules | `check-module-graph.mjs` exits 0: every `src/**` file reachable from `src/cli.js` in the static import graph |
| G9 | Suite hygiene | `check-suite-hygiene.mjs` exits 0 |
| G10 | Docs lockstep | `docs/authoring-rules.md` ≤ 60 lines and byte-embedded in README (product-spec §7, item 5) |
| G11 | Binary parity | the compiled Linux x86_64 binary passes the Tier-0 golden path; Linux ARM64 and macOS x86_64/ARM64 release binaries build successfully (parity runs where runners exist) |

Coverage is reported alongside the gates for the record. It gates nothing.

---

## 7. Spec bugs and pinned readings found while building the fixtures

Writing exact expectations is the strongest spec review that exists. Filed here rather than papered over; each needed a spec amendment (with its inventory row updated in the same commit, which the sync check enforces). **All are now closed** — the entries below record each ruling and the fixture that pins it:

- **B1 — RESOLVED (2026-08-12): slots do not nest.** The original bug: §7.1 made every body slot a sink, including one nested in another slot's fallback, and §7.3's outermost-first processing destroyed the inner slot when the outer was filled — silently stranding its fills, a content-loss-law violation. The amendment forbids the construct instead of defining the recursive case: a `<slot>` inside another slot's fallback is now problem **P16** (§7.1), located at the layout. Landmine `slot-in-filled-fallback` pins the diagnostic.
- **B2 — RESOLVED (2026-08-12): Markdown converts first; includes resolve on the converted HTML.** The two stated orders (§2 step 2's pre-parse inlining vs §10.1's pass-through-then-resolve) are now one: §2 carves out `.md` pages, and §10.1 owns the timing. Post-conversion resolution won for two reasons pre-conversion inlining could not survive: fragment contents are spliced verbatim in every host (never re-parsed as Markdown, so no blank-line/indentation mangling and no double-converted `.md` targets), and include syntax inside a code fence is escaped to text — under the §2 order a Markdown page could never document `<include>` itself. The CommonMark interaction is stated normatively, with one converter extension so the taught paired form works: a line-initial `<include` starts an HTML block (as if on the type-6 tag list), so block fragments splice clean instead of landing inside a `<p>`. Landmine `md-include-element` upgraded from invariant-only to an exact tree pinning all three placements (line-initial block, in-paragraph inline, code-fenced text).
- **B3 — RESOLVED (2026-08-12): §11.3 now has one scope for both forms, and full-URL absolutization is origin + path prefix.** The path part applies to og:/twitter: meta content exactly as to `href`/`src`/`srcset`/`poster` — one list — and the full-URL form is defined as that path rule plus origin prepending, so the og:image-loses-the-subpath bug is unrepresentable: `https://host/repo/assets/x.jpg`, never `https://host/assets/x.jpg`. §12 stripping was extended to the full base so absolutized values stay reference-checked rather than masquerading as external. New landmine `base-url-subpath` pins the exact combination the kitchen sink deliberately avoided; kitchen-sink `pretty-base` now expects `/coffee/assets/beans.jpg`.
- **B4 — RESOLVED (2026-08-12): a layout-less Markdown page emits inside a minimal synthesized shell (§10.7).** Fragment-only output lost: no doctype means quirks mode, and the synthesized head elements had nowhere to land — both against §1's every-page-is-real-HTML stance. The shell is defined exactly (doctype; `<html>` with frontmatter `lang`/`dir`; `<head>` with charset first, then title when one exists, then metas in source order; `<body>` with frontmatter `class`; nothing else synthesized). Landmine `layout-none-md` upgraded from contains-level to the §10.7 fixture verbatim, tree-exact.
- **B5 — RESOLVED (2026-08-12): style-attribute `url()` is inside §12's check scope.** Rewriting stays exempt (§11.1, deliberate); checking is not rewriting, and the spec now says so — the exemption is about not editing the author's CSS, not about not reading it. Two-sided landmines: `style-url-not-rewritten` (byte-untouched *and* checked, clean) / new `style-attr-url-broken` (fires P13, blocks publish).
- **B6 — RESOLVED (2026-08-12): §10.2 defines value serialization.** Plain scalars serialize as their source text — `true`, `2026-01-01`, `0.50` as written, no YAML type coercion; quoted scalars as their unquoted content; block scalars as the string YAML defines; empty values as `""`; lists compose with blocks. What has no text form — a mapping below a block, a non-scalar list item — is new problem **P17**, located at the key: frontmatter flattens exactly one level, and inventing a serialization or dropping the value would each be silent. `frontmatter-junk-keys` extended (quoted/trailing-zero/empty branches, exact tree); new landmine `frontmatter-deep-nest` fires P17.
- **B7 — RESOLVED (2026-08-12): EXC-11's predicate is the CLI's own source-root fall-through.** The notice fires exactly when the source root **defaulted to the working directory** — no `--source` flag, no `unify.yaml` `source` key, no `src/` — a fact argument resolution already holds; no marker files, no heuristics (§4.3 intact). An explicit `--source`, even `.`, suppresses it. It is stdout summary text, never a diagnostic (the advisory catalogue stays untouched and a correct flat site still builds `--strict`-clean); its two facts — the copied-file count and the `--dry-run` pointer — are contract. Runtime landmines `defaulted-source-notice` / `explicit-source-suppresses-notice` pin both sides; EXC-11 leaves the gap baseline.
- **Pinned readings — all four PROMOTED to spec text (2026-08-12)**, so they are no longer interpretations: **R1** → §6.3 says outright that "anywhere in any source file" includes excluded files (build material is scanned; only the never-shipped list escapes). **R2** → §5.1 states the depth cap is inclusive: the stack holds ten files, the include pushing an eleventh is the problem — 10 builds, 11 fails, both fixtured. **R3** → §14.1 fixes attribution as contract: cycle/depth at the outermost include site, collisions at the path-ordered first source, references at the provenance file (new rule DIA-11, declared by the pinning landmines). **R4** → §7.2 states the first-`<main>` unwrap applies at any depth, exactly once — with the stated reason (top-level-only would ship `<main>`-in-`<main>` for the common wrapper pattern). None proved wrong under promotion; the existing fixtures stand unchanged.

---

## 8. What this strategy does not cover, said plainly

Performance (no perf gates until real sites are slow — a product non-goal), fuzzing (a future property harness — "random tree in, law holds" — would strengthen MRG-18 beyond fixtures; not required for v0.7.0), Windows/macOS binary behavioral parity beyond the smoke run (G11 runs the full golden path on Linux only until CI runners exist for the rest), and browser-preview parity for the post-MVP polyfill (its "build and polyfill must agree" check belongs to the polyfill's own milestone).

It also does not test whether the **documentation** is any good. Every tier here checks that the engine implements the spec; none of them checks that a person handed `docs/authoring-rules.md` can build a site from it. That is a different experiment with a different failure mode — a rule can be correctly implemented, correctly specified, and still worded so that nobody follows it — and it has its own procedure in **`docs/ratification-protocol.md`**: agents author from the rules alone in isolation, and each failure is triaged into documentation, specification, implementation, or outlier. Two spec defects in this document's own catalogue were found that way, both because several independent samples made the identical "mistake" and the spec turned out to be the thing that was wrong.
