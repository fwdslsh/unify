# Ratification rounds 7–17 — the build becomes the judge, and the diagnostics get tested

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

## Round 12 — measuring round 11's two amendments

Round 11's brief and prompt, byte-identical, against the amended doc. Fitted, and stated as
such. (The brief was deliberately *not* changed to seed an image file, even though that
would have closed the URL-provenance gap: the two amendments under test are the measurement,
and changing the environment and the doc together makes a result unattributable. Provenance
stays open for a deliberately new brief.)

**5 of 5 Haiku, and the Sonnet control.** Every sample:

- published with `--base-url /handbook/` — **39, 39, 47, 39, 37 and 71 root-relative links,
  all prefixed, none missed.** Round 11's failure mode did not recur, and no sample reported
  going to `--help` to find the flag.
- wrote its generator as `gen.mjs`, the literal name the amended line now shows, and ran it
  before the build. haiku-1 wrote out the exact composition the doc demonstrates:
  `node src/_scripts/gen.mjs && ./unify build --base-url /handbook/ …`
- shipped `_headers` at the output root by way of the A14 recipe, at pretty URLs.

**Zero samples reported the "does unify run my script?" ambiguity** that three of six raised
in round 11. That was the amendment made on self-report evidence alone, and the self-reports
are where it shows up as fixed.

One valid variation: haiku-3 put `_scripts/` beside the source root rather than inside it.
The script is not part of the site, so that is arguably tidier; not a finding.

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
| `--base-url` named beside `--pretty-urls` | 1/6 published a wholly broken site; 2 more went to `--help` | No — fitted (round 12, 5/5, every link prefixed) |
| `_scripts/`: show the command | 3/6 self-reported the ambiguity | No — fitted (round 12, 5/5 ran a `gen.mjs`, nobody asked who runs it) |

Nothing in this table is now *tested* except the two oldest fixes. Every round-7-onward
amendment has been measured exactly once, by the round it was written for. The next
unfitted measurement of any of them is worth more than a new experiment.

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

---

## Round 13 — og:image under a subpath deploy (pre-registered)

Pre-registration: `_notes/ratification-round-13-preregistration.md`, committed before any
sample ran. **Samples:** 5 Haiku + 1 Sonnet, CLI in sandbox, a real `images/` directory
seeded (closing the round-7/9 missing-image artifact). **Brief:** an observatory site whose
log entries are reached "through links shared on Facebook, LinkedIn and Slack", deployed to
`https://saltmarsh.github.io/outreach/` at pretty URLs.

**Result — the pre-registered hypotheses held almost exactly:**

| Sample | `--base-url` form | og:image in built output | Verdict |
|---|---|---|---|
| haiku-1…5 | `/outreach/` (path) | `/outreach/images/card-*.png` | **DEAD** — no crawler can fetch it; exit 0 |
| sonnet-1 | `/outreach/` (path) | `https://saltmarsh.github.io/outreach/…` | works — absolute URLs hand-written in frontmatter |

- **H2 confirmed, 5/5** (pre-registered ≥4/6): every Haiku shipped social metadata no
  crawler can use, with a green build, and **every report claimed the sharing behaviour
  verified** — haiku-3's quotes the dead root-relative meta as its evidence of correctness.
- **H3 confirmed, 0/6** discovered the full-URL form. Nothing they could reach names it:
  the 60 lines showed the path form, and `--help` said `--base-url <path>`.
