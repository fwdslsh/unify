# Ratification rounds 7–18 — the build becomes the judge, and the diagnostics get tested

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

---

## Round 18 — the diagnostics, re-tested (and the first measurement of their absence)

**Fixture:** a ten-page community-orchard site carrying eight problems and three advisories
deliberately chosen *outside* round 8's set — P02, P04, P07, P11, P13, P14, P18, P19, A03,
A11, A13 — with fifteen `MARKER-*` sentences. **Arms:** 3 Haiku with the CLI alone, 3 with
the CLI plus the 60 lines.

**6 of 6 reached a clean build. Zero markers lost, zero pages deleted, zero assets deleted.**
Round 8's destructive-repair failure — a sample deleting a page's content to silence a
collision — did not recur in any form. All six resolved the case-collision (A11) by merging
first and removing second, with no `fix:` line telling them to. 65 of 66 planted-fault
repairs were correct.

### The one wrong repair, and the message that caused it

A sample turned `layout: news` into `layout: /_layout.html` — then propagated that literal
into three more files. Both news articles now build against the site layout instead of
`news/_layout.html`, losing the section's body class and stylesheet. Exit 0, no diagnostic.

It was following the message exactly:

```
fix: layouts are paths — write layout: /_layout.html (or a relative path ending in .html)
```

Round 8 fixed this line's *kind* (`layout:` vs `data-layout=`). Round 18 shows the *path*
was still one hardcoded literal — and in any site with a section layout that literal is a
real, resolvable, **wrong** answer. This is the project's single most repeated finding —
*a rule that shows exactly one literal will have that literal copied* — reappearing inside
a diagnostic. **Fixed:** the suggestion is now the layout the page would actually discover
(`/news/_layout.html`), and the second fix line names it too. New fixture
`layout-bare-name-section`; the existing two cover the no-layout fallback wording.

Also resolved by this round: round 10 recorded that the "or drop the layout selection" line
"did not fully land" for one sample. Three of six named that line as the one they followed.

### Two more messages amended

