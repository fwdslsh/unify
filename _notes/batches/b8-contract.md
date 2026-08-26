# Batch B8 — pre-release: the catalog/search example + release administration

Read first: `docs/guides/catalog-and-search.md` (the tested recipe this
example embodies), `docs/cli-reference.md` (`--catalog`, `--search-corpus`,
`--generate`), conformance-spec §30/§33, `examples/README.md` and two existing
examples end to end (`examples/seed-library`, `examples/eleventy-htmx`) for
the house shape of an example (README voice, `src/` layout, how CI's G13 jobs
discover and build them — read `.github/workflows/test.yml`'s two example jobs
and `deploy-docs.yml` before touching anything).

## Objective

Ship the runnable companion to the 0.9 features — one example that
demonstrates the catalog, the search corpus, and the generator context
together — and finish the administrative sweep that must precede tagging
0.9.0. **Out of scope for this batch: `docs/ratification.md`,
`docs/ratification-protocol.md`, and `_notes/ratification-round-29-*` — a
ratification round is running in parallel and its record lands separately.**

## Part 1 — the example

New `examples/catalog-search-blog` (name final unless a strong reason emerges
— then say so): a small blog whose browse/filter/search UI is data-driven
from the two generated artifacts, demonstrating:

- Markdown posts with arbitrary metadata (`tags`, a custom `series`, dates,
  descriptions) — inert metadata made meaningful by the consumer, the 0.9
  posture.
- A listing page whose client-side module fetches `catalog.json` relative to
  its own URL (the guide's subpath-safe pattern), renders newest-first, and
  filters by tag and series.
- Client-side full-text search over `search-corpus.json`, joining hits back
  to catalog entries by `path` — dependency-free (the guide's substring
  approach; no npm packages, so the example belongs to CI's dependency-free
  G13 job).
- A small `--generate` script that reads `generator-context.json`
  (argv[4]) — e.g. stamping `og:url` or the feed the way the eleventy example
  does, but in plain node with no dependencies — so the context seam is
  demonstrated without Eleventy.
- A README in the examples' established voice: what it shows, the exact build
  command (`--catalog --search-corpus --base-url … --pretty-urls`), what to
  open, and what each generated artifact contains.

Requirements:

- Every command and literal in the README must be executed against the real
  CLI before it is written down (the repo's every-literal-tested posture).
- `unify build --dry-run --strict` on the example exits 0; the real build
  emits both artifacts at their exact paths with valid JSON.
- Wire the example into whatever mechanism the G13 jobs use to enumerate
  examples (read the workflow first; if enumeration is automatic by
  directory, verify the new example is picked up; if it is a list, extend
  it) and into `examples/README.md`'s index.
- Behavior of the product does not change; `src/**` is untouched.

## Part 2 — release administration

- `README.md`: present the 0.9 surface honestly — if the feature list or
  examples table predates catalog/corpus/generator-context, bring it current;
  do not rewrite the document's voice.
- `.github/workflows/release.yml`: read it end to end against the 0.9 reality
  (artifact names, gates it runs, CHANGELOG extraction) and fix only what is
  factually stale; report "nothing stale" explicitly if so.
- `docs/testing-strategy.md`: sweep for statements the 0.9 batches made false
  (module names, artifact names, gate descriptions); minimal edits.
- `docs/` cross-check: `grep -rn "search-index\|taxonomy-inert\|PageRecord"
  docs/ examples/ README.md` — every hit is either deliberate history
  (migration-plan, ratification records, CHANGELOG) or a defect to fix; list
  each hit with its disposition in your report.
- `package.json` `files` list: confirm the npm package ships what 0.9 needs
  and nothing it should not (the new example ships in the repo, not the npm
  package — confirm rather than assume).

## Part 3 — validation

Full gate (fresh ledger `bun test` with a 300000ms timeout,
`check-traceability.mjs --runtime` and `--static` against the empty baseline,
`check-module-graph.mjs`, `check-suite-hygiene.mjs`), plus: build the new
example exactly as CI's G13 job will, under bun AND node, and diff the two
runs' `dist/` trees (must be byte-identical).

## Ground rules

No new dependencies anywhere. No `src/**` changes (if the example exposes a
product bug, STOP and report it rather than patching around it — that is a
finding for the orchestrator, not something to absorb into the example).
