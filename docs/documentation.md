---
description: "Keep documentation corrections current while making released and unreleased behavior clear."
---

# Maintaining the documentation

The published guides describe the exact released Unify version in
`docs/.runtime-version`. The site shows that version separately from its **docs
revision** (the Git commit). A correction can therefore publish from `main`
without a CLI release. Do not move a release tag or republish an npm version to
correct documentation; old tags remain historical snapshots.

## One convention

- **Released guidance:** the existing guides and CLI reference. Keep their
  examples usable with the pinned release, even when the checkout has new code.
- **Unreleased guidance:** `docs/unreleased/<topic>.md`. Start it with
  `> **Unreleased:** Requires an unreleased Unify build; not available in the released version.`
  The site also adds an Unreleased warning automatically to that directory.
  Link here when discussing pending behavior instead of adding it to stable instructions.
- **Development references:** the product and conformance specifications describe
  the checkout's contract. Mark new behavior **Unreleased** until it ships; these
  references are visibly distinguished from instructions for the released CLI.

There is one source tree, no copied stable/next manuals and no documentation branch.
The release pin is independent of `package.json`: development code may advance while
the published guide continues to describe an available release.

## Check and publish

After `bun install`, with Bun, Node >= 22.12, npm and Git available, run:

```sh
bun scripts/check-docs.mjs
```

This installs exactly `@fwdslsh/unify@<docs/.runtime-version>` in a disposable
directory, verifies the installed CLI's version, runs the existing documentation
example tests against it, and checks the documentation site and its five live
example galleries. It does not change the repository's dependencies or lockfile.
An unavailable version or incompatible example fails the command; there is no
fallback to the checkout CLI. Internet access to npm is required.

CI runs the command on pushes and PRs. Pages uses the same command with `--build`
to render its artifact with that same released CLI; nothing deploys if the checks
fail. `SITE_BASE_URL` optionally supplies the deployment address.

The selected suites are listed in `scripts/check-docs.mjs`. Add a stable guide's
literal tests there when adding a new suite; keep unreleased API tests in the normal
checkout suite until promotion. These checks establish the tested examples'
compatibility, not the truth of every prose sentence or independent author learnability.
The full `bun test` suite continues to test the checkout CLI.

## The three maintenance tasks

1. **Correct existing guidance:** edit its source and affected literal tests, run
   the check, and merge. Leave the release pin alone. The docs revision changes
   automatically when Pages publishes.
2. **Document a pending feature:** put user instructions under `docs/unreleased/`,
   with the callout above and any explicit development-install instructions. Update
   specifications and checkout tests with the feature, marking its unreleased status.
   Keep released instructions and their compatibility tests working.
3. **Promote after release:** once the exact stable package is available on npm,
   update `docs/.runtime-version`, move pending guidance into its normal guide path,
   remove its Unreleased callout, update links, and add its literal suite to the
   compatibility command. Run the check and merge. Do not change the pin before
   publishing the runtime: that deliberately fails rather than advertising unavailable behavior.
