# Ratification protocol — validating the authoring rules empirically

`docs/authoring-rules.md` claims to be the complete authoring surface in 60 lines. This procedure tests that claim instead of asserting it: give a model nothing but those 60 lines and a plain-English brief, and see whether it authors a spec-compliant site.

**The bar.** The rules and the spec are *ratified* when Haiku — the weakest model in the loop — consistently (4 of 5 or better) produces a compliant multipage site from the rules alone. Sonnet runs alongside as a control: when Sonnet succeeds where Haiku fails, the gap is a documentation defect that reasoning can paper over, not a capability floor.

## Procedure

1. Regenerate the rules block from the current doc, so every sample is provably given byte-identical input:
   ```bash
   { echo '```markdown'; cat docs/authoring-rules.md; echo '```'; } > <scratch>/rules-block.txt
   ```
2. Dispatch five Haiku and one Sonnet, each with its own empty working directory, each instructed to read exactly three files: the task, the rules block, and the report format. Nothing else.
3. Judge the output against `docs/conformance-spec.md` — mechanically where possible (retired vocabulary, templating syntax, frontmatter in `.html`, hand-written pretty URLs, title shape), by reading where not.
4. Amend, re-splice the README (gate G10), re-run the round.

**Ask every agent what the rules did not answer and what it had to re-read.** That self-report has been more diagnostic than the files themselves in every round so far — it points at the ambiguous sentence, where the output only shows the symptom.

## The two amendment rules

1. **Only amend for failures the documentation caused.** A valid-but-different choice is not a violation. Several samples used no `<include>` at all, correctly, because a single-layout site never reuses a fragment; that is a task-design gap, not a doc defect.
2. **Every addition must displace something.** The doc is capped at 60 lines with README byte-identity enforced by G10. If a fix needs five lines, the underlying *rule* is too complicated and the repair probably belongs in the spec.

A corollary earned in round 2: when several independent samples make the same "mistake," check the spec before fixing the agents. Four of five wrote `<meta charset>` into pages against a rule forbidding it — and the rule was wrong, contradicting both the conformance spec and the sentence above it.

## Known limitation: isolation is not total

Subagents inherit the session's project context, so `CLAUDE.md` is auto-loaded regardless of the instruction to read only the three files. It names `data-unify` and `unify-*` in order to say they are retired, and one Sonnet run misread that as a description of the live product before correctly deferring to the supplied rules.

Contamination has been measured, not assumed: **zero of eleven samples across rounds 1–2 emitted any retired vocabulary, templating syntax, or `data-slot`.** The exposure points at constructs whose appearance would be immediately visible, so the check is meaningful. Treat any future sample using v0.6 vocabulary as a contaminated run rather than a documentation failure, and re-run it.

## Results so far

| Round | Samples | Layout title correct | Other violations |
|---|---|---|---|
| 1 | 4 Haiku, 2 Sonnet | 3/6 — **1/4 Haiku** | none mechanical; four doc ambiguities reported |
| 2 | 5 Haiku, 1 Sonnet | **5/5 Haiku** | one hand-written `/about/`; four `charset` "violations" that were the doc's error |

Round 1 fixed: the title instruction (written from the page's perspective, so the layout author was never told what to do), a `<head>`/charset pronoun with the wrong antecedent, the `<main>` unwrap stated as a state rather than an operation, an include-placement list that omitted layouts, and four gaps only Sonnet articulated.

Round 2 fixed: the charset over-prohibition, "link the real file" being read as the canonical built path, and the title join's leading space.

## Still to validate

- A task shape that **requires a real fragment** — the current brief never forces `<include>`, so the primitive is unexercised.
- **Nested directories**, which would exercise layout discovery by proximity rather than a single root layout.
- A **`data-layout="none"`** page and a **named slot with fallback**, neither of which the current brief compels.
