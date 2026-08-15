# GitHub Copilot Instructions for unify

unify is a Bun-native static site generator for **HTML-native composition**: includes, layouts, and slots written in plain HTML, with no expression language and no client runtime. The output is the HTML and CSS the author wrote; unify adds no JavaScript of its own.

**The v0.7.0 specification set in `docs/` is authoritative, and `src/` implements it.** When code and a document disagree, the document wins and the disagreement is a defect to report.

## Read before suggesting anything

| Document | What it decides |
|---|---|
| `docs/product-spec.md` | The product contract: what unify is, the composition model, the complete CLI, the non-goals. |
| `docs/conformance-spec.md` | The normative implementer reference: exact algorithms, the head-merge table, the closed problem and advisory catalogues, and the worked examples that are the fixtures. |
| `docs/cli-reference.md` | Every command, option, and exit code. **There are no others.** |
| `docs/authoring-rules.md` | The complete authoring surface in under sixty lines. |
| `docs/testing-strategy.md` | What "implemented" means as a machine-checkable claim, and the release gates. |
| `docs/migration-plan.md` | The phased path from the v0.6 codebase and suite to v0.7.0. |
| `CONTRIBUTING.md` | The contribution workflow and the gates. |

If two documents disagree, that is a defect to report — never a license to reinterpret either one.

## The authoring surface — all of it

| You want to… | You write… |
|---|---|
| Reuse a fragment | `<include src="/_includes/nav.html"></include>` (Apache SSI comment form also supported) |
| Wrap pages in a layout | nothing — the nearest `_layout.html` applies; `data-layout="/path.html"` to pick one, `data-layout="none"` to opt out |
| Mark where content lands | `<main>` for the default; `<slot name="footer">` in the layout, `slot="footer"` on a page element |
| Keep a file out of the built site | a leading underscore: `_draft.html`, `_includes/` |

**If a capability cannot be expressed with these four, it does not belong in unify.** Layouts do not chain. Includes are verbatim and never take fills.

## The CLI — a closed set

```
unify [build]              build the site (default command)
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server
unify init [template]      scaffold a starter site

Options: -s/--source, -o/--output, --clean, --exclude <glob>, --pretty-urls,
         --base-url <path>, --dry-run, --strict, -p/--port, -v/--version, -h/--help
```

Exit codes: `0` published, `1` problems found and nothing published, `2` invalid usage or fatal environment error. Diagnostics use exactly two severities — `problem` and `advisory` — in plain language with **no rule codes**. `DEBUG=1` is the only environment variable unify reads.

## Retired — never suggest, never reintroduce

`data-unify`, `unify-*` area classes, component mode, `<template data-slot>`, landmark and ordered-fill matching, `<style data-unify-docs>` blocks, U001–U008 rule codes, `--fail-on`/`--fail-level`, the security scanner, the glob pipeline, incremental builds and the build cache, `--minify`, `--host`, `--log-level`, short-name layout resolution, layout chaining, and the `serve` command.

Also gone as concepts: `.components/` and `.layouts/` directories, dependency and asset trackers (every non-page file mirror-copies byte-for-byte), automatic sitemap generation, and Apache/Nginx container images (the repo ships exactly one Dockerfile, a CLI image).

Suggesting any of these is a regression, not a feature. `data-unify` and `unify-*` appearing in a source file are diagnosed as located build problems naming the v0.7.0 spelling.

## Non-goals — do not "helpfully" add these

No templating language (no `{{ }}`, `{% %}`, variables, loops, conditionals, or props). No component framework. No configuration language — `unify.yaml` is saved CLI flags and nothing more. No style scoping. No general-purpose web server. No plugin API: the extension interface is the filesystem, and generators run before the build. No collections, pagination, RSS, or taxonomies. No build cache. No security theater.

`docs/product-spec.md` §5 carries the reasoning and the accepted costs; §6 is the post-MVP candidate list and is the roadmap.

## Commands that actually exist

```bash
bun install
bun test
bun src/cli.js build --source src --output dist   # run the CLI from source

bun tests/conformance/check-traceability.mjs --static   # rule-coverage gap list
bun tests/conformance/check-suite-hygiene.mjs           # suite hygiene gate

bun run build:linux    # also build:macos, build:windows — compile the standalone binary
```

There is no `bun run build`, `serve`, `build:advanced`, `lint`, `format`, `docs:*`, `benchmark`, or `check:coverage` script, and no `example/` directory. Bun >= 1.2.0 is the only supported runtime.

## Testing rules that constrain suggestions

Read `docs/testing-strategy.md` §1 for why these exist: v0.6 shipped 93% coverage on a product whose `init` command exited 1 and whose builds silently deleted page content.

- **Behavior tests spawn the real CLI** on a real filesystem in a temp directory. No mocks, no `src/**` imports, no `console.warn`-instead-of-fail, no commented-out expectations, no ad-hoc HTML normalization. These are mechanically enforced.
- **Unit tests carry zero conformance authority.** When a unit test disagrees with a conformance fixture, the unit test is wrong by definition.
- **A bug fix arrives with its fixture** — one that fails before the fix and passes after.
- **Never edit a test to match observed output.** If the implementation and a fixture disagree, consult the spec; if the spec agrees with the fixture, the implementation changes.
- **Never generate an expected output tree by capturing a build run.** Expected trees are written from the spec.

**Coverage gates nothing and no threshold exists in this project on purpose.** Do not suggest a coverage target, a coverage-named test file, or a coverage percentage as evidence of quality. The release metric is the conformance ledger: every gated rule in `tests/conformance/rules.tsv` recorded green by a test that ran against the real CLI.

## Code style

Plain JavaScript with JSDoc — no TypeScript. ES modules with `.js` extensions in imports. Async/await. Prefer Bun-native APIs (`Bun.file`, `Bun.write`, `Bun.spawn`, `Bun.serve`, `fs.watch`) over dependencies; a new dependency needs justification against a Bun-native alternative.

Errors name the file, the reference, and the line where known, with a short fix list. **Silent failure is a bug by definition** — this is the failure class that defined v0.6, and it outranks every other concern.
