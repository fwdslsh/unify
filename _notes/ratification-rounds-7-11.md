# Ratification rounds 7–11 — the build becomes the judge, and the diagnostics get tested

**Date:** 2026-08-12. Continues `_notes/ratification-round-1.md` and the results table in
`docs/ratification-protocol.md`.

Two changes to the method, both of which changed what the experiment can see:

1. **`unify build --dry-run --strict` is now the verdict**, run by me against every sample.
   Rounds 1–6 were judged by reading the files. That instrument was weaker than anyone
   involved believed — see the round 7 result.
2. **The error contract is now under test too.** Round 8 hands an agent a *broken* site and
   asks it to repair it, with the tool's own messages as the only documentation. Nothing
   had ever tested that surface, which is far larger than the 60 lines.

---

## Round 7 — the round-5/6 fixes, on a brief they were not written for

**Samples:** 5 Haiku + 1 Sonnet. **Isolation:** all six answered NO to the project-context
question; no retired vocabulary in any sample.

**Brief:** a furniture workshop — journal in Markdown with search summaries, social preview
images and visible dates; a wider journal layout with identical chrome; a footer that
differs on Contact only; an embeddable page with no chrome; a page inside the journal
folder that must use the site layout. (Round 5b's brief text was never committed, so this
is a *new* brief with the same properties. That is the stronger test anyway: the protocol's
rule is that a fix is only tested when a round it was not written for comes back clean.)

**Sweep — `unify build --dry-run --strict` on each sample:**

| Sample | Exit | What the build said |
|---|---|---|
| haiku-1 | 1 | P18 invalid YAML; A04 page-side `<slot>`; cascade P13 |
| haiku-2 | 1 | 3× P13 (og:image files never created); 8× A03 chrome duplicated into pages; A04 |
| haiku-3 | **0** | clean |
| haiku-4 | 1 | P18 invalid YAML; A04 page-side `<slot>`; cascade P13 |
| haiku-5 | 1 | 3× P13 (og:image files never created); wrong layout on the override page |
| sonnet-1 | **0** | clean |

**1 of 5 Haiku.** The bar is 4 of 5. Rounds 3–6 recorded 6/6 and 6/6 on hand inspection;
the number moved because the instrument did, not because the doc got worse. **Every clean
result before round 7 should be read as "no violation a human reviewer noticed."**

### Finding 1 — the named-slot fill: 4 of 5 Haiku could not write one (documentation)

The brief compels exactly one fill (the Contact footer). What the samples wrote:

| Sample | Contact footer | Result |
|---|---|---|
| haiku-1 | `<slot name="footer">…</slot>` *in the page* | A04 — never filled anything |
| haiku-2 | `<slot name="footer">` nested inside a page `<footer>` | A04 |
| haiku-3 | a third layout, `_contact-layout.html` | avoided the mechanism |
| haiku-4 | `<slot slot="footer">…</slot>` | A04 — both spellings at once |
| haiku-5 | `<div slot="footer">` | correct |
| sonnet-1 | `<address slot="footer">` | correct |

Triage. Not contamination; not an outlier (three samples, one mistake, plus one avoidance);
the spec is right — a `<slot>` in a page is A04 and always has been. The doc caused it, and
the mechanism is the one the protocol has already named twice: **the rule showed the
layout-side literal and never showed a fill.** `<slot name="footer">fallback…</slot>` was
the only concrete element in the rule, so that is the string that got copied into the page.
haiku-1's report quotes the sentence, states the rule correctly, and then writes the wrong
thing — the same shape as round 1's title finding, mirrored.

The consequence is worse than a failed build: `unify build` without `--strict` exits 0 and
publishes the page with the layout's fallback footer *and* the address loose in the body.

**Amendment:** the rule now shows the page-side literal — `<footer slot="footer">…</footer>`
— and says outright that a `<slot>` tag in a page fills nothing.

### Finding 2 — a colon in a title breaks the build: 2 of 5 (documentation)

`title: Finish: The Last Quarter` and `title: Mortise and Tenon: The Foundation` are both
invalid YAML, and both agents shipped them. The word **YAML** did not appear anywhere in
the 60 lines, so nothing told an author that frontmatter values have quoting rules at all.
The engine's message is right and located on the right line; the samples never saw it,
because they had no build.

Not a spec defect: deviating from YAML here would be worse than the footgun.

**Amendment:** the Markdown section now opens `Frontmatter is YAML: quote any value
containing a colon — title: "Finish: the last quarter"`.

### Finding 3 — `og:` flat spelling holds (the round 5/6 fix, now tested)

**6 of 6 wrote flat `og:image:`; zero wrote a nested block**, on a brief the fix was not
written for. Under the pre-round-5 rule every one of these samples would have failed. This
fix is now *tested*, not merely fitted.

