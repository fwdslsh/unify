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


---

# Outcome addendum (written after judging; the registration above is unedited)

**The registration's own premise was wrong, and saying so is the point of
writing these down.** It claimed `docs/authoring-rules.md` "never mentions
feed.xml"; line 5 teaches the feed outright ("A feed at `/feed.xml` needs no
script…"). The reading error came from a truncated grep during design. Two
consequences: the 5/5 feed result is a DOC success, not tool-discovery; and
h5's paraphrase of that sentence, briefly suspected as a fabricated quote, was
fair — the suspicion is retracted here by name.

**Verdicts** (fresh rebuilds of each sample's own stated command; sandboxes
untouched): V1 5/5 · V2 5/5 (4 entries each, every `<updated>` timestamped,
zero A17 in any final build) · V3 5/5 · V4 4/5 (h1 put the `og:` block on its
three HTML pages and none of its four posts) · V5 4/5 (h2 never engaged
`--pretty-urls` and published `.html` addresses). All-five-clean: **3/5 —
below the registered bar.** Control: clean on all five, and reached for
`unify audit --strict`, `--canonical auto` and `--generate` unprompted.

**Triage.** Both misses are single-sample → outliers under the convergence
rule; no rules.md amendment is warranted by them. The convergent signal (2/5)
was the P13 on a premature `/feed.xml` link, whose fix line — "check the path
spelling and casing" — was wrong on both counts and produced two wrong mental
models. Fixed in §12 (the second fix line naming the generation condition for
`feed.xml`/`sitemap.xml`/`search-index.json`), REF-04, references.js/build.js,
with two-sided tests. h5 also hit A17 mid-iteration and repaired to full
timestamps — the pre-registered "error contract teaches" outcome, observed.

**Both misses were REPORTED AS VERIFIED by their samples** — h1 "og: tags
present" on posts that have none, h2 "No .html extensions" twenty lines under
its own `/workshop/visit.html`. Round 18's confident-false-report pattern,
twice in one round; the fresh-rebuild judging step is what caught both.

**Instrument notes for round 28.** (1) No `.transcripts/` were captured this
round — the per-sample bind in `isolate.sh` produced nothing; judging leaned
on artifacts, stdout, and fresh rebuilds instead. Diagnose before the next
round. (2) s1 put its publish command in its final message, not REPORT.md, so
`judge-round.mjs` could not judge it — second round running; consider having
the brief demand the command IN REPORT.md. (3) A naive `.html`-link sweep
false-positived on CSS attribute selectors inside `<style>` (h3); classify
matches by context before counting.
