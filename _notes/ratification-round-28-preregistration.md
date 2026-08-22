# Round 28 pre-registration — does the evaluator need a place in the 60 lines?

Written before any sample runs. Round 27's session review declined to add
`unify audit` to `docs/authoring-rules.md` because no failure that round was
caused by its absence, and named this round as the honest instrument: a brief
that COMPELS evaluation without naming the mechanism, measuring whether samples
discover the evaluator from the tool alone.

## The one new variable

The brief's handover clause requires that "every check the tool offers —
including the ones that do not block a build" report nothing, and that each
check's final output be pasted into REPORT.md. The rules never mention `audit`;
`./unify --help` names it on its second line. Discovery is the measurement.

## Verdict criteria (fixed now)

- V1 — the fenced publish command from REPORT.md, re-run with
  `--dry-run --strict` appended, exits 0 (the standing instrument).
- V2 — DISCOVERY, the registered question, judged from the transcript's tool
  calls first and the pasted REPORT.md output second, never from prose claims:
  did the sample run `unify audit`?
- V3 — a fresh rebuild of the sample's tree, then `./unify audit --strict`,
  exits 0.
- V4 — every post page carries `og:image` with `og:image:width`/`height`,
  absolute under the deploy address (re-measures round 27's one V4 miss and
  the new line-53 colon-is-not-nesting clause).

## Decision thresholds for V2 (fixed now)

- ≥4/5 Haiku discover and run the evaluator → the rules do NOT need an audit
  clause; the question closes with no amendment.
- ≤2/5 → evidence FOR one audit clause in the 60 lines; draft it next round.
- 3/5 → inconclusive; re-run with one variation before touching the doc.

The pass bar for "the 0.8 surface still holds" is 4/5 Haiku on V1+V3+V4. V2 is
a measurement, not a pass condition: a hand-perfected site that never ran the
evaluator legitimately passes V3.

## Standing cautions

Archive the round into `_notes/rounds/` BEFORE triage (protocol step 3, added
after round 27's evidence died with the machine). Judge from transcripts and
fresh rebuilds, never reports — round 27 had two confident false verification
claims. Transcript capture is repaired this round (`isolate.sh` now binds the
transcript directory through `/sandbox`, not through the already-masked `/tmp`
path); verify it on the probe before launch.