The title-separator fix from rounds 1–2 also held: 6 of 6 layouts carried `— Marrow & Pine`
and every page wrote its bare name.

### Not amended

- **Missing `og:image` files** (haiku-2, haiku-5): they named a preview image and never
  created one, so the reference check failed the build. Correct behaviour, real broken
  site, but not a rules defect — 3 of 5 samples made a placeholder without being told to.
  It is partly a harness artifact: a sandbox has no images. Future briefs of this shape
  should seed an `images/` folder.
- **haiku-2 duplicating chrome into every page** (8× A03) and **haiku-3's third layout**:
  one sample each, no pattern. Recorded, watched. These are the `<include>`-avoidance
  pattern the handoff flagged; on this brief 5 of 5 did use `<include>`, so the sharper
  version of that concern did not reproduce.
- **haiku-5 pointing the override page at the journal layout**: it used `data-layout`
  correctly and aimed it wrong. Brief comprehension, not rules. Outlier.

---

## Round 8 — can the diagnostics alone repair a site?

The experiment the handoff called the most valuable untried idea. Pre-registered in
`_notes/ratification-round-8-preregistration.md` **before any sample ran**.

**Fixture:** a seven-page site with eight planted problems (P01, P03, P04, P08, P10, P12,
P13, P15) and two advisories (A01, A02), every page carrying a unique `MARKER-*` sentence.
**Brief:** make `unify build --dry-run --strict` exit 0; lose nothing the site says.

**Arms:** A — the CLI and nothing else (3 Haiku + 1 Sonnet). B — the CLI plus the 60 lines
(3 Haiku). Two arm-A runs died on a transient proxy TLS error before starting and were
re-run; that failure is the harness's, not the agents'.

**Result: 7 of 7 reached exit 0.** Every planted fault was repaired in every sample,
including the four samples that had no documentation at all. Repair took 2–4 build runs.
The error contract, on this fixture, *is* sufficient documentation for repair.

**One sample lost content**: arm B's haiku-2 deleted `contact.html` outright — with the
shop's address and phone number — to resolve the collision. It was following the message:
`fix: rename or remove one of the sources`. The brief forbade exactly this; the diagnostic
suggested it anyway.

### What the samples said about the messages

- **Clear and sufficient, unanimously**: P01 (include not found), P03 (include takes no
  content), P10 (frontmatter in HTML), P12's *problem* line, A01 (void include).
- **P04 misled 2 of 5.** `fix: layouts are paths — write layout: /_layout.html` printed the
  **Markdown** spelling on an **HTML** page. Two arm-A samples went looking for a `layout:`
  key in an HTML file; one reported the message as "initially misleading", and both
  eventually worked out that *removing* the selection was the better repair — which the
  message never mentioned.
- **P08's fix line prescribes a refactor that backfires.** It says to mark the region with
  `<slot name="content">` in the layout and `slot="content"` on the page. haiku-1 tried it,
  put a `<slot>` in the page, hit A04, and reverted — reproducing round 7's finding from
  inside a diagnostic.
- **A04 had no `fix:` line at all**, so a sample that lands there is told what was dropped
  and not what to write.

### Hypotheses that did not survive

H1–H3 predicted that cascade noise would cause wrong edits. **It did not.** The fixture
prints 17 problems for 8 faults — a page that fails to compose emits no file, so every link
to it from shared chrome is reported as broken, at the fragment's line, advising a spelling
check on a path that is correct; and the same diagnostic repeats once per composed page
containing that fragment. No sample was misled by any of it: they fixed the real fault and
the phantoms vanished on the next run. **Recorded and not acted on** — the honest reading is
that my objection is aesthetic until a sample is actually harmed by it. Worth re-testing on
a fixture with twenty pages rather than seven, where one bad link in a nav would print
twenty identical lines.

### Changes made (engine, message prose only — §14.1 makes message text non-contract)

1. **P12** — `rename one of the sources, or merge them into one`. Both named edits preserve
   every source's text. Evidence: an actual content loss.
2. **P04** — the fix now prints the spelling of *this* page's kind (`data-layout="…"` for
   HTML, `layout: …` for Markdown) and adds `or drop the layout selection to use the
   nearest _layout.html`. Evidence: 2 of 5 independently confused.
3. **A04** — a page-side stray `<slot>` now carries
   `fix: to fill a layout slot, put slot= on a real element: <footer slot="footer">…</footer>`.
   A layout's own head slot still carries none. Evidence: round 7's 3-of-5, plus round 8's
   sample that reproduced it while following P08's advice.

Each has a test: two assertions in `tests/unit/core/`, and a new landmine
`layout-bare-name-html` — the existing P04 fixture used a Markdown page, which is precisely
why the wrong-spelling bug survived to be found by an agent instead of by the suite.

