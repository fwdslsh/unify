/**
 * `unify init [template]` — offline scaffolding.
 *
 * Templates compile into the binary. The v0.6 command fetched them from a
 * GitHub repository that did not exist, so step one of the golden path failed
 * with a network error; the replacement must work on a plane. Arrives in
 * Phase 4.
 */

import { NOT_IMPLEMENTED } from "./not-implemented.js";

/**
 * @param {object} context
 * @returns {Promise<number>}
 */
export async function init(context) {
  return NOT_IMPLEMENTED("init", "offline scaffolding", context);
}