- The Sonnet is the protocol's exact doc-defect signature: it succeeded by *prior
  knowledge* ("that fetch is not relative to the page, so og:image has to be a
  fully-qualified URL"), not by anything it read.

(haiku-3 was initially judged exit-1; that was the judge re-running its command against a
sandbox whose stale `dist/` became source material once the output was redirected
elsewhere. With its own command verbatim it builds exit 0 — the sample is clean and DEAD
like the rest. Judge artifact, recorded.)

### Triage

Spec §11.3 documents both forms and the crawler rationale correctly — the spec is not
wrong, it is **missing the diagnostic for a trap its own design creates**, which is the
A14 precedent exactly (the underscore seam's silent side). Round-5 shape, one layer up:
valid-looking output, silently ignored by every consumer, on the feature the brief asked
for. Three surfaces repaired for one finding:

1. **Advisory A15** (spec + rules.tsv + landmine `og-path-base` + unit tests): an
   `og:`/`twitter:` value left root-relative by a **path-only** `--base-url`. The scope
   was forced by the discipline check, not chosen by taste: a fire-always rule would flag
   FIX-13 — the spec's own §10.6 worked example ships `og:image: /assets/team.jpg` with no
   base-url, legitimately. The path form is the one case where the author has *declared*
   the site lives under a subpath, making the value known-unresolvable at emit time. The
   fix line echoes their own prefix: `--base-url https://your-domain/outreach/`. The
   catalogue is now **at its cap of twelve** — the next advisory costs one of these.
2. **The 60 lines** now show the full-URL literal as *the* `--base-url` example (the
   proven repair register: the one literal shown is the one copied — five of five copied
   the path form when that was the literal).
3. **`--help`** (and its two doc embeds) now reads `--base-url <url>` and says only the
   full form absolutizes og:/canonical.

The kitchen-sink `pretty-base` profile turned out to already contain the trap — path-form
base over `og:image: /assets/beans.jpg`, declared diagnostics-silent. The suite had pinned
the failure as correct. Its manifest now declares the advisory.

### A second defect found by reading, fixed in the same change (implementation, §12/REF-02)

`collectHtmlReferences` only gathered og:/twitter: content starting with `/` — so under a
**full-URL** base, the absolutized values were never reference-checked at all, despite
§12's explicit sentence that stripping exists so they "stay checkable instead of
masquerading as external". A broken og:image under the full form 404'd silently;
REF-02's `stripBaseUrl` was dead code for the metas it was written for. The collector now
also gathers absolute-URL og: values; foreign origins still skip as external
(`base-url-subpath`'s `og:url https://elsewhere.example/kept` pins that), and non-URL
content (`og:site_name`, `twitter:card`) is never collected.

### Recorded, not fixed

- Metas emitted from Markdown frontmatter locate at the provenance file with an
  output-derived line that can point past EOF (`post.md:8` in a 7-line file). Verified
  pre-existing — P13 on the same meta does the same — so A15 inherits it and the landmine
  deliberately declares no line. A locate that maps frontmatter-emitted metas to their
  frontmatter key's line is a real improvement waiting on evidence that it misleads.
- Relative (not root-relative) og: values are outside §12's scope and every form of
  `--base-url`; no sample has ever written one. Watch.

### Round 14 (pending)

Same brief, byte-identical, against the amended doc + the live advisory: measures whether
the doc's full-URL literal or the advisory (via `--dry-run --strict`, which rules.md tells
every author to run) carries samples to working metadata — and which of the two does the
carrying.

---

## Round 14 — measuring round 13's repairs

Round 13's brief and prompt, byte-identical, against the amended doc and an A15-bearing
binary. Fitted, and stated as such.

**6 of 6 WORKS** (round 13: 0 of 5 Haiku): every sample — all five Haiku and the control —
published with `--base-url https://saltmarsh.github.io/outreach/`, the full form, and every
`og:image` in every built entry is an absolute URL a crawler can fetch.

**The attribution is unusually clean: no sample ever saw the advisory.** Zero occurrences
of A15's text in any agent transcript — they all reached the full form from the doc alone,
on the first build. So round 14 measures the doc's new literal (the one literal shown is
the one copied, in the correct direction this time), and A15 remains what it was designed
as: the layer that catches the author who uses the path form anyway, as twelve of twelve
samples did across rounds 11–12. Its fire-behavior is pinned by the landmine, the
kitchen-sink pretty-base profile, and unit tests — but **no agent has ever repaired a site
from its message**, which is the same untested-as-documentation state every diagnostic was
in before round 8. A future broken-site round should plant a path-form base over og: metas.

Judge note, recorded twice now: three samples authored at the sandbox root, and re-running
their command with `-o` redirected turns their existing `dist/` into source material —
false failures. Judged in place with their command verbatim, all three are clean. The
judge must respect the sample's own output path.

One observation, not a finding: root-authoring samples split on the harness files — two
underscored them (`_rules.md`, `_BRIEF-r13.md`, even `_unify`) exactly as the doc teaches
for non-site files; one shipped brief, rules, and the 100 MB binary into its published
site. "Everything in the source root ships" working as documented, on files a real
author's directory wouldn't contain. Sandbox artifact; watch whether a realistic brief
ever reproduces it.

### Updated fix-status for the round-13 repairs

| Fix | Evidence | Tested by a round it was not written for? |
|---|---|---|
| Doc shows the full-URL `--base-url` literal | 5/5 dead metadata in r13 | No — fitted (r14, 6/6, zero advisory sightings) |
| A15 advisory | same | Fire-behavior pinned by tests; never yet read by an agent in anger |
| `--help` says `<url>` / both forms | 2 r11 samples cited `--help` | Untested — no r14 sample mentioned `--help` |
| REF-02 collector widened | found by reading, not by a sample | Unit tests only; no round has ever broken an og: target under a full base |

---

## Round 15 — one `--base-url` form, and the address in the report

Round 13's brief byte-identical, against the collapsed flag (a bare `--base-url` is now a
usage error) and the `--dry-run` report that names the deploy address. Fitted.

**6 of 6 WORKS.** Every sample published with the full URL and every `og:image` in the
built output is absolute. Two headline numbers beyond that:

