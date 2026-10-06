# Templates: start from one, stay current with it, publish your own

**Role**: The guide to unify's template features — scaffolding a site from a built-in, a directory, a git repository or an npm package, keeping that site current with `unify update`, and publishing a template for others. The normative rules are in [`conformance-spec.md`](conformance-spec.md) §19.9 and §19.10; every command and flag is in [`cli-reference.md`](cli-reference.md). Read [`getting-started.md`](getting-started.md) first if you have never run `unify init`.

A template is nothing more than a unify project: a `site/` directory beside the files that belong at the project root (`README.md`, `DEPLOY.md`, `unify.yaml`, perhaps a generator in `scripts/`). That is what `unify init` writes, and it is also what `unify init` reads. There is no template language, no manifest, no file list, and nothing a template can execute on your machine.

## 1. Scaffold from a template

`unify init [template]` takes one argument, and tells four kinds of source apart by their shape:

```sh
unify init                       # the default built-in
unify init blog                  # another built-in: default, basic, blog, docs, portfolio
unify init ../our-house-template # a directory on disk
unify init https://github.com/fwdslsh/unify/templates/blog      # a git repository, one subdirectory of it
unify init https://github.com/acme/site-templates/tree/v2/shop  # the URL your browser shows, ref included
unify init git@github.com:acme/templates.git/shop#v2            # an SSH address, a subdirectory, a tag
unify init shop-template                                        # an npm package — any package
unify init @acme/shop-template@1.4.0                            # the same under an organization, at a version
```

What each form does:

- **A built-in** is a directory of the unify repository, `templates/<name>/`, embedded in the CLI. It needs no network and no git; the name is a shortcut to that directory at the version of unify you are running.
- **A directory** must exist. Nothing is fetched.
- **A git repository** is cloned with your own `git`, so your SSH keys and credential helper apply and nothing prompts. The repository ends at the `.git` segment where there is one, else at `host/owner/repo`; what follows is a **subdirectory**, so one repository can host many templates. `#ref` names a branch, a tag or a commit.
- **An npm package** is fetched with your own `npm pack`, so your `.npmrc`, registry and tokens apply. Any package can be one: a bare word that is neither a built-in nor an existing directory is read as a package name (`name` or `@scope/name`, optionally `@version` or `@tag`). A template published to npm carries `unify-template` in its `keywords`, which is how it is found (§3), not a requirement of the form; `--audit` is what tells a template from a package that is not one. The cost is that a misspelled directory name reaches npm and fails there, with npm's own message.

An argument that is no form at all — a space in it, a `/`-path that names no directory — exits 2 and lists the four forms.

Every template lands the same way: its `site/` (or `src/`) becomes your source root and everything beside it lands at your project root. A template with neither directory is a bare source tree, and all of it is content. `.git/`, `node_modules/`, `package.json` and lockfiles are never copied. `init` writes nothing if any file it would create already exists.

### Keep it only if it is a proper unify site

```sh
unify init https://github.com/acme/templates/shop --audit
```

`--audit` scaffolds, then runs `unify audit --strict` over the new project with its own `unify.yaml`, and prints the report. A finding removes everything `init` wrote and exits 1. Every built-in passes it; use it on a template you did not write.

### What `init` leaves behind

The record in `unify.yaml`: the template exactly as you typed it (a directory is written relative to the file), as the value of `template:`,

```yaml
template: https://github.com/acme/templates/shop
```

or, when the template ships a `unify.yaml` with files to keep (§3), as `source:` inside that block:

```yaml
template:
  source: https://github.com/acme/templates/shop
  keep:
    - unify.yaml
    - site/assets/theme.css
```

That is the whole record — no version, no file list, no hashes, no copy of the template. It is a saved flag like every other line in the file (`--template` is the same thing on the command line), it is never published, and it is what `unify update` reads. Commit it.

## 2. The recommended workflow

Configure once, author freely, take template improvements when they come.

1. **Scaffold** from the template and commit everything.
2. **Configure** the site: uncomment what you need in `unify.yaml`, copy the template's examples into place (a template built as §3 recommends keeps them under `site/_examples/`) and fill them in, set up deployment. Commit.
3. **Author**: add pages and content — copies of the examples, edited — edit the theme, and add any other file you make your own (the nav, the home page) to the `keep:` list under `template:` in `unify.yaml`. Commit as you go.
4. When the template has moved on, **preview** what would change:

   ```sh
   unify update --dry-run
   ```

   unify fetches the template again and compares every file it ships with yours. The list names each file as `would overwrite` (you have it, and the bytes differ) or `would add` (you do not have it). Nothing is written and nothing is asked.

