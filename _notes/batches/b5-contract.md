# Batch B5 — generator context v1 (`process.argv[4]`)

Read first: `_notes/unify-0.9-brief.md` §18 (generator context) and §29.6
(tests); `_notes/release-0.9.0-implementation-plan.md` decision 14;
`src/core/generate.js` in full; `tests/conformance/generate.test.js`;
conformance-spec §33 and the GEN- rows in `tests/conformance/rules.tsv`;
`docs/guides/eleventy-htmx.md` and `docs/integrations.md` (generator
sections).

## Objective

Extend the generator seam additively: each build/rebuild writes a versioned
`generator-context.json` and passes its absolute path as `process.argv[4]`.
argv[2]/argv[3] are unchanged; a generator that ignores argv[4] keeps working
exactly as before.

## Part 1 — code (`src/core/generate.js` + `build.js`)

- Write the context file into the same per-build temp lifecycle as the
  overlay (e.g. alongside or inside a sibling of the overlay dir created by
  `makeOverlayDir` — it must be OUTSIDE the source tree, never watched, never
  scanned into the overlay namespace, and removed with the overlay in both
  the failure and `finally` cleanup paths). If placed inside the overlay dir
  itself it would be scanned as a generated file — that is wrong; keep it out
  of the scanned tree.
- Content (explicit key order, two-space JSON, trailing newline):

```json
{
  "schemaVersion": 1,
  "unifyVersion": "<package.json version>",
  "command": "build" | "dev" | "watch" | "audit",
  "paths": {
    "sourceRoot": "<absolute>",
    "generatedRoot": "<absolute>",
    "outputRoot": "<absolute>"
  },
  "site": {
    "baseUrl": "<--base-url exactly as given, or null>",
    "prettyUrls": true|false,
    "canonical": "auto" | null
  },
  "outputs": {
    "catalog": "assets/unify/catalog.json" | null,
    "searchCorpus": "assets/unify/search-corpus.json" | null
  }
}
```

  - `unifyVersion` read from package.json at build time (works under bun,
    node, and the compiled binary — verify how other code reads the version
    for `--version` and use the same mechanism).
  - `command` is the actual subcommand (`resolveSettings` returns it; thread
    it to the generator call — audit runs generators too).
  - `outputs` values are the output-root-relative artifact paths when the
    corresponding flag is on, else null.
  - Nothing else: no settings dump, no env, no internal option names.
- Spawn: `[...runtimeArgs, generatorAbs, root, overlayDir, contextPath]` —
  the `--no-install` bun guard still rides in front of the script path and
  must not shift the generator's argv (GEN-11's existing rule).
- Fresh context per rebuild (watch/dev): the existing fresh-overlay-per-build
  structure gives this for free — verify, don't add machinery.

## Part 2 — spec + rules.tsv

- **§33.2**: the contract gains argv[4] — additive, with the context's field
  table, its versioning rule (own `schemaVersion`, starts at 1), its
  lifecycle (temp, read-only input, deleted with the build's generator state,
  never published, fresh per rebuild), and the boundary restated: stable
  machine-contract fields only, no build internals, no manifest (it does not
  exist yet — §33.5's ordering is unchanged).
- **rules.tsv**: update GEN-02 (argv layout now names argv[4]) and add one
  new GEN- row (e.g. GEN-12) for the context contract. GEN-11's "does not
  shift argv" claim now covers argv[4] too.
- **docs/cli-reference.md** `--generate` section: show the three-argument
  contract with a context example.

## Part 3 — tests + guides

- Extend `tests/conformance/generate.test.js` (behavior tier) per brief
  §29.6, with `covers()` for the new/updated rules:
  - argv[2]/argv[3] unchanged (existing probe test extended);
  - argv[4] exists, is absolute, names readable JSON with `schemaVersion: 1`;
  - effective values: baseUrl/prettyUrls/canonical reflect the flags;
    `outputs.catalog`/`searchCorpus` reflect `--catalog`/`--search-corpus`
    and are null without them; `command` is right for `build` and `audit`;
  - the context file is gone after the build (success and failure paths);
  - the context path is outside the source root and its file does NOT appear
    in `dist/` or in `--dry-run` rows;
  - a generator that ignores argv[4] behaves exactly as before (existing
    tests remain green untouched — that is the assertion);
  - under bun, `--no-install` still in execArgv and argv indices unshifted.
- `docs/guides/eleventy-htmx.md`: update the generator example to read the
  context (e.g. base URL) with a graceful fallback when argv[4] is absent is
  NOT needed — 0.9's contract always passes it; keep the example simple and
  correct against the new contract. `docs/integrations.md` generator section:
  document the third argument the same way.

## Definition of done

Full gate green. Existing generator tests unmodified except where the
contract grew. No plugin API, no env vars, no settings serialization beyond
the stated fields.

## Out of scope

Product-spec wording (B6), emitters (never — out of 0.9 entirely).

---

## Addenda after B4 (binding)

- `outputs.catalog`/`outputs.searchCorpus` read the `CATALOG_PATH`/
  `SEARCH_CORPUS_PATH` constants from `src/core/catalog.js`/`search-corpus.js`
  — never a second string literal.
- `context.site.baseUrl` follows B4's resolution: the parsed
  `base.origin + base.pathPrefix` (the same value catalog.json and audit JSON
  now agree on), null without the flag — not the raw flag string.
- `tests/unit/docs-sync.test.js` requires every parsed option to be named in
  product-spec and cli-reference — B5 adds no options, but if any doc line it
  checks names the generator contract, keep it in sync.
- The examples under `examples/` and the CI workflows now use
  `--catalog --search-corpus` (B4's fix); if the eleventy guide's generator
  example shows build commands, keep them consistent.