- **18 of 18 frontmatter values are root-relative** (`og:image: /images/card-tide.png`) —
  zero hardcoded FQDNs, where round 14 still had one sample baking the domain into its
  content. The design is now doing the work it was built to do: authors write portable
  paths, the build supplies the address. A hardcoded FQDN survives a domain move as a dead
  link and is skipped by the reference check as external, so this is the outcome worth
  having.
- **Nobody hit the usage error.** Zero samples passed a bare path. The rejection is a
  backstop that this round never needed, because the doc's literal is now the full form —
  the same pattern as A15, and the reason removing the weak form beat warning about it.

### The report change is still unexercised

`serving from …` appears in the `--dry-run` report, and **only one of six samples ever saw
it in its warning form**. (Corrected 2026-08-13 — this section first said five of six never
ran `--dry-run` at all. That was wrong, and wrong in an instructive way: I grepped each
sample's `.agent-stdout.txt`, which is the agent's final *report text*, not its tool calls.
The session transcripts show **six of six ran `unify build --dry-run --strict`**, exactly as
the rules doc instructs. What is actually rare is seeing the warning form: five of six passed
`--base-url` to their very first `--dry-run`, so the line they saw read `serving from
https://…`. The line is under-exercised because the doc now gets authors to the flag before
their first build — not because anyone skips the step.)

So change 2 is verified by fixtures and unverified by agents. Two honest readings, and the
evidence does not yet separate them:

1. The address line is in the right place and this brief simply did not need it (nothing
   was wrong to catch).
