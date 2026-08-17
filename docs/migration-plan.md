# unify — Test-Suite and Codebase Migration Plan (v0.6 → v0.7.0)

**Status**: v0.7.0, normative for the migration
**Role**: The path from the current 240-file `tests/` tree and the v0.6 codebase to the suite defined in `docs/testing-strategy.md`. Structured so that at no point can the pipeline report green while the golden path is broken — the inversion v0.6 lived in. Companion documents: `docs/testing-strategy.md` (the destination), `CLAUDE.md` (implementation map), `_notes/unbiased-design-synthesis.md` §7 (migration reality).

---

## 1. The one structural decision everything else follows from

**From the first commit of this migration, "green" is redefined.** The CI pipeline's release signal becomes a single final job:

```
bun test && bun tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl
```

That job is red until every one of the 190 gated rules in `tests/conformance/rules.tsv` is recorded by a passing test — and the golden-path rules (SCF-01..04, DIA-10) are gated rules like any other. Therefore *the suite cannot be green while `unify init && unify dev` is broken*, structurally: green is defined as a superset of the golden path working. The v0.6 inversion (green badge, broken product) becomes unrepresentable rather than merely discouraged.

The corollary is that the badge stays **red for the whole migration**. That is the honest state of a product being rewritten, and this plan reports progress as the ledger count (`covered/190`) instead of pretending with a partial-green pipeline. Intermediate phase gates below are separate CI jobs that measure progress; none of them is the release signal.

---

## 2. Disposition of the existing suite

Current inventory, measured on this tree: **62 test files** (in 240 files total under `tests/` — the rest are fixtures and helpers), **9 legacy fixture directories**, **3 helper modules**.

### 2.1 The classification rule (mechanical first, judgment second)

A test file **dies with its module** — deleted, never fixed — when any of:

- **(a)** its subject module is on the CLAUDE.md deleted list (`html-processor`, `src/core/cascade/*`, `dom-cascade-linter`, `security-scanner`, `glob-pattern-processor`, `incremental-builder`, `build-cache`, `dependency-tracker`, `asset-tracker`, `short-name-resolver`, `default-layout-resolver`, `layout-resolver`);
- **(b)** its fixtures or assertions use retired vocabulary — greppable: `data-unify`, `unify-` class tokens, `data-unify-docs`, `<template data-slot`, `u-item-`, `U00[0-9]` rule codes;
- **(c)** it asserts a contract the v0.7.0 spec now contradicts: title-replacement ("Page Title Wins"), build success alongside broken references, `warning`/`error:` severities, `--fail-on`, the `serve` command, incremental/cache behavior, `.gitignore` awareness, area/landmark/ordered-fill matching, component mode;
- **(d)** its name or content marks it as coverage-farming (`*-coverage.test.js`, `*-coverage-gaps.test.js`) — if the underlying module survives, its tests are **re-derived from the spec**, never ported, because their assertions were reverse-engineered from implementation behavior (root-cause M3/M4).

A test is a **candidate to port** only when its subject module is on the CLAUDE.md survives list *and* every behavior it asserts has a `rules.tsv` row it can be re-pointed at. If a behavior has no rule row, the behavior does not exist in v0.7.0 and the assertion dies. The triage happens against the quarantine directory (§3 Phase 0), with this table as the pre-computed answer:

### 2.2 The table

| Disposition | Count | Files |
|---|---|---|
| **Dead with module** (rule a/b) | **37** | all of `tests/unit/core/cascade/` (7); `html-processor-*` (4), `html-rewriter-utils`, `create-element-debug`, `dom-cascade-linter`, `security-scanner-*` (2), `glob-pattern-processor`, `incremental-builder*` (2), `build-cache`, `dependency-tracker`, `asset-tracker`, `short-name-resolver-*` (2), `head-merger-css-order`, `head-content-replacement`, `component-head-merging`, `dry-run-reporter` (asserts v0.6 report shape), `serve-command`, `clean-command` (v0.6 clean semantics), `markdown-dom-cascade`, `asset-path-resolution-fix`, `component-asset-resolution`, `fragment-layout-resolution`, and the fixture-bound integration files for the v0.6 fixture set |
| **Deleted as wrong-contract or superseded** (rule c/d) | **12** | `build-success-validation` (ratifies silent failure — M3 exhibit), `build-failure-reproduction`, `fixtures-integration` (M2 exhibit; replaced by the conformance harness), `error-filepath-integration`, `error-warning-filepath`, `filepath-error-verification`, `errors` (error classes replaced by the problem/advisory reporter), `file-classifier` (classification is now two sentences of spec), `build-command` (constructor-property assertions), `markdown-build-pipeline` (asserts v0.6 md behavior: layoutless pages, injected `og:title`), `markdown-processor-yaml-coverage` (rule d), `layout-logger-coverage-gaps` (rule d) |
| **Rewritten against the spec** (module survives; assertions re-derived, not ported) | **5** | `markdown-processor-integration` + `markdown-processor-validation` (→ Tier-1 fixtures under §10 rules; keep the gray-matter/markdown-it knowledge, discard every expected value), `args-parser` (→ v0.7 CLI surface + exit-2 taxonomy), `watch-command` (→ Tier-2 watch-contract tests through the CLI), `asset-copier` (→ mirror-copy semantics, byte-fidelity assertions) |
| **Genuinely portable** (Tier 3, no authority) | **7** | `path-validator-security-gaps` (46 tests — invisible internal safety, exactly what unit tests are for), `security/path-traversal`, `file-watcher` (scaffolding reused by Tier 2), `logger`, `layout-logger` (trimmed), `helpers/temp-project.js`; `html-minifier` **parks** outside the suite with its module until post-MVP `--minify` |
| **Triage during Phase 2** | **1** | `io/dom-parser` — lives only if the new splice engine actually uses the module; otherwise rule (a) |

