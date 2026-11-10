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
import { auditExitCode, consumeLastAuditRun } from "./core/audit.js";
import { buildReport, serializeJson } from "./core/report.js";
import { apiOptions } from "./cli/options.js";
import { prepare } from "./cli/prepare.js";

/** `run(argv)` is the command line itself. Exported only so that `import { run } from "@fwdslsh/unify"` keeps working; it is not API. */
export { run } from "./cli.js";

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
 * `format`, `save-config` and the options of `dev`, `watch`, `init` and
 * `update` do not exist here. `generate` is a path, never a function.
 *
 * @typedef {object} CommonOptions
 * @property {string} [source] - the directory to build from (default: `site/` if it exists, else `src/`, else `.`)
 * @property {string} [output] - the directory the site is published to (default `dist`)
 * @property {boolean} [clean] - empty the output directory before publishing
 * @property {string[]} [exclude] - globs never emitted, still usable by the build
 * @property {boolean} [prettyUrls] - `about.html` becomes `about/index.html`, links rewritten to match
 * @property {string} [baseUrl] - the site's whole address, e.g. `https://example.com/`
 * @property {string} [canonical] - `"auto"` or `"none"`
 * @property {boolean} [feedFull] - full-content feed entries (needs `baseUrl`)
 * @property {boolean} [dryRun] - run every check, write nothing
 * @property {boolean} [strict] - advisories count as problems for `status`
 * @property {boolean} [catalog] - generate `assets/unify/catalog.json`
 * @property {boolean} [searchCorpus] - generate `assets/unify/search-corpus.json`
 * @property {boolean} [includeNoindex] - list noindex pages in the catalog and corpus
 * @property {string} [generate] - the PATH of one JavaScript file to run before the build
 * @property {boolean} [sourceInventory] - hand the generator `source-pages.json` (default on with `generate`)
 * @property {string} [extends] - a template to build on, as `init` takes one
 * @property {boolean|string} [config] - API-only. Absent or `false`: no `unify.yaml` is read. `true`: discovered as the CLI does. A string: that file.
 */

/**
 * @typedef {CommonOptions & {audit?: boolean, write?: boolean}} BuildOptions
 *   `audit: true` is `build --audit` (publish only if `audit` would exit 0, and
 *   return the report). `write: false` publishes nothing and returns the
 *   composed site as `files`; the output directory is neither created nor touched.
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
 * What a usage error or an unexpected failure looks like when returned.
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
 * @property {Map<string, Uint8Array>} [files] - only with `write: false`: output path -> bytes. Empty when a problem blocked the build
 * @property {AuditReport|null} [report] - only with `audit: true`; `null` if the build stopped before it could be evaluated
 * @property {ApiError} [error] - only with status 2, or status 1 from an unexpected failure rather than a finding
 */

/**
 * @typedef {object} AuditResult
 * @property {0|1|2} status - the CLI's `unify audit` exit code
 * @property {Diagnostic[]} diagnostics - the pipeline's problems and advisories, ordered by path, then line
 * @property {AuditReport|null} report - `null` when the run stopped before it could be evaluated (status 1 or 2)
 * @property {ApiError} [error] - only with status 2, or status 1 from an unexpected failure rather than a finding
 */

/**
 * Build the site: the pipeline `unify build` runs, returning instead of
 * printing.
 *
 * Experimental: this API may change or be removed in any release before v1.
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
 * one piece of module state (`consumeLastAuditRun`'s stash), so two calls
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
 * wrong with them. `config` and `write` are returned apart: they are not flags.
 * @param {"build"|"audit"} command
 * @param {unknown} options
 */
