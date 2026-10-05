# Templates: start from one, stay current with it, publish your own

**Role**: The guide to unify's template features — scaffolding a site from a built-in, a directory, a git repository or an npm package, keeping that site current with `unify update` without losing your own changes, and publishing a template for others. The normative rules are in [`conformance-spec.md`](conformance-spec.md) §19.9 and §19.10; every command and flag is in [`cli-reference.md`](cli-reference.md). Read [`getting-started.md`](getting-started.md) first if you have never run `unify init`.

A template is nothing more than a unify project: a `site/` directory beside the files that belong at the project root (`AGENTS.md`, `DEPLOY.md`, `unify.yaml`, perhaps a generator in `scripts/`). That is what `unify init` writes, and it is also what `unify init` reads. There is no template language, no manifest, no file list, and nothing a template can execute on your machine.

## 1. Scaffold from a template

`unify init [template]` takes one argument, and tells four kinds of source apart by their shape:

```sh
unify init                       # the default built-in
unify init blog                  # another built-in: default, basic, blog, docs, portfolio
unify init ../our-house-template # a directory on disk
unify init https://github.com/fwdslsh/unify/templates/blog      # a git repository, one subdirectory of it
unify init https://github.com/acme/site-templates/tree/v2/shop  # the URL your browser shows, ref included
unify init git@github.com:acme/templates.git/shop#v2            # an SSH address, a subdirectory, a tag
unify init unify-shop-template                                  # an npm package, by its conventional name
unify init @acme/unify-shop-template@1.4.0                      # the same under an organization, pinned
```

What each form does:

- **A built-in** is a directory of the unify repository, `templates/<name>/`, embedded in the CLI. It needs no network and no git; the name is a shortcut to that directory at the version of unify you are running. `blog@0.11.2` names the same directory as an older unify shipped it, fetched from the repository.
- **A directory** must exist. Nothing is fetched. If it is a clean checkout of a git repository, its commit is remembered, which is what makes updates from it possible later.
- **A git repository** is cloned with your own `git`, so your SSH keys and credential helper apply and nothing prompts. The repository ends at the `.git` segment where there is one, else at `host/owner/repo`; what follows is a **subdirectory**, so one repository can host many templates. `#ref` names a branch, a tag or a commit.
- **An npm package** is fetched with your own `npm pack`, so your `.npmrc`, registry and tokens apply. It is recognized by its name: `unify-<name>-template`, or `@<organization>/unify-<name>-template`, optionally with `@version`. The convention is also what to search npm for.

A bare word that is none of these — not a built-in, not a template package name, not a directory — exits 2 and lists the four forms. A typo never becomes a network request.

Every template lands the same way: its `site/` (or `src/`) becomes your source root and everything beside it lands at your project root. A template with neither directory is a bare source tree, and all of it is content. `.git/`, `node_modules/`, `package.json` and lockfiles are never copied. `init` writes nothing if any file it would create already exists.

### Keep it only if it is a proper unify site

```sh
unify init https://github.com/acme/templates/shop --audit
```

`--audit` scaffolds, then runs `unify audit --strict` over the new project with its own `unify.yaml`, and prints the report. A finding removes everything `init` wrote and exits 1. Every built-in passes it; use it on a template you did not write.

### What `init` leaves behind

One line in `unify.yaml`:

```yaml
template: https://github.com/acme/templates/shop#3f9c2e1a7b…
```

It is the template you named, **pinned to the version that was fetched**: a git commit, an npm version (`unify-shop-template@1.4.0`), unify's own version for a built-in (`blog@0.11.3`), or the commit of the repository a directory sits in (`../shop#3f9c2e1a…`). That is the whole record — no file list, no hashes, no copy of the template. It is a saved flag like every other line in the file (`--template` is the same thing on the command line), it is never published, and it is what makes the next section possible. Commit it.

## 2. The recommended workflow

Configure once, author freely, take template improvements when they come.

1. **Scaffold** from the template and commit everything.
2. **Configure** the site: edit `unify.yaml`, the config file the template seeded, the deployment settings. Commit.
3. **Author**: add pages and content, customize the stylesheet or layout where you want to. Commit as you go.
4. When the template releases a new version, **preview** what would change:

   ```sh
   unify update --dry-run
   ```

   unify fetches the template twice — at the version your `unify.yaml` records, which is exactly what you started from, and at its latest — and compares each file three ways: then, now, and on your disk. The change set lists each file as `would update`, `would add`, `would remove`, or `conflict … kept as is`. Nothing is written.

