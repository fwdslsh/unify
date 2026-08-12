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

## Isolation: run each agent as a subprocess under /tmp

Rounds 1–2 used in-session subagents, which inherit the session's project context — `CLAUDE.md` loads regardless of any instruction to read only the supplied files. It names `data-unify` and `unify-*` in order to say they are retired, and one Sonnet run misread that as a description of the live product before correctly deferring to the rules it was given. Zero of those eleven samples emitted retired vocabulary, so nothing was corrupted, but the exposure was real and could not be closed by instruction.

From round 3 the loop runs each agent as its own process with cwd inside its sandbox, which puts the repo out of reach entirely:

```bash
cd /tmp/unify-ratify/<round>/<agent>
printf '%s' "$PROMPT" | claude -p --model haiku \
  --permission-mode acceptEdits --allowedTools Read Write Edit Glob Grep
```

Verified rather than assumed: a run so configured answers "NO" when asked whether it has any project context describing a static site generator called unify. Copy the task, the rules, and the report format *into* each sandbox so no path outside cwd is ever referenced.

Two traps worth keeping written down. `--allowedTools` is variadic and will swallow a positional prompt as another tool name — pass the prompt on stdin. And restrict tools to file access: in print mode a permission prompt has nobody to answer it and the run hangs to its timeout.

**Grep the site output, not the sandbox.** The sandbox contains `rules.md`, which quotes `{{ }}` as an example of what not to write, so a naive violation sweep reports templating syntax in every clean sample. Exclude the harness files.

## Results so far

| Round | Samples | Layout title correct | Other violations |
|---|---|---|---|
| 1 | 4 Haiku, 2 Sonnet | 3/6 — **1/4 Haiku** | none mechanical; four doc ambiguities reported |
| 2 | 5 Haiku, 1 Sonnet | **5/5 Haiku** | one hand-written `/about/`; four `charset` "violations" that were the doc's error |
| 3 | 5 Haiku, 1 Sonnet | **6/6, both layouts** | **zero** |
| 4a | 5 Haiku, 1 Sonnet — rounds 1–2 brief, re-run isolated | **6/6** | **zero** |
| 4b | 5 Haiku, 1 Sonnet — round 3 brief, repeated | **6/6** | one broken section link |

Round 4 ran both briefs under identical subprocess isolation. **4a re-ran the rounds 1–2 brief and came back clean at 6/6**, which retires the asterisk on those rounds: the fixes hold, and the `CLAUDE.md` exposure was immaterial to the outcome as well as to the output.

**4b produced the first defect found against unpatched text** — every earlier amendment was written in response to the round that found it, so this is the first time the current wording was tested rather than fitted. One sample linked `/guides/` from the nav with no `guides/index.html` in the tree: a broken reference, and precisely the pattern the link rule forbids. The rule's example is about a *page* (`/about.html` versus `/about/`) and said nothing about linking a *section*, so the universal web convention won. A round-3 sample had reached for the same construct and made it work by writing the index; §12 of the conformance spec resolves directory URLs to `index.html`, so both instincts are legitimate and only one of them was complete. The rule now states the condition.

Round 3 used the harder brief — two layouts sharing chrome, a nested section, an embedded page with no chrome, and a footer overridden on one page — under full subprocess isolation. Every sample was clean, and the four primitives that eleven earlier samples never touched were all exercised: `guides/_layout.html` discovered by proximity (6/6), `data-layout="none"` on the embed page (6/6), a named slot with fallback overridden on contact (6/6), and `<include>` for shared chrome (5/6).

The sixth is the interesting one. h1 wrote two layouts and no fragment, duplicating the header verbatim in both files — output-correct, and a maintenance hazard the include primitive exists to prevent. It is not a spec violation and not counted as one; but it is the only remaining case where the doc describes a tool the author does not reach for, and it is worth watching in later rounds rather than fixing by exhortation.

Round 1 fixed: the title instruction (written from the page's perspective, so the layout author was never told what to do), a `<head>`/charset pronoun with the wrong antecedent, the `<main>` unwrap stated as a state rather than an operation, an include-placement list that omitted layouts, and four gaps only Sonnet articulated.

Round 2 fixed: the charset over-prohibition, "link the real file" being read as the canonical built path, and the title join's leading space.

## Still to validate

- A task shape that **requires a real fragment** — the current brief never forces `<include>`, so the primitive is unexercised.
- **Nested directories**, which would exercise layout discovery by proximity rather than a single root layout.
- A **`data-layout="none"`** page and a **named slot with fallback**, neither of which the current brief compels.
