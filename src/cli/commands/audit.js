/**
 * `unify audit` — conformance-spec §24, evaluation; §31, machine-readable and
 * networked evaluation.
 *
 * The command is deliberately thin, and the thinness is the design. `build`
 * decides whether a site can be published; `audit` decides nothing. It runs
 * **the same pipeline** — the same one, not a parallel one — and then reads the
 * §20 manifest that pipeline produced.
 *
 * That is why this file delegates instead of orchestrating. Product-spec §6.2
 * requires one final-output interpretation shared by every downstream feature,
 * so an evaluator with its own scan, its own composition, or its own URL
 * resolution would be the exact defect that constraint exists to forbid — and
 * it would be an invisible one, agreeing with the build on every simple site
 * and diverging on the first interesting one.
 *
 * What the flags below do:
 * `audit: true` selects the §24 branch in `build.js`, which sits at the end of
 * the pipeline and RETURNS. That early return is the whole read-only mechanism:
 * both readers of `settings.dryRun` — the publish call and §17's report, whose
 * delete plan is the one pipeline step that reads the output directory — are
 * below it and never run. Audit is therefore not a dry run wearing a different
 * name; §17's report is not its report, and it consults `dist/` for nothing.
 *
 * Nothing here sets `dryRun`, deliberately. An earlier draft passed
 * `dryRun: false` for emphasis; mutation testing showed the line could be
 * flipped with no test noticing, because it cannot reach a reader either way.
 * What actually holds the guarantee is §24's tests asserting that `dist/` is
 * never created and that an existing one is neither read nor written — and
 * those hold it wherever the branch sits.
 *
 * §31 ADDS a second reader of `build.js`'s audit branch, and does it without
 * editing that file (out of scope for this section — see build.js's own
 * header: "this file wires those four together; it does not implement any of
 * their rules itself", and §31 is not a rule of the composition pipeline).
 * `build.js`'s branch prints exactly one thing to stdout when `settings.audit`
 * is true — the human-format finding report, via `reporter.summary()` — and
 * then returns a bare exit code. That is enough for the default human format,
 * unchanged from before this section existed, but not enough for
 * `--format json`/`sarif`: those need the STRUCTURED result (the §20 records,
 * for `pages`; the findings, for re-serializing), which never crosses that
 * return boundary as anything but a flattened prose string.
 *
 * Two seams close that gap, both documented at their own definitions:
 *   - `core/audit.js`'s `consumeLastAuditRun()` — `auditManifest` stashes its
 *     own `{records, base, findings}` as it returns, and this command reads
 *     it back immediately after its one `build()` call resolves.
 *   - A capturing `Reporter` (see `runBuildForAudit` below) — real `Reporter`
 *     class, real stderr (so §14 diagnostics print exactly as they always
 *     have), but a `stdout` that records each `.summary()` call instead of
 *     writing it, so this command can replay everything build.js printed
 *     BEFORE the findings report (§24.2's rare "building from the working
 *     directory" notice) and substitute its OWN report, in whichever
 *     `--format` was asked for, for the one line build.js always prints last.
 */
import { Reporter, UsageError } from "../../core/diagnostics.js";
import {
  consumeLastAuditRun, externalUnreachableFindings, formatFindings, sortFindings,
} from "../../core/audit.js";
import { collectExternalReferences, probeUrls } from "../../core/external.js";
import { buildReport, serializeJson, serializeSarif } from "../../core/report.js";

const FORMATS = ["human", "json", "sarif"];

/**
 * Run `build()` with `settings.audit = true` against a Reporter that never
 * writes to the real stdout, and return both the reporter (for `exitCode`/
 * diagnostics — real stderr, unaffected) and every line build.js's audit
 * branch would have printed, in order.
 *
 * Building a fresh `Reporter` rather than reusing `context.reporter` is what
 * makes this safe: `context.reporter` is otherwise untouched by this
 * function, so this command's own two output writes below — the replayed
 * pre-report lines, then the §31-aware report — are the only things that
 * ever reach the real stream, in the order this command chooses rather than
 * the order build.js's internal calls happen to make them.
 * @param {object} context
 * @returns {Promise<{reporter: Reporter, captured: string[]}>}
 */
