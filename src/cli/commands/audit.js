/**
 * `unify audit` — conformance-spec §24, evaluation.
 *
 * The command is deliberately thin, and the thinness is the design. `build`
 * decides whether a site can be published; `audit` decides nothing. It runs
 * **the same pipeline** — the same one, not a parallel one — and then reads the
 * §20 manifest that pipeline produced.
 *
 * That is why this file delegates instead of orchestrating. Product-spec §6.2
 * requires one final-output interpretation shared by every downstream feature,
 * so an evaluator with its own scan, its own composition, or its own URL
 * resolution would be the exact defect that constraint exists to forbid — and
 * it would be an invisible one, agreeing with the build on every simple site
 * and diverging on the first interesting one.
 *
 * What the flags below do:
 * `audit: true` selects the §24 branch, which sits at the end of the pipeline
 * and RETURNS. That early return is the whole read-only mechanism: both
 * readers of `settings.dryRun` — the publish call and §17's report, whose
 * delete plan is the one pipeline step that reads the output directory — are
 * below it and never run. Audit is therefore not a dry run wearing a different
 * name; §17's report is not its report, and it consults `dist/` for nothing.
 *
 * Nothing here sets `dryRun`, deliberately. An earlier draft passed
 * `dryRun: false` for emphasis; mutation testing showed the line could be
 * flipped with no test noticing, because it cannot reach a reader either way.
 * What actually holds the guarantee is §24's tests asserting that `dist/` is
 * never created and that an existing one is neither read nor written — and
 * those hold it wherever the branch sits.
 */

/**
 * @param {object} context - the run context cli.js assembles
 * @returns {Promise<number>} the §24.6 exit code
 */
export async function audit(context) {
  const { build } = await import("./build.js");
  return build({ ...context, settings: { ...context.settings, audit: true } });
}
