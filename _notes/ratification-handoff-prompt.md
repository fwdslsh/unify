# Handoff prompt — run the ratification loop

Paste the block below to hand this work to a fresh agent. It is self-contained apart from the repo itself.

---

You are continuing an empirical documentation-validation loop on `unify`, a static site generator, at `/home/founder3/code/github/fwdslsh/unify`, branch `release/0.7.0`.

## The goal

`docs/authoring-rules.md` claims to be the complete authoring surface in 60 lines — learnable in one sitting, or pasteable into a prompt. Your job is to keep proving or disproving that empirically, and to dial the rules in until they are the easiest way for both an AI agent and a human to author a site correctly.

The method is micro-experiments: give a weak model **nothing but those 60 lines and a plain-English brief**, in a sandbox it cannot escape, and see whether it authors a compliant site. Several samples per round. Look for patterns. Change one or two things. Run again.

**Read `docs/ratification-protocol.md` in full before doing anything.** It is the procedure, and its triage section — deciding whether a failure is the documentation, the specification, the implementation, or noise — is the part that matters most. Do not improvise around it.

## Where things stand

Six rounds are done and logged in the protocol's results table. The bar — Haiku producing a compliant site 4-of-5 or better from the rules alone — is currently met. Two genuine **specification** defects were found this way (a rule forbidding something the spec permits silently; a frontmatter key shape that emitted a valid-looking but functionally dead meta tag), both because several independent samples made the identical "mistake" and the spec turned out to be what was wrong.

The engine is complete: 116/116 conformance cases, 501/501 unit tests, zero traceability gaps, all release gates green.

## The upgrade you should make first

**The protocol was designed when no engine existed.** Judging a sample meant inspecting its files by hand against the spec. That is no longer necessary — `unify build --dry-run --strict` now works, and the whole diagnostic catalogue is implemented.

So: let each agent run the real build in its sandbox, and make **exit code plus the diagnostic list** the primary verdict. That converts a slow, subjective read into an objective pass/fail, and it will catch violations that manual inspection misses. Keep reading the agents' self-reports afterwards — those still point at the ambiguous *sentence*, where the exit code only shows the symptom.

Two cautions. Installing the CLI into the sandbox must not leak the repo's own docs — verify isolation still holds (a configured run answers "NO" when asked whether it has project context about this tool). And a sample that builds clean can still be *wrong*, e.g. writing valid HTML that ignores a documented mechanism; do not let a green exit code stop you reading the output.

## What to do

1. **Confirm the current fixes hold.** Round 6's clean sweep tested the `og:` and link amendments — but those were written in response to round 5, so round 6 was fitted to them. Per the protocol's own rule, a fix is only *tested* when a round it was not written for comes back clean. Re-run round 5b's brief unchanged.

2. **Probe what no brief has reached.** Areas with no coverage from any round: `--pretty-urls` and `--base-url` authoring (writing links that survive both), deployment files (`_headers`/`_redirects` and the A14 advisory), the `_scripts/` generator seam for derived pages, and error recovery — give an agent a *broken* site and see whether the diagnostics alone are enough to fix it. That last one tests the error contract as documentation, which nothing has tested at all.

3. **Watch the `<include>` pattern.** Across two runs of the brief designed to require a shared fragment, roughly a quarter of samples still wrote two layouts and duplicated the chrome verbatim. Output-correct, so not a violation and not counted as one — but it is the one place the doc describes a tool some authors do not reach for. Decide with evidence whether that is a documentation problem or simply a preference, and do not "fix" it by adding an exhortation.

4. **Consider the human half.** The stated goal covers humans as well as agents, and every round so far has measured only models. A short session with a person who knows HTML but not this tool would test a different failure mode — where they stop, re-read, or give up.

## Constraints, which are not negotiable

- **`docs/authoring-rules.md` is capped at 60 lines**, and CI enforces byte-identity with the copy embedded in `README.md`. Every addition must displace something. After editing, re-splice the README by locating the `<!-- BEGIN docs/authoring-rules.md -->` / `<!-- END ... -->` markers dynamically (never hardcode line numbers) and verify with `cmp`.
- **Only amend for failures the documentation caused.** A valid-but-different choice is not a violation. Do not amend for outliers; record them and watch for recurrence.
- **When several independent samples make the identical mistake, check what the spec says before touching the doc.** Twice out of six rounds, the agents were right and the rule was wrong.
- **Spec beats fixture beats engine.** Never edit an expectation to make a test pass; never bend code to satisfy a fixture.
- If you amend `docs/conformance-spec.md`, update `tests/conformance/rules.tsv` in the same commit — a sync check enforces it — and add or update a fixture, because a fix without a test is not done.
- Keep a brief **fixed** across rounds when you are measuring a fix. Changing the task and the doc at once makes the result uninterpretable.
- Before committing: `bun test tests/unit`, `bun test tests/conformance`, `bun tests/conformance/check-suite-hygiene.mjs`, and `bun tests/conformance/check-traceability.mjs --static --baseline tests/conformance/phase-gaps/baseline.txt` must all pass.

## What not to do

Do not merge to `main`, create or push tags, or touch `package.json`'s version — an open PR (#44) covers the release and tagging is the owner's call. Do not rewrite the engine to make an authoring sample pass. Do not grow the rules doc past 60 lines "just this once."

## Report

Per round: samples and models, the property under test, the mechanical sweep result, every finding triaged as **documentation / specification / implementation / outlier** with the evidence for that call, the amendments made and why, and the updated results table in `docs/ratification-protocol.md`. Be explicit about which findings were fitted to the round that found them and therefore still untested.
