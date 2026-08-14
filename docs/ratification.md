# Ratification — what eighteen rounds of agent experiments changed

**Status**: v0.7.0, historical record and argument
**Role**: This document is the narrative and the evidence behind `docs/ratification-protocol.md`. The protocol is the procedure — how to run a round, how to triage what it finds. This is the account of running it: what was measured, what broke, what the results changed in the documentation, the specification, the implementation, and the product itself. The round-by-round primary source is `_notes/ratification-rounds-7-22.md`, with round 1 and two pre-registrations beside it.

---

## 1. Why an empirical loop existed at all

v0.6.6 shipped 62 test files at a reported 93%+ coverage while `unify init` exited 1 and scaffolded nothing, layout discovery did not exist, and a page's content was silently deleted when the layout lacked the expected element — under a printed `✅ Build completed successfully!`. `docs/testing-strategy.md` §1 traces the five mechanisms that let a suite that large see none of it. The short version: coverage counts lines entered, and a test that calls a function and asserts the result is an object covers every line of a wrong answer.

The countermeasures in `docs/testing-strategy.md` fix that for the *engine*. They cannot touch the other half of the product. `docs/authoring-rules.md` claims to be the complete authoring surface in 60 lines — learnable in one sitting, pasteable into a prompt. That claim is the whole authoring contract, and no test suite can evaluate it: a suite tests what the build does with markup that already exists, not whether a reader of those 60 lines produces the right markup in the first place.

Reviewing the document does not work either, and the record says so. Three adversarial reviews and a ten-agent design panel (`_notes/agent-authorship-panel.md`) read the same text and missed defects the first round of authoring agents surfaced in twenty minutes. Later, paper review began *injecting* defects — roughly three new silent-failure modes introduced while fixing fifteen. You read your own documentation the way you meant it; every ambiguity resolves silently in your head.

So the doc was treated as an empirically testable artifact. Hand an agent nothing but those 60 lines and a plain-English brief, in a sandbox it cannot escape, and see whether it authors a compliant site. If it cannot, the doc is wrong. The agent is a fast, cheap, uncomplaining proxy for the human newcomer who fails the same way and never files an issue.

## 2. The loop

One round is: regenerate `rules.md` from the current doc so every sample is provably given byte-identical input; seed N isolated sandboxes (five Haiku plus a Sonnet control is the default); launch one `claude -p` process per sample with cwd inside its sandbox; collect; judge; triage; amend at most a handful of things; re-run.

Three properties of that shape carry the method.

**Isolation is structural, not instructed.** In-session subagents inherit `CLAUDE.md` no matter what the prompt says. Each sample is its own process, with the task, the rules and the report format copied *into* its directory so no path outside cwd is ever referenced. A correctly configured run answers **NO** when asked whether it has any project context describing the tool; that check is re-run on every protocol change.

**The weak model is the bar and the strong model is the instrument.** The rules are ratified when Haiku consistently (4 of 5 or better) produces a compliant site from the rules alone. Sonnet runs alongside not to raise the ceiling but to locate defects: **when the strong model succeeds where the weak one fails, the gap is a documentation defect that reasoning papers over, not a capability floor.** Round 1 is the canonical instance — Sonnet got the title rule right and 3 of 4 Haikus got it wrong, and both Sonnets reported having *inferred* it rather than read it. Round 13 is the same signature at spec level: the control escaped a trap by prior knowledge ("og:image has to be a fully-qualified URL"), not by anything in front of it.

**The build is the judge.** `unify build --dry-run --strict`, run by the experimenter over every sample, exit code plus diagnostic list. This was not true at the start, and the change is the single most important fact about the record.

### The instrument changed at round 7

Rounds 1–6 were judged by reading sample files, and recorded two 6/6 sweeps. The first brief judged by running the real build came back **1 of 5 Haiku**, on a document those rounds had passed. Nothing regressed; the measurement improved. Every pre-round-7 clean result should be read as *no violation a human reviewer noticed*, and any older brief worth relying on should be re-run.

Two costs came with the upgrade. The CLI has to go *inside* the sandbox (a compiled binary carries no docs, so isolation holds), and briefs must be honest about what the build checks — a reference to an image the agent had no way to create fails the build while telling you nothing about the doc. Rounds 7 and 9 each lost two samples to exactly that artifact before round 13 seeded a real `images/` directory.

### Two experiments, not one

Blind authoring — the agent can run nothing — measures *the document*. Authoring with the build measures *the document plus the error contract*, which is how anyone actually works. Both are legitimate; what is illegitimate is switching a brief from one to the other while measuring a fix, because that changes the environment and the doc together and the result stops being attributable.

