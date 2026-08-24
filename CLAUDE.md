# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**unify** (`@fwdslsh/unify`) — a static site generator for front-end designers and hobbyists: HTML-native composition with no expression language and no client runtime. The authoring surface is five primitives — `<include>`, layouts (`_layout.html` / `data-layout`), slots (`<slot name>` in layouts, `slot=` on page elements, `<main>` as the default), the underscore exclusion, and the `.fragment.html` opt-out (a bare snippet shipped byte-for-byte, never composed).

**The specification set in `docs/` is authoritative, and `src/` implements it.** Every normative rule in `docs/conformance-spec.md` is covered by a test that ran against the real CLI (`tests/conformance/check-traceability.mjs --runtime`), and the legacy test tree has been deleted along with the fixture trees only it read — `bun test` runs the whole repo and is green. The retired vocabulary — `data-unify`, `unify-*` area classes, DOM Cascade machinery — exists only as *diagnostics*: encountering it is a build error naming the supported replacement, never a working feature.

## Development Commands

**Two runtimes run the CLI; one runs the tests.** `src/**` is `node:*` built-ins only and works identically under Bun >= 1.2.0 and Node >= 22.12.0 — a `Bun.*` call or a Bun-only global (`import.meta.main`) in `src/` is a bug, and gate G12 (`tests/conformance/node-parity.test.js`) fails on any byte of output that depends on which runtime ran. The **test suite stays Bun's**: 58 files import `bun:test`, `bun test` is the only way to run it, and it is not to be ported. Binaries stay `bun build --compile`. Deno is not supported.

```bash
# Install dependencies (Bun >=1.2.0 required for development)
bun install

# Run tests
bun test                                   # full suite
bun test -t "pattern"                      # match test name pattern
bun test path/to/file.test.js              # single test file

# Create executables
bun run build:linux                        # Linux x64 binary
bun run build:macos                        # macOS ARM64 binary
bun run build:windows                      # Windows x64 binary

# The CLI (complete — there are no other commands or flags)
bun src/cli.js build  [-s src] [-o dist] [--clean] [--exclude <glob>]... \
                      [--pretty-urls] [--base-url <url>] [--canonical auto] \
                      [--feed-full] [--search-index] [--generate <path>] \
                      [--dry-run] [--strict]
bun src/cli.js audit  [-s src] [-o dist] [--exclude <glob>]... [--pretty-urls] \
                      [--base-url <url>] [--canonical auto] [--generate <path>] \
                      [--strict] [--format human|json|sarif] [--external]  # evaluate, write nothing
bun src/cli.js dev    [-p 3000]            # build + watch + serve + reload
bun src/cli.js watch                       # build + rebuild on change, no server
bun src/cli.js init [template]             # default | basic | blog | docs | portfolio
bun src/cli.js --version | --help          # -v | -h
```

