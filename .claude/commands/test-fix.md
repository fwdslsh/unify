# Test Fix

Resolve failing tests in the unify suite without re-creating the failure mode that produced the previous suite (`docs/testing-strategy.md` §1: a green suite over a broken product).

## Authority order

When something disagrees, this is the order — lower wins, and the higher thing is what changes:

1. `docs/conformance-spec.md` — the normative mechanism: algorithms, the head-merge table, the closed problem/advisory catalogues, the worked examples that are the fixtures.
2. `docs/product-spec.md` — the product contract (what the CLI is, §4; the non-goals, §5).
3. Conformance fixtures (`tests/conformance/**`, `tests/fixtures/**`) — Tier 0/1 behavior.
4. Targeted engine-contract tests — Tier 2.
5. Unit tests — Tier 3, **zero conformance authority**. When a unit test disagrees with a fixture, the unit test is wrong by definition.

`docs/cli-reference.md` is the complete command and flag surface. `docs/testing-strategy.md` is the testing contract: §2 the tiers and the single comparator, §5 the suite's anti-regression rules, §6 the release gates.

## Before fixing anything: is this test still legitimate?

A test that asserts **retired behavior is not a failure to fix — it is deleted with the module it covers**: `data-unify`, `unify-*` area classes, component mode, `<template data-slot>`, landmark/ordered-fill matching, `<style data-unify-docs>` blocks, U001–U008 rule codes, `--fail-on`, the security scanner, the glob pipeline (`--copy`/`--ignore`/`--render`/`--default-layout`), incremental builds and the build cache, `--minify`, `--host`, `--log-level`, short-name layout resolution, layout chaining, and the `serve` command. See `CLAUDE.md` ("Implementation Map") and `docs/migration-plan.md` for the disposition of each module.

Classify every failure first:

- **Cut behavior** → delete the test with its module. Record it; do not "fix" it.
- **Spec-relevant behavior** → fix it under the rules below.
- **Test infrastructure** (timeout, temp dirs, ordering) → fix the harness.

## Resolution procedure

For each failure, in order:

1. **Locate the rule.** Find the governing rule ID in `tests/conformance/rules.tsv` and read that section of the conformance spec. A behavior with no rule is either out of scope or a missing inventory row — say which.
2. **Decide who is wrong** — the implementation or the expectation — *from the spec*, never from observed output.
   - Spec agrees with the test → **change the implementation**.
   - Spec is ambiguous or wrong → **amend the spec first**, with its `rules.tsv` row, and let the fixture follow the amendment. Raise it; do not paper over it.
   - Never edit an expected tree or an assertion to match what the code currently prints. An expected-output edit in the same change as an engine fix is the highest-scrutiny diff in this repository.
3. **Fix, with a fixture.** A bug fix arrives with a case that fails before the fix and passes after (`tests/fixtures/landmines/**` for diagnostics, `tests/conformance/spec-fixtures/**` for worked examples).
4. **Re-verify** the specific case, then the suite.

## Rules that fail the hygiene gate (`tests/conformance/check-suite-hygiene.mjs`)

In behavior tests (`tests/conformance/**`, `tests/e2e/**`): no mocks or spies (H1), no `console.warn` or commented-out expectations (H2), no `src/**` imports — behavior tests spawn the real CLI (H3), no `test.skip` in a file holding `covers()` declarations (H4), and no ad-hoc normalization — all tree comparison goes through `tests/conformance/compare.mjs` (H5).

## Verification

```bash
bun test
bun tests/conformance/check-suite-hygiene.mjs
bun tests/conformance/check-traceability.mjs --static
```

Traceability, not coverage, is the measure: a fix counts when the rule it implements is recorded green by a test that ran against the real CLI (`docs/testing-strategy.md` §4). Coverage percentages are a diagnostic and gate nothing — do not report progress as a coverage delta.

## Report

Per failure: the rule ID, the file, which side was wrong and why (quoting the spec), the fixture that pins it, and — for deleted tests — the retired feature they covered. Working notes go in `_notes/`.