**Legacy fixture directories — all 9 deleted** (`alpine`, `area-merging-complex`, `component-scoping`, `contract-documentation`, `default-layout-site`, `full-site`, `head-merging-advanced`, `id-stability-forms`, `landmark-fallback`): every one encodes retired vocabulary, which under v0.7.0 is a **build error by design** (P08) — they are not merely stale, they are anti-fixtures. Their legitimate concerns are already re-expressed in the new sets (third-party attribute survival → kitchen-sink `data-theme` + the `slot-in-template` landmine; head merging → kitchen-sink + FIX-11; layout discovery → kitchen-sink + the layout landmines). The one salvageable *idea* with no v0.7 counterpart yet — an Alpine-flavored "framework attributes survive composition untouched" case — becomes a new landmine during Phase 2, written fresh.

Replacement suite already in place (this branch): `tests/conformance/` (rules.tsv, the harness `harness.test.js` + its comparator `compare.mjs`, 2 gate scripts, 10 spec-fixtures — all thirteen FIX rows realized, three of them as landmines), `tests/fixtures/kitchen-sink/` (3 expected trees, 4 profiles), `tests/fixtures/landmines/` (65 checked-in cases + 6 runtime-generated). Still to write: Tier-2 targeted tests (Phase 3), Tier-0 E2E (Phase 4).

---

## 3. Phases

Each phase ends at a **gate**: commands with exit codes, run in CI. A phase is not done until its gate is green, and later phases assume earlier gates stay green (they run in every CI job from then on).

### Phase 0 — Authority inversion (no engine work; ~1 day)

1. Switch CI to the new pipeline: the release job defined in §1 (red, by design), plus `check-suite-hygiene.mjs` and `check-traceability.mjs --static` as always-on jobs.
2. `git mv tests/unit tests/integration tests/helpers tests/legacy-v0.6/` and drop them from CI. The old suite stops voting the moment the new authority exists — its green was load-bearing for nothing except morale.
3. Write the conformance harness (`tests/conformance/harness.test.js`): reads the three manifests, spawns the CLI per case/profile with a hard 30s timeout, byte-compares trees bidirectionally, parses diagnostics on the stable prefix, enforces `diagnosticsExhaustive`, seeds/asserts publish sentinels, appends to the runtime ledger, exports `covers()`. Every case will FAIL against the v0.6 engine — correct and desired: the harness lands proving it can detect the broken product the old suite blessed.
4. Retire the coverage badge and the "93%" claims from README/CLAUDE.md (that number measured execution of code that is about to be deleted).

**Gate P0**: hygiene green; `--static` traceability reports 193 rules / 171 declared / 20 named gaps (the committed baseline `tests/conformance/phase-gaps/baseline.txt` — the checker output must `diff` clean against it); harness runs and fails against the v0.6 engine (expected-fail recorded, proving detection); old suite out of CI.

### Phase 1 — Deletion and the CLI skeleton (~2–3 days)

