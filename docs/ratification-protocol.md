# Ratification: dialling in the rules with micro-experiments

`docs/authoring-rules.md` claims to be the complete authoring surface in 60 lines — learnable in one sitting, or pasteable into a prompt. This document is the procedure that tests that claim instead of asserting it, and the decision framework for acting on what the tests find.

The method is small: give a model **nothing but those 60 lines and a plain-English brief**, in a sandbox it cannot escape, and see whether it authors a compliant site. Run several samples. Look for patterns. Change one thing. Run again.

This document is the procedure. `docs/ratification.md` is its companion: what eighteen rounds actually found, how each finding was triaged, and what changed in the documentation, the specification, the implementation, and the product as a result.

## Why this works when review does not

Reviewing your own documentation fails in a specific way: you read it the way you meant it. Every ambiguity resolves silently in your head, so the sentence that will mislead a reader looks fine to you forever.

An agent authoring from the doc cannot do that. It has to *act*, and the action is either right or wrong. That converts a question of interpretation into a measurement.

The empirical record from this project: three adversarial reviews and a ten-agent design panel read the same document and missed defects that the first round of authoring agents surfaced in twenty minutes. Later, paper review started *injecting* defects — roughly three new silent-failure modes introduced while fixing fifteen. Reading has a floor; running does not.

**This also serves human authors, not just agents.** A rule an agent gets wrong from the text alone is a rule a newcomer gets wrong too — they just fail more quietly, and you never hear about it. The agent is a fast, cheap, uncomplaining proxy for the reader who gives up instead of filing an issue.

## The bar

The rules and the spec are **ratified** when the weakest model in the loop — Haiku — consistently (4 of 5 or better) produces a spec-compliant multipage site from the rules alone.

Run a stronger model alongside as a control. The comparison is the signal: **when the strong model succeeds where the weak one fails, the gap is a documentation defect that reasoning can paper over, not a capability floor.** In round 1, Sonnet got the title rule right and 3 of 4 Haikus got it wrong — and both Sonnets reported having *inferred* it rather than read it. That combination is diagnostic. The rule was described accurately and instructed nobody.

## Setup

**Isolation must be structural, not instructed.** In-session subagents inherit project context — the repo's `CLAUDE.md` loads no matter what the prompt says. Run each agent as its own process with cwd inside a sandbox:

```bash
cd /tmp/ratify/<round>/<agent>
printf '%s' "$PROMPT" | claude -p --model haiku \
  --permission-mode acceptEdits --allowedTools Read Write Edit Glob Grep
```

Verify it rather than trusting it — and verify the right thing. Asking the agent whether
it has project context is necessary and **not sufficient**: `cwd` is not isolation,
because `Read` and `Bash` both take absolute paths. A round-19 probe answered **"NO"** to
that question and, in the same file, listed three copies of `conformance-spec.md` and six
harness copies it had just found on disk. Rounds 16–18 ran with the full specification
readable, and their samples would have answered NO too.

Run each sample in a private mount namespace instead (`/tmp/ratify/harness/isolate.sh`):
bind the sample directory to `/sandbox`, bind a fresh writable `/tmp` over the real one —
masking every other copy at once, since enumerating leak paths by hand was wrong twice —
and mask the repo and the session transcripts. The check is then empirical: the sample
answers NO **and** a whole-filesystem search for the tool's documentation returns nothing.
Do both once per protocol change.

Copy the task, the rules, and the report format **into** each sandbox so no path outside cwd is ever referenced. Regenerate the rules file from the doc each round, so every sample is provably given byte-identical input:

```bash
{ echo '```markdown'; cat docs/authoring-rules.md; echo '```'; } > <sandbox>/rules.md
```

Two traps that each cost a full round:

- **`--allowedTools` is variadic** and will swallow a positional prompt as another tool name. Pass the prompt on stdin. (Symptom: every agent exits 1 with "Input must be provided.")
- **Restrict tools to file access.** In print mode a permission prompt has nobody to answer it, and the run hangs to its timeout.

Two more that cost hours rather than rounds:

