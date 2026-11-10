/**
 * @fwdslsh/unify — the package entry point, and the whole of its public API:
 * the command line, called as a function.
 *
 * EXPERIMENTAL: this API may change or be removed in any release before v1.
 * The command line is the surface unify promises not to break. See docs/api.md,
 * and docs/product-spec.md §4 for why this is deliberately NOT a plugin API.
 *
 * `build(options)` is `unify build <flags>` and `audit(options)` is
 * `unify audit <flags>`, run in the current working directory by the CLI's own
 * code (`main` in src/cli.js) with its two streams captured. Options become
 * argv (`prettyUrls: true` is `--pretty-urls`) and are parsed by the CLI's own
 * parser, so there is no second option list, validation or behaviour here.
 * Nothing is written to the process's stdout or stderr and nothing exits.
 *
 * @module @fwdslsh/unify
 */
import { main } from "./cli.js";

/**
 * @typedef {Record<string, boolean|string|string[]|undefined>} Options
 *   The CLI's long flags in camelCase. `true` is the bare flag, `false` or
 *   `undefined` omits it, a string is its value, an array of strings repeats the
 *   flag. Anything else is a `TypeError`. An unknown or misused flag is the
 *   CLI's own usage error: `status` 2, the message in `stderr`.
 */

/**
 * What `child_process.spawnSync` calls them: the exit code, and exactly the
 * bytes the command wrote to each stream.
 * @typedef {object} Result
 * @property {number} status
 * @property {string} stdout
 * @property {string} stderr
 */

/**
 * `options` -> the flags of an argv.
 * @param {Options} options
 * @returns {string[]}
 */
function toArgv(options) {
  if (options === null || typeof options !== "object" || Object.getPrototypeOf(options) !== Object.prototype) {
    throw new TypeError("options must be a plain object");
  }
  const argv = [];
  for (const [key, value] of Object.entries(options)) {
    const flag = `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    if (value === undefined || value === false) continue;
    if (value === true) argv.push(flag);
    else if (typeof value === "string") argv.push(`${flag}=${value}`);
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) argv.push(...value.map((v) => `${flag}=${v}`));
    else throw new TypeError(`option ${key} must be a boolean, a string or an array of strings, got: ${typeof value}`);
  }
  return argv;
}

/** Calls run one at a time: they share the working directory and `core/audit.js`'s module state. */
let queue = Promise.resolve();

/**
 * @param {"build"|"audit"} command
 * @param {Options} options
 * @returns {Promise<Result>}
 */
async function call(command, options = {}) {
  const argv = [command, ...toArgv(options)]; // a bad option rejects with a TypeError before anything is queued
  const job = queue.then(async () => {
    let stdout = "";
    let stderr = "";
    const io = { stdout: { write: (s) => { stdout += s; } }, stderr: { write: (s) => { stderr += s; } } };
    const status = await main(argv, io);
    return { status, stdout, stderr };
  });
  queue = job.catch(() => {});
  return job;
}

/**
 * `unify build <flags>`. Experimental: this API may change or be removed in any release before v1.
 * @param {Options} [options]
 * @returns {Promise<Result>}
 */
export const build = (options) => call("build", options);

/**
 * `unify audit <flags>`. Experimental: this API may change or be removed in any release before v1.
 * @param {Options} [options]
 * @returns {Promise<Result>}
 */
export const audit = (options) => call("audit", options);
