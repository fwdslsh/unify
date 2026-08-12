/**
 * The Phase 1 placeholder.
 *
 * Every command parses its arguments, resolves its settings, and validates its
 * environment for real — usage faults already exit 2 correctly. What does not
 * exist yet is the work itself. Saying so plainly and exiting non-zero is the
 * point: the conformance suite must stay red until the engine is written, and
 * it must be red because nothing is implemented rather than because something
 * wrong is. Delete each call as its phase lands.
 */

/**
 * @param {string} command
 * @param {string} missing - what has not been built yet
 * @param {object} context
 * @param {import('../../core/diagnostics.js').Reporter} context.reporter
 * @returns {number} exit code 1 — not a usage fault, so not 2
 */
export function NOT_IMPLEMENTED(command, missing, { reporter }) {
  reporter.stderr.write(
    `unify ${command}: ${missing} is not implemented yet — this build is mid-rewrite (docs/migration-plan.md).\n`,
  );
  return 1;
}
