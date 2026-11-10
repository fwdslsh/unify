/**
 * @fwdslsh/unify — the package entry point, and the whole of its public API.
 *
 * EXPERIMENTAL: this API may change or be removed in any release before v1.
 * The command line is the stable surface unify promises not to break; the one
 * firm contract on this side is the audit report's `schemaVersion`. See
 * docs/api.md, and docs/product-spec.md §5 for why this is deliberately NOT a
 * plugin API: a caller supplies inputs and receives results, exactly as the
 * command line does, and nothing hooks into composition.
 *
 * Importing this module starts nothing, prints nothing and reads nothing from
 * disk. `build()` and `audit()` never write to stdout or stderr and never call
 * `process.exit`: a usage error is RETURNED (`status: 2`), a problem is
 * RETURNED (`status: 1`), and the structured diagnostics come back as data.
 *
 * Both functions run the same pipeline the commands run — the CLI is "call
 * the core, render, exit", this file is "call the core, return" — and
 * `tests/conformance/api-equivalence.test.js` (gate G15) holds the two to
 * byte-identical output and the same diagnostics.
 *
 * @module @fwdslsh/unify
 */
import { DiagnosticCollector, UsageError } from "./core/diagnostics.js";
import { auditExitCode } from "./core/audit.js";
import { buildReport, serializeJson } from "./core/report.js";
import { apiOptions } from "./cli/options.js";
import { prepare } from "./cli/prepare.js";

/**
 * Experimental: this API may change or be removed in any release before v1.
 *
 * The options are the camelCase of the long flag names the command takes (so
 * `--pretty-urls` is `prettyUrls`), which are also the keys of `unify.yaml`;
 * a boolean flag takes `true` or `false`, a repeatable flag (`exclude`) an
 * array of strings, the rest a string. Relative paths resolve against
 * `process.cwd()`, as the command line's do. An option that is `undefined` is
 * the same as absent; an unknown one is a usage error (`status: 2`).
 *
 * `unify.yaml` is read exactly as the commands read it, and an option passed
 * here wins over the file, as a flag does -- an explicit `false` included.
 *
 * `format`, `save-config` and the options of `dev`, `watch`,
 * `init` and `update` do not exist here. `generate` is a path, never a function.
 *
 * @typedef {object} CommonOptions
 * @property {string} [source] - the directory to build from (default: `site/` if it exists, else `src/`, else `.`)
 * @property {string} [output] - the directory the site is published to (default `dist`)
 * @property {string[]} [exclude] - globs never emitted, still usable by the build
 * @property {boolean} [prettyUrls] - `about.html` becomes `about/index.html`, links rewritten to match
 * @property {string} [baseUrl] - the site's whole address, e.g. `https://example.com/`
 * @property {string} [canonical] - `"auto"` or `"none"`
 * @property {boolean} [feedFull] - full-content feed entries (needs `baseUrl`)
 * @property {boolean} [strict] - advisories count as problems for `status`
 * @property {boolean} [catalog] - generate `assets/unify/catalog.json`
 * @property {boolean} [searchCorpus] - generate `assets/unify/search-corpus.json`
 * @property {boolean} [includeNoindex] - list noindex pages in the catalog and corpus
 * @property {string} [generate] - the PATH of one JavaScript file to run before the build
 * @property {boolean} [sourceInventory] - hand the generator `source-pages.json` (default on with `generate`)
 * @property {string} [extends] - a template to build on, as `init` takes one
 */

/**
 * @typedef {CommonOptions & {clean?: boolean, dryRun?: boolean}} BuildOptions
 *   `clean: true` empties the output directory before publishing. `dryRun: true`
 *   runs every check, publishes nothing and returns the composed site as
 *   `files`; the output directory is neither created nor touched.
 */

/**
 * @typedef {CommonOptions & {external?: boolean}} AuditOptions
 *   `external: true` fetches every off-origin URL the site emits (the only
 *   network access in unify).
 */

/**
 * One problem or advisory, exactly as the command line prints it, as data.
 * `file` is relative to the working directory.
 * @typedef {object} Diagnostic
 * @property {"problem"|"advisory"} severity
 * @property {string} file
 * @property {number} [line] - 1-based; absent when unknown
 * @property {string} message - prose, not contract
 * @property {string} [context] - the offending source text
 * @property {string[]} [fixes] - one edit per entry
 */

/**
 * What a usage error looks like when returned: what the command line prints
 * for exit 2.
 * @typedef {object} ApiError
 * @property {string} message
 * @property {string[]} fixes
 */

/**
 * The same object `unify audit --format json` serializes.
 * @typedef {ReturnType<typeof buildReport>} AuditReport
 */

/**
 * @typedef {object} BuildResult
 * @property {0|1|2} status - the CLI's exit code: 0 built, 1 problems (or, under `strict`, advisories), 2 usage error
 * @property {Diagnostic[]} diagnostics - ordered by path, then line; empty on status 2
 * @property {Map<string, Uint8Array>} [files] - only for a dry run: output path -> bytes. Empty when a problem blocked the build
 * @property {ApiError} [error] - only with status 2 (a usage error)
 */

/**
 * @typedef {object} AuditResult
 * @property {0|1|2} status - the CLI's `unify audit` exit code
 * @property {Diagnostic[]} diagnostics - the pipeline's problems and advisories, ordered by path, then line
 * @property {AuditReport|null} report - `null` when the run stopped before the site could be evaluated (a failing generator, a usage error)
 * @property {ApiError} [error] - only with status 2 (a usage error)
 */

