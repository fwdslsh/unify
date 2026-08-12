/**
 * Diagnostics — the single reporting channel for the build.
 *
 * Contract (conformance-spec §14.1): two severities and no third word.
 * Diagnostics go to stderr, the summary and dry-run list to stdout, both
 * ordered by path then line so two runs over the same tree print the same
 * bytes. Every line begins `FILE:LINE: SEVERITY: ` (line omitted when
 * unknown). That prefix is contract; the message after it is prose.
 */

/** @typedef {'problem'|'advisory'} Severity */

/**
 * @typedef {object} Diagnostic
 * @property {Severity} severity
 * @property {string} file - source-root-relative path
 * @property {number} [line] - 1-based; omitted when unknown
 * @property {string} message - prose, not contract
 * @property {string} [context] - the offending source text, printed as `in:`
 * @property {string[]} [fixes] - one edit per line, printed as `fix:`
 */

/** Messages about a path always end with this; a case mismatch builds on macOS and 404s on Linux. */
export const CHECK_SPELLING = "check the path spelling and casing";

export class Reporter {
  /**
   * @param {object} [options]
   * @param {boolean} [options.strict] - advisories affect the exit code
   * @param {NodeJS.WritableStream} [options.stderr]
   * @param {NodeJS.WritableStream} [options.stdout]
   */
  constructor({ strict = false, stderr = process.stderr, stdout = process.stdout } = {}) {
    this.strict = strict;
    this.stderr = stderr;
    this.stdout = stdout;
    /** @type {Diagnostic[]} */
    this.diagnostics = [];
  }

  /**
   * @param {Omit<Diagnostic, 'severity'>} d
   */
  problem(d) {
    this.diagnostics.push({ ...d, severity: "problem" });
  }

  /**
   * @param {Omit<Diagnostic, 'severity'>} d
   */
  advisory(d) {
    this.diagnostics.push({ ...d, severity: "advisory" });
  }

  /** @returns {number} */
  get problemCount() {
    return this.diagnostics.filter((d) => d.severity === "problem").length;
  }

  /** @returns {number} */
  get advisoryCount() {
    return this.diagnostics.filter((d) => d.severity === "advisory").length;
  }

  /**
   * Whether the build may publish. Advisories never change what is published,
   * even under --strict — they only change the exit code.
   * @returns {boolean}
   */
  get canPublish() {
    return this.problemCount === 0;
  }

  /**
   * @returns {0|1} exit contribution; 2 is reserved for usage/environment faults
   */
  get exitCode() {
    if (this.problemCount > 0) return 1;
    if (this.strict && this.advisoryCount > 0) return 1;
    return 0;
  }

  /**
   * Deterministic order: path, then line, then insertion order. Two runs over
   * the same tree must print identical bytes.
   * @returns {Diagnostic[]}
   */
  sorted() {
    return this.diagnostics
      .map((d, index) => ({ d, index }))
      .sort((a, b) => {
        if (a.d.file !== b.d.file) return a.d.file < b.d.file ? -1 : 1;
        const lineA = a.d.line ?? 0;
        const lineB = b.d.line ?? 0;
        if (lineA !== lineB) return lineA - lineB;
        return a.index - b.index;
      })
      .map(({ d }) => d);
  }

  /**
   * @param {Diagnostic} d
   * @returns {string}
   */
  static format(d) {
    const where = d.line === undefined ? d.file : `${d.file}:${d.line}`;
    const lines = [`${where}: ${d.severity}: ${d.message}`];
    if (d.context) lines.push(`  in: ${d.context}`);
    for (const fix of d.fixes ?? []) lines.push(`  fix: ${fix}`);
    return lines.join("\n");
  }

  /** Write every diagnostic to stderr in contract order. */
  flush() {
    for (const d of this.sorted()) this.stderr.write(`${Reporter.format(d)}\n`);
  }

  /**
   * @param {string} text
   */
  summary(text) {
    this.stdout.write(`${text}\n`);
  }
}

/**
 * A cycle or depth chain, printed the way §14.1 fixes it: full chain, ` → `
 * separated, located at the outermost site where expansion entered.
 * @param {string[]} chain
 * @returns {string}
 */
export function formatChain(chain) {
  return chain.join(" → ");
}

/**
 * Usage and environment faults exit 2 and are not diagnostics — they are not
 * about the author's site, so they carry no file location.
 */
export class UsageError extends Error {
  /**
   * @param {string} message
   * @param {string[]} [fixes]
   */
  constructor(message, fixes = []) {
    super(message);
    this.name = "UsageError";
    this.exitCode = 2;
    this.fixes = fixes;
  }
}