2. The address line is in the *wrong* place — the failure it exists for (round 11's
   sample, which shipped a site whose every link 404'd) happens in a plain `unify build`,
   and a plain `unify build` still says nothing about the address it assumed.

Reading 2 has a real argument behind it: `--dry-run` is where you look when you suspect a
problem, and this is a class of problem nobody suspects. The counter-argument is that the
build summary is deliberately terse and §17 is the report's home. **Do not resolve this by
preference** — the discriminating experiment is a brief that deploys to a subpath and
never mentions it in a way the author can act on, run once with the line in `--dry-run`
only and once with it in every build. That is a real round, not a code change.

Recorded as the open question, and settled in round 17 below.

**Method note, from getting this wrong.** Judge what a sample *did* from its transcript, not
from its report. Round 16 hit the same thing independently — a sample's report claimed it had
used `data-layout=` on pages that actually carry the Markdown `layout:` spelling, and another
declared the site free of a placeholder string its own files still contained. The self-report
is the best evidence available about what a sample found *ambiguous*; it is not evidence about
what a sample ran or wrote. Those are in the transcript and the files.

---

## Round 16 — the scaffold as teacher (the first round to start from `unify init`)

**Samples:** 4 Haiku + 1 Sonnet, each running `./unify init` first and then modifying what
it got. Fifteen rounds had all begun from an empty directory; `unify init && unify dev` is
the golden path the product spec leads with, so this was the largest untested surface left.

**5 of 5 built clean — the first round in the log with zero diagnostics anywhere.**

### The scaffold teaches, and it erases the doc's worst historical failures

Every construct the template demonstrates was reproduced correctly by every sample:

| Construct | Round 16 | Best prior |
|---|---|---|
| `<include>` for shared chrome, in both layouts | **5/5** | 10/11 (rounds 7+9) |
| Named-slot fill, zero `<slot>` tags in any page | **5/5** | 1/5 (round 7) |
| `data-layout="none"` | 5/5 | 5/5 |
| Title separator in the layout | 5/5 | 6/6 |
| Standalone section layout, zero P15 | 5/5 | — |

The named-slot row is the striking one. Round 7 had three of five paste the layout-side
`<slot name="footer">` into a page — the failure severe enough that A04 became problem P20.
It did not happen once here, and no sample reported re-reading the rule. Sonnet said why:
*"kept the `slot="footer"` pattern verbatim … this is exactly the mechanism the brief's
contact-page requirement needed, so I reused the shape."* **Working code teaches a shape
that prose has to argue for.**

A structural bonus: because `init` scaffolds into `src/`, the harness files sat outside the
source root, so round 14's artifact — a sample publishing `rules.md` and the binary into its
own site — was impossible by construction.

### Finding — a placeholder in the position of structure (scaffold defect)

The template's sink was `<main><p>Page content appears here.</p></main>`. The brief forbade
that exact string. **Four of four Haiku left it in place; three of four copied it verbatim
into the brand-new section layout they wrote**; two then reported the site clean of it.

It did not ship only because every page happened to supply content. Verified against the
live binary: a page whose only top-level element is a `slot=` fill publishes that paragraph
verbatim, exit 0, no diagnostic. §7.4 is doing the right thing — the template chose
placeholder prose to be `<main>`'s children.

The tell is the control's replacement: `<main><slot></slot></main>` — *the rules doc's own
literal*, the shape those 60 lines call "the usual", **and a shape the scaffold did not
contain.** The one construct the doc names as usual was absent from the working example the
golden path hands every new author.

Triage: not doc (the doc says the right thing), not spec, not implementation — **scaffold**,
`src/templates/shared.js`. Four samples, one identical outcome, three propagating it: the
protocol's step-2 signal pointed at a template instead of at prose. Fixed, with the three
golden-path documents that show what `init` produces updated to match.

### Finding — the doc's `slot=` placement rule was wrong in both directions (documentation)

One sample quoted it as *the* unclear sentence; another relied on the half that is too
strict. Both halves verified against the engine:

| Page markup | Doc said | Engine does |
|---|---|---|
| `<main>…<p slot="footer">` | does not fill | **fills** (§7.2 unwraps `<main>` first) |
| `<div>…<p slot="footer">` | does not fill | does not fill — **and ships `slot="footer"` into the published HTML**, exit 0 |

Too strict for `<main>` — the wrapper the scaffold teaches everyone to write — and
unenforced for every other wrapper. Spec and engine agree; the doc misdescribed both. Fixed.

### Open, not acted on — the silent mis-nested fill

A `slot=` one wrapper too deep is the only unreported near-miss in the catalogue: the fill
does not fill, nothing is said, and unify's own attribute leaks into output that is
supposed to contain no tool vocabulary. That is the same argument that promoted A04 to P20,
but it is a further spec change on an open release PR, so it is recorded for the owner. The
advisory catalogue has two free slots if an advisory is preferred to a problem.

### Also recorded

- The layout's footer comment was instructional to the site author (*"pages may replace it
  with `slot=`…"*) and shipped into seven of one sample's ten published pages. It now names
  the region, which is all §19 asks. 1/5 — outlier, zero-cost fix.
- The scaffold demonstrates each primitive exactly once, and **the constructs it omits are
  exactly where samples diverged**: a second `_layout.html` in a subdirectory, an explicit
  `data-layout=`, a bare `<slot></slot>`, `<include>` outside a layout, a `title:` key. Four
  samples produced two legal shapes for the section layout. Valid-but-different, not a
  failure — but it maps the gap precisely.
- Frontmatter `date` with no visible date: 2/4 Haiku shipped notes with no date a reader can
  see, having reasoned correctly that `date:` becomes a `<meta>`. The control hit the same
  wall and inferred its way out: *"Rules never says how to display a value from frontmatter
  in the page body — because you can't; there's no templating."* Documentation-by-omission;
  no amendment proposed, because the doc is capped and the missing thing is a worked example.
  Watch for recurrence on any brief wanting a value both visible and machine-readable.

---

## Round 17 — where does `serving from …` belong? (A/B, null result)

**Design:** one brief, 8 Haiku per arm, both binaries compiled from one `git archive HEAD`
base so they differ only in where the address line is printed. Arm A (shipped): the line
appears under `--dry-run` only. Arm B: a real `unify build` prints it too. The brief states
a GitHub Pages subpath address plainly and names no flag.

**Result: the arms are indistinguishable.** 16/16 recorded the full-URL `--base-url` in
their publish command; 16/16 ran `--dry-run`. Published output was 8/8 correct in arm A and
**7/8 in arm B** — the difference runs the wrong way.

Only **two of sixteen** samples ever ran a real build without `--base-url` — the sole case
where the binaries differ at all:

- *Arm A* (no line printed): got a silent exit 0, and two commands later rebuilt with
  `--base-url`. Recovered unprompted.
- *Arm B* (line printed): the build printed `serving from / — the domain root (no
  --base-url)`, exited 0, and the agent **stopped there and declared done** — shipping 41
  root-relative links, every one a 404 at the deploy address. Its own report records the
  correct publish command and quotes the warning line, reasoning correctly from it.

**Reading (2) is not supported.** The one time the target failure occurred with the line
printed in a real build, the line did not prevent it — the sample had already read it, drawn
the right conclusion, and then run a different command. The gap is between knowing the flag
and typing it, and a terse summary at exit 0 does not close that gap. **The line stays where
it is.**

Honest limits: the decisive comparison is n=1 per arm, because the control failure rate is
now effectively zero — 22 consecutive samples have got `--base-url` right since the doc
named it (rounds 12, 14, 15, 17). The round rules out a *large* protective effect from
moving the line; it cannot rule out a small one.

**What it points at instead:** the one real failure was silent at exit 0 in *both* arms. If
round 11's failure is to be genuinely caught rather than mentioned, the evidence points at
something with teeth — a diagnostic that a subpath-shaped situation can raise — not at where
a summary line prints. Recorded, not recommended.