5. **Apply**:

   ```sh
   unify update
   ```

   Files you never touched take the template's new version. Files you edited that the template also changed are **conflicts**: your bytes stay, the line names the file and why, and the exit code is 1. Files listed under `owned:` in `unify.yaml` are never touched or mentioned.

6. **Resolve** each conflict yourself — diff your file against the template's version, take theirs, or keep yours and add the file to `owned:` so it is yours from now on — then run `unify update` again. The `template:` line moves to the new version only when a run ends with no conflict, so an unresolved conflict is reported again rather than forgotten.
7. **Verify and commit**: `unify build --dry-run --strict`, then commit. The update is ordinary file changes in your working tree, so `git diff` reviews it and `git checkout` reverts it.

Running `unify update` when nothing changed upstream says so and writes nothing. To move to a specific version or another address, name it: `unify update https://github.com/acme/templates/shop#v3`, or `unify update @acme/unify-shop-template@2.0.0`; the line follows.

### What `update` never does

It never resolves a conflict for you and has no flag that would. It never touches a file outside the template's paths — not `.env`, not your keys, not the output directory, not pages you added. It never follows or replaces a symlink, never writes through a directory that resolves outside the project, and never runs anything a template ships: `npm pack --ignore-scripts`, a bare `git clone`, and plain file writes are the whole mechanism. Writes are temp-then-rename beside their target, and the fetches happen first, so an unreachable source changes nothing.

### Without a version there is no baseline

A directory template that was not a clean git checkout when you scaffolded from it is recorded without a version (`template: ../shop`). `unify update` then has nothing to compare your files against except the template as it is now, so every file that differs is reported as a conflict and nothing is removed. Put the template under git and commit it, and the next scaffold records the commit.

### If the line is missing

A project scaffolded before 0.11.3, or one whose `unify.yaml` lost the line, has no record, and `unify update` says so rather than guessing one. Add the line yourself, pinned to the version the project was scaffolded from:

```yaml
template: https://github.com/acme/templates/shop#3f9c2e1a7b…
```

A project that still has a `unify.template.json` from 0.11.2 is told the exact line to add, composed from what that file recorded, and can then delete it.

## 3. Publish a template

A template is a project, so the way to make one is to make a site and strip it to the starting point you want others to have.

1. **Lay it out as `init` does**: `site/` beside `AGENTS.md`, `DEPLOY.md`, `unify.yaml` (and `scripts/gen.mjs` if the site needs a generator). The easiest start is `unify init` itself.
2. **Make it audit clean**: `unify audit --strict` must exit 0 from a fresh scaffold, with no flags and nothing edited. That is what `--audit` checks on the receiving side, and what the built-ins guarantee.
3. **Declare what the site owns** in the template's `unify.yaml`:

   ```yaml
   owned:
     - site/config.json
     - site/products/**
     - .env.example
   ```

   Patterns use the `--exclude` grammar (`*`, `**`, `?`, `[...]`) against paths relative to the file. Name the seeds a site configures once and the folders it fills with its own content. Everything else is yours to update. The file is copied to every site like any other, so the list travels with the template and a site can extend it.

4. **Host it** wherever its users can fetch it:
   - **One or many in a git repository**: `templates/shop/`, `templates/docs/` and so on — users write `https://github.com/acme/templates/templates/shop`, and `#v2` pins a tag. Tag releases, so a user can pin a version by name; the record itself pins the commit.
   - **On npm**: name the package `unify-<name>-template` (or `@acme/unify-<name>-template`), so `unify init unify-shop-template` finds it and so that searching npm for `unify-` `-template` lists it beside the others. `package.json` and lockfiles are never scaffolded, so the package can carry whatever metadata it needs. Publish versions as usual; users pin with `@version`.
   - **As a directory**, for a template that lives beside the sites it serves — in a git repository, so each scaffold records the commit it came from.

5. **Release updates** the way the update rules reward: change the shared tooling (layout, stylesheet, generator, deployment files) freely, since untouched copies update cleanly; change a seed only when you must, since every site that configured it will see nothing (owned) or a conflict (not owned); when you remove a file, sites that never edited it lose it cleanly and sites that did keep it as a conflict.

Nothing a template ships is ever executed by `init` or `update`. A template that needs a setup step documents it in its `AGENTS.md` or `DEPLOY.md`, exactly as the built-ins do.

## 4. Where to look next

- [`cli-reference.md`](cli-reference.md) — `unify init`, `unify update`, `--audit`, `--template`, `--owned`, `--dry-run` in full
- [`conformance-spec.md`](conformance-spec.md) §19.9 and §19.10 — the exact source forms, the three-way table, and the safety rules
- [`getting-started.md`](getting-started.md) — the tutorial, from `unify init` to a published site