- **Empty the sandbox before re-seeding it.** A retried sample that starts on top of the dead run's half-built site is not a sample, and nothing downstream will tell you.
- **Stagger the launches.** Thirteen simultaneous cold starts produced a burst of transient proxy TLS failures that killed half a round; twenty seconds apart, none. Check every sample's exit code before analysing anything — a sample that never started looks exactly like a sample that did nothing.

## Running a round

1. Regenerate the rules file from the current doc.
2. Seed N sandboxes (5 Haiku + 1 control is a good default).
3. Launch, wait, collect.
4. **Run `unify build --dry-run --strict` over every sample yourself.** Exit code plus the
   diagnostic list is the verdict.
5. Read the output anyway — a green exit says the site composes, not that the author reached
   for the mechanism the brief was built to compel.
6. Read every agent's self-report.
7. Triage each finding (next section).
8. Amend at most a handful of things. Re-run.

**The build is the instrument, and it is much sharper than reading.** Rounds 1–6 were judged
by hand and recorded two 6/6 sweeps. The first brief judged by the real build came back
**1 of 5**, on a doc those rounds had passed. Nothing regressed; the measurement improved.
Read every pre-round-7 result as *no violation a human reviewer noticed*, and re-run any
older brief you intend to rely on.

Two cautions the upgrade brings. Put the CLI **inside** the sandbox (a compiled binary
carries no docs with it) so isolation still holds — verify with the project-context
question, as always. And keep briefs honest about what the build will check: a reference to
an image the agent had no way to create fails the build without telling you anything about
the doc. Seed those assets, or ask for placeholders in the brief.

### Giving the agent the build, or not

Both are experiments, and they answer different questions.

- **Blind authoring** (the agent cannot run anything) measures *the document*. Use it when
  you are testing whether a rule teaches.
- **Authoring with the build** measures *the document plus the error contract*, which is
  how anyone actually works. Use it for briefs about publishing and deployment, where the
  tool's own output is part of the loop.

Do not switch a brief from one to the other while you are measuring a fix — that changes
the environment as well as the doc, and the result stops being attributable.

**Ask every agent what the rules did not answer and what it had to re-read.** That self-report has been more diagnostic than the output in every round: the files show the symptom, the report points at the sentence. haiku-3 in round 1 not only got the title wrong but explained that it had concluded titles were a Markdown-only feature and *restructured the site around the limitation it had imagined*. No amount of staring at its HTML would have revealed that.

**Judge what a sample did from its transcript, not from its report.** The self-report is the best evidence available about what a sample found *ambiguous*, and it is not evidence about what the sample ran or wrote. Round 15's write-up claimed five of six samples never ran `--dry-run`; the session transcripts show all six did, and the figure had come from grepping each agent's final report text. Round 16 hit the same thing twice independently — a report naming `data-layout=` on pages that carry the Markdown `layout:` spelling, and another declaring a site clean of a placeholder string its own files still contained. Read the files and the transcript for what happened; read the report for where the reader hesitated.