1. Delete the dead modules (~8,000 of ~14,700 source lines: `html-processor.js` 2047, `incremental-builder.js` 1021, `glob-pattern-processor.js` 684, `security-scanner.js` 640, `asset-tracker.js` 615, `html-rewriter-utils.js` 610, cascade/* , linter, cache, trackers, the three dead resolvers) and the 49 delete-listed test files; park `html-minifier`.
2. New CLI skeleton: v0.7 argument surface exactly (`build|dev|watch|init`, the eight options), exit taxonomy 0/1/2, the diagnostics reporter (stderr, path-then-line ordering, stable prefix), `unify.yaml` loading (flags-mirror only).
3. Port the Tier-3 keepers into `tests/unit/` fresh (path-validator, traversal, logger, watcher scaffolding).

**Gate P1**: `grep -rE 'data-unify|unify-[a-z]' src/ tests/ --exclude-dir=legacy-v0.6 --exclude-dir=fixtures` returns only the landmine fixtures that *test* the migration errors; G8 reachability green on the reduced tree (no orphan module ships again); DIA-04 targeted tests green (unknown flag → 2, missing source → 2); the harness still red on everything else (composition doesn't exist yet).

### Phase 2 — The composition core (~1–2 weeks)

Implement includes (harvest `ssi-processor.js` path resolution), layout resolution (no chaining — a layout declaring `data-layout` is P15), the splice engine (S01–S12, behavioral form), the slot/main merge, head merge (harvest dedup keys from `head-merger.js`, discard its title logic), root attributes, Markdown (§10, trimmed keys + heading ids + `<h1>` fallback). All thirteen FIX rows are already realized (ten checked-in transcriptions; FIX-06/FIX-10/FIX-14 as the landmines `misaddressed-fill`/`slot-in-template`/`layout-declares-layout`); this phase validates them against the running engine, applying strategy §5's resolution order to any divergence. Add the Alpine-attribute landmine.

**Gate P2**: all 13 FIX rows green; kitchen-sink **default** profile green (tree-exact per the strategy §2 comparator); every landmine in the composition families (INC/LAY/MRG/HED/ATT/MD/S; problems P01–P11 + P15–P17; advisories A01–A08 + A13) green; traceability `--static` gap list shrinks to exactly `phase-gaps/phase2.txt` (URL/REF/COL/PUB/DRY/CFG/WCH/SCF families only).

### Phase 3 — The engine contract (~1 week)

URL provenance rewriting, `--pretty-urls`, `--base-url`, the reference check, collision detection, transactional publish + `--clean` containment, `--dry-run` reporting. Write the Tier-2 targeted tests: PUB-02/04, DRY-01..03, CFG-01..03, DIA-05/09. (EXC-11 no longer belongs to this phase: spec bug B7 was resolved 2026-08-12 — the predicate is the CLI's own source-root fall-through — and the rule is pinned by the runtime landmines `defaulted-source-notice`/`explicit-source-suppresses-notice`.)

**Gate P3**: kitchen-sink all four profiles green; all checked-in + runtime landmines green; determinism gate G6 green; traceability gaps = exactly `phase-gaps/phase3.txt` (WCH-01..06, SCF-01..04, DIA-10 only).

### Phase 4 — Watch, dev, init, release (~1 week)

`file-watcher.js` harvested under the new contract; `unify dev` (static server + SSE reload, injection scoping); `unify init` rewritten as **offline scaffolding** (the v0.6 init died on a network fetch of a nonexistent repo — templates compile into the binary; the golden path must work on a plane); binaries.

**Gate P4 = the release gates G1–G11** of `docs/testing-strategy.md` §6, verbatim. The ledger reads 190/190; the final CI job goes green for the first time since Phase 0; that green *is* the release condition.

---

## 4. The coverage number during migration

It will crater, in two steps: Phase 1 deletes ~8k lines whose execution the 93% described, and Phases 2–3 add new core code faster than unit tests appear (correctly — the verification lives in fixtures, which bun's per-file coverage does not attribute to `src/**` the way unit tests do).

What that means and what we say: **the number was never evidence and is not evidence now.** The honest progress metric during migration is the ledger fraction (`covered/190`, printed by `check-traceability.mjs` in every CI run) plus the phase-gap diff. Coverage continues to be *collected* and published in CI artifacts as a diagnostic (strategy §4) — useful for spotting un-hit branches in the new core, which are answered with new landmine cases — but: no threshold, no badge, no README mention, and no PR may cite it as evidence of quality in either direction. Anyone asking "what happened to 93%?" gets the true answer: 93% measured how much of a broken product the old suite executed; 190/190 measures how much of the specification the new product satisfies. The first number is gone because the thing it measured is gone.

---

## 5. Standing risks, named

- **Hand-computed expected trees can be wrong.** The kitchen-sink trees were derived by hand from the splice rules before any implementation exists. If Phase 2 finds a divergence, the resolution order of strategy §5 applies (spec first, fixture second, engine third) — and a fixture correction must cite the spec sentence that decides it, in the commit message. The `--bless` affordance exists for Phase 2 bring-up only and dies at Phase 3.
- **The strategy §7 spec-bug set is closed** (B1–B7 resolved, R1–R4 promoted to spec text; all 2026-08-12 — rulings recorded there, each with its pinning fixture). The residual risk is the ordinary one: a future spec amendment reopening an entry without touching its fixture, which the spec↔inventory sync check and the fixture-with-every-fix review law exist to catch.
- **Two people can hold a green ledger wrong** by writing a weak case and declaring a rule on it. The mitigations (byte trees, exhaustive diagnostics, two-sided cases, `ruleNotes` review) reduce this; they do not eliminate it. This is the plan's honest residue: traceability proves presence of verification, and the *quality* of each verification is a review problem forever.