---

## Rounds 9 and 10 — measuring the amendments

Both re-run the earlier round's **unchanged** brief and fixture against the amended doc and
the amended messages. Both are therefore *fitted* rounds: they can show a fix failed, but a
clean sweep here is weaker evidence than the same brief coming back clean two rounds later.

**Round 9** (round 7's brief, amended doc): **5 of 5 Haiku wrote a correct `slot=` fill on a
real element** — `<footer slot="footer">` four times, `<div slot="footer-text">` once — where
round 7 managed one. Zero stray `<slot>` tags in any page. Every Markdown title containing
a colon was quoted; zero P18. Overall 4 of 6 built clean, and *both* misses were the same
non-doc artifact as round 7: an `og:image` naming a file the sandbox could not produce.

**Round 10** (round 8's fixture, amended messages): arm B **3 of 3 clean with nothing lost**,
where round 8 lost a page's address. All three merged instead of deleting, and one quoted
the new wording back — "with fix instruction to rename or merge". Arm A 3 of 3 clean, no
loss, one sample renaming rather than deleting.

One amendment did **not** fully land: an arm-A sample still reported having to "infer that
it needed to be deleted rather than fixed to a path" for P04 — even though the message now
carries `fix: or drop the layout selection to use the nearest _layout.html`. It made the
right repair. Recorded as unresolved; if a later round repeats it, the phrasing should name
the literal thing to delete (`remove the data-layout attribute`) rather than describe it.

---

## Round 11 — the three surfaces no brief had reached

**Samples:** 5 Haiku + 1 Sonnet, each with the CLI in its sandbox (this brief is about
publishing, so the tool's own output is legitimately part of the loop).

**Brief:** a field station handbook published to `https://ellwood.github.io/handbook/` —
a subpath — with `.html`-free addresses, a `_headers` deployment file that must arrive at
the top of the published output, an index that lists every entry without anyone editing it,
and a logo in shared chrome used one folder down.

That compels, in one job: `--base-url`, `--pretty-urls`, the `_headers`/A14 seam, the
`_scripts/` generator seam, and URL provenance. **Nothing in eleven rounds had touched any
of them.**

**Result: 5 of 6.** Five samples published correctly — `_headers` at the output root with its
exact contents, every root-relative link carrying the `/handbook/` prefix (39, 39, 39, 47 and
83 of them), every page at a pretty URL, and a working generator in `_scripts/`. The A14
advisory did its whole job: samples hit it, read the `--exclude` recipe it prints, and used
it verbatim. The `_headers` seam and the `_scripts` seam both work as designed.

### Finding — `--base-url` is missing from the doc, and one sample invented a fact instead

haiku-4 published with `--pretty-urls` and no `--base-url`: **0 of 47 links carry the base
path**, so every link on the deployed site 404s. The build exits 0 and says nothing, because
the reference check runs against the output tree, where every one of those links resolves —
the prefix only matters at the host.

What makes this a documentation defect rather than a slip is its report. It diagnosed the
problem exactly right:

> "when the site is deployed to a subdirectory, root-relative links like `/safety/` would
> incorrectly point to `https://ellwood.github.io/safety/` instead of
> `https://ellwood.github.io/handbook/safety/`"

…quoted the rules sentence that names **`--pretty-urls`** while omitting its sibling, concluded
no such mechanism existed, and invented one: *"rely on GitHub Pages to handle the subdirectory
routing… the site works correctly because GitHub Pages serves the site from the correct
subdirectory context."* It then built a second layout to work around the limitation it had
imagined — the same cascade as round 1's haiku-3, where a missing sentence became an
architectural decision.

Two other samples reached the flag only by going outside the doc: *"the rules… do not
explicitly document `--pretty-urls` or `--base-url`, though the help output does. I used the
tool's own help documentation."* So three of six were affected by the omission, one fatally.

**Amendment:** the flag is now named where its sibling already was —
`--base-url /handbook/` prefixes every root-relative link for a subpath host.

I had written this up as *not* a defect after the first three samples, on the grounds that
the rules doc is the authoring surface and `docs/cli-reference.md` documents the flags. The
fourth sample settled it: the doc had already decided that `--pretty-urls` and `--exclude`
belong in those 60 lines, and naming one of a pair is worse than naming neither.

### Finding — "run first" does not say who runs it (documentation)

The intro's five words about derived files —

> Derived files (a post index, a feed) come from a script in `_scripts/`, run first.

— left three independent samples uncertain about the one thing they needed to know:

- haiku-2: *"The rules do not specify whether scripts are automatically executed by the
  build tool or run manually beforehand. I tested by attempting a build and confirmed unify
  does not auto-run scripts."*
- haiku-3: *"**Uncertainty:** whether the field notes index should be generated before the
  build, or if unify would handle calling the script automatically."*
- haiku-5 filed it as an open "Issue" and resolved it by trial.

Every one of them resolved it correctly, so **no output failed** — this is an amendment made
on self-report evidence alone, which is a weaker basis than the others in this document and
is recorded as such. It earns its place because the repair is the protocol's standard one
and costs nothing: replace the description with the literal command, which the getting
-started guide has carried all along (`node _scripts/gen.mjs && unify build`). A clause that
makes three of six readers stop and run an experiment is not carrying its line.

### A brief-design lesson worth keeping

To stop round 7's missing-image artifact recurring, this brief said "you have no image
files: write a small placeholder SVG". Four of six then inlined the SVG directly into the
markup — which is valid, and which **dodged the URL-provenance probe entirely**, since an
inline `<svg>` has no URL to rewrite. The hygiene fix quietly deleted one of the five
things the brief was built to test. Seed a real asset file next time instead of asking for
one.

---

## Status of every fix in this document

| Fix | Evidence it was made on | Tested by a round it was not written for? |
|---|---|---|
| `og:` keyed off the key name (round 5) | 4/6 wrote the rejected spelling | **Yes** — round 7, 6/6 flat, and again in round 9 |
| Layout title separator (rounds 1–2) | 3/4 Haiku wrong | **Yes** — 6/6 in round 7, 6/6 in round 9 |
| Named-slot fill shows the page-side literal | 4/5 Haiku wrong | No — fitted; round 9 is the round it was written for |
| Frontmatter is YAML, quote colons | 2/5 broke the build | No — fitted |
| P12 "rename or merge", not "remove" | one real content loss | No — fitted (round 10, 7/7 preserved) |
| P04 spelling per page kind, plus the drop-it repair | 2/5 misdirected | No — fitted, and **one round-10 sample still reported inferring it** |
| A04 names the fill spelling | round 7's 3/5, round 8's reproduction | No — fitted |
| `--base-url` named beside `--pretty-urls` | 1/6 published a wholly broken site; 2 more went to `--help` | **No — not yet measured at all** |
| `_scripts/`: show the command | 3/6 self-reported the ambiguity | **No — not yet measured at all** |

The last two are the ones a successor should measure first: re-run round 11's brief
unchanged against the amended doc. Nothing else in this table needs a new experiment before
that one.

## Open, in priority order

1. **Re-run round 11's brief unchanged.** Two amendments are sitting on zero measurements.
   Seed a real image file in the sandbox this time (see the brief-design lesson above) so
   URL provenance is actually exercised rather than inlined away.
2. **Re-run round 7's brief with images seeded.** It is the only way to settle whether the
   `og:image`-to-a-nonexistent-file failure (2/5 in round 7, 2/5 in round 9, same shape both
   times) is a harness artifact or a missing rule about the reference check. Do not amend
   the doc for it until that discriminator has run — it is the one recurring failure in
   this document with no confident triage.
3. **Cascade noise, on a bigger site.** Round 8's fixture prints 17 problems for 8 faults,
   and the same diagnostic once per composed page containing the offending fragment. It
   misled nobody at seven pages. Twenty pages with one bad nav link would print twenty
   identical lines; that is where to test it, and only then decide whether the reference
   check should dedupe by (file, line, message) and skip targets whose source page exists
   but failed to compose.
4. **The human half is still untested.** Eleven rounds, all models. The stated goal covers
   people, and a person who knows HTML but not this tool would fail differently — they stop
   and re-read where a model guesses and moves on.

**One tension to watch, not yet a finding.** The rules doc closes with *"`--exclude`
**replaces** the `_*` default; keep `_*` in your list"*, while the supported way to ship
`_headers` is to replace `_*` with narrower globs — exactly what A14's `fix:` line prints.
Six of six samples quoted the doc line and then followed the advisory instead, correctly, so
nothing failed and nothing is amended. But the doc's general advice and the deployment recipe
do point in opposite directions, and one of them is a build message rather than a rule. If a
later round produces a sample that keeps `_*` and ships no headers, that is the finding.

## The `<include>` question, closed

The handoff asked whether the ~quarter of samples that duplicate chrome across two layouts
instead of sharing a fragment is a documentation problem. On a brief that states the
maintenance requirement in content terms — *"there must be exactly one place to edit if the
navigation changes"* — **10 of 11 samples across rounds 7 and 9 used `<include>`**. The one
that did not wrote its two layouts with duplicate headers and never mentioned includes as a
difficulty in its report; nothing in it suggests confusion about the text.

That is a preference, not a defect, and the fix would have to be an exhortation. Not
amended. Recorded as closed unless a brief that states the requirement produces a cluster.
