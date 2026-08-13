/**
 * Diagnostics — the single reporting channel for the build.
 *
 * Contract (conformance-spec §14.1): two severities and no third word.
 * Diagnostics go to stderr, the summary and dry-run list to stdout, both
 * ordered by path then line so two runs over the same tree print the same
 * bytes. Every line begins `FILE:LINE: SEVERITY: ` (line omitted when
 * unknown). That prefix is contract; the message after it is prose.
 *
 * DEDUPLICATION lives here, not in the modules that produce the repeats,
 * because the property is general rather than any one module's business:
 * **two diagnostics that would print the same bytes are one diagnostic.**
 * §14.1 attributes a diagnostic to its PROVENANCE file — a reference problem
 * to the fragment or layout the reference was written in (R3), an include
 * problem to the include site — while the pipeline visits that provenance
 * once per HOST. references.js iterates emitted OUTPUT files (§12 checks the
 * tree, not the sources), and includes.js re-inlines a shared fragment once
 * per page (§2 step 2; there is no include cache — full rebuilds only). So
 * one bad `href` in a nav fragment included into twelve pages produced twelve
 * byte-identical stderr lines, and one bad `<include src>` inside it produced
 * twelve more. Neither module can fix that alone: each is behaving correctly
 * within its own pass, and it is only at this channel that the repeats become
 * visible as repeats. `loadLayout` in build.js already reaches for the same
 * property ad hoc, by caching layouts "so any P15 it carries is reported
 * exactly once"; this generalises that from one construct to all of them.
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
 * @property {string} [discriminator] - never printed; see `_record`. A fact
 *   the reporting module knows that the printed form does not carry, and
 *   which makes two byte-identical diagnostics two different faults.
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
    /**
     * The DEDUPLICATED set, in the order the first of each was reported. This
     * is the diagnostic set in every sense §14.1 means: what prints, what is
     * counted, what decides the exit code.
     * @type {Diagnostic[]}
     */
    this.diagnostics = [];
    /** Printed forms already recorded — the dedup key set (see `_record`). */
    this._seen = new Set();
    /** Raw tallies including suppressed repeats — see `problemsReported`. */
    this._reported = { problem: 0, advisory: 0 };
  }

  /**
   * @param {Omit<Diagnostic, 'severity'>} d
   */
  problem(d) {
    this._record({ ...d, severity: "problem" });
  }

  /**
   * @param {Omit<Diagnostic, 'severity'>} d
   */
  advisory(d) {
    this._record({ ...d, severity: "advisory" });
  }

  /**
   * Record one diagnostic unless an identical one is already recorded.
   *
   * The key is the full PRINTED form — location, severity, message, `in:` and
   * `fix:` lines — plus the optional `discriminator`. Two reasons it is not
   * the narrower (file, line, severity, message):
   *
   * - `fix:` lines can carry what the message doesn't. A04's message is
   *   "<slot> is outside a layout's <body>" with no name in it, while its fix
   *   names the slot; two stray slots on ONE source line differ only in their
   *   fixes. Keying on the message alone would silently eat the second one's
   *   advice — dropping something the author needs to see, the failure mode
   *   this repository calls a content-loss bug everywhere else.
   * - `discriminator` covers the reverse: a fact the reporting module knows
   *   that the printed form does not carry. §12 resolves a RELATIVE reference
   *   against the containing OUTPUT file, so one relative URL written once in
   *   a shared fragment can resolve to a different target in each consuming
   *   page — two real faults with byte-identical text, because the message
   *   quotes the source spelling. §11.1 closes that for `href`/`src`/`srcset`/
   *   `poster` (a relative URL whose provenance is not the page itself is
   *   rewritten to a root-relative path off the provenance file, so it
   *   resolves identically everywhere), but it deliberately never reaches
   *   `url()` in `<style>` blocks and `style=` attributes (URL-03) — which
   *   §12 checks anyway ("checking is not rewriting"). A relative `url(bg.png)`
   *   in shared chrome is therefore a live instance, not a hypothetical, and
   *   references.js passes the resolved target as the discriminator for it.
   *
   * Keying on printed-form-plus-discriminator cannot lose information by
   * construction: what it drops is a line the author would otherwise read
   * twice, for a fault the module that raised it says is the same fault.
   *
   * The residue this accepts, named rather than hidden: two identical broken
   * references to the same target on one source line (`<a href="/gone.html">a</a>
   * <a href="/gone.html">b</a>`) collapse to one. §14.1's location contract is
   * `FILE:LINE:` and has no column, so the suppressed line sent the author to
   * the same line to fix the same string. Repeats on DIFFERENT lines of the
   * same file keep their own lines — the key includes the line.
   *
   * First occurrence wins, so `sorted()`'s tie-break on insertion order still
   * describes a stable sequence and two runs over the same tree print the
   * same bytes.
   * @param {Diagnostic} d
   */
  _record(d) {
    this._reported[d.severity]++;
    // `file` is source-root-relative at this point for every module (build.js
    // relocates to cwd once, later, uniformly) — so the key is stable no
    // matter where the process was invoked from.
    const key = `${Reporter.format(d)}\u0000${d.discriminator ?? ""}`;
    if (this._seen.has(key)) return;
    this._seen.add(key);
    this.diagnostics.push(d);
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
   * How many problems were REPORTED, repeats included — never the number the
   * build states to the author (that is `problemCount`, the deduplicated one).
   * It exists for the one question dedup makes `problemCount` unable to
   * answer: "did the step I just ran report a problem of its own?" A caller
   * that brackets a step with `problemCount` deltas — build.js's per-page
   * `hadNewProblem`, which decides whether a page's possibly-malformed
   * remnant may go downstream — reads zero when the page's only problem was
   * byte-identical to one an earlier page already reported (two pages
   * including the same broken fragment is precisely that case), and would let
   * that remnant through. Bracket with this instead: identity across steps is
   * exactly what dedup erases, and this counter is the one that never erases it.
   * @returns {number}
   */
  get problemsReported() {
    return this._reported.problem;
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
