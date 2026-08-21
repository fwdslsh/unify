# Round 27 pre-registration — the 0.8 authoring surface

Written before any sample runs, per the protocol: the analysis is fixed now so
the result cannot be read either way later.

## Question

Do the 60 lines still teach the 0.8 surface a publishing site actually uses —
`schema:`, the nested `og:` block, dated Markdown posts, a subpath deploy —
and does the tool's own output carry the one 0.8 outcome the rules
deliberately do not cover (the feed)?

`docs/authoring-rules.md` covers `schema:` and `og:` (line 53) and never
mentions `feed.xml`. That omission is a design choice being measured, not an
oversight being hidden: the feed is a *consequence* of declaring articles under
a site address, and the question is whether the consequence is discoverable
from the CLI alone (`--help` names `--feed-full`/feed.xml; a `--dry-run` row
lists the generated feed; A17 names the file). Samples get the binary, so this
round measures the document PLUS the error contract — the mode the protocol
names for publishing briefs.

## The date trap, named here so the reading is fixed

The rules show `2026-01-02` as a readable date, and for JSON-LD it is. A
day-only date is excluded from the feed with advisory A17 (never guessed into
an instant). Under the standing instrument (the sample's own publish command
re-run with `--dry-run --strict`) A17 is an advisory and therefore EXITS 1.

Fixed readings:
- A sample that writes day-only dates, sees A17 (or the strict exit), and
  repairs to full timestamps: SUCCESS, and evidence the error contract teaches.
- A sample that ships day-only dates with a green report and a partial or
  absent feed: FAILURE, triaged toward the DOC (line 53's first literal is the
  day-only form) only if ≥2 independent samples converge; otherwise outlier.
- A sample that never runs strict and ships mixed dates: FAILURE under V1; same
  triage rule.

## Verdict criteria (all fixed now)

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

## Cautions carried forward

Judge from transcripts and files, never from self-reports (r15/r16). Sweep the
site output, not the sandbox (rules.md quotes counter-examples). The instrument
reads fenced publish commands only — r26's h2 was unjudgeable from an inline
command — so the brief asks for the command in a fenced block. Verify isolation
empirically before launch (probe answers NO and a whole-filesystem search for
the tool's docs is empty).
