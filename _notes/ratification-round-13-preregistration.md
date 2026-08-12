# Round 13 — pre-registration (written before any sample ran)

## The question

`--base-url` has two forms with one scope (§11.3). The **full-URL form** additionally
absolutizes `og:`/`twitter:` meta content and the canonical link — "the elements crawlers
require to be absolute", in the spec's own words. The **path form** leaves them
root-relative, which by that same rationale is metadata no crawler will use.

Rounds 11 and 12 asked for a subpath deploy and gave the full deploy URL in the brief:
**12 of 12 samples published with the path form.** Neither brief asked for social
previews, so nothing was harmed. Rounds 7 and 9 asked for `og:image` with no subpath.
The combination — the one where the trap lives — has never been tested.

Nothing the samples possess names the full-URL form: the 60 lines show
`--base-url /handbook/`, and `unify --help` says `--base-url <path> — site served from a
subpath: prefix root-relative links in the output`. If the trap fires, it implicates all
three surfaces at once (doc, help text, and possibly the spec's severity choice), and the
triage is to decide which.

## Design

5 Haiku + 1 Sonnet, CLI in sandbox (publishing brief — the build is legitimately in the
loop). New brief, deliberately: an observatory site with Markdown log entries, each
requiring "a preview image that displays when someone shares the entry on Facebook,
LinkedIn and Slack" (round 7's phrasing, which compelled `og:image` 6/6), deployed to
`https://saltmarsh.github.io/outreach/` with `.html`-free addresses (round 11's shape).

A real `images/` directory is **seeded into the sandbox** — logo plus three photos — and
the brief says to use them. This closes the round-7/9 artifact (samples referencing image
files they had no way to create) and finally exercises URL provenance with an actual
asset file, which round 11's "write a placeholder SVG" instruction accidentally dodged.

## Verdict, mechanical

Build each sample with its own recorded publish command; extract every
`og:image`/`twitter:image` `content` from the built entry pages; classify:

- **WORKS** — absolute URL with the right origin and subpath.
- **DEAD** — root-relative or `/outreach/`-prefixed (crawlers ignore it; green build).
- **ABSENT** — no social meta at all (failed the brief, different finding).

Also recorded: the `--base-url` form chosen; whether any sample hand-wrote absolute URLs
in frontmatter (valid); whether any wrote *relative* og: values (dead in every form, and
outside §11.3's scope entirely).

## Hypotheses, stated in advance

- **H1:** ≥4 of 6 write root-relative `og:image:` values in frontmatter — the doc's own
  example is `og:image: /card.png`.
- **H2:** ≥4 of 6 publish with the path form, shipping DEAD social metadata with exit 0,
  while their report claims the share requirement is met. This is the round-5 `og:` shape
  one layer up: valid-looking output, silently ignored by every scraper, on the exact
  feature the brief requested.
- **H3:** 0–1 samples discover the full-URL form at all.

## If H2 holds — the repairs on the table, decided only with the evidence in hand

(a) the doc's `--base-url` clause shows the full-URL form; (b) `--help` names it;
(c) the advisory catalogue's **one free slot** (11 of 12) goes to "og:/twitter: meta
emitted with a root-relative URL" naming the full form as the fix. (c) is a spec
amendment — rules.tsv + fixture in the same commit — and must first survive the
discipline check: `unify init && build --dry-run --strict` exits 0, so it depends on
whether any scaffold template ships `og:` frontmatter. To check before deciding.

If instead samples hand-write absolute URLs or find the full form, the finding shrinks to
a doc line at most — record and stop.