## 3. Rules of evidence, learned the hard way

Every one of these was paid for.

**Judge what a sample did from its transcript, not from its report.** A report is a claim. Round 15's write-up stated that five of six samples never ran `--dry-run`; the session transcripts show all six did, and the figure had come from grepping each agent's final report text. Round 16 hit it twice independently — one report naming `data-layout=` on pages that carry the Markdown `layout:` spelling, another declaring a site clean of a placeholder string its own files still contained. The self-report is the best evidence available about what a sample found *ambiguous*, and it is not evidence about what a sample ran or wrote.

**Judge in place, with the sample's own command.** Re-running a sample's build with `-o` redirected turns the existing `dist/` of a root-authoring sample into source material and manufactures failures. This produced false verdicts twice — round 13's haiku-3 was recorded exit-1 and is clean, and three round-14 samples the same way.

**Check exit codes before analysing anything.** Thirteen simultaneous cold starts produced a burst of transient proxy TLS failures that killed half a round; at twenty seconds apart, none. A sample that never started looks exactly like a sample that did nothing. Empty a sandbox before re-seeding it, too: a retry that begins on top of a dead run's half-built site is not a sample.

**Sweep the site output, not the sandbox.** `rules.md` quotes `{{ }}` as an example of what not to write, so a naive violation grep reports templating syntax in every clean sample.

**Convergence is the strongest signal there is, and it points away from the agents.** Independent models do not make the identical mistake by accident. When four of five write the same wrong thing, the rule caused it — and before touching the rule, check what the spec says, because three times in the record the answer was that the agents were right.

## 4. Triage in practice

Every finding is assigned to documentation, specification, implementation, or outlier, and the fix goes to the layer that is actually wrong. The full decision procedure is `docs/ratification-protocol.md`; these are four real assignments.

**Documentation — the named-slot fill (round 7).** The brief compelled exactly one named fill. Four of five Haiku failed: one wrote `<slot name="footer">` *in the page*, one nested a `<slot>` inside a page `<footer>`, one wrote `<slot slot="footer">` — both spellings at once — and one avoided the mechanism by inventing a third layout. Not contamination, not an outlier, and the spec was right: a `<slot>` in a page has always been inert. The cause was that the rule showed `<slot name="footer">fallback…</slot>` and never showed a fill, so the only concrete literal in the rule was the one that got copied into the wrong file. haiku-1's report quotes the sentence, restates the rule correctly, and then writes the wrong thing. The doc now shows the page-side literal (`<footer slot="footer">…</footer>`) and says outright that a `<slot>` tag in a page fills nothing. Round 9: 5 of 5 correct fills, zero stray `<slot>` tags.

**Specification — flat `og:` keys (round 5).** Four of six wrote `og:image: /card.png` where the spec required a nested block. The reflex is to call that invalid frontmatter; it does not survive checking. A colon is only a YAML key separator when followed by whitespace, so the flat form parses to a key literally named `og:image`, fell through to "every other key", and emitted `<meta name="og:image">` — a tag that looks right, builds clean, exits 0, and is ignored by every scraper. The spec was also arguing with itself: P17's own fix advice suggested the flat spelling the table did not accept. The rule was re-keyed off the key's *name* rather than the YAML shape, which made both spellings work and deleted a trap. Round 6: six of six wrote the flat form, including the control — the nested-only rule would have failed every sample.

**Implementation — the og: reference-check hole (round 13).** Found while triaging, not by a sample. `collectHtmlReferences` gathered `og:`/`twitter:` content only when it started with `/`, so under a full-URL `--base-url` the absolutized values were never reference-checked at all — despite §12's explicit sentence that stripping exists so those values "stay checkable instead of masquerading as external". A broken `og:image` 404'd silently and REF-02's `stripBaseUrl` was dead code for the metas it was written for. Round 18 found another by accident: a whole-line `# Build settings` comment in `unify.yaml` exited 2, because the trailing-comment strip requires whitespace before the `#`, so a comment at column 0 fell through to the key/value match and failed it. The round's fixture author had to delete the comment to keep it from swallowing the round.

**Outlier — one sample, no pattern (round 7).** haiku-5 used `data-layout` correctly and aimed it at the wrong layout for its override page. That is brief comprehension, not a rules defect. Outliers are recorded and watched, never amended for: the doc is capped, and spending a line on a one-off is how a 60-line file becomes a 200-line file nobody reads.

### The ledger

