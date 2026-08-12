/**
 * `unify dev` — build + watch + static server + reload.
 *
 * Scope is fixed and permanent (product-spec §4): static files, directory
 * indexes, a 404 page, reload. No proxying, HTTPS, middleware, or config.
 * The reload script is injected only into responses this server sends and
 * never exists in the output directory. Arrives in Phase 4.
 */

import { NOT_IMPLEMENTED } from "./not-implemented.js";

/**
 * @param {object} context
 * @returns {Promise<number>}
 */
export async function dev(context) {
  return NOT_IMPLEMENTED("dev", "the development server", context);
}
