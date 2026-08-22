# CI/CD workflows

What actually runs, and what each job is allowed to mean. Two workflow files exist: `.github/workflows/test.yml` (every push and PR) and `.github/workflows/release.yml` (releases and prereleases).

## `test.yml` — five jobs

### `release-signal` — runtime coverage against the phase baseline

Runs the whole suite against the real CLI, then checks the runtime traceability ledger against the committed phase baseline:

```bash
rm -f .conformance-ledger.jsonl
bun test
bun tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl --baseline tests/conformance/phase-gaps/baseline.txt
```

Green means the gap set computed from rules a test **actually ran and passed** equals the baseline exactly: a new uncovered rule fails, and a gap that closed fails until the baseline shrinks in the same commit. It is the runtime twin of `traceability-static`, and it is the job that closes the skipped-test hole — a `test.skip` records nothing, so its rules go uncovered and this fails.

This job checked the *release* condition directly (no `--baseline`, so any gap fails) from the end of the rewrite until the manifest work opened §20's rows. It was baselined again during that phase for the same reason it was during the rewrite: a spec section can be written before any CLI surface exists to observe it, and the honest record of that is a baseline entry rather than a red that people are instructed to ignore — the "warn instead of fail" mechanism `docs/testing-strategy.md` §1 (M2) blames for the suite this one replaced.

The failure mode to guard against is not this job failing; it is someone making it pass. Do not weaken the harness, the comparator, or the checker to turn it green. Progress is the covered count it prints, and the baseline shrinking.

### `release-gate` — the release condition itself

The same commands with **release semantics** — no `--baseline`, so *any* uncovered rule fails:

```bash
rm -f .conformance-ledger.jsonl
bun test
bun tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl
```

**This check going green is the release condition**, and it no longer lives in a separate job: an earlier design used a `continue-on-error` twin, which GitHub reports as SUCCESS either way — green in the checks list, its only signal a log nobody opens. The release semantics are now the `release-signal` job's own final step: while the baseline file is non-empty that step *asserts the unbaselined check fails* (a declared phase, mechanically enforced), and the moment the file empties it runs the same check blocking. The baseline was emptied when §31.1 made the last seven §20 rows observable, so this is a blocking push-time gate again — the state a release requires. `release.yml` runs the identical check blocking at tag time either way.

### `module-graph` — gate G8

```bash
bun tests/conformance/check-module-graph.mjs
```

Every file under `src/**` must be reachable from `src/cli.js` by static `import` specifiers. A module nothing imports is either a cut feature left behind or one written and never wired, and a green suite sees neither: a unit test importing a module directly makes it *covered* without making it *reachable*. Static analysis only, so the gate never executes CLI code and cannot be satisfied by a dynamic import written to fool it. One caveat worth knowing: only extension-bearing relative specifiers resolve, so an extensionless or computed import would read as a dead module.

### `suite-hygiene` — gate G9

```bash
bun tests/conformance/check-suite-hygiene.mjs
```

Enforces the anti-rot rules H1–H5 from `docs/testing-strategy.md` §5 — no filesystem mocking in behavior tests, no `src/**` imports in the conformance harness, and the rest of what keeps this suite from decaying into the one it replaced.

### `traceability-static` — the phase gate

```bash
bun tests/conformance/check-traceability.mjs --static --baseline tests/conformance/phase-gaps/baseline.txt
```

Compares the computed gap set against the committed baseline and fails on **any** difference. A new gap fails; so does a gap that closed, until the baseline shrinks in the same commit. While non-empty, `baseline.txt` holds the manifest rows that no CLI surface can yet observe (`docs/conformance-spec.md` §20); each is closed by the consumer that makes its field observable, and the file is empty again before a release ships.

The static check also enforces spec↔inventory sync: if `docs/conformance-spec.md` gains or loses an enumerable rule (a splice rule, a problem, an advisory, a head-merge row) without `rules.tsv` being updated in the same commit, it exits 1.

## Coverage is reported, and gates nothing

There is no coverage threshold anywhere in CI, deliberately. This project shipped 240 test files at 93% coverage over a CLI that could not scaffold or build a site; `docs/testing-strategy.md` §1 documents the five mechanisms that made that possible. Coverage counts lines executed, not behavior verified, so it is a diagnostic here and never a gate. **No PR should cite a coverage number as evidence.**

## The legacy suite is gone

