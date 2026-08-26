# Round 29 verdicts (per _notes/ratification-round-29-preregistration.md)

Engine: v0.9.0 @ 5896194. Brief: _notes/BRIEF-r27.md byte-unchanged.
Samples: h1-h5 (haiku), s1 (sonnet control). All exits 0; fresh in-place
rebuilds of each sample's own command preceded criteria checks.

- V1 build (dry-run --strict exit 0): 6/6 — zero problems, zero advisories.
- V2 feed (>=4 entries, every <updated> timestamped): 6/6.
- V3 structured data (Article/BlogPosting ld+json on every post): 6/6.
- V4 share card (og:image absolute under deploy address on every post):
  5/6 — Haiku 4/5. h4 shipped data:-URI SVG og:image on all four posts
  (its report: read the brief's "write a small placeholder SVG" as inline).
  Single sample -> OUTLIER per the registered convergence rule; noted that a
  data: og:image is functionally dead on social crawlers yet builds clean
  (round-13 family; watch).
- V5 addresses (no .html, resolve under /workshop/): 6/6 — h4's two flagged
  hrefs were CSS attribute selectors inside <style> (the r27 instrument
  note's false-positive class; classified by context before counting). The
  dead-selector nav pattern itself recurs (r13/r14/r21, now h4) — cosmetic,
  watched.

ALL-FIVE-CLEAN HAIKU: 4/5 (h1 h2 h3 h5) — the registered 4-of-5 bar is MET.
Control: clean on all five.

Fitted-to-tested results:
- The §12 second fix line (r27's repair): h1 and s1 both hit the premature
  /feed.xml P13 mid-iteration; both received the new generation-condition fix
  line (h1 in both its no-base-url and day-only-dates variants) and repaired
  correctly. The r27 confusion did not recur. TESTED.
- r27's two miss shapes (og: on wrong pages; --pretty-urls never engaged):
  neither recurred. Every sample engaged --pretty-urls (r28's exploratory
  3/5 .html finding also did not recur under this brief).
- A17 taught full timestamps mid-iteration in h1 and h4 (h4's report credits
  the dry-run error, not rules.md) — the error-contract-teaches path again.

0.9-specific observations: zero contamination (no retired vocabulary in any
sample); no sample used tags:/categories: (the amended sentence went
unexercised by this brief — recorded, not claimed tested); no sample
reached for --catalog/--search-corpus (rules.md does not name them; valid).

Instrument notes for round 30: fold the V-criteria into judge-round.mjs
(this round's ad-hoc V5 sweep initially false-positived on the documented
CSS-selector class before context classification — the improvised-judging
ledger gains one more entry, again the experimenter's, not a sample's);
entry-scope the feed alternate-link extraction (the feed-level link
initially miscounted as a fifth post).
