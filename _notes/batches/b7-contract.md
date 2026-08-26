# Batch B7 — cleanup, version 0.9.0, full validation

Read first: `_notes/release-0.9.0-implementation-plan.md`; `CHANGELOG.md`
(match its house style and structure exactly — read the 0.8.x entries);
`README.md`; `.github/workflows/*.yml` (what release validation runs);
`CLAUDE.md`.

## Part 1 — cleanup sweep

- Hunt dead remnants of the removed model across `src/**` and `tests/**`:
  helpers whose only consumers were removed fields, stale imports, comments
  referencing PageRecord/taxonomyKeys/schemaType/search-index as if current
  (history docs in `_notes/`, `docs/migration-plan.md`, `docs/ratification*.md`
  are records — leave them). `bun tests/conformance/check-module-graph.mjs`
  must find no dead module; also verify no module exports anything with zero
  importers left (manual grep per export of document.js/document-selectors.js/
  manifest.js).
- `CLAUDE.md`: update the two passages that describe the old surface (the
  production-and-discovery layer paragraph naming `--search-index`/§30, and
  any PageRecord/manifest wording) to the 0.9 reality, keeping its length and
  tone. `README.md`: update flag lists/examples if they name removed flags
  (check first).
- `examples/` tree: `examples/unify-docs/README.md` mentions search-index —
  update to the new flags if the example's build commands use them.

## Part 2 — version + changelog

- `package.json` → `0.9.0`.
- `CHANGELOG.md`: a 0.9.0 entry in the file's established format, covering:
  the final-document model (snapshot + selectors; PageRecord removed), the
  breaking audit `--format json` page shape, `--catalog`/`--search-corpus`
  replacing `--search-index` (with the new output paths and the path-join
  contract), taxonomy/`taxonomy-inert`/`schemaType` removal, the heading-scope
  change, the feed-membership widening (any declared type), and the generator
  context argv[4]. Breaking changes labeled as such with the upgrade action
  for each (the file's existing "Upgrading" conventions — follow them).

## Part 3 — full validation

Run and report each (fix anything red):

```
rm -f .conformance-ledger.jsonl
CLAUDECODE=1 bun test 2>&1 | tail -5                                   # 300000ms timeout
bun tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl --baseline tests/conformance/phase-gaps/baseline.txt
bun tests/conformance/check-traceability.mjs --static --baseline tests/conformance/phase-gaps/baseline.txt
bun tests/conformance/check-module-graph.mjs
bun tests/conformance/check-suite-hygiene.mjs
```

Then the release-shaped checks:

- Golden path: in a temp dir, `bun /home/user/unify/src/cli.js init` then
  `build --dry-run --strict` (exit 0), then a real build; repeat for the
  `blog` template with `--catalog --search-corpus --base-url https://example.com/`
  and confirm the two artifacts appear at their exact paths with valid JSON.
- Node parity smoke: run the same golden path under `node
  /home/user/unify/src/cli.js` and confirm identical catalog/corpus bytes.
- Compiled binary: if `bun build --compile` works in this environment, build
  the linux binary and run the golden path with it; if the environment cannot
  (missing toolchain), say so explicitly in your report rather than skipping
  silently.
- Final sweep: `grep -rn "search-index\|searchIndex\|taxonomyKeys\|taxonomy-inert\|PageRecord" src/ tests/ docs/ README.md CLAUDE.md examples/`
  → only deliberate historical mentions (migration-plan, ratification
  records, CHANGELOG history) remain; list every hit in your report with a
  one-word justification.

## Definition of done

Everything above green; working tree committed. Report must state each
validation's literal result.

---

## Addenda after B6 (binding)

- B6 already reconciled the taxonomy/search-index wording across docs and the
  scaffold templates (src/templates/shared.js's AGENTS.md text) — the Part 1
  sweep verifies rather than redoes; any hit it finds is a leftover, not
  planned work.
- The `_notes/batches/` contracts and `_notes/release-0.9.0-implementation-plan.md`
  are working documents of this release — leave them (they are the record),
  but give the plan document a short closing "outcome" note if Part 2's
  CHANGELOG work surfaces anything the plan text got wrong.
- Push nothing: the orchestrator owns pushes and merges.
