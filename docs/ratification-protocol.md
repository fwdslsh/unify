# Ratification: dialling in the rules with micro-experiments

`docs/authoring-rules.md` claims to be the complete authoring surface in 60 lines — learnable in one sitting, or pasteable into a prompt. This document is the procedure that tests that claim instead of asserting it, and the decision framework for acting on what the tests find.

The method is small: give a model **nothing but those 60 lines and a plain-English brief**, in a sandbox it cannot escape, and see whether it authors a compliant site. Run several samples. Look for patterns. Change one thing. Run again.

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

Verify it rather than trusting it: a run configured this way answers **"NO"** when asked whether it has any project context describing the tool. Do that check once per protocol change.

Copy the task, the rules, and the report format **into** each sandbox so no path outside cwd is ever referenced. Regenerate the rules file from the doc each round, so every sample is provably given byte-identical input:

```bash
{ echo '```markdown'; cat docs/authoring-rules.md; echo '```'; } > <sandbox>/rules.md
```

Two traps that each cost a full round:

- **`--allowedTools` is variadic** and will swallow a positional prompt as another tool name. Pass the prompt on stdin. (Symptom: every agent exits 1 with "Input must be provided.")
- **Restrict tools to file access.** In print mode a permission prompt has nobody to answer it, and the run hangs to its timeout.

## Running a round

1. Regenerate the rules file from the current doc.
2. Seed N sandboxes (5 Haiku + 1 control is a good default).
3. Launch, wait, collect.
4. Sweep the output mechanically for violations.
5. Read every agent's self-report.
6. Triage each finding (next section).
7. Amend at most a handful of things. Re-run.

**Ask every agent what the rules did not answer and what it had to re-read.** That self-report has been more diagnostic than the output in every round: the files show the symptom, the report points at the sentence. haiku-3 in round 1 not only got the title wrong but explained that it had concluded titles were a Markdown-only feature and *restructured the site around the limitation it had imagined*. No amount of staring at its HTML would have revealed that.

**Sweep the site output, not the sandbox.** `rules.md` quotes `{{ }}` as an example of what not to write, so a naive violation grep reports templating syntax in every clean sample. Exclude the harness files. (I lost a round's analysis to this and briefly believed four samples had failed.)

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

Round 6 is the clearest single result: with the rule keyed off the key's name, **six of six** wrote the flat spelling — including the control. The nested-only rule would have failed every sample on that brief.

### The pattern across all six rounds

Every genuine failure had the same shape: **a mechanism described from the wrong vantage point, or named without being shown, where a strong ecosystem convention was waiting to fill the gap.** Titles, `charset`, section links, `og:` keys — four instances, all repaired by making the doc imperative and concrete rather than by adding rules.

The doc did not get longer. It got more specific.