**P18 never named the colon.** Four of six flagged it; all three no-docs samples said they
got there by knowing YAML rather than by reading the message, and two of three doc-armed
samples were carried by the doc's line instead. The parser's own reason ("incomplete
explicit mapping pair") names a construct the author never wrote. The fix line now leads
with `quote any value containing a colon — title: "Pruning: a short guide"`.

**A whole-line comment in `unify.yaml` was a fatal usage error.** `# Build settings` at
column 0 exited 2: the trailing-comment strip requires whitespace before the `#`, so a
comment at the start of a line fell through to the key/value match and failed it. The
agent had to delete it from the fixture to keep it from swallowing the round. Fixed, with
tests that also pin the two things that must keep working — trailing comments, and a `#`
inside a value like `https://x.example/#frag`.

### The dedup fix, confirmed on an independent fixture

The round's fixture was built before the cascade/dedup commit landed. Re-run against the
current binary: **30 diagnostics become 13**, and A13 — which printed once per composed
page, six times — prints once. Twelve phantom cascade P13s are gone.

### Recorded, not fixed

- **Compose-stage diagnostics report line numbers from the include-inlined text.** Verified
  minimally: a stray bare `<slot>` on line 7 of a 9-line layout is reported at **line 13**,
  because a 6-line nav fragment was inlined above it. §14.1 makes `FILE:LINE` stable
  contract, and this points the author past the end of the file. Affects A13, P19, P20 and
  P16 on any layout that includes a fragment above the fault. The machinery to fix it
  exists (`spansToLocator` already maps offsets back to provenance), so this is tractable,
  but it touches every diagnostic site in `compose.js` and wants its own change.
- **A03 has no `fix:` line and, under `--strict`, forces a change to markup that composed
  correctly.** Six samples produced five different repairs; four invented a named slot in
  the *shared* layout that exactly one page fills. §14.3 says advisories never instruct
  restructuring of correctly-composed markup — this one does, and says nothing about what
  to write.
- **P14's fix names a CLI flag for a fault in a config file**, and the arms diverged on it:
  all three no-docs samples appended the one missing directory to `unify.yaml`'s hand-written
  list (silencing the symptom, leaving the convention broken for the next `_` directory),
  while all three doc-armed samples collapsed it to `_*` — the durable fix — two of them
  citing the doc's *"`--exclude` **replaces** the `_*` default"* line.
- **A page can vanish from the `--dry-run` report with nothing said.** While the layout
  carried an include cycle, one page produced no `write` line and no diagnostic; it
  reappeared when the cycle was fixed.

### The accidental control — the first measurement of the diagnostics' *absence*

The round's first launch inherited a harness default without `Bash`, so six samples repaired
the site **from the source alone, never running the tool**. Preserved rather than discarded:

**0 of 6 reached a clean build** (17, 12 and 7 problems remaining in the no-docs arm). Every
one wrote a confident report; three stated plainly they could not verify. Two copied the
*broken* pattern from a neighbouring file. None found P14, P18 or P04.

Round 8 established that the error contract is sufficient documentation for repair. This is
the converse, and it is the stronger claim: **without it, the same model on the same site
fixes roughly half the faults and cannot tell that it failed.** The diagnostics are not a
supplement to the 60 lines — for repair, they are the documentation.

### Arm A vs arm B

Both 3/3 clean. The doc bought **speed and durability, not success**: 3.7 builds against
4.7, and it changed the outcome on exactly two faults — P18 (guessed vs read) and P14
(symptom vs convention).

---

## The two silent-intent failures — decided by a four-phase design study

Rounds 16 and 18 each surfaced a case where an author wrote a fill, the fill did not
happen, and nothing said so. Rather than deciding by instinct, three independent proposals
were written from deliberately opposed angles — prose-only, new-diagnostic, and
delete-the-choice — each attacked by an adversarial judge told to default to rejecting and
to verify by running the CLI. **The two cases turned out to need opposite treatments, and
neither needed a new diagnostic.**

### A03 is retired — the advisory was the defect

Four reproductions, all verified independently before acting:

| site | A03 | what shipped |
|---|---|---|
| `<header>` written inside the page's own `<main>` — textbook HTML | **fires** | §7.2 unwrapped the `<main>`, hoisting the header to top level, and §7.6 then reported it for being there. Output is the source's structure. |
| the same header wrapped in a meaningless `<div>` | **silent** | identical body once wrapper tags are stripped |
| layout whose sink is a bare top-level `<slot>` | **fires** | header lands between the layout's nav and footer — exactly where its author drew it |
| one typo'd `slot="fotter"` | **two** advisories (A02 + A03) | two `--strict` failures for one authoring act |

And the finding that settled it. Against the idiomatic layout
`<footer class="site-foot"><slot name="footer">…</slot></footer>`:

- a page writing `<footer>MY FOOTER</footer>` → **A03 fires, `--strict` exit 1**, output has
  two sibling footers, which is valid.
- the same page applying A03's own implied repair, `<footer slot="footer">` → **exit 0,
  nothing reported**, output is `<footer class="site-foot"><footer>MY FOOTER</footer></footer>`.

**A03 condemned the valid document and silently rewarded the nested one.** The scaffold
fills that slot with `<p slot="footer">` rather than `<footer slot="footer">` precisely to
sidestep the trap, unexplained until now. SCF-04 never protected it either way: `<header>`
and `<footer>` appear in the five templates only inside `_layout.html`, never in a page.

Retiring it is purely subtractive — **zero bytes of output change anywhere**, and the
`stray-header-footer` expected tree is byte-for-byte what the advisory used to narrate. The
catalogue goes to **nine of twelve**, the third ID to leave and the third not replaced.

The misconception A03 was aimed at — that a page's `<header>` replaces the layout's — moves
into `authoring-rules.md`, in the file the author is actually editing, along with the trap:
*if the layout wraps its slot in its own `<footer>`, write `<p slot="footer">`, or you ship
a footer inside a footer.* One in-place sentence, no line added, cap untouched. (Round 13's
measured lesson: the changed literal moved 6/6 samples; nobody ever saw the advisory.)

**Two operational tests generalise out of it**, now in §14.3 — they would have caught A03
before it shipped:

> An advisory that a meaningless wrapper element switches off is reporting tree position,
> not authorial error. And an advisory whose only available repair edits a file the page
> does not own — a shared layout, a shared fragment — is instructing a restructure by
> another name, whatever its wording.

### The mis-nested fill — a sentence I wrote was false, so the engine changed to match it

`authoring-rules.md` said `slot=` counts on direct children of `<body>` "or of your
`<main>`, unwrapped first". **The second clause was false.** §7.2 unwraps the first `<main>`
at any depth, but its children become the *wrapper's* children, so the fill scan never saw
them. The author watched their `<main>` tags vanish from the output — the strongest possible
evidence unify processed exactly that region — while the fill did nothing, the layout's
fallback shipped, and `slot="footer"` was published at exit 0 under `--strict`.

Fills are now the direct element children of `<body>` **and of the page's first `<main>`,
wherever it sat**. The safety property is that the parent of a fill is always `<body>` or
that `<main>` — neither of which can be a component an author is assigning light DOM to —
which is what leaves `slot=` inside web-component markup, inside `<template>`, and one
wrapper deeper untouched. The ratified `slot-attr-edge` fixture is unmoved; no ID added, no
row added or removed, no doc line displaced.

One disclosed artefact: a wrapper whose only content was the fill now ships empty. It is
asserted in the fixture's expected tree rather than hidden.

**The residue stays silent, deliberately.** A fill under a plain wrapper `<div>` still does
nothing and still ships its attribute. No diagnostic was added for it: the catalogue has
three free slots and this is a case where the evidence does not yet say whether authors
write that markup at all. The experiment that would settle it is a brief compelling a fill
from inside a styled wrapper — not a guess.

---

# Round 19 — an advanced site: generated pages, client-side filtering, a subpath deploy

6 samples (5 Haiku, 1 Sonnet control), 45-minute cap, first round run under true
filesystem isolation. Brief: a seed library with a catalogue generated from a JSON export,
client-side family/name filtering, a redesigned section sharing chrome, a chrome-less
embed for another organisation's CMS, and a subdirectory deploy.

**Result: 6/6 exit 0 on their own publish commands, 40-43 markers preserved each, zero
content lost.** The tool composed an advanced site every time. 6/6 wrote a generator under
`src/_scripts/` producing 28-29 pages from the export; 6/6 got `data-layout="none"` right
for the embed; 6/6 used a section `_layout.html`. The build-step seam works, unprompted.

Four findings.

**1. `--pretty-urls` omitted, and confidently "verified" (2/6).** haiku-4 and haiku-5
published 172 and 177 `.html` links against a brief requiring extensionless addresses,
both at exit 0. haiku-4's report: "Verified using `--pretty-urls` is NOT needed; the site
uses `.html` in all links but unify will serve these correctly." unify serves nothing —
it is a build tool. This is round 11's shape exactly (a sample invented hosting behaviour
to cover a flag it had not used), but the flag here IS named in the doc, so it is not the
round-11 defect recurring. Authoring error, watched not amended.