Every finding the loop shipped, by the layer it was charged to. "Tested" means a later round the fix was not written for came back clean; everything else is fitted to the round that found it.

| Finding | Round | Layer | Repair | Follow-up |
|---|---|---|---|---|
| Layout title separator described, not instructed | 1 | doc | layout-side literal, imperative | **tested** — 6/6 in r7, 6/6 in r9 |
| `<meta charset>` in pages "forbidden" | 2 | doc | the spec permits it; the doc was wrong | — |
| Flat `og:` keys rejected, silent dead `name=` meta | 5 | spec | key off the key's *name*, not the YAML shape | **tested** — 6/6 flat in r7 and r9 |
| Named-slot fill: layout literal copied into pages | 7 | doc | show `<footer slot="footer">`; A04 → **P20** | 5/5 in r9, 5/5 in r16 |
| Unquoted colon in a YAML title breaks the build | 7 | doc | "Frontmatter is YAML: quote any value containing a colon" | 0 P18 in r9 |
| P12 `fix:` suggested a destructive repair | 8 | impl (message) | "rename … or merge them into one" | 7/7 preserved in r10; 6/6 in r18 |
| P04 printed the Markdown spelling on HTML pages | 8 | impl (message) | spell the fix for the page's kind | 3/6 cited it in r18 |
| `--base-url` unnamed beside `--pretty-urls` | 11 | doc | name the flag | 5/5 in r12, every link prefixed |
| "run first" did not say who runs it | 11 | doc | show the literal command | 0 reports of the ambiguity in r12 |
| Path-form `--base-url` ships dead `og:` metadata | 13 | spec | full-URL form only; A15 tried, then retired | 6/6 in r14, 6/6 in r15 |
| og: values never reference-checked under a full base | 13 | impl | widen the REF-02 collector | unit tests only |
| Scaffold taught a placeholder as structure | 16 | scaffold | replace with `<main><slot></slot></main>` | — |
| `slot=` placement rule wrong in both directions | 16 | doc + engine | doc fixed; fill scope widened to the unwrapped `<main>` | — |
| Cascade + duplicate diagnostics (21 for one fault) | 18 | impl | DEDUP §14.1, cascade suppression §12 | 30 → 13 on r18's fixture |
| P04's `fix:` shipped one hardcoded layout path | 18 | impl (message) | suggest the layout the page would discover | — |
| P18 never named the colon | 18 | impl (message) | lead with the quoting rule and an example | — |
| Whole-line comment in `unify.yaml` exited 2 | 18 | impl | fix the comment strip; pin both surviving cases | — |
| A03 condemned valid documents, rewarded nested ones | 16/18 | spec | retire the advisory; §14.3 gains two tests | — |

## 5. The sharpest result: round 18's accidental control

Rounds 8 and 18 test the other half of the documentation — the error contract, which is a far larger surface than the 60 lines, written by implementers and read only in the moment someone is stuck. The design: plant known faults in a working site, hand it over with the CLI, require a clean build **without losing anything the site says**. Every page carries a unique `MARKER-*` sentence so content loss is mechanically detectable, because a repair that deletes a page to silence its error looks like success from the exit code alone.