async function runBuildForAudit(context) {
  const { build } = await import("./build.js");
  const captured = [];
  const reporter = new Reporter({
    strict: context.settings.strict === true,
    stderr: context.reporter.stderr,
    stdout: { write: (s) => captured.push(s) },
  });
  await build({ ...context, settings: { ...context.settings, audit: true }, reporter });
  return { reporter, captured };
}

/**
 * @param {object} context - the run context cli.js assembles
 * @returns {Promise<number>} the §24.6 exit code
 */
export async function audit(context) {
  const format = context.settings.format ?? "human";
  if (!FORMATS.includes(format)) {
    throw new UsageError(`--format accepts human, json, or sarif — got ${JSON.stringify(format)}`, [
      `write it as one of: ${FORMATS.join(", ")}`,
    ]);
  }

  const { reporter: buildReporter, captured } = await runBuildForAudit(context);

  // Guaranteed non-null: `settings.audit = true` above makes `build.js` call
  // `auditManifest` unconditionally before its only two returns (see
  // `lastAuditRun`'s own comment in core/audit.js) — this project has no
  // internal-error class that returns without throwing. Reading `run.findings`
  // on a genuine `null` throws immediately rather than silently printing an
  // empty report, which is the louder and more honest failure.
  const run = consumeLastAuditRun();
  let findings = run.findings;
  const { records, base, htmlFiles } = run;

  // ---- §31.3 — the network check ---------------------------------------
  if (context.settings.external) {
    const owners = collectExternalReferences(records, htmlFiles, base);
    if (owners.size > 0) {
      // Every failure is a finding, including all of them (§31.3). There is
      // no "the network is down" branch here on purpose: see probeUrls for
      // why the heuristic that used to live here could not be made honest.
      const results = await probeUrls([...owners.keys()]);
      findings = sortFindings([...findings, ...externalUnreachableFindings(results, owners)]);
    }
  }

  // ---- the report ---------------------------------------------------------
  if (format === "human") {
    // Replay everything build.js printed before its own (now-superseded)
    // findings report — the sourceDefaulted notice, when there is one — so
    // this command's default output is unchanged from before §31 existed.
    // `captured` always has at least one entry (build.js's audit branch
    // prints the findings report unconditionally); dropping the last one
    // drops exactly that report, which this command reconstructs itself from
    // `findings` — the SAME array when `--external` found nothing to add, so
    // the bytes match what build.js would have printed on its own.
    for (const line of captured.slice(0, -1)) context.reporter.stdout.write(line);
    // The same count `--format json`/`sarif` already carries below. Without
    // it a run that hit a §14 problem printed the problem, said "audit:
    // nothing to report", and exited 1 — the summary contradicting the two
    // lines around it.
    context.reporter.summary(formatFindings(findings, buildReporter.problemCount));
  } else {
    const report = buildReport({
      records, findings, base,
      problemCount: buildReporter.problemCount,
      advisoryCount: buildReporter.advisoryCount,
    });
    // Machine-readable output must BE the document, start to finish: no prose
    // line before it (nothing from `captured` is replayed here) or after.
    context.reporter.summary(
      (format === "json" ? serializeJson : serializeSarif)(report).replace(/\n$/, ""),
    );
  }

  // §24.6 — a pipeline problem exits 1 regardless of findings, format, or
  // --strict: evaluating output that cannot be built is meaningless. This
  // reads `buildReporter` (the capturing instance §14 diagnostics were
  // actually recorded on) rather than trusting `build()`'s own returned
  // number, because that number cannot know about `--external`'s findings,
  // computed after it already returned.
  if (buildReporter.exitCode !== 0) return buildReporter.exitCode;
  return context.settings.strict && findings.length > 0 ? 1 : 0;
}