5. **Apply**:

   ```sh
   unify update
   ```

   The same list, then — if at least one file would be overwritten — one question: `overwrite 3 file(s)? [y/N]`. Answer `y` and the listed files take the template's version, the new ones are added, and one line reports the counts. Anything else writes nothing and exits 1. Files the template dropped stay; files you added are never touched; nothing is ever removed.

6. **Review**: the update is ordinary changes in your working tree, so `git diff` shows exactly what the template changed, and `git checkout -- <file>` takes back any file you would rather have kept your own version of.
7. **Verify and commit**: `unify build --dry-run --strict`, then commit.

Running `unify update` when nothing differs says so and writes nothing. In a script, `unify update --yes` (`-y`) answers the question for you. To move to a specific version or another address, name it: `unify update https://github.com/acme/templates/shop#v3`, or `unify update @acme/unify-shop-template@2.0.0`; the line follows.

### The list is the protection, and `keep` is the exception you declare

`update` has no merge and no ownership rules. A file you edited that the template also ships shows up in the list like any other difference, and the answer is yours: read the list, and say no if it names something you want to keep. A template built as §3 recommends ships the files you fill in only as examples to copy, so its list is tooling and little else.

For the files you customize and mean to keep for good — the theme, the nav, the home page — `keep:` under `template:` in `unify.yaml` names them, relative to the file, and `update` never overwrites a listed file that exists: it prints `keep <path>` when the template's copy differs, counts it as kept, and never asks about it; a listed file you do not have yet is added. `--keep <path>` on the command line is the same list for one run (repeatable, relative to the working directory, replacing the file's). The built-ins list `unify.yaml` itself and `site/assets/theme.css`:

```yaml
template:
  source: https://github.com/acme/templates/shop
  keep:
    - unify.yaml
    - site/assets/theme.css
    - site/_includes/nav.html
```

That is the whole mechanism: a list of paths under the record, nothing more.

### What `update` never does

It never removes a file, never touches a file the template does not ship — not `.env`, not your keys, not the output directory, not pages you added — and never writes anything on a `--dry-run` or an answer other than `y`. It never follows or replaces a symlink, never writes through a directory that resolves outside the project, and never runs anything a template ships: `npm pack --ignore-scripts`, a bare `git clone`, and plain file writes are the whole mechanism. Writes are temp-then-rename beside their target, and the fetch happens first, so an unreachable source changes nothing.

### If the line is missing

A project scaffolded before 0.11.5, or one whose `unify.yaml` lost the line, has no record, and `unify update` says so rather than guessing one. Add the line yourself:

```yaml
template: https://github.com/acme/templates/shop
```

or run `unify update <source>` once, which records the source it was given. A project that still has a `unify.template.json` from 0.11.2 to 0.11.4 is told the exact line to add, composed from what that file recorded, and can then delete it.

## 3. Publish a template

A template is a project, so the way to make one is to make a site and strip it to the starting point you want others to have. One fact shapes everything else: **`update` copies every file the template ships, so ship only what you mean to keep updating.**

### Tooling in place, examples to copy

A site is two kinds of file. The **tooling** — layout, includes, stylesheet, scripts, the deployment recipe, `README.md` — is yours as the template's author: sites take it as is, and every improvement you release should reach them. The **content and configuration** — pages, posts, data files, a settings file — is the site's: its author rewrites it on day one and never wants it back. Ship the first kind in place, and the second kind only as **examples**, under a path the build never publishes:

```
site/
  _layout.html          tooling: ships in place, updates cleanly
  _includes/nav.html
  assets/style.css
  assets/theme.css      the look: the site edits it, and unify.yaml's keep: list protects it (see below)
  index.html            the one page a scaffold cannot build without (see below)
  _examples/
    post.md             examples: copied into place, then edited — never edited where they are
    author.json
    landing-page.html
README.md               tooling: tells the author (or their agent) to copy from _examples/
DEPLOY.md
unify.yaml              its template: block keeps unify.yaml and site/assets/theme.css — the files update never overwrites
```

The underscore does the work. `_examples/` is excluded from the build by the default `_*` rule, so the examples ship with the template, land in every site, and never publish. The site's author copies `_examples/post.md` to `posts/first-post.md` and edits the copy. The copy is a path the template does not ship, so `update` never visits it; `_examples/post.md` itself is never edited, so it updates cleanly whenever you improve it. Convention over configuration: nothing is declared anywhere, and the path alone says whose a file is. Say so in the template's `README.md`, which is where an author or an agent looks first.

