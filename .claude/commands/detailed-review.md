# Detailed Implementation Review

Produce an evidence-based status report of the unify implementation against the v0.7.0 specification set, in `_notes/detailed-review.md`.

## The authorities

- `docs/product-spec.md` — the product contract: what unify is (§1), the composition model (§3), the complete CLI (§4), the non-goals (§5), and what v0.7.0 requires (§7).
- `docs/conformance-spec.md` — the normative implementer reference: exact algorithms, the splice model, the head-merge table, the collision matrix, the closed problem/advisory catalogues, and the worked examples that are the fixtures.
- `docs/cli-reference.md` — every command, option, and exit code. There are no others.
- `docs/testing-strategy.md` — what "implemented" means as a machine-checkable claim (§3 traceability, §6 the release gates).
- `docs/authoring-rules.md` — the complete authoring surface in under sixty lines.

`CLAUDE.md` carries the framing: **the implementation in `src/` and the suite in `tests/` predate the spec and are being rewritten against it.** Finding v0.6 machinery is the expected result, not a discovery — its disposition is already decided in CLAUDE.md ("Implementation Map") and `docs/migration-plan.md`. Report status against the spec; do not re-litigate what was cut.

## Method

The compliance question is already partly mechanized. Start there, then do by hand only what the machine cannot do.

1. **Read the gap list.**

   ```bash
   bun tests/conformance/check-traceability.mjs --static
   ```

   `tests/conformance/rules.tsv` is the rule inventory (one row per normative claim, IDs namespaced by area). The checker's output is the authoritative gap list at any moment. Record the counts and the open IDs verbatim — do not re-derive them by reading test names.

2. **Run the suite and the hygiene gate.**

   ```bash
   bun test
   bun tests/conformance/check-suite-hygiene.mjs
   ```

3. **Walk the spec by area**, using the inventory prefixes as the section list (includes, layout resolution, the merge, head, root attributes, Markdown, URLs, the reference check, collisions, diagnostics, publish, watch/dev, dry-run, config, scaffold). For each area:
   - Name the rules and the fixture or targeted test that pins each.
   - Locate the implementing code (`file.js:line`), or record that it does not exist yet.
   - State the status from evidence only.

4. **Check the CLI surface as a closed set.** Every command and flag in `docs/cli-reference.md` exists; nothing outside it exists. A surviving retired flag (`--minify`, `--fail-on`, `--host`, `--log-level`, `--copy`/`--ignore`/`--render`, the `serve` command) is a finding, not a feature.

5. **Check the golden path end to end**, as a user would:

   ```bash
   bun src/cli.js init && bun src/cli.js build --dry-run --strict; echo "exit=$?"
   ```

   Product-spec §2 and §8 require this to work in one sitting; testing-strategy §6 G5 requires exit `0` for all five templates.

## Status values

Assign from evidence, per rule or per area:

- `NOT_IMPLEMENTED` — no code implements it.
- `IN_PROGRESS` — partial code, or a fixture that fails.
- `IMPLEMENTED` — code exists and its rules are recorded green by tests that ran against the real CLI.
- `CONFORMANT` — as above, and the area's worked examples reproduce exactly under the §2 comparator, with exhaustive diagnostics.
- `NEEDS_INVESTIGATION` — unclear. Use it rather than guessing.

Two things that are **not** evidence: a coverage percentage (it measures execution, not verification — testing-strategy §1 M4 and §4), and a passing unit test (Tier 3 carries no conformance authority — §2).

## Report shape

```markdown
# Detailed Implementation Review

**Date**: …
**Suite**: [X pass, Y fail] · **Traceability**: [N/184 gated rules] · **Hygiene**: [pass/fail]

## Executive summary

## <Area> — <STATUS>
- Rules: <IDs from rules.tsv>, pinned by <fixture/test paths>
- Code: `src/…:line` (or: absent)
- Evidence: <exact command output>
- Findings: <gap, with the spec sentence it violates>

## Retired vocabulary still present
<file:line for each surviving v0.6 construct>

## Spec defects found
<contradictions between documents, or rules that cannot be implemented as written — these are defects to raise, never a license to reinterpret>

## Priority actions
```

## Rules

- **Never guess.** If unsure, mark `NEEDS_INVESTIGATION` and say what would settle it.
- **Cite everything**: file paths with line numbers, rule IDs, exact command output.
- **A document contradiction is a finding.** The specs are written to agree; a divergence is a defect to report, not to resolve by preference.
- This command reviews and reports. It does not change `src/`, `tests/`, or `docs/`.