**2. File-level exclusion does not protect data (5/6).** The export carries
`seed_keeper` and `keeper_contact` per variety. 0/6 published `varieties.json` itself —
the exclusion rules worked — but 3/6 rendered keepers' private email addresses onto public
variety pages (81, 54, 54 occurrences) and 5/6 published keeper names. Only the control
published neither. No diagnostic is possible: once a generator copies a field into a page,
that page is ordinary content. Not a doc defect — the 60 lines describe file-level
exclusion accurately and claim nothing about data — but it is the sharpest thing the round
found about the *shape* of the tool, and it is now the "what these examples do not show"
section of `examples/README.md`.

**3. The client-side data seam went unexercised — a brief defect.** 0/6 used `fetch`,
`hx-get`, or any endpoint; every sample rendered the catalogue at build time and filtered
the DOM. That is the correct pattern for a static site, so the brief compelled good work —
but it means the seam this round was designed to probe was never touched. Two defects
found by hand during brief design remain untested by any sample:
  - a `.html` file with no `<html>` element beside a `_layout.html` fails with
    `internal error building this page: null is not an object (evaluating 'node.children')`
    — no line, no `fix:`, no P-code, and the transactional gate blocks the whole publish.
    This is the shape of every htmx partial endpoint.
  - `hx-get="/x.json"` and `fetch("/x.json")` are neither rewritten by `--base-url` nor
    reference-checked, while `src="/app.js"` beside them is rewritten. Silent 404s on a
    subpath deploy at exit 0.
A brief that compels a partial endpoint would reach both. Named, not guessed.

**4. Named slots still under-reached (3/6 used none).** The footer-exception requirement
was satisfied by a second layout as often as by a slot. Both are legal, so this is not a
violation, but the historically weakest rule remains the least exercised.

## The protocol defect this round closed