**Sweep the site output, not the sandbox.** `rules.md` quotes `{{ }}` as an example of what not to write, so a naive violation grep reports templating syntax in every clean sample. Exclude the harness files. (I lost a round's analysis to this and briefly believed four samples had failed.)

**Judge with the standing instrument, not ad-hoc greps: `bun _notes/judge-round.mjs <round-dir>`** extracts each sample's own publish command whole (quoted arguments, backslash continuations), re-runs it in place with `--dry-run --strict`, greps for exact private values only, resolves client-side fetch targets against the deploy address, and records every candidate command so a wrong pick stays visible. Improvised judging is how every false verdict in this record happened — three in rounds 19–20 alone (a regex that truncated a quoted URL, a split line-continuation, a domain-level privacy grep), all from the experimenter and none from the samples.

## Triage: doc, spec, implementation, or outlier

This is the part that matters. Getting it wrong means overfitting the doc to noise, or worse, "fixing" agents that were right.

Work through it in order.

### 0. Is it a violation at all?

**A valid-but-different choice is not a failure.** Samples have legitimately differed on: putting a hero in ordinary page content versus a named slot; authoring at the source root versus in `src/`; using an explicit `data-layout` where discovery would have sufficed; and skipping `<include>` entirely when a single layout already makes chrome identical everywhere.

If the output builds clean and matches the spec, it is not a finding, however much you would have written it differently. Recording these as failures is the fastest way to ruin the experiment.

### 1. Is the sample contaminated?

If retired vocabulary or a construct from a *previous* version of the product appears, suspect the environment before the doc. Re-run that sample in a verified sandbox. Across rounds 1–2, zero of eleven samples emitted retired vocabulary despite a measurable context leak — so contamination is rare, but it invalidates a sample completely when it happens.

### 2. Did several independent samples make the *same* mistake?

This is the strongest signal available, and it points **away** from the agents.

- **Multiple samples, same wrong thing → the documentation caused it.** Independent models do not converge by accident. Round 2: four of five wrote `<meta charset>` into pages, against a rule forbidding it. Round 5: four of six wrote flat `og:image:` keys instead of a nested block.
- **Before fixing the agents, check the spec.** Both examples above turned out to be *the documentation being wrong*, not the agents. The spec said a page charset identical to the layout's is silent — permitted — while the doc forbade it, and the doc's own neighbouring rule demanded complete standalone documents, which is exactly what has a charset. The `og:` case was worse: flat keys are valid YAML that parsed to a real key and emitted a valid-looking `name=` meta that every scraper ignores — silent wrong output on the one feature the brief asked for.

> **Rule: when several independent samples make the identical mistake, verify what the spec actually says before touching the doc.** Twice in six rounds, the answer was that the agents were right.

### 3. Is it a documentation defect?

Ask three questions about the rule:

- **Vantage point.** Which file is the reader editing when this rule applies, and is the sentence addressed to *that* person? The title rule read "your title joins the layout's, which carries the separator" — a description, from the page's point of view, that instructed the layout author to do nothing. Every page-side sample was right; three of four layout-side samples were wrong.
- **Named but not shown.** Does the rule use a term of art without demonstrating it? "An `og:` block becomes `property=` metas" — *block* is doing all the work, and the dominant convention in Jekyll/Hugo/Astro frontmatter is flat keys, so the model prior filled the gap.
- **Scope of the example.** Does a list read as exhaustive when it was meant as illustrative? "Works anywhere: `<head>`, other fragments, `.md` pages" omitted **layouts** — the single most common place an include goes — and a sample noticed and hesitated.

The fix is almost always **imperative and concrete**, not longer. Show the literal string to type.

### 4. Is it a specification defect?

Distinguish from a doc defect by asking where the wrongness lives:

- The doc faithfully describes the spec, and the *spec* produces a bad outcome → **spec defect**.
- The spec is right and the doc misdescribes it → doc defect.
- The spec contradicts itself → spec defect, and check whether fixtures encoded the wrong half.

Round 5's `og:` finding was both: the spec required a nested block, the flat spelling silently produced a dead tag, and the spec's own error message *suggested* the flat spelling it did not accept. The repair keyed the rule off the key's **name** rather than the YAML shape, which made both spellings work and deleted a trap.

### 5. Is it an implementation defect?

Only reachable once an engine exists. The spec says X, the doc says X, the build does Y.

Resolution order is fixed and binding: **spec > fixture > engine.** Never edit an expectation to make a test pass; never bend code to satisfy a fixture. This project violated that rule once — an implementer rewired the publish gate to satisfy a fixture that contradicted the spec, and documented it as a bugfix — and it took a full audit to unwind.

### 6. Is it an outlier?

One sample in N, no pattern, and the agent's own report shows a reasoning slip rather than confusion about the text.

**Do not amend for outliers.** The doc is capped; spending a line on a one-off is how a 60-line file becomes a 200-line file that nobody reads. Record it, watch for recurrence in later rounds, and act only if it repeats.

If you are unsure between "outlier" and "doc defect," run more samples. Samples are cheap; a bad amendment is permanent.

## The other experiment: repair, not authoring

Every round above asks whether the rules teach you to *build* something. None of them tests
whether the diagnostics teach you to *fix* something — and the error contract is a far
larger documentation surface than the 60 lines, written by implementers, read only in the
moment someone is stuck.

The design that works: plant known faults in a working site, hand it over with the CLI, and
require a clean build **without losing anything the site says**. Give every page a unique
marker sentence so content loss is mechanically detectable — a repair that deletes a page
to silence its error is the failure mode you are hunting, and it looks like success from
the exit code alone. Run it in two arms — the CLI alone, and the CLI plus the rules — and
the difference tells you which surface is carrying the load.

Round 8's answer was that the messages are sufficient: seven of seven samples reached a
clean build, four of them with no documentation whatsoever. What it found instead was three
messages that misdirect, and only one of the three was visible from reading them:

- **A `fix:` line that suggests a destructive repair will get one.** "rename or remove one
  of the sources" — a sample removed one, and the page's address went with it.
- **A `fix:` line must be spelled for the file it is pointing at.** P04 printed the
  Markdown spelling on HTML pages for the whole life of the project; the fixture that
  covered it used a Markdown page, so the suite could not see it and two agents did.
- **An advisory that names what it dropped must also name what to write instead**, or the
  author gets told they have a problem and not how to leave it.

Message prose is explicitly not contract (conformance §14.1), so these are cheap to fix —
but each one still needs a test, and the P04 case is the argument for fixture *variety*
over fixture count: one rule, two page kinds, and only the untested kind was broken.

## The two amendment rules

1. **Only amend for failures the documentation caused.** See triage step 0.
2. **Every addition must displace something.** The doc is capped at 60 lines, and CI enforces byte-identity with the copy embedded in the README. If a fix needs five lines, the underlying **rule** is too complicated and the repair probably belongs in the spec.

That cap is a feature, not an inconvenience. It forces an explicit judgment about which rule earns its line. In round 5 it made me trade a Markdown include-placement clause that no sample in forty had ever exercised for a fix to silent wrong output on a feature a brief actually requested. Without the cap I would have kept both and learned nothing.

**Amend a few things per round, then re-run.** Changing ten things at once means you cannot attribute the next round's results to any of them.

## Designing the brief

The brief decides what gets tested, and a brief that seems thorough can leave whole primitives untouched.

Eleven samples across three rounds never used `<include>` once — correctly, because a single-layout site never reuses a fragment across files. The primitive was undocumented-by-omission and nobody noticed, because every sample "passed."

Write briefs that **compel** the constructs, through content requirements rather than instructions:

| To exercise | Ask for |
|---|---|
| `<include>` | two layouts that must carry identical chrome |
| Layout discovery by proximity | a section with a different layout but the same header/footer |
| `data-layout="none"` | a page embedded in someone else's site, with no chrome |
| A named slot with fallback | something that differs on exactly one page |
| Frontmatter breadth | pages needing a search summary, a social image, a date |
| An explicit layout override | one page in a section that must use the *site* layout |
| URL provenance | an image referenced from shared chrome, used at several depths |

Never say "use a named slot." Say the footer shows one thing everywhere and something else on the contact page. You are testing whether the rules lead someone to the right construct, not whether they can follow an instruction.

**Keep a brief stable across rounds when measuring a fix.** Changing the task and the doc simultaneously makes the result uninterpretable. Introduce new briefs deliberately, as new experiments.

## Recording

Keep a results table with, per round: sample count and models, the specific property under test, violations found, and — most valuable — **which findings were doc, spec, implementation, or outlier**. That last column is what lets you see whether the doc is converging or you are chasing noise.

Also record the amendments and their justification, so a later reader can tell a fix from a preference.

## What this method gets wrong

Stated plainly, because a method with no known limitations has not been examined:

- **It only tests the authoring surface.** Roughly a fifth of the spec. Splice rules, head-merge tables, collision matrices, URL rewriting, publish semantics, and the watch contract are unreachable by an agent writing HTML — only an implementation tests those.
- **A clean round is weak evidence about a doc that was just patched.** Every fix is fitted to the round that found it. A fix is only *tested* when a later round it was not written for comes back clean. Track that distinction.
- **Samples are correlated.** Models share training data, so a convergent mistake may reflect a shared prior rather than a genuine ambiguity — though as triage step 2 argues, a strong shared prior *is* a reason to write the rule differently.
- **The bar is a model, and models change.** "Haiku gets it right" is a moving target. Re-run the suite when the model line moves; a doc that passed a year ago is not thereby passing today.

## Results log

| Round | Samples | Under test | Result |
|---|---|---|---|
| 1 | 4 Haiku, 2 Sonnet | baseline | Layout title 3/6 — **1/4 Haiku**. Four doc ambiguities reported. |
| 2 | 5 Haiku, 1 Sonnet | title fix | **5/5 Haiku.** One hand-written `/about/`. Four `charset` "violations" that were the doc's error. |
| 3 | 5 Haiku, 1 Sonnet | harder brief, full isolation | **6/6 clean.** All four previously-untested primitives exercised. |
| 4a | 5 Haiku, 1 Sonnet | rounds 1–2 brief, isolated | **6/6 clean** — retires the asterisk on rounds 1–2. |
| 4b | 5 Haiku, 1 Sonnet | round 3 brief, repeated | 6/6, one broken section link — first defect found against *unpatched* text. |
| 5a | 5 Haiku, 1 Sonnet | link fix | **6/6 clean.** |
| 5b | 5 Haiku, 1 Sonnet | new content brief | 6/6, **4/6 wrote flat `og:image:`** — a spec defect, not an authoring one. |
| 6 | 5 Haiku, 1 Sonnet | `og:` + link fixes | **6/6 flat spelling, zero broken links.** Every sample used the form the old rule rejected. |
| 7 | 5 Haiku, 1 Sonnet | first round judged by the build; a brief the round-5/6 fixes were not written for | **1/5 Haiku clean**, Sonnet clean. `og:` flat spelling 6/6 — that fix is now *tested*. Two doc defects: named-slot fill (4/5 wrong), unquoted colon in a YAML title (2/5). |
| 8 | 4 + 3 Haiku/Sonnet, two arms | the diagnostics as documentation — repair a broken site | **7/7 reached a clean build**, four of them with no docs at all. One sample deleted a page's content following a `fix:` line. Three messages amended. |
| 9 | 5 Haiku, 1 Sonnet | round 7's brief, amended doc (fitted) | **5/5 correct `slot=` fills** (was 1/5); every colon-bearing title quoted. 3/5 clean overall — both misses were referenced image files the sandbox could not produce. |
| 10 | 3 + 4 Haiku/Sonnet, two arms | round 8's fixture, amended messages (fitted) | Arm B **3/3 clean with zero content lost** (was 1 of 3 losing a page); every sample merged rather than deleted. |
| 11 | 5 Haiku, 1 Sonnet | `--base-url`, `--pretty-urls`, `_headers`/A14, `_scripts/` — never before tested | **5/6.** The seams work: every sample shipped `_headers` from the A14 recipe and wrote a working generator. One sample omitted `--base-url` — a flag the doc did not name — and published a site whose every link 404s, with exit 0. |
| 12 | 5 Haiku, 1 Sonnet | round 11's brief, amended doc (fitted) | **6/6.** Every root-relative link prefixed (39, 39, 47, 39, 37 and 71 of them, none missed); every sample wrote and ran a `gen.mjs`; nobody asked whether unify runs the script for them. |
| 13 | 5 Haiku, 1 Sonnet | og:image + subpath deploy (pre-registered) | **5/5 Haiku shipped dead social metadata with exit 0 and reports claiming it verified**; Sonnet escaped on prior knowledge alone; 0/6 found the full-URL `--base-url`. Spec-level repair: advisory A15 (the catalogue's last slot), the doc's literal becomes the full form, `--help` names both. A REF-02 implementation gap (absolutized og: never reference-checked) found and fixed alongside. |
| 14 | 5 Haiku, 1 Sonnet | round 13's brief, amended doc + live A15 (fitted) | **6/6 absolute og: URLs** (was 0/5). No sample ever saw the advisory — the doc's full-URL literal carried all six on the first build. A15 stays as the net under the path form nobody needed this round. |
| 15 | 5 Haiku, 1 Sonnet | round 13's brief; `--base-url` collapsed to one form, address named in the report (fitted) | **6/6**, and **18/18 frontmatter values root-relative** — no sample hardcoded a domain, none needed the new usage error. The report change went under-exercised: six of six ran `--dry-run`, but five passed `--base-url` to the first one and so never saw the warning form. |
| 16 | 4 Haiku, 1 Sonnet | the first round to start from `unify init` — do the scaffolded templates teach? | **5/5 clean, the first round with zero diagnostics anywhere.** The scaffold erases the doc's two worst failures without anyone re-reading a rule: 5/5 correct `slot=` fills (was 1/5). It also taught one thing wrong — 4/4 kept a placeholder in the position of structure and 3/4 copied it into new code. Scaffold defect, not a doc defect. |
| 17 | 16 Haiku, two arms | where `serving from …` belongs: `--dry-run` only, or every build | **Null result — the arms are indistinguishable**, and the one sample that shipped a broken site had already read the line and reasoned correctly from it before running a different command. Line stays put. |
| 18 | 6 Haiku, two arms (+6 accidental blind) | the diagnostics re-tested on a fault set chosen outside round 8 | **6/6 clean, zero content lost** — round 8's destructive repair is closed. One wrong repair, caused by a `fix:` line shipping a hardcoded path that is a real but wrong answer in any site with a section layout. The accidental control is the finding: **0/6 reached a clean build without the CLI**, and every one reported confidently. |
| 19 | 5 Haiku, 1 Sonnet | an advanced site: pages generated from a JSON export, client-side filtering, a subpath deploy — and the first round under true filesystem isolation | **6/6 exit 0, zero content lost.** 6/6 wrote a generator and got the chrome-less embed right. 2/6 shipped `.html` addresses at exit 0, one having "verified" that unify would serve them. 5/6 rendered private data from an excluded file onto public pages — file-level exclusion protects files, not fields. The client-side seam went untouched: a brief defect, since 0/6 wrote an endpoint. |
| 20 | 5 Haiku, 1 Sonnet | the client-side fetch seam at a scale that forbids inlining, and the §11.1/rules-doc url()+fetch fix | **6/6 exit 0, zero content lost. 5/5 fetching samples resolved correctly at the deploy address**, four quoting the new clause verbatim — the fix measured by quotation, still fitted. One reported the clause names the trap without a remedy for fetch (now added). The control never writes the URL in JS at all: a real `href` unify rewrites, read back by the script. The planned htmx-partial brief was withdrawn on checking — unify cannot emit a bare HTML fragment by any route. |

Round 6 is the clearest single result: with the rule keyed off the key's name, **six of six** wrote the flat spelling — including the control. The nested-only rule would have failed every sample on that brief.

Round 7 is the most uncomfortable one: the same document that had passed four consecutive rounds failed four of five samples the moment the build did the judging. Two of those failures were real doc defects, and the fixes took the same brief to 5/5 in round 9. The other lesson is about the method rather than the doc — **a clean sweep is only as good as the instrument that declared it clean.**

### The pattern across eleven rounds

Every genuine failure has had the same shape: **a mechanism described from the wrong vantage point, named without being shown, or not named at all, where a strong ecosystem convention was waiting to fill the gap.** Titles, `charset`, section links, `og:` keys, the named-slot fill, a colon in a YAML title, `--base-url` — seven instances, every one repaired by making the doc imperative and concrete rather than by adding rules.

The sharpest version of it: a rule that shows exactly one literal will have that literal copied, whether or not it belongs in the file the reader is editing. The named-slot rule showed `<slot name="footer">` and got it pasted into pages by three of five samples; the P04 diagnostic showed `layout:` and sent two repair samples hunting for that key in an HTML file. **Show the string that belongs in the file you are talking to.**

The corollary, from round 11: naming one of a pair is worse than naming neither. The doc named `--pretty-urls` and not `--base-url`, so a sample that had correctly diagnosed the subpath problem read the omission as proof no such flag existed and invented a hosting behaviour to cover it.

The doc did not get longer. It got more specific.