There is no `serve` command, no `--minify` (deferred), no `--fail-on`, no `--host`, no `--log-level`, no `--run "<shell command>"` (§33's `--generate` names a file instead), and no glob pipeline (`--copy`/`--ignore`/`--render`/…). `DEBUG=1` is the only environment variable (stack traces).

**The production-and-discovery layer** (conformance-spec §20–§31, all on the composition core, which is unchanged): the final-output page manifest (§20) — one internal record per emitted page, derived from the emitted bytes, which every discovery and evaluation feature consumes; `sitemap.xml` generation under `--base-url` (§21); `--canonical auto` completion (§22); the `Sitemap:` reference check in an authored `robots.txt` (§23); `unify audit` (§24), which runs the whole pipeline, publishes nothing, and reports `broken`/`incomplete` **findings** — a severity axis of its own, separate from §14's `problem`/`advisory`, which `build` never consults, no score, no character counts, no similarity thresholds (§24.4); structured-data validation and bounded JSON-LD generation from a `schema:` declaration (§26); `feed.xml` generation (§29) — Atom, activated by `--base-url` plus any page declaring `schema: Article`/`BlogPosting`, `--feed-full` for full-content entries, a day-only `date` excluded with advisory **A17** rather than guessed at; the search manifest `search-index.json` under `--search-index` (§30); and `unify audit`'s `--format json`/`--format sarif` (a fingerprinted, machine-readable mirror of the same findings) and `--external` (§31, the one flag in the whole product that touches the network, fetching off-origin references and reporting the ones that don't resolve as `external-unreachable`). An authored `feed.xml`/`search-index.json`/`sitemap.xml` always suppresses generation and ships byte-for-byte, exactly like an authored `robots.txt`.

## Composition Model

The precedence rule in one sentence: **named fills go to named slots, everything else to the bare slot, else into `<main>`.**

```
source tree → inline <include> (textual, before parsing)
            → resolve layout (data-layout / frontmatter / nearest _layout.html walk)
            → merge with the layout: slots → main → head → root attributes
            → URL provenance rewriting → --pretty-urls → --base-url
            → collision detection → temp tree → reference check → transactional publish
```

Merge rules (normative detail in `docs/conformance-spec.md`):

1. **Slots** — a layout `<body>` may contain `<slot>` elements. A page top-level element with `slot="name"` **replaces** `<slot name="name">`, tag and all; the consumed `slot` attribute is removed; an unfilled slot is replaced by its own children (fallback). Slots do not nest — a `<slot>` inside another slot's fallback is a problem (P16). Slots inside `<template>` are never touched. Fills count only on direct children of `<body>`.
2. **Main** — content not addressed to a named slot goes to the bare `<slot>`, else replaces the children of the layout's `<main>`. Incoming content is unwrapped once (a page's own `<main>` is replaced by its children). A layout with no slots and no `<main>` passes the page body through (head-only layout).
3. **Head** — layout's head is the base; page `<title>` is *prepended* to the layout's (separator lives in the layout); page `<meta>` replaces same-`name`/`property`; page `canonical`/`icon` links replace the layout's same-`rel` (never two canonicals); everything else appends (page CSS wins); stylesheet/script dedup compares URLs *after* resolution; layout's charset wins and stays first.
4. **Root attributes** — on `<html>`/`<body>` only: class union, page wins elsewhere. No attribute merging anywhere else.

Layouts do not chain: a layout that itself declares `data-layout` is a located problem (P15), never a silent no-op. A section gets its own chrome from a complete standalone `_layout.html` in its directory.

**The content-loss law**: content the author wrote is never dropped without failing the build. Two severities only — `problem` (blocks publish, exit 1) and `advisory` (never blocks; exits 1 only under `--strict`). Exit codes 0/1/2. Build is transactional: any problem leaves the previous `dist/` untouched.

## Implementation Map

`src/cli.js` (flag parsing + dispatch) → `src/cli/options.js`, `src/cli/commands/{build,dev,watch,init}.js`. Core, one module per §: `includes.js` (§5 inline, SSI comment alias), `layout.js` (§6 discovery walk + data-layout), `compose.js` (§7 slots/merge + §9 root attrs), `head-merge.js` (§8), `markdown.js` (§10), `urls.js` (§11 provenance rewriting, --pretty-urls, --base-url), `references.js` (§12), `collisions.js` (§13), `diagnostics.js` (§14 reporter, dedup), `publish.js` (§15 transactional publish + §17 dry-run report), `watcher.js` + `dev-server.js` (§16), `html.js` (the span-based parser everything shares), `paths.js` (never-shipped list, containment). Templates for `init` live in `src/templates/`. The migration that produced this tree is history, recorded in `docs/migration-plan.md`.

## Testing Strategy

- **Conformance fixtures are the suite's core**: every worked example in `docs/conformance-spec.md` is an input→output fixture; an implementation conforms when it reproduces them exactly in structure, attributes, and text content (whitespace between block-level elements is not normative; the comparator contract is `docs/testing-strategy.md` §2).
- **The golden-path E2E**: builds the product-spec §2 site and asserts the output; `unify init && unify build --dry-run --strict` exits 0 (an advisory that fires on a correct site is a bug in the advisory).
- **Watch equivalence**: watch output after any edit sequence ≡ a fresh `unify build`; a no-op rebuild writes nothing.
- Tests asserting cut behavior (component mode, area classes, linter codes, glob tiers, cache, scanner, short names, `serve`) are deleted with their modules — they are not bugs to fix.
- Maintain high coverage on the new core (slot filler, head merge, URL rewriting, reference check, publisher); all error paths must have located, deterministic messages (ordered by path then line).

## Configuration

`unify.yaml` at the source root is **saved CLI flags, nothing more** (keys = long option names; CLI wins; never shipped; `init` doesn't create one). No behavior may exist that only a config file can express.

## Security Posture

Path traversal safety in include/layout resolution is internal engineering — always on, invisible, no flags, no `[SECURITY]` log theater, no scanning of the author's own HTML. The deploy-safety layer is user-facing instead: the never-shipped list (`.git/`, `node_modules/`, `.env*`, output dir, `unify.yaml`), the `--exclude` underscore guard, `--clean` containment refusal, symlink containment, and the transactional publish.

## Architecture Decisions

### Why Bun?
- Native ES modules without transpilation; built-in test runner and bundler
- Fast file I/O and watch capabilities; single runtime for the toolchain
- Single-file executables — the headline install for an audience that has never heard of Bun

### Why Node too (issue #49)?
- `npx @fwdslsh/unify` is how people try a JS CLI, and hosted build platforms run npm-installable packages — being Bun-only kept unify out of them permanently, and nothing about the composition model required it
- The cost was four call sites (`Bun.serve`, `Bun.file`, `Bun.spawn`, `import.meta.main`), all replaced with `node:*` equivalents that run on both — **no `typeof Bun` branch anywhere**, because a runtime fork means the code a contributor tests is not the code a user runs

### Why standards-first composition?
- `<main>` is the HTML spec's own page/chrome division — the default slot costs nothing to learn
- `slot`/`slot=` carry their framework semantics (Astro/Vue/web components) intact: named hole, visible fallback, replace-element
- Layouts preview their own defaults natively in a browser (slot fallbacks render without any script)
- The only unify-specific tokens an author writes are `<include src>`, `data-layout`, and `schema`; built pages contain no `<slot>`, no `data-layout`, and no injected script. The one unify token that *survives* into output is `<meta name="schema">`, and only on a page that asked for a generated JSON-LD block (§26.4) — it survives because unify never edits an author's markup, and because §20.8 reads it from the emitted document so that a Markdown page and an HTML page declare a type the same way

## Knowledge Base

- **`docs/product-spec.md`** — the product contract: what unify is, the composition model, the complete CLI, the non-goals. Start here.
- **`docs/conformance-spec.md`** — the normative implementer reference: exact algorithms, the splice model (S1–S12), the head-merge table, the collision matrix, the complete problem/advisory catalogue, and fixture-grade worked examples.
- **`docs/authoring-rules.md`** — the complete authoring surface in under 60 lines; hand this to any agent writing site content.
- **`docs/getting-started.md`** — the human tutorial. **`docs/cli-reference.md`** — every command and flag. **`docs/integrations.md`** — the compile-to-asset pattern for Svelte and kin, every literal tested.
- **`docs/testing-strategy.md`** — the tier model and the traceability gate. **`docs/ratification-protocol.md`** — how to validate `authoring-rules.md` empirically by having agents author from it in isolation, and how to triage a failure into doc / spec / implementation / outlier. **Read the protocol before editing the authoring rules**: it is the procedure that decides whether an edit is warranted. **`docs/ratification.md`** — the evidence: the ratification rounds — what each finding was triaged as, and the doc/spec/implementation changes they produced.
- **Working documents**: `_notes/` (analyses and drafts; `_notes/unbiased-design-synthesis.md` records the design rationale).

## Important Implementation Notes

- **Composition behavior MUST conform to `docs/conformance-spec.md`** — when a test and the spec disagree, the spec wins; when two documents disagree, that is a defect to raise, not to paper over.
- **The retired vocabulary is diagnosed, never honored**: `data-unify` and `unify-*` classes are located problems naming the supported spelling (`data-layout`, `<slot name>`/`slot=`).
- **No silent failure**: every case that would drop authored content is a `problem`; advisories report what the build did and never instruct restructuring of markup that composed correctly.
- **Mirror copy, not asset tracking**: every non-page, non-excluded file ships byte-for-byte at its source path.
- **Full rebuilds only**: no cache, no incremental machinery — watch output must equal a fresh build.
