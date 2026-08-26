# Round 29 pre-registration — the 0.9 engine under the ratified surface

Written before any sample runs, per the protocol: the analysis is fixed now so
the result cannot be read either way later.

## Question

Release 0.9.0 rebuilt the engine under the rules — the final-document model
replaced `PageRecord`, feed membership widened to inclusion over declared
types, heading scope narrowed to `<main>`, `search-index.json` became the
catalog/corpus pair, and §12's second fix line (round 27's own repair) now
names four generated paths. `docs/authoring-rules.md` changed by one sentence
(`tags`/`categories` are no longer reported by `unify audit`). Does the
ratified publishing surface still hold — same brief, same bar — on the new
engine?

This is the protocol's fitted→tested check pointed at the *implementation*
rather than the doc: round 27's brief, byte-unchanged (`_notes/BRIEF-r27.md`),
against a CLI none of its rounds ever ran. It also tests, for the first time,
the §12 feed fix-line repair that round 27 itself produced (fitted there,
measured here: the 2/5 premature-`/feed.xml` P13 confusion must not recur in
its old form).

## Verdict criteria (round 27's, unchanged, all fixed now)

- V1 build: the sample's own publish command, re-run with `--dry-run --strict`
  appended, exits 0. (The standing instrument, `_notes/judge-round.mjs`.)
- V2 feed: `dist/feed.xml` exists with ≥4 entries and every entry `<updated>`
  carries a time-of-day.
- V3 structured data: every post page carries `application/ld+json` whose type
  is Article/BlogPosting — generated via `schema:` or authored.
- V4 share card: every post page declares `og:image`, absolute under the
  deploy address in the emitted page.
- V5 addresses: published internal links carry no `.html` and resolve under
  https://bellwick.example/workshop/.

Bar: the protocol's standing 4-of-5 Haiku, on all five criteria. The Sonnet
control is the diagnostic comparison, not part of the bar.

## Fixed readings for the 0.9 changes

- The date trap reads exactly as round 27 registered it (A17 repair =
  success; shipped day-only dates with a green report = failure, doc-triaged
  only on ≥2 convergence).
- A sample that expects `unify audit` to say something about `tags:` or
  `categories:` keys, or that avoids those keys citing a warning, is evidence
  about the amended sentence — record it; it fails no criterion.
- Retired 0.8 vocabulary in a sample (`--search-index`, `search-index.json`,
  `taxonomy-inert`) is triage step 1 (contamination) FIRST: none of it appears
  in `rules.md`, so its appearance suspects the sandbox before the doc.
- 0.9-only flags the rules do not name (`--catalog`, `--search-corpus`) used
  correctly are a valid-but-different choice (triage step 0), not a finding.

## Deviations from round 27's setup, declared

- The engine is the 0.9.0 release candidate (`release/0.9.0` @ the commit
  recorded in the round archive), compiled with `bun build --compile` as every
  round's binary is.
- `rules.md` is regenerated from the current doc, as the protocol requires —
  it differs from round 27's by the one amended sentence above. The brief is
  byte-identical to round 27's.
- Round 27's instrument note about demanding the command in REPORT.md is NOT
  applied, because applying it would change the brief while measuring the
  engine; the s1-style risk (command only in the final message) is accepted
  and will be judged unjudgeable-by-instrument as before, with the transcript
  consulted for the triage narrative only.
- Model note, per the protocol's "the bar is a model" caution: samples run on
  the current `haiku` alias (Haiku 4.5) and `sonnet` control alias; exact
  model ids recorded in the archive.

## Cautions carried forward

Judge from files and fresh rebuilds, never from self-reports (r15/r16/r27's
twice-confirmed confident-false-report pattern). Sweep the site output, not
the sandbox. Verify isolation empirically before launch (probe answers NO and
a whole-filesystem search for the tool's docs is empty). Archive the round —
judge-results.json, every REPORT.md, a source tarball — into `_notes/rounds/`
BEFORE judging; this machine's /tmp does not survive resets.
