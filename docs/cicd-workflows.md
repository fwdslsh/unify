# CI/CD workflows

What actually runs, and what each job is allowed to mean. Two workflow files exist: `.github/workflows/test.yml` (every push and PR) and `.github/workflows/release.yml` (tagged releases).

## `test.yml` — three jobs, one of them red on purpose

### `release-signal` — the release condition itself

Runs the conformance suite against the real CLI, then checks the runtime traceability ledger:

```bash
rm -f .conformance-ledger.jsonl
bun test tests/conformance tests/e2e
bun tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl
```

**This job going green *is* the v0.7.0 release condition** — every gated rule in `tests/conformance/rules.tsv` recorded by a test that actually ran and passed in this run. It was red by design for the whole rewrite, and `tests/conformance/phase-gaps/p0-expected-fail.txt` records why a red harness was the correct Phase 0 *pass* condition.

The failure mode to guard against is not this job failing; it is someone making it pass. Do not weaken the harness, the comparator, or the checker to turn it green. Progress is the covered count it prints.

### `suite-hygiene` — gate G9

```bash
bun tests/conformance/check-suite-hygiene.mjs
```

Enforces the anti-rot rules H1–H5 from `docs/testing-strategy.md` §5 — no filesystem mocking in behavior tests, no `src/**` imports in the conformance harness, and the rest of what keeps this suite from decaying into the one it replaced.

### `traceability-static` — the phase gate

```bash
bun tests/conformance/check-traceability.mjs --static --baseline tests/conformance/phase-gaps/baseline.txt
```

Compares the computed gap set against the committed baseline and fails on **any** difference. A new gap fails; so does a gap that closed, until the baseline shrinks in the same commit. `baseline.txt` is now empty — every gated rule is covered — so any regression surfaces immediately.

The static check also enforces spec↔inventory sync: if `docs/conformance-spec.md` gains or loses an enumerable rule (a splice rule, a problem, an advisory, a head-merge row) without `rules.tsv` being updated in the same commit, it exits 1.

## Coverage is reported, and gates nothing

There is no coverage threshold anywhere in CI, deliberately. This project shipped 240 test files at 93% coverage over a CLI that could not scaffold or build a site; `docs/testing-strategy.md` §1 documents the five mechanisms that made that possible. Coverage counts lines executed, not behavior verified, so it is a diagnostic here and never a gate. **No PR should cite a coverage number as evidence.**

## The legacy suite does not vote

`tests/legacy-v0.6/` is excluded from CI by path filter. It tests a product that no longer exists — component mode, area classes, rule codes — and its green was load-bearing for nothing. Tests asserting cut behavior are deleted with their modules rather than fixed; `docs/migration-plan.md` §2 has the rule for telling those apart from tests worth porting.

## `release.yml`

Triggered by GitHub releases: publishes to npm and builds the Docker image (delegating to a shared workflow in `fwdslsh/toolkit`). The release body comes from `.github/workflows/release_notes.md` — that file ships to users on every release, so it is worth reading before tagging.

Before tagging, the eleven release gates in `docs/testing-strategy.md` §6 should be green. `release-signal` covers G1 and G2; the rest — determinism, watch-equivalence, module reachability, the README embed, and the compiled binary walking the golden path — are checkable locally and documented there.
