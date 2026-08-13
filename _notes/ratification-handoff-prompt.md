# Handoff prompt — run the ratification loop

Paste the block below to hand this work to a fresh agent. It is self-contained apart from
the repo itself.

---

You are continuing an empirical documentation-validation loop on `unify`, a static site
generator. Work on the branch you were given; do not merge to `main` or create tags.

## The goal

`docs/authoring-rules.md` claims to be the complete authoring surface in 60 lines —
learnable in one sitting, or pasteable into a prompt. Your job is to keep proving or
disproving that empirically, and to dial the rules in until they are the easiest way for
both an AI agent and a human to author a site correctly.

The method is micro-experiments: give a weak model **nothing but those 60 lines and a
plain-English brief**, in a sandbox it cannot escape, and see whether it authors a
compliant site. Several samples per round. Look for patterns. Change one or two things.
Run again.

**Read `docs/ratification-protocol.md` in full before doing anything.** It is the
procedure, and its triage section — deciding whether a failure is the documentation, the
specification, the implementation, or noise — is the part that matters most. Do not
improvise around it.

## Where things stand

Eighteen rounds are logged in the protocol's results table; rounds 7–18 are written up in
`_notes/ratification-rounds-7-21.md`, with two pre-registrations beside it. The engine is
complete and all five gates are green (unit, conformance+e2e, suite hygiene, static
traceability, and the runtime release signal).

**The single most important thing to know: the instrument changed at round 7.** Rounds 1–6
were judged by reading sample files and recorded two 6/6 sweeps. The first brief judged by
running `unify build --dry-run --strict` came back **1 of 5** on a doc those rounds had
passed. Nothing regressed — the measurement improved. Read every pre-round-7 result as *no
violation a human reviewer noticed*, and re-run any older brief you intend to rely on.

Since then the loop has produced, and shipped:

- **Four documentation defects**, all the same shape — the doc showed one literal and
  readers copied it into the wrong file. The named-slot fill (4/5 wrong → 5/5 right), an
  unquoted colon in a YAML title (2/5 → 0), `--base-url` not named beside `--pretty-urls`
  (one sample invented a GitHub Pages behaviour to cover the gap), and "run first" not
  saying who runs it.
- **Five misleading diagnostics**, found by the round-8/18 experiment that hands an agent a
  *broken* site with the CLI as its only documentation. Seven of seven repaired it in round
  8, six of six in round 18, several with no docs at all — but one deleted a page's content
  following a `fix:` line that said "remove one of the sources", and one silently stripped a
  section's chrome following a `fix:` line that shipped a hardcoded layout path. Round 18's
  accidental control is the sharpest result in the log: **0 of 6 samples reached a clean
  build with the CLI withheld**, and every one of them reported confidently. For repair, the
  diagnostics are not a supplement to the 60 lines — they are the documentation.
- **Two implementation defects** found by reading while probing: a diagnostic quoting a URL
  absent from the author's file, and og: values under a base URL never reference-checked at
  all.
- **One spec-level change.** Round 13: five of five Haiku shipped `og:image` URLs no share
  crawler can fetch, with a green build, every report claiming it verified. `--base-url`
  now takes only the site's whole address; the bare-path form is a usage error. An advisory
  (A15) was tried first and retired the same day — **prefer deleting the choice over
  warning about it** whenever a diagnostic is compensating for a design the tool did not
  have to offer.

## What to do next

1. **Keep testing the scaffold.** Round 16 was the first round to start from `unify init`,
   and it found that the templates teach better than the prose does — 5/5 on the two
   constructs the 60 lines have historically failed at — while also teaching one thing
   wrong, which four of four inherited. The scaffold is now a documentation surface under
   test like any other, and the constructs it does NOT demonstrate (a section layout, an
   explicit `data-layout=`, a bare `<slot></slot>`, `<include>` outside a layout, a `title:`
   key) are exactly where samples diverged. Extend it, or test the gaps.
