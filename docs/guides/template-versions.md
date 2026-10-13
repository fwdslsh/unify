---
description: "Pinning a template to a version, moving the pin on purpose with unify update, pinning what extends: builds on, and trying a template or unify before it ships."
---

# Template versions: pin one, move it on purpose, try the next early

**Role**: How to say which version of a template a project is on, change that deliberately, and try an unreleased one without committing to it. `init`, `update` and `extends:` take the same source forms, so one set of rules covers all three; read [the templates guide](../templates.md) first for what each does and [the CLI reference](../cli-reference.md) for every flag. Every source literal below is classified by unify's own classifier, and the command lines in §3 run as printed, with the repository address swapped for a local git repository (`tests/unit/template-versions.test.js`, `tests/conformance/template-versions.test.js`). An npm fetch and a publish cannot run offline, so those parts are described from the code and from `.github/workflows/publish-templates.yml` instead.

## 1. What can be pinned

A source is pinned when it names one version for good. The four forms of [`templates.md`](../templates.md) §1 differ in how far they can be:

| Source | Form | Same bytes every time? | Cached by `extends:`? |
|---|---|---|---|
| `docs` | built-in | yes, under the same unify | yes |
| `unify-docs-template@0.4.0` | npm | yes, npm never reuses a version | yes |
| `unify-docs-template@0.5.0-next.57` | npm | yes, a prerelease is a version | yes |
| `https://github.com/fwdslsh/unify/templates/docs#3f2a9c1` | git | yes, a commit | yes |
| `https://github.com/fwdslsh/unify/templates/docs#v0.11.14` | git | until someone moves the tag | no |
| `https://github.com/fwdslsh/unify/templates/docs#main` | git | no, the branch moves | no |
| `unify-docs-template` | npm | no, it is the latest | no |
| `unify-docs-template@next` | npm | no, a dist-tag moves | no |
| `../our-template` | directory | no, it is whatever is on disk | no, read in place |

A `#ref` of 7 to 40 hex digits is read as a commit, anything else as a branch or tag. To see what exists: `npm view unify-docs-template versions`, `npm view unify-docs-template dist-tags`, `git ls-remote --tags https://github.com/fwdslsh/unify`.

## 2. Pin when you scaffold

Name the version in the source:

```sh
unify init unify-docs-template@0.4.0
```

`init` records the source exactly as you typed it, and `unify update` reads it back later ([`conformance-spec.md`](../conformance-spec.md) §19.10):

```yaml
template:
  source: unify-docs-template@0.4.0
  keep:
    - unify.yaml
    - site/assets/theme.css
```

Commit it: that line is the pin.

**A built-in name rides unify.** `unify init docs` records `docs`, the copy embedded in the unify that ran, so its version is unify's own. Pin it by pinning unify:

```sh
npx @fwdslsh/unify@0.11.14 init docs
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash -s -- --version v0.11.14
```

The second line installs the binary at that release; `UNIFY_VERSION=v0.11.14` is the same thing as an environment variable, and `unify --version` says which one you have. To pin a built-in apart from unify, name its package (`unify-docs-template@0.4.0`: the built-ins publish as `unify-<name>-template`, versioned on their own) or the unify release tag that holds it (`https://github.com/fwdslsh/unify/templates/docs#v0.11.14`, the `templates/docs` directory as that release shipped it).

## 3. Move a pin

`unify update` with no argument fetches the recorded source again. At a pin that is the same version, so there is nothing newer to bring in. To move, name the new source: `update` fetches it, lists what it would change, asks, copies, and replaces the recorded line.

```sh
unify init https://github.com/acme/templates/shop#v1
unify update https://github.com/acme/templates/shop#v2 --dry-run
unify update https://github.com/acme/templates/shop#v2
unify update https://github.com/acme/templates/shop#v2 --yes
```

- **`init`** scaffolds at `v1` and records `https://github.com/acme/templates/shop#v1`, character for character. The template moving on afterwards changes nothing in your project, and a plain `unify update` still reports `nothing to do`.
- **`--dry-run`** lists the files with `would overwrite` or `would add`. It writes nothing, and the line in `unify.yaml` stays on `v1`.
- **The plain form** lists the same files and asks `overwrite N file(s)? [y/N]`. Anything but `y` (a blank line, a closed stdin) writes nothing, exits `1`, and leaves the line on `v1`. `y` copies the files and moves the line to `#v2`.
- **`--yes`** (`-y`) answers for a script.

