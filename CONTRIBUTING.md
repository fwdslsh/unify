# Contributing to unify

unify is a static site generator for HTML-native composition. The v0.7.0 specification set in [`docs/`](docs/) is authoritative and `src/` implements it — **learn the product from those documents first.** When a document and the code disagree, that is a defect to report, never a license to reinterpret either. ([`docs/migration-plan.md`](docs/migration-plan.md) records how the v0.6 tree became this one.)

## Setup

```bash
git clone https://github.com/fwdslsh/unify
cd unify
bun install
bun test
```

Bun >= 1.2.0 is the only supported runtime. There are no Node or Deno builds, no lint or format step, and no docs generator. The only other scripts are `bun run build:linux`, `build:macos`, and `build:windows`, which compile the standalone binary.

Run the CLI straight from source:

```bash
bun src/cli.js build --source src --output dist
```

## Read these first

| Document | What it decides |
|---|---|
| [`docs/product-spec.md`](docs/product-spec.md) | The product contract: what unify is, the composition model, the complete CLI, the non-goals. |
| [`docs/conformance-spec.md`](docs/conformance-spec.md) | The normative implementer reference: exact algorithms, the head-merge table, the closed problem and advisory catalogues, and the worked examples that are the fixtures. |
| [`docs/cli-reference.md`](docs/cli-reference.md) | Every command, option, and exit code. **There are no others.** |
| [`docs/authoring-rules.md`](docs/authoring-rules.md) | The complete authoring surface in under sixty lines. |
| [`docs/testing-strategy.md`](docs/testing-strategy.md) | What "implemented" means as a machine-checkable claim, and the release gates. |
| [`docs/migration-plan.md`](docs/migration-plan.md) | The phased path from the v0.6 codebase and suite to v0.7.0. |

Two rules follow from that set:

- **A document contradiction is a defect to report, never a license to reinterpret either document.** The specs are written to agree.
- **`docs/authoring-rules.md` is embedded byte-identically in `README.md`** (release gate G10). Edit the file; never the copy in the README.

## How tests are organized

Read [`docs/testing-strategy.md`](docs/testing-strategy.md) §1 before writing a test. It is the root-cause analysis of why v0.6 shipped 93% coverage on a product whose `init` command exited 1 and whose builds silently deleted page content. Every rule below is a countermeasure to a specific mechanism named there.

Tiers are numbered by authority. **When two tiers disagree, the lower number wins and the higher tier is what gets fixed.**

- **Tier 0 — golden path E2E.** Drives the installed entrypoint as a user would: subprocess spawns, real temp directories, a hard timeout on every invocation, no imports from `src/**`.
- **Tier 1 — conformance fixtures.** The heart of the suite. A fixture case is a source tree, flags, and a declared outcome: expected output tree, exhaustive expected diagnostics, expected exit code, expected publish state. A generic harness iterates the manifests, so **there is no per-case test code to weaken.**
- **Tier 2 — engine-contract tests.** Still through the CLI, still mock-free, for contracts a static fixture cannot express (transactional publish, watch coalescing, dev-server injection scoping, exit-code taxonomy, determinism).
- **Tier 3 — unit tests.** Developer scaffolding on pure internals. They may mock freely and they carry **zero conformance authority**: they cannot declare rule coverage, they do not gate release, and when a unit test disagrees with a fixture the unit test is wrong by definition.

## The gates you must satisfy

Both run today and both exit non-zero on failure:

```bash
bun tests/conformance/check-traceability.mjs --static
bun tests/conformance/check-suite-hygiene.mjs
```

**Traceability.** `tests/conformance/rules.tsv` is the rule inventory — one row per normative claim in the conformance spec, IDs stable and never reused. A test declares the rules it covers either through a fixture manifest's `"rules"` array or a `covers("WCH-02", …)` call in a targeted/E2E test. The checker unions the declarations and diffs them against the inventory; an undeclared gated rule fails, and so does a declared ID that is not in the inventory. **The checker's output is the authoritative gap list at any moment — do not re-derive it by reading test names.**

**Suite hygiene**, enforced over behavior tests:

- **H1** — no mocks. Behavior tests exercise the real CLI on a real filesystem in a temp directory.
- **H2** — no warn-instead-of-fail. `console.warn` and commented-out expectations fail the gate. A behavior test has exactly two outcomes.
- **H3** — no `src/**` imports in behavior tests. They spawn the CLI.
- **H4** — no skipped test may hold a rule declaration.
- **H5** — no ad-hoc normalization. All tree comparison goes through the single harness comparator, whose only normalization is the whitespace waiver the conformance spec itself declares non-normative.

## Contribution rules

**A bug fix arrives with its fixture.** The fixture must fail on the pre-fix commit and pass after. CI cannot verify the "fails before" half — name the fixture path in the PR description so a reviewer can `git stash` the fix and check it. CI does verify that a PR touching composition code under `src/**` also touches the fixture or conformance directories; the override is the literal PR label `no-fixture-needed`, which is greppable and auditable.

**Tests are never edited to match observed output.** When a fixture and the implementation disagree, the resolution order is:

1. Consult the conformance spec.
2. If the spec agrees with the fixture, **the implementation changes.**
3. If the spec is ambiguous or wrong, **the spec is amended first** — with its inventory row updated in the same commit — and the fixture follows the amendment.

An expected-tree edit in the same PR as an engine change is the highest-scrutiny diff in this repository. It is exactly how the v0.6 failure started.

**Expected trees are written by humans reasoning from the spec, never captured from a run.** A captured expectation ratifies whatever the code currently does, which is the bug this suite exists to prevent.

**A PR touching `docs/conformance-spec.md` must touch `tests/conformance/rules.tsv` in the same commit, or say why in the description.** This is the one non-automated step, named honestly.

**Tests that assert retired behavior are deleted with their modules, not fixed.** They are not failures to repair. The retired surface: `data-unify`, `unify-*` area classes, component mode, `<template data-slot>`, landmark and ordered-fill matching, `<style data-unify-docs>` blocks, U001–U008 rule codes, `--fail-on`, the security scanner, the glob pipeline, incremental builds and the build cache, `--minify`, `--host`, `--log-level`, short-name layout resolution, layout chaining, and the `serve` command. `docs/migration-plan.md` §2 carries the per-file disposition.

**Do not add features.** If a capability cannot be expressed with the four primitives — `<include src>`, layouts, slots, underscore exclusion — it does not belong in unify. The non-goals in `docs/product-spec.md` §5 are decisions with stated reasoning and accepted costs, not gaps. §6 is the post-MVP candidate list; it is the roadmap.

## About coverage

**Coverage gates nothing and no threshold exists in this project on purpose.** It measures lines entered, not output verified: a test that calls a function and asserts the result is an object covers every line of a wrong answer, and deleting a feature's wiring *raises* the number. That is not a hypothetical — it is the measured history in `docs/testing-strategy.md` §1.

Coverage is still collected and published as a CI diagnostic, with exactly two legitimate uses: un-hit branches inside a new core module are cheap hints of a missing fixture (the response is a new fixture, never a new unit test), and a sudden drop on a PR is a review signal that new code has no behavioral consequence the suite can see. **No PR may cite a coverage percentage as evidence of quality in either direction.**

The release metric is the conformance ledger: every gated rule recorded green, by tests that ran, against the real CLI, in that run. It cannot be raised by executing more lines or weakening assertions — only by making a spec rule demonstrably true.

## Pull requests

1. Branch from `main`.
2. Keep changes small and focused; split large ones.
3. Include the fixture, and name its path in the description.
4. Run `bun test`, both gate scripts above, and confirm the CLI surface is still exactly what `docs/cli-reference.md` lists — a surviving retired flag is a finding, not a feature.
5. Describe what changed and which rule IDs it affects.

Release gates G1–G11 in `docs/testing-strategy.md` §6 define when v0.7.0 ships. Each is a command with an exit code; none is a judgment call. **CI is green and must stay green** — every gate is a command with an exit code, and a red run is a regression, never progress.

## Reporting issues

Include the unify version (`unify --version`), the Bun version (`bun --version`), your OS, a minimal source tree that reproduces the problem, the exact command, and the full diagnostics. Silent failure is a bug by definition — if unify did the wrong thing without saying so, say that explicitly; it is the highest-priority class of bug in this project.

## License

Contributions are made under [CC-BY-4.0](LICENSE).