The legacy test tree was quarantined out of CI for the whole rewrite and has now been deleted, along with the nine legacy fixture trees (`component-scoping`, `area-merging-complex`, `landmark-fallback`, and the rest) that no other test read. It tested a product that no longer exists — component mode, area classes, rule codes — and its green was load-bearing for nothing. Tests asserting cut behavior are deleted with their modules rather than fixed; `docs/migration-plan.md` §2 has the rule for telling those apart from tests worth porting. Nothing in the repo is excluded from `bun test` any more, so a red suite on any branch means something is actually broken.

## `release.yml`

Two ways in, and two jobs, all defined in this repo:

- **push a `v*` tag** — `v1.2.3`, or `v1.2.3-rc.1` from a release branch;
- **run it manually** from any branch (Actions → Release → Run workflow). The tag defaults to `v` + the version in `package.json`, and `gh release create --target` creates it at that commit — which is how a release branch cuts a prerelease without tagging first.

**Prereleases are decided by the version, never by the route.** A version with a hyphen (`1.2.3-rc.1`) is a semver prerelease, so: the GitHub release is marked pre-release, npm publishes under the `next` dist-tag, and `fwdslsh/unify:latest` is left pointing at the last stable image. `npm install -g @fwdslsh/unify` and `install.sh` keep resolving to stable; `@fwdslsh/unify@next` opts in. Cutting an rc is therefore: bump `package.json` to the `-rc.1` version on the release branch, dispatch, done.

**`release`** does everything up to and including npm, in order, on one runner:

1. **Tag must match `package.json`'s version.** `unify --version` reports package.json for the binary and the npm package alike, so a tag that disagrees would ship artifacts that self-report a different version. package.json is the single source of truth; the tag may only agree with it. Checked before anything is built.
2. **The release gates** — `bun test`, suite hygiene, runtime traceability: the same commands `test.yml` runs. A tag can be pushed at any commit, so this is the only thing standing between a red tree and a published release.
3. **Four binaries, one runner.** Bun cross-compiles every target, so there is no build matrix: `unify-linux-x86_64`, `unify-linux-arm64`, `unify-darwin-x86_64`, `unify-darwin-arm64`. **Those names are a contract with `install.sh`**, which downloads `unify-$os-$arch` from the release; renaming one means editing that script in the same commit.
4. **Smoke the linux binary** (gate G11): it reports the right version, then scaffolds and builds a site — `init`, `build --dry-run --strict`, `build`, and `dist/index.html` exists. Only the runner's own architecture can be executed; the other three are built and shipped unrun.
5. **Create the release** with the four binaries attached. The body is a generated install section — the download table is built from the same list the build step uses, so the links cannot drift from the assets — followed by `.github/workflows/release_notes.md` verbatim. That file ships to users on every release, so read it before tagging.
6. **Publish to npm** — under the `next` dist-tag for a prerelease, `latest` otherwise.

   No npm token is involved. The job publishes with **trusted publishing**: npm mints a short-lived credential from the workflow's OIDC identity, so there is nothing to store or rotate, and provenance is attached automatically. It needs three things, and fails plainly without them: `id-token: write` on the workflow (set), npm >= 11.5.1 (the step upgrades npm first — GitHub runners still ship 10.x), and the package configured on npmjs.com under **Settings → Trusted Publisher** with this repository and `release.yml` as the workflow filename. That last one is a one-time setup on npm's side; until it exists, publishing fails with an authorization error rather than falling back to anything.

**`docker`** needs `release`, builds `docker/Dockerfile`, and pushes `fwdslsh/unify:<tag>` — plus `:latest` for a stable release only, so a prerelease never moves the tag `docker pull fwdslsh/unify` resolves to.

Required secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`, both checked with a named error rather than failing obscurely mid-push. npm needs none.

**Why it is all in one file.** This workflow used to delegate to four shared workflows in `fwdslsh/toolkit`. The indirection cost more than it saved: the shared release step generated a "Manual Downloads" table for a different tool (`catalog-*` binaries, plus a Windows row unify does not build), so every release page advertised dead links; and the shared build step ran `bun test || echo "No tests configured, skipping..."`, which swallowed failures, so nothing in the release path ever gated on the suite. Both defects were invisible from this repo and unfixable from it. Local, boring, and readable beats shared and remote for a workflow that runs a handful of times a year.

Before tagging, the eleven release gates in `docs/testing-strategy.md` §6 should be green. `test.yml` covers G1, G2, G8, and G9 on every push, and `release.yml` re-runs them plus G11 (the compiled binary walking the golden path) at tag time; the rest — determinism, watch-equivalence, the README embed — are checkable locally and documented there.