/**
 * Build the site: the pipeline `unify build` runs, returning instead of
 * printing.
 *
 * Experimental: this API may change or be removed in any release before v1.
 *
 * Resolves with a result for everything the command line would exit 0, 1 or 2
 * for. Anything else (an I/O error, a bug in unify) rejects with the original Error.
 *
 * @param {BuildOptions} [options]
 * @returns {Promise<BuildResult>}
 */
export function build(options = {}) {
  return serialize(() => execute("build", options));
}

/**
 * Evaluate the site the build would publish, writing nothing: `unify audit`,
 * returning the report as an object.
 *
 * Experimental: this API may change or be removed in any release before v1.
 *
 * @param {AuditOptions} [options]
 * @returns {Promise<AuditResult>}
 */
export function audit(options = {}) {
  return serialize(() => execute("audit", options));
}

// ---------------------------------------------------------------- internals

/**
 * Calls run one at a time. The pipeline reads the working directory and keeps
 * one piece of module state (`core/audit.js`'s last-run stash), so two calls
 * overlapping in one process could hand each other's results over; queuing
 * them costs nothing a caller could notice and makes "independent" true.
 */
let queue = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} job
 * @returns {Promise<T>}
 */
function serialize(job) {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}

/**
 * The CLI's long-flag form of the options, or a `UsageError` naming what is
 * wrong with them. 
 * @param {"build"|"audit"} command
 * @param {unknown} options
 */
function toFlags(command, options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new UsageError(`${command}() takes an options object, got ${options === null ? "null" : Array.isArray(options) ? "an array" : typeof options}`);
  }
  const known = apiOptions(command);
  const flags = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    const spec = Object.hasOwn(known, key) ? known[key] : undefined;
    if (!spec) {
      throw new UsageError(`unknown option: ${key}`, [`the options of ${command}() are: ${Object.keys(known).sort().join(", ")}`]);
    }
    const expected = { flag: "a boolean", string: "a string", value: "a string", list: "an array of strings" }[spec.kind];
    const ok = spec.kind === "flag" ? typeof value === "boolean"
      : spec.kind === "list" ? Array.isArray(value) && value.every((v) => typeof v === "string")
        : typeof value === "string";
    if (!ok) throw new UsageError(`${key} must be ${expected}, got: ${JSON.stringify(value)}`);
    flags[spec.flag] = value;
  }
  return flags;
}

/**
 * A diagnostic as plain data: what `Reporter.format` prints, minus the prose
 * layout, and without the dedup key's private `discriminator`.
 * @param {import("./core/diagnostics.js").Diagnostic} d
 * @returns {Diagnostic}
 */
function plain(d) {
  const out = { severity: d.severity, file: d.file };
  if (d.line !== undefined) out.line = d.line;
  out.message = d.message;
  if (d.context) out.context = d.context;
  if (d.fixes?.length) out.fixes = [...d.fixes];
  return out;
}

/**
 * The report as `audit --format json` would print it, parsed back: plain data
 * that shares nothing with the pipeline that produced it, and equal by
 * construction to the CLI's document.
 * @param {Parameters<typeof buildReport>[0]} input
 * @returns {AuditReport}
 */
function reportOf(input) {
  return JSON.parse(serializeJson(buildReport(input)));
}

/**
 * @param {"build"|"audit"} command
 * @param {unknown} options
 */
async function execute(command, options) {
  const reporter = new DiagnosticCollector();
  try {
    const flags = toFlags(command, options);
    const { settings, sourceRoot, sourceDefaulted, output } = prepare({ command, options: flags });
    reporter.strict = settings.strict;

    if (command === "audit") {
      const { evaluate } = await import("./cli/commands/audit.js");
      const context = { sourceRoot, output, settings, reporter, sourceDefaulted, command };
      const { buildReporter, findings, documents, base } = await evaluate(context);
      const diagnostics = buildReporter.sorted().map(plain);
      // The build stopped before the scan: no site, so no report (§24.2).
      if (findings === null) return { status: buildReporter.exitCode, diagnostics, report: null };
      const report = reportOf({
        documents, findings, base,
        problemCount: buildReporter.problemCount, advisoryCount: buildReporter.advisoryCount,
      });
      // §24.6, as `cli/commands/audit.js` reads it: a pipeline problem exits 1
      // whatever the findings; past that, the findings decide.
      const status = buildReporter.exitCode !== 0 ? buildReporter.exitCode : auditExitCode(findings, settings.strict);
      return { status, diagnostics, report };
    }

    let built = null;
    const context = {
      sourceRoot, output, reporter, sourceDefaulted, command,
      settings: { ...settings, onBuilt: (b) => { built = b; } },
    };
    const { build: runBuild } = await import("./cli/commands/build.js");
    const status = await runBuild(context);
    const result = { status, diagnostics: reporter.sorted().map(plain) };
    if (settings.dryRun) {
      result.files = new Map();
      if (built?.publishable) {
        for (const [path, content] of built.files) {
          result.files.set(path, typeof content === "string" ? Buffer.from(content, "utf8") : content);
        }
      }
    }
    return result;
  } catch (error) {
    // Only what the command line would exit 2 for is a result. An I/O error or
    // a bug in unify is not something to hand back as if it were a finding:
    // it rejects, with the original Error and its stack.
    if (!(error instanceof UsageError)) throw error;
    const result = { status: 2, diagnostics: [], error: { message: error.message, fixes: [...error.fixes] } };
    return command === "audit" ? { ...result, report: null } : result;
  }
}