Review the result the way [`templates.md`](../templates.md) §2 does (`git diff`, then `unify build --dry-run --strict`), and commit. Files you named under `keep:` are never overwritten, and nothing is ever removed. To go back, name the old pin; to move to a commit, put it after the `#`.

**Moving a built-in** means moving unify, because `update` reads the embedded copy of the unify that runs it:

```sh
npx @fwdslsh/unify@0.11.15 update --dry-run
```

Or move the project onto the package, which has versions of its own: `unify update unify-docs-template@<version> --dry-run`, then again without `--dry-run`. Read that list first; a package version older than your unify's embedded copy would take files back.

## 4. Pin what `extends:` builds on

`extends:` takes the same sources and builds on the template without copying it. Pin it the same way:

```yaml
# unify.yaml
extends: unify-docs-template@0.4.0
```

- **An exact npm version, a commit, or a built-in** is fetched once into `~/.cache/unify/templates` (under `$XDG_CACHE_HOME` when that is set). Every later build, in any project, reads it from there without the network. Deleting the cache costs one fetch.
- **A tag, a branch, a range, a dist-tag or a bare name** is fetched once per run and never cached, and its next release can change your site without a commit of yours. A tag counts here: it can be moved, so use the commit when you need the build to be reproducible.
- **In CI**, restore the cache directory between runs and only the first build of a pin touches the network.
- **To take a release**, change the pin. Nothing is copied back, and `unify build --dry-run` marks every file that came from the template `(template)`.

An installed package pins through your lockfile instead: `extends: node_modules/unify-docs-template` ([`templates.md`](../templates.md) §4).

## 5. Try one before it ships

unify and each template have their own prerelease channel, and a git ref reaches anything else:

| To try | Command | Where it comes from |
|---|---|---|
| unify, and the built-ins it embeds | `npx @fwdslsh/unify@next init docs` | a prerelease such as `0.11.15-alpha.1` publishes under npm's `next`; the binary is a GitHub pre-release, `install.sh --version v0.11.15-alpha.1`. `install.sh` with no version and a plain `@fwdslsh/unify` keep resolving to stable |
| a template's pending change | `unify init unify-docs-template@next` | a template whose version was bumped on a `release/*` branch publishes there as `<version>-next.<run number>` under `next` (§6) |
| anything on a branch | `unify init https://github.com/fwdslsh/unify/templates/docs#release/0.11.15` | git: any branch, tag or commit |

- **In a project you already have**, preview without committing to anything: `unify update unify-docs-template@next --dry-run` lists what would change and moves nothing, not even the recorded line. On a new scaffold, add `--audit` and it is kept only if it audits clean.
- **Pin what you settle on.** `next` moves with every prerelease; once you have picked one, name it, as in the table's `unify-docs-template@0.5.0-next.57`. That is an exact version, so `extends:` caches it.
- **A branch with a `/` in its name** goes after a `#`. The browser's `…/tree/<ref>/<dir>` form cannot carry one: `…/tree/release/0.11.15/templates/docs` is read as the ref `release` and the directory `0.11.15/templates/docs`.
- **`next` goes stale.** Nothing moves it back after a release, so it keeps pointing at the last prerelease, which is then older than `latest`. Use `@next` only while a release is in progress, and look first: `npm view unify-docs-template dist-tags`. A template that has never had a pending bump has no `next` at all, and `@next` fails with npm's own `notarget` message.

## 6. For template authors

- **A template's version is the `version` in its own `package.json`**, independent of unify's. Every change you want published needs a bump; a change without one publishes nothing.
- **In this repository**, `.github/workflows/publish-templates.yml` publishes each `templates/<name>/` as `unify-<name>-template`. On `main`, a version not yet on npm publishes as that version under `latest`. On a `release/*` branch, the same pending bump publishes early as `<version>-next.<run number>` (`0.5.0-next.57`) under `next`: `latest` never moves, and the plain `0.5.0` stays free for `main` to publish when the branch merges.
- **Your own template** gets the same channel by publishing a prerelease version with `npm publish --tag next`, so `latest` stays on the last stable one.
- **Tag releases in git** (`git tag v2`) so a user can name one; never move a tag once it is public, because that is what a pin trusts. A commit cannot move.
- **Check what you publish** the way a user will read it: `unify init <your-template-dir> --audit` keeps the scaffold only if `unify audit --strict` passes on it, and the workflow runs exactly that on the packed tarball before it publishes.