Round 8 (seven-page site, eight problems, two advisories) returned 7 of 7 clean, four of them with no documentation whatsoever. Round 18 (ten pages, a fault set chosen deliberately outside round 8's — P02, P04, P07, P11, P13, P14, P18, P19, A03, A11, A13) returned 6 of 6 clean, zero markers lost, zero pages deleted, 65 of 66 planted-fault repairs correct.

Then the accident. Round 18's first launch inherited a harness default without `Bash`, so six samples repaired the site from the source alone, never running the tool. The run was preserved rather than discarded: **0 of 6 reached a clean build** — 17, 12 and 7 problems remaining in the no-docs arm — every one wrote a confident report, two copied the *broken* pattern from a neighbouring file, and none found P04, P14 or P18.

Round 8 established that the error contract is sufficient documentation for repair. This is the converse, and it is the stronger claim: without it, the same model on the same site fixes roughly half the faults and cannot tell that it failed. **For repair, the diagnostics are not a supplement to the 60 lines — they are the documentation.**

That conclusion has a direct consequence for how diagnostics are written, and the loop paid for every clause of it. A message must be located, must carry a `fix:` line, and that line must name the replacement spelling *for the file it is pointing at*:

- **A `fix:` line that suggests a destructive repair will get one.** P12 said "rename or remove one of the sources"; a round-8 sample removed `contact.html`, and the shop's address and phone number went with it. It now says "rename one of the sources, or merge them into one" — both named edits preserve every source's text. Round 18: all six resolved a case-collision by merging first and removing second, with no `fix:` line telling them to.
- **A `fix:` line must be spelled for the file it points at.** P04 printed the Markdown `layout:` spelling on HTML pages for the whole life of the project. The fixture covering it used a Markdown page, so the suite could not see it and two agents did.
- **And the path it shows must be the one that file would actually resolve.** Round 18's single wrong repair: a sample turned `layout: news` into `layout: /_layout.html` — the literal the fix line shipped — and propagated it into three more files, so both news articles built against the site layout instead of `news/_layout.html`, losing the section's body class and stylesheet at exit 0. Round 8 fixed this line's *kind*; the *path* was still one hardcoded literal, and in any site with a section layout that literal is a real, resolvable, wrong answer. The suggestion is now the layout the page would discover.
- **An advisory that names what it dropped must name what to write instead.** A04 had no `fix:` line at all.

## 6. What the loop changed in the product

The findings did not stop at prose. Four changes to the product itself came out of this record, and two design rules generalise from them.

**A rule that shows exactly one literal will have that literal copied**, whether or not it belongs in the file the reader is editing. This is the project's most repeated finding. It explains the named-slot failure (round 7), the P04 misdirection (round 8), the hardcoded layout path (round 18) — and, used deliberately in the other direction, it is what fixed `--base-url`: when the doc's single literal became the full-URL form, six of six samples in round 14 copied it on their first build and **no sample ever saw the advisory written to catch them**.

**Prefer deleting the choice over warning about it.** Whenever a diagnostic exists to compensate for a design the tool did not have to offer, the diagnostic is the wrong repair.

- **`--base-url` collapsed to one form.** Round 13: five of five Haiku published to a subpath with the path form, shipping `og:image` values no crawler can fetch, exit 0, every report claiming the sharing requirement verified. Advisory A15 was added to warn about it and lived for one day; the flag now requires the site's whole address and a bare path is a usage error naming the full form. Round 15: 6 of 6 correct, **18 of 18 frontmatter values root-relative** (authors write portable paths, the build supplies the address), and nobody hit the usage error at all.
- **A04 was promoted to problem P20.** A stray `<slot>` outside a layout's `<body>` is inert in every case; as an advisory it let the page ship anyway. Round 7's three samples published at exit 0 carrying the layout's fallback footer *and* the intended replacement loose in the body. Nothing was lost, so the content-loss law was satisfied and the author's intent still silently did not happen. Every sibling misplacement of this vocabulary — P07, P15, P16, P19 — was already a problem; A04 was the outlier.
- **A03 was retired, because the advisory was the defect.** Rounds 16 and 18 each surfaced a case where a fill did not happen and nothing said so. Rather than deciding by instinct, three independent proposals were written from deliberately opposed angles — prose-only, new-diagnostic, delete-the-choice — each attacked by an adversarial judge told to default to rejecting and to verify by running the CLI. The two cases needed opposite treatments and neither needed a new diagnostic. A03 fired on a `<header>` written inside a page's own `<main>` — textbook HTML — because §7.2's unwrap hoists it to top level and §7.6 then reports it for being there; wrapping the same header in a meaningless `<div>` silenced it. Worse, its own implied repair was a trap: against a layout wrapping its slot in a matching landmark, `<footer>MY FOOTER</footer>` fired A03 and failed `--strict` with two valid sibling footers, while applying the repair composed a footer inside a footer at exit 0 with nothing reported. Retiring it was purely subtractive — zero bytes of output changed. Two operational tests generalise out of it into §14.3: *an advisory that a meaningless wrapper element switches off is reporting tree position, not authorial error*, and *an advisory whose only available repair edits a file the page does not own is instructing a restructure by another name.*
- **`--dry-run` names the deployed address.** Round 11's haiku-4 published with `--pretty-urls` and no `--base-url`: 0 of 47 links carried the base path, so every link 404'd at the deploy address while the build exited 0 — the reference check runs against the output tree, where all of them resolve. The report now opens with `serving from <base>` and each row carries the URL that file answers to. Round 17 ran an A/B on *where* that line belongs, 8 Haiku per arm, and returned a null result: the arms are indistinguishable, and the one sample that shipped a broken site had already read the line, quoted it, and reasoned correctly from it before running a different command. The line stayed where it is.

One further finding was not a doc defect at all. Round 16 was the first round to start from `unify init`, and the scaffold outperformed the prose — 5 of 5 on the named-slot fill the 60 lines had historically failed at, with no sample re-reading the rule. **Working code teaches a shape that prose has to argue for.** It also taught one thing wrong: the template's sink was `<main><p>Page content appears here.</p></main>`, four of four Haiku left it in place and three copied it verbatim into a brand-new section layout. Triage: not doc, not spec, not implementation — **scaffold**. The tell was the control's replacement, `<main><slot></slot></main>`: the rules doc's own literal, the shape those 60 lines call "the usual", and a shape the scaffold did not contain.

## 7. The guardrails that kept it honest

An empirical loop with no constraints becomes overfitting with extra steps. These are not negotiable.

- **Spec beats fixture beats engine.** Never edit an expectation to make a test pass; never bend the engine to satisfy a fixture, and never rewrite the engine to make an authoring sample pass. This project violated the rule once — an implementer rewired the publish gate to satisfy a fixture that contradicted the spec and documented it as a bugfix — and it took a full audit to unwind.
- **`docs/authoring-rules.md` is capped at 60 lines**, with CI enforcing byte-identity against the copy embedded in `README.md`. Every addition displaces something, and the cap is never relaxed "just this once". It is a feature: in round 5 it forced trading a Markdown include-placement clause no sample in forty had ever exercised for a fix to silent wrong output on a feature a brief actually requested. Without the cap both would have been kept and nothing learned.
- **Only amend for failures the documentation caused.** A valid-but-different choice is not a violation — samples have legitimately differed on hero-in-slot versus hero-in-content, authoring at the root versus in `src/`, and skipping `<include>` where one layout already makes chrome identical. Recording those as failures is the fastest way to ruin the experiment.
- **Amend a few things per round, then re-run**, and keep the brief fixed while measuring a fix. Changing the task and the doc at once makes the result uninterpretable.
- **A spec amendment carries its evidence.** Editing `docs/conformance-spec.md` requires a `tests/conformance/rules.tsv` row and a fixture in the same commit; a sync check enforces it. The advisory catalogue is capped at twelve and now holds nine — at the cap, adding one means removing one.
- **Pre-register the analysis when the result could be read either way.** Rounds 8 and 13 wrote their hypotheses and their mechanical verdict criteria before any sample ran (`_notes/ratification-round-8-preregistration.md`, `_notes/ratification-round-13-preregistration.md`). Round 8's H1–H3 predicted cascade noise would cause wrong edits; it did not, and the honest reading — recorded rather than acted on — was that the objection was aesthetic until a sample was actually harmed by it. The measurement came later and independently: a 20-page site with one page failing to compose printed 21 problems, 19 of them byte-identical duplicates, with the one true diagnostic printed last. That is what justified the dedup and cascade suppression in §14.1/§12, not the round-8 hunch.
- **Distinguish fitted from tested.** A fix measured only by the round it was written for is fitted. It is *tested* when a later round it was not written for comes back clean. The `og:` fix and the title separator have cleared that bar; most of the round-7-onward amendments have been measured exactly once.

## 8. Running it again, and what is still untested

`docs/ratification-protocol.md` is the procedure — setup, the harness traps, the triage order, the two amendment rules, and the results table for all eighteen rounds. `_notes/ratification-handoff-prompt.md` is the self-contained block to hand a fresh agent, including the five gates that must be green before any commit.

Known limits of the method, stated because a method with no acknowledged limitations has not been examined: it reaches only the authoring surface, roughly a fifth of the spec — splice rules, head-merge tables, collision matrices, URL rewriting and publish semantics are unreachable by an agent writing HTML. Samples are correlated, since models share training data. And the bar is a model, so "Haiku gets it right" is a moving target; a doc that passed a year ago is not thereby passing today.

Open work, in the order the record recommends:

1. **The human half.** Eighteen rounds, all models. A person who knows HTML but not this tool fails differently — they stop and re-read where a model guesses and moves on.
2. **A Markdown source map.** A body-derived diagnostic on a `.md` page currently omits its line number, because the text the engine holds at that point is converted HTML and any line it computed would be a guess (DIA-13). Omitting is correct and it is not the same as being located; mapping converted offsets back to `.md` source lines would let those diagnostics carry a real `FILE:LINE`.
3. **The mis-nested fill.** A `slot=` under a plain wrapper `<div>` still does nothing, still ships unify's own attribute into output that is supposed to contain no tool vocabulary, and says nothing. Three catalogue slots are free, but the evidence does not yet say whether authors write that markup at all. The experiment that would settle it is a brief compelling a fill from inside a styled wrapper — not a guess.