The five built-ins are laid out this way: `unify init blog`, for instance, ships `_examples/post.md` and `_examples/authors.json`, and its generator writes a listing that says there are no posts yet until the first one is copied into place.

### The look is a file the site keeps

Your stylesheet is tooling, so a site must be able to change the look without editing it. Express the look as custom properties, and open the stylesheet with two lines:

```css
@layer base, theme;
@import url("theme.css") layer(theme);

@layer base {
  :root { --font-body: 100%/1.5 system-ui, sans-serif; --color-link: linktext; /* … */ }
  /* the template's rules, reading var(--font-body) and the rest */
}
```

Then ship `assets/theme.css` in place — the same properties at their defaults, and nothing else — and name it under `keep:` in the `template:` block of the `unify.yaml` you ship (§19.10). The site edits the file: the import places it in the `theme` layer, which wins over `base` whatever the order, so a changed value changes the look and a deleted one keeps your default, and `unify update` never overwrites it. The file ships in place rather than as an example because a file you ship can only reference files you ship: unify refuses to publish a reference to nothing (§12), so a stylesheet importing a theme the site had not copied yet would fail a fresh scaffold's audit. The built-ins do exactly this. It is a convention, not a rule: a template that wants no theme file ships none.

The same rule reaches the project root. **Ship `unify.yaml` only for the lines you need live**, and name it under the `keep:` list of its own `template:` block — the built-ins do, beside `site/assets/theme.css` — so the lines a site uncomments are never overwritten; `init` writes the all-commented file for a template that ships none, and that file is then the site's. A `.env`, keys, and anything else a site fills in belong in an example or in `DEPLOY.md`'s instructions, never in the template.

### What a template must still ship

A fresh scaffold has to build — `unify audit --strict` must pass on it, since that is what `--audit` checks — so a template needs at least a home page, and a home page is the first file every site rewrites. Keep that set as small as it can be, usually `index.html` alone. Once a site has edited such a file it differs from yours, so it is in every update's list from then on and the site's author answers for it each time — or names it under `keep:` and answers once; the fewer such files, the quieter the list. A data file your generator reads on a fresh scaffold is the same case: ship it and leave it alone, or have the generator fall back to the example when the real file is absent.

### Make it audit clean, then host it

1. **Lay it out as `init` does**: `site/` beside `README.md`, `DEPLOY.md` (and `scripts/gen.mjs` if the site needs a generator). The easiest start is `unify init` itself.
2. **Make it audit clean**: `unify audit --strict` must exit 0 from a fresh scaffold, with no flags and nothing edited. That is what `--audit` checks on the receiving side, and what the built-ins guarantee. Examples under `_examples/` are never built, so they cannot fail it.
3. **Host it** wherever its users can fetch it:
   - **One or many in a git repository**: `templates/shop/`, `templates/docs/` and so on — users write `https://github.com/acme/templates/templates/shop`, and `#v2` names a tag. Tag releases, so a user can stay on a version by name.
   - **On npm**: any package works (`unify init <name>`), under any name. Put `unify-template` in the `keywords` of its `package.json`: a search for that keyword (`npm search keywords:unify-template`, and the template list on fwdslsh.dev) is how a template is found beside the others, and a package without it is not listed. `package.json` and lockfiles are never scaffolded, so the package can carry whatever other metadata it needs. Publish versions as usual; users name one with `@version`. The five built-ins are published this way — `unify-default-template`, `unify-basic-template`, `unify-blog-template`, `unify-docs-template` and `unify-portfolio-template` — each from the `package.json` in its `templates/<name>/` directory, by `.github/workflows/publish-templates.yml` whenever a template's version changes on `main`; `README.md` is both the guidance the scaffold lands at the project root and the package's page on npm.
   - **As a directory**, for a template that lives beside the sites it serves.
4. **Release updates** with the copy in mind: change the tooling and the examples freely — a site that followed the convention has edited neither — and leave the few files from the section above alone. A file you remove stays in every site.

Nothing a template ships is ever executed by `init` or `update`. A template that needs a setup step documents it in its `README.md` or `DEPLOY.md`, exactly as the built-ins do.

## 4. Where to look next

- [`cli-reference.md`](cli-reference.md) — `unify init`, `unify update`, `--audit`, `--template`, `--yes`, `--dry-run` in full
- [`conformance-spec.md`](conformance-spec.md) §19.9 and §19.10 — the exact source forms, the three outcomes per file, and the safety rules
- [`getting-started.md`](getting-started.md) — the tutorial, from `unify init` to a published site
