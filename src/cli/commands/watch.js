/**
 * `unify watch` — the watch contract without a server.
 *
 * Saves coalesce into one full rebuild and a save landing mid-rebuild queues
 * exactly one follow-up; writes are atomic and minimal so external tools can
 * consume the output directory safely. Arrives in Phase 4.
 */

import { NOT_IMPLEMENTED } from "./not-implemented.js";

/**
 * @param {object} context
 * @returns {Promise<number>}
 */
export async function watch(context) {
  return NOT_IMPLEMENTED("watch", "the watch contract", context);
}