function toFlags(command, options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new UsageError(`${command}() takes an options object, got ${options === null ? "null" : Array.isArray(options) ? "an array" : typeof options}`);
  }
  const known = apiOptions(command);
  const own = command === "build" ? ["config", "write"] : ["config"];
  const flags = {};
  let config = false;
  let write = true;
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (key === "config" && own.includes(key)) {
      if (typeof value !== "boolean" && typeof value !== "string") throw new UsageError(`config must be true, false or a path, got: ${JSON.stringify(value)}`);
      config = value;
      continue;
    }
    if (key === "write" && own.includes(key)) {
      if (typeof value !== "boolean") throw new UsageError(`write must be true or false, got: ${JSON.stringify(value)}`);
      write = value;
      continue;
    }
    const spec = Object.hasOwn(known, key) ? known[key] : undefined;
    if (!spec) {
      throw new UsageError(`unknown option: ${key}`, [`the options of ${command}() are: ${[...Object.keys(known), ...own].filter((k) => command === "build" || !["clean", "dryRun"].includes(k)).sort().join(", ")}`]);
    }
    const expected = { flag: "a boolean", string: "a string", value: "a string", list: "an array of strings" }[spec.kind];
    const ok = spec.kind === "flag" ? typeof value === "boolean"
      : spec.kind === "list" ? Array.isArray(value) && value.every((v) => typeof v === "string")
        : typeof value === "string";
    if (!ok) throw new UsageError(`${key} must be ${expected}, got: ${JSON.stringify(value)}`);
    flags[spec.flag] = value;
  }
  return { flags, config, write };
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
 * @param {unknown} error
 * @param {Diagnostic[]} diagnostics
 */
function failure(error, diagnostics = []) {
  const usage = error instanceof UsageError;
  const message = error instanceof Error ? error.message : String(error);
  return { status: usage ? 2 : 1, diagnostics, error: { message, fixes: usage ? [...error.fixes] : [] } };
}

/**
 * @param {"build"|"audit"} command
 * @param {unknown} options
 */
async function execute(command, options) {
  const reporter = new DiagnosticCollector();
  try {
    const { flags, config, write } = toFlags(command, options);
    const { settings, sourceRoot, sourceDefaulted, output } = prepare({ command, options: flags, config });
    reporter.strict = settings.strict;

    if (command === "audit") {
      const { evaluate } = await import("./cli/commands/audit.js");
      const context = { sourceRoot, output, settings, reporter, sourceDefaulted, command };
      const { buildReporter, findings, documents, base } = await evaluate(context);
      const report = reportOf({
        documents, findings, base,
        problemCount: buildReporter.problemCount, advisoryCount: buildReporter.advisoryCount,
      });
      // §24.6, as `cli/commands/audit.js` reads it: a pipeline problem exits 1
      // whatever the findings; past that, the findings decide.
      const status = buildReporter.exitCode !== 0 ? buildReporter.exitCode : auditExitCode(findings, settings.strict);
      return { status, diagnostics: buildReporter.sorted().map(plain), report };
    }

    const result = {};
    let built = null;
    const context = {
      sourceRoot, output, reporter, sourceDefaulted, command,
      settings: { ...settings, write, onBuilt: (b) => { built = b; } },
    };
    consumeLastAuditRun(); // nothing stale can be mistaken for this run's
    const { build: runBuild } = await import("./cli/commands/build.js");
    const status = await runBuild(context);
    if (settings.auditGate) {
      const run = consumeLastAuditRun();
      result.report = run
        ? reportOf({
          documents: run.documents, findings: run.findings, base: run.base,
          problemCount: reporter.problemCount, advisoryCount: reporter.advisoryCount,
        })
        : null;
    }
    if (write === false) {
      result.files = new Map();
      if (built?.publishable) {
        for (const [path, content] of built.files) {
          result.files.set(path, typeof content === "string" ? Buffer.from(content, "utf8") : content);
        }
      }
    }
    return { status, diagnostics: reporter.sorted().map(plain), ...result };
  } catch (error) {
    // A usage error says nothing about the site; any other failure keeps what
    // the pipeline had already found.
    const result = failure(error, error instanceof UsageError ? [] : reporter.sorted().map(plain));
    return command === "audit" ? { ...result, report: null } : result;
  }
}