`cwd` was never isolation. Asked the protocol's own project-context question, a probe agent
answered **NO** and then listed three copies of `conformance-spec.md` and six harness
copies it had just found — `Read` and `Bash` both take absolute paths. Rounds 16-18 ran
from `/tmp/r16`../tmp/r18` with the full specification readable, and their samples would
have answered NO too. Samples now run in a private mount namespace: own directory at
`/sandbox`, fresh writable `/tmp` (masking every other copy at once — enumerating leak
paths was wrong twice), repo and session transcripts masked. Re-probed: NO, and NONE on a
whole-filesystem search. `/tmp/ratify/harness/isolate.sh`.

**Judging traps hit again, both self-inflicted:** a regex that truncated a sample's own
publish command turned a clean sample into an exit-2 failure, and a domain-level grep for
leaked addresses matched a public contact address the samples had invented, briefly showing
a 5/6 leak that was 0/6 for that string. Judge with the sample's exact command; grep for
the exact private value, not its domain.

## Post-round fixes (2026-08-13, same day)

The two engine defects finding 3 recorded as "named, not guessed" are fixed, and the fix
grew when a deterministic shape matrix (`_notes/shape-matrix.sh`, 10 page shapes × 5
layout shapes against the real binary) mapped the whole family:

- **P21** (new problem, §7/MRG-20): the merge requires a `<body>` on both sides. The
  fragment-page crash — unlocated `internal error`, the shape of every htmx partial —
  became a file-level problem at the page naming the complete-document shape. The matrix
  found worse next to it: a **layout** with no `<body>` published its own text *as* the
  page, silently dropping the author's entire body at exit 0 — a direct §7.6 violation
  that had sat behind a "fail soft" comment. Now P21 at the layout, whose fix names the
  one-keystroke repair (`<body></body>` is the legitimate §7.5 head-only pattern). A third
  member fell out of a truthiness accident: `if (!layoutText)` routed a resolved-but-empty
  `_layout.html` into the no-layout path, so a zero-byte layout was silently identical to
  no layout at all — now P21 like its siblings. Three landmine fixtures pin one cell each;
  all 50 matrix cells are now located-problem or correct composition, no green cell changed.
- **The url() advice was inverted, in both documents.** §11.1 said a `url()` in inline
  styles "must be root-relative" and the rules doc repeated it — root-relative is exactly
  what misses the `--base-url` path prefix and 404s at any subdirectory deploy, while
  passing §12 (the check runs against the output tree, where the file exists — the
  round-13 class). Both now say the true thing: `url()` belongs in a stylesheet file,
  written relative to that file, and script/`hx-get` addresses ship as written. The rules
  doc names the pair in one breath (the round-11 corollary: naming one of a pair is worse
  than naming neither).

Open question, deliberately not taken tonight: should §11.1 rewrite `url()` in a page's
own `<style>`/`style=`? Inline url() currently has no correct static spelling under
`--pretty-urls` + `--base-url` together (relative breaks when the page moves, root-relative
misses the prefix, a full URL hardcodes the domain). Rewriting is spec-coherent — inline
styles are page content, not mirror-copied files, and §12 already parses the same values —
but it is a §11 amendment with fixture obligations, and the doc's new "keep url() in a
stylesheet file" advice removes the need for most sites. Decide with evidence: a brief that
compels an inline background image would show whether authors actually write them.


---

# Round 20 — the client-side fetch seam, and the first fix measured by quotation

6 samples (5 Haiku, 1 Sonnet control), 45-minute cap. Brief: the round-19 seed library at
scale — 225 varieties across 12 families — with the client stating outright that opening
the browse page must not pull down the whole catalogue, so a per-family fetch is the only
honest answer. Round 19 never reached this seam because inlining 27 varieties was easier
than fetching; at 225 it is not.

**The brief changed on the way in, and that is itself a finding.** The plan was a brief
compelling an htmx partial endpoint. Checking satisfiability first — the round-19 judges'
lesson — showed there is no way to ship one: a bare fragment `.html` is P21; a wrapper
`<div data-layout="none">` is P07 *and* P21; a `.md` with `layout: none` is synthesized
into a complete document (§10.7); a non-`.html` extension mirror-copies but gets the wrong
content-type from the host. **unify cannot emit a bare HTML fragment.** That brief would
have measured a missing feature six times over. Recorded as a product gap, not run.

**Result: 6/6 exit 0, zero diagnostics, no content lost** (markers 220-466 per sample).
5/6 fetched per family; haiku-1 inlined a 96 KB page, the one brief violation.

**The finding: 5 of 5 fetching samples produced URLs that resolve correctly at the deploy
address, and four of them quote the rule that told them so.** The §11.1/rules-doc fix
shipped hours earlier — that unify rewrites only HTML's own URL attributes, so a
root-relative `fetch()` misses the `--base-url` prefix — appears verbatim in the reports:

- haiku-3 quotes it and uses `../data/public-varieties.json`
- haiku-5 quotes it and uses `../varieties-public.json`
- haiku-4 paraphrases it exactly ("rewrites root-relative paths in HTML href/src, BUT NOT
  in CSS url() or JavaScript fetch()") and uses `apiBase = '..'`
- haiku-2 quotes it, then hardcodes `/library/` into the JavaScript

This is the strongest attribution shape available: the sample quotes the sentence and acts
correctly on it. It is still *fitted* — the fix was written for this exact failure and this
is the round that measured it. It becomes *tested* when a later brief it was not written
for comes back clean.

**A doc improvement, from a self-report rather than a failure.** haiku-2's site is correct
and exits 0, so by triage step 0 it is not a violation — but its report says the rules
"don't explain how to handle fetch() URLs in scripts that need a base-URL prefix", and it
picked the one strategy that breaks silently the day the site moves. The clause named the
trap and gave the remedy only for `url()`. It now gives one for fetched addresses too:
*relative to the page — or read it back from an `href` unify rewrote.* Still 60 lines.

**The control's pattern is the round's best artifact.** sonnet-1 never writes the URL in
JavaScript at all: each family is a real anchor, `<a href="/catalogue/data/allium.json"
data-family="Allium">`, which unify rewrites like any other link; the script intercepts the
click and fetches `link.href`, already absolute and already correct. The deploy address
appears nowhere in the JS and the page still works with JS off. Kept as
`examples/seed-library-ondemand`.

**The privacy result reproduced, and one sample solved it.** Across rounds 19 and 20,
twelve independent authors all excluded `varieties.json` correctly and eight still
published its private fields. sonnet-1 is the exception in both rounds: its generator names
the fields it emits rather than spreading the record. That is now the advice in
`examples/README.md` — the generator is the only place privacy can be enforced.


---

# Round 21 — round 13's brief, byte-unchanged, against two rounds' worth of amendments it never met

Nearly every fix in this record is *fitted* — measured only by the round that produced it.
Round 21 re-runs round 13's brief and prompt byte-identical (same seeded `images/`, same
runner discipline as rounds 19-20, mount-namespace isolation) against today's doc and a
binary built from HEAD. What that tests is everything amended since round 15 that was NOT
written for this brief: the round-16 slot=/scaffold clauses, the round-18 diagnostic work,
P21, the A03 retirement, the round-19/20 url()/fetch clause. What it cannot re-credit is
the round-13-era repairs themselves — the full-URL literal, the collapsed flag, A15's
retirement — which rounds 14/15 already measured on this same family and which stay
fitted-to-family.

**Result: 6/6 WORKS, 18/18 root-relative frontmatter values, zero final diagnostics —
the family's round-15 result survives every amendment since.** Every sample, all five
Haiku and the control, published with the full-URL `--base-url` on its first base-url'd
command; every `og:image` in every built entry is absolute at the deploy address. Nobody
hit the collapsed flag's usage error (round 15 again); two samples ran their first
`--dry-run --strict` flagless, met `serving from / — the domain root (no --base-url)`,
and adopted the full form — the §17 line's first mid-run saves. Five P13s fired during
iteration — images not yet under `src/`, directory links before `--pretty-urls`, one
sample hand-prefixing `/outreach/` into source paths — and produced five correct repairs;
haiku-2's report narrates the last one: "I cannot include the base-url prefix myself…
I must use root-relative paths and let unify rewrite them." Round 13's lesson, now taught
by the toolchain mid-run. And round 13's pathology — reports *claiming* verification of
dead metadata — is absent by construction: the claims are all true this time.

**The amendments that could act, acted; the ones this brief cannot reach stayed idle.**
The url()/fetch clause is quoted verbatim in three of five Haiku reports, and haiku-4
derived its asset strategy from it ("Since I used img tags and meta properties for all
images, they all got the correct absolute URLs") — read, used, harmless, on a brief it
was not written for. Its protective half stays unexercised: no sample in this family has
ever written a `url()`. P21 was never provoked (six complete-document sites) and never
misfired — tested for silence, with its presence proven by the pre-round probe. P20 had
nothing to fire on: zero stray `<slot>` in pages, round 7's 4/5 failure mode extinct.
The r16 fill-scope and fills-the-contents clauses and the A03 retirement were untouched —
no named slots, no `init`, no top-level landmarks. Honest nulls, still fitted.

**The finding: a canonical in the layout stamps every page with one URL — and the doc
told authors to put it there.** haiku-2 and haiku-3's shared entries each declare
`rel="canonical"` → the home page, layout-supplied, exit 0 — on the one feature this
brief is about, since Facebook consolidates shares by canonical. haiku-3's report says
why: "Left as site-root canonical in the layout since individual page-specific canonicals
were not required by the brief." The control is the doc-defect signature verbatim — it
quotes "Canonical and JSON-LD have no frontmatter key: put them in the layout, or write
the page in HTML" and answers it: "a single canonical value hard-coded into _layout.html
would be wrong for every page except one… Rather than ship a canonical tag that lies for
two out of three entries, I left canonical off." Judged retroactively, the family already
carried it: r14 haiku-4/-5 stamped home on their entries, r15 haiku-2/-3 stamped the log
index and haiku-4 home — **seven of eighteen samples across three rounds**, unmeasured
because the preregistration's verdict reads og:image only. The chain that lit it up:
the sentence dates to round 5 and round 13's samples wrote zero canonicals; the round-13
repair put "canonical" into the `--base-url` clause every author now reads, samples
started writing canonicals in round 14, and the round-5 sentence routed half of them into
the layout. Fixing one silent share-crawler failure surfaced its dormant neighbor.
Triage: documentation — the sentence's first alternative is only ever right for JSON-LD;
for canonical on a Markdown-entry site the layout value is unfixable per page (§8's
replace rule needs an HTML head). **Amended this round, in both documents**: the rules
doc now says JSON-LD belongs in the layout while a canonical is one page's own address a
layout must never set, and the spec's §10 honest-gap paragraph says the same with the
mechanism. Fitted until a later round it was not written for comes back clean. The
spec-level companion — an advisory when the same canonical URL is emitted on more than
one page (mechanically checkable; at most one page can be right; three catalogue slots
free) — is recorded as the maintainer's call, not taken.

**Recorded, not amended: URL-shaped CSS dies against rewritten HTML in a third spelling.**
haiku-2 and haiku-5 highlight the active nav item with attribute selectors —
`body.about nav a[href="/about/"]` — dead against anchors rewritten to `/outreach/…`,
silently, exit 0. The same pattern shipped in r13 and r14 (where the control instead
hardcoded `/outreach/` into its selectors — round-20's fetch hardcode, in CSS), so it
predates every amendment under test. haiku-2 quoted the url()/fetch clause and tripped
anyway: a selector is neither `url()` nor `fetch()`. haiku-1 pasted the doc's own recipe
(`body.home .nav-home a`) and is immune — the one literal shown carried the one sample
that copied it. Cosmetic, unrequired by the brief, watched: if a brief that needs the
highlight reproduces it, the clause's list becomes "anything in CSS or JS that names an
address".

Also watched: `name="description"` slipped to 4/6 (r15: 6/6) — two samples shipped
`og:description` only, on an unchanged rule. And two harness notes acted on for the next
round: sandboxed samples were all appending transcripts to one shared
`projects/-sandbox/<orchestrator-id>.jsonl` — readable in principle from inside the
namespace — so `isolate.sh` now masks it; and rounds now overlap on the machine, so every
transcript sweep is bounded by the round's own `.exit` times.


---

# Round 22 — inline url(): the open question, closed by evidence (pre-registered)

6 samples (5 Haiku, 1 Sonnet control), 45-minute cap, mount-namespace isolation. The
round-19 post-fixes left one question deliberately open: should §11.1 rewrite `url()` in
a page's own `<style>`/`style=`, where no correct static spelling exists under
`--pretty-urls` + `--base-url` together — or does the doc's "keep every url() in a
stylesheet file" line carry the load? Pre-registered decision rule
(`_notes/ratification-round-22-preregistration.md`, written before any sample ran):
≥2 of 5 Haiku shipping an inline `url()` that 404s at the deploy address at exit 0 →
rewrite; ≤1 → no engine change, record and close. The advisory middle ground was barred
in advance by §14.3's operational tests. Brief: Alderfen Arboretum
(`_notes/BRIEF-r22.md`), a full-width photo banner with text over it on the home page
and a narrower one on each of two section landings — banners-with-text-over being the
strongest content-side pull toward CSS backgrounds — at a subdirectory deploy with
`.html`-free addresses, images seeded.

**Result: 0 of 5 — the question closes with no engine change.** 6/6 exit 0 on their own
publish commands, zero diagnostics anywhere in the round's final state, 36/36 markers,
6/6 `--pretty-urls` (round 19's omission did not recur), all six isolation answers NO.

**The finding is *which* mechanism authors reach for: 5 of 6 built every banner as
`<img>` + `object-fit: cover` with an absolutely-positioned overlay — zero `url()`
tokens in their entire output, stylesheets included.** The modern prior for
image-with-text-over is no longer the CSS background; it is the pattern that happens to
sit exactly on unify's rewritten path (`src=` gets §11.1/§11.3, and the reference check
covers it). H1 — that most samples would follow the clause's remedy into a stylesheet
file — was falsified in the best direction available: 0/6 wrote a stylesheet `url()` at
all. The clause carried the round by **deterrence**, and explicitly so: the control's
report says it treated "the CSS-background route as the one to avoid" because "the rules
explicitly warn that `url()` inside CSS is never rewritten by `--base-url`".

**The one sample that did write inline `url()` traversed the whole trap and shipped
correct.** haiku-1 wrote `url(/images/banner-*.png)` into all three banner pages — the
silent spelling — and had a green build with three dead banners for half a minute.
Nothing in the tool flags that state; what closed it was the author reading the emitted
output ("I notice the CSS image URLs need to be fixed - they use root-relative paths
which won't be rewritten by unify") — and its report quotes the doc's `url()` clause in
full as the sentence that taught it what to look for. Its first repair (`../images/`
everywhere) was caught loudly — `src/index.html:5: problem: ../images/banner-home.png
does not resolve to any emitted file` — confirming the pre-registered geometry: every
wrong inline spelling except root-relative-with-base fails §12 at exit 1. Its second
repair shipped three relative inline `url()` values that all fetch at the deploy
address, legal because every page is authored as `dir/index.html` and never moves.

**Verdict, per the pre-registered rule: ≤1 of 5 — no engine change; the doc line
carries the load; the catalogue stays at nine of twelve; closed.** The silent window is
real (one sample stood in it this round), but no sample shipped it, the doc clause is
what pulled the one visitor out, and both neighbouring escapes — `<img>` and loud §12
failures — worked every time they were reached. Re-open only if a later round shows a
shipped inline 404 in the wild.

Recorded, not acted on: what `--pretty-urls` does to the root `index.html` is unstated
in the 60 lines — the control scratch-built a test site to learn it and haiku-5 "had to
infer" it; both were right, the spec states it, and the dry-run's per-file report
answers it, so hesitation-without-failure does not clear the amendment bar. haiku-4
wanted "a local dev server" from a tool whose `--help` (which it never ran) names
`unify dev` on line two — authoring miss, not a gap. The `.fragment.html` suffix was
adopted unprompted by two samples for `_includes/` fragments — harmless where it is not
needed, and evidence the new vocabulary reads.


---

# Round 23 — the fragment feature, ratified on first exposure

6 samples (5 Haiku, 1 Sonnet control), the binary compiled from the freshly merged
`release/0.7.0` head, rules regenerated from the merged doc. The brief (Holt Fen
Windmill, `/tmp/ratify/harness/BRIEF-r23.md`) compels the day-old `.fragment.html`
feature three ways without ever naming it: a district council whose loader "rejects any
response that carries its own `<html>`, `<head>`, or `<body>`" fetching a fixed address
that must never change; the same hours panel on the site's own Visit page, "one panel,
maintained in one place"; and a month flip on the home page where each list "is only
fetched when the visitor asks for it" — at a subdirectory deploy with `.html`-free
addresses.

**Result: 6/6 exit 0, zero diagnostics, and 6/6 shipped bare `.fragment.html` panels
— three to four each, none containing a document wrapper.** The council requirement was
met by every sample including all five Haiku, on a feature that shipped the day before.
Every report quotes the doc's one clause (line 8: "a bare snippet shipped as written, for
`<include>`, embeds, or `fetch`/`hx-get`") as the sentence that taught it; the control
singled out "shipped **as written**" as the phrase that carried the decision. The
transcripts contain **zero P21 encounters**: nobody needed the error-message route — the
doc clause alone carried all six. The diagnostic's teaching half remains unratified
(nothing has yet provoked it), which is the correct price for a clause that works.

**Dual use held 6/6, single-source 4/6.** Four samples pointed `<include>` at the
shipped fragment itself — one file serving the Visit page at build time and the council
at runtime, exactly the design. haiku-1 and haiku-3 instead kept a hand-copied twin under
`_includes/` and shipped a separate root copy (byte-identical / trailing-newline apart):
the "one edit updates both" requirement soft-missed by duplication that no build check
can see — the round-19 field-vs-file lesson in miniature. Watched, not amended: the
include-the-shipped-file spelling is what four of six found unaided.

**The round-20 fetch clause moved further from fitted to tested.** Five of six wrote
month-flip fetch URLs relative to the page (or read them back from element data), all
resolving at the deploy address; haiku-2 hardcoded `/mill/` into its fetch literals —
round-20's hardcode shape recurring 1/6, correct at this address and dead the day the
site moves. All markers preserved (36+ across the round); `drafts/` excluded 6/6.

**Harness findings, both acted on.** The round-21 transcript mask bound a read-only
empty dir; root ignores permission bits, so all six samples silently wrote their
transcripts into the mask directory itself — shared between samples again, and worse,
sitting inside the dir that masks the repo. `isolate.sh` now binds a per-sample
writable `.transcripts/` dir instead (preserved evidence: `round23/.transcripts-shared.jsonl`).
And haiku-1 over-generalized the underscore rule onto the harness's own files — renamed
`.agent-stdout.txt` and moved `rules.md`, the brief, and its own `REPORT.md` into a
`_docs/` folder, then could not run the binary it had displaced; its site still judges
clean with the harness binary. An authoring outlier, recorded.


---

# Round 24 — a Svelte component on one page: where it breaks, and it is not unify

6 samples (5 Haiku, 1 Sonnet control), 60-minute cap. The brief (Thistleknap Forge,
`_notes/BRIEF-r24.md`) seeds `components/FeeCalculator.svelte` — "maintained in Svelte
by the collective's volunteer developer; future revisions arrive as .svelte files; do not
rewrite it in anything else" — and requires it working in the visitor's browser on the
Courses page, with a **repeatable** one-command build, at a subdirectory deploy.
Satisfiability was pre-flighted inside the isolation namespace before the brief was
written: the npm registry is proxy-exempt (`npm i svelte esbuild`, 6s), the Svelte 5
compiler takes the seeded component with zero warnings, and esbuild produces a fully
bundled file. The route exists; the round measures who finds it.

**unify's side of the contract held 6/6 and needed nothing.** Every sample: exit 0 under
`--dry-run --strict`, all markers, `drafts/` excluded, the estimator's `<script src>`
rewritten with the base path, and — the rule this round exercised for real — a 22-package
`node_modules/` sitting in the source root that never shipped (§4.3's never-shipped
list). Zero unify diagnostics anywhere. The integration surface (bundle = ordinary asset,
mirror-copied; script tag = ordinary URL, rewritten) is exactly sufficient, and no sample
asked unify to know what Svelte is.

**Where it broke: 4 of 6 real pipelines, 2 of 6 counterfeit ones.** haiku-4
(`svelte/compiler` + esbuild), sonnet-1 (`esbuild-svelte`), and haiku-3/haiku-5 (vite +
`@sveltejs/vite-plugin-svelte`) shipped genuine compiles — verified mechanically, on
copies, never the originals: edit the `.svelte` (a rate value, then a structural markup
change), run the sample's own stated commands, and watch both changes reach `dist/`.
All four propagate both. haiku-1 and haiku-2 instead wrote build scripts that
**regex-extract the two numbers from the .svelte and emit a hand-written vanilla
implementation** — haiku-1's labelled "compiled from FeeCalculator.svelte", haiku-2's a
custom element whose script *imports the real Svelte compiler and never calls it*. Their
value probe propagates (the regex reads numbers); the structural probe vanishes silently
— the developer's next revision would half-apply with no error anywhere. This is round
13's pathology in a new costume: the confident false claim, now written into code
comments, dressed with a dead import.

Triage: **capability boundary, not a documentation defect** — the 60 lines claim nothing
about foreign toolchains, and three of five Haiku found a real compiler unaided. Recorded
where it belongs: `examples/forge-svelte` is the control's site (the round's cleanest
pipeline), and the examples README now carries the hazard and its mechanical test —
change the component's markup, run the build, look for the change in the output.

**Judging notes, for the record.** Two self-inflicted near-misses, both caught: an
ad-hoc "longest command" extraction picked two samples' `--dry-run` variants (which
write nothing) and briefly made their real vite pipelines look broken — the exact error
class `judge-round.mjs` exists to prevent; and a mid-probe `cd` planted an examples
directory inside an original sample before being cleaned. Probes that mutate anything
run on copies only. And the round itself had a false start: a mis-ordered `cd` truncated
the harness `rules.md` to an empty fence after two samples were already seeded — caught
by checking the seeded sandboxes, killed, re-seeded from scratch. A round that had run
that way would have measured "Haiku with no documentation" and looked like a finding.
