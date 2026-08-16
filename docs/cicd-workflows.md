# CI/CD workflows

What actually runs, and what each job is allowed to mean. Two workflow files exist: `.github/workflows/test.yml` (every push and PR) and `.github/workflows/release.yml` (tagged releases).

## `test.yml` — three jobs

### `release-signal` — the release condition itself

Runs the whole suite against the real CLI, then checks the runtime traceability ledger:

```bash
rm -f .conformance-ledger.jsonl
bun test
bun tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl
```

**This job going green *is* the v0.7.0 release condition** — every gated rule in `tests/conformance/rules.tsv` recorded by a test that actually ran and passed in this run. It was red by design for the whole rewrite, and `tests/conformance/phase-gaps/p0-expected-fail.txt` records why a red harness was the correct Phase 0 *pass* condition. That phase is over: the ledger is full and the job is green, so a red run is now a regression rather than progress.

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

## The legacy suite is gone

`tests/legacy-v0.6/` was quarantined out of CI for the whole rewrite and has now been deleted, along with the nine v0.6 fixture trees (`component-scoping`, `area-merging-complex`, `landmark-fallback`, and the rest) that no other test read. It tested a product that no longer exists — component mode, area classes, rule codes — and its green was load-bearing for nothing. Tests asserting cut behavior are deleted with their modules rather than fixed; `docs/migration-plan.md` §2 has the rule for telling those apart from tests worth porting. Nothing in the repo is excluded from `bun test` any more, so a red suite on any branch means something is actually broken.

## `release.yml`

Triggered by pushing a `v*` tag (or manual dispatch). Two jobs, both defined in this repo:

**`release`** does everything up to and including npm, in order, on one runner:

1. **Tag must match `package.json`'s version.** `unify --version` reports package.json for the binary and the npm package alike, so a tag that disagrees would ship artifacts that self-report a different version. Checked before anything is built.
2. **The release gates** — `bun test`, suite hygiene, runtime traceability: the same commands `test.yml` runs. A tag can be pushed at any commit, so this is the only thing standing between a red tree and a published release.
3. **Four binaries, one runner.** Bun cross-compiles every target, so there is no build matrix: `unify-linux-x86_64`, `unify-linux-arm64`, `unify-darwin-x86_64`, `unify-darwin-arm64`. **Those names are a contract with `install.sh`**, which downloads `unify-$os-$arch` from the release; renaming one means editing that script in the same commit.
4. **Smoke the linux binary** (gate G11): it reports the right version, then scaffolds and builds a site — `init`, `build --dry-run --strict`, `build`, and `dist/index.html` exists. Only the runner's own architecture can be executed; the other three are built and shipped unrun.
5. **Create the release** with the four binaries attached. The body is a generated install section — the download table is built from the same list the build step uses, so the links cannot drift from the assets — followed by `.github/workflows/release_notes.md` verbatim. That file ships to users on every release, so read it before tagging.
6. **Publish to npm** (`NPM_TOKEN`).

**`docker`** needs `release`, builds `docker/Dockerfile`, and pushes `fwdslsh/unify:<tag>` and `:latest` (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`).

Required secrets, all three checked with a clear error rather than failing obscurely: `NPM_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

**Why it is all in one file.** This workflow used to delegate to four shared workflows in `fwdslsh/toolkit`. The indirection cost more than it saved: the shared release step generated a "Manual Downloads" table for a different tool (`catalog-*` binaries, plus a Windows row unify does not build), so every release page advertised dead links; and the shared build step ran `bun test || echo "No tests configured, skipping..."`, which swallowed failures, so nothing in the release path ever gated on the suite. Both defects were invisible from this repo and unfixable from it. Local, boring, and readable beats shared and remote for a workflow that runs a handful of times a year.

Before tagging, the eleven release gates in `docs/testing-strategy.md` §6 should be green. `test.yml` covers G1 and G2 on every push, and `release.yml` re-runs them plus G11 (the compiled binary walking the golden path) at tag time; the rest — determinism, watch-equivalence, module reachability, the README embed — are checkable locally and documented there.
