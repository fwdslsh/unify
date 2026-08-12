/**
 * `unify build` — all-or-nothing publish.
 *
 * Phase 1 stands up the skeleton: settings are resolved, the reporter is
 * wired, and the exit taxonomy is real. The composition core arrives in
 * Phase 2 (docs/migration-plan.md), so the conformance harness is red until
 * then — red for the honest reason that no engine exists, rather than green
 * against a wrong one.
 */

import { NOT_IMPLEMENTED } from "./not-implemented.js";

/**
 * @param {object} context
 * @returns {Promise<number>}
 */
export async function build(context) {
  return NOT_IMPLEMENTED("build", "the composition core", context);
}