2. **Settle where `serving from …` belongs.** `--dry-run` now names the address the build
   assumed, because a site built for a subpath with no `--base-url` passes every check and
   404s once deployed (round 11). Round 17 ran the A/B — the line in `--dry-run` only, versus
   also printed by a real build — and returned a **null result on placement**: 16 of 16
   samples published correctly, and the one sample that did ship a broken site had already
   read the line, quoted it, drawn the right conclusion, and then run a different command
   anyway. Leave the line where it is. What is still open is whether that failure deserves
   something with teeth (a diagnostic) rather than a summary line — see round 17's notes.
3. **Fix the compose-stage line numbers.** Round 18 verified that a stray bare `<slot>` on
   line 7 of a 9-line layout is reported at line 13 — compose reports positions in the
   include-inlined text, so any fragment inlined above a fault shifts every diagnostic below
   it, often past the end of the file. §14.1 makes `FILE:LINE` stable contract. The
   machinery exists (`spansToLocator` already maps offsets back to provenance); it touches
   every diagnostic site in `compose.js` and wants its own change.
4. **The human half is still untested.** Every round has measured models. A person who
   knows HTML but not this tool fails differently — they stop and re-read where a model
   guesses and moves on.

## Constraints, which are not negotiable

- **`docs/authoring-rules.md` is capped at 60 lines**, and CI enforces byte-identity with
  the copy embedded in `README.md`. Every addition must displace something. After editing,
  re-splice the README by locating the `<!-- BEGIN docs/authoring-rules.md -->` /
  `<!-- END ... -->` markers dynamically (never hardcode line numbers) and verify with `cmp`.
- **Only amend for failures the documentation caused.** A valid-but-different choice is not
  a violation. Do not amend for outliers; record them and watch for recurrence.
- **When several independent samples make the identical mistake, check what the spec says
  before touching the doc.** Three times in fifteen rounds, the agents were right.
- **Spec beats fixture beats engine.** Never edit an expectation to make a test pass; never
  bend code to satisfy a fixture.
- If you amend `docs/conformance-spec.md`, update `tests/conformance/rules.tsv` in the same
  commit — a sync check enforces it — and add or update a fixture.
- The advisory catalogue is capped at twelve and currently holds ten. At the cap, adding
  one means removing one.
- Keep a brief **fixed** across rounds when measuring a fix. Changing the task and the doc
  at once makes the result uninterpretable.
- Before committing, all five gates: `bun test tests/unit`, `bun test tests/conformance
  tests/e2e`, `bun tests/conformance/check-suite-hygiene.mjs`,
  `bun tests/conformance/check-traceability.mjs --static --baseline
  tests/conformance/phase-gaps/baseline.txt`, and the runtime signal
  (`rm -f .conformance-ledger.jsonl && bun test tests/conformance tests/e2e && bun
  tests/conformance/check-traceability.mjs --runtime .conformance-ledger.jsonl`).

## Running the sandboxes

The protocol's Setup section is authoritative; four traps are recorded there and each cost
real time. In short: one `claude -p` process per sample with cwd inside the sandbox, prompt
on **stdin** (`--allowedTools` is variadic and will eat it), tools restricted to file
access plus `Bash` when the brief needs the CLI, a compiled `unify` binary copied **into**
each sandbox, launches staggered ~20s apart, and every sandbox emptied before re-seeding.
Check every sample's exit code before analysing anything — a sample that never started
looks exactly like one that did nothing.

Judge each sample by running the build **in place, with the sample's own recorded command**.
Redirecting `-o` at a sample that authored in its working directory turns its existing
`dist/` into source material and manufactures failures; that cost two false verdicts.

## Report

Per round: samples and models, the property under test, the mechanical sweep result, every
finding triaged as **documentation / specification / implementation / outlier** with the
evidence for that call, the amendments made and why, and the updated results table in
`docs/ratification-protocol.md`. Be explicit about which findings were fitted to the round
that found them and are therefore still untested.
