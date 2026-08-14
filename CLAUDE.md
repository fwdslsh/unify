# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**unify** (`@fwdslsh/unify`) — a static site generator for front-end designers and hobbyists: HTML-native composition with no expression language and no client runtime. The authoring surface is five primitives — `<include>`, layouts (`_layout.html` / `data-layout`), slots (`<slot name>` in layouts, `slot=` on page elements, `<main>` as the default), the underscore exclusion, and the `.fragment.html` opt-out (a bare snippet shipped byte-for-byte, never composed).

**The v0.7.0 specification set in `docs/` is authoritative, and `src/` now implements it.** The rewrite is complete: every normative rule in `docs/conformance-spec.md` is covered by a test that ran against the real CLI (`tests/conformance/check-traceability.mjs --runtime`), and `tests/legacy-v0.6/` has been deleted along with the v0.6 fixture trees only it read — `bun test` runs the whole repo and is green. The retired v0.6 vocabulary — `data-unify`, `unify-*` area classes, DOM Cascade machinery — exists only as *diagnostics*: encountering it is a build error naming the v0.7.0 replacement, never a working feature.

## Development Commands

```bash
# Install dependencies (Bun >=1.2.0 required)
bun install

# Run tests
bun test                                   # full suite
bun test -t "pattern"                      # match test name pattern
bun test path/to/file.test.js              # single test file

# Create executables
bun run build:linux                        # Linux x64 binary
bun run build:macos                        # macOS ARM64 binary
bun run build:windows                      # Windows x64 binary

# The v0.7.0 CLI (complete — there are no other commands or flags)
bun src/cli.js build  [-s src] [-o dist] [--clean] [--exclude <glob>]... \
                      [--pretty-urls] [--base-url <path|url>] [--dry-run] [--strict]
bun src/cli.js dev    [-p 3000]            # build + watch + serve + reload
bun src/cli.js watch                       # build + rebuild on change, no server
bun src/cli.js init [template]             # default | basic | blog | docs | portfolio
```

There is no `serve` command, no `--minify` (post-MVP), no `--fail-on`, no `--host`, no `--log-level`, and no glob pipeline (`--copy`/`--ignore`/`--render`/…) in v0.7.0. `DEBUG=1` is the only environment variable (stack traces).

## Composition Model (v0.7.0)

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

Layouts do not chain in v0.7.0: a layout that itself declares `data-layout` is a located problem (P15), never a silent no-op. A section gets its own chrome from a complete standalone `_layout.html` in its directory.

**The content-loss law**: content the author wrote is never dropped without failing the build. Two severities only — `problem` (blocks publish, exit 1) and `advisory` (never blocks; exits 1 only under `--strict`). Exit codes 0/1/2. Build is transactional: any problem leaves the previous `dist/` untouched.

## Implementation Map (rewrite in progress)

Survives (harvested or as-is): `ssi-processor.js` (the only correct include-path resolution — becomes the include engine), `head-merger.js` (dedup keys, `_normalizeAssetPath`; title logic replaced by the prepend rule), `markdown-processor.js` (trimmed to spec §3.5 keys; keeps the `<h1>` title fallback; gains heading ids), `file-watcher.js`, the static server + SSE transport (into `unify dev`), `link-normalizer.js`/`html-minifier.js` (harvest), `path-validator.js` (invisible internal safety), `init`, binary builds, `dry-run-reporter.js` (rewired).

Deleted with v0.6: `html-processor.js`, all of `src/core/cascade/` (area/landmark/ordered-fill/attribute matchers), `dom-cascade-linter.js`, `security-scanner.js`, `glob-pattern-processor.js`, `incremental-builder.js`, `build-cache.js`, `dependency-tracker.js`, `asset-tracker.js`, short-name/default-layout/layout resolvers. Newly written: the slot filler, the layout discovery walk, URL provenance rewriter, reference checker, collision detection, transactional publisher, the problem/advisory reporter.

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

### Why standards-first composition?
- `<main>` is the HTML spec's own page/chrome division — the default slot costs nothing to learn
- `slot`/`slot=` carry their framework semantics (Astro/Vue/web components) intact: named hole, visible fallback, replace-element
- Layouts preview their own defaults natively in a browser (slot fallbacks render without any script)
- The only unify-specific tokens are `<include src>` and `data-layout`; built output contains no tool vocabulary at all

## Knowledge Base

- **`docs/product-spec.md`** — the product contract (v0.7.0): what unify is, the composition model, the complete CLI, the non-goals. Start here.
- **`docs/conformance-spec.md`** — the normative implementer reference: exact algorithms, the splice model (S1–S12), the head-merge table, the collision matrix, the complete problem/advisory catalogue, and fixture-grade worked examples.
- **`docs/authoring-rules.md`** — the complete authoring surface in under 60 lines; hand this to any agent writing site content.
- **`docs/getting-started.md`** — the human tutorial. **`docs/cli-reference.md`** — every command and flag. **`docs/integrations.md`** — the compile-to-asset pattern for Svelte and kin, every literal tested.
- **`docs/testing-strategy.md`** — the tier model and the traceability gate. **`docs/ratification-protocol.md`** — how to validate `authoring-rules.md` empirically by having agents author from it in isolation, and how to triage a failure into doc / spec / implementation / outlier. **Read the protocol before editing the authoring rules**: it is the procedure that decides whether an edit is warranted. **`docs/ratification.md`** — the evidence: eighteen rounds of agent experiments, what each finding was triaged as, and the doc/spec/implementation changes they produced.
- **Working documents**: `_notes/` (analyses and drafts; `_notes/unbiased-design-synthesis.md` records the v0.7.0 design rationale).

## Important Implementation Notes

- **Composition behavior MUST conform to `docs/conformance-spec.md`** — when a test and the spec disagree, the spec wins; when two documents disagree, that is a defect to raise, not to paper over.
- **The v0.6 vocabulary is diagnosed, never honored**: `data-unify` and `unify-*` classes are located problems naming the v0.7.0 spelling (`data-layout`, `<slot name>`/`slot=`).
- **No silent failure**: every case that would drop authored content is a `problem`; advisories report what the build did and never instruct restructuring of markup that composed correctly.
- **Mirror copy, not asset tracking**: every non-page, non-excluded file ships byte-for-byte at its source path.
- **Full rebuilds only**: no cache, no incremental machinery — watch output must equal a fresh build.
